import React from 'react';
import { Trash2, CheckCircle2, Circle, Volume2, Calendar, ExternalLink } from 'lucide-react';
import { DayTimelineView } from '../DayTimelineView';
import type { DayTimelinePlacedItem } from '../../engines/lifeRhythmEngine';
import { classifyTaskSound } from '../../engines/audioEngine';
import { formatMinutes12h } from '../../engines/prayerEngine';
import { resolveBlockDisplayInfo } from '../../services/apiClient';
import type { DashboardController } from './useDashboardController';

export const TodayScheduleList: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, prayers, blocks, onToggleComplete, onDeleteBlock, calendarConnected, calendarUserEmail, lifeProfile, dailyRhythmPlan, onTriggerTaskAlert, creativePlacements, lowEnergyActive, onToggleHabitToday, todayCairoIso, isSyncingAutoPlace, timelineFilter, setConfirmDeleteGoogleEv, setPendingTaskConfirmation, setPendingCreativeCalendarConfirm, nowMinutes, filteredBlocks, dayTimelineModel, formatDurationLabel, handleConfirmAutoPlace, handleCommitHabitMove, handleCommitTimelineItemMove, handleMoveTimelineItemToUnplaced,
  } = d;
  return (
    <>
              {/* Structured + Things 3 Vertical 24h Day Timeline */}
              <DayTimelineView
                model={dayTimelineModel}
                prayers={prayers}
                plan={dailyRhythmPlan}
                profile={lifeProfile}
                todayIso={todayCairoIso}
                language={language}
                nowMinutes={nowMinutes}
                isSyncingAutoPlace={isSyncingAutoPlace}
                onToggleBlockComplete={onToggleComplete}
                onToggleHabitToday={onToggleHabitToday}
                onCommitHabitMove={handleCommitHabitMove}
                onCommitItemMove={handleCommitTimelineItemMove}
                onMoveToUnplaced={handleMoveTimelineItemToUnplaced}
                onCompleteTask={(item: DayTimelinePlacedItem) => {
                  if (!item.googleTaskId) return;
                  setPendingTaskConfirmation({
                    operation: item.completed ? 'reopen' : 'complete',
                    taskId: item.googleTaskId,
                    taskListId: item.googleTaskListId,
                    title: item.title,
                  });
                }}
                onTriggerAlert={(title, emoji) => {
                  const cat = classifyTaskSound(title, emoji, false);
                  onTriggerTaskAlert(emoji, cat);
                }}
                onDeleteEventBlock={(item: DayTimelinePlacedItem) => {
                  if (item.googleEventId) {
                    const blk = blocks.find((b) => b.id === item.scheduleBlockId);
                    setConfirmDeleteGoogleEv({
                      id: item.googleEventId,
                      calendarId: item.googleCalendarId,
                      calendarTitle: blk?.calendarTitle,
                      summary: item.title,
                      start: blk?.startIso ?? '',
                      end: blk?.endIso ?? '',
                      description: blk?.description ?? '',
                    });
                  } else if (item.scheduleBlockId) {
                    onDeleteBlock(item.scheduleBlockId);
                  }
                }}
                onConfirmAutoPlace={handleConfirmAutoPlace}
              />
            ) : (
              /* Chronological Done Today List */
              <div className="divide-y divide-white/[0.06] mt-3">
                {filteredBlocks.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    لا توجد عناصر منتهية بعد.
                  </div>
                ) : (
                  filteredBlocks.map((block) => {
                    const isPostponed = block.reflowStatus === 'postponed_travel';
                    const isSkipped = block.reflowStatus === 'skipped';
                    const isGoogleEvent = block.source === 'google_calendar';
                    const isHappeningNow =
                      !block.completed &&
                      !block.isAllDay &&
                      block.startMin <= nowMinutes &&
                      block.startMin + Math.max(1, block.durationMin) > nowMinutes;
                    const display = resolveBlockDisplayInfo(block);
                    const showSecondaryCalendarLabel =
                      block.calendarTitle && block.calendarTitle !== calendarUserEmail;
                    // Everything under "المنتهي" is over — show it as done, not as an open circle.
                    const shownDone = block.completed || timelineFilter === 'done';

                    return (
                      <div
                        key={block.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 px-2 rounded-xl transition-colors hover:bg-white/[0.02] ${
                          isHappeningNow ? 'bg-[#7FFFD4]/[0.05] my-1 px-3 ring-1 ring-[#7FFFD4]/25' : ''
                        } ${
                          shownDone || isSkipped || isPostponed
                            ? 'opacity-50'
                            : lowEnergyActive && !block.isAnchor
                              ? 'opacity-75'
                              : ''
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => onToggleComplete(block.id)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-500 hover:text-[#7FFFD4] cursor-pointer shrink-0 -mt-0.5"
                            title={block.completed ? 'إعادة الفتح' : 'إنجاز'}
                          >
                            {shownDone ? (
                              <CheckCircle2 className="w-5 h-5 text-[#4ADE80]" />
                            ) : (
                              <Circle className="w-5 h-5" />
                            )}
                          </button>

                          <span className="text-xl shrink-0 leading-none mt-1">
                            {block.emojiPair}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-sm font-semibold leading-snug break-words ${
                                  block.isFridayRitual
                                    ? 'text-[#4ADE80]'
                                    : block.isAnchor
                                      ? 'text-[#7FFFD4]'
                                      : 'text-zinc-100'
                                }`}
                              >
                                {display.title}
                              </span>
                              {isHappeningNow && (
                                <span className="text-[11px] font-bold text-[#4ADE80]">
                                  · الآن
                                </span>
                              )}
                              {showSecondaryCalendarLabel && (
                                <span className="text-[11px] text-zinc-500">
                                  · {block.calendarTitle}
                                </span>
                              )}
                              {block.reflowStatus && (
                                <span className="text-[11px] text-amber-300">
                                  ·{' '}
                                  {block.reflowStatus === 'compressed'
                                    ? 'مضغوط'
                                    : block.reflowStatus === 'shifted_evening'
                                      ? 'للمساء'
                                      : block.reflowStatus === 'started_now'
                                        ? 'يبدأ الآن'
                                        : block.reflowStatus === 'postponed_travel'
                                          ? 'مؤجل للسفر'
                                          : 'تم تخطيه'}
                                </span>
                              )}
                            </div>

                            {display.detail && (
                              <div className="text-xs text-zinc-400 mt-0.5 leading-relaxed line-clamp-1 break-words">
                                {display.detail}
                              </div>
                            )}

                            <div className="font-mono-tabular text-xs text-zinc-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="whitespace-nowrap text-zinc-300">
                                {block.isAllDay
                                  ? 'طوال اليوم'
                                  : block.durationMin === 0
                                    ? formatMinutes12h(block.startMin, language)
                                    : `${formatMinutes12h(block.startMin, language)} – ${formatMinutes12h(block.startMin + block.durationMin, language)}`}
                              </span>
                              {!block.isAllDay && (
                                <span className="whitespace-nowrap">
                                  · {formatDurationLabel(block.durationMin)}
                                </span>
                              )}
                              {block.source === 'creative' && (
                                <span className="text-cyan-300/80">· وقت إبداعي</span>
                              )}
                              {block.id.startsWith('sunlight_') &&
                                block.description?.includes('غيوم كثيفة') && (
                                  <span className="text-zinc-400">· ☁️ غيوم كثيفة</span>
                                )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-1 shrink-0 pr-0">
                          {block.source === 'creative' && block.creativeActivityId && (
                            <button
                              type="button"
                              onClick={() => {
                                const placement = creativePlacements.find(
                                  (p) => p.activity.id === block.creativeActivityId
                                );
                                if (placement) setPendingCreativeCalendarConfirm(placement);
                              }}
                              className="min-h-[44px] sm:min-h-[32px] px-3 sm:px-2.5 py-1 rounded-lg border border-cyan-400/35 bg-cyan-400/10 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-400/20 cursor-pointer whitespace-nowrap"
                            >
                              تثبيت
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const cat = classifyTaskSound(
                                block.categoryAr,
                                block.emojiPair,
                                block.isAnchor
                              );
                              onTriggerTaskAlert(block.emojiPair, cat);
                            }}
                            className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-[#7FFFD4] hover:bg-white/[0.04] cursor-pointer"
                            title="تجربة التنبيه"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                          {block.googleHtmlLink && (
                            <a
                              href={block.googleHtmlLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-[#4ADE80] hover:bg-white/[0.04]"
                              title="فتح في Google Calendar"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          {isGoogleEvent && block.googleEventId ? (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDeleteGoogleEv({
                                  id: block.googleEventId!,
                                  calendarId: block.googleCalendarId,
                                  calendarTitle: block.calendarTitle,
                                  summary: display.title || block.categoryAr,
                                  start: block.startIso ?? '',
                                  end: block.endIso ?? '',
                                  description: block.description ?? '',
                                })
                              }
                              className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            !block.isAnchor &&
                            block.source !== 'creative' && (
                              <button
                                type="button"
                                onClick={() => onDeleteBlock(block.id)}
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                                title="حذف"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
    </>
  );
};
