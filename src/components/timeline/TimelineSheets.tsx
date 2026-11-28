import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, Repeat, Sparkles, X } from 'lucide-react';
import type { AppLanguage } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';
import {
  DYNAMIC_HABIT_ANCHOR_LABELS,
  type DayTimelineUnplacedItem,
} from '../../engines/lifeRhythmEngine';
import { SPRING_SNAPPY, type PendingMoveConfirmation } from './types';

export const TimelineSheets: React.FC<{
  language: AppLanguage;
  pendingMove: PendingMoveConfirmation | null;
  isApplyingMove: boolean;
  onClosePendingMove: () => void;
  onCommitPendingMove: (scope: 'today' | 'permanent') => Promise<void>;
  confirmSheetOpen: boolean;
  isSyncingAutoPlace: boolean;
  placeableItems: DayTimelineUnplacedItem[];
  onCloseAutoPlace: () => void;
  onApplyAutoPlace: () => Promise<void>;
}> = ({
  language,
  pendingMove,
  isApplyingMove,
  onClosePendingMove,
  onCommitPendingMove,
  confirmSheetOpen,
  isSyncingAutoPlace,
  placeableItems,
  onCloseAutoPlace,
  onApplyAutoPlace,
}) => (
  <>
    <AnimatePresence>
      {pendingMove && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => !isApplyingMove && onClosePendingMove()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="scope-confirm-sheet-title"
            dir="rtl"
            initial={{ y: 36, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 28, opacity: 0, scale: 0.98 }}
            transition={SPRING_SNAPPY}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-[var(--border-active)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4 shadow-2xl"
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto sm:hidden" aria-hidden="true" />

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 id="scope-confirm-sheet-title" className="text-sm font-bold text-white truncate">
                  نقل «{pendingMove.target.title}»
                </h3>
                <div className="font-mono-tabular text-xs text-[#7FFFD4] mt-0.5">
                  {formatMinutes12h(pendingMove.startMin, language)} –{' '}
                  {formatMinutes12h(pendingMove.endMin, language)} · {pendingMove.windowLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={onClosePendingMove}
                disabled={isApplyingMove}
                aria-label="إغلاق"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {pendingMove.target.kind === 'habit' && pendingMove.target.habit ? (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => void onCommitPendingMove('today')}
                  disabled={isApplyingMove}
                  className="w-full min-h-[52px] rounded-xl border border-[var(--border-active)] bg-[#7FFFD4]/12 hover:bg-[#7FFFD4]/20 px-4 py-2.5 text-right flex items-center justify-between gap-3 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CalendarClock className="w-4 h-4 text-[#7FFFD4] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-white">اليوم فقط</div>
                      <div className="text-[11px] text-zinc-400 truncate">
                        تعديل استثنائي لليوم مع بقاء المرتكز الدائم كما هو
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => void onCommitPendingMove('permanent')}
                  disabled={isApplyingMove}
                  className="w-full min-h-[52px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-active)] px-4 py-2.5 text-right flex items-center justify-between gap-3 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Repeat className="w-4 h-4 text-[#4ADE80] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-white">
                        تعديل دائم ديناميكي
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate">
                        تغيير المرتكز إلى «
                        {DYNAMIC_HABIT_ANCHOR_LABELS[pendingMove.suggestedAnchor].labelAr}» ليتكيّف
                        عبر الفصول
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void onCommitPendingMove('today')}
                disabled={isApplyingMove}
                className="w-full min-h-[44px] rounded-xl bg-[#7FFFD4] text-black text-xs sm:text-sm font-bold hover:bg-[#66eec2] cursor-pointer disabled:opacity-50"
              >
                {isApplyingMove ? 'جارٍ الحفظ...' : 'تأكيد النقل'}
              </button>
            )}

            <button
              type="button"
              onClick={onClosePendingMove}
              disabled={isApplyingMove}
              className="w-full min-h-[44px] rounded-xl border border-[var(--border-subtle)] text-zinc-300 text-xs sm:text-sm font-medium hover:text-white cursor-pointer"
            >
              إلغاء
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    <AnimatePresence>
      {confirmSheetOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => !isSyncingAutoPlace && onCloseAutoPlace()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="auto-place-sheet-title"
            dir="rtl"
            initial={{ y: 36, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 28, opacity: 0, scale: 0.98 }}
            transition={SPRING_SNAPPY}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-active)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4 shadow-2xl"
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto sm:hidden" aria-hidden="true" />

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#7FFFD4]" />
                <h3 id="auto-place-sheet-title" className="text-sm font-bold text-white">
                  تأكيد التوزيع العلمي التلقائي
                </h3>
              </div>
              <button
                type="button"
                onClick={onCloseAutoPlace}
                disabled={isSyncingAutoPlace}
                aria-label="إغلاق"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              سيتم وضع العناصر في أنسب نوافذ الفراغ العلمية بعيداً عن الصلاة والنوم والسحور والقيلولة:
            </p>

            <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3">
              {placeableItems.map((item) => (
                <div key={`plan-${item.id}`} className="py-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white truncate">
                      {item.emoji} {item.title}
                    </span>
                    {item.suggestedSlot && (
                      <span className="font-mono-tabular text-[#7FFFD4] font-semibold shrink-0">
                        {formatMinutes12h(item.suggestedSlot.startMin, language)} –{' '}
                        {formatMinutes12h(item.suggestedSlot.endMin, language)}
                      </span>
                    )}
                  </div>
                  {item.suggestedSlot && (
                    <div className="text-[11px] text-zinc-400">
                      {item.suggestedSlot.scientificNoteAr}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void onApplyAutoPlace()}
                disabled={isSyncingAutoPlace}
                className="flex-1 min-h-[44px] rounded-xl bg-[#7FFFD4] text-black text-xs sm:text-sm font-bold hover:bg-[#66eec2] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                {isSyncingAutoPlace ? 'جارٍ التوزيع...' : 'تأكيد التوزيع'}
              </button>
              <button
                type="button"
                onClick={onCloseAutoPlace}
                disabled={isSyncingAutoPlace}
                className="min-h-[44px] px-4 rounded-xl border border-[var(--border-subtle)] text-zinc-300 text-xs sm:text-sm font-medium hover:text-white cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  </>
);
