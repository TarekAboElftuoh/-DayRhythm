import type { DayTimelineLockedBlock } from '../../engines/lifeRhythmEngine';
import { clampToDaySlices, type PositionedSlice } from './types';
import { PX_PER_MIN } from './useTimelineDrag';

const MINUTES_PER_DAY = 1440;
export const SLEEP_CAP_PX = 100;

interface Segment {
  start: number;
  end: number;
  isSleep: boolean;
  pxPerMin: number;
  yStart: number;
}

export interface DayYMapper {
  minToY: (min: number) => number;
  gridHeightPx: number;
  isHourInSleep: (hour: number) => boolean;
  mapSlices: <T>(
    items: Array<{ startMin: number; endMin: number; key: string; data: T }>,
    minPx: number
  ) => PositionedSlice<T>[];
}

export function createDayYMapper(
  lockedBlocks: DayTimelineLockedBlock[],
  wakePxPerMin = PX_PER_MIN,
  sleepCapPx = SLEEP_CAP_PX
): DayYMapper {
  const sleepIntervals: Array<{ start: number; end: number }> = [];
  for (const b of lockedBlocks) {
    if (b.kind !== 'sleep') continue;
    const s = ((b.startMin % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const dur = Math.max(1, Math.min(MINUTES_PER_DAY, b.endMin - b.startMin));
    const e = s + dur;
    if (e <= MINUTES_PER_DAY) {
      sleepIntervals.push({ start: s, end: e });
    } else {
      sleepIntervals.push({ start: 0, end: e - MINUTES_PER_DAY });
      sleepIntervals.push({ start: s, end: MINUTES_PER_DAY });
    }
  }
  sleepIntervals.sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const iv of sleepIntervals) {
    const prev = merged[merged.length - 1];
    if (prev && iv.start <= prev.end) prev.end = Math.max(prev.end, iv.end);
    else merged.push({ ...iv });
  }

  const totalSleepMin = merged.reduce((acc, iv) => acc + (iv.end - iv.start), 0);
  const sleepPxPerMin =
    totalSleepMin > 0 && totalSleepMin * wakePxPerMin > sleepCapPx
      ? sleepCapPx / totalSleepMin
      : wakePxPerMin;

  const segments: Segment[] = [];
  let cursor = 0;
  let yCursor = 0;
  for (const iv of merged) {
    if (iv.start > cursor) {
      segments.push({ start: cursor, end: iv.start, isSleep: false, pxPerMin: wakePxPerMin, yStart: yCursor });
      yCursor += (iv.start - cursor) * wakePxPerMin;
    }
    segments.push({ start: iv.start, end: iv.end, isSleep: true, pxPerMin: sleepPxPerMin, yStart: yCursor });
    yCursor += (iv.end - iv.start) * sleepPxPerMin;
    cursor = iv.end;
  }
  if (cursor < MINUTES_PER_DAY) {
    segments.push({ start: cursor, end: MINUTES_PER_DAY, isSleep: false, pxPerMin: wakePxPerMin, yStart: yCursor });
    yCursor += (MINUTES_PER_DAY - cursor) * wakePxPerMin;
  }

  const minToY = (rawMin: number): number => {
    const m = Math.max(0, Math.min(MINUTES_PER_DAY, rawMin));
    for (const seg of segments) {
      if (m <= seg.end) return seg.yStart + (m - seg.start) * seg.pxPerMin;
    }
    return yCursor;
  };

  const isHourInSleep = (hour: number): boolean => {
    const mid = hour * 60 + 30;
    return merged.some((iv) => mid > iv.start && mid < iv.end);
  };

  const mapSlices = <T,>(
    items: Array<{ startMin: number; endMin: number; key: string; data: T }>,
    minPx: number
  ): PositionedSlice<T>[] =>
    items.flatMap((it) =>
      clampToDaySlices<T>(it.startMin, it.endMin, it.key, it.data, minPx, wakePxPerMin).map((sl) => {
        const topPx = minToY(sl.startMin);
        const heightPx = Math.max(minPx, Math.min(yCursor - topPx, minToY(sl.endMin) - topPx));
        return { ...sl, topPx, heightPx };
      })
    );

  return { minToY, gridHeightPx: yCursor, isHourInSleep, mapSlices };
}
