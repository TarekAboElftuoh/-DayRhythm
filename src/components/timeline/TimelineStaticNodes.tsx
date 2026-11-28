import React from 'react';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import type { AppLanguage } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';
import {
  formatDurationAr,
  type DayTimelineGhostSlot,
  type DayTimelineLockedBlock,
  type SnapToFreeWindowResult,
} from '../../engines/lifeRhythmEngine';
import { SPRING_SNAPPY, type PlacementTarget } from './types';

export const TimelineGhostNode: React.FC<{
  ghost: DayTimelineGhostSlot;
  language: AppLanguage;
  dragState: { target: PlacementTarget; snapped: SnapToFreeWindowResult | null } | null;
  onSelectGhostSlot: (ghost: DayTimelineGhostSlot) => void;
}> = ({ ghost, language, dragState, onSelectGhostSlot }) => {
  const isSnapTarget =
    Boolean(dragState?.snapped?.snapped) &&
    dragState!.snapped!.startMin >= ghost.startMin &&
    dragState!.snapped!.startMin < ghost.endMin;

  return (
    <motion.div
      key={ghost.id}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={SPRING_SNAPPY}
      className="relative flex items-stretch gap-3"
    >
      <span
        aria-hidden="true"
        className="relative z-10 mt-4 -mr-[19px] sm:-mr-[21px] h-2.5 w-2.5 rounded-full border border-[#7FFFD4] bg-[#7FFFD4]/40 shrink-0"
      />
      <button
        type="button"
        onClick={() => onSelectGhostSlot(ghost)}
        style={{ backgroundColor: 'rgba(127, 255, 212, 0.14)' }}
        className={`flex-1 min-h-[48px] rounded-2xl border px-3.5 py-2.5 text-right flex items-center justify-between gap-3 cursor-pointer transition-all ${
          isSnapTarget
            ? 'border-[#7FFFD4] ring-2 ring-[#7FFFD4]/35 scale-[1.01]'
            : 'border-dashed border-[#7FFFD4]/45 hover:border-[#7FFFD4]'
        }`}
      >
        <div className="min-w-0">
          <div className="text-xs font-bold text-[#7FFFD4] flex items-center gap-1.5">
            <span>✨ {ghost.label}</span>
            <span className="text-[11px] font-normal text-zinc-300">
              ({formatDurationAr(ghost.durationMin)})
            </span>
          </div>
          <div className="font-mono-tabular text-[11px] text-zinc-200 mt-0.5">
            {formatMinutes12h(ghost.startMin, language)} – {formatMinutes12h(ghost.endMin, language)}
          </div>
        </div>
        <span className="shrink-0 rounded-lg bg-[#7FFFD4] text-black px-2.5 py-1 text-[11px] font-bold">
          ضعها هنا
        </span>
      </button>
    </motion.div>
  );
};

export const TimelineLockedNode: React.FC<{
  blk: DayTimelineLockedBlock;
  language: AppLanguage;
  nowMinutes: number;
}> = ({ blk, language, nowMinutes }) => {
  const isNow = nowMinutes >= blk.startMin && nowMinutes < blk.endMin && blk.endMin <= 1440;
  return (
    <div key={blk.id} className="relative flex items-stretch gap-3">
      <span
        aria-hidden="true"
        className={`relative z-10 mt-3.5 -mr-[19px] sm:-mr-[21px] h-2.5 w-2.5 rounded-full border shrink-0 ${
          isNow
            ? 'bg-[#7FFFD4] border-[#7FFFD4] shadow-[0_0_8px_rgba(127,255,212,0.5)]'
            : 'bg-[var(--bg-canvas)] border-zinc-600'
        }`}
      />
      <div
        aria-label={`${blk.titleAr} (وقت محمي غير قابل للتعديل)`}
        className={`flex-1 rounded-2xl border px-3.5 py-2.5 select-none transition-colors ${
          isNow
            ? 'border-[var(--border-active)] bg-[var(--bg-locked)]'
            : 'border-[var(--border-locked)] bg-[var(--bg-locked)] opacity-85'
        }`}
      >
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-lg leading-none shrink-0" aria-hidden="true">
              {blk.emoji}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs sm:text-sm font-semibold text-zinc-300 truncate">
                  {blk.titleAr}
                </span>
                <Lock className="w-3 h-3 text-zinc-500 shrink-0" aria-hidden="true" />
                {isNow && <span className="text-[11px] font-bold text-[#7FFFD4]">· الآن</span>}
              </div>
              <div className="font-mono-tabular text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>
                  {formatMinutes12h(blk.startMin, language)} – {formatMinutes12h(blk.endMin, language)}
                </span>
                <span>· {formatDurationAr(blk.durationMin)}</span>
                {blk.subtitleAr && <span className="text-zinc-500 font-sans">· {blk.subtitleAr}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
