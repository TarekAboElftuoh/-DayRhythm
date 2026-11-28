import React from 'react';
import { DayTimelineView } from '../DayTimelineView';
import type { DayTimelinePlacedItem } from '../../engines/lifeRhythmEngine';
import { classifyTaskSound } from '../../engines/audioEngine';
import type { DashboardController } from './useDashboardController';

export const TodayScheduleList: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, prayers, blocks, onToggleComplete, onDeleteBlock, lifeProfile, dailyRhythmPlan, onTriggerTaskAlert, onToggleHabitToday, todayCairoIso, isSyncingAutoPlace, setConfirmDeleteGoogleEv, setPendingTaskConfirmation, nowMinutes, dayTimelineModel, handleConfirmAutoPlace, handleCommitHabitMove, handleCommitTimelineItemMove, handleMoveTimelineItemToUnplaced,
  } = d;
  return (
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
  );
};
