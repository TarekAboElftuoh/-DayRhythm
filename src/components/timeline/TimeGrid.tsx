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
import { TimeBlockCard } from './TimeBlockCard';
import { TimeGridHeader } from './TimeGridHeader';
import { clampToDaySlices, formatHourRulerLabel, isBackgroundTimelineItem } from './types';
import { PX_PER_HOUR, PX_PER_MIN, useTimelineDrag } from './useTimelineDrag';

const MINUTES_PER_DAY = 24 * 60;
const GRID_HEIGHT_PX = 24 * PX_PER_HOUR;
const MIN_BLOCK_PX = 26;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

interface TimeGridProps {
  model: DayTimelineModel;
  language: AppLanguage;
  nowMinutes: number;
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
  onSelectFreeGap,
  onSelectActiveItem,
  onCommitDragOrResize,
}) => {
  const [showBackgroundEvents, setShowBackgroundEvents] = useState(false);
  const [optimisticOverrides, setOptimisticOverrides] = useState<
    Record<string, { startMin: number; durationMin: number }>
  >({});

  const handleCommitDrag = async (
    item: DayTimelinePlacedItem,
    next: { startMin: number; durationMin: number }
  ) => {
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

  const {
    dragState,
    startMove,
    startResize,
    handlePointerMove,
    handlePointerEnd,
    consumeClickAllowed,
  } = useTimelineDrag({
    lockedBlocks: model.lockedBlocks,
    onCommitDrag: handleCommitDrag,
  });

  const clampedNow = ((Math.round(nowMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const nowTopPx = clampedNow * PX_PER_MIN;

  const backgroundCount = useMemo(
    () => model.placedBlocks.filter(isBackgroundTimelineItem).length,
    [model.placedBlocks]
  );

  const lockedSlices = useMemo(
    () =>
      model.lockedBlocks.flatMap((blk) =>
        clampToDaySlices<DayTimelineLockedBlock>(blk.startMin, blk.endMin, blk.id, blk, MIN_BLOCK_PX, PX_PER_MIN)
      ),
    [model.lockedBlocks]
  );

  const activeSlices = useMemo(
    () =>
      model.placedBlocks
        .filter((item) => showBackgroundEvents || !isBackgroundTimelineItem(item))
        .flatMap((item) => {
          const ov = optimisticOverrides[item.id];
          const startMin = ov ? ov.startMin : item.startMin;
          const durationMin = ov ? ov.durationMin : item.durationMin;
          const endMin = startMin + durationMin;
          const eff = ov ? { ...item, startMin, endMin, durationMin } : item;
          return clampToDaySlices<DayTimelinePlacedItem>(startMin, endMin, item.id, eff, MIN_BLOCK_PX, PX_PER_MIN);
        }),
    [model.placedBlocks, showBackgroundEvents, optimisticOverrides]
  );

  const gapSlices = useMemo(
    () =>
      model.freeWindows.flatMap((gap, idx) =>
        clampToDaySlices<FreeWindow>(gap.startMin, gap.endMin, `gap-${gap.startMin}-${gap.endMin}-${idx}`, gap, 24, PX_PER_MIN)
      ),
    [model.freeWindows]
  );

  return (
    <section
      dir="rtl"
      aria-label={language === 'ar' ? 'الشبكة الزمنية ٢٤ ساعة' : '24h Time Grid'}
      className="rounded-2xl border border-white/10 bg-[#000000] overflow-hidden"
    >
      <TimeGridHeader
        language={language}
        showBackgroundEvents={showBackgroundEvents}
        backgroundCount={backgroundCount}
        onToggleBackgroundEvents={() => setShowBackgroundEvents((prev) => !prev)}
      />

      <div className="relative flex bg-[#000000] px-2 py-3">
        <div className="relative w-12 shrink-0 select-none" style={{ height: `${GRID_HEIGHT_PX}px` }}>
          {HOURS.map((hour) => (
            <div
              key={hour}
              style={{ top: `${hour * PX_PER_HOUR}px`, height: `${PX_PER_HOUR}px` }}
              className="absolute inset-x-0 flex items-start justify-end pl-2"
            >
              <span className="-translate-y-2 font-mono-tabular text-[10px] font-medium text-zinc-500">
                {formatHourRulerLabel(hour, language)}
              </span>
            </div>
          ))}
        </div>

        <div
          className="relative flex-1 border-r border-white/10"
          style={{ height: `${GRID_HEIGHT_PX}px` }}
        >
          {HOURS.map((hour) => (
            <div
              key={hour}
              style={{ top: `${hour * PX_PER_HOUR}px`, height: `${PX_PER_HOUR}px` }}
              className="pointer-events-none absolute inset-x-0 border-t border-white/[0.06]"
            >
              <div className="mt-[32px] border-t border-dashed border-white/[0.025]" />
            </div>
          ))}

          {gapSlices.map((slice) => (
            <FreeGapSlot
              key={slice.key}
              gap={slice.data}
              topPx={slice.topPx}
              heightPx={slice.heightPx}
              language={language}
              onSelectGap={onSelectFreeGap}
            />
          ))}

          {lockedSlices.map((slice) => (
            <TimeBlockCard
              key={slice.key}
              variant="locked"
              block={slice.data}
              topPx={slice.topPx}
              heightPx={slice.heightPx}
              language={language}
              isNow={clampedNow >= slice.startMin && clampedNow < slice.endMin}
            />
          ))}

          {activeSlices.map((slice) => (
            <TimeBlockCard
              key={slice.key}
              variant="active"
              item={slice.data}
              topPx={slice.topPx}
              heightPx={slice.heightPx}
              language={language}
              isNow={clampedNow >= slice.startMin && clampedNow < slice.endMin}
              isDragging={Boolean(dragState?.hasMoved && dragState.item.id === slice.data.id)}
              onSelect={(item) => {
                if (!consumeClickAllowed()) return;
                onSelectActiveItem?.(item);
              }}
              onMovePointerDown={startMove}
              onResizePointerDown={startResize}
              onPointerMove={handlePointerMove}
              onPointerEnd={handlePointerEnd}
            />
          ))}

          {dragState?.hasMoved && (
            <div
              style={{
                top: `${dragState.startMin * PX_PER_MIN}px`,
                height: `${Math.max(MIN_BLOCK_PX, dragState.durationMin * PX_PER_MIN)}px`,
              }}
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
          )}

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
