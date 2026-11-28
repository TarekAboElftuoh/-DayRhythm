import React from 'react';
import { Trash2, CheckCircle2, Circle, Pencil } from 'lucide-react';
import { formatTime24To12h } from '../../engines/prayerEngine';
import { ARABIC_WEEKDAYS, resolveMedicationDosesForDay } from '../../engines/lifeRhythmEngine';
import { MedicationEditForm } from './MedicationEditForm';
import { MedicationItemFooter } from './MedicationItemFooter';
import type { DashboardController } from './useDashboardController';

export const MedicationItemCard: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, medications, onToggleMedication, dailyRhythmPlan, todayCairoIso, setPendingDeleteMed, setDeleteMedStep, setDeleteMedConfirmed, setShowEditMedAdvanced, editingMedId, setEditingMedId, setEditMedName, setEditMedHour12, setEditMedMinute, setEditMedPeriod, setEditMedTimes24, setEditMedDaysOfWeek, setEditMedFastingPolicy, setEditMedNote, setEditMedCourseEnd, setEditMedRemainingDoses, setEditMedRefillAlertDays, applyTime24To12hPicker, medFajrMin, medMaghribMin,
  } = d;
  return (
    <>
                {medications.map((med) => {
                  const doseTimes =
                    med.times24 && med.times24.length > 0
                      ? med.times24
                      : med.time24
                        ? [med.time24]
                        : [];
                  const resolvedMed = resolveMedicationDosesForDay(med, {
                    isFastingToday: Boolean(dailyRhythmPlan.isFastingToday),
                    fajrMin: medFajrMin,
                    maghribMin: medMaghribMin,
                  });
                  const takenDoses =
                    med.takenDateKey === todayCairoIso ? med.takenDosesToday ?? [] : [];
                  const takenToday =
                    med.takenDateKey === todayCairoIso &&
                    (doseTimes.length <= 1 || doseTimes.every((t) => takenDoses.includes(t)));
                  const daysLabel =
                    med.daysOfWeek && med.daysOfWeek.length > 0
                      ? med.daysOfWeek
                          .map((d) => ARABIC_WEEKDAYS.find((w) => w.id === d)?.shortAr ?? '')
                          .filter(Boolean)
                          .join('، ')
                      : '';

                  return (
                    <div
                      key={med.id}
                      className={`py-3 first:pt-0 last:pb-0 text-xs transition-opacity ${
                        takenToday ? 'opacity-85' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleMedication(med.id)}
                          className="flex items-center gap-2 cursor-pointer text-right min-w-0 flex-1"
                          title={med.doseNote || undefined}
                        >
                          <span className={`font-semibold truncate ${takenToday ? 'text-[#4ADE80]' : 'text-zinc-100'}`}>
                            {med.name}
                          </span>
                          {doseTimes.length === 1 && resolvedMed.doses.length === 0 && resolvedMed.skippedCount > 0 && (
                            <span className="text-[11px] text-amber-300/80 shrink-0">
                              · متخطى (صيام)
                            </span>
                          )}
                          {doseTimes.length === 1 && resolvedMed.doses[0] && (
                            <span
                              className={`font-mono-tabular text-[11px] shrink-0 ${
                                resolvedMed.doses[0].wasShifted ? 'text-[#7FFFD4]' : 'text-zinc-400'
                              }`}
                              title={
                                resolvedMed.doses[0].wasShifted
                                  ? `الموعد الأصلي: ${formatTime24To12h(resolvedMed.doses[0].originalTime24, language)}`
                                  : undefined
                              }
                            >
                              · {formatTime24To12h(resolvedMed.doses[0].effectiveTime24, language)}
                              {resolvedMed.doses[0].wasShifted ? ' (صيام)' : ''}
                            </span>
                          )}
                          {daysLabel && (
                            <span className="text-[11px] text-zinc-500 shrink-0">
                              ({daysLabel})
                            </span>
                          )}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onToggleMedication(med.id)}
                            aria-pressed={takenToday}
                            className={`min-h-[44px] sm:min-h-[34px] px-3 sm:px-2.5 py-1 rounded-xl border text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer select-none ${
                              takenToday
                                ? 'border-[#4ADE80] bg-[#4ADE80] text-black'
                                : 'border-[#7FFFD4]/35 bg-[#7FFFD4]/10 text-[#7FFFD4] hover:bg-[#7FFFD4] hover:text-black'
                            }`}
                          >
                            {takenToday ? (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <Circle className="w-3 h-3 shrink-0" />
                            )}
                            <span>
                              {takenToday
                                ? 'تم'
                                : doseTimes.length > 1 && takenDoses.length > 0
                                  ? `${takenDoses.length}/${doseTimes.length}`
                                  : 'تم اليوم'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (editingMedId === med.id) {
                                setEditingMedId(null);
                                return;
                              }
                              setEditingMedId(med.id);
                              setEditMedName(med.name);
                              const firstT = doseTimes[0] || '08:00';
                              applyTime24To12hPicker(
                                firstT,
                                setEditMedHour12,
                                setEditMedMinute,
                                setEditMedPeriod
                              );
                              setEditMedTimes24(doseTimes);
                              setEditMedDaysOfWeek(med.daysOfWeek ?? []);
                              setEditMedFastingPolicy(med.fastingPolicy ?? 'auto-nearest');
                              setShowEditMedAdvanced(false);
                              setEditMedNote(med.doseNote ?? '');
                              setEditMedCourseEnd(med.courseEndDate ?? '');
                              setEditMedRemainingDoses(
                                typeof med.remainingDoses === 'number' && med.remainingDoses >= 0
                                  ? String(med.remainingDoses)
                                  : ''
                              );
                              setEditMedRefillAlertDays(med.refillAlertDays ?? 3);
                            }}
                            className={`min-w-[42px] min-h-[42px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg flex items-center justify-center cursor-pointer shrink-0 transition-colors ${
                              editingMedId === med.id
                                ? 'text-[#7FFFD4] bg-[#7FFFD4]/15'
                                : 'text-zinc-500 hover:text-[#7FFFD4] hover:bg-[#7FFFD4]/10'
                            }`}
                            title={`تعديل ${med.name}`}
                            aria-label={`تعديل ${med.name}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingDeleteMed(med);
                              setDeleteMedStep(1);
                              setDeleteMedConfirmed(false);
                            }}
                            className="min-w-[42px] min-h-[42px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                            title={`حذف ${med.name}`}
                            aria-label={`حذف ${med.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

<MedicationEditForm d={d} med={med} doseTimes={doseTimes} resolvedMed={resolvedMed} takenDoses={takenDoses} />
<MedicationItemFooter d={d} med={med} doseTimes={doseTimes} takenToday={takenToday} />
</div>
);
})}
    </>
  );
};
