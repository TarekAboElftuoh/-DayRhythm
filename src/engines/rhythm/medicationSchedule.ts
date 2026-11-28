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

export function computeMedicationDaysLeft(
  remainingDoses: number,
  dosesPerDay: number,
  daysOfWeek?: number[]
): number {
  const safeDosesPerDay = Math.max(1, dosesPerDay);
  const daysPerWeek = daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek.length : 7;
  const dailyRate = Math.max(0.14, (safeDosesPerDay * daysPerWeek) / 7);
  return remainingDoses / dailyRate;
}

export interface ResolveMedicationDosesOptions {
  isFastingToday: boolean;
  fajrMin: number;
  maghribMin: number;
}

export interface ResolvedMedicationDose {
  originalTime24: string;
  effectiveTime24: string;
  effectiveMin: number;
  wasShifted: boolean;
  shiftTarget: 'before-fajr' | 'after-maghrib' | null;
}

export interface ResolvedMedicationDaySchedule {
  med: MedicationItem;
  policy: MedicationFastingPolicy;
  doses: ResolvedMedicationDose[];
  skippedCount: number;
}

/**
 * Resolves today's effective medication doses without mutating the saved MedicationItem.
 * On fasting days, doses strictly inside [fajrMin, maghribMin) follow med.fastingPolicy (default 'auto-nearest').
 */
export function resolveMedicationDosesForDay(
  med: MedicationItem,
  options: ResolveMedicationDosesOptions
): ResolvedMedicationDaySchedule {
  const rawTimes =
    med.times24 && med.times24.length > 0
      ? med.times24
      : med.time24
        ? [med.time24]
        : [];
  const policy: MedicationFastingPolicy = med.fastingPolicy ?? 'auto-nearest';
  const suhoorShiftMin = wrap1440(options.fajrMin - 15);
  const iftarShiftMin = wrap1440(options.maghribMin + 15);

  const doses: ResolvedMedicationDose[] = [];
  let skippedCount = 0;

  for (const t24 of rawTimes) {
    const m = t24.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const origMin = Number(m[1]) * 60 + Number(m[2]);
    const inFastingWindow =
      options.isFastingToday && origMin >= options.fajrMin && origMin < options.maghribMin;

    if (!inFastingWindow || policy === 'unchanged') {
      doses.push({
        originalTime24: t24,
        effectiveTime24: t24,
        effectiveMin: origMin,
        wasShifted: false,
        shiftTarget: null,
      });
      continue;
    }

    if (policy === 'skip') {
      skippedCount += 1;
      continue;
    }

    let targetMin: number;
    let shiftTarget: 'before-fajr' | 'after-maghrib';
    if (policy === 'before-fajr') {
      targetMin = suhoorShiftMin;
      shiftTarget = 'before-fajr';
    } else if (policy === 'after-maghrib') {
      targetMin = iftarShiftMin;
      shiftTarget = 'after-maghrib';
    } else {
      // 'auto-nearest'
      const distFajr = origMin - options.fajrMin;
      const distMaghrib = options.maghribMin - origMin;
      if (distFajr < distMaghrib) {
        targetMin = suhoorShiftMin;
        shiftTarget = 'before-fajr';
      } else {
        targetMin = iftarShiftMin;
        shiftTarget = 'after-maghrib';
      }
    }

    doses.push({
      originalTime24: t24,
      effectiveTime24: formatMinutes24h(targetMin),
      effectiveMin: targetMin,
      wasShifted: true,
      shiftTarget,
    });
  }

  return { med, policy, doses, skippedCount };
}

