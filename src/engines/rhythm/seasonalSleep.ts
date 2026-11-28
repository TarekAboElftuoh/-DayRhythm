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
import { clamp, durationForward, wrap1440 } from './constants';

export const SEASONAL_SLEEP_CONSTANTS = {
  NORMAL_WAKE_BEFORE_FAJR_MIN: 15,
  FASTING_WAKE_BEFORE_FAJR_MIN: 45,
  NORMAL_BED_AFTER_ISHA_MIN: 30,
  RAMADAN_BED_AFTER_ISHA_MIN: 90,
  SHORT_NIGHT_THRESHOLD_MIN: 330,
  MEDIUM_DEFICIT_LIGHT_NAP_THRESHOLD_MIN: 45,
  LIGHT_NAP_MIN: 25,
  FULL_CYCLE_NAP_MIN: 90,
  DEFAULT_TARGET_SLEEP_MIN: 450,
  POST_FAJR_DELAY_MIN: 25,
  POST_DHUHR_DELAY_MIN: 35,
  PRE_ASR_BUFFER_MIN: 15,
  PRE_MAGHRIB_LIGHT_BUFFER_MIN: 45,
} as const;

export interface SeasonalSleepSolverInput {
  fajrMin: number;
  sunriseMin: number;
  dhuhrMin: number;
  asrMin: number;
  maghribMin: number;
  ishaMin: number;
  isFasting: boolean;
  isRamadan: boolean;
  targetSleepMin?: number;
}

export function schedulePostDhuhrNapStart(
  dhuhrMin: number,
  asrMin: number,
  maghribMin: number,
  sunriseMin: number,
  napDurationMin: number
): number {
  const earliestAfterDhuhrAndSun = Math.max(
    dhuhrMin + SEASONAL_SLEEP_CONSTANTS.POST_DHUHR_DELAY_MIN,
    sunriseMin + 90
  );
  const latestEndBeforeAsrAndMaghrib = Math.min(
    asrMin - SEASONAL_SLEEP_CONSTANTS.PRE_ASR_BUFFER_MIN,
    maghribMin - SEASONAL_SLEEP_CONSTANTS.PRE_MAGHRIB_LIGHT_BUFFER_MIN
  );
  if (latestEndBeforeAsrAndMaghrib - earliestAfterDhuhrAndSun >= napDurationMin) {
    return wrap1440(earliestAfterDhuhrAndSun);
  }
  const minFallbackStart = dhuhrMin + 20;
  if (latestEndBeforeAsrAndMaghrib - minFallbackStart >= napDurationMin) {
    return wrap1440(latestEndBeforeAsrAndMaghrib - napDurationMin);
  }
  return wrap1440(Math.max(minFallbackStart, dhuhrMin + 25));
}

/**
 * Unified Dynamic Sleep Solver using fixed physiological & circadian constants:
 * - wakeTime: Fajr - 15m (normal) or Fajr - 45m (fasting Suhoor prep)
 * - earliestBedtime: Isha + 30m (normal) or Isha + 90m (Ramadan Taraweeh)
 * - Selects Long Night (single block), Medium Night (+ 25m/90m Post-Dhuhr nap),
 *   or Short Night (+ Post-Fajr recovery capped at Sunrise + 25m Post-Dhuhr nap).
 */
export function computeSeasonalSleepPlan(input: SeasonalSleepSolverInput): SeasonalSleepPlan {
  const targetSleepMin = clamp(
    Math.round(input.targetSleepMin ?? SEASONAL_SLEEP_CONSTANTS.DEFAULT_TARGET_SLEEP_MIN),
    180,
    720
  );
  const wakeLead = input.isFasting
    ? SEASONAL_SLEEP_CONSTANTS.FASTING_WAKE_BEFORE_FAJR_MIN
    : SEASONAL_SLEEP_CONSTANTS.NORMAL_WAKE_BEFORE_FAJR_MIN;
  const wakeTimeMin = wrap1440(input.fajrMin - wakeLead);

  const bedDelay = input.isRamadan
    ? SEASONAL_SLEEP_CONSTANTS.RAMADAN_BED_AFTER_ISHA_MIN
    : SEASONAL_SLEEP_CONSTANTS.NORMAL_BED_AFTER_ISHA_MIN;
  const earliestBedtimeMin = wrap1440(input.ishaMin + bedDelay);
  const availableNightMin = durationForward(earliestBedtimeMin, wakeTimeMin);

  let mode: SeasonalSleepMode;
  let bedtimeMin: number;
  let nightSleepMin: number;
  let deficitMin: number;
  let postFajrStartMin: number | null = null;
  let postFajrEndMin: number | null = null;
  let postFajrDurationMin = 0;
  let postDhuhrNapStartMin: number | null = null;
  let postDhuhrNapDurationMin = 0;

  if (availableNightMin >= targetSleepMin) {
    mode = 'long_night';
    bedtimeMin = wrap1440(wakeTimeMin - targetSleepMin);
    nightSleepMin = targetSleepMin;
    deficitMin = 0;
  } else if (availableNightMin >= SEASONAL_SLEEP_CONSTANTS.SHORT_NIGHT_THRESHOLD_MIN) {
    mode = 'medium_night';
    bedtimeMin = earliestBedtimeMin;
    nightSleepMin = availableNightMin;
    deficitMin = targetSleepMin - availableNightMin;
    postDhuhrNapDurationMin =
      deficitMin <= SEASONAL_SLEEP_CONSTANTS.MEDIUM_DEFICIT_LIGHT_NAP_THRESHOLD_MIN
        ? SEASONAL_SLEEP_CONSTANTS.LIGHT_NAP_MIN
        : SEASONAL_SLEEP_CONSTANTS.FULL_CYCLE_NAP_MIN;
    postDhuhrNapStartMin = schedulePostDhuhrNapStart(
      input.dhuhrMin,
      input.asrMin,
      input.maghribMin,
      input.sunriseMin,
      postDhuhrNapDurationMin
    );
  } else {
    mode = 'short_night';
    bedtimeMin = earliestBedtimeMin;
    nightSleepMin = availableNightMin;
    deficitMin = targetSleepMin - availableNightMin;
    postDhuhrNapDurationMin = SEASONAL_SLEEP_CONSTANTS.LIGHT_NAP_MIN;
    postDhuhrNapStartMin = schedulePostDhuhrNapStart(
      input.dhuhrMin,
      input.asrMin,
      input.maghribMin,
      input.sunriseMin,
      postDhuhrNapDurationMin
    );

    const rawPostFajrStart = wrap1440(input.fajrMin + SEASONAL_SLEEP_CONSTANTS.POST_FAJR_DELAY_MIN);
    const gapToSunrise = durationForward(rawPostFajrStart, input.sunriseMin);
    const usableSunriseGap = gapToSunrise > 0 && gapToSunrise <= 180 ? gapToSunrise : 0;
    const neededPostFajr = Math.max(0, deficitMin - postDhuhrNapDurationMin);
    const rawPostFajrDur = Math.min(usableSunriseGap, neededPostFajr);
    if (rawPostFajrDur >= 15) {
      postFajrStartMin = rawPostFajrStart;
      postFajrDurationMin = rawPostFajrDur;
      postFajrEndMin = wrap1440(rawPostFajrStart + rawPostFajrDur);
    }
  }

  return {
    mode,
    isFasting: input.isFasting,
    isRamadan: input.isRamadan,
    targetSleepMin,
    wakeTimeMin,
    earliestBedtimeMin,
    bedtimeMin,
    availableNightMin,
    nightSleepMin,
    deficitMin,
    postFajrStartMin,
    postFajrEndMin,
    postFajrDurationMin,
    postDhuhrNapStartMin,
    postDhuhrNapDurationMin,
    totalSleepMin: nightSleepMin + postFajrDurationMin + postDhuhrNapDurationMin,
  };
}

export interface FastingDayInput {
  weekday: number; // 0=Sun..6=Sat
  fastingDays: number[]; // Custom selected weekdays (e.g., Mon/Thu [1, 4], Sat [6])
  dateIso?: string;
  timeZone?: string;
  fastingOverride?: 'auto' | 'fasting' | 'normal';
  /** Optional precomputed special fast label (Ramadan, White Days, Arafah, Ashura). */
  specialFastAr?: string | null;
  isWhiteDay?: boolean;
  isRamadan?: boolean;
  whiteDaysEnabled?: boolean;
}

/**
 * Single authoritative fasting detector shared across hydration, medications, Suhoor, and conflict checks.
 * Honors custom selected weekdays (Mon/Thu default), Ramadan (Hijri month 9), Arafah/Ashura,
 * opt-in White Days, and one-off toggles.
 */
export function isFastingDay(input: FastingDayInput): boolean {
  if (input.fastingOverride === 'fasting') return true;
  if (input.fastingOverride === 'normal') return false;
  if (Array.isArray(input.fastingDays) && input.fastingDays.includes(input.weekday)) {
    return true;
  }
  if (input.isRamadan) return true;
  if (input.isWhiteDay && input.whiteDaysEnabled !== false) return true;
  if (input.specialFastAr !== undefined) {
    if (input.specialFastAr === 'الأيام البيض' && !input.whiteDaysEnabled) {
      return false;
    }
    return Boolean(input.specialFastAr);
  }
  if (input.dateIso) {
    return Boolean(
      getSpecialFastDay(input.dateIso, input.timeZone, {
        whiteDaysEnabled: Boolean(input.whiteDaysEnabled),
      })
    );
  }
  return false;
}

