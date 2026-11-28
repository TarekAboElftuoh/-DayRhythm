/**
 * Side effects of the pure lifecycle decisions in alarmLifecycle.ts:
 * persist dismissed occurrenceKeys locally and delete the synced Google event on delete only.
 */
import type { ScheduleBlock } from '../types/dayrhythm';
import { markOccurrencesDismissed } from '../engines/alarmOccurrence';
import {
  resolveBlockCompleteActions,
  resolveBlockDeleteActions,
} from '../engines/alarmLifecycle';
import { getOrRefreshCalendarAccessToken } from '../services/googleCalendarAuth';

function persistDismissed(occurrenceKeys: string[], dateIso: string): string[] {
  if (occurrenceKeys.length > 0) markOccurrencesDismissed(occurrenceKeys, dateIso);
  return occurrenceKeys;
}

/** Done ("تم"): kill the alarm, keep the Google Calendar event. */
export function dismissBlockAlarmOccurrences(block: ScheduleBlock, dateIso: string): string[] {
  return persistDismissed(resolveBlockCompleteActions(block, dateIso).occurrenceKeys, dateIso);
}

/** Delete: kill the alarm for good (gate blocks the key even after a refresh). */
export function cancelBlockAlarmOccurrences(block: ScheduleBlock, dateIso: string): string[] {
  return persistDismissed(resolveBlockDeleteActions(block, dateIso).occurrenceKeys, dateIso);
}

/** Delete only: remove the linked Google Calendar event when the block came from Google. */
export async function deleteGoogleCalendarEventIfSynced(block: ScheduleBlock): Promise<boolean> {
  const eventId = resolveGoogleEventBlockId(block);
  if (!eventId) return false;
  try {
    const token = await getOrRefreshCalendarAccessToken();
    if (!token) return false;
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    return res.ok;
  } catch {
    return false;
  }
}

function resolveGoogleEventBlockId(block: ScheduleBlock): string | undefined {
  return resolveBlockDeleteActions(block, '').googleEventId;
}
