import React, { useMemo } from 'react';
import type { AppLanguage } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';
import type { DayTimelineModel } from '../../engines/lifeRhythmEngine';
import { TimeBlockCard } from './TimeBlockCard';
import { FreeGapSlot } from './FreeGapSlot';

const MINUTES_IN_DAY = 1440;
const PX_PER_MINUTE = 1.05;
const GRID_HEIGHT = MINUTES_IN_DAY * PX_PER_MINUTE;
const RULER_WIDTH = 54;
const MIN_GAP_MINUTES = 15;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export interface TimeGridProps {
  model: DayTimelineModel;
  language: AppLanguage;
  nowMinutes: number;
  canPlace: boolean;
  selectedId?: string | null;
  onPlaceInGap?: (startMin: number) => void;
  onSelectBlock?: (id: string) => void;
}

const clampTop = (startMin: number) => Math.max(0, Math.min(MINUTES_IN_DAY, startMin)) * PX_PER_MINUTE;
const blockHeight = (durationMin: number) => Math.max(22, durationMin * PX_PER_MINUTE);

export const TimeGrid: React.FC<TimeGridProps> = ({
  model,
  language,
  nowMinutes,
  canPlace,
  selectedId = null,
  onPlaceInGap,
  onSelectBlock,
}) => {
  const gaps = useMemo(
    () => model.freeWindows.filter((w) => w.durationMin >= MIN_GAP_MINUTES && w.startMin < MINUTES_IN_DAY),
    [model.freeWindows]
  );

  return (
    <section aria-label="الشبكة الزمنية النسبية ليوم كامل" className="rounded-xl border border-[var(--border-subtle)] bg-black">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
        <span className="text-[11px] font-semibold text-zinc-300">شبكة 24 ساعة · نسبية</span>
        <div className="flex items-center gap-2.5 text-[10px] text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm border border-white/20 bg-[#060E0C]" aria-hidden="true" />
            محمي
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm border border-[#7FFFD4]/70 bg-[#7FFFD4]/25" aria-hidden="true" />
            مهمة/عادة
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm border border-dashed border-[#7FFFD4]/50" aria-hidden="true" />
            فراغ
          </span>
        </div>
      </div>

      <div dir="rtl" className="relative max-h-[72vh] overflow-y-auto overflow-x-hidden">
        <div className="relative" style={{ height: GRID_HEIGHT }}>
          {HOURS.map((hour) => (
            <div
              key={hour}
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-white/[0.055]"
              style={{ top: hour * 60 * PX_PER_MINUTE }}
            >
              <span
                className="absolute font-mono-tabular text-[10px] text-zinc-600"
                style={{ right: 8, top: -7, width: RULER_WIDTH - 12, textAlign: 'right' }}
              >
                {formatMinutes12h(hour * 60, language)}
              </span>
            </div>
          ))}

          {gaps.map((gap) => (
            <div
              key={`gap-${gap.startMin}-${gap.endMin}`}
              className="absolute z-[1]"
              style={{
                top: clampTop(gap.startMin),
                height: blockHeight(gap.endMin - gap.startMin),
                right: RULER_WIDTH,
                left: 6,
              }}
            >
              <FreeGapSlot
                startMin={gap.startMin}
                endMin={gap.endMin}
                durationMin={gap.durationMin}
                language={language}
                canPlace={canPlace}
                onPlace={(startMin) => onPlaceInGap?.(startMin)}
              />
            </div>
          ))}

          {model.lockedBlocks.map((block) => (
            <div
              key={block.id}
              className="absolute z-[2]"
              style={{
                top: clampTop(block.startMin),
                height: blockHeight(block.durationMin),
                right: RULER_WIDTH,
                left: 6,
              }}
            >
              <TimeBlockCard
                variant="locked"
                title={block.titleAr}
                emoji={block.emoji}
                startMin={block.startMin}
                endMin={block.endMin}
                durationMin={block.durationMin}
                language={language}
                subtitleAr={block.subtitleAr}
                lockedKind={block.kind}
                isNow={nowMinutes >= block.startMin && nowMinutes < block.endMin}
              />
            </div>
          ))}

          {model.placedBlocks.map((item) => (
            <div
              key={item.id}
              className="absolute z-[3]"
              style={{
                top: clampTop(item.startMin),
                height: blockHeight(item.durationMin),
                right: RULER_WIDTH,
                left: 6,
              }}
            >
              <TimeBlockCard
                variant="active"
                title={item.title}
                emoji={item.emoji}
                startMin={item.startMin}
                endMin={item.endMin}
                durationMin={item.durationMin}
                language={language}
                subtitleAr={item.subtitleAr}
                completed={item.completed}
                isSelected={selectedId === item.id}
                isNow={nowMinutes >= item.startMin && nowMinutes < item.endMin}
                onClick={onSelectBlock ? () => onSelectBlock(item.id) : undefined}
              />
            </div>
          ))}

          {nowMinutes > 0 && nowMinutes < MINUTES_IN_DAY && (
            <div
              className="pointer-events-none absolute inset-x-0 z-[4]"
              style={{ top: nowMinutes * PX_PER_MINUTE }}
              aria-hidden="true"
            >
              <div className="h-px bg-[#7FFFD4]/70" />
              <div className="absolute right-1 -top-1 h-2 w-2 rounded-full bg-[#7FFFD4] shadow-[0_0_8px_rgba(127,255,212,0.8)]" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
