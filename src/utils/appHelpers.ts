import {
  CalendarActionProposal,
  CalendarTombstone,
  CreativeActivityItem,
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
} from '../types/dayrhythm';
import type { CapsulePrefs } from '../components/FloatingPiPCapsule';
import {
  DEFAULT_CREATIVE_ACTIVITIES,
  DEFAULT_MEMORIES,
  sanitizeCreativeActivityItem,
  sanitizeMemoryItem,
  type SyncedRhythmPayload,
} from '../firebase';
import { MEDS_STORAGE_KEY } from '../hooks/useMedications';
import {
  getDateIsoInTimeZone,
  getNowMinutesInTimeZone,
  getTimeZoneOffsetString,
  parseIsoToTimeZoneInfo,
} from '../engines/prayerEngine';
import { clearGeminiClientCache, sanitizePersistedChats } from '../services/apiClient';
export const STORAGE_KEY = 'dayrhythm_state_v3';
export const CREATIVE_STORAGE_KEY = 'dayrhythm_creative_v1';
export const MEMORIES_STORAGE_KEY = 'dayrhythm_memories_v1';
export const CHAT_STORAGE_KEY = 'dayrhythm_gemini_chats_v1';
export const SILENT_NOTIFS_STORAGE_KEY = 'dayrhythm_silent_notifs_v1';
export const WATER_REMINDER_STORAGE_KEY = 'dayrhythm_water_reminders_v1';
export const ACTIVE_UID_STORAGE_KEY = 'dayrhythm_active_uid_v1';
export const SMART_CHARGE_KEEP_KEY = 'dayrhythm_smart_charge_keep_until_unplugged_v1';
export const OFFLINE_CAL_PREFIX = 'dayrhythm_offline_cal_v1_';
export const OFFLINE_TASKS_PREFIX = 'dayrhythm_offline_tasks_v1_';
export const OFFLINE_GMAIL_PREFIX = 'dayrhythm_offline_gmail_v1_';
export const CAPSULE_PREFS_STORAGE_KEY = 'dayrhythm_capsule_prefs_v1';

export function loadSavedCapsulePrefs(): CapsulePrefs {
  try {
    const raw = localStorage.getItem(CAPSULE_PREFS_STORAGE_KEY);
    if (!raw) return { orientation: 'horizontal', size: 'md' };
    const parsed = JSON.parse(raw) as Partial<CapsulePrefs>;
    return {
      orientation: parsed.orientation === 'vertical' ? 'vertical' : 'horizontal',
      size: parsed.size === 'sm' || parsed.size === 'lg' ? parsed.size : 'md',
    };
  } catch {
    return { orientation: 'horizontal', size: 'md' };
  }
}

export function formatUtcOffsetForIso(timeZone: string): string {
  return getTimeZoneOffsetString(timeZone);
}

export function saveOfflineWorkspaceCache<T>(prefix: string, uid: string | null | undefined, data: T): void {
  if (!uid) return;
  try {
    localStorage.setItem(`${prefix}${uid}`, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
}

export function loadOfflineWorkspaceCache<T>(prefix: string, uid: string | null | undefined): T | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(`${prefix}${uid}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function hasActiveSignedInSession(): boolean {
  try {
    return Boolean(localStorage.getItem(ACTIVE_UID_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function clearAllPersonalLocalStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(MEDS_STORAGE_KEY);
    localStorage.removeItem(CREATIVE_STORAGE_KEY);
    localStorage.removeItem(MEMORIES_STORAGE_KEY);
    localStorage.removeItem(CHAT_STORAGE_KEY);
    localStorage.removeItem(SILENT_NOTIFS_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_UID_STORAGE_KEY);
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith(OFFLINE_CAL_PREFIX) ||
          k.startsWith(OFFLINE_TASKS_PREFIX) ||
          k.startsWith(OFFLINE_GMAIL_PREFIX))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    clearGeminiClientCache();
  } catch {
    // ignore storage cleanup errors
  }
}

export const WELCOME_MESSAGE: PersistedChatMessage = {
  id: 'welcome-1',
  role: 'model',
  mode: 'chat',
  text: 'أهلاً بك في شات «إيقاع اليوم | DayRhythm» المربوط بـ Google Calendar و Google Tasks والدستور الشخصي وذاكرة Gemini السحابية الدائمة. سجّل دخولك بحساب Google لسحب بياناتك وخططك وأدويتك من السحابة تلقائياً، وأخبرني بأي معلومة أو قاعدة جديدة وسأحفظها في مخزونك السحابي كمرجع دائم.',
};

export function loadSavedChats(): PersistedChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return sanitizePersistedChats(parsed, WELCOME_MESSAGE);
    }
  } catch {
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // ignore storage cleanup error
    }
  }
  return [WELCOME_MESSAGE];
}

export function loadSavedCreativeActivities(): CreativeActivityItem[] {
  try {
    const raw = localStorage.getItem(CREATIVE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((a) => sanitizeCreativeActivityItem(a));
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_CREATIVE_ACTIVITIES;
}

export function loadSavedMemories(): MemoryItem[] {
  try {
    const raw = localStorage.getItem(MEMORIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((m) => sanitizeMemoryItem(m));
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_MEMORIES;
}

export function loadSavedSilentNotifications(): SilentNotificationItem[] {
  try {
    const raw = localStorage.getItem(SILENT_NOTIFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 25);
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

export function getLast7DayLabels(timeZone = 'Africa/Cairo'): string[] {
  const now = new Date();
  const map: Record<string, string> = {
    Sun: 'الأحد',
    Mon: 'الإثنين',
    Tue: 'الثلاثاء',
    Wed: 'الأربعاء',
    Thu: 'الخميس',
    Fri: 'الجمعة',
    Sat: 'السبت',
  };
  return Array.from({ length: 7 }, (_, i) => {
    if (i === 6) return 'اليوم';
    const d = new Date(now.getTime() - (6 - i) * 86_400_000);
    let weekdayEn = '';
    try {
      weekdayEn = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
      }).format(d);
    } catch {
      weekdayEn = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Cairo',
        weekday: 'short',
      }).format(d);
    }
    return map[weekdayEn] ?? 'يوم';
  });
}

export function buildInitialHydrationHistory(
  targetCups: number,
  timeZone = 'Africa/Cairo'
): HydrationDayLog[] {
  const labels = getLast7DayLabels(timeZone);
  const todayIso = getDateIsoInTimeZone(timeZone);

  return labels.map((labelAr, idx) => ({
    dateKey: idx === 6 ? todayIso : `day-${idx}`,
    labelAr,
    cupsLogged: 0,
    targetCups,
    slots: Array.from({ length: targetCups }, () => false),
  }));
}

export function rollOverHydrationHistoryIfNeeded(
  history: HydrationDayLog[],
  targetCups: number,
  timeZone = 'Africa/Cairo'
): HydrationDayLog[] {
  const todayIso = getDateIsoInTimeZone(timeZone);
  const labels = getLast7DayLabels(timeZone);
  const last = history[history.length - 1];
  if (last && last.dateKey === todayIso) {
    return history.map((d, idx) => ({ ...d, labelAr: labels[idx] ?? d.labelAr }));
  }
  // New day in user's active timezone started: shift history left and start today fresh at 0 cups
  const shiftedCounts = [...history.slice(1).map((d) => d.cupsLogged), 0];
  return labels.map((labelAr, idx) => {
    const c = Math.min(targetCups, shiftedCounts[idx] ?? 0);
    return {
      dateKey: idx === 6 ? todayIso : `day-${idx}`,
      labelAr,
      cupsLogged: c,
      targetCups,
      slots: Array.from({ length: targetCups }, (_, sIdx) => sIdx < c),
    };
  });
}

/**
 * Gemini sometimes invents an event id (e.g. "test_event_123") when the target event was not in
 * its context. Google then answers 404 on DELETE, which the executor treats as "already deleted",
 * so the user saw "done" while nothing changed. Resolve every update/delete target against the
 * events we actually fetched: exact id first, then exact title (+ date when given), and refuse
 * clearly when the event can't be found or the title is ambiguous.
 */
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

export const SKIP_PATTERN_STORAGE_KEY = 'dayrhythm_skip_pattern_counts_v1';

// Fields that only make sense together are written together (a cup count without its date key
// could land on the wrong day).
export const RHYTHM_FIELD_GROUPS: ReadonlyArray<ReadonlyArray<keyof SyncedRhythmPayload>> = [
  [
    'hydrationDateKey',
    'cupsLogged',
    'targetCups',
    'hydrationWeeklyCounts',
    'hydrationSlotOpIds',
    'hydrationRemovedOpIds',
    'hydrationUpdatedAtMs',
  ],
  ['dailyCommitmentDays', 'dailyCommitmentDoneToday', 'waterTargetDays', 'waterTargetDoneToday'],
  ['quietMode'],
  ['adhanOverrideSilent'],
  ['surfaceTheme'],
  ['deviceSettings'],
  ['lifeProfile'],
  ['uiPrefs'],
  ['appSettings'],
  ['medications'],
  ['creativeActivities'],
  ['memories'],
  ['completedOverrides'],
  ['fastingOverride'],
  ['isFridayMode'],
  ['includeBiweeklyPcCleanup'],
  ['periodicRituals'],
  ['travelState'],
  ['pomodoro'],
];

export function serializeRhythmFields(p: SyncedRhythmPayload): Record<string, string> {
  const out: Record<string, string> = {};
  for (const group of RHYTHM_FIELD_GROUPS) {
    for (const key of group) out[key] = JSON.stringify(p[key] ?? null);
  }
  return out;
}

/** Stable key for a block title across days (strips emoji/whitespace so "☕ 😌 استراحة" always matches itself). */
export function normalizeSkipPatternKey(titleAr: string): string {
  return titleAr
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[️‍\s]/g, '')
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

export function detectIsMobileDeviceClient(): boolean {
  if (typeof window === 'undefined') return false;
  // The Android APK always exposes this native bridge.
  if ((window as Window & { DayRhythmNative?: unknown }).DayRhythmNative) return true;
  const ua = navigator.userAgent || '';
  // NOTE: never decide by window width. A narrow PC window used to be treated as the phone,
  // which published the PC's battery as "phone battery" (false "unplug the charger" alerts)
  // and let the PC overwrite the phone's GPS location.
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

export function extractTaskTimeMinutesForToday(
  task: GoogleTaskItem,
  todayDateIso: string,
  timeZone = 'Africa/Cairo'
): { startMin: number; hasExplicitTime: boolean } | null {
  if (task.status === 'completed') return null;

  // Check if due date exists and belongs to another day
  if (task.due) {
    const dueDateOnly = task.due.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueDateOnly) && dueDateOnly !== todayDateIso) {
      return null;
    }
    // Check if Google Tasks due timestamp carries a non-midnight time
    const timePartMatch = task.due.match(/T(\d{2}):(\d{2})/);
    if (timePartMatch && !(timePartMatch[1] === '00' && timePartMatch[2] === '00')) {
      const parsed = parseIsoToTimeZoneInfo(task.due, timeZone);
      if (parsed && parsed.dateIso === todayDateIso) {
        return { startMin: parsed.minutesSinceMidnight, hasExplicitTime: true };
      }
    }
  }

  // Extract explicit time from notes or title (supports ⏰ 14:30, @14:30, [14:30], 2:30 م, 2:30 pm, 14:30)
  const combined = `${task.notes || ''} ${task.title || ''}`;
  const tagged24 = combined.match(/(?:⏰|@|\[)\s*(\d{1,2}):(\d{2})\s*\]?/);
  if (tagged24) {
    const h = Number(tagged24[1]);
    const m = Number(tagged24[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { startMin: h * 60 + m, hasExplicitTime: true };
    }
  }

  const time12Match = combined.match(/(\d{1,2}):(\d{2})\s*(ص|صباحاً|صباحا|م|مساءً|مساءا|مساء|am|pm)\b/i);
  if (time12Match) {
    let h = Number(time12Match[1]);
    const m = Number(time12Match[2]);
    const marker = time12Match[3].toLowerCase();
    const isPm = marker.startsWith('م') || marker === 'pm';
    if (h >= 1 && h <= 12 && m >= 0 && m <= 59) {
      if (isPm && h !== 12) h += 12;
      if (!isPm && h === 12) h = 0;
      return { startMin: h * 60 + m, hasExplicitTime: true };
    }
  }

  const plain24 = combined.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (plain24) {
    const h = Number(plain24[1]);
    const m = Number(plain24[2]);
    return { startMin: h * 60 + m, hasExplicitTime: true };
  }

  // Due today without explicit clock time
  if (task.due && task.due.slice(0, 10) === todayDateIso) {
    return { startMin: -1, hasExplicitTime: false };
  }

  return null;
}

export const INITIAL_TOMBSTONES: CalendarTombstone[] = [];

export const INITIAL_PERIODIC_RITUALS: PeriodicRitualStatus[] = [
  {
    id: 'room_weekly',
    emojiPair: '🧹 🛏️',
    titleAr: 'تنظيف الغرفة الأسبوعي',
    titleEn: 'Weekly Room Cleanup',
    intervalDays: 7,
    timeLabelAr: 'أسبوعياً',
    daysSinceLast: 0,
    lastCompletedIso: '',
  },
  {
    id: 'pc_biweekly',
    emojiPair: '💻 🧼',
    titleAr: 'ترتيب وتنظيف المكتب/الجهاز',
    titleEn: 'Biweekly Workspace Cleanup',
    intervalDays: 14,
    timeLabelAr: 'كل أسبوعين',
    daysSinceLast: 0,
    lastCompletedIso: '',
  },
  {
    id: 'personal_monthly',
    emojiPair: '✂️ 🚿',
    titleAr: 'العناية الدورية (كل 30 يوماً)',
    titleEn: 'Monthly Care Cycle (30d)',
    intervalDays: 30,
    timeLabelAr: 'كل 30 يوماً',
    daysSinceLast: 0,
    lastCompletedIso: '',
  },
];

export const INITIAL_CHANGELOG: SharedChangelogEntry[] = [];

export function extractEmojiPair(summary: string, fallback = '📅'): string {
  const tokens = summary.trim().split(/\s+/).filter(Boolean);
  const emojiRe = /\p{Extended_Pictographic}/u;
  const leading: string[] = [];
  for (const tok of tokens) {
    // Token is purely emoji / variation selectors / ZWJ
    const stripped = tok.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '');
    if (emojiRe.test(tok) && stripped.length === 0) {
      leading.push(tok);
      if (leading.length === 3) break;
    } else {
      break;
    }
  }
  if (leading.length > 0) {
    return leading.join(' ');
  }
  if (tokens.length > 0 && emojiRe.test(tokens[0])) {
    return tokens[0];
  }
  return fallback;
}

