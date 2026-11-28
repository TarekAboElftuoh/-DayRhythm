import React from 'react';
import { Lock } from 'lucide-react';
import type { AppLanguage, DynamicHabitAnchor } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';
import { formatDurationAr, type DayTimelineLockedBlock, type DayTimelinePlacedItem } from '../../engines/lifeRhythmEngine';

export interface TimeBlockCardProps {
  variant: 'locked' | 'active';
  title: string;
  emoji: string;
  startMin: number;
  endMin: number;
  durationMin: number;
  language: AppLanguage;
  subtitleAr?: string;
  isNow?: boolean;
  completed?: boolean;
  isSelected?: boolean;
  lockedKind?: DayTimelineLockedBlock['kind'];
  anchor?: DynamicHabitAnchor;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

const HATCHED_BACKGROUND =
  'repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 7px), #060E0C';

export const TimeBlockCard: React.FC<TimeBlockCardProps> = ({
  variant,
  title,
  emoji,
  startMin,
  endMin,
  durationMin,
  language,
  subtitleAr,
  isNow = false,
  completed = false,
  isSelected = false,
  lockedKind,
  onClick,
  onDoubleClick,
}) => {
  const compact = durationMin < 40;

  if (variant === 'locked') {
    return (
      <div
        aria-label={`${title} · وقت محمي غير قابل للتحريك`}
        data-layer="locked"
        data-locked-kind={lockedKind}
        style={{ backgroundImage: HATCHED_BACKGROUND }}
        className={`h-full w-full overflow-hidden rounded-lg border px-2 py-1 select-none ${
          isNow ? 'border-[#7FFFD4]/45' : 'border-white/[0.07]'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 text-zinc-400">
          <span aria-hidden="true" className="text-[11px] leading-none shrink-0">
            {emoji}
          </span>
          <span className="text-[11px] font-semibold truncate text-zinc-300/90">{title}</span>
          <Lock className="w-2.5 h-2.5 shrink-0 text-zinc-600" aria-hidden="true" />
          {!compact && (
            <span className="font-mono-tabular text-[10px] text-zinc-500 shrink-0">
              {formatMinutes12h(startMin, language)}
            </span>
          )}
        </div>
        {!compact && subtitleAr && (
          <div className="text-[10px] text-zinc-600 truncate mt-0.5">{subtitleAr}</div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-current={isNow ? 'true' : undefined}
      data-layer="active"
      className={`h-full w-full overflow-hidden rounded-xl border bg-[#060E0C] text-right px-2 py-1 flex flex-col justify-center gap-0.5 cursor-pointer transition-colors ${
        isSelected
          ? 'border-[#7FFFD4] ring-1 ring-[#7FFFD4]/40'
          : isNow
            ? 'border-[#7FFFD4]/70 shadow-[0_0_14px_rgba(127,255,212,0.18)]'
            : 'border-white/[0.08] hover:border-[#7FFFD4]/50'
      } ${completed ? 'opacity-55' : ''}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span aria-hidden="true" className="text-xs leading-none shrink-0">
          {emoji}
        </span>
        <span
          className={`text-[12px] font-semibold truncate ${
            completed ? 'line-through text-zinc-500' : 'text-zinc-100'
          }`}
        >
          {title}
        </span>
        {isNow && <span className="text-[10px] font-bold text-[#4ADE80] shrink-0">الآن</span>}
      </div>
      {!compact && (
        <div className="flex items-center gap-1.5 flex-wrap font-mono-tabular text-[10px]">
          <span className="text-[#7FFFD4]/90">
            {formatMinutes12h(startMin, language)} – {formatMinutes12h(endMin, language)}
          </span>
          <span className="rounded-full border border-[#7FFFD4]/30 bg-[#7FFFD4]/10 px-1.5 text-[9px] text-[#7FFFD4]">
            {formatDurationAr(durationMin)}
          </span>
        </div>
      )}
    </button>
  );
};

export type TimeBlockSource = DayTimelineLockedBlock | DayTimelinePlacedItem;
