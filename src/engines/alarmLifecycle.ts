/**
 * What an alarm/Google-Calendar must do when a scheduled item leaves the schedule.
 *
 * Delete = remove from schedule + cancel its alarm + delete the synced Google Calendar event.
 * Done   = dismiss its alarm only; the Google Calendar event stays intact.
 */
import type { ScheduleBlock } from '../types/dayrhythm';
import { occurrenceKey } from './alarmOccurrence';

export interface GoogleEventDeletion {
  deleteGoogleEvent: boolean;
  googleEventId?: string;
}

export interface BlockAlarmLifecycle extends GoogleEventDeletion {
  occurrenceKeys: string[];
}

export function resolveGoogleEventDeletion(
  block: Pick<ScheduleBlock, 'source' | 'googleEventId'>
): GoogleEventDeletion {
  const syncedEventId =
    block.source === 'google_calendar' && block.googleEventId ? block.googleEventId : undefined;
  return { deleteGoogleEvent: Boolean(syncedEventId), googleEventId: syncedEventId };
}

/** Same key the reminder gate uses, so dismissing it here cancels the pending ringing. */
export function blockOccurrenceKeys(
  block: Pick<ScheduleBlock, 'id' | 'startMin'>,
  dateIso: string
): string[] {
  return [occurrenceKey(`event_${block.id}`, dateIso, block.startMin)];
}

export function resolveBlockDeleteActions(block: ScheduleBlock, dateIso: string): BlockAlarmLifecycle {
  return {
    occurrenceKeys: blockOccurrenceKeys(block, dateIso),
    ...resolveGoogleEventDeletion(block),
  };
}

export function resolveBlockCompleteActions(
  block: ScheduleBlock,
  dateIso: string
): BlockAlarmLifecycle {
  return {
    occurrenceKeys: blockOccurrenceKeys(block, dateIso),
    deleteGoogleEvent: false,
    googleEventId: undefined,
  };
}
