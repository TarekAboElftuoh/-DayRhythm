import React from 'react';
import type { MedicationFastingPolicy } from '../../types/dayrhythm';
import { formatTime24To12h } from '../../engines/prayerEngine';
import { ARABIC_WEEKDAYS } from '../../engines/lifeRhythmEngine';
import { MED_FASTING_POLICY_OPTIONS } from './types';
import type { DashboardController } from './useDashboardController';

export const MedicationAdvancedFields: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    calendarConnected, onOpenAssistantWithPrompt, setShowAddMedForm, showMedAdvanced, setShowMedAdvanced, newMedName, newMedDaysOfWeek, setNewMedDaysOfWeek, newMedFastingPolicy, setNewMedFastingPolicy, newMedNote, setNewMedNote, newMedCourseEnd, setNewMedCourseEnd, newMedRemainingDoses, setNewMedRemainingDoses, newMedRefillAlertDays, setNewMedRefillAlertDays, newMedSyncCalendar, setNewMedSyncCalendar, newMedCurrentTime24,
  } = d;
  return (
    <>
                {showMedAdvanced && (
                  <div className="space-y-2.5 pt-1 border-t border-white/[0.06]">
                    <input
                      type="text"
                      value={newMedNote}
                      onChange={(e) => setNewMedNote(e.target.value)}
                      placeholder="ملاحظة (مثال: مع وجبة)"
                      className="w-full rounded-lg border border-white/12 bg-black px-2.5 py-1.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex items-center justify-between gap-2 rounded-lg border border-white/12 bg-black px-2.5 py-1 text-[11px] text-zinc-400">
                        <span>نهاية الكورس:</span>
                        <input
                          type="date"
                          value={newMedCourseEnd}
                          onChange={(e) => setNewMedCourseEnd(e.target.value)}
                          className="bg-black text-zinc-200 focus:outline-none font-mono-tabular"
                        />
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={500}
                        value={newMedRemainingDoses}
                        onChange={(e) => setNewMedRemainingDoses(e.target.value)}
                        placeholder="عدد الجرعات بالعبوة (اختياري)"
                        className="rounded-lg border border-white/12 bg-black px-2.5 py-1.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4] font-mono-tabular"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                      <span>تنبيه قبل النفاد:</span>
                      <div className="flex items-center gap-1">
                        {[2, 3, 5, 7].map((days) => (
                          <button
                            key={days}
                            type="button"
                            onClick={() => setNewMedRefillAlertDays(days)}
                            className={`px-2 py-0.5 rounded-lg border text-[11px] cursor-pointer ${
                              newMedRefillAlertDays === days
                                ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                                : 'border-white/10 text-zinc-400 hover:text-white'
                            }`}
                          >
                            {days} ي
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span>الأيام (فارغ = يومياً):</span>
                        {newMedDaysOfWeek.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setNewMedDaysOfWeek([])}
                            className="text-[#7FFFD4] hover:underline cursor-pointer"
                          >
                            كل يوم
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {ARABIC_WEEKDAYS.map((day) => {
                          const selected = newMedDaysOfWeek.includes(day.id);
                          return (
                            <button
                              key={day.id}
                              type="button"
                              onClick={() =>
                                setNewMedDaysOfWeek((prev) =>
                                  prev.includes(day.id)
                                    ? prev.filter((d) => d !== day.id)
                                    : [...prev, day.id].sort((a, b) => a - b)
                                )
                              }
                              className={`px-2 py-1 rounded-lg border text-[11px] cursor-pointer ${
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
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400 block">
                        سياسة الصيام (الجرعات بين الفجر والمغرب):
                      </label>
                      <select
                        value={newMedFastingPolicy}
                        onChange={(e) =>
                          setNewMedFastingPolicy(e.target.value as MedicationFastingPolicy)
                        }
                        className="w-full rounded-lg border border-white/12 bg-black px-2.5 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-[#7FFFD4]"
                      >
                        {MED_FASTING_POLICY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.labelAr}
                          </option>
                        ))}
                      </select>
                    </div>

                    {calendarConnected && (
                      <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none pt-0.5">
                        <input
                          type="checkbox"
                          checked={newMedSyncCalendar}
                          onChange={(e) => setNewMedSyncCalendar(e.target.checked)}
                          className="accent-[#7FFFD4] rounded"
                        />
                        <span>إضافة تلقائية للتقويم</span>
                      </label>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => {
                      const medLabel = newMedName.trim() || 'علاج أو مكمل جديد';
                      const pickedLabel = formatTime24To12h(newMedCurrentTime24, 'ar');
                      onOpenAssistantWithPrompt(
                        `هل ميعاد الساعة ${pickedLabel} مناسب لـ «${medLabel}»${newMedNote.trim() ? ` (${newMedNote.trim()})` : ''}؟ راجع توافقه مع الصلوات والنوم والصيام وجدولي في التقويم وأخبرني علمياً قبل تثبيته.`
                      );
                    }}
                    className="text-[11px] text-[#7FFFD4] hover:underline cursor-pointer"
                  >
                    اسأل Gemini
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddMedForm(false);
                        setShowMedAdvanced(false);
                      }}
                      className="px-2.5 py-1 rounded-lg text-zinc-400 hover:text-white cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={!newMedName.trim()}
                      className="px-3 py-1 rounded-lg bg-[#7FFFD4] text-black font-bold disabled:opacity-40 cursor-pointer"
                    >
                      حفظ
                    </button>
                  </div>
                  </div>
    </>
  );
};
