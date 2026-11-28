import React from 'react';
import { AlertCircle } from 'lucide-react';
import type { CalendarActionProposal } from '../../types/dayrhythm';
import { formatTime24To12h } from '../../engines/prayerEngine';
import { MedicationAdvancedFields } from './MedicationAdvancedFields';
import type { DashboardController } from './useDashboardController';

export const MedicationAddForm: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, onAddMedication, calendarConnected, onExecuteCalendarActions, onOpenAssistantWithPrompt, todayCairoIso, setShowAddMedForm, showMedAdvanced, setShowMedAdvanced, newMedName, setNewMedName, newMedHour12, setNewMedHour12, newMedMinute, setNewMedMinute, newMedPeriod, setNewMedPeriod, newMedTimes24, setNewMedTimes24, newMedDaysOfWeek, setNewMedDaysOfWeek, newMedFastingPolicy, setNewMedFastingPolicy, newMedNote, setNewMedNote, newMedCourseEnd, setNewMedCourseEnd, newMedRemainingDoses, setNewMedRemainingDoses, newMedRefillAlertDays, setNewMedRefillAlertDays, newMedSyncCalendar, applyTime24To12hPicker, newMedCurrentTime24, newMedConflict,
  } = d;
  return (
    <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newMedName.trim()) return;
                  const trimmedName = newMedName.trim();
                  const trimmedNote = newMedNote.trim();
                  const finalTimes =
                    newMedTimes24.length > 0 ? newMedTimes24 : [newMedCurrentTime24];
                  const parsedRem = newMedRemainingDoses.trim()
                    ? Math.max(0, Math.min(500, Math.round(Number(newMedRemainingDoses))))
                    : -1;
                  onAddMedication({
                    name: trimmedName,
                    time24: finalTimes[0],
                    times24: finalTimes,
                    daysOfWeek: newMedDaysOfWeek,
                    fastingPolicy: newMedFastingPolicy,
                    doseNote: trimmedNote || '',
                    courseEndDate: newMedCourseEnd.trim() || '',
                    remainingDoses: Number.isFinite(parsedRem) ? parsedRem : -1,
                    totalDoses: Number.isFinite(parsedRem) ? parsedRem : -1,
                    refillAlertDays: newMedRefillAlertDays,
                  });

                  if (calendarConnected && newMedSyncCalendar) {
                    const DAY_CODE_MAP = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
                    const byDays =
                      newMedDaysOfWeek.length > 0
                        ? newMedDaysOfWeek.map((d) => DAY_CODE_MAP[d]).filter(Boolean)
                        : undefined;
                    const calendarActions: CalendarActionProposal[] = finalTimes.map((t24) => ({
                      operation: 'create',
                      calendarId: 'primary',
                      title: `💊 ⏰ ${trimmedName}`,
                      dateIso: todayCairoIso,
                      startTime24: t24,
                      durationMinutes: 15,
                      recurrenceRule: byDays && byDays.length > 0 ? 'WEEKLY' : 'DAILY',
                      byDays,
                      description: trimmedNote
                        ? `موعد علاج/مكمل: ${trimmedName} · ${trimmedNote}`
                        : `موعد علاج/مكمل مجدول عبر إيقاع اليوم | DayRhythm`,
                    }));
                    void onExecuteCalendarActions(calendarActions);
                  }

                  setNewMedName('');
                  setNewMedNote('');
                  setNewMedTimes24([]);
                  setNewMedDaysOfWeek([]);
                  setNewMedFastingPolicy('auto-nearest');
                  setNewMedCourseEnd('');
                  setNewMedRemainingDoses('');
                  setNewMedRefillAlertDays(3);
                  setShowMedAdvanced(false);
                  setShowAddMedForm(false);
                }}
                className="rounded-xl border border-white/[0.1] bg-black/55 p-3 space-y-2.5 text-xs"
              >
                <input
                  type="text"
                  value={newMedName}
                  onChange={(e) => setNewMedName(e.target.value)}
                  placeholder="اسم العلاج أو المكمل"
                  className="w-full rounded-lg border border-white/12 bg-black px-2.5 py-2 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
                />

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-zinc-400">الميعاد:</span>
                    <select
                      value={newMedHour12}
                      onChange={(e) => setNewMedHour12(Number(e.target.value))}
                      className="rounded-lg border border-white/12 bg-black px-2 py-1 text-white font-mono-tabular"
                      aria-label="الساعة"
                    >
                      {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                    <span className="text-zinc-500 font-mono-tabular">:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      value={newMedMinute}
                      placeholder="mm"
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (val === '') {
                          setNewMedMinute('');
                          return;
                        }
                        const v = Number(val);
                        setNewMedMinute(Number.isFinite(v) ? (v > 59 ? '59' : val.slice(0, 2)) : '');
                      }}
                      className="w-14 rounded-lg border border-white/12 bg-black px-2 py-1 text-center text-white placeholder:text-zinc-500 placeholder:font-normal font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                      aria-label="الدقائق"
                    />
                    <button
                      type="button"
                      onClick={() => setNewMedPeriod((p) => (p === 'AM' ? 'PM' : 'AM'))}
                      className="px-2.5 py-1 rounded-lg border border-white/12 bg-black text-[#7FFFD4] font-bold cursor-pointer"
                    >
                      {newMedPeriod === 'AM' ? 'ص' : 'م'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMedTimes24((prev) =>
                          prev.includes(newMedCurrentTime24)
                            ? prev
                            : [...prev, newMedCurrentTime24].slice(0, 6)
                        );
                      }}
                      className="px-2 py-1 rounded-lg border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[11px] text-[#7FFFD4] font-semibold cursor-pointer"
                    >
                      + جرعة
                    </button>
                  </div>
                  {newMedTimes24.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {newMedTimes24.map((t24) => (
                        <span
                          key={t24}
                          className="inline-flex items-center gap-1 rounded-md border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 px-2 py-0.5 text-[11px] font-mono-tabular text-[#7FFFD4]"
                        >
                          {formatTime24To12h(t24, language)}
                          <button
                            type="button"
                            onClick={() =>
                              setNewMedTimes24((prev) => prev.filter((x) => x !== t24))
                            }
                            className="text-zinc-400 hover:text-white cursor-pointer"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {newMedConflict.hasConflict && (
                  <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-2.5 space-y-2 text-[11px] text-amber-100">
                    <div className="flex items-start gap-1.5 font-semibold text-amber-200">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-300" />
                      <span>تعارض محتمل مع جدولك:</span>
                    </div>
                    <ul className="space-y-0.5 pr-4 list-disc text-[11px] text-amber-100/90">
                      {newMedConflict.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {newMedConflict.suggestedTime24 && newMedConflict.suggestedTime12Ar && (
                        <button
                          type="button"
                          onClick={() => {
                            applyTime24To12hPicker(
                              newMedConflict.suggestedTime24!,
                              setNewMedHour12,
                              setNewMedMinute,
                              setNewMedPeriod
                            );
                            if (newMedTimes24.length > 0) {
                              setNewMedTimes24([newMedConflict.suggestedTime24!]);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#7FFFD4] text-black text-[11px] font-bold hover:bg-[#66eec2] cursor-pointer"
                        >
                          تطبيق {newMedConflict.suggestedTime12Ar}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const medLabel = newMedName.trim() || 'علاج جديد';
                          const pickedLabel = formatTime24To12h(newMedCurrentTime24, 'ar');
                          const conflictList = newMedConflict.warnings.join('، ');
                          onOpenAssistantWithPrompt(
                            `عاوز أضيف «${medLabel}»${newMedNote.trim() ? ` (${newMedNote.trim()})` : ''} الساعة ${pickedLabel}، بس النظام نبّهني إن فيه تعارض: ${conflictList}. ناقشني واقترح أنسب ميعاد علمي متوافق مع الصلاة والنوم والصيام والتقويم، ولما أوافق احجزه في التقويم.`
                          );
                        }}
                        className="px-2.5 py-1 rounded-lg border border-amber-300/45 bg-black/50 text-amber-200 hover:text-white text-[11px] font-semibold cursor-pointer"
                      >
                        ناقش مع Gemini
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowMedAdvanced((v) => !v)}
                  aria-expanded={showMedAdvanced}
                  className="text-[11px] text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>خيارات إضافية {showMedAdvanced ? '▴' : '▾'}</span>
                </button>

<MedicationAdvancedFields d={d} />
              </form>
    </>
  );
};
