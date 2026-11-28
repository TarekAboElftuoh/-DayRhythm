import React from 'react';
import { formatTime24To12h } from '../../engines/prayerEngine';
import type { MedicationItem } from '../../types/dayrhythm';
import { ARABIC_WEEKDAYS, resolveMedicationDosesForDay } from '../../engines/lifeRhythmEngine';
import { MedicationEditAdvanced } from './MedicationEditAdvanced';
import type { DashboardController } from './useDashboardController';

export const MedicationEditForm: React.FC<{ d: DashboardController; med: MedicationItem; doseTimes: string[]; resolvedMed: ReturnType<typeof resolveMedicationDosesForDay>; takenDoses: string[] }> = ({ d, med, doseTimes, resolvedMed, takenDoses }) => {
  const {
    language, onUpdateMedication, calendarConnected, onExecuteCalendarActions, todayCairoIso, showEditMedAdvanced, setShowEditMedAdvanced, editingMedId, setEditingMedId, editMedName, setEditMedName, editMedHour12, setEditMedHour12, editMedMinute, setEditMedMinute, editMedPeriod, setEditMedPeriod, editMedTimes24, setEditMedTimes24, editMedDaysOfWeek, setEditMedDaysOfWeek, editMedFastingPolicy, editMedNote, setEditMedNote, editMedCourseEnd, setEditMedCourseEnd, editMedRemainingDoses, setEditMedRemainingDoses, editMedRefillAlertDays,
  } = d;
  return (
    <>
                      {editingMedId === med.id && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!editMedName.trim()) return;
                            let h24 = editMedHour12 % 12;
                            if (editMedPeriod === 'PM') h24 += 12;
                            const mClamped = Math.max(0, Math.min(59, Math.round(Number(editMedMinute) || 0)));
                            const currentPicked24 = `${String(h24).padStart(2, '0')}:${String(mClamped).padStart(2, '0')}`;
                            const finalTimes = editMedTimes24.length > 0 ? editMedTimes24 : [currentPicked24];
                            const parsedRem = editMedRemainingDoses.trim()
                              ? Math.max(0, Math.min(500, Math.round(Number(editMedRemainingDoses))))
                              : -1;
                            onUpdateMedication?.({
                              operation: 'update',
                              medicationId: med.id,
                              name: editMedName.trim(),
                              time24: finalTimes[0],
                              times24: finalTimes,
                              daysOfWeek: editMedDaysOfWeek,
                              fastingPolicy: editMedFastingPolicy,
                              doseNote: editMedNote.trim(),
                              courseEndDate: editMedCourseEnd.trim(),
                              remainingDoses: Number.isFinite(parsedRem) ? parsedRem : -1,
                              refillAlertDays: editMedRefillAlertDays,
                            });
                            if (calendarConnected && med.calendarEventId) {
                              const DAY_CODE_MAP = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
                              const byDays =
                                editMedDaysOfWeek.length > 0
                                  ? editMedDaysOfWeek.map((d) => DAY_CODE_MAP[d]).filter(Boolean)
                                  : undefined;
                              void onExecuteCalendarActions([
                                {
                                  operation: 'update',
                                  eventId: med.calendarEventId,
                                  calendarId: 'primary',
                                  title: `💊 ⏰ ${editMedName.trim()}`,
                                  dateIso: todayCairoIso,
                                  startTime24: finalTimes[0],
                                  durationMinutes: 15,
                                  recurrenceRule: byDays && byDays.length > 0 ? 'WEEKLY' : 'DAILY',
                                  byDays,
                                  description: editMedNote.trim()
                                    ? `موعد علاج/مكمل: ${editMedName.trim()} · ${editMedNote.trim()}`
                                    : `موعد علاج/مكمل مجدول عبر إيقاع اليوم | DayRhythm`,
                                },
                              ]);
                            }
                            setEditingMedId(null);
                          }}
                          className="mt-2.5 rounded-xl border border-[#7FFFD4]/30 bg-black/70 p-3 space-y-2.5 text-xs"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={editMedName}
                              onChange={(e) => setEditMedName(e.target.value)}
                              placeholder="اسم العلاج أو المكمل"
                              className="rounded-lg border border-white/15 bg-black px-2.5 py-1.5 text-white focus:outline-none focus:border-[#7FFFD4]"
                            />
                            <input
                              type="text"
                              value={editMedNote}
                              onChange={(e) => setEditMedNote(e.target.value)}
                              placeholder="ملاحظة (مثال: مع وجبة)"
                              className="rounded-lg border border-white/15 bg-black px-2.5 py-1.5 text-white focus:outline-none focus:border-[#7FFFD4]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-zinc-400">الميعاد:</span>
                              <select
                                value={editMedHour12}
                                onChange={(e) => setEditMedHour12(Number(e.target.value))}
                                className="rounded-lg border border-white/15 bg-black px-2 py-1 text-white font-mono-tabular"
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
                                value={editMedMinute}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/\D/g, '');
                                  if (val === '') {
                                    setEditMedMinute('');
                                    return;
                                  }
                                  const v = Number(val);
                                  setEditMedMinute(Number.isFinite(v) ? (v > 59 ? '59' : val.slice(0, 2)) : '');
                                }}
                                className="w-14 rounded-lg border border-white/15 bg-black px-2 py-1 text-center text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                                aria-label="الدقائق"
                              />
                              <button
                                type="button"
                                onClick={() => setEditMedPeriod((p) => (p === 'AM' ? 'PM' : 'AM'))}
                                className="px-2.5 py-1 rounded-lg border border-white/15 bg-black text-[#7FFFD4] font-bold cursor-pointer"
                              >
                                {editMedPeriod === 'AM' ? 'ص' : 'م'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  let h24 = editMedHour12 % 12;
                                  if (editMedPeriod === 'PM') h24 += 12;
                                  const mClamped = Math.max(0, Math.min(59, Math.round(Number(editMedMinute) || 0)));
                                  const picked = `${String(h24).padStart(2, '0')}:${String(mClamped).padStart(2, '0')}`;
                                  setEditMedTimes24((prev) =>
                                    prev.includes(picked) ? prev : [...prev, picked].slice(0, 6)
                                  );
                                }}
                                className="px-2 py-1 rounded-lg border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[11px] text-[#7FFFD4] font-semibold cursor-pointer"
                              >
                                + جرعة
                              </button>
                            </div>
                            {editMedTimes24.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {editMedTimes24.map((t24) => (
                                  <span
                                    key={t24}
                                    className="inline-flex items-center gap-1 rounded-md border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 px-2 py-0.5 text-[11px] font-mono-tabular text-[#7FFFD4]"
                                  >
                                    {formatTime24To12h(t24, language)}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditMedTimes24((prev) => prev.filter((x) => x !== t24))
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

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="flex items-center justify-between gap-2 rounded-lg border border-white/12 bg-black px-2.5 py-1 text-[11px] text-zinc-400">
                              <span>نهاية الكورس:</span>
                              <input
                                type="date"
                                value={editMedCourseEnd}
                                onChange={(e) => setEditMedCourseEnd(e.target.value)}
                                className="bg-black text-zinc-200 focus:outline-none font-mono-tabular"
                              />
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={500}
                              value={editMedRemainingDoses}
                              onChange={(e) => setEditMedRemainingDoses(e.target.value)}
                              placeholder="عدد الجرعات المتبقية"
                              className="rounded-lg border border-white/12 bg-black px-2.5 py-1.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4] font-mono-tabular"
                            />
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {ARABIC_WEEKDAYS.map((day) => {
                              const selected = editMedDaysOfWeek.includes(day.id);
                              return (
                                <button
                                  key={day.id}
                                  type="button"
                                  onClick={() =>
                                    setEditMedDaysOfWeek((prev) =>
                                      prev.includes(day.id)
                                        ? prev.filter((d) => d !== day.id)
                                        : [...prev, day.id].sort((a, b) => a - b)
                                    )
                                  }
                                  className={`px-2 py-0.5 rounded-lg border text-[11px] cursor-pointer ${
                                    selected
                                      ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                                      : 'border-white/10 text-zinc-400 hover:text-white'
                                  }`}
                                >
                                  {day.shortAr}
                                </button>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={() => setShowEditMedAdvanced((v) => !v)}
                            aria-expanded={showEditMedAdvanced}
                            className="text-[11px] text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <span>خيارات إضافية {showEditMedAdvanced ? '▴' : '▾'}</span>
                          </button>

<MedicationEditAdvanced d={d} med={med} doseTimes={doseTimes} resolvedMed={resolvedMed} takenDoses={takenDoses} />
</form>
)}
    </>
  );
};
