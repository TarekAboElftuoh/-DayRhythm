import type {
  CalendarActionProposal,
  CalendarExecutionResult,
  TaskActionProposal,
  TaskExecutionResult,
} from '../types/dayrhythm';
import { computeEventRangeInTimeZone } from '../engines/prayerEngine';
import { GOOGLE_SESSION_EXPIRED_AR } from '../utils/appHelpers';

export async function executeCalendarDirect(
  actions: CalendarActionProposal[],
  token: string,
  activeTimeZone: string,
  handleWorkspaceUnauthorized: () => void,
  showToast: (msg: string) => void
): Promise<CalendarExecutionResult[]> {
  const directResults: CalendarExecutionResult[] = [];
  for (const act of actions) {
    const calId = encodeURIComponent(act.calendarId || 'primary');
    if (act.operation === 'delete' && act.eventId) {
      const r = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(act.eventId)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (r.status === 401) {
        handleWorkspaceUnauthorized();
        showToast('انتهت صلاحية رمز Google Calendar — اضغط «تجديد ربط Google الآن» بضغطة واحدة');
        throw new Error(GOOGLE_SESSION_EXPIRED_AR);
      }
      if (!r.ok && r.status !== 404 && r.status !== 410) {
        throw new Error('تعذر حذف الحدث من Google Calendar.');
      }
      directResults.push({ operation: 'delete', title: act.title, status: 'deleted', id: act.eventId });
    } else if (act.operation === 'create' && act.dateIso && act.startTime24) {
      const { startDateTime, endDateTime } = computeEventRangeInTimeZone(
        act.dateIso, act.startTime24, act.durationMinutes, activeTimeZone
      );
      const validByDays = Array.isArray(act.byDays)
        ? act.byDays.filter((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].includes(d))
        : [];
      const recurrence =
        act.recurrenceRule === 'DAILY'
          ? ['RRULE:FREQ=DAILY']
          : act.recurrenceRule === 'WEEKLY'
            ? [validByDays.length > 0 ? `RRULE:FREQ=WEEKLY;BYDAY=${validByDays.join(',')}` : 'RRULE:FREQ=WEEKLY']
            : undefined;
      const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: act.title,
          description: act.description || '',
          start: { dateTime: startDateTime, timeZone: activeTimeZone },
          end: { dateTime: endDateTime, timeZone: activeTimeZone },
          ...(recurrence ? { recurrence } : {}),
        }),
      });
      if (r.status === 401) {
        handleWorkspaceUnauthorized();
        showToast('انتهت صلاحية رمز Google Calendar — اضغط «تجديد ربط Google الآن» بضغطة واحدة');
        throw new Error(GOOGLE_SESSION_EXPIRED_AR);
      }
      if (!r.ok) throw new Error('تعذر إنشاء الحدث في Google Calendar.');
      const created = (await r.json()) as { id?: string; htmlLink?: string };
      directResults.push({ operation: 'create', title: act.title, status: 'created', id: created.id, htmlLink: created.htmlLink });
    } else if (act.operation === 'update' && act.eventId) {
      const body: Record<string, unknown> = { summary: act.title };
      if (act.description !== undefined) body.description = act.description;
      if (act.dateIso && act.startTime24) {
        const { startDateTime, endDateTime } = computeEventRangeInTimeZone(
          act.dateIso, act.startTime24, act.durationMinutes, activeTimeZone
        );
        body.start = { dateTime: startDateTime, timeZone: activeTimeZone };
        body.end = { dateTime: endDateTime, timeZone: activeTimeZone };
      }
      const r = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(act.eventId)}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (r.status === 401) {
        handleWorkspaceUnauthorized();
        showToast('انتهت صلاحية رمز Google Calendar — اضغط «تجديد ربط Google الآن» بضغطة واحدة');
        throw new Error(GOOGLE_SESSION_EXPIRED_AR);
      }
      if (!r.ok) throw new Error('تعذر تحديث الحدث في Google Calendar.');
      const updated = (await r.json()) as { id?: string; htmlLink?: string };
      directResults.push({
        operation: 'update', title: act.title, status: 'updated', id: updated.id || act.eventId, htmlLink: updated.htmlLink,
      });
    }
  }
  return directResults;
}

export async function executeTasksDirect(
  taskActions: TaskActionProposal[],
  token: string,
  handleWorkspaceUnauthorized: () => void,
  showToast: (msg: string) => void
): Promise<TaskExecutionResult[]> {
  const directResults: TaskExecutionResult[] = [];
  for (const act of taskActions) {
    const listId = encodeURIComponent(act.taskListId || '@default');
    if (act.operation === 'create') {
      const body: Record<string, unknown> = { title: act.title };
      if (act.notes) body.notes = act.notes;
      if (act.dueDateIso) body.due = `${act.dueDateIso}T00:00:00.000Z`;
      const r = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.status === 401) {
        handleWorkspaceUnauthorized();
        showToast('انتهت صلاحية رمز Google Tasks — اضغط «تجديد ربط Google الآن» في الأعلى');
        throw new Error(GOOGLE_SESSION_EXPIRED_AR);
      }
      if (!r.ok) throw new Error('تعذر إنشاء المهمة في Google Tasks.');
      const created = (await r.json()) as { id?: string };
      directResults.push({
        operation: 'create', title: act.title, status: 'created', id: created.id, taskListId: act.taskListId || '@default',
      });
    } else if (act.operation === 'delete' && act.taskId) {
      const r = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${encodeURIComponent(act.taskId)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (r.status === 401) {
        handleWorkspaceUnauthorized();
        showToast('انتهت صلاحية رمز Google Tasks — اضغط «تجديد ربط Google الآن» في الأعلى');
        throw new Error(GOOGLE_SESSION_EXPIRED_AR);
      }
      if (!r.ok && r.status !== 404) throw new Error('تعذر حذف المهمة من Google Tasks.');
      directResults.push({
        operation: 'delete', title: act.title, status: 'deleted', id: act.taskId, taskListId: act.taskListId || '@default',
      });
    } else if ((act.operation === 'complete' || act.operation === 'reopen' || act.operation === 'update') && act.taskId) {
      const body: Record<string, unknown> = {};
      if (act.operation === 'complete') body.status = 'completed';
      if (act.operation === 'reopen') {
        body.status = 'needsAction';
        body.completed = null;
      }
      if (act.operation === 'update') {
        body.title = act.title;
        if (act.notes !== undefined) body.notes = act.notes;
        if (act.dueDateIso) body.due = `${act.dueDateIso}T00:00:00.000Z`;
      }
      const r = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${encodeURIComponent(act.taskId)}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (r.status === 401) {
        handleWorkspaceUnauthorized();
        showToast('انتهت صلاحية رمز Google Tasks — اضغط «تجديد ربط Google الآن» في الأعلى');
        throw new Error(GOOGLE_SESSION_EXPIRED_AR);
      }
      if (!r.ok) throw new Error('تعذر تحديث المهمة في Google Tasks.');
      directResults.push({
        operation: act.operation, title: act.title, status: act.operation, id: act.taskId, taskListId: act.taskListId || '@default',
      });
    }
  }
  return directResults;
}
