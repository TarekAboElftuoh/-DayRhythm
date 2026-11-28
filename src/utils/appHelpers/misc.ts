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
  ['habits'],
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


