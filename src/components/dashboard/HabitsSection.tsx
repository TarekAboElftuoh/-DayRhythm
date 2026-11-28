import React from 'react';
import { CheckCircle2, Circle, Plus, Pencil } from 'lucide-react';
import { ErrorBoundary } from '../ErrorBoundary';
import { formatMinutes12h } from '../../engines/prayerEngine';
import type { DynamicHabit } from '../../types/dayrhythm';
import { DYNAMIC_HABIT_ANCHOR_LABELS } from '../../engines/lifeRhythmEngine';
import { t } from '../../engines/i18n';
import type { DashboardController } from './useDashboardController';

export const HabitsSection: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, habits = [], resolvedHabits = [], onAddHabit, onUpdateHabit, onToggleHabitToday, onToggleHabitStatus, cardSurface, showPlannedHabits, setShowPlannedHabits, setHabitModalOpen, setEditingHabitId, setHabitTitle, setHabitStatus, setHabitAnchor, setHabitDurationMin, setHabitDaysOfWeek, setHabitSkipOnFasting,
  } = d;
  return (
    <>
          {/* 2. Dynamic Daily Habits ("عادات اليوم") */}
          <ErrorBoundary sectionTitle="عادات اليوم" compact>
          <section className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${cardSurface}`}>
            {(() => {
              const plannedHabits = habits.filter((h) => h.status === 'planned');
              const completedHabitsCount = resolvedHabits.filter((r) => r.completedToday).length;
              const openNewHabitModal = () => {
                setEditingHabitId(null);
                setHabitTitle('');
                setHabitStatus('active');
                setHabitAnchor('sunrise-light');
                setHabitDurationMin(30);
                setHabitDaysOfWeek([]);
                setHabitSkipOnFasting(false);
                setHabitModalOpen(true);
              };
              const openEditHabitModal = (h: DynamicHabit) => {
                setEditingHabitId(h.id);
                setHabitTitle(h.title);
                setHabitStatus(h.status);
                setHabitAnchor(h.anchor);
                setHabitDurationMin(h.durationMin || 30);
                setHabitDaysOfWeek(Array.isArray(h.daysOfWeek) ? h.daysOfWeek : []);
                setHabitSkipOnFasting(Boolean(h.skipOnFasting));
                setHabitModalOpen(true);
              };
              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-subtle)]">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#7FFFD4]" />
                      <span>عادات اليوم</span>
                      {resolvedHabits.length > 0 && (
                        <span className="font-mono-tabular text-xs font-medium text-zinc-500">
                          · {completedHabitsCount}/{resolvedHabits.length}
                        </span>
                      )}
                    </h2>
                    <div className="flex items-center gap-2">
                      {plannedHabits.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowPlannedHabits((v) => !v)}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg border border-white/[0.08] bg-[var(--bg-surface)] text-[11px] font-medium text-zinc-300 hover:border-[#7FFFD4]/40 hover:text-[#7FFFD4] cursor-pointer transition-colors"
                        >
                          مستقبلية ({plannedHabits.length})
                        </button>
                      )}
                      {onAddHabit && (
                        <button
                          type="button"
                          onClick={openNewHabitModal}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[#7FFFD4]/30 bg-[#7FFFD4]/10 text-[#7FFFD4] text-xs font-semibold flex items-center gap-1 hover:bg-[#7FFFD4]/20 cursor-pointer transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {resolvedHabits.length === 0 ? (
                    <div className="text-xs text-zinc-500 py-1 flex items-center justify-between gap-2">
                      <span>لا توجد عادات حالية مفعّلة اليوم — أضف عادة لتتكيّف تلقائياً مع أوقاتك الفاضية.</span>
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border-subtle)]">
                      {resolvedHabits.map((item) => {
                        const { habit, dueToday, completedToday, skippedReasonAr, slot, isFallbackSlot, isFlexibleUnplaced } = item;
                        const anchorMeta = DYNAMIC_HABIT_ANCHOR_LABELS[habit.anchor];
                        return (
                          <div
                            key={habit.id}
                            className="py-2.5 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => onToggleHabitToday?.(habit.id)}
                                aria-label={completedToday ? `إلغاء إنجاز ${habit.title}` : `إنجاز ${habit.title}`}
                                className="min-h-[36px] min-w-[36px] -ms-1 flex items-center justify-center rounded-lg cursor-pointer shrink-0 transition-colors hover:bg-white/[0.04]"
                              >
                                {completedToday ? (
                                  <CheckCircle2 className="w-4 h-4 text-[#4ADE80]" />
                                ) : (
                                  <Circle className="w-4 h-4 text-zinc-500 hover:text-[#7FFFD4]" />
                                )}
                              </button>
                              <div className="min-w-0 flex-1">
                                <div
                                  className={`font-medium truncate ${
                                    completedToday ? 'line-through text-zinc-500' : 'text-white'
                                  }`}
                                >
                                  {habit.title}
                                </div>
                                <div className="text-[11px] text-zinc-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <span>{anchorMeta.emoji} {anchorMeta.labelAr}</span>
                                  <span>·</span>
                                  <span className="font-mono-tabular">{habit.durationMin} د</span>
                                  {!dueToday && skippedReasonAr ? (
                                    <span className="text-zinc-500">· {skippedReasonAr}</span>
                                  ) : slot ? (
                                    <span className="font-mono-tabular text-[#7FFFD4]">
                                      · {formatMinutes12h(slot.startMin, language)} – {formatMinutes12h(slot.endMin, language)}
                                      {isFallbackSlot ? ' (بديل متاح)' : ''}
                                    </span>
                                  ) : isFlexibleUnplaced ? (
                                    <span className="text-amber-300/90">· مرنة (حسب التفرغ)</span>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            {onUpdateHabit && (
                              <button
                                type="button"
                                onClick={() => openEditHabitModal(habit)}
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] cursor-pointer shrink-0"
                                title={`تعديل ${habit.title}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {showPlannedHabits && plannedHabits.length > 0 && (
                    <div className="pt-2.5 border-t border-[var(--border-subtle)] space-y-2">
                      <div className="text-[11px] font-semibold text-zinc-400">
                        عادات مستقبلية (مؤجلة حتى تفعيلها)
                      </div>
                      <div className="divide-y divide-[var(--border-subtle)]">
                        {plannedHabits.map((ph) => {
                          const anchorMeta = DYNAMIC_HABIT_ANCHOR_LABELS[ph.anchor];
                          return (
                            <div key={ph.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                              <div className="min-w-0">
                                <div className="text-zinc-300 font-medium truncate">{ph.title}</div>
                                <div className="text-[11px] text-zinc-500">
                                  {anchorMeta.emoji} {anchorMeta.labelAr} · {ph.durationMin} د
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {onToggleHabitStatus && (
                                  <button
                                    type="button"
                                    onClick={() => onToggleHabitStatus(ph.id)}
                                    className="px-2.5 py-1 rounded-lg border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 text-[#7FFFD4] text-[11px] font-semibold hover:bg-[#7FFFD4]/20 cursor-pointer"
                                  >
                                    تفعيل
                                  </button>
                                )}
                                {onUpdateHabit && (
                                  <button
                                    type="button"
                                    onClick={() => openEditHabitModal(ph)}
                                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 cursor-pointer"
                                    title={`تعديل ${ph.title}`}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </section>
          </ErrorBoundary>
    </>
  );
};
