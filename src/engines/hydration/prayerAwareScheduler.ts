/**
 * Prayer-aware hydration: no water reminder may ever fall inside a prayer window, so cups are
 * shifted before the Adhan or right after the prayer ends instead of being muted later.
 *
 * Window = [adhan - 3m, adhan + postPrayerDuration]. Durations are the user's configured
 * prayerSilenceMinutes / fajrSilenceMinutes, except Friday Dhuhr (Jumu'ah) which is always >= 50m.
 */
import type { HydrationScheduleSlot, PrayerTimeItem } from '../../types/dayrhythm';
import { wrap1440 } from '../rhythm/constants';
import { buildDailyHydrationSlots } from '../rhythm/dailyHydration';

export const PRAYER_BLOCK_LEAD_MINUTES = 3;
export const FRIDAY_DHUHR_BLOCK_MINUTES = 50;

export interface PrayerBlockedWindow {
  prayerId: string;
  adhanMinutes: number;
  durationMinutes: number;
  /** May exceed 1440 when the window crosses midnight (wrapped via modulo when matched). */
  startMinutes: number;
  endMinutes: number;
}

export function prayerBlockDurationMinutes(
  prayer: Pick<PrayerTimeItem, 'id'>,
  params: { prayerSilenceMinutes: number; fajrSilenceMinutes: number; isFriday: boolean }
): number {
  const configured = Math.max(0, Math.round(params.prayerSilenceMinutes));
  if (prayer.id === 'fajr') return Math.max(0, Math.round(params.fajrSilenceMinutes));
  if (prayer.id === 'dhuhr' && params.isFriday) {
    return Math.max(configured, FRIDAY_DHUHR_BLOCK_MINUTES);
  }
  return configured;
}

export function buildPrayerBlockedWindows(params: {
  prayers: PrayerTimeItem[];
  prayerSilenceMinutes: number;
  fajrSilenceMinutes: number;
  isFriday: boolean;
}): PrayerBlockedWindow[] {
  return params.prayers
    .filter((prayer) => prayer.isObligatory)
    .map((prayer) => {
      const durationMinutes = prayerBlockDurationMinutes(prayer, {
        prayerSilenceMinutes: params.prayerSilenceMinutes,
        fajrSilenceMinutes: params.fajrSilenceMinutes,
        isFriday: params.isFriday,
      });
      const startMinutes = wrap1440(prayer.adhanMinutes - PRAYER_BLOCK_LEAD_MINUTES);
      return {
        prayerId: prayer.id,
        adhanMinutes: prayer.adhanMinutes,
        durationMinutes,
        startMinutes,
        endMinutes: startMinutes + PRAYER_BLOCK_LEAD_MINUTES + durationMinutes,
      };
    });
}

export function isMinuteInsidePrayerWindow(
  minuteOfDay: number,
  windows: PrayerBlockedWindow[]
): boolean {
  const m = wrap1440(minuteOfDay);
  return windows.some((window) => {
    const length = window.endMinutes - window.startMinutes;
    const start = wrap1440(window.startMinutes);
    return m >= start && m < start + length;
  });
}

function isFree(minute: number, windows: PrayerBlockedWindow[], used: ReadonlySet<number>): boolean {
  return !used.has(minute) && !isMinuteInsidePrayerWindow(minute, windows);
}

function nearestFreeMinute(
  preferred: number,
  windows: PrayerBlockedWindow[],
  used: ReadonlySet<number>
): number {
  for (let offset = 0; offset <= 120; offset += 1) {
    const directions = offset === 0 ? [0] : [1, -1];
    for (const direction of directions) {
      const candidate = wrap1440(preferred + offset * direction);
      if (isFree(candidate, windows, used)) return candidate;
    }
  }
  for (let minute = 0; minute < 1440; minute += 1) {
    if (isFree(minute, windows, used)) return minute;
  }
  return wrap1440(preferred);
}

/**
 * Keeps exactly one cup per scheduled slot (target stays met) and shifts any cup that lands in a
 * prayer window to the closest free minute, before the Adhan or after the prayer.
 */
export function applyPrayerAvoidance(
  slots: HydrationScheduleSlot[],
  windows: PrayerBlockedWindow[]
): HydrationScheduleSlot[] {
  if (slots.length === 0) return [];
  if (windows.length === 0) return slots.map((slot) => ({ ...slot }));

  const used = new Set<number>();
  return slots.map((slot, index) => {
    const minute = nearestFreeMinute(wrap1440(slot.timeMinutes), windows, used);
    used.add(minute);
    return {
      cupIndex: index + 1,
      timeMinutes: minute,
      windowAr: slot.windowAr,
      noteAr: slot.noteAr,
    };
  });
}

export function buildPrayerAwareHydrationSlots(params: {
  isFastingToday: boolean;
  activeTargetCups: number;
  fajr: number;
  maghrib: number;
  bedtimeMin: number;
  prayers: PrayerTimeItem[];
  prayerSilenceMinutes: number;
  fajrSilenceMinutes: number;
  isFridayToday: boolean;
}): HydrationScheduleSlot[] {
  const baseSlots = buildDailyHydrationSlots({
    isFastingToday: params.isFastingToday,
    activeTargetCups: params.activeTargetCups,
    fajr: params.fajr,
    maghrib: params.maghrib,
    bedtimeMin: params.bedtimeMin,
  });
  const windows = buildPrayerBlockedWindows({
    prayers: params.prayers,
    prayerSilenceMinutes: params.prayerSilenceMinutes,
    fajrSilenceMinutes: params.fajrSilenceMinutes,
    isFriday: params.isFridayToday,
  });
  if (params.isFastingToday) {
    // Never shift a cup backwards into the fasting daytime: place it after Iftar instead.
    windows.push({
      prayerId: 'fasting_day',
      adhanMinutes: params.maghrib,
      durationMinutes: 0,
      startMinutes: params.fajr,
      endMinutes: params.maghrib,
    });
  }
  return applyPrayerAvoidance(baseSlots, windows);
}
