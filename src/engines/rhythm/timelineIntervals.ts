import { SEASONAL_SLEEP_CONSTANTS } from './seasonalSleep';
import {
  CreativeActivityItem, CreativeActivityPlacement, CreativeCadence, DailyRhythmPlan,
  DynamicHabit, DynamicHabitAnchor, FreeTimeSlot, FreeWindow, GeoLocation,
  GoogleCalendarEventItem, GoogleTaskItem, HydrationScheduleSlot, LifeProfile,
  MedicationFastingPolicy, MedicationItem, MemoryCategory, MemoryItem, PrayerTimeItem,
  ResolvedHabitPlacement, ScheduleBlock, SeasonalSleepGuidance, SeasonalSleepMode,
  SeasonalSleepPhase, SeasonalSleepPlan, TodayCalendarMeta, TomorrowAlertInfo, WeatherHydrationInfo,
} from '../../types/dayrhythm';
import {
  calculateEgyptianPrayerTimes, formatMinutes12h, formatMinutes24h,
  formatTime24To12h, getSpecialFastDay, parseIsoToTimeZoneInfo,
} from '../prayerEngine';
import { durationForward, wrap1440 } from './constants';
import { parseTime24Minutes } from './freeWindows';
import type { DayTimelineLockedBlock, LockedInterval } from './timelineTypes';

export function buildLockedIntervalsAndBlocks(
  prayers: PrayerTimeItem[],
  plan: DailyRhythmPlan,
  profile: LifeProfile
): { lockedBlocks: DayTimelineLockedBlock[]; collisionIntervals: LockedInterval[] } {
  const lockedBlocks: DayTimelineLockedBlock[] = [];
  const collisionIntervals: LockedInterval[] = [];

  const bed = wrap1440(plan.bedtimeMin);
  const wake = wrap1440(plan.wakeMin);
  const sleepLabel = `(${formatMinutes12h(bed, 'ar')} – ${formatMinutes12h(wake, 'ar')})`;

  if (bed > wake) {
    if (wake > 0) {
      collisionIntervals.push({
        kind: 'sleep',
        startMin: 0,
        endMin: wake,
        reasonAr: `يتعارض مع النوم الليلي ${sleepLabel}`,
      });
    }
    collisionIntervals.push({
      kind: 'sleep',
      startMin: bed,
      endMin: 1440,
      reasonAr: `يتعارض مع النوم الليلي ${sleepLabel}`,
    });
  } else if (wake > bed) {
    collisionIntervals.push({
      kind: 'sleep',
      startMin: bed,
      endMin: wake,
      reasonAr: `يتعارض مع النوم الليلي ${sleepLabel}`,
    });
  }

  lockedBlocks.push({
    id: 'locked_seasonal_sleep',
    kind: 'sleep',
    titleAr: 'النوم الليلي الموسمي',
    emoji: '🛏️',
    startMin: plan.bedtimeMin,
    endMin: plan.bedtimeMin + Math.max(60, plan.coreNightSleepMin),
    durationMin: Math.max(60, plan.coreNightSleepMin),
    isLocked: true,
    subtitleAr: plan.seasonalSleep?.phaseLabelAr ?? 'نوم محمي',
  });

  const fajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  if (plan.isFastingToday || plan.suhoorStartMin !== null) {
    const suhoorLead =
      profile.suhoorLeadMinutes ?? SEASONAL_SLEEP_CONSTANTS.FASTING_WAKE_BEFORE_FAJR_MIN;
    const suhoorStart =
      plan.suhoorStartMin !== null ? plan.suhoorStartMin : Math.max(0, fajrMin - suhoorLead);
    if (fajrMin > suhoorStart) {
      collisionIntervals.push({
        kind: 'suhoor',
        startMin: suhoorStart,
        endMin: fajrMin,
        reasonAr: `يتعارض مع وقت السحور (${formatMinutes12h(suhoorStart, 'ar')} – ${formatMinutes12h(fajrMin, 'ar')})`,
      });
      lockedBlocks.push({
        id: 'locked_suhoor',
        kind: 'suhoor',
        titleAr: 'السحور',
        emoji: '🍽️',
        startMin: suhoorStart,
        endMin: fajrMin,
        durationMin: fajrMin - suhoorStart,
        isLocked: true,
        subtitleAr: 'وجبة الصيام المحمية',
      });
    }
  }

  const preBuffer = Math.max(5, profile.adhanLeadMinutes ?? 0);
  for (const p of prayers) {
    if (!p.isObligatory) continue;
    const silenceLen = p.id === 'fajr' ? profile.fajrSilenceMinutes : profile.prayerSilenceMinutes;
    const postBuffer = Math.max(20, silenceLen ?? 20);
    const pStart = Math.max(0, p.adhanMinutes - preBuffer);
    const pEnd = Math.min(1440, p.adhanMinutes + postBuffer);
    collisionIntervals.push({
      kind: 'prayer',
      startMin: pStart,
      endMin: pEnd,
      reasonAr: `يتعارض مع صلاة ${p.nameAr} (${formatMinutes12h(p.adhanMinutes, 'ar')} – ${formatMinutes12h(pEnd, 'ar')})`,
    });
    lockedBlocks.push({
      id: `locked_prayer_${p.id}`,
      kind: 'prayer',
      titleAr: `صلاة ${p.nameAr}`,
      emoji: p.emojiPair || '🕌',
      startMin: pStart,
      endMin: pEnd,
      durationMin: pEnd - pStart,
      isLocked: true,
      subtitleAr: `الأذان ${formatMinutes12h(p.adhanMinutes, 'ar')}`,
    });
  }

  if (
    typeof plan.postFajrStartMin === 'number' &&
    typeof plan.postFajrDurationMin === 'number' &&
    plan.postFajrDurationMin > 0
  ) {
    const pfStart = plan.postFajrStartMin;
    const pfEnd = pfStart + plan.postFajrDurationMin;
    collisionIntervals.push({
      kind: 'nap',
      startMin: pfStart,
      endMin: pfEnd,
      reasonAr: `يتعارض مع راحة ما بعد الفجر (${formatMinutes12h(pfStart, 'ar')} – ${formatMinutes12h(pfEnd, 'ar')})`,
    });
    lockedBlocks.push({
      id: 'locked_post_fajr_sleep',
      kind: 'post_fajr_sleep',
      titleAr: 'راحة تعويضية بعد الفجر',
      emoji: '🛌',
      startMin: pfStart,
      endMin: pfEnd,
      durationMin: plan.postFajrDurationMin,
      isLocked: true,
      subtitleAr: 'نوم موسمي محمي',
    });
  }

  if (plan.qailulahStartMin !== null && plan.qailulahDurationMin > 0) {
    const qStart = plan.qailulahStartMin;
    const qEnd = qStart + plan.qailulahDurationMin;
    collisionIntervals.push({
      kind: 'nap',
      startMin: qStart,
      endMin: qEnd,
      reasonAr: `يتعارض مع القيلولة التعويضية (${formatMinutes12h(qStart, 'ar')} – ${formatMinutes12h(qEnd, 'ar')})`,
    });
    lockedBlocks.push({
      id: 'locked_qailulah_nap',
      kind: 'nap',
      titleAr: 'القيلولة التعويضية',
      emoji: '😴',
      startMin: qStart,
      endMin: qEnd,
      durationMin: plan.qailulahDurationMin,
      isLocked: true,
      subtitleAr: 'استراحة محمية',
    });
  }

  lockedBlocks.sort((a, b) => a.startMin - b.startMin);
  return { lockedBlocks, collisionIntervals };
}

export function findLockedCollision(
  startMin: number,
  endMin: number,
  intervals: LockedInterval[]
): LockedInterval | null {
  const safeEnd = Math.max(startMin + 1, endMin);
  for (const iv of intervals) {
    if (startMin < iv.endMin && safeEnd > iv.startMin) {
      return iv;
    }
  }
  return null;
}

