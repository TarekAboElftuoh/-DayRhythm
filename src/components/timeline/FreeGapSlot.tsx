import React from 'react';
import { Plus } from 'lucide-react';
import type { AppLanguage } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';
import { formatDurationAr } from '../../engines/lifeRhythmEngine';

export interface FreeGapSlotProps {
  startMin: number;
  endMin: number;
  durationMin: number;
  language: AppLanguage;
  canPlace: boolean;
  onPlace: (startMin: number) => void;
}

export const FreeGapSlot: React.FC<FreeGapSlotProps> = ({
  startMin,
  endMin,
  durationMin,
  language,
  canPlace,
  onPlace,
}) => (
  <button
    type="button"
    data-layer="free-gap"
    onClick={() => onPlace(startMin)}
    aria-label={`فراغ ${formatDurationAr(durationMin)} — أضف مهمة هنا`}
    disabled={!canPlace}
    className={`group h-full w-full rounded-lg border border-dashed px-2 py-1 text-right transition-colors ${
      canPlace
        ? 'border-[#7FFFD4]/30 bg-[#7FFFD4]/[0.035] hover:border-[#7FFFD4]/70 hover:bg-[#7FFFD4]/[0.08] cursor-pointer'
        : 'border-white/[0.07] bg-white/[0.012] cursor-default'
    }`}
  >
    <div className="flex items-center justify-between gap-1.5 min-w-0">
      <span
        className={`text-[11px] font-semibold truncate ${
          canPlace ? 'text-[#7FFFD4]/85' : 'text-zinc-500'
        }`}
      >
        فراغ {formatDurationAr(durationMin)}
      </span>
      <Plus
        className={`w-3 h-3 shrink-0 ${canPlace ? 'text-[#7FFFD4]/70 group-hover:text-[#7FFFD4]' : 'text-zinc-600'}`}
        aria-hidden="true"
      />
    </div>
    <div className="font-mono-tabular text-[10px] text-zinc-500 truncate">
      {formatMinutes12h(startMin, language)} – {formatMinutes12h(endMin, language)}
    </div>
  </button>
);
