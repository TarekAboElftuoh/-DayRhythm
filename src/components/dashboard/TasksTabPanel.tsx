import React from 'react';
import { Trash2, CheckCircle2, Circle, Plus, Clock } from 'lucide-react';
import { formatTime24To12h, getDateIsoInTimeZone } from '../../engines/prayerEngine';
import type { DashboardController } from './useDashboardController';

export const TasksTabPanel: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, prayers, googleTaskLists, onExecuteTaskActions, activeTimeZone, todayCairoIso, showTaskScheduleRow, setShowTaskScheduleRow, creatingTaskNow, setCreatingTaskNow, selectedTaskListId, setPendingTaskConfirmation, newTaskTitle, setNewTaskTitle, newTaskDueIso, setNewTaskDueIso, newTaskTime24, setNewTaskTime24, nowMinutes, visibleTasks,
  } = d;
  return (
    <>
                {(() => {
                  const getDateOffsetIso = (daysAhead: number): string => {
                    const dt = new Date(Date.now() + daysAhead * 86_400_000);
                    return getDateIsoInTimeZone(activeTimeZone, dt);
                  };
                  const formatMinTo24 = (totalMin: number): string => {
                    const wrapped = ((Math.round(totalMin) % 1440) + 1440) % 1440;
                    const hh = Math.floor(wrapped / 60);
                    const mm = wrapped % 60;
                    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                  };
                  const upcomingPrayer = prayers.find(
                    (p) => p.id !== 'sunrise' && p.adhanMinutes > nowMinutes + 5
                  );
                  const afterNextPrayerTime24 = upcomingPrayer
                    ? formatMinTo24(upcomingPrayer.adhanMinutes + 25)
                    : '20:00';
                  const afterNextPrayerLabel = upcomingPrayer
                    ? `بعد ${upcomingPrayer.nameAr}`
                    : '8 م';

                  const submitQuickTask = async (e: React.FormEvent) => {
                    e.preventDefault();
                    const cleanTitle = newTaskTitle.trim();
                    if (!cleanTitle || creatingTaskNow) return;
                    const resolvedDueIso = newTaskDueIso || (newTaskTime24 ? todayCairoIso : '');
                    const timeNote = newTaskTime24 ? `⏰ ${newTaskTime24}` : undefined;
                    setCreatingTaskNow(true);
                    try {
                      await onExecuteTaskActions([
                        {
                          operation: 'create',
                          taskListId:
                            selectedTaskListId !== 'all'
                              ? selectedTaskListId
                              : googleTaskLists[0]?.id ?? '@default',
                          title: cleanTitle,
                          notes: timeNote,
                          dueDateIso: resolvedDueIso || undefined,
                        },
                      ]);
                      setNewTaskTitle('');
                      setNewTaskDueIso('');
                      setNewTaskTime24('');
                      setShowTaskScheduleRow(false);
                    } finally {
                      setCreatingTaskNow(false);
                    }
                  };

                  return (
                    <form onSubmit={(e) => void submitQuickTask(e)} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          placeholder="أضف مهمة جديدة... (اضغط Enter فوراً)"
                          className="flex-1 min-w-0 min-h-[42px] rounded-xl border border-white/[0.1] bg-black/55 px-3.5 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowTaskScheduleRow((v) => !v)}
                          className={`min-h-[42px] px-2.5 rounded-xl border text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors ${
                            showTaskScheduleRow || newTaskDueIso || newTaskTime24
                              ? 'border-[#7FFFD4]/45 bg-[#7FFFD4]/12 text-[#7FFFD4]'
                              : 'border-white/[0.09] bg-black/40 text-zinc-400 hover:text-white'
                          }`}
                          title="تحديد موعد سريع (اختياري)"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span className="font-mono-tabular text-[11px] hidden sm:inline">
                            {newTaskTime24
                              ? formatTime24To12h(newTaskTime24, language)
                              : newTaskDueIso
                                ? newTaskDueIso === todayCairoIso
                                  ? 'اليوم'
                                  : newTaskDueIso === getDateOffsetIso(1)
                                    ? 'غداً'
                                    : newTaskDueIso.slice(5)
                                : 'موعد'}
                          </span>
                        </button>
                        <button
                          type="submit"
                          disabled={!newTaskTitle.trim() || creatingTaskNow}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] disabled:opacity-40 flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{creatingTaskNow ? '...' : 'إضافة'}</span>
                        </button>
                      </div>

                      {(showTaskScheduleRow || newTaskDueIso || newTaskTime24) && (
                        <div className="rounded-xl border border-white/[0.08] bg-black/35 p-2.5 space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {[
                              {
                                label: 'اليوم',
                                active: newTaskDueIso === todayCairoIso && !newTaskTime24,
                                onClick: () => {
                                  setNewTaskDueIso(todayCairoIso);
                                },
                              },
                              {
                                label: 'غداً',
                                active: newTaskDueIso === getDateOffsetIso(1),
                                onClick: () => {
                                  setNewTaskDueIso(getDateOffsetIso(1));
                                },
                              },
                              {
                                label: '+30 د',
                                active: false,
                                onClick: () => {
                                  setNewTaskDueIso(todayCairoIso);
                                  setNewTaskTime24(formatMinTo24(nowMinutes + 30));
                                },
                              },
                              {
                                label: '+1 س',
                                active: false,
                                onClick: () => {
                                  setNewTaskDueIso(todayCairoIso);
                                  setNewTaskTime24(formatMinTo24(nowMinutes + 60));
                                },
                              },
                              {
                                label: afterNextPrayerLabel,
                                active: newTaskTime24 === afterNextPrayerTime24,
                                onClick: () => {
                                  setNewTaskDueIso(todayCairoIso);
                                  setNewTaskTime24(afterNextPrayerTime24);
                                },
                              },
                              {
                                label: '8 م',
                                active: newTaskTime24 === '20:00',
                                onClick: () => {
                                  setNewTaskDueIso(todayCairoIso);
                                  setNewTaskTime24('20:00');
                                },
                              },
                            ].map((chip) => (
                              <button
                                key={chip.label}
                                type="button"
                                onClick={chip.onClick}
                                className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                                  chip.active
                                    ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/15 text-[#7FFFD4]'
                                    : 'border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:border-[#7FFFD4]/40 hover:text-white'
                                }`}
                              >
                                {chip.label}
                              </button>
                            ))}
                            {(newTaskDueIso || newTaskTime24) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNewTaskDueIso('');
                                  setNewTaskTime24('');
                                }}
                                className="px-2 py-1 rounded-lg text-[11px] text-zinc-500 hover:text-rose-300 cursor-pointer"
                              >
                                مسح
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={newTaskDueIso}
                              onChange={(e) => setNewTaskDueIso(e.target.value)}
                              className="flex-1 min-w-0 rounded-lg border border-white/[0.09] bg-black/55 px-2.5 py-1.5 text-[11px] font-mono-tabular text-zinc-300 focus:outline-none focus:border-[#7FFFD4]"
                              title="التاريخ"
                            />
                            <input
                              type="time"
                              value={newTaskTime24}
                              onChange={(e) => {
                                setNewTaskTime24(e.target.value);
                                if (e.target.value && !newTaskDueIso) {
                                  setNewTaskDueIso(todayCairoIso);
                                }
                              }}
                              className="w-28 rounded-lg border border-white/[0.09] bg-black/55 px-2.5 py-1.5 text-[11px] font-mono-tabular text-zinc-300 focus:outline-none focus:border-[#7FFFD4]"
                              title="الوقت"
                            />
                          </div>
                        </div>
                      )}
                    </form>
                  );
                })()}

                {visibleTasks.length === 0 ? (
                  <div className="py-5 text-center text-xs text-zinc-500">
                    لا توجد مهام حالياً.
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06] max-h-[300px] overflow-y-auto">
                    {visibleTasks.map((tk) => {
                      const done = tk.status === 'completed';
                      return (
                        <div
                          key={`${tk.taskListId}-${tk.id}`}
                          className={`py-2.5 px-1 flex items-center justify-between gap-3 ${
                            done ? 'opacity-45' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <button
                              type="button"
                              onClick={() =>
                                setPendingTaskConfirmation({
                                  operation: done ? 'reopen' : 'complete',
                                  taskId: tk.id,
                                  taskListId: tk.taskListId,
                                  title: tk.title,
                                })
                              }
                              className="min-h-[38px] min-w-[38px] flex items-center justify-center text-zinc-500 hover:text-[#4ADE80] cursor-pointer shrink-0"
                              title={done ? 'إعادة الفتح' : 'إتمام'}
                            >
                              {done ? (
                                <CheckCircle2 className="w-5 h-5 text-[#4ADE80]" />
                              ) : (
                                <Circle className="w-5 h-5" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <div className={`text-sm font-medium truncate ${done ? 'line-through text-zinc-400' : 'text-zinc-100'}`}>
                                {tk.title}
                              </div>
                              {(tk.due || googleTaskLists.length > 1) && (
                                <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-0.5">
                                  {googleTaskLists.length > 1 && <span>{tk.taskListTitle}</span>}
                                  {tk.due && (
                                    <span className="font-mono-tabular text-[#7FFFD4]">
                                      {googleTaskLists.length > 1 ? '· ' : ''}
                                      {tk.due.slice(0, 10)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setPendingTaskConfirmation({
                                operation: 'delete',
                                taskId: tk.id,
                                taskListId: tk.taskListId,
                                title: tk.title,
                              })
                            }
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
    </>
  );
};
