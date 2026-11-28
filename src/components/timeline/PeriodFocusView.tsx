import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AppLanguage, FreeWindow } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';
import {
  formatDurationAr,
  type DayTimelineLockedBlock,
  type DayTimelinePlacedItem,
} from '../../engines/lifeRhythmEngine';
import { TimeBlockCard } from './TimeBlockCard';
import type { BackgroundGridItem } from './types';
import { useTimelineDrag } from './useTimelineDrag';

const FOCUS_PX_PER_MIN = 3.2;
const MIN_FOCUS_BLOCK_PX = 34;

interface PeriodFocusViewProps {
  period: FreeWindow;
  language: AppLanguage;
  nowMinutes: number;
  showBackgroundEvents: boolean;
  onToggleBackgroundEvents: () => void;
  hardLockedBlocks: DayTimelineLockedBlock[];
  bgItems: BackgroundGridItem[];
  placedItems: DayTimelinePlacedItem[];
  optimisticOverrides: Record<string, { startMin: number; durationMin: number }>;
  onBack: () => void;
  onSelectActiveItem?: (item: DayTimelinePlacedItem) => void;
  onCommitDrag: (item: DayTimelinePlacedItem, next: { startMin: number; durationMin: number }) => Promise<void>;
}

export const PeriodFocusView: React.FC<PeriodFocusViewProps> = ({
  period,
  language,
  nowMinutes,
  showBackgroundEvents,
  onToggleBackgroundEvents,
  hardLockedBlocks,
  bgItems,
  placedItems,
  optimisticOverrides,
  onBack,
  onSelectActiveItem,
  onCommitDrag,
}) => {
  const viewStart = Math.max(0, period.startMin);
  const viewEnd = Math.min(1440, Math.max(viewStart + 15, period.endMin));
  const gridHeightPx = (viewEnd - viewStart) * FOCUS_PX_PER_MIN;

  const boundaryLocks = useMemo<DayTimelineLockedBlock[]>(() => {
    const bounds: DayTimelineLockedBlock[] = [...hardLockedBlocks];
    if (viewStart > 0) {
      bounds.push({ id: 'focus_start', kind: 'prayer', titleAr: '', emoji: '', startMin: 0, endMin: viewStart, durationMin: viewStart, isLocked: true });
    }
    if (viewEnd < 1440) {
      bounds.push({ id: 'focus_end', kind: 'prayer', titleAr: '', emoji: '', startMin: viewEnd, endMin: 1440, durationMin: 1440 - viewEnd, isLocked: true });
    }
    return bounds;
  }, [hardLockedBlocks, viewStart, viewEnd]);

  const { dragState, startMove, startResize, handlePointerMove, handlePointerEnd, consumeClickAllowed } =
    useTimelineDrag({ lockedBlocks: boundaryLocks, pxPerMin: FOCUS_PX_PER_MIN, onCommitDrag });

  const ticks = useMemo(() => {
    const out: number[] = [];
    const first = Math.ceil(viewStart / 15) * 15;
    for (let m = first; m <= viewEnd; m += 15) out.push(m);
    return out;
  }, [viewStart, viewEnd]);

  const bgSlices = useMemo(
    () =>
      showBackgroundEvents
        ? bgItems.filter((b) => b.endMin > viewStart && b.startMin < viewEnd).map((b) => {
            const s = Math.max(viewStart, b.startMin);
            const e = Math.min(viewEnd, b.endMin);
            return { key: `fbg-${b.id}`, item: b, topPx: (s - viewStart) * FOCUS_PX_PER_MIN, heightPx: Math.max(24, (e - s) * FOCUS_PX_PER_MIN), startMin: s, endMin: e };
          })
        : [],
    [showBackgroundEvents, bgItems, viewStart, viewEnd]
  );

  const activeSlices = useMemo(
    () =>
      placedItems
        .map((item) => {
          const ov = optimisticOverrides[item.id];
          const startMin = ov ? ov.startMin : item.startMin;
          const durationMin = ov ? ov.durationMin : item.durationMin;
          const endMin = startMin + durationMin;
          return ov ? { ...item, startMin, endMin, durationMin } : item;
        })
        .filter((item) => item.endMin > viewStart && item.startMin < viewEnd)
        .map((item) => {
          const s = Math.max(viewStart, item.startMin);
          const e = Math.min(viewEnd, item.endMin);
          const topPx = (s - viewStart) * FOCUS_PX_PER_MIN;
          const heightPx = Math.max(MIN_FOCUS_BLOCK_PX, Math.min(gridHeightPx - topPx, (e - s) * FOCUS_PX_PER_MIN));
          return { key: `f-${item.id}`, item, topPx, heightPx };
        }),
    [placedItems, optimisticOverrides, viewStart, viewEnd, gridHeightPx]
  );

  const clampedNow = ((Math.round(nowMinutes) % 1440) + 1440) % 1440;
  const showNow = clampedNow >= viewStart && clampedNow <= viewEnd;
  const rangeText = `${formatMinutes12h(viewStart, language)} – ${formatMinutes12h(viewEnd, language)}`;

  return (
    <section dir="rtl" aria-label={period.label} className="rounded-2xl border border-white/10 bg-[#000000] overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#060E0C] px-3.5 py-2.5 text-[11px]">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-lg border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 px-2.5 py-1 font-semibold text-[#7FFFD4] hover:bg-[#7FFFD4]/20 transition-colors cursor-pointer"
          >
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            <span>{language === 'ar' ? 'العودة لليوم كامل' : 'Full Day'}</span>
          </button>
          <div className="min-w-0">
            <div className="truncate font-semibold text-zinc-100">{period.label}</div>
            <div className="font-mono-tabular text-[10px] text-zinc-400">{rangeText}</div>
          </div>
        </div>
        <button
          type="button"
          aria-pressed={showBackgroundEvents}
          onClick={onToggleBackgroundEvents}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
            showBackgroundEvents
              ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/15 text-[#7FFFD4]'
              : 'border-white/15 bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <span>{language === 'ar' ? 'إظهار مواعيد النظام المخفية' : 'System items'}</span>
        </button>
      </header>

      <div className="relative flex bg-[#000000] px-2 py-4">
        <div className="relative w-14 shrink-0 select-none" style={{ height: `${gridHeightPx}px` }}>
          {ticks.map((m) => (
            <div key={m} style={{ top: `${(m - viewStart) * FOCUS_PX_PER_MIN}px` }} className="absolute inset-x-0 flex items-start justify-end pl-2">
              <span className="-translate-y-2 font-mono-tabular text-[10px] text-zinc-500">
                {formatMinutes12h(m, language)}
              </span>
            </div>
          ))}
        </div>

        <div className="relative flex-1 border-r border-white/10" style={{ height: `${gridHeightPx}px` }}>
          {ticks.map((m) => (
            <div
              key={m}
              style={{ top: `${(m - viewStart) * FOCUS_PX_PER_MIN}px` }}
              className={`pointer-events-none absolute inset-x-0 border-t ${m % 60 === 0 ? 'border-white/[0.08]' : 'border-dashed border-white/[0.035]'}`}
            />
          ))}

          {bgSlices.map((sl) => (
            <TimeBlockCard key={sl.key} variant="background" item={sl.item} topPx={sl.topPx} heightPx={sl.heightPx} language={language} isNow={clampedNow >= sl.startMin && clampedNow < sl.endMin} />
          ))}

          {activeSlices.map((sl) => (
            <TimeBlockCard
              key={sl.key}
              variant="active"
              item={sl.item}
              topPx={sl.topPx}
              heightPx={sl.heightPx}
              language={language}
              isNow={clampedNow >= sl.item.startMin && clampedNow < sl.item.endMin}
              isDragging={Boolean(dragState?.hasMoved && dragState.item.id === sl.item.id)}
              onSelect={(it) => { if (consumeClickAllowed()) onSelectActiveItem?.(it); }}
              onMovePointerDown={startMove}
              onResizePointerDown={startResize}
              onPointerMove={handlePointerMove}
              onPointerEnd={handlePointerEnd}
            />
          ))}

          {dragState?.hasMoved && (() => {
            const topPx = Math.max(0, (dragState.startMin - viewStart) * FOCUS_PX_PER_MIN);
            const heightPx = Math.max(MIN_FOCUS_BLOCK_PX, Math.min(gridHeightPx - topPx, dragState.durationMin * FOCUS_PX_PER_MIN));
            return (
              <div
                style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                className="pointer-events-none absolute inset-x-1 z-50 rounded-xl border-2 border-[#7FFFD4] bg-[#7FFFD4]/15 shadow-[0_0_24px_rgba(127,255,212,0.35)]"
              >
                <div className="absolute right-2 -top-8 inline-flex items-center gap-1.5 rounded-full border border-[#7FFFD4]/60 bg-[#040B09]/95 px-2.5 py-1 font-mono-tabular text-[11px] font-bold text-[#7FFFD4] shadow-lg whitespace-nowrap">
                  <span>{formatMinutes12h(dragState.startMin, language)} – {formatMinutes12h(dragState.startMin + dragState.durationMin, language)}</span>
                  <span className="text-zinc-400">·</span>
                  <span className="text-white">{formatDurationAr(dragState.durationMin)}</span>
                </div>
              </div>
            );
          })()}

          {showNow && (
            <div style={{ top: `${(clampedNow - viewStart) * FOCUS_PX_PER_MIN}px` }} aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-40 flex items-center">
              <span className="h-2.5 w-2.5 -mr-[5px] rounded-full bg-[#7FFFD4] shadow-[0_0_10px_#7FFFD4]" />
              <div className="h-[1.5px] flex-1 bg-[#7FFFD4]/80" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
