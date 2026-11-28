import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Magnet } from 'lucide-react';
import { formatMinutes12h } from '../engines/prayerEngine';
import {
  buildGhostSlotsForItem,
  type DayTimelineGhostSlot,
  type DayTimelinePlacedItem,
  type SnapToFreeWindowResult,
} from '../engines/lifeRhythmEngine';
import {
  SPRING_SNAPPY,
  type DayTimelineViewProps,
  type PendingMoveConfirmation,
  type PlacementTarget,
  type TimelineRenderNode,
} from './timeline/types';
import { UnplacedTray } from './timeline/UnplacedTray';
import { TimelineNodes } from './timeline/TimelineNodes';
import { TimelineSheets } from './timeline/TimelineSheets';
import { useTimelinePointerDrag } from './timeline/useTimelinePointerDrag';

export type { DayTimelineViewProps };

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

  const {
    timelineRef,
    gestureRef,
    handleSelectGhostSlot,
    handleCardPointerDown,
    handleCardPointerMove,
    finishPointerGesture,
  } = useTimelinePointerDrag({
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
  });

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
      ...model.lockedBlocks.map((b) => ({ kind: 'locked' as const, sortMin: b.startMin, data: b })),
      ...model.placedBlocks.map((p) => ({ kind: 'placed' as const, sortMin: p.startMin, data: p })),
      ...ghostSlots.map((g) => ({ kind: 'ghost' as const, sortMin: g.startMin, data: g })),
    ];
    merged.sort((a, b) => a.sortMin - b.sortMin);
    return merged;
  }, [model.lockedBlocks, model.placedBlocks, ghostSlots]);

  const placeableItems = useMemo(
    () => model.unplacedBlocks.filter((item) => item.suggestedSlot !== null),
    [model.unplacedBlocks]
  );

  const handleToggleMovable = (item: DayTimelinePlacedItem) => {
    if (item.kind === 'habit' && item.habitId) { onToggleHabitToday?.(item.habitId); return; }
    if (item.kind === 'task') { onCompleteTask?.(item); return; }
    if (item.scheduleBlockId) onToggleBlockComplete(item.scheduleBlockId);
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
        await onCommitHabitMove(target.habit, scope, { startMin, durationMin: target.durationMin, suggestedAnchor });
      } else if ((target.kind === 'task' || target.kind === 'event') && onCommitItemMove) {
        await onCommitItemMove({ kind: target.kind, title: target.title, durationMin: target.durationMin, googleTask: target.googleTask, scheduleBlock: target.scheduleBlock }, { startMin, time24 });
      }
      setPendingMove(null);
    } finally {
      setIsApplyingMove(false);
    }
  };

  return (
    <div className="mt-3.5 space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <span aria-hidden="true">☀️</span>
            <span className="text-zinc-500">الاستيقاظ</span>
            <span className="font-mono-tabular font-semibold text-white">{formatMinutes12h(model.wakeMin, language)}</span>
          </span>
          <span className="text-zinc-600" aria-hidden="true">•</span>
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <span aria-hidden="true">🛏️</span>
            <span className="text-zinc-500">النوم</span>
            <span className="font-mono-tabular font-semibold text-white">{formatMinutes12h(model.bedtimeMin, language)}</span>
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

      <AnimatePresence initial={false}>
        {(placementTarget || dragState) && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={SPRING_SNAPPY}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-active)] bg-[rgba(127,255,212,0.10)] px-3.5 py-2 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Magnet className="w-4 h-4 text-[#7FFFD4] shrink-0" />
              {dragState?.snapped?.snapped ? (
                <span className="text-zinc-100 font-medium truncate">
                  يتجاذب «{dragState.target.title}» إلى{' '}
                  <span className="font-mono-tabular font-bold text-[#7FFFD4]">
                    {formatMinutes12h(dragState.snapped.startMin, language)} – {formatMinutes12h(dragState.snapped.endMin, language)}
                  </span>
                </span>
              ) : (
                <span className="text-zinc-100 font-medium truncate">اختر نافذة فراغ مضيئة لـ «{activeGhostOwner?.title}»</span>
              )}
            </div>
            {placementTarget && (
              <button type="button" onClick={() => setPlacementTarget(null)} className="min-h-[44px] sm:min-h-[34px] px-3 rounded-lg border border-white/15 text-zinc-200 hover:text-white text-xs font-medium cursor-pointer shrink-0">
                إلغاء
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <UnplacedTray
        unplacedBlocks={model.unplacedBlocks}
        placeableCount={placeableItems.length}
        placementTarget={placementTarget}
        language={language}
        isSyncingAutoPlace={isSyncingAutoPlace}
        onSelectTarget={setPlacementTarget}
        onOpenAutoPlaceSheet={() => setConfirmSheetOpen(true)}
      />

      <TimelineNodes
        timelineRef={timelineRef}
        nodes={nodes}
        language={language}
        nowMinutes={nowMinutes}
        placementTarget={placementTarget}
        dragState={dragState}
        swipePreview={swipePreview}
        gestureRef={gestureRef}
        onSelectGhostSlot={handleSelectGhostSlot}
        onCardPointerDown={handleCardPointerDown}
        onCardPointerMove={handleCardPointerMove}
        onFinishPointerGesture={finishPointerGesture}
        onSelectPlacementTarget={setPlacementTarget}
        onToggleMovable={handleToggleMovable}
        onTriggerAlert={onTriggerAlert}
        onDeleteEventBlock={onDeleteEventBlock}
      />

      <TimelineSheets
        language={language}
        pendingMove={pendingMove}
        isApplyingMove={isApplyingMove}
        onClosePendingMove={() => setPendingMove(null)}
        onCommitPendingMove={handleCommitPendingMove}
        confirmSheetOpen={confirmSheetOpen}
        isSyncingAutoPlace={isSyncingAutoPlace}
        placeableItems={placeableItems}
        onCloseAutoPlace={() => setConfirmSheetOpen(false)}
        onApplyAutoPlace={handleApplyAutoPlace}
      />
    </div>
  );
};
