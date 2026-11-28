import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Lock,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { AppLanguage } from '../types/dayrhythm';
import { formatMinutes12h } from '../engines/prayerEngine';
import {
  formatDurationAr,
  type DayTimelineLockedBlock,
  type DayTimelineModel,
  type DayTimelinePlacedItem,
  type DayTimelineUnplacedItem,
} from '../engines/lifeRhythmEngine';

export interface DayTimelineViewProps {
  model: DayTimelineModel;
  language: AppLanguage;
  nowMinutes: number;
  isSyncingAutoPlace?: boolean;
  onToggleBlockComplete: (blockId: string) => void;
  onToggleHabitToday?: (habitId: string) => void;
  onCompleteTask?: (item: DayTimelinePlacedItem) => void;
  onDeleteEventBlock?: (item: DayTimelinePlacedItem) => void;
  onTriggerAlert?: (title: string, emoji: string) => void;
  onConfirmAutoPlace: (items: DayTimelineUnplacedItem[]) => Promise<void> | void;
}

type TimelineNode =
  | { kind: 'locked'; sortMin: number; data: DayTimelineLockedBlock }
  | { kind: 'placed'; sortMin: number; data: DayTimelinePlacedItem };

const SPRING_SNAPPY = { type: 'spring', stiffness: 460, damping: 34 } as const;

export const DayTimelineView: React.FC<DayTimelineViewProps> = ({
  model,
  language,
  nowMinutes,
  isSyncingAutoPlace = false,
  onToggleBlockComplete,
  onToggleHabitToday,
  onCompleteTask,
  onDeleteEventBlock,
  onTriggerAlert,
  onConfirmAutoPlace,
}) => {
  const [confirmSheetOpen, setConfirmSheetOpen] = useState(false);

  const nodes = useMemo<TimelineNode[]>(() => {
    const merged: TimelineNode[] = [
      ...model.lockedBlocks.map((b) => ({
        kind: 'locked' as const,
        sortMin: b.startMin,
        data: b,
      })),
      ...model.placedBlocks.map((p) => ({
        kind: 'placed' as const,
        sortMin: p.startMin,
        data: p,
      })),
    ];
    merged.sort((a, b) => a.sortMin - b.sortMin);
    return merged;
  }, [model.lockedBlocks, model.placedBlocks]);

  const placeableItems = useMemo(
    () => model.unplacedBlocks.filter((item) => item.suggestedSlot !== null),
    [model.unplacedBlocks]
  );

  const handleToggleMovable = (item: DayTimelinePlacedItem) => {
    if (item.kind === 'habit' && item.habitId) {
      onToggleHabitToday?.(item.habitId);
      return;
    }
    if (item.kind === 'task') {
      onCompleteTask?.(item);
      return;
    }
    if (item.scheduleBlockId) {
      onToggleBlockComplete(item.scheduleBlockId);
    }
  };

  const handleApplyAutoPlace = async () => {
    if (placeableItems.length === 0 || isSyncingAutoPlace) return;
    await onConfirmAutoPlace(placeableItems);
    setConfirmSheetOpen(false);
  };

  return (
    <div className="mt-3.5 space-y-4" dir="rtl">
      {/* Minimalist 24h Rhythm Strip (Wake -> Bedtime) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <span aria-hidden="true">☀️</span>
            <span className="text-zinc-500">الاستيقاظ</span>
            <span className="font-mono-tabular font-semibold text-white">
              {formatMinutes12h(model.wakeMin, language)}
            </span>
          </span>
          <span className="text-zinc-600" aria-hidden="true">
            •
          </span>
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <span aria-hidden="true">🛏️</span>
            <span className="text-zinc-500">النوم</span>
            <span className="font-mono-tabular font-semibold text-white">
              {formatMinutes12h(model.bedtimeMin, language)}
            </span>
          </span>
        </div>

        {model.unplacedBlocks.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>تحتاج توظيف</span>
            <span className="font-mono-tabular">· {model.unplacedBlocks.length}</span>
          </span>
        )}
      </div>

      {/* Conflicting / Unplaced Blocks Tray ("تحتاج توظيف") */}
      <AnimatePresence initial={false}>
        {model.unplacedBlocks.length > 0 && (
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
                      {model.unplacedBlocks.length}
                    </span>
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    عناصر متعارضة مع وقت محمي أو بلا نافذة متاحة — لم تُجبر على الجدول.
                  </p>
                </div>
              </div>

              {placeableItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmSheetOpen(true)}
                  disabled={isSyncingAutoPlace}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>وزّعها تلقائياً</span>
                </button>
              )}
            </div>

            <div className="divide-y divide-[var(--border-subtle)]">
              {model.unplacedBlocks.map((item) => (
                <div
                  key={item.id}
                  className="py-2.5 first:pt-1 last:pb-0 flex flex-wrap items-center justify-between gap-2 text-xs"
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
                </div>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Vertical 24h Rhythm Timeline (Structured + Things 3 Minimalism) */}
      <div className="relative pr-4 sm:pr-5 space-y-2.5">
        {/* Continuous vertical hairline */}
        <div
          aria-hidden="true"
          className="absolute right-[7px] sm:right-[9px] top-3 bottom-3 w-px bg-[var(--border-subtle)]"
        />

        {nodes.map((node) => {
          if (node.kind === 'locked') {
            const blk = node.data;
            const isNow =
              nowMinutes >= blk.startMin && nowMinutes < blk.endMin && blk.endMin <= 1440;
            return (
              <div key={blk.id} className="relative flex items-stretch gap-3">
                {/* Timeline dot */}
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
                          <Lock
                            className="w-3 h-3 text-zinc-500 shrink-0"
                            aria-hidden="true"
                          />
                          {isNow && (
                            <span className="text-[11px] font-bold text-[#7FFFD4]">· الآن</span>
                          )}
                        </div>
                        <div className="font-mono-tabular text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>
                            {formatMinutes12h(blk.startMin, language)} –{' '}
                            {formatMinutes12h(blk.endMin, language)}
                          </span>
                          <span>· {formatDurationAr(blk.durationMin)}</span>
                          {blk.subtitleAr && (
                            <span className="text-zinc-500 font-sans">· {blk.subtitleAr}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          const item = node.data;
          const isNow =
            !item.completed && nowMinutes >= item.startMin && nowMinutes < item.endMin;

          return (
            <div key={item.id} className="relative flex items-stretch gap-3">
              <span
                aria-hidden="true"
                className={`relative z-10 mt-4 -mr-[19px] sm:-mr-[21px] h-2.5 w-2.5 rounded-full border shrink-0 transition-colors ${
                  item.completed
                    ? 'bg-[#4ADE80] border-[#4ADE80]'
                    : isNow
                      ? 'bg-[#7FFFD4] border-[#7FFFD4] shadow-[0_0_10px_rgba(127,255,212,0.55)]'
                      : 'bg-[var(--bg-card)] border-[#7FFFD4]/45'
                }`}
              />

              <div
                className={`flex-1 rounded-2xl border px-3 py-2.5 transition-colors flex items-center justify-between gap-2 ${
                  isNow
                    ? 'border-[var(--border-active)] bg-[var(--bg-card-elevated,var(--bg-card))] ring-1 ring-[#7FFFD4]/20'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-active)]'
                } ${item.completed ? 'opacity-55' : ''}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleToggleMovable(item)}
                    aria-label={item.completed ? `إعادة فتح ${item.title}` : `إتمام ${item.title}`}
                    className="min-h-[44px] min-w-[44px] -ms-1 flex items-center justify-center rounded-xl text-zinc-400 hover:text-[#7FFFD4] hover:bg-white/[0.04] cursor-pointer shrink-0 transition-colors"
                  >
                    {item.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-[#4ADE80]" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  <span className="text-lg leading-none shrink-0" aria-hidden="true">
                    {item.emoji}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-sm font-semibold break-words ${
                          item.completed ? 'line-through text-zinc-500' : 'text-zinc-100'
                        }`}
                      >
                        {item.title}
                      </span>
                      {isNow && (
                        <span className="text-[11px] font-bold text-[#4ADE80]">· الآن</span>
                      )}
                    </div>
                    <div className="font-mono-tabular text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[#7FFFD4]/90">
                        {formatMinutes12h(item.startMin, language)} –{' '}
                        {formatMinutes12h(item.endMin, language)}
                      </span>
                      <span className="text-zinc-500">· {formatDurationAr(item.durationMin)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  {onTriggerAlert && (
                    <button
                      type="button"
                      onClick={() => onTriggerAlert(item.title, item.emoji)}
                      aria-label={`تجربة تنبيه ${item.title}`}
                      className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-[#7FFFD4] hover:bg-white/[0.04] cursor-pointer transition-colors"
                      title="تجربة التنبيه"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  )}
                  {item.googleHtmlLink && (
                    <a
                      href={item.googleHtmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`فتح ${item.title} في Google Calendar`}
                      className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-[#4ADE80] hover:bg-white/[0.04] transition-colors"
                      title="فتح في Google Calendar"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  {item.kind === 'event' && onDeleteEventBlock && (
                    <button
                      type="button"
                      onClick={() => onDeleteEventBlock(item)}
                      aria-label={`حذف ${item.title}`}
                      className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Emil-Kowalski Spring Bottom Sheet Confirmation for "وزّعها تلقائياً" */}
      <AnimatePresence>
        {confirmSheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
            onClick={() => !isSyncingAutoPlace && setConfirmSheetOpen(false)}
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
                  onClick={() => setConfirmSheetOpen(false)}
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
                  onClick={() => void handleApplyAutoPlace()}
                  disabled={isSyncingAutoPlace}
                  className="flex-1 min-h-[44px] rounded-xl bg-[#7FFFD4] text-black text-xs sm:text-sm font-bold hover:bg-[#66eec2] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSyncingAutoPlace ? 'جارٍ التوزيع...' : 'تأكيد التوزيع'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmSheetOpen(false)}
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
    </div>
  );
};
