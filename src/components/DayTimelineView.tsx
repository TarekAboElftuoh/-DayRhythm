import React, { useMemo, useState } from 'react';
import { AlertTriangle, LayoutGrid, List } from 'lucide-react';
import { formatMinutes12h, formatMinutes24h } from '../engines/prayerEngine';
import {
  mapMinutesToHabitAnchor,
  type DayTimelinePlacedItem,
} from '../engines/lifeRhythmEngine';
import {
  isBackgroundLockedBlock,
  isBackgroundTimelineItem,
  type DayTimelineViewProps,
  type PendingMoveConfirmation,
  type PlacementTarget,
  type TimelineRenderNode,
} from './timeline/types';
import { BlockEditorSheet } from './timeline/BlockEditorSheet';
import { UnplacedTray } from './timeline/UnplacedTray';
import { TimeGrid } from './timeline/TimeGrid';
import { TimelineNodes } from './timeline/TimelineNodes';
import { TimelineSheets } from './timeline/TimelineSheets';

export type { DayTimelineViewProps };

export const DayTimelineView: React.FC<DayTimelineViewProps> = (props) => {
  const {
    model, prayers, plan, profile, todayIso, language, nowMinutes,
    isSyncingAutoPlace = false, onToggleBlockComplete, onToggleHabitToday, onCompleteTask,
    onConfirmAutoPlace, onCommitHabitMove, onCommitItemMove,
  } = props;
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showBackgroundEvents, setShowBackgroundEvents] = useState(false);
  const [confirmSheetOpen, setConfirmSheetOpen] = useState(false);
  const [placementTarget, setPlacementTarget] = useState<PlacementTarget | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMoveConfirmation | null>(null);
  const [editingItem, setEditingItem] = useState<DayTimelinePlacedItem | null>(null);
  const [isApplyingMove, setIsApplyingMove] = useState(false);

  const backgroundCount = useMemo(
    () =>
      model.lockedBlocks.filter(isBackgroundLockedBlock).length +
      model.placedBlocks.filter(isBackgroundTimelineItem).length,
    [model.lockedBlocks, model.placedBlocks]
  );

  const nodes = useMemo<TimelineRenderNode[]>(() => {
    const merged: TimelineRenderNode[] = [
      ...model.lockedBlocks
        .filter((b) => showBackgroundEvents || !isBackgroundLockedBlock(b))
        .map((b) => ({ kind: 'locked' as const, sortMin: b.startMin, data: b })),
      ...model.placedBlocks
        .filter((p) => showBackgroundEvents || !isBackgroundTimelineItem(p))
        .map((p) => ({ kind: 'placed' as const, sortMin: p.startMin, data: p })),
    ];
    merged.sort((a, b) => a.sortMin - b.sortMin);
    return merged;
  }, [model.lockedBlocks, model.placedBlocks, showBackgroundEvents]);

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

  const handleCommitBlockChange = async (
    item: DayTimelinePlacedItem,
    next: { startMin: number; durationMin: number; scope: 'today' | 'permanent' }
  ) => {
    if (item.kind === 'habit' && item.habit && onCommitHabitMove) {
      const suggestedAnchor = mapMinutesToHabitAnchor(next.startMin, prayers, plan);
      await onCommitHabitMove(item.habit, next.scope, {
        startMin: next.startMin,
        durationMin: next.durationMin,
        suggestedAnchor,
      });
    } else if ((item.kind === 'task' || item.kind === 'event') && onCommitItemMove) {
      await onCommitItemMove(
        {
          kind: item.kind,
          title: item.title,
          durationMin: next.durationMin,
          googleTask: item.googleTask,
          scheduleBlock: item.scheduleBlock,
        },
        { startMin: next.startMin, time24: formatMinutes24h(next.startMin) }
      );
    }
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
        <div className="flex flex-wrap items-center gap-2">
          {viewMode === 'list' && (
            <button
              type="button"
              aria-pressed={showBackgroundEvents}
              onClick={() => setShowBackgroundEvents((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                showBackgroundEvents
                  ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/15 text-[#7FFFD4]'
                  : 'border-white/15 bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>{language === 'ar' ? 'إظهار مواعيد النظام المخفية' : 'System items'}</span>
              {backgroundCount > 0 && (
                <span className="font-mono-tabular opacity-80">· {backgroundCount}</span>
              )}
            </button>
          )}
          {model.unplacedBlocks.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>تحتاج توظيف</span>
              <span className="font-mono-tabular">· {model.unplacedBlocks.length}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => setViewMode((m) => (m === 'list' ? 'grid' : 'list'))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 px-2.5 py-1 text-[11px] font-semibold text-[#7FFFD4] hover:bg-[#7FFFD4]/20 transition-colors cursor-pointer"
          >
            {viewMode === 'list' ? (
              <>
                <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                <span>{language === 'ar' ? 'تعديل بالشبكة' : 'Edit in Grid'}</span>
              </>
            ) : (
              <>
                <List className="w-3.5 h-3.5 shrink-0" />
                <span>{language === 'ar' ? 'عرض القائمة' : 'Today List'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {viewMode === 'grid' && (
        <UnplacedTray
          unplacedBlocks={model.unplacedBlocks} placeableCount={placeableItems.length}
          placementTarget={placementTarget} language={language} isSyncingAutoPlace={isSyncingAutoPlace}
          onSelectTarget={setPlacementTarget} onOpenAutoPlaceSheet={() => setConfirmSheetOpen(true)}
        />
      )}

      {viewMode === 'grid' ? (
        <TimeGrid
          model={model} language={language} nowMinutes={nowMinutes}
          showBackgroundEvents={showBackgroundEvents}
          onToggleBackgroundEvents={() => setShowBackgroundEvents((prev) => !prev)}
          onSelectActiveItem={setEditingItem}
          onCommitDragOrResize={(item, next) => handleCommitBlockChange(item, { ...next, scope: 'today' })}
        />
      ) : (
        <TimelineNodes
          nodes={nodes} language={language} nowMinutes={nowMinutes}
          onToggleMovable={handleToggleMovable}
        />
      )}

      <TimelineSheets
        language={language} pendingMove={pendingMove} isApplyingMove={isApplyingMove}
        onClosePendingMove={() => setPendingMove(null)} onCommitPendingMove={handleCommitPendingMove}
        confirmSheetOpen={confirmSheetOpen} isSyncingAutoPlace={isSyncingAutoPlace}
        placeableItems={placeableItems} onCloseAutoPlace={() => setConfirmSheetOpen(false)}
        onApplyAutoPlace={handleApplyAutoPlace}
      />
      <BlockEditorSheet
        item={editingItem} model={model} prayers={prayers} plan={plan} profile={profile}
        todayIso={todayIso} language={language} isSaving={isApplyingMove}
        onClose={() => setEditingItem(null)} onToggleComplete={handleToggleMovable}
        onSave={async (item, next) => {
          setIsApplyingMove(true);
          try { await handleCommitBlockChange(item, next); setEditingItem(null); } finally { setIsApplyingMove(false); }
        }}
      />
    </div>
  );
};
