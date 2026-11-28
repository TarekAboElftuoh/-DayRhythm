import React from 'react';
import { Plus } from 'lucide-react';
import type { AppLanguage, FreeWindow } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';

interface FreeGapSlotProps {
  gap: FreeWindow;
  topPx: number;
  heightPx: number;
  language: AppLanguage;
  onSelectGap?: (gap: FreeWindow) => void;
}

function formatCompactGapDuration(totalMin: number, language: AppLanguage): string {
  const safe = Math.max(1, Math.round(totalMin));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (language !== 'ar') {
    if (h === 0) return `Free ${m}m`;
    if (m === 0) return `Free ${h}h`;
    return `Free ${h}h ${m}m`;
  }
  if (h === 0) return `فراغ ${m}د`;
  if (m === 0) return `فراغ ${h}س`;
  return `فراغ ${h}س ${m}د`;
}

export const FreeGapSlot: React.FC<FreeGapSlotProps> = ({
  gap,
  topPx,
  heightPx,
  language,
  onSelectGap,
}) => {
  const isCompact = heightPx < 42;
  const label = formatCompactGapDuration(gap.durationMin, language);
  const rangeText = `${formatMinutes12h(gap.startMin, language)} – ${formatMinutes12h(gap.endMin, language)}`;

  return (
    <button
      type="button"
      onClick={() => onSelectGap?.(gap)}
      style={{ top: `${topPx}px`, height: `${heightPx}px` }}
      aria-label={`${label} (${rangeText})`}
      className="group absolute inset-x-1 z-10 flex items-center justify-between gap-2 rounded-xl border border-dashed border-[#7FFFD4]/25 bg-[#030908]/60 px-2.5 text-right transition-colors hover:border-[#7FFFD4]/65 hover:bg-[#7FFFD4]/[0.07] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#7FFFD4] cursor-pointer overflow-hidden"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#7FFFD4]/15 text-[#7FFFD4] transition-transform group-hover:scale-110">
          <Plus className="h-2.5 w-2.5" />
        </span>
        <span className="truncate text-[11px] font-semibold text-[#7FFFD4]/90 group-hover:text-[#7FFFD4]">
          {label}
        </span>
      </div>

      {!isCompact && (
        <span className="shrink-0 font-mono-tabular text-[10px] text-zinc-500 group-hover:text-zinc-300">
          {rangeText}
        </span>
      )}
    </button>
  );
};
