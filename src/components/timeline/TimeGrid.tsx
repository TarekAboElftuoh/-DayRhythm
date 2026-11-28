import React, { useMemo } from 'react';
import type { AppLanguage, FreeWindow } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';
import type {
  DayTimelineLockedBlock,
  DayTimelineModel,
  DayTimelinePlacedItem,
} from '../../engines/lifeRhythmEngine';
import { FreeGapSlot } from './FreeGapSlot';
import { TimeBlockCard } from './TimeBlockCard';

const MINUTES_PER_DAY = 24 * 60;
const PX_PER_HOUR = 64;
const PX_PER_MIN = PX_PER_HOUR / 60;
const GRID_HEIGHT_PX = 24 * PX_PER_HOUR;
const MIN_BLOCK_PX = 26;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

interface TimeGridProps {
  model: DayTimelineModel;
  language: AppLanguage;
  nowMinutes: number;
  onSelectFreeGap?: (gap: FreeWindow) => void;
  onSelectActiveItem?: (item: DayTimelinePlacedItem) => void;
}

interface PositionedSlice<T> {
  key: string;
  data: T;
  topPx: number;
  heightPx: number;
  startMin: number;
  endMin: number;
}

function formatHourRulerLabel(hour24: number, language: AppLanguage): string {
  const period = language === 'en' ? (hour24 >= 12 ? 'PM' : 'AM') : hour24 >= 12 ? 'م' : 'ص';
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${h12} ${period}`;
}

function clampToDaySlices<T>(
  rawStart: number,
  rawEnd: number,
  id: string,
  data: T,
  minPx: number
): PositionedSlice<T>[] {
  const duration = Math.max(1, rawEnd - rawStart);
  const start = ((rawStart % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const end = start + duration;

  if (end <= MINUTES_PER_DAY) {
    const heightPx = Math.max(minPx, Math.min(GRID_HEIGHT_PX - start * PX_PER_MIN, duration * PX_PER_MIN));
    return [{ key: id, data, topPx: start * PX_PER_MIN, heightPx, startMin: start, endMin: end }];
  }

  const firstDur = MINUTES_PER_DAY - start;
  const secondDur = Math.min(MINUTES_PER_DAY, end - MINUTES_PER_DAY);
  const slices: PositionedSlice<T>[] = [
    {
      key: `${id}-p1`,
      data,
      topPx: start * PX_PER_MIN,
      heightPx: Math.max(minPx, firstDur * PX_PER_MIN),
      startMin: start,
      endMin: MINUTES_PER_DAY,
    },
  ];
  if (secondDur > 0) {
    slices.push({
      key: `${id}-p2`,
      data,
      topPx: 0,
      heightPx: Math.max(minPx, secondDur * PX_PER_MIN),
      startMin: 0,
      endMin: secondDur,
    });
  }
  return slices;
}

export const TimeGrid: React.FC<TimeGridProps> = ({
  model,
  language,
  nowMinutes,
  onSelectFreeGap,
  onSelectActiveItem,
}) => {
  const clampedNow = ((Math.round(nowMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const nowTopPx = clampedNow * PX_PER_MIN;

  const lockedSlices = useMemo(
    () =>
      model.lockedBlocks.flatMap((blk) =>
        clampToDaySlices<DayTimelineLockedBlock>(blk.startMin, blk.endMin, blk.id, blk, MIN_BLOCK_PX)
      ),
    [model.lockedBlocks]
  );

  const activeSlices = useMemo(
    () =>
      model.placedBlocks.flatMap((item) =>
        clampToDaySlices<DayTimelinePlacedItem>(item.startMin, item.endMin, item.id, item, MIN_BLOCK_PX)
      ),
    [model.placedBlocks]
  );

  const gapSlices = useMemo(
    () =>
      model.freeWindows.flatMap((gap, idx) =>
        clampToDaySlices<FreeWindow>(
          gap.startMin,
          gap.endMin,
          `gap-${gap.startMin}-${gap.endMin}-${idx}`,
          gap,
          24
        )
      ),
    [model.freeWindows]
  );

  return (
    <section
      dir="rtl"
      aria-label={language === 'ar' ? 'الشبكة الزمنية ٢٤ ساعة' : '24h Time Grid'}
      className="rounded-2xl border border-white/10 bg-[#000000] overflow-hidden"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#060E0C] px-3.5 py-2.5 text-[11px]">
        <span className="font-semibold text-zinc-200">
          {language === 'ar' ? 'المخطط الزمني (٢٤ ساعة)' : '24h Time Grid'}
        </span>
        <div className="flex items-center gap-3 text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-white/20 bg-[#040807]" />
            <span>{language === 'ar' ? 'مقفل' : 'Locked'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-[#7FFFD4]/40 bg-[#060E0C]" />
            <span>{language === 'ar' ? 'نشط' : 'Active'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[#7FFFD4]/50 bg-[#030908]" />
            <span>{language === 'ar' ? 'فراغ' : 'Free'}</span>
          </span>
        </div>
      </header>

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
              onSelect={onSelectActiveItem}
            />
          ))}

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
