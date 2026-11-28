import {
  CalendarActionProposal,
  CalendarTombstone,
  CreativeActivityItem,
  DynamicHabit,
  GoogleCalendarEventItem,
  GoogleTaskItem,
  HydrationDayLog,
  MemoryItem,
  PeriodicRitualStatus,
  PersistedChatMessage,
  ScheduleBlock,
  SharedChangelogEntry,
  SilentNotificationItem,
  TaskActionProposal,
} from '../../types/dayrhythm';
import type { CapsulePrefs } from '../../components/FloatingPiPCapsule';
import {
  DEFAULT_CREATIVE_ACTIVITIES,
  DEFAULT_HABITS,
  DEFAULT_MEMORIES,
  sanitizeCreativeActivityItem,
  sanitizeDynamicHabit,
  sanitizeMemoryItem,
  type SyncedRhythmPayload,
} from '../../firebase';
import { MEDS_STORAGE_KEY } from '../../hooks/useMedications';
import {
  getDateIsoInTimeZone,
  getNowMinutesInTimeZone,
  getTimeZoneOffsetString,
  parseIsoToTimeZoneInfo,
} from '../../engines/prayerEngine';
import { clearGeminiClientCache, sanitizePersistedChats } from '../../services/apiClient';
import { formatUtcOffsetForIso } from './storage';

export function resolveCalendarActionTargets(
  actions: CalendarActionProposal[],
  knownEvents: GoogleCalendarEventItem[]
): CalendarActionProposal[] {
  const norm = (s: string | undefined) => (s || '').replace(/\s+/g, ' ').trim();
  return actions.map((act) => {
    if (act.operation !== 'delete' && act.operation !== 'update' && act.operation !== 'shift') {
      return act;
    }
    const byId = act.eventId ? knownEvents.find((e) => e.id === act.eventId) : undefined;
    if (byId) {
      const finalId =
        act.applyToAllDays && byId.recurringEventId
          ? byId.recurringEventId
          : act.applyToAllDays && byId.id.includes('_')
            ? byId.id.split('_')[0]
            : byId.id;
      return { ...act, eventId: finalId, calendarId: byId.calendarId || act.calendarId };
    }
    const title = norm(act.title);
    let candidates = knownEvents.filter((e) => norm(e.summary) === title);
    if (act.dateIso && candidates.length > 1) {
      const sameDay = candidates.filter((e) => String(e.start).startsWith(act.dateIso!));
      if (sameDay.length > 0) candidates = sameDay;
    }
    if (candidates.length === 1) {
      const target = candidates[0];
      const finalId =
        act.applyToAllDays && target.recurringEventId
          ? target.recurringEventId
          : act.applyToAllDays && target.id.includes('_')
            ? target.id.split('_')[0]
            : target.id;
      return { ...act, eventId: finalId, calendarId: target.calendarId || act.calendarId };
    }
    throw new Error(
      candidates.length === 0
        ? `مش لاقي موعد «${title}» في تقويمك — حدّث الجدول واطلبها تاني.`
        : `فيه أكتر من موعد باسم «${title}» — قول اليوم والساعة بالظبط.`
    );
  });
}

/**
 * "Remind me in 5 minutes": Gemini only says how many minutes; the start time is computed here from
 * the device clock. Asking the model to do the clock arithmetic itself produced reminders at the
 * wrong time (a 5-minute request landed 10 minutes later).
 */
export function resolveRelativeCalendarStarts(
  actions: CalendarActionProposal[],
  timeZone: string
): CalendarActionProposal[] {
  return actions.map((act) => {
    const mins = Number(act.startInMinutes);
    if (!Number.isFinite(mins) || mins <= 0 || mins > 7 * 24 * 60) return act;
    // Round to the nearest whole minute (events are minute-precise).
    const target = new Date(Date.now() + Math.round(mins) * 60_000 + 30_000);
    const minuteOfDay = getNowMinutesInTimeZone(timeZone, target);
    const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
    const mm = String(minuteOfDay % 60).padStart(2, '0');
    return {
      ...act,
      dateIso: getDateIsoInTimeZone(timeZone, target),
      startTime24: `${hh}:${mm}`,
      durationMinutes:
        typeof act.durationMinutes === 'number' && act.durationMinutes >= 0
          ? act.durationMinutes
          : 15,
    };
  });
}

export interface QueuedGoogleOp {
  id: string;
  kind: 'calendar' | 'tasks';
  actions: CalendarActionProposal[] | TaskActionProposal[];
  createdAtMs: number;
}

export const GOOGLE_OFFLINE_QUEUE_KEY = 'dayrhythm_google_offline_queue_v1';

export function readGoogleOfflineQueue(): QueuedGoogleOp[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(GOOGLE_OFFLINE_QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? (parsed as QueuedGoogleOp[]) : [];
  } catch {
    return [];
  }
}

export function writeGoogleOfflineQueue(queue: QueuedGoogleOp[]): void {
  try {
    if (queue.length === 0) localStorage.removeItem(GOOGLE_OFFLINE_QUEUE_KEY);
    else localStorage.setItem(GOOGLE_OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore storage errors
  }
}

/** fetch() rejects with a TypeError ("Failed to fetch" / "Load failed") when there is no network. */
export function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return err instanceof TypeError && /fetch|network|load failed/i.test(err.message);
}

/** Same protection for Google Tasks: never act on a task id Gemini made up. */
export function resolveTaskActionTargets(
  actions: TaskActionProposal[],
  knownTasks: GoogleTaskItem[]
): TaskActionProposal[] {
  const norm = (s: string | undefined) => (s || '').replace(/\s+/g, ' ').trim();
  return actions.map((act) => {
    if (act.operation === 'create') return act;
    const byId = act.taskId ? knownTasks.find((t) => t.id === act.taskId) : undefined;
    if (byId) return { ...act, taskListId: byId.taskListId || act.taskListId };
    const candidates = knownTasks.filter((t) => norm(t.title) === norm(act.title));
    if (candidates.length === 1) {
      return { ...act, taskId: candidates[0].id, taskListId: candidates[0].taskListId };
    }
    throw new Error(
      candidates.length === 0
        ? `مش لاقي مهمة «${norm(act.title)}» — حدّث المهام واطلبها تاني.`
        : `فيه أكتر من مهمة باسم «${norm(act.title)}» — وضّح أنهي واحدة.`
    );
  });
}

export const GOOGLE_SESSION_EXPIRED_AR =
  'انتهت صلاحية ربط Google — اضغط «تجديد ربط Google الآن» ثم أعد المحاولة.';

