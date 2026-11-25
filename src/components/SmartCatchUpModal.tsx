import React, { useEffect, useMemo, useState } from 'react';
import { X, RotateCcw, Zap, Moon, SkipForward } from 'lucide-react';
import { CatchUpDecision, ScheduleBlock } from '../types/dayrhythm';
import { computeCollisionFreeReflow } from '../engines/scheduleEngine';
import { formatMinutes12h, getNowMinutesInTimeZone } from '../engines/prayerEngine';

interface SmartCatchUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  blocks: ScheduleBlock[];
  activeTimeZone?: string;
  hasUndoSnapshot: boolean;
  onCommitReflow: (reflowed: ScheduleBlock[]) => void;
  onUndoToOriginal: () => void;
}

export const SmartCatchUpModal: React.FC<SmartCatchUpModalProps> = ({
  isOpen,
  onClose,
  blocks,
  activeTimeZone = 'Africa/Cairo',
  hasUndoSnapshot,
  onCommitReflow,
  onUndoToOriginal,
}) => {
  const [selectedNowMin, setSelectedNowMin] = useState<number>(() =>
    getNowMinutesInTimeZone(activeTimeZone)
  );
  const [decisions, setDecisions] = useState<Record<string, CatchUpDecision>>({});

  // Refresh to actual current clock whenever opened
  useEffect(() => {
    if (isOpen) {
      setSelectedNowMin(getNowMinutesInTimeZone(activeTimeZone));
      setDecisions({});
    }
  }, [isOpen, activeTimeZone]);

  const overdueTasks = useMemo(
    () =>
      blocks.filter(
        (b) => !b.isAnchor && !b.completed && !b.deleted && b.startMin < selectedNowMin
      ),
    [blocks, selectedNowMin]
  );

  const reflowPreview = useMemo(
    () => computeCollisionFreeReflow(blocks, selectedNowMin, decisions),
    [blocks, selectedNowMin, decisions]
  );

  if (!isOpen) return null;

  const applyBatchPreset = (mode: 'auto' | 'evening' | 'skip') => {
    const next: Record<string, CatchUpDecision> = {};
    for (const task of overdueTasks) {
      if (mode === 'auto') {
        next[task.id] = task.canShiftEvening ? 'shift_evening' : 'start_now';
      } else if (mode === 'evening') {
        next[task.id] = task.canShiftEvening ? 'shift_evening' : 'skip_today';
      } else {
        next[task.id] = 'skip_today';
      }
    }
    setDecisions(next);
  };

  const setDecision = (id: string, d: CatchUpDecision) => {
    setDecisions((prev) => ({ ...prev, [id]: d }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="تدارك اليوم"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#0A0D12] p-5 sm:p-6 text-zinc-100 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">⚡ تدارك اليوم ببساطة</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              رتّب المهام التي فات موعدها الآن ({formatMinutes12h(selectedNowMin, 'ar')}) — مواقيت الصلاة والنوم تبقى ثابتة
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* One-Tap Quick Presets */}
        {overdueTasks.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => applyBatchPreset('auto')}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-[#7FFFD4]/40 bg-[#7FFFD4]/12 text-[#7FFFD4] hover:bg-[#7FFFD4]/20 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Zap className="w-4 h-4 shrink-0" />
              <span>رتّب الباقي تلقائياً الآن</span>
            </button>
            <button
              type="button"
              onClick={() => applyBatchPreset('evening')}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Moon className="w-4 h-4 text-indigo-300 shrink-0" />
              <span>رحّل المرن للمساء</span>
            </button>
            <button
              type="button"
              onClick={() => applyBatchPreset('skip')}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <SkipForward className="w-4 h-4 text-zinc-400 shrink-0" />
              <span>تخطّ الفائت واكمل</span>
            </button>
          </div>
        )}

        {/* Overdue List */}
        {overdueTasks.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6 text-center text-sm text-zinc-400">
            يومك متزن الآن — لا توجد مهام فائتة قبل {formatMinutes12h(selectedNowMin, 'ar')} ✓
          </div>
        ) : (
          <div className="space-y-2.5">
            {overdueTasks.map((task) => {
              const currentDecision = decisions[task.id] ?? 'skip_today';
              const ep = task.emojiPair.trim();
              const rawTitle = task.categoryAr.trim();
              const cleanTitle = rawTitle.startsWith(ep)
                ? rawTitle.slice(ep.length).trim()
                : rawTitle;
              return (
                <div
                  key={task.id}
                  className="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-black/50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-lg shrink-0">{ep}</span>
                      <div className="min-w-0">
                        {cleanTitle && (
                          <div className="text-xs font-semibold text-white truncate">
                            {cleanTitle}
                          </div>
                        )}
                        <div className="font-digits text-[11px] text-zinc-500">
                          كان {formatMinutes12h(task.startMin, 'ar')} · {task.durationMin} د
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDecision(task.id, 'start_now')}
                      className={`min-h-[42px] px-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                        currentDecision === 'start_now'
                          ? 'bg-[#7FFFD4] text-black'
                          : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]'
                      }`}
                    >
                      ابدأ الآن
                    </button>
                    <button
                      type="button"
                      disabled={!task.canShiftEvening}
                      onClick={() => task.canShiftEvening && setDecision(task.id, 'shift_evening')}
                      className={`min-h-[42px] px-2 rounded-lg text-[11px] font-semibold transition-colors ${
                        !task.canShiftEvening
                          ? 'bg-white/[0.02] text-zinc-600 cursor-not-allowed'
                          : currentDecision === 'shift_evening'
                            ? 'bg-indigo-400 text-black cursor-pointer'
                            : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] cursor-pointer'
                      }`}
                    >
                      {task.canShiftEvening ? 'للمساء' : 'وقت ثابت'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecision(task.id, 'skip_today')}
                      className={`min-h-[42px] px-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                        currentDecision === 'skip_today'
                          ? 'bg-zinc-700 text-white'
                          : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]'
                      }`}
                    >
                      تخطّ اليوم
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Concise Summary */}
        {overdueTasks.length > 0 && (
          <div className="rounded-xl border border-white/[0.08] bg-black/50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-300">
            <span>النتيجة المتوقعة:</span>
            <span className="font-digits text-[#7FFFD4] font-semibold">
              ضغط {reflowPreview.compressedCount} · ترحيل {reflowPreview.shiftedCount} · تخطي {reflowPreview.skippedCount}
            </span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5">
          {hasUndoSnapshot ? (
            <button
              type="button"
              onClick={() => {
                onUndoToOriginal();
                onClose();
              }}
              className="min-h-[44px] flex items-center gap-2 px-4 rounded-xl border border-amber-400/40 text-amber-300 text-xs font-semibold hover:bg-amber-400/10 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>استعادة الجدول الأصلي</span>
            </button>
          ) : (
            <span className="text-[11px] text-zinc-500">
              يمكنك التراجع عن التغيير لاحقاً بضغطة واحدة
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              onCommitReflow(reflowPreview.reflowedBlocks);
              onClose();
            }}
            className="min-h-[46px] px-6 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] cursor-pointer"
          >
            اعتماد لليوم فقط
          </button>
        </div>
      </div>
    </div>
  );
};
