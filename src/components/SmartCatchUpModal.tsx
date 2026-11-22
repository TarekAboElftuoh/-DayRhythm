import React, { useMemo, useState } from 'react';
import { X, RotateCcw, ArrowLeftRight } from 'lucide-react';
import { CatchUpDecision, ScheduleBlock } from '../types/dayrhythm';
import { computeCollisionFreeReflow } from '../engines/scheduleEngine';
import { formatMinutes12h } from '../engines/prayerEngine';

interface SmartCatchUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  blocks: ScheduleBlock[];
  hasUndoSnapshot: boolean;
  onCommitReflow: (reflowed: ScheduleBlock[]) => void;
  onUndoToOriginal: () => void;
}

const SIM_NOW_OPTIONS = [
  { label: '07:30 ص (تأخر 3 س)', min: 7 * 60 + 30 },
  { label: '09:15 ص (تأخر صباحي)', min: 9 * 60 + 15 },
  { label: '11:00 ص (منتصف اليوم)', min: 11 * 60 },
  { label: '02:15 م (بعد الظهر)', min: 14 * 60 + 15 },
];

export const SmartCatchUpModal: React.FC<SmartCatchUpModalProps> = ({
  isOpen,
  onClose,
  blocks,
  hasUndoSnapshot,
  onCommitReflow,
  onUndoToOriginal,
}) => {
  const [simNowMin, setSimNowMin] = useState<number>(9 * 60 + 15);
  const [decisions, setDecisions] = useState<Record<string, CatchUpDecision>>({});

  const overdueTasks = useMemo(
    () =>
      blocks.filter(
        (b) => !b.isAnchor && !b.completed && !b.deleted && b.startMin < simNowMin
      ),
    [blocks, simNowMin]
  );

  const reflowPreview = useMemo(
    () => computeCollisionFreeReflow(blocks, simNowMin, decisions),
    [blocks, simNowMin, decisions]
  );

  if (!isOpen) return null;

  const setDecision = (id: string, d: CatchUpDecision) => {
    setDecisions((prev) => ({ ...prev, [id]: d }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="تدارك اليوم والزحزحة الذكية"
    >
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#0A0D12] p-6 text-zinc-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white">⚡ تدارك اليوم والزحزحة الذكية</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              خوارزمية امتصاص الفجوة لضغط كتل العمل المرنة وحماية مواقيت الصلاة والنوم 09:15 م
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Time Simulation Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/60 p-3">
          <span className="text-xs font-medium text-zinc-300">
            توقيت التدارك الحالي:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {SIM_NOW_OPTIONS.map((opt) => (
              <button
                key={opt.min}
                type="button"
                onClick={() => setSimNowMin(opt.min)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  simNowMin === opt.min
                    ? 'bg-[#7FFFD4] text-black font-semibold'
                    : 'bg-white/5 text-zinc-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Overdue Tasks Decision List */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-sm font-semibold text-zinc-200">
              المهام الفائتة قبل {formatMinutes12h(simNowMin)} ({overdueTasks.length})
            </h3>
            <span className="font-mono-tabular text-xs text-zinc-400">
              الميزانية المتاحة W = {reflowPreview.availableBudgetMin} د
            </span>
          </div>

          {overdueTasks.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/40 p-6 text-center text-xs text-zinc-400">
              لا توجد مهام مرنة فائتة قبل هذا التوقيت.
            </div>
          ) : (
            <div className="space-y-2">
              {overdueTasks.map((task) => {
                const currentDecision = decisions[task.id] ?? 'skip_today';
                return (
                  <div
                    key={task.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/50 p-3"
                  >
                    {(() => {
                      const ep = task.emojiPair.trim();
                      const rawTitle = task.categoryAr.trim();
                      const cleanTitle = rawTitle.startsWith(ep)
                        ? rawTitle.slice(ep.length).trim()
                        : rawTitle;
                      return (
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{task.emojiPair}</span>
                          <div>
                            {cleanTitle && (
                              <div className="text-xs font-semibold text-white">
                                {cleanTitle}
                              </div>
                            )}
                            <div className="font-mono-tabular text-[11px] text-zinc-500">
                              الأصل: {formatMinutes12h(task.startMin)} · {task.durationMin} دقيقة
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 3-Segmented Decision Pill */}
                    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDecision(task.id, 'start_now')}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                          currentDecision === 'start_now'
                            ? 'bg-[#7FFFD4] text-black font-semibold'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        ⏩ ابدأ الآن
                      </button>
                      <button
                        type="button"
                        onClick={() => setDecision(task.id, 'shift_evening')}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                          currentDecision === 'shift_evening'
                            ? 'bg-indigo-400 text-black font-semibold'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        🌙 رحّل للمساء
                      </button>
                      <button
                        type="button"
                        onClick={() => setDecision(task.id, 'skip_today')}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                          currentDecision === 'skip_today'
                            ? 'bg-zinc-700 text-white font-semibold'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        ❌ تخطّي اليوم
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Before vs. After Visual Timeline Diff Bar */}
        <div className="mt-6 rounded-xl border border-white/10 bg-black/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-[#7FFFD4]" />
              معاينة الترتيب بدون تعارض (قبل مقابل بعد الزحزحة)
            </h3>
            <span className="font-mono-tabular text-[11px] text-[#4ADE80]">
              0 تعارضات · الصلوات والنوم ثابتة 100%
            </span>
          </div>

          <div className="space-y-2.5">
            {/* Before Bar */}
            <div>
              <div className="flex justify-between text-[11px] text-zinc-500 mb-1">
                <span>الجدول الأصلي</span>
                <span className="font-mono-tabular">04:25 ص — 09:15 م</span>
              </div>
              <div className="flex h-6 w-full overflow-hidden rounded-lg bg-zinc-900 border border-white/10">
                {blocks
                  .filter((b) => !b.deleted && b.id !== 'sleep_anchor')
                  .map((b) => (
                    <div
                      key={`before-${b.id}`}
                      title={
                        b.categoryAr.trim().startsWith(b.emojiPair.trim())
                          ? `${b.categoryAr} (${formatMinutes12h(b.startMin)})`
                          : `${b.emojiPair} ${b.categoryAr}`
                      }
                      style={{ flexGrow: Math.max(10, b.durationMin) }}
                      className={`h-full border-l border-black/60 flex items-center justify-center text-[11px] overflow-hidden ${
                        b.isAnchor
                          ? 'bg-[#7FFFD4]/25 text-[#7FFFD4]'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {b.durationMin >= 35 ? b.emojiPair.split(' ')[0] : ''}
                    </div>
                  ))}
              </div>
            </div>

            {/* After Bar */}
            <div>
              <div className="flex justify-between text-[11px] text-[#7FFFD4] mb-1">
                <span>بعد امتصاص الفجوة</span>
                <span className="font-mono-tabular">
                  ضغط {reflowPreview.compressedCount} · ترحيل {reflowPreview.shiftedCount} · تخطي {reflowPreview.skippedCount}
                </span>
              </div>
              <div className="flex h-6 w-full overflow-hidden rounded-lg bg-zinc-900 border border-[#7FFFD4]/30">
                {reflowPreview.reflowedBlocks
                  .filter(
                    (b) =>
                      !b.deleted &&
                      b.id !== 'sleep_anchor' &&
                      b.reflowStatus !== 'skipped'
                  )
                  .map((b) => (
                    <div
                      key={`after-${b.id}`}
                      title={`${b.emojiPair} (${formatMinutes12h(b.startMin)} · ${b.durationMin}د)`}
                      style={{ flexGrow: Math.max(10, b.durationMin) }}
                      className={`h-full border-l border-black/60 flex items-center justify-center text-[11px] overflow-hidden ${
                        b.isAnchor
                          ? 'bg-[#7FFFD4]/30 text-[#7FFFD4]'
                          : b.reflowStatus === 'shifted_evening'
                            ? 'bg-indigo-500/35 text-indigo-200'
                            : b.reflowStatus === 'compressed' ||
                                b.reflowStatus === 'started_now'
                              ? 'bg-[#4ADE80]/30 text-[#4ADE80]'
                              : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {b.durationMin >= 30 ? b.emojiPair.split(' ')[0] : ''}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {reflowPreview.notesAr.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-zinc-400">
              {reflowPreview.notesAr.map((note, idx) => (
                <li key={idx}>· {note}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          {hasUndoSnapshot ? (
            <button
              type="button"
              onClick={() => {
                onUndoToOriginal();
                onClose();
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-400/40 text-amber-300 text-xs font-semibold hover:bg-amber-400/10 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              ↩️ استعادة الجدول الأصلي
            </button>
          ) : (
            <span className="text-xs text-zinc-500">
              يُحفظ الجدول الأصلي في لقطة فورية تتيح التراجع بضغطة واحدة
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              onCommitReflow(reflowPreview.reflowedBlocks);
              onClose();
            }}
            className="px-6 py-2.5 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] cursor-pointer"
          >
            اعتماد الزحزحة لليوم فقط
          </button>
        </div>
      </div>
    </div>
  );
};
