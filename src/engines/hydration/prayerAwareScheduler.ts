import { LifeProfile, PrayerTimeItem } from '../../types/dayrhythm';
import { durationForward, wrap1440 } from '../rhythm/constants';

export interface PrayerBlockedWindow {
  prayerId: PrayerTimeItem['id'];
  startMin: number;
  endMin: number;
}

interface LinearInterval {
  start: number;
  end: number;
}

const PRE_ADHAN_BLOCK_MIN = 3;
const FRIDAY_WEEKDAY = 5;
const FRIDAY_DHUHR_MIN_DURATION = 50;
const DEFAULT_PRAYER_DURATION_MIN = 20;
const DEFAULT_FAJR_DURATION_MIN = 30;

/**
 * Resolves the post-adhan blocked duration in minutes for an obligatory prayer,
 * honoring user settings and enforcing at least 50 minutes for Friday Dhuhr (Jumu'ah).
 */
export function resolvePostPrayerDuration(
  prayerId: PrayerTimeItem['id'],
  profile: Pick<LifeProfile, 'prayerSilenceMinutes' | 'fajrSilenceMinutes'>,
  isFriday: boolean
): number {
  const basePrayer = profile.prayerSilenceMinutes ?? DEFAULT_PRAYER_DURATION_MIN;
  if (prayerId === 'fajr') {
    return profile.fajrSilenceMinutes ?? DEFAULT_FAJR_DURATION_MIN;
  }
  if (isFriday && prayerId === 'dhuhr') {
    return Math.max(basePrayer, FRIDAY_DHUHR_MIN_DURATION);
  }
  return basePrayer;
}

/**
 * Builds today's inclusive prayer blocked windows `[adhan - 3m, adhan + postPrayerDuration]`.
 */
export function buildPrayerBlockedWindows(
  prayers: PrayerTimeItem[],
  profile: Pick<LifeProfile, 'prayerSilenceMinutes' | 'fajrSilenceMinutes'>,
  todayWeekday: number
): PrayerBlockedWindow[] {
  const isFriday = todayWeekday === FRIDAY_WEEKDAY;
  return prayers
    .filter((p) => p.isObligatory)
    .map((p) => {
      const postDuration = resolvePostPrayerDuration(p.id, profile, isFriday);
      return {
        prayerId: p.id,
        startMin: wrap1440(p.adhanMinutes - PRE_ADHAN_BLOCK_MIN),
        endMin: wrap1440(p.adhanMinutes + postDuration),
      };
    });
}

/**
 * Returns true if `minute` (0..1439) falls inside any circular inclusive blocked window.
 */
export function isMinuteInBlockedWindows(
  minute: number,
  blockedWindows: PrayerBlockedWindow[]
): boolean {
  const m = wrap1440(minute);
  return blockedWindows.some((w) => {
    if (w.startMin <= w.endMin) {
      return m >= w.startMin && m <= w.endMin;
    }
    return m >= w.startMin || m <= w.endMin;
  });
}

function subtractInterval(
  intervals: LinearInterval[],
  blockStart: number,
  blockEnd: number
): LinearInterval[] {
  const result: LinearInterval[] = [];
  for (const iv of intervals) {
    if (blockEnd < iv.start || blockStart > iv.end) {
      result.push(iv);
      continue;
    }
    if (blockStart > iv.start) {
      result.push({ start: iv.start, end: blockStart - 1 });
    }
    if (blockEnd < iv.end) {
      result.push({ start: blockEnd + 1, end: iv.end });
    }
  }
  return result;
}

function getFreeLinearIntervals(
  spanStartMin: number,
  spanLengthMin: number,
  blockedWindows: PrayerBlockedWindow[]
): LinearInterval[] {
  let free: LinearInterval[] = [{ start: 0, end: Math.max(0, spanLengthMin) }];

  for (const w of blockedWindows) {
    const blockLen = durationForward(w.startMin, w.endMin);
    const offsetStart = durationForward(spanStartMin, w.startMin);

    if (offsetStart <= spanLengthMin) {
      free = subtractInterval(free, offsetStart, offsetStart + blockLen);
    }
    // Handle a blocked window that started before spanStartMin and extends into [0, spanLengthMin]
    const wrappedEnd = offsetStart + blockLen - 1440;
    if (wrappedEnd >= 0) {
      free = subtractInterval(free, 0, wrappedEnd);
    }
  }

  return free;
}

function findNearestUnblockedMinute(
  startMin: number,
  blockedWindows: PrayerBlockedWindow[],
  maxForwardOffset = 1439
): number {
  for (let offset = 0; offset <= maxForwardOffset; offset++) {
    const candidate = wrap1440(startMin + offset);
    if (!isMinuteInBlockedWindows(candidate, blockedWindows)) {
      return candidate;
    }
  }
  return wrap1440(startMin);
}

/**
 * Distributes `count` cup timestamps evenly across unblocked minutes in `[spanStartMin, spanStartMin + spanLengthMin]`,
 * ensuring zero timestamps fall inside any prayer blocked window while preserving `count`.
 */
export function distributeCupsAvoidingPrayers(params: {
  spanStartMin: number;
  spanLengthMin: number;
  count: number;
  blockedWindows: PrayerBlockedWindow[];
}): number[] {
  const { spanStartMin, spanLengthMin, count, blockedWindows } = params;
  if (count <= 0) return [];

  if (blockedWindows.length === 0) {
    const step = count > 1 ? spanLengthMin / (count - 1) : 0;
    return Array.from({ length: count }, (_, i) =>
      wrap1440(spanStartMin + Math.round(i * step))
    );
  }

  const freeIntervals = getFreeLinearIntervals(spanStartMin, spanLengthMin, blockedWindows);
  if (freeIntervals.length === 0) {
    const fallbackMin = findNearestUnblockedMinute(spanStartMin, blockedWindows);
    return Array.from({ length: count }, () => fallbackMin);
  }

  const totalFreeSpan = freeIntervals.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
  const results: number[] = [];

  for (let i = 0; i < count; i++) {
    const targetOffset = count > 1 ? Math.round((i * totalFreeSpan) / (count - 1)) : 0;
    let remaining = targetOffset;
    let chosenLinear = freeIntervals[freeIntervals.length - 1].end;

    for (const iv of freeIntervals) {
      const ivSpan = iv.end - iv.start;
      if (remaining <= ivSpan) {
        chosenLinear = iv.start + remaining;
        break;
      }
      remaining -= ivSpan;
    }

    results.push(wrap1440(spanStartMin + chosenLinear));
  }

  return results;
}
