import React from 'react';
import type { MedicationItem } from '../../types/dayrhythm';
import { computeMedicationDaysLeft } from '../../engines/lifeRhythmEngine';
import type { DashboardController } from './useDashboardController';

export const MedicationItemFooter: React.FC<{ d: DashboardController; med: MedicationItem; doseTimes: string[]; takenToday: boolean }> = ({ d, med, doseTimes, takenToday }) => {
  const {
    onToggleMedicationDate, onRefillMedication, todayCairoIso, editingStockMedId, setEditingStockMedId, editStockDosesInput, setEditStockDosesInput, editStockAlertDays, setEditStockAlertDays, last7CairoDays,
  } = d;
  return (
    <>
                      {/* Compact 7-Day Adherence Strip + Stock Action */}
                      <div className="mt-2 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          {last7CairoDays.map((day) => {
                            const scheduled =
                              !med.daysOfWeek ||
                              med.daysOfWeek.length === 0 ||
                              med.daysOfWeek.includes(day.weekdayNum);
                            const wasTaken =
                              (med.takenDates ?? []).includes(day.dateIso) ||
                              (day.isToday && takenToday);
                            if (!scheduled) {
                              return (
                                <span
                                  key={day.dateIso}
                                  className="w-6 h-5 rounded border border-white/[0.05] text-[10px] text-zinc-500 flex items-center justify-center"
                                  title={`${day.dateIso} — راحة`}
                                >
                                  –
                                </span>
                              );
                            }
                            return (
                              <button
                                key={day.dateIso}
                                type="button"
                                onClick={() => onToggleMedicationDate(med.id, day.dateIso)}
                                className={`h-5 min-w-[22px] px-1 rounded border text-[10px] font-bold flex items-center justify-center cursor-pointer transition-colors ${
                                  wasTaken
                                    ? 'border-[#4ADE80]/40 bg-[#4ADE80]/15 text-[#4ADE80]'
                                    : day.isToday
                                      ? 'border-amber-400/40 bg-amber-400/12 text-amber-200'
                                      : 'border-rose-500/30 bg-rose-500/[0.08] text-rose-300/85 hover:border-rose-400'
                                }`}
                                title={
                                  wasTaken
                                    ? `${day.dateIso}: تم ✓`
                                    : day.isToday
                                      ? 'اليوم: لم يؤخذ بعد'
                                      : `${day.dateIso}: فائت`
                                }
                              >
                                {day.isToday
                                  ? wasTaken
                                    ? '✓'
                                    : '○'
                                  : wasTaken
                                    ? `${day.shortAr}✓`
                                    : `${day.shortAr}×`}
                              </button>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (editingStockMedId === med.id) {
                              setEditingStockMedId(null);
                            } else {
                              setEditingStockMedId(med.id);
                              setEditStockDosesInput(
                                typeof med.remainingDoses === 'number' && med.remainingDoses >= 0
                                  ? String(med.remainingDoses)
                                  : '30'
                              );
                              setEditStockAlertDays(med.refillAlertDays ?? 3);
                            }
                          }}
                          className="text-[11px] text-zinc-500 hover:text-[#7FFFD4] cursor-pointer shrink-0 transition-colors"
                        >
                          {typeof med.remainingDoses === 'number' && med.remainingDoses >= 0
                            ? 'المخزون'
                            : '+ مخزون'}
                        </button>
                      </div>

                      {((typeof med.remainingDoses === 'number' && med.remainingDoses >= 0) ||
                        Boolean(med.courseEndDate)) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono-tabular text-zinc-500">
                          {typeof med.remainingDoses === 'number' && med.remainingDoses >= 0 && (() => {
                            const daysLeft = computeMedicationDaysLeft(
                              med.remainingDoses,
                              doseTimes.length || 1,
                              med.daysOfWeek
                            );
                            const alertDays = med.refillAlertDays ?? 3;
                            const isLowStock = daysLeft <= alertDays;
                            return (
                              <span
                                className={
                                  med.remainingDoses === 0
                                    ? 'text-rose-400 font-semibold'
                                    : isLowStock
                                      ? 'text-amber-300 font-semibold'
                                      : 'text-zinc-500'
                                }
                              >
                                {med.remainingDoses === 0
                                  ? 'نفدت العبوة'
                                  : `متبقٍ ${med.remainingDoses} جرعة (~${Math.ceil(daysLeft)} ي)`}
                              </span>
                            );
                          })()}
                          {med.courseEndDate && (
                            <span
                              className={
                                med.courseEndDate < todayCairoIso ? 'text-amber-300' : 'text-zinc-500'
                              }
                            >
                              {typeof med.remainingDoses === 'number' && med.remainingDoses >= 0
                                ? '· '
                                : ''}
                              {med.courseEndDate < todayCairoIso
                                ? `انتهى ${med.courseEndDate}`
                                : `حتى ${med.courseEndDate}`}
                            </span>
                          )}
                        </div>
                      )}

                      {editingStockMedId === med.id && (
                        <div className="mt-2 rounded-lg border border-[#7FFFD4]/25 bg-black/75 p-2.5 space-y-2 text-[11px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="text-zinc-400">المتبقي:</label>
                            <input
                              type="number"
                              min={0}
                              max={500}
                              value={editStockDosesInput}
                              onChange={(e) => setEditStockDosesInput(e.target.value)}
                              className="w-18 rounded-lg border border-white/15 bg-black px-2 py-1 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                            />
                            <span className="text-zinc-400">تنبيه:</span>
                            {[2, 3, 5].map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setEditStockAlertDays(d)}
                                className={`px-1.5 py-0.5 rounded border text-[11px] cursor-pointer ${
                                  editStockAlertDays === d
                                    ? 'border-[#7FFFD4] bg-[#7FFFD4]/20 text-[#7FFFD4] font-bold'
                                    : 'border-white/10 text-zinc-400'
                                }`}
                              >
                                {d} ي
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingStockMedId(null)}
                              className="px-2 py-0.5 text-zinc-400 hover:text-white cursor-pointer"
                            >
                              إلغاء
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const parsed = Math.max(
                                  0,
                                  Math.min(500, Math.round(Number(editStockDosesInput) || 0))
                                );
                                onRefillMedication(med.id, parsed, editStockAlertDays);
                                setEditingStockMedId(null);
                              }}
                              className="px-2.5 py-0.5 rounded-lg bg-[#7FFFD4] text-black font-bold cursor-pointer"
                            >
                              حفظ ✓
                            </button>
                          </div>
                        </div>
                      )}
    </>
  );
};
