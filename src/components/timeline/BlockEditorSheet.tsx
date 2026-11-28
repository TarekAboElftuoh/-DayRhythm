import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Repeat, Sparkles, X } from 'lucide-react';
import type { AppLanguage, DailyRhythmPlan, LifeProfile, PrayerTimeItem } from '../../types/dayrhythm';
import { formatMinutes12h, formatMinutes24h, formatTime24To12h } from '../../engines/prayerEngine';
import {
  checkSmartScheduleConflict,
  formatDurationAr,
  type DayTimelineModel,
  type DayTimelinePlacedItem,
} from '../../engines/lifeRhythmEngine';
import {
  combine12hToStartMin,
  EDITOR_DURATION_CHIPS,
  EDITOR_NUDGE_STEPS,
  splitStartMin12h,
  SPRING_SNAPPY,
  toOccupiedScheduleBlocks,
} from './types';

export const BlockEditorSheet: React.FC<{
  item: DayTimelinePlacedItem | null;
  model: DayTimelineModel;
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile: LifeProfile;
  todayIso: string;
  language: AppLanguage;
  isSaving: boolean;
  onClose: () => void;
  onSave: (
    item: DayTimelinePlacedItem,
    next: { startMin: number; durationMin: number; scope: 'today' | 'permanent' }
  ) => Promise<void>;
  onToggleComplete?: (item: DayTimelinePlacedItem) => void;
}> = ({ item, model, prayers, plan, profile, todayIso, language, isSaving, onClose, onSave, onToggleComplete }) => {
  const [startMin, setStartMin] = useState(0);
  const [durationMin, setDurationMin] = useState(30);

  useEffect(() => {
    if (!item) return;
    setStartMin(((Math.round(item.startMin) % 1440) + 1440) % 1440);
    setDurationMin(Math.max(5, Math.min(480, Math.round(item.durationMin))));
  }, [item]);

  const { hour12, minute, period } = splitStartMin12h(startMin);
  const time24 = formatMinutes24h(startMin);

  const occupiedBlocks = useMemo(
    () => (item ? toOccupiedScheduleBlocks(model.placedBlocks, item.id) : []),
    [item, model.placedBlocks]
  );

  const conflict = useMemo(() => {
    if (!item) return { hasConflict: false, warnings: [] as string[], suggestedTime24: null, suggestedTime12Ar: null };
    return checkSmartScheduleConflict({
      time24, durationMinutes: durationMin, dateIso: todayIso,
      prayers, plan, profile, occupiedBlocks,
    });
  }, [item, time24, durationMin, todayIso, prayers, plan, profile, occupiedBlocks]);

  const applySuggestedTime = () => {
    const m = conflict.suggestedTime24?.match(/^(\d{1,2}):(\d{2})$/);
    if (m) setStartMin(Number(m[1]) * 60 + Number(m[2]));
  };

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => !isSaving && onClose()}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="block-editor-sheet-title" dir="rtl"
            initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 32, opacity: 0, scale: 0.98 }}
            transition={SPRING_SNAPPY} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-active)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4 shadow-2xl"
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto sm:hidden" aria-hidden="true" />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg shrink-0" aria-hidden="true">{item.emoji}</span>
                <div className="min-w-0">
                  <h3 id="block-editor-sheet-title" className="text-sm font-bold text-white truncate">{item.title}</h3>
                  <div className="font-mono-tabular text-xs text-[#7FFFD4]">
                    {formatMinutes12h(startMin, language)} – {formatMinutes12h(startMin + durationMin, language)} · {formatDurationAr(durationMin)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {onToggleComplete && (
                  <button
                    type="button" onClick={() => { onToggleComplete(item); onClose(); }}
                    className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1 cursor-pointer ${
                      item.completed ? 'border-[#4ADE80]/40 bg-[#4ADE80]/15 text-[#4ADE80]' : 'border-white/10 text-zinc-300 hover:border-[#7FFFD4]/40'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{item.completed ? 'مكتمل' : 'إتمام'}</span>
                  </button>
                )}
                <button type="button" onClick={onClose} disabled={isSaving} aria-label="إغلاق" className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                <Clock className="w-3.5 h-3.5 text-[#7FFFD4]" />
                <span>وقت البداية</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  aria-label="الساعة" value={hour12}
                  onChange={(e) => setStartMin(combine12hToStartMin(Number(e.target.value), minute, period))}
                  className="min-h-[44px] rounded-xl border border-white/15 bg-black/60 px-3 text-sm font-mono-tabular text-white focus:border-[#7FFFD4] focus:outline-none"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (<option key={h} value={h}>{h}</option>))}
                </select>
                <input
                  type="number" aria-label="الدقيقة" min={0} max={59} value={minute}
                  onChange={(e) => setStartMin(combine12hToStartMin(hour12, Number(e.target.value) || 0, period))}
                  className="min-h-[44px] rounded-xl border border-white/15 bg-black/60 px-3 text-center text-sm font-mono-tabular text-white focus:border-[#7FFFD4] focus:outline-none"
                />
                <div className="grid grid-cols-2 rounded-xl border border-white/15 bg-black/60 p-1">
                  {(['AM', 'PM'] as const).map((p) => (
                    <button
                      key={p} type="button" onClick={() => setStartMin(combine12hToStartMin(hour12, minute, p))}
                      className={`rounded-lg text-xs font-bold cursor-pointer transition-colors ${period === p ? 'bg-[#7FFFD4] text-black' : 'text-zinc-400 hover:text-white'}`}
                    >
                      {p === 'AM' ? 'ص' : 'م'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {EDITOR_NUDGE_STEPS.map((n) => (
                  <button
                    key={n.delta} type="button"
                    onClick={() => setStartMin((prev) => Math.max(0, Math.min(1435, prev + n.delta)))}
                    className="min-h-[38px] rounded-lg border border-white/10 bg-white/[0.04] hover:border-[#7FFFD4]/40 font-mono-tabular text-xs font-semibold text-zinc-200 cursor-pointer"
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
                <span>المدة</span>
                <span className="font-mono-tabular text-[#7FFFD4]">{formatDurationAr(durationMin)}</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {EDITOR_DURATION_CHIPS.map((c) => (
                  <button
                    key={c.min} type="button" onClick={() => setDurationMin(c.min)}
                    className={`min-h-[38px] rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      durationMin === c.min ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]' : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="custom-dur-min" className="text-[11px] text-zinc-400 shrink-0">مدة مخصصة (دقيقة):</label>
                <input
                  id="custom-dur-min" type="number" min={5} max={480} step={5} value={durationMin}
                  onChange={(e) => setDurationMin(Math.max(5, Math.min(480, Number(e.target.value) || 5)))}
                  className="w-24 min-h-[36px] rounded-lg border border-white/15 bg-black/60 px-2.5 text-center font-mono-tabular text-xs text-white focus:border-[#7FFFD4] focus:outline-none"
                />
              </div>
            </div>

            {conflict.hasConflict && (
              <div className="rounded-xl border border-amber-400/35 bg-amber-400/10 p-3 space-y-2 text-xs text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">{conflict.warnings.map((w, idx) => (<div key={idx}>{w}</div>))}</div>
                </div>
                {conflict.suggestedTime24 && (
                  <button type="button" onClick={applySuggestedTime} className="inline-flex items-center gap-1.5 rounded-lg border border-[#7FFFD4]/40 bg-[#7FFFD4]/15 px-2.5 py-1.5 text-[11px] font-bold text-[#7FFFD4] cursor-pointer">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>تطبيق المقترح ({formatTime24To12h(conflict.suggestedTime24, language)})</span>
                  </button>
                )}
              </div>
            )}

            {item.kind === 'habit' && item.habit ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button" disabled={isSaving} onClick={() => void onSave(item, { startMin, durationMin, scope: 'today' })}
                  className="min-h-[46px] rounded-xl bg-[#7FFFD4] text-black text-xs sm:text-sm font-bold hover:bg-[#66eec2] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CalendarClock className="w-4 h-4" />
                  <span>{isSaving ? 'جارٍ الحفظ...' : 'تطبيق لليوم فقط'}</span>
                </button>
                <button
                  type="button" disabled={isSaving} onClick={() => void onSave(item, { startMin, durationMin, scope: 'permanent' })}
                  className="min-h-[46px] rounded-xl border border-[#7FFFD4]/40 bg-[#7FFFD4]/12 text-[#7FFFD4] text-xs sm:text-sm font-bold hover:bg-[#7FFFD4]/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Repeat className="w-4 h-4" />
                  <span>تعديل دائم</span>
                </button>
              </div>
            ) : (
              <button
                type="button" disabled={isSaving} onClick={() => void onSave(item, { startMin, durationMin, scope: 'today' })}
                className="w-full min-h-[46px] rounded-xl bg-[#7FFFD4] text-black text-xs sm:text-sm font-bold hover:bg-[#66eec2] cursor-pointer disabled:opacity-50"
              >
                {isSaving ? 'جارٍ الحفظ...' : 'حفظ ومزامنة'}
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
