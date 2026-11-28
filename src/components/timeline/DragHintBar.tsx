import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Magnet } from 'lucide-react';
import type { AppLanguage } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';
import type { SnapToFreeWindowResult } from '../../engines/lifeRhythmEngine';
import { SPRING_SNAPPY, type PlacementTarget } from './types';

export const DragHintBar: React.FC<{
  placementTarget: PlacementTarget | null;
  activeGhostOwner: PlacementTarget | null;
  snapped: SnapToFreeWindowResult | null;
  language: AppLanguage;
  onClear: () => void;
}> = ({ placementTarget, activeGhostOwner, snapped, language, onClear }) => (
  <AnimatePresence initial={false}>
    {(placementTarget || activeGhostOwner) && (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={SPRING_SNAPPY}
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-active)] bg-[rgba(127,255,212,0.10)] px-3.5 py-2 text-xs"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Magnet className="w-4 h-4 text-[#7FFFD4] shrink-0" />
          {snapped?.snapped ? (
            <span className="text-zinc-100 font-medium truncate">
              يتجاذب «{activeGhostOwner?.title}» إلى{' '}
              <span className="font-mono-tabular font-bold text-[#7FFFD4]">
                {formatMinutes12h(snapped.startMin, language)} – {formatMinutes12h(snapped.endMin, language)}
              </span>
            </span>
          ) : (
            <span className="text-zinc-100 font-medium truncate">
              اختر نافذة فراغ مضيئة لـ «{activeGhostOwner?.title}»
            </span>
          )}
        </div>
        {placementTarget && (
          <button
            type="button"
            onClick={onClear}
            className="min-h-[44px] sm:min-h-[34px] px-3 rounded-lg border border-white/15 text-zinc-200 hover:text-white text-xs font-medium cursor-pointer shrink-0"
          >
            إلغاء
          </button>
        )}
      </motion.div>
    )}
  </AnimatePresence>
);
