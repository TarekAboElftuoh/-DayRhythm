import type {
  AppSettingsPatch,
  CalendarActionProposal,
  CreativeActivityActionProposal,
  DailyRhythmPlan,
  DynamicHabitAnchor,
  FreeWindow,
  HabitActionProposal,
  LifeProfile,
  MedicationActionProposal,
  MemoryActionProposal,
  PendingProposal,
  PrayerTimeItem,
  ScheduleBlock,
  SettingsPatchProposal,
  SettingsSnapshotContext,
  TaskActionProposal,
} from '../../types/dayrhythm';
import {
  DEFAULT_LIFE_PROFILE,
  SEASONAL_SLEEP_CONSTANTS,
  classifyScientificTaskEnergy,
  computeDailyRhythmPlan,
  computeFreeWindows,
  pickScientificFreeSlot,
} from '../../engines/lifeRhythmEngine';
import {
  calculateEgyptianPrayerTimes,
  formatMinutes12h,
  getCairoNowMinutes,
  getCairoTodayIso,
} from '../../engines/prayerEngine';
import { validateAndNormalizeSettingsPatch } from '../../utils/settingsPatchValidator';

import { formatMinutes24Str, parseExplicitClockMinutes, wrapMinutes1440, type GeminiScheduleGuardContext, type GeminiScheduleGuardViolation } from './guardTypes';

export function checkProposedSlotConstraints(params: {
  title: string;
  startMin: number;
  durationMin: number;
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile: LifeProfile;
  remainingWindows: FreeWindow[];
  deepWorkRanges: Array<[number, number]>;
}): GeminiScheduleGuardViolation | null {
  const { title, startMin, durationMin, prayers, plan, profile, remainingWindows, deepWorkRanges } =
    params;
  const dur = Math.max(10, Math.min(480, Math.round(durationMin || 30)));
  const endMin = startMin + dur;
  const requestedTime24 = formatMinutes24Str(startMin);

  const suggestAlt = () => {
    const slot = pickScientificFreeSlot({
      title,
      durationMin: dur,
      remainingWindows,
      prayers,
      plan,
      deepWorkRanges,
      claim: false,
    });
    return {
      suggestedTime24: slot?.time24 ?? null,
      suggestedTime12Ar: slot ? formatMinutes12h(slot.startMin, 'ar') : null,
      slot,
    };
  };

  // 1. Hard Guard: Obligatory Prayers (+ lead & silence buffer)
  const preBuffer = Math.max(5, profile.adhanLeadMinutes ?? 0);
  for (const p of prayers) {
    if (!p.isObligatory) continue;
    const silenceLen = p.id === 'fajr' ? profile.fajrSilenceMinutes : profile.prayerSilenceMinutes;
    const postBuffer = Math.max(20, silenceLen ?? 20);
    const pStart = Math.max(0, p.adhanMinutes - preBuffer);
    const pEnd = p.adhanMinutes + postBuffer;
    if (startMin < pEnd && endMin > pStart) {
      const alt = suggestAlt();
      return {
        kind: 'prayer',
        itemTitle: title,
        requestedTime24,
        reasonAr: `ده وقت صلاتك المحمي (صلاة ${p.nameAr} ${formatMinutes12h(p.adhanMinutes, 'ar')} – ${formatMinutes12h(pEnd, 'ar')})${
          alt.suggestedTime12Ar ? ` — أنسب بديل هو ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
  }

  // 2. Hard Guard: Seasonal Night Sleep (handles midnight wrap)
  const bed = wrapMinutes1440(plan.bedtimeMin);
  const wake = wrapMinutes1440(plan.wakeMin);
  const isInsideSleep = (m: number): boolean => {
    const w = wrapMinutes1440(m);
    if (bed > wake) return w >= bed || w < wake;
    return w >= bed && w < wake;
  };
  if (isInsideSleep(startMin) || isInsideSleep(endMin - 1)) {
    const alt = suggestAlt();
    return {
      kind: 'sleep',
      itemTitle: title,
      requestedTime24,
      reasonAr: `ده وقت نومك المحمي (${formatMinutes12h(bed, 'ar')} – ${formatMinutes12h(wake, 'ar')})${
        alt.suggestedTime12Ar ? ` — أنسب بديل هو ${alt.suggestedTime12Ar}` : ''
      }`,
      suggestedTime24: alt.suggestedTime24,
      suggestedTime12Ar: alt.suggestedTime12Ar,
    };
  }

  // 3. Hard Guard: Suhoor on fasting days
  const fajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  if (plan.isFastingToday || plan.suhoorStartMin !== null) {
    const suhoorStart =
      plan.suhoorStartMin ??
      Math.max(0, fajrMin - (profile.suhoorLeadMinutes ?? SEASONAL_SLEEP_CONSTANTS.FASTING_WAKE_BEFORE_FAJR_MIN));
    if (fajrMin > suhoorStart && startMin < fajrMin && endMin > suhoorStart) {
      const alt = suggestAlt();
      return {
        kind: 'suhoor',
        itemTitle: title,
        requestedTime24,
        reasonAr: `ده وقت السحور المحمي (${formatMinutes12h(suhoorStart, 'ar')} – ${formatMinutes12h(fajrMin, 'ar')})${
          alt.suggestedTime12Ar ? ` — أنسب بديل هو ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
  }

  // 4. Hard Guard: Active Recovery Naps (post-Fajr sleep & Qailulah)
  if (
    typeof plan.postFajrStartMin === 'number' &&
    typeof plan.postFajrDurationMin === 'number' &&
    plan.postFajrDurationMin > 0
  ) {
    const pfEnd = plan.postFajrStartMin + plan.postFajrDurationMin;
    if (startMin < pfEnd && endMin > plan.postFajrStartMin) {
      const alt = suggestAlt();
      return {
        kind: 'nap',
        itemTitle: title,
        requestedTime24,
        reasonAr: `ده وقت الراحة التعويضية المحمي (${formatMinutes12h(plan.postFajrStartMin, 'ar')} – ${formatMinutes12h(pfEnd, 'ar')})${
          alt.suggestedTime12Ar ? ` — أنسب بديل هو ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
  }
  if (plan.qailulahStartMin !== null && plan.qailulahDurationMin > 0) {
    const qEnd = plan.qailulahStartMin + plan.qailulahDurationMin;
    if (startMin < qEnd && endMin > plan.qailulahStartMin) {
      const alt = suggestAlt();
      return {
        kind: 'nap',
        itemTitle: title,
        requestedTime24,
        reasonAr: `ده وقت القيلولة المحمي (${formatMinutes12h(plan.qailulahStartMin, 'ar')} – ${formatMinutes12h(qEnd, 'ar')})${
          alt.suggestedTime12Ar ? ` — أنسب بديل هو ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
  }

  // 5. Circadian & Energy Logic
  const energy = classifyScientificTaskEnergy(title);
  const effectiveBed = plan.bedtimeMin > plan.wakeMin ? plan.bedtimeMin : 1440;
  const windDownStart =
    plan.seasonalSleep?.windDownStartMin ?? Math.max(plan.wakeMin, effectiveBed - 55);
  const maghribMin = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? plan.maghribMin;

  if (energy === 'deep_focus') {
    if (startMin < effectiveBed && endMin > windDownStart) {
      const alt = suggestAlt();
      return {
        kind: 'wind_down',
        itemTitle: title,
        requestedTime24,
        reasonAr: `نطاق التهدئة قبل النوم (${formatMinutes12h(windDownStart, 'ar')}) غير مناسب للتركيز العميق${
          alt.suggestedTime12Ar ? ` — الأفضل في ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
    if (plan.isFastingToday && startMin < maghribMin && endMin > maghribMin - 120) {
      const alt = suggestAlt();
      return {
        kind: 'fasting_curve',
        itemTitle: title,
        requestedTime24,
        reasonAr: `آخر ساعتين قبل المغرب في الصيام مخصصة للمهام الخفيفة${
          alt.suggestedTime12Ar ? ` — الأفضل نقل العمل العميق إلى ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
    if (deepWorkRanges.some(([ds, de]) => startMin < de + 15 && endMin + 15 > ds)) {
      const alt = suggestAlt();
      return {
        kind: 'focus_buffer',
        itemTitle: title,
        requestedTime24,
        reasonAr: `يلزم فاصل راحة 10–15 دقيقة بين جلسات التركيز العميق${
          alt.suggestedTime12Ar ? ` — أنسب وقت هو ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
  } else if (energy === 'exercise') {
    const exerciseCutoff = Math.max(plan.wakeMin, effectiveBed - 120);
    if (startMin < effectiveBed && endMin > exerciseCutoff) {
      const alt = suggestAlt();
      return {
        kind: 'exercise_near_sleep',
        itemTitle: title,
        requestedTime24,
        reasonAr: `الرياضة قبل النوم بأقل من ساعتين تؤثر على جودة النوم${
          alt.suggestedTime12Ar ? ` — أنسب بديل هو ${alt.suggestedTime12Ar}` : ''
        }`,
        suggestedTime24: alt.suggestedTime24,
        suggestedTime12Ar: alt.suggestedTime12Ar,
      };
    }
  }

  return null;
}

export function getAnchorBoundsForGuard(
  anchor: DynamicHabitAnchor,
  prayers: PrayerTimeItem[],
  plan: DailyRhythmPlan,
  profile: LifeProfile
): { start: number; end: number } | null {
  if (anchor === 'any-free-slot') return null;
  const fajr = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const sunrise = prayers.find((p) => p.id === 'sunrise')?.adhanMinutes ?? plan.sunriseMin;
  const dhuhr = prayers.find((p) => p.id === 'dhuhr')?.adhanMinutes ?? 12 * 60;
  const asr = prayers.find((p) => p.id === 'asr')?.adhanMinutes ?? 15 * 60 + 15;
  const maghrib = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? plan.maghribMin;
  const isha = prayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 19 * 60 + 30;
  const pre = Math.max(5, profile.adhanLeadMinutes ?? 0);
  const post = Math.max(20, profile.prayerSilenceMinutes ?? 20);
  const bed = plan.bedtimeMin > plan.wakeMin ? plan.bedtimeMin : 1440;

  switch (anchor) {
    case 'after-fajr':
      return { start: fajr + Math.max(post, profile.fajrSilenceMinutes ?? 30), end: sunrise };
    case 'sunrise-light':
      return { start: sunrise + 15, end: Math.min(dhuhr - pre, sunrise + 75) };
    case 'duha':
      return { start: sunrise + 30, end: dhuhr - pre };
    case 'after-dhuhr':
      return { start: dhuhr + post, end: asr - pre };
    case 'after-asr':
      return { start: asr + post, end: maghrib - pre };
    case 'pre-maghrib':
      return { start: Math.max(asr + post, maghrib - 75), end: maghrib - pre };
    case 'after-maghrib':
      return { start: maghrib + post, end: isha - pre };
    case 'after-isha':
      return { start: isha + post, end: bed };
  }
}

/**
 * Programmatic Hard-Guard validator for Gemini scheduling proposals.
 * Rejects any calendar action, timed task, or habit placement colliding with
 * Prayers, Seasonal Sleep, Suhoor, Recovery Naps, or violating circadian/energy rules.
 */
