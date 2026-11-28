import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Sparkles } from 'lucide-react';
import type { AppLanguage } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';
import type { DayTimelineUnplacedItem } from '../../engines/lifeRhythmEngine';
import { SPRING_SNAPPY, toPlacementTargetFromUnplaced, type PlacementTarget } from './types';

export const UnplacedTray: React.FC<{
  unplacedBlocks: DayTimelineUnplacedItem[];
  placeableCount: number;
  placementTarget: PlacementTarget | null;
  language: AppLanguage;
  isSyncingAutoPlace: boolean;
  onSelectTarget: (updater: (prev: PlacementTarget | null) => PlacementTarget | null) => void;
  onOpenAutoPlaceSheet: () => void;
}> = ({
  unplacedBlocks,
  placeableCount,
  placementTarget,
  language,
  isSyncingAutoPlace,
  onSelectTarget,
  onOpenAutoPlaceSheet,
}) => (
  <AnimatePresence initial={false}>
    {unplacedBlocks.length > 0 && (
      <motion.section
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={SPRING_SNAPPY}
        aria-label="مهام وعادات تحتاج توظيف"
        className="rounded-2xl border border-amber-400/25 bg-[var(--bg-card)] p-3.5 sm:p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                <span>تحتاج توظيف</span>
                <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[11px] font-mono-tabular text-amber-300">
                  {unplacedBlocks.length}
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">
                اضغط على أي عنصر لاختيار نافذة فراغ، أو وزّعها تلقائياً.
              </p>
            </div>
          </div>

          {placeableCount > 0 && (
            <button
              type="button"
              onClick={onOpenAutoPlaceSheet}
              disabled={isSyncingAutoPlace}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>وزّعها تلقائياً</span>
            </button>
          )}
        </div>

        <div className="divide-y divide-[var(--border-subtle)]">
          {unplacedBlocks.map((item) => {
            const isSelected = placementTarget?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  onSelectTarget((prev) =>
                    prev?.id === item.id ? null : toPlacementTargetFromUnplaced(item)
                  )
                }
                className={`w-full min-h-[44px] py-2.5 px-2 -mx-2 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-right cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[rgba(127,255,212,0.14)] ring-1 ring-[#7FFFD4]/45'
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-zinc-100 truncate">{item.title}</div>
                    <div className="text-[11px] text-amber-300/90 mt-0.5">
                      {item.conflictReasonAr}
                    </div>
                  </div>
                </div>
                <div className="font-mono-tabular text-[11px] shrink-0 text-left">
                  {item.suggestedSlot ? (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-[#7FFFD4]/25 bg-[#7FFFD4]/10 px-2 py-1 text-[#7FFFD4] font-medium">
                      <span>المقترح:</span>
                      <span>{formatMinutes12h(item.suggestedSlot.startMin, language)}</span>
                    </span>
                  ) : (
                    <span className="text-zinc-500">لا توجد نافذة اليوم</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </motion.section>
    )}
  </AnimatePresence>
);
