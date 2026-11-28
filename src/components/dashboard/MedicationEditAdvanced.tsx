import React from 'react';
import type { MedicationFastingPolicy } from '../../types/dayrhythm';
import type { MedicationItem } from '../../types/dayrhythm';
import { formatTime24To12h } from '../../engines/prayerEngine';
import { resolveMedicationDosesForDay } from '../../engines/lifeRhythmEngine';
import { MED_FASTING_POLICY_OPTIONS } from './types';
import type { DashboardController } from './useDashboardController';

export const MedicationEditAdvanced: React.FC<{ d: DashboardController; med: MedicationItem; doseTimes: string[]; resolvedMed: ReturnType<typeof resolveMedicationDosesForDay>; takenDoses: string[] }> = ({ d, med, doseTimes, resolvedMed, takenDoses }) => {
  const {
    language, onToggleMedication, onOpenAssistantWithPrompt, showEditMedAdvanced, setEditingMedId, editMedName, editMedFastingPolicy, setEditMedFastingPolicy,
  } = d;
  return (
    <>
                          {showEditMedAdvanced && (
                            <div className="space-y-1 pt-1 border-t border-white/[0.06]">
                              <label className="text-[11px] text-zinc-400 block">
                                سياسة الصيام (الجرعات بين الفجر والمغرب):
                              </label>
                              <select
                                value={editMedFastingPolicy}
                                onChange={(e) =>
                                  setEditMedFastingPolicy(e.target.value as MedicationFastingPolicy)
                                }
                                className="w-full rounded-lg border border-white/15 bg-black px-2.5 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-[#7FFFD4]"
                              >
                                {MED_FASTING_POLICY_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.labelAr}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-white/[0.08]">
                            <button
                              type="button"
                              onClick={() => setEditingMedId(null)}
                              className="px-2.5 py-1 rounded-lg text-zinc-400 hover:text-white cursor-pointer"
                            >
                              إلغاء
                            </button>
                            <button
                              type="submit"
                              disabled={!editMedName.trim()}
                              className="px-3 py-1 rounded-lg bg-[#7FFFD4] text-black font-bold disabled:opacity-40 cursor-pointer"
                            >
                              حفظ التعديل
                            </button>
                          </div>

                      {doseTimes.length > 1 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {resolvedMed.doses.map((dose) => {
                            const doseDone =
                              takenDoses.includes(dose.originalTime24) ||
                              takenDoses.includes(dose.effectiveTime24);
                            return (
                              <button
                                key={dose.originalTime24}
                                type="button"
                                onClick={() => onToggleMedication(med.id, dose.originalTime24)}
                                title={
                                  dose.wasShifted
                                    ? `الموعد الأصلي: ${formatTime24To12h(dose.originalTime24, language)}`
                                    : undefined
                                }
                                className={`px-2 py-0.5 rounded-md border font-mono-tabular text-[11px] cursor-pointer transition-colors ${
                                  doseDone
                                    ? 'border-[#4ADE80]/45 bg-[#4ADE80]/15 text-[#4ADE80] font-bold'
                                    : dose.wasShifted
                                      ? 'border-[#7FFFD4]/35 bg-[#7FFFD4]/10 text-[#7FFFD4] hover:border-[#7FFFD4]/60'
                                      : 'border-white/10 bg-white/[0.02] text-zinc-300 hover:border-[#7FFFD4]/45'
                                }`}
                              >
                                {formatTime24To12h(dose.effectiveTime24, language)}{' '}
                                {dose.wasShifted ? '(صيام) ' : ''}
                                {doseDone ? '✓' : '○'}
                              </button>
                            );
                          })}
                          {resolvedMed.skippedCount > 0 && (
                            <span className="text-[10px] text-amber-300/80">
                              (تخطي {resolvedMed.skippedCount} للصيام)
                            </span>
                          )}
                        </div>
                      )}

                      {doseTimes.length === 0 && (
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                          <span>بدون ميعاد محدد</span>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenAssistantWithPrompt(
                                `عاوز أحدد أنسب ميعاد علمي لـ «${med.name}» — راجع تقويمي والذاكرة ولو مش متسجل ابحث علمياً واقترح عليّ التوقيت الأفضل قبل التثبيت`
                              )
                            }
                            className="text-[#7FFFD4] hover:underline font-medium cursor-pointer"
                          >
                            اسأل Gemini ←
                          </button>
                        </div>
                      )}
    </>
  );
};
