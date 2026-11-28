import { useRef, useState } from 'react';
import type { DayTimelineLockedBlock, DayTimelinePlacedItem } from '../../engines/lifeRhythmEngine';
import {
  MIN_DURATION_MIN,
  MINUTES_PER_DAY,
  normalizeLockedIntervals,
  resolveMoveClamped,
  resolveResizeClamped,
  type LockedInterval,
} from './timelineCollision';

export const PX_PER_HOUR = 64;
export const PX_PER_MIN = PX_PER_HOUR / 60;

export interface ActiveTimelineDrag {
  mode: 'move' | 'resize';
  item: DayTimelinePlacedItem;
  startMin: number;
  durationMin: number;
  hasMoved: boolean;
  skippedLocked: boolean;
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
      const res = resolveMoveClamped(
        s.initialStartMin + deltaMin,
        s.initialDurationMin,
        s.initialStartMin,
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
      const res = resolveResizeClamped(
        s.initialStartMin,
        s.initialDurationMin + deltaMin,
        s.initialDurationMin,
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
