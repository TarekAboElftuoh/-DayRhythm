import React, { useMemo, useState } from 'react';
import type { AppLanguage, FreeWindow } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';
import {
  formatDurationAr,
  type DayTimelineLockedBlock,
  type DayTimelineModel,
  type DayTimelinePlacedItem,
} from '../../engines/lifeRhythmEngine';
import { FreeGapSlot } from './FreeGapSlot';
import { PeriodFocusView } from './PeriodFocusView';
import { TimeBlockCard } from './TimeBlockCard';
import { TimeGridHeader } from './TimeGridHeader';
import { createDayYMapper } from './dayYMapper';
import {
  formatHourRulerLabel,
  isBackgroundLockedBlock,
  isBackgroundTimelineItem,
  type BackgroundGridItem,
} from './types';
import { PX_PER_HOUR, PX_PER_MIN, useTimelineDrag } from './useTimelineDrag';
import { clampVisualSliceToLocked, getClampedDragPreviewRect, type VisualLockedBound } from './timelineCollision';

const MINUTES_PER_DAY = 24 * 60;
const MIN_BLOCK_PX = 26;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

interface TimeGridProps {
  model: DayTimelineModel;
  language: AppLanguage;
  nowMinutes: number;
  showBackgroundEvents?: boolean;
  onToggleBackgroundEvents?: () => void;
  onSelectFreeGap?: (gap: FreeWindow) => void;
  onSelectActiveItem?: (item: DayTimelinePlacedItem) => void;
  onCommitDragOrResize?: (
    item: DayTimelinePlacedItem,
    next: { startMin: number; durationMin: number }
  ) => Promise<void> | void;
}

export const TimeGrid: React.FC<TimeGridProps> = ({
  model,
  language,
  nowMinutes,
  showBackgroundEvents: controlledShowBg,
  onToggleBackgroundEvents,
  onSelectFreeGap,
  onSelectActiveItem,
  onCommitDragOrResize,
}) => {
  const [internalShowBg, setInternalShowBg] = useState(false);
  const [focusedPeriod, setFocusedPeriod] = useState<FreeWindow | null>(null);
  const showBackgroundEvents = controlledShowBg ?? internalShowBg;
  const toggleBg = onToggleBackgroundEvents ?? (() => setInternalShowBg((prev) => !prev));
  const [optimisticOverrides, setOptimisticOverrides] = useState<
    Record<string, { startMin: number; durationMin: number }>
  >({});

  const handleCommitDrag = async (item: DayTimelinePlacedItem, next: { startMin: number; durationMin: number }) => {
    setOptimisticOverrides((prev) => ({ ...prev, [item.id]: next }));
    try {
      await onCommitDragOrResize?.(item, next);
    } finally {
      setOptimisticOverrides((prev) => {
        if (!(item.id in prev)) return prev;
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
    }
  };

  const hardLockedBlocks = useMemo(() => model.lockedBlocks.filter((blk) => !isBackgroundLockedBlock(blk)), [model.lockedBlocks]);
  const { dragState, startMove, startResize, handlePointerMove, handlePointerEnd, consumeClickAllowed } =
    useTimelineDrag({ lockedBlocks: hardLockedBlocks, onCommitDrag: handleCommitDrag });

  const yMap = useMemo(() => createDayYMapper(hardLockedBlocks), [hardLockedBlocks]);
  const gridHeightPx = yMap.gridHeightPx;
  const clampedNow = ((Math.round(nowMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const nowTopPx = yMap.minToY(clampedNow);

  const bgItems = useMemo<BackgroundGridItem[]>(() => [
    ...model.lockedBlocks.filter(isBackgroundLockedBlock).map((b) => ({ id: b.id, title: b.titleAr, emoji: b.emoji, startMin: b.startMin, endMin: b.endMin, durationMin: b.durationMin, subtitleAr: b.subtitleAr })),
    ...model.placedBlocks.filter(isBackgroundTimelineItem).map((p) => ({ id: p.id, title: p.title, emoji: p.emoji, startMin: p.startMin, endMin: p.endMin, durationMin: p.durationMin, subtitleAr: p.subtitleAr })),
  ], [model.lockedBlocks, model.placedBlocks]);

  const bgSlices = useMemo(
    () => (showBackgroundEvents ? yMap.mapSlices(bgItems.map((b) => ({ startMin: b.startMin, endMin: b.endMin, key: `bg-${b.id}`, data: b })), MIN_BLOCK_PX) : []),
    [showBackgroundEvents, bgItems, yMap]
  );
  const lockedSlices = useMemo(
    () => yMap.mapSlices(hardLockedBlocks.map((blk) => ({ startMin: blk.startMin, endMin: blk.endMin, key: blk.id, data: blk })), MIN_BLOCK_PX),
    [hardLockedBlocks, yMap]
  );
  const lockedBounds = useMemo<VisualLockedBound[]>(
    () => lockedSlices.map((s) => ({ startMin: s.startMin, endMin: s.endMin, topPx: s.topPx, bottomPx: s.topPx + s.heightPx })),
    [lockedSlices]
  );
  const activeSlices = useMemo(
    () =>
      model.placedBlocks.filter((item) => !isBackgroundTimelineItem(item)).flatMap((item) => {
        const ov = optimisticOverrides[item.id];
        const startMin = ov ? ov.startMin : item.startMin;
        const durationMin = ov ? ov.durationMin : item.durationMin;
        const endMin = startMin + durationMin;
        const eff = ov ? { ...item, startMin, endMin, durationMin } : item;
        return yMap.mapSlices([{ startMin, endMin, key: item.id, data: eff }], MIN_BLOCK_PX)
          .map((sl) => ({ ...sl, ...clampVisualSliceToLocked(sl.startMin, sl.endMin, sl.topPx, sl.heightPx, lockedBounds, gridHeightPx) }));
      }),
    [model.placedBlocks, optimisticOverrides, lockedBounds, gridHeightPx, yMap]
  );
  const gapSlices = useMemo(
    () => yMap.mapSlices(model.freeWindows.map((gap, idx) => ({ startMin: gap.startMin, endMin: gap.endMin, key: `gap-${gap.startMin}-${gap.endMin}-${idx}`, data: gap })), 24),
    [model.freeWindows, yMap]
  );

  if (focusedPeriod) {
    return (
      <PeriodFocusView
        period={focusedPeriod} language={language} nowMinutes={nowMinutes}
        showBackgroundEvents={showBackgroundEvents} onToggleBackgroundEvents={toggleBg}
        hardLockedBlocks={hardLockedBlocks} bgItems={bgItems}
        placedItems={model.placedBlocks.filter((item) => !isBackgroundTimelineItem(item))}
        optimisticOverrides={optimisticOverrides} onBack={() => setFocusedPeriod(null)}
        onSelectActiveItem={onSelectActiveItem} onCommitDrag={handleCommitDrag}
      />
    );
  }

  return (
    <section
      dir="rtl"
      aria-label={language === 'ar' ? 'الشبكة الزمنية ٢٤ ساعة' : '24h Time Grid'}
      className="rounded-2xl border border-white/10 bg-[#000000] overflow-hidden"
    >
      <TimeGridHeader
        language={language}
        showBackgroundEvents={showBackgroundEvents}
        backgroundCount={bgItems.length}
        onToggleBackgroundEvents={toggleBg}
      />

      <div className="relative flex bg-[#000000] px-2 py-3">
        <div className="relative w-12 shrink-0 select-none" style={{ height: `${gridHeightPx}px` }}>
          {HOURS.map((hour) => {
            const top = yMap.minToY(hour * 60);
            const h = yMap.minToY((hour + 1) * 60) - top;
            const showLabel = h >= 18 || !yMap.isHourInSleep(hour);
            return (
              <div key={hour} style={{ top: `${top}px`, height: `${h}px` }} className="absolute inset-x-0 flex items-start justify-end pl-2">
                {showLabel && (
                  <span className="-translate-y-2 font-mono-tabular text-[10px] font-medium text-zinc-500">
                    {formatHourRulerLabel(hour, language)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="relative flex-1 border-r border-white/10" style={{ height: `${gridHeightPx}px` }}>
          {HOURS.map((hour) => {
            const top = yMap.minToY(hour * 60);
            const h = yMap.minToY((hour + 1) * 60) - top;
            return (
              <div key={hour} style={{ top: `${top}px`, height: `${h}px` }} className="pointer-events-none absolute inset-x-0 border-t border-white/[0.06]">
                {h >= 36 && <div className="mt-[32px] border-t border-dashed border-white/[0.025]" />}
              </div>
            );
          })}

          {gapSlices.map((slice) => (
            <FreeGapSlot
              key={slice.key}
              gap={slice.data}
              topPx={slice.topPx}
              heightPx={slice.heightPx}
              language={language}
              onSelectGap={(g) => {
                const prev = hardLockedBlocks.filter((b) => b.endMin <= g.startMin).sort((a, b) => b.endMin - a.endMin)[0];
                const next = hardLockedBlocks.filter((b) => b.startMin >= g.endMin).sort((a, b) => a.startMin - b.startMin)[0];
                const startMin = prev ? prev.endMin : 0;
                const endMin = next ? next.startMin : MINUTES_PER_DAY;
                const periodName =
                  prev && next
                    ? `${prev.titleAr} – ${next.titleAr}`
                    : prev
                      ? prev.titleAr
                      : next
                        ? next.titleAr
                        : language === 'ar'
                          ? 'اليوم كامل'
                          : 'Full Day';
                const label = language === 'ar' ? `تعديل الفترة • ${periodName}` : `Edit Period • ${periodName}`;
                setFocusedPeriod({ ...g, startMin, endMin, durationMin: Math.max(0, endMin - startMin), label });
                onSelectFreeGap?.(g);
              }}
            />
          ))}
          {bgSlices.map((slice) => (
            <TimeBlockCard key={slice.key} variant="background" item={slice.data} topPx={slice.topPx} heightPx={slice.heightPx} language={language} isNow={clampedNow >= slice.startMin && clampedNow < slice.endMin} />
          ))}
          {lockedSlices.map((slice) => (
            <TimeBlockCard key={slice.key} variant="locked" block={slice.data} topPx={slice.topPx} heightPx={slice.heightPx} language={language} isNow={clampedNow >= slice.startMin && clampedNow < slice.endMin} />
          ))}
          {activeSlices.map((slice) => (
            <TimeBlockCard
              key={slice.key} variant="active" item={slice.data} topPx={slice.topPx} heightPx={slice.heightPx} language={language}
              isNow={clampedNow >= slice.startMin && clampedNow < slice.endMin}
              isDragging={Boolean(dragState?.hasMoved && dragState.item.id === slice.data.id)}
              onSelect={(item) => { if (consumeClickAllowed()) onSelectActiveItem?.(item); }}
              onMovePointerDown={startMove} onResizePointerDown={startResize}
              onPointerMove={handlePointerMove} onPointerEnd={handlePointerEnd}
            />
          ))}

          {dragState?.hasMoved && (() => {
            const topPx = yMap.minToY(dragState.startMin);
            const rawH = Math.max(MIN_BLOCK_PX, yMap.minToY(dragState.startMin + dragState.durationMin) - topPx);
            const r = getClampedDragPreviewRect(dragState.startMin, dragState.durationMin, MIN_BLOCK_PX, PX_PER_MIN, lockedBounds, gridHeightPx);
            const previewTop = topPx;
            const previewH = Math.min(r.heightPx, rawH);
            return (
              <div
                style={{ top: `${previewTop}px`, height: `${previewH}px`, maxHeight: `${previewH}px` }}
                className="pointer-events-none absolute inset-x-1 z-50 rounded-xl border-2 border-[#7FFFD4] bg-[#7FFFD4]/15 shadow-[0_0_24px_rgba(127,255,212,0.35)]"
              >
                <div
                  className={`absolute right-2 ${
                    dragState.startMin < 45 ? 'top-full mt-1.5' : '-top-8'
                  } inline-flex items-center gap-1.5 rounded-full border border-[#7FFFD4]/60 bg-[#040B09]/95 px-2.5 py-1 font-mono-tabular text-[11px] font-bold text-[#7FFFD4] shadow-lg whitespace-nowrap`}
                >
                  <span>
                    {formatMinutes12h(dragState.startMin, language)} –{' '}
                    {formatMinutes12h(dragState.startMin + dragState.durationMin, language)}
                  </span>
                  <span className="text-zinc-400">·</span>
                  <span className="text-white">{formatDurationAr(dragState.durationMin)}</span>
                  {dragState.skippedLocked && (
                    <span className="text-[10px] text-amber-300">⚡ تخطي مقفل</span>
                  )}
                </div>
              </div>
            );
          })()}

          <div
            style={{ top: `${nowTopPx}px` }}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 z-40 flex items-center"
          >
            <span className="h-2.5 w-2.5 -mr-[5px] rounded-full bg-[#7FFFD4] shadow-[0_0_10px_#7FFFD4]" />
            <div className="h-[1.5px] flex-1 bg-[#7FFFD4]/80 shadow-[0_0_8px_rgba(127,255,212,0.6)]" />
            <span className="mr-1.5 rounded-full bg-[#7FFFD4] px-1.5 py-0.5 font-mono-tabular text-[9px] font-bold text-black">
              {formatMinutes12h(clampedNow, language)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
