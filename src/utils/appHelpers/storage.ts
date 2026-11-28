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

export const STORAGE_KEY = 'dayrhythm_state_v3';
export const CREATIVE_STORAGE_KEY = 'dayrhythm_creative_v1';
export const HABITS_STORAGE_KEY = 'dayrhythm_habits_v1';
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
    localStorage.removeItem(HABITS_STORAGE_KEY);
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

export function loadSavedHabits(): DynamicHabit[] {
  try {
    const raw = localStorage.getItem(HABITS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((h) => sanitizeDynamicHabit(h));
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_HABITS;
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

