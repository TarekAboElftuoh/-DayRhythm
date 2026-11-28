import { useRef, useState } from 'react';
import type { DayTimelineLockedBlock, DayTimelinePlacedItem } from '../../engines/lifeRhythmEngine';

export const PX_PER_HOUR = 64;
export const PX_PER_MIN = PX_PER_HOUR / 60;
const MIN_DURATION_MIN = 5;
const MAX_DURATION_MIN = 480;
const MINUTES_PER_DAY = 1440;

export interface ActiveTimelineDrag {
  mode: 'move' | 'resize';
  item: DayTimelinePlacedItem;
  startMin: number;
  durationMin: number;
  hasMoved: boolean;
  skippedLocked: boolean;
}

interface LockedInterval {
  start: number;
  end: number;
}

function snap5(min: number): number {
  return Math.round(min / 5) * 5;
}

function normalizeLockedIntervals(blocks: DayTimelineLockedBlock[]): LockedInterval[] {
  const out: LockedInterval[] = [];
  for (const b of blocks) {
    const s = ((b.startMin % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const dur = Math.max(1, b.endMin - b.startMin);
    const e = s + dur;
    if (e <= MINUTES_PER_DAY) {
      out.push({ start: s, end: e });
    } else {
      out.push({ start: s, end: MINUTES_PER_DAY });
      out.push({ start: 0, end: Math.min(MINUTES_PER_DAY, e - MINUTES_PER_DAY) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function resolveMoveSkippingLocked(
  rawStart: number,
  durationMin: number,
  deltaMin: number,
  locked: LockedInterval[]
): { startMin: number; skippedLocked: boolean } {
  const maxStart = Math.max(0, MINUTES_PER_DAY - durationMin);
  let cand = Math.max(0, Math.min(maxStart, snap5(rawStart)));
  let skippedLocked = false;

  for (let i = 0; i < 12; i++) {
    const hit = locked.find((l) => cand < l.end && cand + durationMin > l.start);
    if (!hit) break;
    skippedLocked = true;
    const after = Math.ceil(hit.end / 5) * 5;
    const before = Math.floor((hit.start - durationMin) / 5) * 5;
    if (deltaMin >= 0) {
      cand = after <= maxStart ? after : Math.max(0, before);
    } else {
      cand = before >= 0 ? before : Math.min(maxStart, after);
    }
  }
  return { startMin: cand, skippedLocked };
}

function resolveResizeSkippingLocked(
  startMin: number,
  rawDuration: number,
  locked: LockedInterval[]
): { durationMin: number; skippedLocked: boolean } {
  const maxByDay = Math.max(MIN_DURATION_MIN, MINUTES_PER_DAY - startMin);
  let dur = Math.max(MIN_DURATION_MIN, Math.min(MAX_DURATION_MIN, maxByDay, snap5(rawDuration)));
  let skippedLocked = false;

  for (const l of locked) {
    if (l.start > startMin && startMin + dur > l.start) {
      const clamped = Math.floor((l.start - startMin) / 5) * 5;
      dur = Math.max(MIN_DURATION_MIN, Math.min(dur, clamped));
      skippedLocked = true;
    }
  }
  return { durationMin: dur, skippedLocked };
}

export function useTimelineDrag(params: {
  lockedBlocks: DayTimelineLockedBlock[];
  onCommitDrag?: (
    item: DayTimelinePlacedItem,
    next: { startMin: number; durationMin: number }
  ) => Promise<void> | void;
}) {
  const { lockedBlocks, onCommitDrag } = params;
  const [dragState, setDragState] = useState<ActiveTimelineDrag | null>(null);
  const suppressNextClickRef = useRef(false);

  const sessionRef = useRef<{
    mode: 'move' | 'resize';
    item: DayTimelinePlacedItem;
    pointerId: number;
    startClientY: number;
    initialStartMin: number;
    initialDurationMin: number;
    lastStartMin: number;
    lastDurationMin: number;
    hasMoved: boolean;
    locked: LockedInterval[];
  } | null>(null);

  const startGesture = (
    e: React.PointerEvent<HTMLElement>,
    item: DayTimelinePlacedItem,
    mode: 'move' | 'resize',
    fromHandle = false
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // On touch devices, card body taps open the sheet; only the dedicated touch-none handle drags directly
    if (mode === 'move' && e.pointerType === 'touch' && !fromHandle) return;

    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const startMin = ((item.startMin % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const durationMin = Math.max(MIN_DURATION_MIN, item.durationMin);

    sessionRef.current = {
      mode,
      item,
      pointerId: e.pointerId,
      startClientY: e.clientY,
      initialStartMin: startMin,
      initialDurationMin: durationMin,
      lastStartMin: startMin,
      lastDurationMin: durationMin,
      hasMoved: false,
      locked: normalizeLockedIntervals(lockedBlocks),
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const s = sessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    const dy = e.clientY - s.startClientY;
    if (!s.hasMoved && Math.abs(dy) < 4) return;
    s.hasMoved = true;

    const deltaMin = dy / PX_PER_MIN;
    if (s.mode === 'move') {
      const res = resolveMoveSkippingLocked(
        s.initialStartMin + deltaMin,
        s.initialDurationMin,
        deltaMin,
        s.locked
      );
      s.lastStartMin = res.startMin;
      s.lastDurationMin = s.initialDurationMin;
      setDragState({
        mode: 'move',
        item: s.item,
        startMin: res.startMin,
        durationMin: s.initialDurationMin,
        hasMoved: true,
        skippedLocked: res.skippedLocked,
      });
    } else {
      const res = resolveResizeSkippingLocked(
        s.initialStartMin,
        s.initialDurationMin + deltaMin,
        s.locked
      );
      s.lastStartMin = s.initialStartMin;
      s.lastDurationMin = res.durationMin;
      setDragState({
        mode: 'resize',
        item: s.item,
        startMin: s.initialStartMin,
        durationMin: res.durationMin,
        hasMoved: true,
        skippedLocked: res.skippedLocked,
      });
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLElement>) => {
    const s = sessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    sessionRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    setDragState(null);

    if (!s.hasMoved) return;

    suppressNextClickRef.current = true;
    window.setTimeout(() => {
      suppressNextClickRef.current = false;
    }, 80);

    if (s.lastStartMin !== s.initialStartMin || s.lastDurationMin !== s.initialDurationMin) {
      void onCommitDrag?.(s.item, {
        startMin: s.lastStartMin,
        durationMin: s.lastDurationMin,
      });
    }
  };

  const consumeClickAllowed = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return false;
    }
    return true;
  };

  return {
    dragState,
    startMove: (e: React.PointerEvent<HTMLElement>, item: DayTimelinePlacedItem, fromHandle = false) =>
      startGesture(e, item, 'move', fromHandle),
    startResize: (e: React.PointerEvent<HTMLElement>, item: DayTimelinePlacedItem) =>
      startGesture(e, item, 'resize'),
    handlePointerMove,
    handlePointerEnd,
    consumeClickAllowed,
  };
}
