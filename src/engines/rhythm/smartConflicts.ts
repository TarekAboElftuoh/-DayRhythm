import { wrap1440 } from './constants';
import { isFastingDay } from './seasonalSleep';
import { findFreeTimeSlotsForToday } from './freeWindows';
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
import { computeFreeWindows, parseTime24Minutes } from './freeWindows';
import { resolveWeekdayFromIso } from './habitAnchors';

export interface SmartScheduleConflictResult {
  hasConflict: boolean;
  warnings: string[];
  suggestedTime24: string | null;
  suggestedTime12Ar: string | null;
}

/**
 * Checks whether a proposed event or medication time conflicts with:
 * 1) Any of the 5 obligatory prayers (lead + silence buffer)
 * 2) Night sleep window (bedtime -> wake)
 * 3) Fasting hours (Fajr -> Maghrib) when scheduling oral medications/supplements on fasting days
 * 4) Existing Google Calendar / Schedule blocks on the target date
 * Also suggests the nearest conflict-free time slot automatically.
 */
export function checkSmartScheduleConflict(params: {
  time24: string;
  durationMinutes?: number;
  dateIso?: string;
  daysOfWeek?: number[];
  isOralMedication?: boolean;
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile: LifeProfile;
  occupiedBlocks: ScheduleBlock[];
}): SmartScheduleConflictResult {
  const m = params.time24.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    return { hasConflict: false, warnings: [], suggestedTime24: null, suggestedTime12Ar: null };
  }
  const startMin = Math.min(1439, Math.max(0, Number(m[1]) * 60 + Number(m[2])));
  const isZeroDuration = params.durationMinutes === 0;
  const dur = isZeroDuration ? 0 : Math.max(10, Math.min(480, Math.round(params.durationMinutes ?? 15)));
  const endMin = startMin + dur;
  const warnings: string[] = [];

  const { prayers, plan, profile, occupiedBlocks } = params;

  // 1. Obligatory Prayer conflict
  for (const p of prayers) {
    if (!p.isObligatory) continue;
    const silenceLen = p.id === 'fajr' ? profile.fajrSilenceMinutes : profile.prayerSilenceMinutes;
    const pStart = Math.max(0, p.adhanMinutes - profile.adhanLeadMinutes);
    const pEnd = p.adhanMinutes + silenceLen;
    const hasOverlap = isZeroDuration
      ? startMin >= pStart && startMin < pEnd
      : startMin < pEnd && endMin > pStart;
    if (hasOverlap) {
      warnings.push(
        `يتعارض مع وقت صلاة ${p.nameAr} (${formatMinutes12h(p.adhanMinutes)} – ${formatMinutes12h(pEnd)})`
      );
      break;
    }
  }

  // 2. Night Sleep conflict (handles bedtime before midnight -> wake after midnight)
  const bed = plan.bedtimeMin;
  const wake = plan.wakeMin;
  const inSleep = (min: number): boolean => {
    const w = wrap1440(min);
    if (bed > wake) {
      return w >= bed || w < wake;
    }
    return w >= bed && w < wake;
  };
  if (inSleep(startMin) || (!isZeroDuration && inSleep(endMin - 1))) {
    warnings.push(
      `يقع داخل وقت النوم الليلي (${formatMinutes12h(bed)} – ${formatMinutes12h(wake)})`
    );
  }
  if (plan.qailulahStartMin !== null && plan.qailulahDurationMin > 0) {
    const qStart = plan.qailulahStartMin;
    const qEnd = qStart + plan.qailulahDurationMin;
    const hitsNap = isZeroDuration
      ? startMin >= qStart && startMin < qEnd
      : startMin < qEnd && endMin > qStart;
    if (hitsNap) {
      warnings.push(
        `يتداخل مع القيلولة التعويضية (${formatMinutes12h(qStart)} – ${formatMinutes12h(qEnd)})`
      );
    }
  }

  // 3. Fasting window conflict for oral medications/supplements
  let hitsFastingDay = false;
  if (params.isOralMedication) {
    const fajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
    const maghribMin = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;
    const targetDays =
      Array.isArray(params.daysOfWeek) && params.daysOfWeek.length > 0
        ? params.daysOfWeek
        : [0, 1, 2, 3, 4, 5, 6];
    const targetDateWeekday = params.dateIso
      ? new Date(`${params.dateIso}T12:00:00Z`).getUTCDay()
      : -1;
    hitsFastingDay =
      targetDays.some((d) =>
        isFastingDay({
          weekday: d,
          fastingDays: profile.fastingDays,
        })
      ) ||
      (Boolean(params.dateIso) &&
        isFastingDay({
          weekday: targetDateWeekday,
          fastingDays: profile.fastingDays,
          dateIso: params.dateIso,
          timeZone: profile.currentTimeZone,
        })) ||
      plan.isFastingToday;
    if (hitsFastingDay && startMin >= fajrMin && startMin < maghribMin) {
      warnings.push(
        `يتعارض مع ساعات الصيام (الفجر ${formatMinutes12h(fajrMin)} – المغرب ${formatMinutes12h(maghribMin)}) في أيام صيامك`
      );
    }
  }

  // 4. Existing schedule / Calendar event overlap (checked for today or recurring daily items)
  for (const blk of occupiedBlocks) {
    if (blk.deleted || blk.isAllDay || blk.isAnchor || blk.source === 'creative') continue;
    const bStart = blk.startMin;
    const bEnd = blk.startMin + Math.max(15, blk.durationMin);
    const hasOverlap = isZeroDuration
      ? startMin >= bStart && startMin < bEnd
      : startMin < bEnd && endMin > bStart;
    if (hasOverlap) {
      const blkLabel = (blk.categoryAr || blk.emojiPair || 'موعد آخر').trim().slice(0, 42);
      warnings.push(
        `يتداخل مع «${blkLabel}» (${formatMinutes12h(bStart)} – ${formatMinutes12h(bEnd)})`
      );
      break;
    }
  }

  if (warnings.length === 0) {
    return { hasConflict: false, warnings: [], suggestedTime24: null, suggestedTime12Ar: null };
  }

  // Suggest nearest conflict-free slot from today's genuine free windows
  const freeSlots = findFreeTimeSlotsForToday(prayers, plan, profile, occupiedBlocks, Math.min(dur, 20));
  const fajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const maghribMin = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;

  let bestStart: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const slot of freeSlots) {
    if (slot.durationMin < dur) continue;
    let candidate = Math.max(slot.startMin, Math.min(startMin, slot.endMin - dur));
    if (params.isOralMedication && hitsFastingDay) {
      if (candidate >= fajrMin && candidate < maghribMin) {
        // Prefer after Maghrib if fasting conflict exists
        if (slot.endMin - dur >= maghribMin + 15) {
          candidate = Math.max(slot.startMin, maghribMin + 15);
        } else {
          continue;
        }
      }
    }
    const dist = Math.abs(candidate - startMin);
    if (dist < bestDist) {
      bestDist = dist;
      bestStart = candidate;
    }
  }

  // Fallback suggestion right after Maghrib for oral meds during fasting if no slot matched
  if (bestStart === null && params.isOralMedication) {
    bestStart = wrap1440(maghribMin + 25);
  }

  const suggestedTime24 = bestStart !== null ? formatMinutes24h(bestStart) : null;
  const suggestedTime12Ar = bestStart !== null ? formatMinutes12h(bestStart, 'ar') : null;

  return {
    hasConflict: true,
    warnings,
    suggestedTime24,
    suggestedTime12Ar,
  };
}

/**
 * Auto-places active (non-expired) creative activities into genuinely free non-overlapping slots today,
 * supporting daily / weekly / monthly cadences and scaling gracefully to many activities.
 */
