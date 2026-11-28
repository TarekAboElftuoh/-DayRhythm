import type React from 'react';
import type {
  CalendarActionProposal,
  CalendarExecutionResult,
  DynamicHabit,
  DynamicHabitAnchor,
  DynamicHabitDailyOverride,
  DynamicHabitStatus,
  GoogleTaskItem,
  ScheduleBlock,
  TaskActionProposal,
  TaskExecutionResult,
} from '../../types/dayrhythm';
import type { DayTimelinePlacedItem, DayTimelineUnplacedItem } from '../../engines/lifeRhythmEngine';

export function useTimelineMoves({
  todayCairoIso,
  calendarConnected,
  setIsSyncingAutoPlace,
  setAutoPlacedBlockStarts,
  setUnplacedLocalBlockIds,
  onUpdateHabit,
  onExecuteCalendarActions,
  onExecuteTaskActions,
}: {
  todayCairoIso: string;
  calendarConnected: boolean;
  setIsSyncingAutoPlace: React.Dispatch<React.SetStateAction<boolean>>;
  setAutoPlacedBlockStarts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setUnplacedLocalBlockIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onUpdateHabit?: (
    id: string,
    patch: {
      title: string;
      status: DynamicHabitStatus;
      anchor: DynamicHabitAnchor;
      durationMin: number;
      daysOfWeek?: number[];
      skipOnFasting?: boolean;
      dailyOverrides?: Record<string, DynamicHabitDailyOverride>;
    }
  ) => void;
  onExecuteCalendarActions: (
    actions: CalendarActionProposal[]
  ) => Promise<{ googleSynced: boolean; results: CalendarExecutionResult[] }>;
  onExecuteTaskActions: (
    taskActions: TaskActionProposal[]
  ) => Promise<{ googleSynced: boolean; results: TaskExecutionResult[] }>;
}) {
  const handleConfirmAutoPlace = async (items: DayTimelineUnplacedItem[]) => {
    if (items.length === 0) return;
    setIsSyncingAutoPlace(true);
    try {
      const calendarUpdates: CalendarActionProposal[] = [];
      const taskUpdates: TaskActionProposal[] = [];
      const localBlockMoves: Record<string, number> = {};

      for (const item of items) {
        if (!item.suggestedSlot) continue;
        if (item.kind === 'habit' && item.habit && onUpdateHabit) {
          onUpdateHabit(item.habit.id, {
            title: item.habit.title,
            status: item.habit.status,
            anchor: item.suggestedSlot.suggestedAnchor ?? 'any-free-slot',
            durationMin: item.habit.durationMin,
            daysOfWeek: item.habit.daysOfWeek,
            skipOnFasting: item.habit.skipOnFasting,
          });
        } else if (item.kind === 'task' && item.googleTask) {
          const cleanedNotes = (item.googleTask.notes ?? '').replace(/(?:⏰|@)\s*\d{1,2}:\d{2}/g, '').trim();
          taskUpdates.push({
            operation: 'update',
            taskId: item.googleTask.id,
            taskListId: item.googleTask.taskListId,
            title: item.googleTask.title,
            notes: `${cleanedNotes ? `${cleanedNotes}\n` : ''}⏰ ${item.suggestedSlot.time24}`,
            dueDateIso: todayCairoIso,
          });
        } else if (item.kind === 'event' && item.scheduleBlock) {
          if (item.scheduleBlock.googleEventId && calendarConnected) {
            calendarUpdates.push({
              operation: 'update',
              eventId: item.scheduleBlock.googleEventId,
              calendarId: item.scheduleBlock.googleCalendarId,
              title: item.title,
              dateIso: todayCairoIso,
              startTime24: item.suggestedSlot.time24,
              durationMinutes: item.durationMin,
            });
          } else {
            localBlockMoves[item.scheduleBlock.id] = item.suggestedSlot.startMin;
          }
        }
      }

      if (Object.keys(localBlockMoves).length > 0) {
        setAutoPlacedBlockStarts((prev) => ({ ...prev, ...localBlockMoves }));
        setUnplacedLocalBlockIds((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(localBlockMoves)) delete next[k];
          return next;
        });
      }
      if (calendarUpdates.length > 0) await onExecuteCalendarActions(calendarUpdates);
      if (taskUpdates.length > 0) await onExecuteTaskActions(taskUpdates);
    } finally {
      setIsSyncingAutoPlace(false);
    }
  };

  const handleCommitHabitMove = async (
    habit: DynamicHabit,
    scope: 'today' | 'permanent',
    slot: { startMin: number; durationMin: number; suggestedAnchor: DynamicHabitAnchor }
  ) => {
    if (!onUpdateHabit) return;
    if (scope === 'today') {
      const nextOverrides: Record<string, DynamicHabitDailyOverride> = {
        ...(habit.dailyOverrides ?? {}),
        [todayCairoIso]: { startMin: slot.startMin, durationMin: slot.durationMin, unplaced: false, updatedAtMs: Date.now() },
      };
      onUpdateHabit(habit.id, {
        title: habit.title, status: habit.status, anchor: habit.anchor, durationMin: habit.durationMin,
        daysOfWeek: habit.daysOfWeek, skipOnFasting: habit.skipOnFasting, dailyOverrides: nextOverrides,
      });
      return;
    }
    const nextOverrides = { ...(habit.dailyOverrides ?? {}) };
    delete nextOverrides[todayCairoIso];
    onUpdateHabit(habit.id, {
      title: habit.title, status: habit.status, anchor: slot.suggestedAnchor, durationMin: habit.durationMin,
      daysOfWeek: habit.daysOfWeek, skipOnFasting: habit.skipOnFasting, dailyOverrides: nextOverrides,
    });
  };

  const handleCommitTimelineItemMove = async (
    item: { kind: 'task' | 'event'; title: string; durationMin: number; googleTask?: GoogleTaskItem; scheduleBlock?: ScheduleBlock },
    slot: { startMin: number; time24: string }
  ) => {
    setIsSyncingAutoPlace(true);
    try {
      if (item.kind === 'task' && item.googleTask) {
        const cleanedNotes = (item.googleTask.notes ?? '').replace(/(?:⏰|@)\s*\d{1,2}:\d{2}/g, '').trim();
        await onExecuteTaskActions([{
          operation: 'update', taskId: item.googleTask.id, taskListId: item.googleTask.taskListId,
          title: item.googleTask.title, notes: `${cleanedNotes ? `${cleanedNotes}\n` : ''}⏰ ${slot.time24}`, dueDateIso: todayCairoIso,
        }]);
      } else if (item.kind === 'event' && item.scheduleBlock) {
        if (item.scheduleBlock.googleEventId && calendarConnected) {
          await onExecuteCalendarActions([{
            operation: 'update', eventId: item.scheduleBlock.googleEventId, calendarId: item.scheduleBlock.googleCalendarId,
            title: item.title, dateIso: todayCairoIso, startTime24: slot.time24, durationMinutes: item.durationMin,
          }]);
        } else {
          const blkId = item.scheduleBlock.id;
          setUnplacedLocalBlockIds((prev) => {
            if (!prev[blkId]) return prev;
            const next = { ...prev };
            delete next[blkId];
            return next;
          });
          setAutoPlacedBlockStarts((prev) => ({ ...prev, [blkId]: slot.startMin }));
        }
      }
    } finally {
      setIsSyncingAutoPlace(false);
    }
  };

  const handleMoveTimelineItemToUnplaced = async (item: DayTimelinePlacedItem) => {
    if (item.kind === 'habit' && item.habit && onUpdateHabit) {
      const nextOverrides: Record<string, DynamicHabitDailyOverride> = {
        ...(item.habit.dailyOverrides ?? {}),
        [todayCairoIso]: { unplaced: true, updatedAtMs: Date.now() },
      };
      onUpdateHabit(item.habit.id, {
        title: item.habit.title, status: item.habit.status, anchor: item.habit.anchor, durationMin: item.habit.durationMin,
        daysOfWeek: item.habit.daysOfWeek, skipOnFasting: item.habit.skipOnFasting, dailyOverrides: nextOverrides,
      });
      return;
    }
    if (item.kind === 'task' && item.googleTask) {
      const cleanedNotes = (item.googleTask.notes ?? '').replace(/(?:⏰|@)\s*\d{1,2}:\d{2}/g, '').trim();
      await onExecuteTaskActions([{
        operation: 'update', taskId: item.googleTask.id, taskListId: item.googleTask.taskListId,
        title: item.googleTask.title, notes: cleanedNotes, dueDateIso: todayCairoIso,
      }]);
      return;
    }
    if (item.kind === 'event' && item.scheduleBlock) {
      setUnplacedLocalBlockIds((prev) => ({ ...prev, [item.scheduleBlock!.id]: true }));
    }
  };

  return { handleConfirmAutoPlace, handleCommitHabitMove, handleCommitTimelineItemMove, handleMoveTimelineItemToUnplaced };
}
