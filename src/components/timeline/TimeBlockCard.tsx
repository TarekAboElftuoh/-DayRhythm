import React from 'react';
import { Check, Lock } from 'lucide-react';
import type { AppLanguage } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';
import {
  formatDurationAr,
  type DayTimelineLockedBlock,
  type DayTimelinePlacedItem,
} from '../../engines/lifeRhythmEngine';

type TimeBlockCardProps =
  | {
      variant: 'locked';
      block: DayTimelineLockedBlock;
      topPx: number;
      heightPx: number;
      language: AppLanguage;
      isNow: boolean;
    }
  | {
      variant: 'active';
      item: DayTimelinePlacedItem;
      topPx: number;
      heightPx: number;
      language: AppLanguage;
      isNow: boolean;
      onSelect?: (item: DayTimelinePlacedItem) => void;
    };

const HATCH_PATTERN =
  'repeating-linear-gradient(-45deg, rgba(127,255,212,0.04) 0px, rgba(127,255,212,0.04) 4px, transparent 4px, transparent 10px)';

export const TimeBlockCard: React.FC<TimeBlockCardProps> = (props) => {
  const { topPx, heightPx, language, isNow } = props;
  const isTiny = heightPx < 34;
  const isCompact = heightPx < 54;

  if (props.variant === 'locked') {
    const { block } = props;
    const rangeText = `${formatMinutes12h(block.startMin, language)} – ${formatMinutes12h(block.endMin, language)}`;

    return (
      <div
        style={{
          top: `${topPx}px`,
          height: `${heightPx}px`,
          backgroundImage: HATCH_PATTERN,
        }}
        aria-label={`${block.titleAr} (${rangeText})`}
        className={`pointer-events-none select-none absolute inset-x-1 z-20 flex flex-col justify-center rounded-xl border bg-[#040807]/95 px-2.5 overflow-hidden ${
          isNow ? 'border-[#7FFFD4]/45' : 'border-white/10'
        }`}
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Lock className="h-3 w-3 shrink-0 text-zinc-500" aria-hidden="true" />
            <span className="text-xs leading-none shrink-0" aria-hidden="true">
              {block.emoji}
            </span>
            <span className="truncate text-[11px] font-medium text-zinc-300">
              {block.titleAr}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isTiny && (
              <span className="font-mono-tabular text-[10px] text-zinc-500">
                {formatMinutes12h(block.startMin, language)}
              </span>
            )}
            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 font-mono-tabular text-[9px] text-zinc-400">
              {formatDurationAr(block.durationMin)}
            </span>
          </div>
        </div>

        {!isTiny && (
          <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
            <span className="font-mono-tabular truncate">{rangeText}</span>
            {!isCompact && block.subtitleAr && (
              <span className="truncate text-zinc-600">{block.subtitleAr}</span>
            )}
          </div>
        )}
      </div>
    );
  }

  const { item, onSelect } = props;
  const rangeText = `${formatMinutes12h(item.startMin, language)} – ${formatMinutes12h(item.endMin, language)}`;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      style={{ top: `${topPx}px`, height: `${heightPx}px` }}
      aria-label={`${item.title} (${rangeText})`}
      className={`absolute inset-x-1 z-30 flex flex-col justify-center rounded-xl border border-r-[3px] border-r-[#7FFFD4] bg-[#060E0C] px-2.5 text-right transition-colors overflow-hidden cursor-pointer hover:bg-[#091613] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#7FFFD4] ${
        isNow
          ? 'border-[#7FFFD4]/60 shadow-[0_0_16px_rgba(127,255,212,0.16)]'
          : 'border-[#7FFFD4]/25'
      } ${item.completed ? 'opacity-55' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 min-w-0 w-full">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs leading-none shrink-0" aria-hidden="true">
            {item.emoji}
          </span>
          <span
            className={`truncate text-xs font-semibold ${
              item.completed ? 'line-through text-zinc-400' : 'text-zinc-100'
            }`}
          >
            {item.title}
          </span>
          {item.completed && (
            <Check className="h-3 w-3 shrink-0 text-[#7FFFD4]" aria-hidden="true" />
          )}
        </div>

        <span className="shrink-0 rounded-full border border-[#7FFFD4]/30 bg-[#7FFFD4]/10 px-2 py-0.5 font-mono-tabular text-[10px] font-semibold text-[#7FFFD4]">
          {formatDurationAr(item.durationMin)}
        </span>
      </div>

      {!isTiny && (
        <div className="mt-0.5 flex items-center justify-between gap-2 w-full text-[10px] text-zinc-400">
          <span className="font-mono-tabular truncate">{rangeText}</span>
          {!isCompact && item.subtitleAr && (
            <span className="truncate text-[#7FFFD4]/70">{item.subtitleAr}</span>
          )}
        </div>
      )}
    </button>
  );
};
