import React from 'react';
import { motion } from 'framer-motion';
import { Trash2, RotateCcw, Zap, Calendar, Plus, CheckSquare } from 'lucide-react';
import { ErrorBoundary } from '../ErrorBoundary';
import { formatMinutes12h } from '../../engines/prayerEngine';
import { TomorrowSpecialTimeline } from './TomorrowSpecialTimeline';
import { TodayScheduleList } from './TodayScheduleList';
import { TasksTabPanel } from './TasksTabPanel';
import type { DashboardController } from './useDashboardController';

export const ScheduleAndTasksCard: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, useOfflineDemo, onToggleOfflineDemo, onRestoreBlock, onRestoreAllDeleted, onOpenCatchUp, hasUndoSnapshot, onUndoReflow, calendarConnected, calendarEvents, googleTaskLists, cardSurface, showTrash, setShowTrash, scheduleCardMode, setScheduleCardMode, timelineFilter, setTimelineFilter, selectedTaskListId, setSelectedTaskListId, setNewEventModalOpen, setNewEvMinute, setNewEvConfirmStep, deletedBlocks, finishedTodayBlocks, tomorrowEvents, nonRoutineUpcomingEvents, dayTimelineModel, visibleTasks, openTasksCount,
  } = d;
  return (
    <>
          {/* 1. Today's Schedule + Google Tasks (Segmented Switch) */}
          <ErrorBoundary sectionTitle="جدول اليوم والمهام" compact>
          <section className={`rounded-2xl border p-4 sm:p-5 flex-1 ${cardSurface}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[var(--border-subtle)]">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                  {scheduleCardMode === 'schedule' ? (
                    <Calendar className="w-4 h-4 text-[#7FFFD4]" />
                  ) : (
                    <CheckSquare className="w-4 h-4 text-[#7FFFD4]" />
                  )}
                  <span>{scheduleCardMode === 'schedule' ? 'جدول اليوم' : 'المهام'}</span>
                  {scheduleCardMode === 'schedule' && calendarConnected && calendarEvents.length > 0 && (
                    <span className="font-mono-tabular text-xs font-medium text-zinc-500">
                      · {calendarEvents.length}
                    </span>
                  )}
                  {scheduleCardMode === 'tasks' && (
                    <span className="font-mono-tabular text-xs font-medium text-zinc-500">
                      · {visibleTasks.length}
                    </span>
                  )}
                </h2>

                {/* Clean Segmented Switch: الجدول | المهام */}
                <div
                  role="tablist"
                  aria-label="عرض الجدول أو المهام"
                  className="inline-flex items-center p-0.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={scheduleCardMode === 'schedule'}
                    onClick={() => setScheduleCardMode('schedule')}
                    className={`relative min-h-[34px] sm:min-h-[30px] px-3 py-1 rounded-lg text-xs md:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap select-none ${
                      scheduleCardMode === 'schedule'
                        ? 'text-[#7FFFD4] font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {scheduleCardMode === 'schedule' && (
                      <motion.span
                        layoutId="schedule-tasks-switch-pill"
                        transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                        className="absolute inset-0 rounded-lg bg-[#7FFFD4]/12 border border-[#7FFFD4]/25"
                      />
                    )}
                    <span className="relative z-10">الجدول</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={scheduleCardMode === 'tasks'}
                    onClick={() => setScheduleCardMode('tasks')}
                    className={`relative min-h-[34px] sm:min-h-[30px] px-3 py-1 rounded-lg text-xs md:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap select-none ${
                      scheduleCardMode === 'tasks'
                        ? 'text-[#7FFFD4] font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {scheduleCardMode === 'tasks' && (
                      <motion.span
                        layoutId="schedule-tasks-switch-pill"
                        transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                        className="absolute inset-0 rounded-lg bg-[#7FFFD4]/12 border border-[#7FFFD4]/25"
                      />
                    )}
                    <span className="relative z-10">المهام</span>
                    {openTasksCount > 0 && (
                      <span
                        className={`relative z-10 px-1.5 py-0.2 rounded-full text-[10px] font-mono-tabular font-bold ${
                          scheduleCardMode === 'tasks'
                            ? 'bg-[#7FFFD4]/25 text-[#7FFFD4]'
                            : 'bg-white/[0.08] text-zinc-300'
                        }`}
                      >
                        {openTasksCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {scheduleCardMode === 'schedule' ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onOpenCatchUp}
                    className="min-h-[44px] sm:min-h-[34px] px-3 sm:px-2.5 py-1 rounded-xl border border-[var(--border-subtle)] text-zinc-300 hover:border-[#7FFFD4]/40 hover:text-[#7FFFD4] text-xs md:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5 text-[#7FFFD4]" />
                    <span>زحزحة</span>
                  </button>
                  {hasUndoSnapshot && (
                    <button
                      type="button"
                      onClick={onUndoReflow}
                      className="min-h-[44px] sm:min-h-[34px] px-3 sm:px-2.5 py-1 rounded-xl border border-amber-400/35 text-amber-300 text-xs font-medium hover:bg-amber-400/10 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>استعادة</span>
                    </button>
                  )}
                  {deletedBlocks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTrash((v) => !v)}
                      className="min-h-[44px] sm:min-h-[34px] px-3 sm:px-2.5 py-1 rounded-xl border border-[var(--border-subtle)] text-zinc-400 hover:text-white text-xs flex items-center gap-1 cursor-pointer"
                      title="المحذوفات"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="font-mono-tabular">{deletedBlocks.length}</span>
                    </button>
                  )}
                  {calendarConnected && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewEvConfirmStep(false);
                        setNewEvMinute('');
                        setNewEventModalOpen(true);
                      }}
                      className="min-h-[44px] sm:min-h-[34px] px-3.5 sm:px-3 py-1 rounded-xl bg-[#7FFFD4] text-black text-xs md:text-sm font-bold hover:bg-[#66eec2] flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>حدث</span>
                    </button>
                  )}
                </div>
              ) : (
                calendarConnected &&
                googleTaskLists.length > 1 && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedTaskListId('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-colors ${
                        selectedTaskListId === 'all'
                          ? 'bg-white/12 text-white font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      الكل
                    </button>
                    {googleTaskLists
                      .filter((list) => list.title !== '[DayRhythm Sync Vault]')
                      .map((list) => (
                        <button
                          key={list.id}
                          type="button"
                          onClick={() => setSelectedTaskListId(list.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-colors ${
                            selectedTaskListId === list.id
                              ? 'bg-white/12 text-white font-semibold'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {list.title}
                        </button>
                      ))}
                  </div>
                )
              )}
            </div>

            {scheduleCardMode === 'schedule' ? (
              <>
            {/* Clean Segmented Filter */}
            <div className="mt-3 flex items-center p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-x-auto max-w-full w-fit">
              {(
                [
                  { id: 'today', label: 'اليوم', count: dayTimelineModel.placedBlocks.length },
                  { id: 'tomorrow', label: 'غداً', count: tomorrowEvents.length },
                  { id: 'special', label: 'المميزة', count: nonRoutineUpcomingEvents.length },
                  { id: 'done', label: 'المنتهي', count: finishedTodayBlocks.length },
                ] as const
              ).map((tab) => {
                const active = timelineFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTimelineFilter(tab.id)}
                    className={`relative min-h-[40px] sm:min-h-[32px] px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1.5 select-none ${
                      active ? 'text-[#7FFFD4] font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="schedule-filter-pill"
                        transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                        className="absolute inset-0 rounded-lg bg-[#7FFFD4]/10 border border-[#7FFFD4]/20"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                    <span className="relative z-10 font-mono-tabular text-[11px] opacity-75">
                      {tab.count}
                    </span>
                    {tab.id === 'today' && dayTimelineModel.unplacedBlocks.length > 0 && (
                      <span
                        aria-label={`${dayTimelineModel.unplacedBlocks.length} عناصر تحتاج توظيف`}
                        className="relative z-10 px-1.5 py-0.2 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-mono-tabular font-bold"
                      >
                        {dayTimelineModel.unplacedBlocks.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Clean Trash Drawer */}
            {showTrash && deletedBlocks.length > 0 && (
              <div className="mt-3 rounded-xl border border-white/[0.08] bg-black/50 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-zinc-200">محذوفات اليوم</span>
                  <button
                    type="button"
                    onClick={onRestoreAllDeleted}
                    className="text-xs text-[#7FFFD4] hover:underline cursor-pointer"
                  >
                    استعادة الكل
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {deletedBlocks.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onRestoreBlock(b.id)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-zinc-200 hover:border-[#7FFFD4]/50 cursor-pointer"
                    >
                      <span>{b.emojiPair}</span>
                      <span className="font-mono-tabular text-zinc-400">
                        {formatMinutes12h(b.startMin, language)}
                      </span>
                      <RotateCcw className="w-3 h-3 text-[#7FFFD4]" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Disconnected Empty Prompt */}
            {!calendarConnected && !useOfflineDemo && (
              <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-zinc-300">
                  سجّل الدخول بحساب Google لعرض جدولك ومهامك الفعلية.
                </div>
                <button
                  type="button"
                  onClick={onToggleOfflineDemo}
                  className="px-3 py-1.5 rounded-lg border border-white/15 text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                >
                  عرض نموذج مؤقت
                </button>
              </div>
            )}

            {/* Tomorrow Prep View */}
              {timelineFilter === 'tomorrow' || timelineFilter === 'special' ? (
                <TomorrowSpecialTimeline d={d} />
              ) : (
                <TodayScheduleList d={d} />
              )}
            </>
            ) : (
              <TasksTabPanel d={d} />
            )}
          </section>
          </ErrorBoundary>
    </>
  );
};
