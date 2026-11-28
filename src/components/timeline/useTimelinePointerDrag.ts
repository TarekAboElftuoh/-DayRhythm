import { useRef, type Dispatch, type SetStateAction } from 'react';
import type {
  DailyRhythmPlan,
  DynamicHabitAnchor,
  LifeProfile,
  PrayerTimeItem,
} from '../../types/dayrhythm';
import { formatMinutes24h } from '../../engines/prayerEngine';
import {
  findNextLogicalFreeSlot,
  snapToValidFreeWindow,
  type DayTimelineModel,
  type DayTimelinePlacedItem,
  type DayTimelineGhostSlot,
  type SnapToFreeWindowResult,
} from '../../engines/lifeRhythmEngine';
import {
  toPlacementTargetFromPlaced,
  type PendingMoveConfirmation,
  type PlacementTarget,
} from './types';

export interface UseTimelinePointerDragParams {
  model: DayTimelineModel;
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile: LifeProfile;
  placementTarget: PlacementTarget | null;
  setPlacementTarget: Dispatch<SetStateAction<PlacementTarget | null>>;
  dragState: { target: PlacementTarget; snapped: SnapToFreeWindowResult | null } | null;
  setDragState: Dispatch<SetStateAction<{ target: PlacementTarget; snapped: SnapToFreeWindowResult | null } | null>>;
  setSwipePreview: Dispatch<SetStateAction<{ id: string; dx: number } | null>>;
  setPendingMove: Dispatch<SetStateAction<PendingMoveConfirmation | null>>;
  onMoveToUnplaced?: (item: DayTimelinePlacedItem) => Promise<void> | void;
}

export function useTimelinePointerDrag(p: UseTimelinePointerDragParams) {
  const {
    model,
    prayers,
    plan,
    profile,
    placementTarget,
    setPlacementTarget,
    dragState,
    setDragState,
    setSwipePreview,
    setPendingMove,
    onMoveToUnplaced,
  } = p;

  const timelineRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const gestureRef = useRef<{
    active: boolean;
    mode: 'idle' | 'pending' | 'drag' | 'swipe';
    pointerId: number;
    startX: number;
    startY: number;
    item: DayTimelinePlacedItem;
    suppressNextClick: boolean;
  } | null>(null);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const computeSnapFromPointerY = (clientY: number, target: PlacementTarget): SnapToFreeWindowResult => {
    const rect = timelineRef.current?.getBoundingClientRect();
    const wake = model.wakeMin;
    const bed = model.bedtimeMin > wake ? model.bedtimeMin : 1440;
    const ratio = rect && rect.height > 20 ? Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) : 0.5;
    const targetStartMin = Math.round(wake + ratio * (bed - wake));
    return snapToValidFreeWindow({
      targetStartMin,
      durationMin: target.durationMin,
      freeWindows: model.freeWindows,
      prayers,
      plan,
      profile,
      excludeRange: target.currentRange,
    });
  };

  const openMoveConfirmation = (
    target: PlacementTarget,
    slot: { startMin: number; endMin: number; time24: string; windowLabel: string; suggestedAnchor: DynamicHabitAnchor },
    sourceGesture: PendingMoveConfirmation['sourceGesture']
  ) => {
    setPlacementTarget(null);
    setPendingMove({
      target,
      startMin: slot.startMin,
      endMin: slot.endMin,
      time24: slot.time24,
      windowLabel: slot.windowLabel,
      suggestedAnchor: slot.suggestedAnchor,
      sourceGesture,
    });
  };

  const handleSelectGhostSlot = (ghost: DayTimelineGhostSlot) => {
    if (!placementTarget) return;
    const dur = Math.max(5, Math.min(placementTarget.durationMin, ghost.durationMin));
    openMoveConfirmation(
      placementTarget,
      {
        startMin: ghost.startMin,
        endMin: ghost.startMin + dur,
        time24: formatMinutes24h(ghost.startMin),
        windowLabel: ghost.label,
        suggestedAnchor: ghost.suggestedAnchor,
      },
      'tap'
    );
  };

  const beginDragNow = (item: DayTimelinePlacedItem, pointerId: number, clientY: number, el: HTMLElement) => {
    try { el.setPointerCapture(pointerId); } catch { /* ignore */ }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(12);
    const target = toPlacementTargetFromPlaced(item);
    const snapped = computeSnapFromPointerY(clientY, target);
    setPlacementTarget(null);
    setSwipePreview(null);
    setDragState({ target, snapped });
  };

  const handleCardPointerDown = (e: React.PointerEvent<HTMLDivElement>, item: DayTimelinePlacedItem, fromHandle = false) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const targetEl = e.target as HTMLElement | null;
    if (!fromHandle && targetEl?.closest('button, a')) return;
    clearLongPressTimer();
    const { pointerId, clientX: startX, clientY: startY, currentTarget } = e;
    gestureRef.current = { active: true, mode: fromHandle ? 'drag' : 'pending', pointerId, startX, startY, item, suppressNextClick: fromHandle };
    if (fromHandle) {
      e.stopPropagation();
      beginDragNow(item, pointerId, startY, currentTarget);
      return;
    }
    longPressTimerRef.current = window.setTimeout(() => {
      const g = gestureRef.current;
      if (!g || !g.active || g.mode !== 'pending' || g.item.id !== item.id) return;
      g.mode = 'drag';
      g.suppressNextClick = true;
      beginDragNow(item, pointerId, g.startY, currentTarget);
    }, 280);
  };

  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || !g.active || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (g.mode === 'pending') {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
        clearLongPressTimer();
        g.active = false;
        return;
      }
      if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.35) {
        clearLongPressTimer();
        g.mode = 'swipe';
        g.suppressNextClick = true;
        setSwipePreview({ id: g.item.id, dx: Math.max(-96, Math.min(96, dx)) });
      }
      return;
    }
    if (g.mode === 'swipe') {
      setSwipePreview({ id: g.item.id, dx: Math.max(-96, Math.min(96, dx)) });
      return;
    }
    if (g.mode === 'drag') {
      const target = toPlacementTargetFromPlaced(g.item);
      setDragState({ target, snapped: computeSnapFromPointerY(e.clientY, target) });
    }
  };

  const finishPointerGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    clearLongPressTimer();
    const g = gestureRef.current;
    if (!g || !g.active || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.startX;
    const { mode, item } = g;
    g.active = false;
    g.mode = 'idle';
    try { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (mode === 'drag') {
      const finalSnap = dragState?.snapped ?? computeSnapFromPointerY(e.clientY, toPlacementTargetFromPlaced(item));
      setDragState(null);
      if (finalSnap.snapped) {
        openMoveConfirmation(toPlacementTargetFromPlaced(item), {
          startMin: finalSnap.startMin, endMin: finalSnap.endMin, time24: finalSnap.time24,
          windowLabel: finalSnap.windowLabel, suggestedAnchor: finalSnap.suggestedAnchor,
        }, 'drag');
      }
      return;
    }
    if (mode === 'swipe') {
      setSwipePreview(null);
      if (dx > 56) {
        const nextSlot = findNextLogicalFreeSlot({
          title: item.title, currentStartMin: item.startMin, durationMin: item.durationMin,
          freeWindows: model.freeWindows, prayers, plan, profile,
        });
        if (nextSlot) {
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(10);
          openMoveConfirmation(toPlacementTargetFromPlaced(item), {
            startMin: nextSlot.startMin, endMin: nextSlot.endMin, time24: nextSlot.time24,
            windowLabel: nextSlot.windowLabel, suggestedAnchor: nextSlot.suggestedAnchor ?? 'any-free-slot',
          }, 'swipe');
        }
      } else if (dx < -56) {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(10);
        void onMoveToUnplaced?.(item);
      }
    }
  };

  return {
    timelineRef,
    gestureRef,
    handleSelectGhostSlot,
    handleCardPointerDown,
    handleCardPointerMove,
    finishPointerGesture,
  };
}
