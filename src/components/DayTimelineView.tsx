import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  ExternalLink,
  GripVertical,
  Lock,
  Magnet,
  Repeat,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  DailyRhythmPlan,
  DynamicHabit,
  DynamicHabitAnchor,
  GoogleTaskItem,
  LifeProfile,
  PrayerTimeItem,
  ScheduleBlock,
} from '../types/dayrhythm';
import { formatMinutes12h, formatMinutes24h } from '../engines/prayerEngine';
import {
  DYNAMIC_HABIT_ANCHOR_LABELS,
  buildGhostSlotsForItem,
  findNextLogicalFreeSlot,
  formatDurationAr,
  snapToValidFreeWindow,
  type DayTimelineGhostSlot,
  type DayTimelineLockedBlock,
  type DayTimelineModel,
  type DayTimelinePlacedItem,
  type DayTimelineUnplacedItem,
  type SnapToFreeWindowResult,
} from '../engines/lifeRhythmEngine';

export interface DayTimelineViewProps {
  model: DayTimelineModel;
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile: LifeProfile;
  todayIso: string;
  language: AppLanguage;
  nowMinutes: number;
  isSyncingAutoPlace?: boolean;
  onToggleBlockComplete: (blockId: string) => void;
  onToggleHabitToday?: (habitId: string) => void;
  onCompleteTask?: (item: DayTimelinePlacedItem) => void;
  onDeleteEventBlock?: (item: DayTimelinePlacedItem) => void;
  onTriggerAlert?: (title: string, emoji: string) => void;
  onConfirmAutoPlace: (items: DayTimelineUnplacedItem[]) => Promise<void> | void;
  onCommitHabitMove?: (
    habit: DynamicHabit,
    scope: 'today' | 'permanent',
    slot: { startMin: number; durationMin: number; suggestedAnchor: DynamicHabitAnchor }
  ) => Promise<void> | void;
  onCommitItemMove?: (
    item: {
      kind: 'task' | 'event';
      title: string;
      durationMin: number;
      googleTask?: GoogleTaskItem;
      scheduleBlock?: ScheduleBlock;
    },
    slot: { startMin: number; time24: string }
  ) => Promise<void> | void;
  onMoveToUnplaced?: (item: DayTimelinePlacedItem) => Promise<void> | void;
}

type PlacementTarget = {
  id: string;
  kind: 'habit' | 'task' | 'event';
  title: string;
  emoji: string;
  durationMin: number;
  currentRange: [number, number] | null;
  habit?: DynamicHabit;
  googleTask?: GoogleTaskItem;
  scheduleBlock?: ScheduleBlock;
};

interface PendingMoveConfirmation {
  target: PlacementTarget;
  startMin: number;
  endMin: number;
  time24: string;
  windowLabel: string;
  suggestedAnchor: DynamicHabitAnchor;
  sourceGesture: 'tap' | 'drag' | 'swipe';
}

type TimelineRenderNode =
  | { kind: 'locked'; sortMin: number; data: DayTimelineLockedBlock }
  | { kind: 'placed'; sortMin: number; data: DayTimelinePlacedItem }
  | { kind: 'ghost'; sortMin: number; data: DayTimelineGhostSlot };

const SPRING_SNAPPY = { type: 'spring', stiffness: 460, damping: 34 } as const;

function toPlacementTargetFromPlaced(item: DayTimelinePlacedItem): PlacementTarget {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    emoji: item.emoji,
    durationMin: item.durationMin,
    currentRange: [item.startMin, item.endMin],
    habit: item.habit,
    googleTask: item.googleTask,
    scheduleBlock: item.scheduleBlock,
  };
}

function toPlacementTargetFromUnplaced(item: DayTimelineUnplacedItem): PlacementTarget {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    emoji: item.emoji,
    durationMin: item.durationMin,
    currentRange: null,
    habit: item.habit,
    googleTask: item.googleTask,
    scheduleBlock: item.scheduleBlock,
  };
}

export const DayTimelineView: React.FC<DayTimelineViewProps> = ({
  model,
  prayers,
  plan,
  profile,
  language,
  nowMinutes,
  isSyncingAutoPlace = false,
  onToggleBlockComplete,
  onToggleHabitToday,
  onCompleteTask,
  onDeleteEventBlock,
  onTriggerAlert,
  onConfirmAutoPlace,
  onCommitHabitMove,
  onCommitItemMove,
  onMoveToUnplaced,
}) => {
  const [confirmSheetOpen, setConfirmSheetOpen] = useState(false);
  const [placementTarget, setPlacementTarget] = useState<PlacementTarget | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMoveConfirmation | null>(null);
  const [isApplyingMove, setIsApplyingMove] = useState(false);
  const [dragState, setDragState] = useState<{
    target: PlacementTarget;
    snapped: SnapToFreeWindowResult | null;
  } | null>(null);
  const [swipePreview, setSwipePreview] = useState<{ id: string; dx: number } | null>(null);

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

  const activeGhostOwner = dragState?.target ?? placementTarget;

  const ghostSlots = useMemo<DayTimelineGhostSlot[]>(() => {
    if (!activeGhostOwner) return [];
    return buildGhostSlotsForItem({
      durationMin: activeGhostOwner.durationMin,
      freeWindows: model.freeWindows,
      prayers,
      plan,
      profile,
      excludeRange: activeGhostOwner.currentRange,
    });
  }, [activeGhostOwner, model.freeWindows, prayers, plan, profile]);

  const nodes = useMemo<TimelineRenderNode[]>(() => {
    const merged: TimelineRenderNode[] = [
      ...model.lockedBlocks.map((b) => ({
        kind: 'locked' as const,
        sortMin: b.startMin,
        data: b,
      })),
      ...model.placedBlocks.map((p) => ({
        kind: 'placed' as const,
        sortMin: p.startMin,
        data: p,
      })),
      ...ghostSlots.map((g) => ({
        kind: 'ghost' as const,
        sortMin: g.startMin,
        data: g,
      })),
    ];
    merged.sort((a, b) => a.sortMin - b.sortMin);
    return merged;
  }, [model.lockedBlocks, model.placedBlocks, ghostSlots]);

  const placeableItems = useMemo(
    () => model.unplacedBlocks.filter((item) => item.suggestedSlot !== null),
    [model.unplacedBlocks]
  );

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const computeSnapFromPointerY = (
    clientY: number,
    target: PlacementTarget
  ): SnapToFreeWindowResult => {
    const rect = timelineRef.current?.getBoundingClientRect();
    const wake = model.wakeMin;
    const bed = model.bedtimeMin > wake ? model.bedtimeMin : 1440;
    const ratio =
      rect && rect.height > 20
        ? Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
        : 0.5;
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
    slot: {
      startMin: number;
      endMin: number;
      time24: string;
      windowLabel: string;
      suggestedAnchor: DynamicHabitAnchor;
    },
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
    const dur = Math.max(10, Math.min(placementTarget.durationMin, ghost.durationMin));
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

  const beginDragNow = (
    item: DayTimelinePlacedItem,
    pointerId: number,
    clientY: number,
    el: HTMLElement
  ) => {
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // ignore pointer capture failure on synthetic events
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(12);
    }
    const target = toPlacementTargetFromPlaced(item);
    const snapped = computeSnapFromPointerY(clientY, target);
    setPlacementTarget(null);
    setSwipePreview(null);
    setDragState({ target, snapped });
  };

  const handleCardPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    item: DayTimelinePlacedItem,
    fromHandle = false
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const targetEl = e.target as HTMLElement | null;
    if (!fromHandle && targetEl?.closest('button, a')) return;

    clearLongPressTimer();
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const currentTarget = e.currentTarget;

    gestureRef.current = {
      active: true,
      mode: fromHandle ? 'drag' : 'pending',
      pointerId,
      startX,
      startY,
      item,
      suppressNextClick: fromHandle,
    };

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
        // Normal vertical scroll — cancel long-press without hijacking scroll
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
      const snapped = computeSnapFromPointerY(e.clientY, target);
      setDragState({ target, snapped });
    }
  };

  const finishPointerGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    clearLongPressTimer();
    const g = gestureRef.current;
    if (!g || !g.active || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.startX;
    const mode = g.mode;
    const item = g.item;
    g.active = false;
    g.mode = 'idle';

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    if (mode === 'drag') {
      const finalSnap =
        dragState?.snapped ?? computeSnapFromPointerY(e.clientY, toPlacementTargetFromPlaced(item));
      setDragState(null);
      if (finalSnap.snapped) {
        openMoveConfirmation(
          toPlacementTargetFromPlaced(item),
          {
            startMin: finalSnap.startMin,
            endMin: finalSnap.endMin,
            time24: finalSnap.time24,
            windowLabel: finalSnap.windowLabel,
            suggestedAnchor: finalSnap.suggestedAnchor,
          },
          'drag'
        );
      }
      return;
    }

    if (mode === 'swipe') {
      setSwipePreview(null);
      if (dx > 56) {
        const nextSlot = findNextLogicalFreeSlot({
          title: item.title,
          currentStartMin: item.startMin,
          durationMin: item.durationMin,
          freeWindows: model.freeWindows,
          prayers,
          plan,
          profile,
        });
        if (nextSlot) {
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(10);
          }
          openMoveConfirmation(
            toPlacementTargetFromPlaced(item),
            {
              startMin: nextSlot.startMin,
              endMin: nextSlot.endMin,
              time24: nextSlot.time24,
              windowLabel: nextSlot.windowLabel,
              suggestedAnchor: nextSlot.suggestedAnchor ?? 'any-free-slot',
            },
            'swipe'
          );
        }
      } else if (dx < -56) {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(10);
        }
        void onMoveToUnplaced?.(item);
      }
    }
  };

  const handleToggleMovable = (item: DayTimelinePlacedItem) => {
    if (item.kind === 'habit' && item.habitId) {
      onToggleHabitToday?.(item.habitId);
      return;
    }
    if (item.kind === 'task') {
      onCompleteTask?.(item);
      return;
    }
    if (item.scheduleBlockId) {
      onToggleBlockComplete(item.scheduleBlockId);
    }
  };

  const handleApplyAutoPlace = async () => {
    if (placeableItems.length === 0 || isSyncingAutoPlace) return;
    await onConfirmAutoPlace(placeableItems);
    setConfirmSheetOpen(false);
  };

  const handleCommitPendingMove = async (scope: 'today' | 'permanent') => {
    if (!pendingMove || isApplyingMove) return;
    setIsApplyingMove(true);
    try {
      const { target, startMin, time24, suggestedAnchor } = pendingMove;
      if (target.kind === 'habit' && target.habit && onCommitHabitMove) {
        await onCommitHabitMove(target.habit, scope, {
          startMin,
          durationMin: target.durationMin,
          suggestedAnchor,
        });
      } else if ((target.kind === 'task' || target.kind === 'event') && onCommitItemMove) {
        await onCommitItemMove(
          {
            kind: target.kind,
            title: target.title,
            durationMin: target.durationMin,
            googleTask: target.googleTask,
            scheduleBlock: target.scheduleBlock,
          },
          { startMin, time24 }
        );
      }
      setPendingMove(null);
    } finally {
      setIsApplyingMove(false);
    }
  };

  return (
    <div className="mt-3.5 space-y-4" dir="rtl">
      {/* Minimalist 24h Rhythm Strip (Wake -> Bedtime) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <span aria-hidden="true">☀️</span>
            <span className="text-zinc-500">الاستيقاظ</span>
            <span className="font-mono-tabular font-semibold text-white">
              {formatMinutes12h(model.wakeMin, language)}
            </span>
          </span>
          <span className="text-zinc-600" aria-hidden="true">
            •
          </span>
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <span aria-hidden="true">🛏️</span>
            <span className="text-zinc-500">النوم</span>
            <span className="font-mono-tabular font-semibold text-white">
              {formatMinutes12h(model.bedtimeMin, language)}
            </span>
          </span>
        </div>

        {model.unplacedBlocks.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>تحتاج توظيف</span>
            <span className="font-mono-tabular">· {model.unplacedBlocks.length}</span>
          </span>
        )}
      </div>

      {/* Live Tap-to-Place or Magnetic Snap Guidance Banner */}
      <AnimatePresence initial={false}>
        {(placementTarget || dragState) && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SPRING_SNAPPY}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-active)] bg-[rgba(127,255,212,0.10)] px-3.5 py-2 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Magnet className="w-4 h-4 text-[#7FFFD4] shrink-0" />
              {dragState?.snapped?.snapped ? (
                <span className="text-zinc-100 font-medium truncate">
                  يتجاذب «{dragState.target.title}» إلى{' '}
                  <span className="font-mono-tabular font-bold text-[#7FFFD4]">
                    {formatMinutes12h(dragState.snapped.startMin, language)} –{' '}
                    {formatMinutes12h(dragState.snapped.endMin, language)}
                  </span>
                </span>
              ) : (
                <span className="text-zinc-100 font-medium truncate">
                  اختر نافذة فراغ مضيئة لـ «{activeGhostOwner?.title}»
                </span>
              )}
            </div>
            {placementTarget && (
              <button
                type="button"
                onClick={() => setPlacementTarget(null)}
                className="min-h-[44px] sm:min-h-[34px] px-3 rounded-lg border border-white/15 text-zinc-200 hover:text-white text-xs font-medium cursor-pointer shrink-0"
              >
                إلغاء
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Conflicting / Unplaced Blocks Tray ("تحتاج توظيف") */}
      <AnimatePresence initial={false}>
        {model.unplacedBlocks.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SPRING_SNAPPY}
            aria-label="مهام وعادات تحتاج توظيف"
            className="rounded-2xl border border-amber-400/25 bg-[var(--bg-card)] p-3.5 sm:p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                    <span>تحتاج توظيف</span>
                    <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[11px] font-mono-tabular text-amber-300">
                      {model.unplacedBlocks.length}
                    </span>
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    اضغط على أي عنصر لاختيار نافذة فراغ، أو وزّعها تلقائياً.
                  </p>
                </div>
              </div>

              {placeableItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmSheetOpen(true)}
                  disabled={isSyncingAutoPlace}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>وزّعها تلقائياً</span>
                </button>
              )}
            </div>

            <div className="divide-y divide-[var(--border-subtle)]">
              {model.unplacedBlocks.map((item) => {
                const isSelected = placementTarget?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setPlacementTarget((prev) =>
                        prev?.id === item.id ? null : toPlacementTargetFromUnplaced(item)
                      )
                    }
                    className={`w-full min-h-[44px] py-2.5 px-2 -mx-2 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-right cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[rgba(127,255,212,0.14)] ring-1 ring-[#7FFFD4]/45'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden="true">
                        {item.emoji}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-100 truncate">{item.title}</div>
                        <div className="text-[11px] text-amber-300/90 mt-0.5">
                          {item.conflictReasonAr}
                        </div>
                      </div>
                    </div>
                    <div className="font-mono-tabular text-[11px] shrink-0 text-left">
                      {item.suggestedSlot ? (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-[#7FFFD4]/25 bg-[#7FFFD4]/10 px-2 py-1 text-[#7FFFD4] font-medium">
                          <span>المقترح:</span>
                          <span>{formatMinutes12h(item.suggestedSlot.startMin, language)}</span>
                        </span>
                      ) : (
                        <span className="text-zinc-500">لا توجد نافذة اليوم</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Vertical 24h Rhythm Timeline (Structured + Things 3 Minimalism) */}
      <div ref={timelineRef} className="relative pr-4 sm:pr-5 space-y-2.5">
        <div
          aria-hidden="true"
          className="absolute right-[7px] sm:right-[9px] top-3 bottom-3 w-px bg-[var(--border-subtle)]"
        />

        {nodes.map((node) => {
          if (node.kind === 'ghost') {
            const ghost = node.data;
            const isSnapTarget =
              Boolean(dragState?.snapped?.snapped) &&
              dragState!.snapped!.startMin >= ghost.startMin &&
              dragState!.snapped!.startMin < ghost.endMin;

            return (
              <motion.div
                key={ghost.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={SPRING_SNAPPY}
                className="relative flex items-stretch gap-3"
              >
                <span
                  aria-hidden="true"
                  className="relative z-10 mt-4 -mr-[19px] sm:-mr-[21px] h-2.5 w-2.5 rounded-full border border-[#7FFFD4] bg-[#7FFFD4]/40 shrink-0"
                />
                <button
                  type="button"
                  onClick={() => handleSelectGhostSlot(ghost)}
                  style={{ backgroundColor: 'rgba(127, 255, 212, 0.14)' }}
                  className={`flex-1 min-h-[48px] rounded-2xl border px-3.5 py-2.5 text-right flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    isSnapTarget
                      ? 'border-[#7FFFD4] ring-2 ring-[#7FFFD4]/35 scale-[1.01]'
                      : 'border-dashed border-[#7FFFD4]/45 hover:border-[#7FFFD4]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#7FFFD4] flex items-center gap-1.5">
                      <span>✨ {ghost.label}</span>
                      <span className="text-[11px] font-normal text-zinc-300">
                        ({formatDurationAr(ghost.durationMin)})
                      </span>
                    </div>
                    <div className="font-mono-tabular text-[11px] text-zinc-200 mt-0.5">
                      {formatMinutes12h(ghost.startMin, language)} –{' '}
                      {formatMinutes12h(ghost.endMin, language)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg bg-[#7FFFD4] text-black px-2.5 py-1 text-[11px] font-bold">
                    ضعها هنا
                  </span>
                </button>
              </motion.div>
            );
          }

          if (node.kind === 'locked') {
            const blk = node.data;
            const isNow =
              nowMinutes >= blk.startMin && nowMinutes < blk.endMin && blk.endMin <= 1440;
            return (
              <div key={blk.id} className="relative flex items-stretch gap-3">
                <span
                  aria-hidden="true"
                  className={`relative z-10 mt-3.5 -mr-[19px] sm:-mr-[21px] h-2.5 w-2.5 rounded-full border shrink-0 ${
                    isNow
                      ? 'bg-[#7FFFD4] border-[#7FFFD4] shadow-[0_0_8px_rgba(127,255,212,0.5)]'
                      : 'bg-[var(--bg-canvas)] border-zinc-600'
                  }`}
                />

                <div
                  aria-label={`${blk.titleAr} (وقت محمي غير قابل للتعديل)`}
                  className={`flex-1 rounded-2xl border px-3.5 py-2.5 select-none transition-colors ${
                    isNow
                      ? 'border-[var(--border-active)] bg-[var(--bg-locked)]'
                      : 'border-[var(--border-locked)] bg-[var(--bg-locked)] opacity-85'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-lg leading-none shrink-0" aria-hidden="true">
                        {blk.emoji}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs sm:text-sm font-semibold text-zinc-300 truncate">
                            {blk.titleAr}
                          </span>
                          <Lock className="w-3 h-3 text-zinc-500 shrink-0" aria-hidden="true" />
                          {isNow && (
                            <span className="text-[11px] font-bold text-[#7FFFD4]">· الآن</span>
                          )}
                        </div>
                        <div className="font-mono-tabular text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>
                            {formatMinutes12h(blk.startMin, language)} –{' '}
                            {formatMinutes12h(blk.endMin, language)}
                          </span>
                          <span>· {formatDurationAr(blk.durationMin)}</span>
                          {blk.subtitleAr && (
                            <span className="text-zinc-500 font-sans">· {blk.subtitleAr}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          const item = node.data;
          const isNow =
            !item.completed && nowMinutes >= item.startMin && nowMinutes < item.endMin;
          const isPlacementSelected = placementTarget?.id === item.id;
          const isDraggingThis = dragState?.target.id === item.id;
          const swipeDx = swipePreview?.id === item.id ? swipePreview.dx : 0;

          return (
            <div key={item.id} className="relative flex items-stretch gap-3">
              <span
                aria-hidden="true"
                className={`relative z-10 mt-4 -mr-[19px] sm:-mr-[21px] h-2.5 w-2.5 rounded-full border shrink-0 transition-colors ${
                  item.completed
                    ? 'bg-[#4ADE80] border-[#4ADE80]'
                    : isNow || isPlacementSelected || isDraggingThis
                      ? 'bg-[#7FFFD4] border-[#7FFFD4] shadow-[0_0_10px_rgba(127,255,212,0.55)]'
                      : 'bg-[var(--bg-card)] border-[#7FFFD4]/45'
                }`}
              />

              <div
                onPointerDown={(e) => handleCardPointerDown(e, item, false)}
                onPointerMove={handleCardPointerMove}
                onPointerUp={finishPointerGesture}
                onPointerCancel={finishPointerGesture}
                onClick={(e) => {
                  const targetEl = e.target as HTMLElement | null;
                  if (targetEl?.closest('button, a')) return;
                  if (gestureRef.current?.suppressNextClick) {
                    gestureRef.current.suppressNextClick = false;
                    return;
                  }
                  setPlacementTarget((prev) =>
                    prev?.id === item.id ? null : toPlacementTargetFromPlaced(item)
                  );
                }}
                style={{
                  transform:
                    swipeDx !== 0
                      ? `translateX(${swipeDx}px)`
                      : isDraggingThis
                        ? 'scale(1.03)'
                        : undefined,
                }}
                className={`relative flex-1 rounded-2xl border px-3 py-2.5 touch-pan-y select-none transition-[border-color,background-color,box-shadow,transform] duration-150 flex items-center justify-between gap-2 cursor-pointer ${
                  isDraggingThis
                    ? 'border-[#7FFFD4] bg-[var(--bg-card-elevated,var(--bg-card))] shadow-[0_0_24px_rgba(127,255,212,0.28)] z-20'
                    : isPlacementSelected
                      ? 'border-[#7FFFD4] bg-[rgba(127,255,212,0.10)] ring-1 ring-[#7FFFD4]/35'
                      : isNow
                        ? 'border-[var(--border-active)] bg-[var(--bg-card-elevated,var(--bg-card))] ring-1 ring-[#7FFFD4]/20'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-active)]'
                } ${item.completed ? 'opacity-55' : ''}`}
              >
                {Math.abs(swipeDx) > 20 && (
                  <span
                    className={`pointer-events-none absolute top-1.5 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold flex items-center gap-1 ${
                      swipeDx > 0
                        ? 'bg-[#7FFFD4]/20 text-[#7FFFD4] border border-[#7FFFD4]/40'
                        : 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                    }`}
                  >
                    {swipeDx > 0 ? (
                      <>
                        <ArrowRight className="w-3 h-3" />
                        <span>النافذة التالية</span>
                      </>
                    ) : (
                      <>
                        <ArrowLeft className="w-3 h-3" />
                        <span>تحتاج توظيف</span>
                      </>
                    )}
                  </span>
                )}

                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleToggleMovable(item)}
                    aria-label={item.completed ? `إعادة فتح ${item.title}` : `إتمام ${item.title}`}
                    className="min-h-[44px] min-w-[44px] -ms-1 flex items-center justify-center rounded-xl text-zinc-400 hover:text-[#7FFFD4] hover:bg-white/[0.04] cursor-pointer shrink-0 transition-colors"
                  >
                    {item.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-[#4ADE80]" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  <span className="text-lg leading-none shrink-0" aria-hidden="true">
                    {item.emoji}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-sm font-semibold break-words ${
                          item.completed ? 'line-through text-zinc-500' : 'text-zinc-100'
                        }`}
                      >
                        {item.title}
                      </span>
                      {isNow && (
                        <span className="text-[11px] font-bold text-[#4ADE80]">· الآن</span>
                      )}
                      {item.isTodayOverride && (
                        <span className="rounded-md bg-[#7FFFD4]/12 border border-[#7FFFD4]/25 px-1.5 py-0.2 text-[10px] text-[#7FFFD4]">
                          اليوم فقط
                        </span>
                      )}
                    </div>
                    <div className="font-mono-tabular text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[#7FFFD4]/90">
                        {formatMinutes12h(item.startMin, language)} –{' '}
                        {formatMinutes12h(item.endMin, language)}
                      </span>
                      <span className="text-zinc-500">· {formatDurationAr(item.durationMin)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      const cardEl = e.currentTarget.closest('[class*="rounded-2xl"]') as HTMLDivElement | null;
                      if (cardEl) {
                        handleCardPointerDown(
                          { ...e, currentTarget: cardEl } as React.PointerEvent<HTMLDivElement>,
                          item,
                          true
                        );
                      }
                    }}
                    aria-label={`سحب ${item.title} إلى نافذة أخرى`}
                    title="سحب مغناطيسي لنافذة فراغ"
                    className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] touch-none flex items-center justify-center rounded-xl text-zinc-500 hover:text-[#7FFFD4] hover:bg-white/[0.04] cursor-grab active:cursor-grabbing transition-colors"
                  >
                    <GripVertical className="w-4 h-4" />
                  </button>
                  {onTriggerAlert && (
                    <button
                      type="button"
                      onClick={() => onTriggerAlert(item.title, item.emoji)}
                      aria-label={`تجربة تنبيه ${item.title}`}
                      className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-[#7FFFD4] hover:bg-white/[0.04] cursor-pointer transition-colors"
                      title="تجربة التنبيه"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  )}
                  {item.googleHtmlLink && (
                    <a
                      href={item.googleHtmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`فتح ${item.title} في Google Calendar`}
                      className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-[#4ADE80] hover:bg-white/[0.04] transition-colors"
                      title="فتح في Google Calendar"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  {item.kind === 'event' && onDeleteEventBlock && (
                    <button
                      type="button"
                      onClick={() => onDeleteEventBlock(item)}
                      aria-label={`حذف ${item.title}`}
                      className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scope Confirmation Sheet ("اليوم فقط" vs "تعديل دائم ديناميكي") */}
      <AnimatePresence>
        {pendingMove && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
            onClick={() => !isApplyingMove && setPendingMove(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="scope-confirm-sheet-title"
              dir="rtl"
              initial={{ y: 36, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 28, opacity: 0, scale: 0.98 }}
              transition={SPRING_SNAPPY}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-[var(--border-active)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4 shadow-2xl"
            >
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto sm:hidden" aria-hidden="true" />

              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 id="scope-confirm-sheet-title" className="text-sm font-bold text-white truncate">
                    نقل «{pendingMove.target.title}»
                  </h3>
                  <div className="font-mono-tabular text-xs text-[#7FFFD4] mt-0.5">
                    {formatMinutes12h(pendingMove.startMin, language)} –{' '}
                    {formatMinutes12h(pendingMove.endMin, language)} · {pendingMove.windowLabel}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingMove(null)}
                  disabled={isApplyingMove}
                  aria-label="إغلاق"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {pendingMove.target.kind === 'habit' && pendingMove.target.habit ? (
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => void handleCommitPendingMove('today')}
                    disabled={isApplyingMove}
                    className="w-full min-h-[52px] rounded-xl border border-[var(--border-active)] bg-[#7FFFD4]/12 hover:bg-[#7FFFD4]/20 px-4 py-2.5 text-right flex items-center justify-between gap-3 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CalendarClock className="w-4 h-4 text-[#7FFFD4] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-white">اليوم فقط</div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          تعديل استثنائي لليوم مع بقاء المرتكز الدائم كما هو
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleCommitPendingMove('permanent')}
                    disabled={isApplyingMove}
                    className="w-full min-h-[52px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-active)] px-4 py-2.5 text-right flex items-center justify-between gap-3 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Repeat className="w-4 h-4 text-[#4ADE80] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-white">
                          تعديل دائم ديناميكي
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          تغيير المرتكز إلى «
                          {DYNAMIC_HABIT_ANCHOR_LABELS[pendingMove.suggestedAnchor].labelAr}» ليتكيّف
                          عبر الفصول
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleCommitPendingMove('today')}
                  disabled={isApplyingMove}
                  className="w-full min-h-[44px] rounded-xl bg-[#7FFFD4] text-black text-xs sm:text-sm font-bold hover:bg-[#66eec2] cursor-pointer disabled:opacity-50"
                >
                  {isApplyingMove ? 'جارٍ الحفظ...' : 'تأكيد النقل'}
                </button>
              )}

              <button
                type="button"
                onClick={() => setPendingMove(null)}
                disabled={isApplyingMove}
                className="w-full min-h-[44px] rounded-xl border border-[var(--border-subtle)] text-zinc-300 text-xs sm:text-sm font-medium hover:text-white cursor-pointer"
              >
                إلغاء
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emil-Kowalski Spring Bottom Sheet Confirmation for "وزّعها تلقائياً" */}
      <AnimatePresence>
        {confirmSheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
            onClick={() => !isSyncingAutoPlace && setConfirmSheetOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="auto-place-sheet-title"
              dir="rtl"
              initial={{ y: 36, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 28, opacity: 0, scale: 0.98 }}
              transition={SPRING_SNAPPY}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-active)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4 shadow-2xl"
            >
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto sm:hidden" aria-hidden="true" />

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#7FFFD4]" />
                  <h3 id="auto-place-sheet-title" className="text-sm font-bold text-white">
                    تأكيد التوزيع العلمي التلقائي
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmSheetOpen(false)}
                  disabled={isSyncingAutoPlace}
                  aria-label="إغلاق"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                سيتم وضع العناصر في أنسب نوافذ الفراغ العلمية بعيداً عن الصلاة والنوم والسحور والقيلولة:
              </p>

              <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3">
                {placeableItems.map((item) => (
                  <div key={`plan-${item.id}`} className="py-2.5 space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white truncate">
                        {item.emoji} {item.title}
                      </span>
                      {item.suggestedSlot && (
                        <span className="font-mono-tabular text-[#7FFFD4] font-semibold shrink-0">
                          {formatMinutes12h(item.suggestedSlot.startMin, language)} –{' '}
                          {formatMinutes12h(item.suggestedSlot.endMin, language)}
                        </span>
                      )}
                    </div>
                    {item.suggestedSlot && (
                      <div className="text-[11px] text-zinc-400">
                        {item.suggestedSlot.scientificNoteAr}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => void handleApplyAutoPlace()}
                  disabled={isSyncingAutoPlace}
                  className="flex-1 min-h-[44px] rounded-xl bg-[#7FFFD4] text-black text-xs sm:text-sm font-bold hover:bg-[#66eec2] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSyncingAutoPlace ? 'جارٍ التوزيع...' : 'تأكيد التوزيع'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmSheetOpen(false)}
                  disabled={isSyncingAutoPlace}
                  className="min-h-[44px] px-4 rounded-xl border border-[var(--border-subtle)] text-zinc-300 text-xs sm:text-sm font-medium hover:text-white cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
