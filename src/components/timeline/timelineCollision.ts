import type { DayTimelineLockedBlock } from '../../engines/lifeRhythmEngine';

export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_MIN = 480;
export const MINUTES_PER_DAY = 1440;

export interface LockedInterval {
  start: number;
  end: number;
}

export interface VisualLockedBound {
  startMin: number;
  endMin: number;
  topPx: number;
  bottomPx: number;
}

function snap5(min: number): number {
  return Math.round(min / 5) * 5;
}

export function normalizeLockedIntervals(blocks: DayTimelineLockedBlock[]): LockedInterval[] {
  const raw: LockedInterval[] = [];
  for (const b of blocks) {
    const s = ((b.startMin % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const dur = Math.max(1, b.endMin - b.startMin);
    const e = s + dur;
    if (e <= MINUTES_PER_DAY) {
      raw.push({ start: s, end: e });
    } else {
      raw.push({ start: s, end: MINUTES_PER_DAY });
      raw.push({ start: 0, end: Math.min(MINUTES_PER_DAY, e - MINUTES_PER_DAY) });
    }
  }
  raw.sort((a, b) => a.start - b.start);

  const merged: LockedInterval[] = [];
  for (const iv of raw) {
    const prev = merged[merged.length - 1];
    if (prev && iv.start <= prev.end) {
      prev.end = Math.max(prev.end, iv.end);
    } else {
      merged.push({ start: iv.start, end: iv.end });
    }
  }
  return merged;
}

function getFreeGaps(locked: LockedInterval[]): LockedInterval[] {
  const gaps: LockedInterval[] = [];
  let cursor = 0;
  for (const l of locked) {
    if (l.start > cursor) gaps.push({ start: cursor, end: l.start });
    cursor = Math.max(cursor, l.end);
  }
  if (cursor < MINUTES_PER_DAY) gaps.push({ start: cursor, end: MINUTES_PER_DAY });
  return gaps;
}

function hasLockedBetween(a: number, b: number, locked: LockedInterval[]): boolean {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return locked.some((l) => l.end > lo && l.start < hi);
}

export function resolveMoveClamped(
  rawStart: number,
  durationMin: number,
  initialStartMin: number,
  locked: LockedInterval[]
): { startMin: number; skippedLocked: boolean } {
  const fitting = getFreeGaps(locked).filter((g) => g.end - g.start >= durationMin);
  if (fitting.length === 0) {
    return { startMin: initialStartMin, skippedLocked: false };
  }

  const maxStart = Math.max(0, MINUTES_PER_DAY - durationMin);
  const snapped = Math.max(0, Math.min(maxStart, snap5(rawStart)));
  const fitsSnapped = fitting.some((g) => snapped >= g.start && snapped + durationMin <= g.end);

  if (fitsSnapped) {
    return { startMin: snapped, skippedLocked: hasLockedBetween(initialStartMin, snapped, locked) };
  }

  let best = initialStartMin;
  let bestDist = Infinity;

  for (const g of fitting) {
    const maxInGap = g.end - durationMin;
    const clamped = Math.max(g.start, Math.min(maxInGap, rawStart));
    const snappedInGap = snap5(clamped);
    const cand =
      snappedInGap >= g.start && snappedInGap <= maxInGap
        ? snappedInGap
        : Math.round(clamped);
    const dist = Math.abs(cand - rawStart);
    if (dist < bestDist || (dist === bestDist && rawStart >= initialStartMin && cand > best)) {
      best = cand;
      bestDist = dist;
    }
  }

  return {
    startMin: best,
    skippedLocked: best !== snapped || hasLockedBetween(initialStartMin, best, locked),
  };
}

export function resolveResizeClamped(
  startMin: number,
  rawDuration: number,
  initialDurationMin: number,
  locked: LockedInterval[]
): { durationMin: number; skippedLocked: boolean } {
  if (locked.some((l) => startMin >= l.start && startMin < l.end)) {
    return { durationMin: initialDurationMin, skippedLocked: false };
  }

  const nextLocked = locked.find((l) => l.start > startMin);
  const maxByLocked = nextLocked ? nextLocked.start - startMin : MINUTES_PER_DAY - startMin;
  const maxDur = Math.min(MAX_DURATION_MIN, maxByLocked);

  if (maxDur < MIN_DURATION_MIN) {
    return { durationMin: Math.max(1, Math.min(initialDurationMin, maxDur)), skippedLocked: true };
  }

  const snapped = snap5(rawDuration);
  if (rawDuration > maxDur || snapped > maxDur) {
    return { durationMin: maxDur, skippedLocked: true };
  }

  return {
    durationMin: Math.max(MIN_DURATION_MIN, Math.min(maxDur, snapped)),
    skippedLocked: false,
  };
}

export function clampVisualSliceToLocked(
  sliceStartMin: number,
  sliceEndMin: number,
  topPx: number,
  heightPx: number,
  lockedBounds: VisualLockedBound[],
  gridHeightPx: number
): { topPx: number; heightPx: number } {
  let minTopPx = 0;
  let maxBottomPx = gridHeightPx;

  for (const lb of lockedBounds) {
    if (lb.endMin <= sliceStartMin) {
      minTopPx = Math.max(minTopPx, lb.bottomPx);
    } else if (lb.startMin >= sliceEndMin) {
      maxBottomPx = Math.min(maxBottomPx, lb.topPx);
    } else if (lb.startMin > sliceStartMin) {
      maxBottomPx = Math.min(maxBottomPx, lb.topPx);
    }
  }

  const clampedTopPx = Math.min(maxBottomPx, Math.max(topPx, minTopPx));
  const availablePx = Math.max(0, maxBottomPx - clampedTopPx);
  return {
    topPx: clampedTopPx,
    heightPx: Math.min(heightPx, availablePx),
  };
}

export function getClampedDragPreviewRect(
  startMin: number,
  durationMin: number,
  minBlockPx: number,
  pxPerMin: number,
  lockedBounds: VisualLockedBound[],
  gridHeightPx: number
): { topPx: number; heightPx: number } {
  return clampVisualSliceToLocked(
    startMin,
    startMin + durationMin,
    startMin * pxPerMin,
    Math.max(minBlockPx, durationMin * pxPerMin),
    lockedBounds,
    gridHeightPx
  );
}
