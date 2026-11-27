import React, { useEffect, useMemo, useState } from 'react';
import { X, RotateCcw, Zap, Moon, SkipForward } from 'lucide-react';
import { Drawer } from 'vaul';
import { CatchUpDecision, ScheduleBlock } from '../types/dayrhythm';
import { computeCollisionFreeReflow } from '../engines/scheduleEngine';
import { formatMinutes12h, getNowMinutesInTimeZone } from '../engines/prayerEngine';

function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

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
  const isMobile = useIsMobileViewport();
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

  const renderContent = (headerTitle: React.ReactNode) => (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/[0.06]">
        <div className="min-w-0">
          {headerTitle}
          <p className="text-xs text-zinc-400 mt-0.5">
            رتّب المهام التي فات موعدها الآن ({formatMinutes12h(selectedNowMin, 'ar')}) — مواقيت الصلاة والنوم تبقى ثابتة
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer shrink-0"
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
            className="min-h-[44px] px-3 py-2 rounded-xl border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 text-[#7FFFD4] hover:bg-[#7FFFD4]/18 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Zap className="w-4 h-4 shrink-0" />
            <span>رتّب الباقي تلقائياً الآن</span>
          </button>
          <button
            type="button"
            onClick={() => applyBatchPreset('evening')}
            className="min-h-[44px] px-3 py-2 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] text-zinc-200 hover:bg-white/[0.06] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Moon className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>رحّل المرن للمساء</span>
          </button>
          <button
            type="button"
            onClick={() => applyBatchPreset('skip')}
            className="min-h-[44px] px-3 py-2 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] text-zinc-300 hover:bg-white/[0.06] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <SkipForward className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>تخطّ الفائت واكمل</span>
          </button>
        </div>
      )}

      {/* Overdue List */}
      {overdueTasks.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-6 text-center text-sm text-zinc-400">
          يومك متزن الآن — لا توجد مهام فائتة قبل {formatMinutes12h(selectedNowMin, 'ar')} ✓
        </div>
      ) : (
        <div className="space-y-3">
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
                className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-3.5"
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
                      <div className="font-mono-tabular text-[11px] text-zinc-500">
                        كان {formatMinutes12h(task.startMin, 'ar')} · {task.durationMin} د
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDecision(task.id, 'start_now')}
                    className={`min-h-[44px] px-2 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer ${
                      currentDecision === 'start_now'
                        ? 'bg-[#7FFFD4] text-black'
                        : 'bg-[var(--bg-card)] border border-white/[0.06] text-zinc-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    ابدأ الآن
                  </button>
                  <button
                    type="button"
                    disabled={!task.canShiftEvening}
                    onClick={() => task.canShiftEvening && setDecision(task.id, 'shift_evening')}
                    className={`min-h-[44px] px-2 rounded-xl text-[11px] font-semibold transition-colors ${
                      !task.canShiftEvening
                        ? 'bg-white/[0.02] border border-white/[0.04] text-zinc-600 cursor-not-allowed'
                        : currentDecision === 'shift_evening'
                          ? 'bg-[#7FFFD4]/20 border border-[#7FFFD4]/40 text-[#7FFFD4] cursor-pointer'
                          : 'bg-[var(--bg-card)] border border-white/[0.06] text-zinc-300 hover:bg-white/[0.06] cursor-pointer'
                    }`}
                  >
                    {task.canShiftEvening ? 'للمساء' : 'وقت ثابت'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision(task.id, 'skip_today')}
                    className={`min-h-[44px] px-2 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer ${
                      currentDecision === 'skip_today'
                        ? 'bg-zinc-700 text-white'
                        : 'bg-[var(--bg-card)] border border-white/[0.06] text-zinc-300 hover:bg-white/[0.06]'
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
        <div className="rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-300">
          <span>النتيجة المتوقعة:</span>
          <span className="font-mono-tabular text-[#7FFFD4] font-semibold">
            ضغط {reflowPreview.compressedCount} · ترحيل {reflowPreview.shiftedCount} · تخطي {reflowPreview.skippedCount}
          </span>
        </div>
      )}

      {/* Footer Actions */}
      <div className="pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2.5">
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
          className="min-h-[46px] px-6 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] transition-colors cursor-pointer"
        >
          اعتماد لليوم فقط
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        direction="bottom"
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md" />
          <Drawer.Content
            dir="rtl"
            aria-describedby={undefined}
            aria-label="تدارك اليوم"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-x border-white/[0.08] bg-[var(--bg-card)] text-zinc-100 shadow-2xl outline-none"
          >
            <div className="pt-3 pb-1 flex justify-center shrink-0">
              <Drawer.Handle className="h-1.5 w-11 rounded-full bg-white/20" />
            </div>
            <div className="overflow-y-auto px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {renderContent(
                <Drawer.Title className="text-base font-bold text-white">
                  ⚡ تدارك اليوم ببساطة
                </Drawer.Title>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  if (!isOpen) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-label="تدارك اليوم"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-6 text-zinc-100 shadow-2xl">
        {renderContent(
          <h2 className="text-lg font-bold text-white">⚡ تدارك اليوم ببساطة</h2>
        )}
      </div>
    </div>
  );
};
