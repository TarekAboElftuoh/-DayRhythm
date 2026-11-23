/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { User } from 'firebase/auth';
import {
  ActiveSanctuaryState,
  ActiveTab,
  AppLanguage,
  BatteryGuardState,
  AppSettingsPatch,
  CalendarActionProposal,
  CalendarExecutionResult,
  CalendarTombstone,
  CreativeActivityActionProposal,
  CreativeActivityItem,
  CreativeActivityPlacement,
  CreativeCadence,
  CreativeExecutionResult,
  DayMode,
  DeletedWorkspaceSnapshot,
  DualStreaks,
  FreeTimeSlot,
  GmailDigestItem,
  GoogleCalendarEventItem,
  GoogleCalendarInfo,
  GoogleTaskItem,
  GoogleTaskList,
  HydrationDayLog,
  LifeProfile,
  MedicationActionProposal,
  MedicationExecutionResult,
  MedicationItem,
  MemoryActionProposal,
  MemoryCategory,
  MemoryItem,
  PeriodicRitualStatus,
  PersistedChatMessage,
  PhoneBatteryTelemetry,
  PomodoroState,
  QuietModeType,
  ScheduleBlock,
  SharedChangelogEntry,
  SilentNotificationItem,
  SoundRepeatSetting,
  SurfaceTheme,
  SyncTierMode,
  TaskActionProposal,
  TaskExecutionResult,
  TaskSoundCategory,
  TodayCalendarMeta,
  TomorrowAlertInfo,
  TravelState,
  UiPrefs,
  WeatherHydrationInfo,
  WorkspaceSyncSignal,
} from './types/dayrhythm';
import {
  getCalendarAccessToken,
  getOrRefreshCalendarAccessToken,
  initCalendarAuth,
  markCalendarTokenExpired,
  isCalendarTokenExpiringSoon,
  observeFirebaseUser,
  refreshGoogleCalendarToken,
  refreshGoogleCalendarTokenSilently,
  signInWithGoogleCalendar,
  signOutGoogleCalendar,
} from './services/googleCalendarAuth';
import {
  hasPermanentLink,
  isPermanentLinkAvailable,
  startPermanentLink,
} from './services/googleOfflineAccess';
import {
  apiFetchJson,
  cleanCalendarText,
  clearGeminiClientCache,
  BackendUnavailableError,
  getSavedCloudApiUrl,
  hasSameOriginBackend,
  resolveBlockDisplayInfo,
  sanitizePersistedChats,
  sortChatMessagesChronologically,
  syncSavedCloudApiUrlFromRemote,
} from './services/apiClient';
import {
  FullDayRhythmCloudBackup,
  loadFromGoogleDriveAppData,
  saveToGoogleDriveAppData,
} from './services/googleDriveStorage';
import {
  pushRhythmStateToTasks,
  pullRhythmStateFromTasks,
  VAULT_LIST_TITLE,
  SYNC_TASK_TITLE,
  type TasksVaultPayload,
} from './services/googleTasksVault';
import {
  DEFAULT_CREATIVE_ACTIVITIES,
  DEFAULT_DEVICE_SETTINGS,
  DEFAULT_MEDICATIONS,
  DEFAULT_MEMORIES,
  OnePlusDeviceSettings,
  publishPhoneBatteryTelemetry,
  getNativeCloudAuthPayload,
  publishWorkspaceSyncSignal,
  sanitizeCreativeActivityId,
  sanitizeCreativeActivityItem,
  sanitizeDeviceSettings,
  sanitizeLifeProfile,
  sanitizeMedicationId,
  sanitizeMedicationItem,
  sanitizeMemoryId,
  sanitizeMemoryItem,
  sanitizeRhythmPayload,
  sanitizeSoundRepeats,
  sanitizeUiPrefs,
  getCloudQuotaPausedUntil,
  type AppSyncSettings,
  type SyncedRhythmPayload,
  triggerFirestoreRecovery,
} from './firebase';
import {
  HOME_LOCATION,
  PRESET_LOCATIONS,
  calculateEgyptianPrayerTimes,
  formatIsoTo12h,
  formatMinutes12h,
  formatNow12hInTimeZone,
  getDateIsoInTimeZone,
  getNowMinutesInTimeZone,
  getTimeZoneUtcOffsetHours,
  getTodayCalendarMeta,
  getSpecialFastDay,
  getWeekdayInTimeZone,
  haversineDistanceKm,
  parseIsoToTimeZoneInfo,
  resolveOfflineCityName,
  reverseGeocodeCityName,
} from './engines/prayerEngine';
import {
  DEFAULT_LIFE_PROFILE,
  analyzeTomorrowAlert,
  buildLifeProfileGeminiSummary,
  computeCreativePlacements,
  computeDailyRhythmPlan,
  findFreeTimeSlotsForToday,
} from './engines/lifeRhythmEngine';
import { applyTravelMatrix, buildBaseSchedule } from './engines/scheduleEngine';
import {
  DEFAULT_SOUND_REPEATS,
  TASK_SOUND_META,
  classifyTaskSound,
  evaluateAudioSanctuary,
  playBatteryFullSignature,
  playSoftChime,
  playTaskSignature,
  startSmartChargeCompleteAlert,
  stopContinuousAlert,
  stopSmartChargeCompleteAlert,
} from './engines/audioEngine';
import { fetchOpenMeteoWeather, loadCachedWeather } from './engines/weatherEngine';
import { triggerHapticWaveform } from './engines/hapticsEngine';
import { TopBar } from './components/TopBar';
import { DashboardView } from './components/DashboardView';
import { MobilePreviewView } from './components/MobilePreviewView';
import {
  DEFAULT_LOGO_ID,
  LogoPickerModal,
  SELECTED_LOGO_STORAGE_KEY,
  getLogoConceptById,
} from './components/LogoPickerModal';
import { OverlaySimulatorView } from './components/OverlaySimulatorView';
import { GeminiAssistantView } from './components/GeminiAssistantView';
import { TravelModeModal } from './components/TravelModeModal';
import { SmartCatchUpModal } from './components/SmartCatchUpModal';
import { PomodoroModal } from './components/PomodoroModal';
import {
  FloatingPiPCapsule,
  CapsulePrefs,
  CapsuleTrackInfo,
} from './components/FloatingPiPCapsule';
import { LifeProfileModal } from './components/LifeProfileModal';
import { trueNowMs } from './engines/trueClock';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  PersistentAlertItem,
  PersistentAlertOverlay,
} from './components/PersistentAlertOverlay';

const STORAGE_KEY = 'dayrhythm_state_v3';
const MEDS_STORAGE_KEY = 'dayrhythm_medications_v1';
const CREATIVE_STORAGE_KEY = 'dayrhythm_creative_v1';
const MEMORIES_STORAGE_KEY = 'dayrhythm_memories_v1';
const CHAT_STORAGE_KEY = 'dayrhythm_gemini_chats_v1';
const SILENT_NOTIFS_STORAGE_KEY = 'dayrhythm_silent_notifs_v1';
const WATER_REMINDER_STORAGE_KEY = 'dayrhythm_water_reminders_v1';
const ACTIVE_UID_STORAGE_KEY = 'dayrhythm_active_uid_v1';
const SMART_CHARGE_KEEP_KEY = 'dayrhythm_smart_charge_keep_until_unplugged_v1';
const OFFLINE_CAL_PREFIX = 'dayrhythm_offline_cal_v1_';
const OFFLINE_TASKS_PREFIX = 'dayrhythm_offline_tasks_v1_';
const OFFLINE_GMAIL_PREFIX = 'dayrhythm_offline_gmail_v1_';
const CAPSULE_PREFS_STORAGE_KEY = 'dayrhythm_capsule_prefs_v1';

function loadSavedCapsulePrefs(): CapsulePrefs {
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

function formatUtcOffsetForIso(timeZone: string): string {
  const offsetHours = getTimeZoneUtcOffsetHours(timeZone);
  const sign = offsetHours >= 0 ? '+' : '-';
  const absTotalMin = Math.round(Math.abs(offsetHours) * 60);
  const hh = String(Math.floor(absTotalMin / 60)).padStart(2, '0');
  const mm = String(absTotalMin % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

function saveOfflineWorkspaceCache<T>(prefix: string, uid: string | null | undefined, data: T): void {
  if (!uid) return;
  try {
    localStorage.setItem(`${prefix}${uid}`, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
}

function loadOfflineWorkspaceCache<T>(prefix: string, uid: string | null | undefined): T | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(`${prefix}${uid}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function hasActiveSignedInSession(): boolean {
  try {
    return Boolean(localStorage.getItem(ACTIVE_UID_STORAGE_KEY));
  } catch {
    return false;
  }
}

function clearAllPersonalLocalStorage(): void {
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

const WELCOME_MESSAGE: PersistedChatMessage = {
  id: 'welcome-1',
  role: 'model',
  mode: 'chat',
  text: 'أهلاً بك في شات «إيقاع اليوم | DayRhythm» المربوط بـ Google Calendar و Google Tasks والدستور الشخصي وذاكرة Gemini السحابية الدائمة. سجّل دخولك بحساب Google لسحب بياناتك وخططك وأدويتك من السحابة تلقائياً، وأخبرني بأي معلومة أو قاعدة جديدة وسأحفظها في مخزونك السحابي كمرجع دائم.',
};

function loadSavedChats(): PersistedChatMessage[] {
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

function loadSavedMedications(): MedicationItem[] {
  try {
    const raw = localStorage.getItem(MEDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((m) => sanitizeMedicationItem(m));
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_MEDICATIONS;
}

function loadSavedCreativeActivities(): CreativeActivityItem[] {
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

function loadSavedMemories(): MemoryItem[] {
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

function loadSavedSilentNotifications(): SilentNotificationItem[] {
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

function getLast7DayLabels(timeZone = 'Africa/Cairo'): string[] {
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

function buildInitialHydrationHistory(
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

function rollOverHydrationHistoryIfNeeded(
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
function resolveCalendarActionTargets(
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
function resolveRelativeCalendarStarts(
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
      durationMinutes: act.durationMinutes && act.durationMinutes > 0 ? act.durationMinutes : 15,
    };
  });
}

interface QueuedGoogleOp {
  id: string;
  kind: 'calendar' | 'tasks';
  actions: CalendarActionProposal[] | TaskActionProposal[];
  createdAtMs: number;
}

const GOOGLE_OFFLINE_QUEUE_KEY = 'dayrhythm_google_offline_queue_v1';

function readGoogleOfflineQueue(): QueuedGoogleOp[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(GOOGLE_OFFLINE_QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? (parsed as QueuedGoogleOp[]) : [];
  } catch {
    return [];
  }
}

function writeGoogleOfflineQueue(queue: QueuedGoogleOp[]): void {
  try {
    if (queue.length === 0) localStorage.removeItem(GOOGLE_OFFLINE_QUEUE_KEY);
    else localStorage.setItem(GOOGLE_OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore storage errors
  }
}

/** fetch() rejects with a TypeError ("Failed to fetch" / "Load failed") when there is no network. */
function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return err instanceof TypeError && /fetch|network|load failed/i.test(err.message);
}

/** Same protection for Google Tasks: never act on a task id Gemini made up. */
function resolveTaskActionTargets(
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

const GOOGLE_SESSION_EXPIRED_AR =
  'انتهت صلاحية ربط Google — اضغط «تجديد ربط Google الآن» ثم أعد المحاولة.';

const SKIP_PATTERN_STORAGE_KEY = 'dayrhythm_skip_pattern_counts_v1';

// Fields that only make sense together are written together (a cup count without its date key
// could land on the wrong day).
const RHYTHM_FIELD_GROUPS: ReadonlyArray<ReadonlyArray<keyof SyncedRhythmPayload>> = [
  ['hydrationDateKey', 'cupsLogged', 'targetCups', 'hydrationWeeklyCounts'],
  ['dailyCommitmentDays', 'dailyCommitmentDoneToday', 'waterTargetDays', 'waterTargetDoneToday'],
  ['quietMode'],
  ['adhanOverrideSilent'],
  ['surfaceTheme'],
  ['deviceSettings'],
  ['lifeProfile'],
  ['uiPrefs'],
];

function serializeRhythmFields(p: SyncedRhythmPayload): Record<string, string> {
  const out: Record<string, string> = {};
  for (const group of RHYTHM_FIELD_GROUPS) {
    for (const key of group) out[key] = JSON.stringify(p[key] ?? null);
  }
  return out;
}

/** Stable key for a block title across days (strips emoji/whitespace so "☕ 😌 استراحة" always matches itself). */
function normalizeSkipPatternKey(titleAr: string): string {
  return titleAr
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[️‍\s]/g, '')
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

function detectIsMobileDeviceClient(): boolean {
  if (typeof window === 'undefined') return false;
  // The Android APK always exposes this native bridge.
  if ((window as Window & { DayRhythmNative?: unknown }).DayRhythmNative) return true;
  const ua = navigator.userAgent || '';
  // NOTE: never decide by window width. A narrow PC window used to be treated as the phone,
  // which published the PC's battery as "phone battery" (false "unplug the charger" alerts)
  // and let the PC overwrite the phone's GPS location.
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

function extractTaskTimeMinutesForToday(
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

const INITIAL_TOMBSTONES: CalendarTombstone[] = [];

const INITIAL_PERIODIC_RITUALS: PeriodicRitualStatus[] = [
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

const INITIAL_CHANGELOG: SharedChangelogEntry[] = [];

function extractEmojiPair(summary: string, fallback = '📅'): string {
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

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  useEffect(() => {
    const isMobilePlatform =
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      window.innerWidth < 768;
    if (
      activeTab === 'blueprint' ||
      (isMobilePlatform && activeTab === 'overlay') ||
      (!isMobilePlatform && activeTab === 'mobile')
    ) {
      setActiveTab('dashboard');
    }
  }, [activeTab]);
  const [language, setLanguage] = useState<AppLanguage>('ar');
  const [dayMode] = useState<DayMode>('normal');
  const [isFridayMode, setIsFridayMode] = useState<boolean>(
    () => new Date().getDay() === 5
  );
  const [includeBiweeklyPcCleanup, setIncludeBiweeklyPcCleanup] = useState<boolean>(true);
  const [surfaceTheme, setSurfaceTheme] = useState<SurfaceTheme>('amoled');

  // 4 Smart Timed Quiet Modes + Auto-Revert Timer
  const [quietMode, setQuietMode] = useState<QuietModeType>('normal');
  const [quietRemainingSec, setQuietRemainingSec] = useState<number>(0);
  const [stealthAudioOnly, setStealthAudioOnly] = useState<boolean>(false);
  const [adhanOverrideSilent, setAdhanOverrideSilent] = useState<boolean>(true);
  const [alarmRinging, setAlarmRinging] = useState<boolean>(false);

  const [syncTier, setSyncTier] = useState<SyncTierMode>('google_calendar_api');
  const [periodicRituals, setPeriodicRituals] = useState<PeriodicRitualStatus[]>(() =>
    INITIAL_PERIODIC_RITUALS
  );
  const [changelog, setChangelog] = useState<SharedChangelogEntry[]>(INITIAL_CHANGELOG);

  const [travelState, setTravelState] = useState<TravelState>({
    active: false,
    location: HOME_LOCATION,
    distanceKm: 0,
    durationMode: 'today',
    postponedTaskIds: ['room_cleanup'],
    enabledWorkTaskIds: ['deep_work_1', 'deep_work_2', 'practical_work_3', 'light_workout'],
  });

  // Live Google Workspace & Firebase Sync State (Calendar + Tasks + Firestore + Persisted Gemini Chat)
  const [needsAuth, setNeedsAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firestoreReady, setFirestoreReady] = useState(false);
  const [firestoreSynced, setFirestoreSynced] = useState(false);
  const [googleDriveSynced, setGoogleDriveSynced] = useState(false);
  const [isSyncingGoogleDrive, setIsSyncingGoogleDrive] = useState(false);
  const hasHydratedGoogleDriveRef = useRef(false);
  const isSavingGoogleDriveRef = useRef(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [deviceSettings, setDeviceSettings] = useState<OnePlusDeviceSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.deviceSettings) {
          return sanitizeDeviceSettings(parsed.deviceSettings);
        }
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_DEVICE_SETTINGS;
  });

  const [lifeProfile, setLifeProfile] = useState<LifeProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.lifeProfile) {
          return sanitizeLifeProfile(parsed.lifeProfile);
        }
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_LIFE_PROFILE;
  });

  const [fastingOverride, setFastingOverride] = useState<'auto' | 'fasting' | 'normal'>('auto');
  const [isLifeProfileModalOpen, setIsLifeProfileModalOpen] = useState(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [locationResolutionState, setLocationResolutionState] = useState<
    'idle' | 'resolving_gps' | 'gps_locked' | 'timezone_fallback'
  >('idle');

  // Automatic Audio Silence Sanctuaries + Timed Meeting Mode (driven by quietMode) + Preserved Silent Notifications
  const [workspaceTokenExpired, setWorkspaceTokenExpired] = useState(false);
  const [isRefreshingWorkspaceToken, setIsRefreshingWorkspaceToken] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [nowTickMin, setNowTickMin] = useState<number>(() =>
    getNowMinutesInTimeZone(lifeProfile.currentTimeZone || 'Africa/Cairo')
  );
  const snoozeTimersRef = useRef<number[]>([]);
  const [silentNotifications, setSilentNotifications] = useState<SilentNotificationItem[]>(
    loadSavedSilentNotifications
  );
  const [activeAudioAlert, setActiveAudioAlert] = useState<{
    id: string;
    title: string;
    category: TaskSoundCategory;
    isContinuous?: boolean;
  } | null>(null);
  const [persistentAlert, setPersistentAlert] = useState<PersistentAlertItem | null>(null);

  const clientIdRef = useRef<string>(
    `dr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  );
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const seenSyncOpIdsRef = useRef<Set<string>>(new Set());
  const restoredOpIdsRef = useRef<Set<string>>(new Set());
  const wasInPrayerSanctuaryRef = useRef<boolean>(false);
  const [lastDeletedWorkspaceItem, setLastDeletedWorkspaceItem] =
    useState<DeletedWorkspaceSnapshot | null>(null);

  const hasHydratedRemoteRef = useRef(false);
  const localWriteLockUntilRef = useRef<number>(0);
  // Last value of each synced field as the server has it (from snapshots). A save only sends the
  // fields whose local value differs from this, so a device never pushes a field it didn't change.
  const lastServerFieldsRef = useRef<Record<string, string>>({});
  // Newest snapshot that arrived during the write-lock; applied when the lock ends instead of
  // being dropped (a dropped snapshot is never re-delivered, so that device stayed stale forever).
  const pendingRemoteRef = useRef<SyncedRhythmPayload | null>(null);
  const lastServerAppSettingsRef = useRef<string>('');
  const [cloudPausedUntil, setCloudPausedUntil] = useState(0);
  const pendingRemoteTimerRef = useRef<number | null>(null);
  const pushToTasksVaultRef = useRef<(patch?: Partial<TasksVaultPayload>) => Promise<void>>(() => Promise.resolve());

  // Any LOCALLY-initiated lifeProfile edit arms the write lock (see the Firestore listener's
  // "Date.now() < localWriteLockUntilRef.current" guard above) so a snapshot that happens to
  // arrive mid-flight — triggered by something unrelated, like the phone's battery ping — can't
  // revert the very click/tap that caused this edit back to its pre-click value. Previously only
  // some lifeProfile updaters armed this lock by hand; the quiet-day toggle, the sleep buttons,
  // and others did not, which is why clicking them could appear to silently "undo itself".
  const updateLifeProfileLocal = useCallback(
    (updater: Parameters<typeof setLifeProfile>[0]) => {
      localWriteLockUntilRef.current = Date.now() + 5000;
      setLifeProfile((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        void pushToTasksVaultRef.current({ lifeProfile: next });
        return next;
      });
    },
    []
  );

  const [calendarList, setCalendarList] = useState<GoogleCalendarInfo[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [googleTaskLists, setGoogleTaskLists] = useState<GoogleTaskList[]>([]);
  const [googleTasks, setGoogleTasks] = useState<GoogleTaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Free Open-Meteo Weather Hydration Sync + Read-Only Smart Gmail Digest
  const [weatherInfo, setWeatherInfo] = useState<WeatherHydrationInfo | null>(loadCachedWeather);
  const [gmailDigest, setGmailDigest] = useState<GmailDigestItem[]>([]);
  const [gmailScannedCount, setGmailScannedCount] = useState<number>(0);
  const [loadingGmail, setLoadingGmail] = useState(false);
  const [gmailNeedsReauth, setGmailNeedsReauth] = useState(false);
  const [gmailError, setGmailError] = useState('');

  // Persisted Gemini chat messages across sessions/tabs
  const [chatMessages, setChatMessages] = useState<PersistedChatMessage[]>(loadSavedChats);

  // Toggles for Prayer Anchors overlay & Explicit Offline Demo fallback (false by default!)
  const [includePrayerAnchors, setIncludePrayerAnchors] = useState<boolean>(true);
  const [useOfflineDemo, setUseOfflineDemo] = useState<boolean>(false);
  const [completedOverrides, setCompletedOverrides] = useState<Record<string, boolean>>({});
  const [reflowedBlocksOverride, setReflowedBlocksOverride] = useState<ScheduleBlock[] | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<ScheduleBlock[] | null>(null);

  const profileLocation = useMemo(
    () => ({
      id: 'profile_loc',
      nameAr: lifeProfile.currentCityName,
      nameEn: lifeProfile.currentCityName,
      lat: lifeProfile.currentLat,
      lng: lifeProfile.currentLng,
      tzOffsetHours: getTimeZoneUtcOffsetHours(lifeProfile.currentTimeZone),
      timeZone: lifeProfile.currentTimeZone,
    }),
    [lifeProfile]
  );

  const activeLocation = travelState.active ? travelState.location : profileLocation;
  const activeTimeZone = useMemo(() => {
    const browserTz =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : 'Africa/Cairo';
    return activeLocation.timeZone || lifeProfile.currentTimeZone || browserTz || 'Africa/Cairo';
  }, [activeLocation.timeZone, lifeProfile.currentTimeZone]);

  // Auto-sync free Open-Meteo temperature for active location (only when signed in so signed-out state stays clean)
  useEffect(() => {
    if (needsAuth) return;
    let cancelled = false;
    void fetchOpenMeteoWeather(activeLocation.lat, activeLocation.lng).then((info) => {
      if (!cancelled && info) {
        setWeatherInfo(info);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [needsAuth, activeLocation.lat, activeLocation.lng]);

  const todayCairoIso = useMemo(
    () => getDateIsoInTimeZone(activeTimeZone),
    // Re-evaluate automatically when minute/hour ticks cross midnight
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTimeZone, nowTickMin]
  );

  const prayers = useMemo(
    () =>
      calculateEgyptianPrayerTimes(
        activeLocation,
        new Date(),
        lifeProfile.adhanLeadMinutes
      ),
    // Recalculate automatically at midnight when todayCairoIso rolls over
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeLocation, lifeProfile.adhanLeadMinutes, todayCairoIso]
  );

  const todayCalendarMeta: TodayCalendarMeta = useMemo(
    () => getTodayCalendarMeta(activeTimeZone),
    // Refresh metadata when timezone changes or date rolls over
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTimeZone, todayCairoIso]
  );

  const tomorrowInfo = useMemo(() => {
    const tz = activeLocation.timeZone ?? lifeProfile.currentTimeZone ?? 'Africa/Cairo';
    const todayW = getWeekdayInTimeZone(tz);
    const base = new Date(`${todayCairoIso}T12:00:00Z`);
    const nextIso = Number.isNaN(base.getTime())
      ? ''
      : new Date(base.getTime() + 86_400_000).toISOString().slice(0, 10);
    return {
      todayW,
      tomorrowW: (todayW + 1) % 7,
      tomorrowIso: nextIso,
    };
  }, [activeLocation.timeZone, lifeProfile.currentTimeZone, todayCairoIso]);

  // Sunnah fasts from the Hijri calendar: يوم عرفة (9 Dhu al-Hijjah) and يوم عاشوراء (10 Muharram).
  const specialFastToday = useMemo(
    () => getSpecialFastDay(todayCairoIso, activeTimeZone),
    [todayCairoIso, activeTimeZone]
  );
  const specialFastTomorrow = useMemo(
    () => getSpecialFastDay(tomorrowInfo.tomorrowIso, activeTimeZone),
    [tomorrowInfo.tomorrowIso, activeTimeZone]
  );

  const dailyRhythmPlan = useMemo(
    () =>
      computeDailyRhythmPlan(lifeProfile, prayers, {
        todayWeekday: tomorrowInfo.todayW,
        tomorrowWeekday: tomorrowInfo.tomorrowW,
        fastingOverride,
        heatBonusMl: weatherInfo?.heatBonusMl ?? 0,
        specialFastTodayAr: specialFastToday?.nameAr ?? null,
        specialFastTomorrowAr: specialFastTomorrow?.nameAr ?? null,
      }),
    [
      tomorrowInfo.todayW,
      tomorrowInfo.tomorrowW,
      fastingOverride,
      lifeProfile,
      prayers,
      weatherInfo?.heatBonusMl,
      specialFastToday,
      specialFastTomorrow,
    ]
  );

  const tomorrowAlert: TomorrowAlertInfo | null = useMemo(() => {
    const base = analyzeTomorrowAlert(calendarEvents, tomorrowInfo.tomorrowIso, tomorrowInfo.tomorrowW);
    if (!specialFastTomorrow) return base;
    const headline = `${specialFastTomorrow.emoji} بكرة ${specialFastTomorrow.nameAr} — صيام سُنّة`;
    const detail = 'السحور ومواعيد المية اتظبطوا تلقائياً على الصيام';
    if (base) return { ...base, headlineAr: headline, detailAr: `${detail} · ${base.detailAr}` };
    return {
      tomorrowIso: tomorrowInfo.tomorrowIso,
      weekdayAr: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][tomorrowInfo.tomorrowW] ?? '',
      isBusy: false,
      hasSpecialEvent: true,
      eventCount: 0,
      totalHours: 0,
      specialEvents: [],
      headlineAr: headline,
      detailAr: detail,
    };
  }, [calendarEvents, tomorrowInfo.tomorrowIso, tomorrowInfo.tomorrowW, specialFastTomorrow]);

  const lowEnergyActive = lifeProfile.lowEnergyDateKey === todayCairoIso;
  const activeOneTimeSilenceMinutes =
    lifeProfile.oneTimeSilenceDateKey === todayCairoIso
      ? lifeProfile.oneTimeSilenceMinutes ?? 0
      : 0;

  const activeSanctuary: ActiveSanctuaryState = useMemo(
    () =>
      evaluateAudioSanctuary({
        nowMin: nowTickMin,
        prayers,
        bedtimeMin: dailyRhythmPlan.bedtimeMin,
        wakeMin: dailyRhythmPlan.wakeMin,
        prayerSilenceMinutes: lifeProfile.prayerSilenceMinutes,
        fajrSilenceMinutes: lifeProfile.fajrSilenceMinutes,
        oneTimeSilenceMinutes: activeOneTimeSilenceMinutes,
        // Any non-normal quietMode (set via the dashboard's timed meeting-mode picker, Gemini,
        // or another device) now genuinely silences task/water/medication alerts — previously
        // this depended on a separate meetingModeActive boolean that quietMode never touched,
        // so picking "mute" or "vibrate" from the picker had no actual muting effect.
        meetingActive: quietMode !== 'normal',
        meetingMuteFully: quietMode === 'mute_audio' || quietMode === 'silent_all',
        isFriday: isFridayMode,
      }),
    [
      nowTickMin,
      prayers,
      dailyRhythmPlan.bedtimeMin,
      dailyRhythmPlan.wakeMin,
      lifeProfile.prayerSilenceMinutes,
      lifeProfile.fajrSilenceMinutes,
      activeOneTimeSilenceMinutes,
      quietMode,
      isFridayMode,
    ]
  );

  // Auto-revert one-time prayer silence override immediately after that single prayer finishes
  useEffect(() => {
    if (activeSanctuary.type === 'prayer' && activeOneTimeSilenceMinutes >= 5) {
      wasInPrayerSanctuaryRef.current = true;
      return;
    }
    if (activeSanctuary.type !== 'prayer' && wasInPrayerSanctuaryRef.current) {
      wasInPrayerSanctuaryRef.current = false;
      updateLifeProfileLocal((prev) =>
        sanitizeLifeProfile({
          ...prev,
          oneTimeSilenceMinutes: 0,
          oneTimeSilenceDateKey: '',
        })
      );
    }
  }, [activeSanctuary.type, activeOneTimeSilenceMinutes]);

  const effectiveDayMode: DayMode = dailyRhythmPlan.isFastingToday ? 'fasting' : dayMode;

  const [offlineBlocks, setOfflineBlocks] = useState<ScheduleBlock[]>(() =>
    buildBaseSchedule('normal', calculateEgyptianPrayerTimes(HOME_LOCATION), {
      isFriday: new Date().getDay() === 5,
      includeBiweeklyPcCleanup: true,
    })
  );

  const [lastDeletedBlock, setLastDeletedBlock] = useState<ScheduleBlock | null>(null);
  const [shakeUndoSecondsLeft, setShakeUndoSecondsLeft] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string>('');

  const [tombstones, setTombstones] = useState<CalendarTombstone[]>(INITIAL_TOMBSTONES);

  const [batteryGuard, setBatteryGuard] = useState<BatteryGuardState>({
    levelPct: 78,
    cableConnected: true,
    bypassChargingLimitPct: null,
    eveningTimeSimMin: 20 * 60 + 45,
    pcAlertActive: false,
    autoSilencedByDisconnect: false,
    bedtimeGuardTriggered: false,
  });

  const [phoneChargeLimitPct, setPhoneChargeLimitPct] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('dayrhythm_phone_charge_limit'));
      if (Number.isFinite(saved) && saved >= 60 && saved <= 100) return Math.round(saved);
    } catch {
      // ignore storage errors
    }
    return 90;
  });

  const [phoneBattery, setPhoneBattery] = useState<PhoneBatteryTelemetry | null>(null);
  const [phoneChargeAlertDismissed, setPhoneChargeAlertDismissed] = useState(false);
  const [smartChargeAudioActive, setSmartChargeAudioActive] = useState(false);
  const [smartChargeAlertEnabled, setSmartChargeAlertEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dayrhythm_smart_charge_alert_enabled');
      if (saved === 'false') return false;
    } catch {
      // ignore storage errors
    }
    return true;
  });
  const [smartChargeKeepUntilUnplugged, setSmartChargeKeepUntilUnplugged] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(SMART_CHARGE_KEEP_KEY);
      if (saved === 'false') return false;
    } catch {
      // ignore storage errors
    }
    return true;
  });
  const phoneChargeNotifiedCycleRef = useRef<boolean>(false);
  const phoneChargeLimitRef = useRef<number>(phoneChargeLimitPct);
  phoneChargeLimitRef.current = phoneChargeLimitPct;
  const lowStockProactiveNotifiedKeyRef = useRef<string>('');

  const handleSelectTab = useCallback((tab: ActiveTab) => {
    if (tab === 'assistant') {
      flushSync(() => {
        setActiveTab('assistant');
      });
      window.dispatchEvent(new CustomEvent('dayrhythm:focus-chat'));
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('dayrhythm:focus-chat'));
      });
      return;
    }
    setActiveTab(tab);
  }, []);

  const targetCups = dailyRhythmPlan.activeTargetCups;

  const [hydrationHistory, setHydrationHistory] = useState<HydrationDayLog[]>(() => {
    const initialTz = lifeProfile.currentTimeZone || 'Africa/Cairo';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.hydrationHistory) && parsed.hydrationHistory.length === 7) {
          return rollOverHydrationHistoryIfNeeded(parsed.hydrationHistory, targetCups, initialTz);
        }
      }
    } catch {
      // ignore storage errors
    }
    return buildInitialHydrationHistory(targetCups, initialTz);
  });

  // Sync today's hydration target & slot count whenever weight/height/cupSize/fasting changes
  useEffect(() => {
    setHydrationHistory((prev) => {
      const today = prev[prev.length - 1];
      if (!today || today.targetCups === targetCups) return prev;
      const next = [...prev];
      const clampedLogged = Math.min(today.cupsLogged, targetCups);
      next[next.length - 1] = {
        ...today,
        targetCups,
        cupsLogged: clampedLogged,
        slots: Array.from({ length: targetCups }, (_, idx) => idx < clampedLogged),
      };
      return next;
    });
  }, [targetCups]);

  const [medications, setMedications] = useState<MedicationItem[]>(loadSavedMedications);
  const seededDefaultMedRef = useRef(false);

  const [creativeActivities, setCreativeActivities] = useState<CreativeActivityItem[]>(
    loadSavedCreativeActivities
  );
  const seededDefaultCreativeRef = useRef(false);

  const [waterRemindersEnabled, setWaterRemindersEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(WATER_REMINDER_STORAGE_KEY);
      if (saved === 'false') return false;
    } catch {
      // ignore storage errors
    }
    return true;
  });
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );
  const firedReminderKeysRef = useRef<Set<string>>(new Set());

  const [memories, setMemories] = useState<MemoryItem[]>(loadSavedMemories);
  const seededDefaultMemoriesRef = useRef(false);
  const [pendingAssistantPrompt, setPendingAssistantPrompt] = useState<string | null>(null);
  const [autoStartVoice, setAutoStartVoice] = useState(false);
  const shortcutHandledRef = useRef(false);

  const [streaks, setStreaks] = useState<DualStreaks>({
    dailyCommitmentDays: 0,
    dailyCommitmentDoneToday: false,
    waterTargetDays: 0,
    waterTargetDoneToday: false,
  });

  const [pomodoro, setPomodoro] = useState<PomodoroState>({
    phase: 'focus',
    presetMinutes: 25,
    remainingSeconds: 25 * 60,
    totalSeconds: 25 * 60,
    isRunning: false,
    completedCycles: 0,
  });

  const [isTravelModalOpen, setIsTravelModalOpen] = useState(false);
  const [isCatchUpModalOpen, setIsCatchUpModalOpen] = useState(false);
  const [isPomodoroModalOpen, setIsPomodoroModalOpen] = useState(false);
  const [isLogoPickerOpen, setIsLogoPickerOpen] = useState(false);
  const [selectedLogoId, setSelectedLogoId] = useState<string>(() => {
    try {
      return window.localStorage.getItem(SELECTED_LOGO_STORAGE_KEY) || DEFAULT_LOGO_ID;
    } catch {
      return DEFAULT_LOGO_ID;
    }
  });
  const [capsulePrefs, setCapsulePrefs] = useState<CapsulePrefs>(loadSavedCapsulePrefs);

  const activeBrandLogo = useMemo(() => getLogoConceptById(selectedLogoId), [selectedLogoId]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) {
      link.href = activeBrandLogo.src;
    }
  }, [activeBrandLogo]);

  const [simulateUnder60s, setSimulateUnder60s] = useState(false);
  const [liveCountdownSec, setLiveCountdownSec] = useState(47);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? '' : prev));
    }, 4000);
  }, []);

  const handleUpdatePhoneChargeLimit = useCallback(
    (nextLimit: number) => {
      const clamped = Math.max(60, Math.min(100, Math.round(nextLimit)));
      setPhoneChargeLimitPct(clamped);
      phoneChargeNotifiedCycleRef.current = false;
      setPhoneChargeAlertDismissed(false);
      try {
        localStorage.setItem('dayrhythm_phone_charge_limit', String(clamped));
      } catch {
        // ignore storage errors
      }
      setPhoneBattery((prev) => {
        if (!prev) return prev;
        const updated: PhoneBatteryTelemetry = {
          ...prev,
          chargeLimitPct: clamped,
          updatedAtMs: Date.now(),
        };
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({ type: 'battery', ...updated }));
          } catch {
            // ignore ws send errors
          }
        }
        if (firebaseUser?.uid && firebaseUser.emailVerified) {
          void publishPhoneBatteryTelemetry(firebaseUser.uid, updated).catch(() => {});
        }
        return updated;
      });
      showToast(`🔋 تم ضبط حد تنبيه شحن الموبايل على ${clamped}%`);
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced, showToast]
  );

  const appendChangelog = useCallback(
    (
      device: SharedChangelogEntry['device'],
      noteAr: string,
      noteEn: string
    ) => {
      const ts = `${getDateIsoInTimeZone(activeTimeZone)} · ${formatNow12hInTimeZone(activeTimeZone, 'ar')}`;
      setChangelog((prev) => [
        {
          id: `cl-${Date.now()}`,
          version: (prev[0]?.version ?? 13) + 1,
          timestampStr: ts,
          device,
          noteAr,
          noteEn,
        },
        ...prev,
      ]);
    },
    [activeTimeZone]
  );

  // Instant AR <-> EN DOM dir + lang switching without reload
  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  // Persist sanitized Gemini chat messages locally only while signed in
  useEffect(() => {
    if (!firebaseUser?.uid && !authUser) return;
    try {
      const safeChats = sanitizePersistedChats(chatMessages, WELCOME_MESSAGE);
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(safeChats.slice(-100)));
    } catch {
      // ignore quota errors
    }
  }, [chatMessages, firebaseUser?.uid, authUser]);

  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== CHAT_STORAGE_KEY || !ev.newValue) return;
      try {
        const parsed = JSON.parse(ev.newValue);
        setChatMessages(sanitizePersistedChats(parsed, WELCOME_MESSAGE));
      } catch {
        // ignore invalid external payload
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Persist preserved silent notifications (during Prayer, Sleep, or Meeting sanctuaries)
  useEffect(() => {
    try {
      localStorage.setItem(
        SILENT_NOTIFS_STORAGE_KEY,
        JSON.stringify(silentNotifications.slice(0, 25))
      );
    } catch {
      // ignore quota errors
    }
  }, [silentNotifications]);

  // High-precision wall-clock sync every 5s + instant visibility/focus resync (zero 30s drift!)
  useEffect(() => {
    // trueNowMs(): network time, so a drifted Windows clock (it was ~15 s fast) can't make the PC
    // ring before the phone.
    const syncClockNow = () => {
      setNowTickMin(getNowMinutesInTimeZone(activeTimeZone, new Date(trueNowMs())));
    };
    syncClockNow();
    // Fire exactly at hh:mm:00 so the PC rings in the same second as the phone's native alarm
    // (the 5s interval alone could be up to 5s late).
    let boundaryTimer = 0;
    const scheduleNextBoundary = () => {
      const msToNextMinute = 60_000 - (trueNowMs() % 60_000) + 25;
      boundaryTimer = window.setTimeout(() => {
        syncClockNow();
        scheduleNextBoundary();
      }, msToNextMinute);
    };
    scheduleNextBoundary();
    const id = window.setInterval(syncClockNow, 5_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncClockNow();
    };
    window.addEventListener('focus', syncClockNow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(boundaryTimer);
      window.clearInterval(id);
      window.removeEventListener('focus', syncClockNow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeTimeZone]);

  const handleClearSilentNotifications = useCallback(() => {
    setSilentNotifications([]);
    showToast('تم مسح الإشعارات الصامتة المحفوظة ✓');
  }, [showToast]);

  const emitCrossDeviceSync = useCallback(
    (
      scope: WorkspaceSyncSignal['scope'],
      action: string,
      undoSnapshotPayload?: DeletedWorkspaceSnapshot,
      extraPayload?: Record<string, unknown>
    ) => {
      const opId = `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      seenSyncOpIdsRef.current.add(opId);
      const timestampMs = Date.now();
      const packet = {
        type: 'broadcast',
        opId,
        clientId: clientIdRef.current,
        scope,
        action,
        undoSnapshot: undoSnapshotPayload,
        extra: extraPayload,
        timestampMs,
      };

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify(packet));
        } catch {
          // ignore transient WS send error
        }
      }

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('dayrhythm_sync');
          bc.postMessage({ ...packet, type: 'sync' });
          bc.close();
        } catch {
          // ignore BroadcastChannel errors
        }
      }

      const isGoogle = Boolean(firebaseUser?.providerData?.some((p) => p.providerId === 'google.com'));
      if (firebaseUser?.uid && (firebaseUser.emailVerified || isGoogle)) {
        void publishWorkspaceSyncSignal(firebaseUser.uid, {
          opId,
          clientId: clientIdRef.current,
          scope,
          action,
          timestampMs,
        });
      }

      // Also persist to Google Tasks Cloud Sync Vault so devices without active Firestore stop immediately
      void pushToTasksVaultRef.current({
        lastDismissSignal: {
          timestampMs,
          scope,
          action,
          clientId: clientIdRef.current,
        },
      });
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, firebaseUser?.providerData, firestoreSynced]
  );

  const stopNativeAlerts = useCallback(() => {
    try {
      const wv = (
        window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } }
      ).chrome?.webview;
      wv?.postMessage?.(JSON.stringify({ type: 'stop-alert' }));
    } catch {
      // ignore WebView2 postMessage errors
    }
    try {
      const androidBridge = (
        window as Window & {
          DayRhythmNative?: {
            dismissActiveAlerts?: () => void;
            stopNativeAlarmSound?: () => void;
          };
        }
      ).DayRhythmNative;
      androidBridge?.stopNativeAlarmSound?.();
      androidBridge?.dismissActiveAlerts?.();
    } catch {
      // ignore Android bridge errors
    }
  }, []);

  const handleAcknowledgeAudioAlert = useCallback(() => {
    stopContinuousAlert();
    stopNativeAlerts();
    const hadAlert = Boolean(activeAudioAlert || persistentAlert || alarmRinging);
    const title = activeAudioAlert?.title || persistentAlert?.title || 'التنبيه';
    setActiveAudioAlert(null);
    setPersistentAlert(null);
    setAlarmRinging(false);
    triggerHapticWaveform('shake_undo');
    emitCrossDeviceSync('alarm_dismiss', 'dismiss');
    if (hadAlert) {
      showToast(`✓ تم إيقاف وتأكيد تنبيه «${title}» على أجهزتك`);
    }
  }, [activeAudioAlert, alarmRinging, emitCrossDeviceSync, persistentAlert, showToast, stopNativeAlerts]);

  // Auto-dismiss non-continuous active audio alert banner after 12 seconds (continuous loops stay until user stops!)
  useEffect(() => {
    if (!activeAudioAlert || activeAudioAlert.isContinuous) return;
    const id = window.setTimeout(() => {
      setActiveAudioAlert(null);
    }, 12_000);
    return () => window.clearTimeout(id);
  }, [activeAudioAlert]);

  // Hardware Shake-to-Acknowledge listener (gForce > 2.5g when a distinct task alert is active)
  useEffect(() => {
    if (!activeAudioAlert || typeof window === 'undefined') return;
    const onMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const gx = (acc.x ?? 0) / 9.81;
      const gy = (acc.y ?? 0) / 9.81;
      const gz = (acc.z ?? 0) / 9.81;
      const gForce = Math.sqrt(gx * gx + gy * gy + gz * gz);
      if (gForce > 2.5) {
        handleAcknowledgeAudioAlert();
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [activeAudioAlert, handleAcknowledgeAudioAlert]);

  const triggerTaskAlert = useCallback(
    (
      title: string,
      category: TaskSoundCategory,
      options?: {
        bypassSanctuary?: boolean;
        privacyEmoji?: string;
        displayTitle?: string;
        sourceLabel?: string;
        medicationId?: string;
        medicationDoseTime24?: string;
        taskId?: string;
        taskListId?: string;
        durationMs?: number;
        description?: string;
      }
    ) => {
      const meta = TASK_SOUND_META[category];
      const privacyBadge = (options?.privacyEmoji || extractEmojiPair(title, meta.icon)).trim();
      const visibleTitle = (options?.displayTitle || title || meta.labelAr).trim();
      const visibleSource =
        options?.sourceLabel ||
        (category === 'water'
          ? 'ترطيب يومي'
          : category === 'medication'
            ? 'موعد العلاج'
            : 'تقويم ومهام اليوم');
      // Two minutes on screen at most, then it goes away by itself — a full-screen alert left up
      // longer just burns battery on the phone and blocks the secondary monitor.
      const durationMs = Math.min(options?.durationMs ?? 120_000, 120_000);
      const visibleDescription = cleanCalendarText(options?.description || '').slice(0, 220);
      const repeatCount: SoundRepeatSetting =
        (lifeProfile.soundRepeats ?? DEFAULT_SOUND_REPEATS)[category] ??
        DEFAULT_SOUND_REPEATS[category] ??
        1;

      const androidNative = (
        window as Window & {
          DayRhythmNative?: {
            triggerNativeAlarm?: (
              title: string,
              body: string,
              kind: string,
              continuous: boolean,
              snoozeMinutes: number
            ) => void;
          };
        }
      ).DayRhythmNative;
      const isAndroidNative = Boolean(androidNative);

      if (!options?.bypassSanctuary && activeSanctuary.type !== 'none') {
        if (!isAndroidNative) {
          playTaskSignature(category, { sanctuary: activeSanctuary, repeatCount: 1 });
        }
        const reasonAr =
          activeSanctuary.type === 'prayer'
            ? 'وقت الصلاة'
            : activeSanctuary.type === 'sleep'
              ? 'وقت النوم'
              : 'وضع الاجتماع';
        const item: SilentNotificationItem = {
          id: `sn_${Date.now().toString(36)}`,
          title: privacyBadge,
          reasonAr,
          time12h: formatNow12hInTimeZone(activeTimeZone, 'ar'),
          soundCategory: category,
          createdAtIso: new Date().toISOString(),
        };
        setSilentNotifications((prev) => [item, ...prev].slice(0, 25));
        showToast(`🔕 ${privacyBadge}`);
        return;
      }

      // If running inside Android Native APK, ALL audio is routed strictly to the native
      // Android Alarm Stream (STREAM_ALARM / AudioAttributes.USAGE_ALARM) via triggerNativeAlarm.
      // Web Audio (AudioContext) in Chromium WebView outputs strictly to STREAM_MUSIC (Media volume),
      // which creates dual-channel playback and gets muted when the user silences Media volume.
      const isContinuous = repeatCount === 'continuous';
      let playRes = { playedAudio: false, vibrated: false, isContinuous };
      if (!isAndroidNative) {
        playRes = playTaskSignature(category, {
          bypassSanctuary: true,
          repeatCount,
        });
      }
      const nowTime12 = formatNow12hInTimeZone(activeTimeZone, 'ar');
      const alertId = `alert_${Date.now().toString(36)}`;
      const defaultSnooze =
        lifeProfile.defaultSnoozeMinutes === 10 || lifeProfile.defaultSnoozeMinutes === 15
          ? lifeProfile.defaultSnoozeMinutes
          : 5;
      const wv = (
        window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } }
      ).chrome?.webview;
      const isNativeWin = Boolean(wv?.postMessage);

      setActiveAudioAlert({
        id: alertId,
        title: privacyBadge,
        category,
        isContinuous: Boolean(playRes.isContinuous || isContinuous),
      });

      // Avoid showing TWO duplicate alerts on Windows EXE (native SecondaryMonitorToastForm handles PC alert cleanly!)
      if (!isNativeWin) {
        setPersistentAlert({
          id: alertId,
          emoji: privacyBadge,
          title: visibleTitle,
          sourceLabel: visibleSource,
          time12h: nowTime12,
          category,
          createdAtMs: Date.now(),
          durationMs,
          isContinuous: Boolean(playRes.isContinuous || isContinuous),
          isHydration: category === 'water',
          medicationId: options?.medicationId,
          medicationDoseTime24: options?.medicationDoseTime24,
          taskId: options?.taskId,
          taskListId: options?.taskListId,
        });
      }

      // On Android APK: fire native OS alarm sound strictly on STREAM_ALARM + vibration + heads-up notification so OnePlus 12R rings loudly even if Media volume is muted
      try {
        androidNative?.triggerNativeAlarm?.(
          `${privacyBadge} ${visibleTitle}`,
          visibleDescription
            ? `${visibleDescription}\n${visibleSource} · ${nowTime12}`
            : `${visibleSource} · ${nowTime12}`,
          category,
          Boolean(playRes.isContinuous || isContinuous),
          defaultSnooze
        );
      } catch {
        // ignore Android bridge errors
      }

      // Route alerts to Windows Secondary Monitor (2 screens) or sleek side-edge dock (1 screen) — zero focus-steal!
      try {
        if (wv?.postMessage) {
          wv.postMessage(
            JSON.stringify({
              type: 'native-alert',
              id: alertId,
              emoji: privacyBadge,
              title: visibleTitle,
              description: visibleDescription,
              sourceLabel: visibleSource,
              time12h: nowTime12,
              category,
              isHydration: category === 'water',
              isMedication: category === 'medication',
              medicationId: options?.medicationId || '',
              medicationDoseTime24: options?.medicationDoseTime24 || '',
              isContinuous: playRes.isContinuous,
              cupSizeMl: lifeProfile.cupSizeMl,
              durationSeconds: Math.round(durationMs / 1000),
              snoozeMinutes: defaultSnooze,
            })
          );
        }
      } catch {
        // ignore WebView2 postMessage errors
      }


      if (!isNativeWin) {
        showToast(`${privacyBadge} · ${visibleTitle} · ${nowTime12}`);
      }
    },
    [
      activeSanctuary,
      activeTimeZone,
      emitCrossDeviceSync,
      lifeProfile.cupSizeMl,
      lifeProfile.defaultSnoozeMinutes,
      lifeProfile.soundRepeats,
      showToast,
    ]
  );

  // Interactive Notification Quick Action: Snooze any alert for N minutes (default from LifeProfile: 5/10/15m)
  const handleSnoozeAlert = useCallback(
    (alertItem: PersistentAlertItem, minutes?: number) => {
      const configuredDefault =
        lifeProfile.defaultSnoozeMinutes === 10 || lifeProfile.defaultSnoozeMinutes === 15
          ? lifeProfile.defaultSnoozeMinutes
          : 5;
      const safeMin = Math.max(1, Math.min(60, Math.round(minutes ?? configuredDefault)));
      stopContinuousAlert();
      stopNativeAlerts();
      setActiveAudioAlert(null);
      setPersistentAlert(null);
      setAlarmRinging(false);
      emitCrossDeviceSync('alarm_dismiss', 'snooze');
      const timerId = window.setTimeout(() => {
        snoozeTimersRef.current = snoozeTimersRef.current.filter((id) => id !== timerId);
        triggerTaskAlert(alertItem.emoji || alertItem.title, alertItem.category, {
          privacyEmoji: alertItem.emoji,
          displayTitle: alertItem.title,
          sourceLabel: `${alertItem.sourceLabel} (مؤجّل ${safeMin} د)`,
          medicationId: alertItem.medicationId,
          medicationDoseTime24: alertItem.medicationDoseTime24,
          taskId: alertItem.taskId,
          taskListId: alertItem.taskListId,
        });
      }, safeMin * 60_000);
      snoozeTimersRef.current.push(timerId);
      triggerHapticWaveform('water_cup');
      showToast(`⏰ تم تأجيل «${alertItem.title}» لمدة ${safeMin} دقيقة وإيقافه على أجهزتك`);
    },
    [emitCrossDeviceSync, lifeProfile.defaultSnoozeMinutes, showToast, stopNativeAlerts, triggerTaskAlert]
  );

  useEffect(() => {
    return () => {
      snoozeTimersRef.current.forEach((id) => window.clearTimeout(id));
      snoozeTimersRef.current = [];
    };
  }, []);

  // Auto-revert countdown for Smart Timed Quiet Modes
  useEffect(() => {
    if (quietMode === 'normal' || quietRemainingSec <= 0) return;
    const id = window.setInterval(() => {
      setQuietRemainingSec((prev) => {
        if (prev <= 1) {
          setQuietMode('normal');
          showToast('🔊 انتهى مؤقت الهدوء — عاد النظام للوضع العادي تلقائياً');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [quietMode, quietRemainingSec, showToast]);

  const handleSetQuietMode = useCallback(
    (mode: QuietModeType, durationMinutes: number) => {
      localWriteLockUntilRef.current = Date.now() + 5000;
      setQuietMode(mode);
      if (mode === 'normal') {
        setQuietRemainingSec(0);
        showToast('🔊 تم التبديل للوضع العادي الكامل');
      } else if (durationMinutes <= 0) {
        // No timer: stays on until turned off (the auto-revert only runs while seconds remain).
        setQuietRemainingSec(0);
        showToast(mode === 'vibrate_only' ? '📳 اهتزاز فقط لحد ما تلغيه' : '🔇 ميوت لحد ما تلغيه');
      } else {
        setQuietRemainingSec(durationMinutes * 60);
        showToast(`🔕 تفعيل وضع الهدوء (${mode}) لمدة ${durationMinutes} دقيقة`);
      }
      appendChangelog('Web/PC', `ضبط وضع الهدوء إلى ${mode}`, `Set quiet mode to ${mode}`);

      void pushToTasksVaultRef.current({
        quietMode: mode,
        adhanOverrideSilent,
      });
    },
    [appendChangelog, showToast, adhanOverrideSilent]
  );

  const handleCycleQuietMode = useCallback(() => {
    const order: QuietModeType[] = ['normal', 'mute_audio', 'vibrate_only', 'silent_all'];
    const next = order[(order.indexOf(quietMode) + 1) % order.length];
    handleSetQuietMode(next, next === 'normal' ? 0 : 30);
  }, [handleSetQuietMode, quietMode]);

  const handleWorkspaceUnauthorized = useCallback(() => {
    markCalendarTokenExpired();
    setWorkspaceTokenExpired(true);
  }, []);

  const fetchCalendarEvents = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride ?? getCalendarAccessToken();
    if (!token) {
      return;
    }
    setLoadingEvents(true);
    // Dev backend (server.ts) only — static APK/EXE/PWA builds skip straight to Google.
    if (hasSameOriginBackend()) try {
      const res = await fetch('/api/calendar/events', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.status === 401 && contentType.includes('application/json')) {
        handleWorkspaceUnauthorized();
        setLoadingEvents(false);
        return;
      }
      if (res.ok && contentType.includes('application/json')) {
        setLoadingEvents(false);
        setWorkspaceTokenExpired(false);
        const data = await res.json();
        const nextCals = Array.isArray(data.calendars) ? data.calendars : undefined;
        const nextEvs = Array.isArray(data.events) ? data.events : undefined;
        if (nextCals) setCalendarList(nextCals);
        if (nextEvs) setCalendarEvents(nextEvs);
        const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
        if (nextCals || nextEvs) {
          saveOfflineWorkspaceCache(OFFLINE_CAL_PREFIX, activeUid, {
            calendars: nextCals ?? [],
            events: nextEvs ?? [],
          });
        }
        return;
      }
    } catch {
      // Standalone APK/EXE without Express proxy: fall through to direct Google API
    }

    // Direct client-side Google Calendar API v3 (works 100% natively inside standalone EXE & APK)
    try {
      const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (calRes.status === 401) {
        handleWorkspaceUnauthorized();
        return;
      }
      if (!calRes.ok) return;
      setWorkspaceTokenExpired(false);
      const calJson = (await calRes.json()) as { items?: Array<Record<string, unknown>> };
      const rawCals = Array.isArray(calJson.items) ? calJson.items : [];
      const mappedCals: GoogleCalendarInfo[] = rawCals.map((c) => ({
        id: String(c.id || 'primary'),
        summary: String(c.summary || 'التقويم الرئيسي'),
        primary: Boolean(c.primary),
        backgroundColor: typeof c.backgroundColor === 'string' ? c.backgroundColor : undefined,
      }));
      setCalendarList(mappedCals);

      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14).toISOString();
      const targetCals = mappedCals.slice(0, 6);
      const allEvents: GoogleCalendarEventItem[] = [];

      await Promise.all(
        targetCals.map(async (cal) => {
          try {
            const baseUrl =
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events` +
              `?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
            // A full daily routine is ~20 events/day, so 15 days can exceed one page (250): follow pageToken.
            const items: Array<Record<string, unknown>> = [];
            let pageToken = '';
            for (let page = 0; page < 6; page += 1) {
              const evRes = await fetch(
                pageToken ? `${baseUrl}&pageToken=${encodeURIComponent(pageToken)}` : baseUrl,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (!evRes.ok) break;
              const evJson = (await evRes.json()) as {
                items?: Array<Record<string, unknown>>;
                nextPageToken?: string;
              };
              items.push(...(evJson.items || []));
              pageToken = evJson.nextPageToken || '';
              if (!pageToken) break;
            }
            for (const ev of items) {
              const startObj = (ev.start || {}) as { dateTime?: string; date?: string };
              const endObj = (ev.end || {}) as { dateTime?: string; date?: string };
              const startVal = startObj.dateTime || startObj.date || '';
              const endVal = endObj.dateTime || endObj.date || startVal;
              if (!startVal) continue;
              allEvents.push({
                id: String(ev.id || `${cal.id}-${startVal}`),
                calendarId: cal.id,
                calendarTitle: cal.summary,
                calendarColor: cal.backgroundColor,
                summary: String(ev.summary || '(بدون عنوان)'),
                description: typeof ev.description === 'string' ? ev.description : '',
                location: typeof ev.location === 'string' ? ev.location : undefined,
                start: startVal,
                end: endVal,
                isAllDay: Boolean(startObj.date && !startObj.dateTime),
                htmlLink: typeof ev.htmlLink === 'string' ? ev.htmlLink : undefined,
                status: typeof ev.status === 'string' ? ev.status : undefined,
                isRecurring: Boolean(ev.recurringEventId),
                recurringEventId:
                  typeof ev.recurringEventId === 'string' ? ev.recurringEventId : undefined,
              });
            }
          } catch {
            // skip individual calendar error
          }
        })
      );

      allEvents.sort((a, b) => a.start.localeCompare(b.start));
      setCalendarEvents(allEvents);
      const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
      saveOfflineWorkspaceCache(OFFLINE_CAL_PREFIX, activeUid, {
        calendars: mappedCals,
        events: allEvents,
      });
    } catch {
      // ignore offline errors
    } finally {
      setLoadingEvents(false);
    }
  }, [handleWorkspaceUnauthorized]);

  const fetchGoogleTasks = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride ?? getCalendarAccessToken();
    if (!token) return;
    setLoadingTasks(true);
    // Dev backend (server.ts) only — static APK/EXE/PWA builds skip straight to Google.
    if (hasSameOriginBackend()) try {
      const res = await fetch('/api/tasks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.status === 401 && contentType.includes('application/json')) {
        handleWorkspaceUnauthorized();
        setLoadingTasks(false);
        return;
      }
      if (res.ok && contentType.includes('application/json')) {
        setLoadingTasks(false);
        setWorkspaceTokenExpired(false);
        const data = await res.json();
        const nextLists = Array.isArray(data.taskLists)
          ? data.taskLists.filter((l: { title?: string }) => l.title !== VAULT_LIST_TITLE)
          : undefined;
        const nextTasks = Array.isArray(data.tasks)
          ? data.tasks.filter(
              (t: { title?: string; taskListTitle?: string }) =>
                t.title !== SYNC_TASK_TITLE && t.taskListTitle !== VAULT_LIST_TITLE
            )
          : undefined;
        if (nextLists) setGoogleTaskLists(nextLists);
        if (nextTasks) setGoogleTasks(nextTasks);
        const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
        if (nextLists || nextTasks) {
          saveOfflineWorkspaceCache(OFFLINE_TASKS_PREFIX, activeUid, {
            taskLists: nextLists ?? [],
            tasks: nextTasks ?? [],
          });
        }
        return;
      }
    } catch {
      // Standalone APK/EXE fallback below
    }

    // Direct client-side Google Tasks API v1
    try {
      const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (listsRes.status === 401) {
        handleWorkspaceUnauthorized();
        return;
      }
      if (!listsRes.ok) return;
      setWorkspaceTokenExpired(false);
      const listsJson = (await listsRes.json()) as { items?: Array<Record<string, unknown>> };
      const mappedLists: GoogleTaskList[] = (listsJson.items || [])
        .filter((l) => String(l.title || '') !== VAULT_LIST_TITLE)
        .map((l) => ({
          id: String(l.id || '@default'),
          title: String(l.title || 'مهامي'),
        }));
      setGoogleTaskLists(mappedLists);

      const allTasks: GoogleTaskItem[] = [];
      await Promise.all(
        mappedLists.slice(0, 6).map(async (list) => {
          try {
            const tRes = await fetch(
              `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=true&showHidden=false&maxResults=100`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!tRes.ok) return;
            const tJson = (await tRes.json()) as { items?: Array<Record<string, unknown>> };
            for (const item of tJson.items || []) {
              const itemTitle = String(item.title || '');
              if (itemTitle === SYNC_TASK_TITLE || list.title === VAULT_LIST_TITLE) {
                continue;
              }
              allTasks.push({
                id: String(item.id || ''),
                taskListId: list.id,
                taskListTitle: list.title,
                title: String(item.title || '(مهمة بدون عنوان)'),
                notes: typeof item.notes === 'string' ? item.notes : undefined,
                status: item.status === 'completed' ? 'completed' : 'needsAction',
                due: typeof item.due === 'string' ? item.due : undefined,
                completed: typeof item.completed === 'string' ? item.completed : undefined,
                updated: typeof item.updated === 'string' ? item.updated : undefined,
              });
            }
          } catch {
            // skip individual list error
          }
        })
      );
      setGoogleTasks(allTasks);
      const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
      saveOfflineWorkspaceCache(OFFLINE_TASKS_PREFIX, activeUid, {
        taskLists: mappedLists,
        tasks: allTasks,
      });
    } catch {
      // ignore offline errors
    } finally {
      setLoadingTasks(false);
    }
  }, [handleWorkspaceUnauthorized]);

  const lastGmailAutoScanMsRef = useRef<number>(0);
  const gmailNeedsReauthRef = useRef<boolean>(false);
  const gmailRetryAttemptRef = useRef<number>(0);
  const gmailRetryTimerRef = useRef<number | null>(null);
  const gmailCountdownTimerRef = useRef<number | null>(null);
  const [gmailLastSyncedIso, setGmailLastSyncedIso] = useState<string>('');
  const [gmailNextRetryInSec, setGmailNextRetryInSec] = useState<number>(0);
  const syncedChatTextByIdRef = useRef<Map<string, string>>(new Map());
  // Message ids that definitely exist in the cloud (seen in a snapshot or written OK) — lets a
  // write skip its read-before-write. Never cleared on a failed write.
  const cloudChatIdsRef = useRef<Set<string>>(new Set());
  const hasHydratedCloudChatRef = useRef<boolean>(false);

  useEffect(() => {
    gmailNeedsReauthRef.current = gmailNeedsReauth;
  }, [gmailNeedsReauth]);

  const clearGmailRetryTimers = useCallback(() => {
    if (gmailRetryTimerRef.current !== null) {
      window.clearTimeout(gmailRetryTimerRef.current);
      gmailRetryTimerRef.current = null;
    }
    if (gmailCountdownTimerRef.current !== null) {
      window.clearInterval(gmailCountdownTimerRef.current);
      gmailCountdownTimerRef.current = null;
    }
    setGmailNextRetryInSec(0);
  }, []);

  const fetchGmailDigestDirectClient = useCallback(
    async (
      token: string,
      signal: AbortSignal
    ): Promise<{
      ok: boolean;
      status: number;
      needsReauth?: boolean;
      error?: string;
      scannedCount: number;
      digestItems: GmailDigestItem[];
    }> => {
      const listUrl =
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=12&q=' +
        encodeURIComponent('in:inbox newer_than:7d -category:promotions -category:social');
      const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (listRes.status === 401 || listRes.status === 403) {
        return {
          ok: false,
          status: listRes.status,
          needsReauth: true,
          error: 'انتهت جلسة صلاحية Gmail — اضغط «تجديد ربط Google الآن» في الأعلى.',
          scannedCount: 0,
          digestItems: [],
        };
      }
      if (!listRes.ok) {
        return {
          ok: false,
          status: listRes.status,
          error: 'تعذر الوصول إلى صندوق Gmail حالياً.',
          scannedCount: 0,
          digestItems: [],
        };
      }
      const listJson = (await listRes.json()) as { messages?: Array<{ id: string }> };
      const msgRefs = Array.isArray(listJson.messages) ? listJson.messages.slice(0, 10) : [];
      if (msgRefs.length === 0) {
        return { ok: true, status: 200, scannedCount: 0, digestItems: [] };
      }

      const noisePattern =
        /verification code|otp|security alert|password reset|unsubscribe|newsletter|promo|receipt|invoice paid|كود التحقق|رمز التحقق|نشرة|إعلان|عروض/i;
      const categoryRules: Array<{
        category: GmailDigestItem['category'];
        pattern: RegExp;
        duration: number;
        emoji: string;
      }> = [
        {
          category: 'meeting',
          pattern: /meeting|zoom|teams|google meet|interview|call|invite|اجتماع|مقابلة|دعوة/i,
          duration: 45,
          emoji: '📅',
        },
        {
          category: 'travel',
          pattern: /flight|boarding|ticket|hotel|booking|check-in|رحلة|طيران|حجز|فندق/i,
          duration: 90,
          emoji: '✈️',
        },
        {
          category: 'medical',
          pattern: /doctor|clinic|hospital|lab|medical|appointment|دكتور|عيادة|مستشفى|تحاليل|كشف/i,
          duration: 60,
          emoji: '🏥',
        },
        {
          category: 'deadline',
          pattern: /deadline|due|submit|renewal|expire|exam|bill due|موعد نهائي|تسليم|تجديد|استحقاق|فاتورة/i,
          duration: 30,
          emoji: '⏳',
        },
        {
          category: 'delivery',
          pattern: /delivery|shipment|courier|order arriving|out for delivery|شحنة|توصيل|مندوب|طلبك/i,
          duration: 20,
          emoji: '📦',
        },
      ];

      const detailResults = await Promise.all(
        msgRefs.map(async (ref) => {
          try {
            const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
              ref.id
            )}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;
            const res = await fetch(detailUrl, {
              headers: { Authorization: `Bearer ${token}` },
              signal,
            });
            if (!res.ok) return null;
            return (await res.json()) as {
              id: string;
              snippet?: string;
              payload?: { headers?: Array<{ name?: string; value?: string }> };
            };
          } catch {
            return null;
          }
        })
      );

      const fallbackDateIso = getDateIsoInTimeZone(activeTimeZone);
      const digestItems: GmailDigestItem[] = [];

      for (const msg of detailResults) {
        if (!msg) continue;
        const headers = msg.payload?.headers ?? [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value?.trim() || '';
        const subject = getHeader('Subject') || 'رسالة بريد مهمة';
        const fromRaw = getHeader('From');
        const sender = fromRaw.replace(/<[^>]+>/g, '').replace(/"/g, '').trim() || 'Gmail';
        const snippet = (msg.snippet || '').replace(/\s+/g, ' ').trim();
        const combined = `${subject} ${snippet}`;

        if (noisePattern.test(combined)) continue;

        const matchedRule = categoryRules.find((r) => r.pattern.test(combined));
        if (!matchedRule) continue;

        const isoMatch = combined.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
        const timeMatch = combined.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
        const dateIso = isoMatch ? isoMatch[1] : fallbackDateIso;
        const startTime24 = timeMatch
          ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
          : '10:00';

        digestItems.push({
          id: `gm_${msg.id}`,
          messageId: msg.id,
          category: matchedRule.category,
          titleAr: subject.slice(0, 90),
          sender: sender.slice(0, 50),
          summaryAr: (snippet || subject).slice(0, 140),
          dateIso,
          startTime24,
          durationMinutes: matchedRule.duration,
          suggestedAction: {
            operation: 'create',
            title: `${matchedRule.emoji} ${subject.slice(0, 70)}`,
            dateIso,
            startTime24,
            durationMinutes: matchedRule.duration,
            description: `من: ${sender}\n${snippet.slice(0, 200)}`,
          },
        });
      }

      return {
        ok: true,
        status: 200,
        scannedCount: msgRefs.length,
        digestItems: digestItems.slice(0, 6),
      };
    },
    [activeTimeZone]
  );

  const fetchGmailDigest = useCallback(
    async (tokenOverride?: string, options?: { silent?: boolean }) => {
      const token = tokenOverride ?? getCalendarAccessToken();
      if (!token) {
        clearGmailRetryTimers();
        setGmailNeedsReauth(true);
        return;
      }
      clearGmailRetryTimers();
      setLoadingGmail(true);
      if (!options?.silent) {
        setGmailError('');
      }
      setGmailNeedsReauth(false);
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 18_000);

      const scheduleSmartGmailRetry = (errMsg: string) => {
        const backoffStepsSec = [15, 30, 60, 120, 300];
        const attempt = gmailRetryAttemptRef.current;
        if (attempt >= backoffStepsSec.length) {
          setGmailError(errMsg);
          return;
        }
        const delaySec = backoffStepsSec[attempt];
        gmailRetryAttemptRef.current = attempt + 1;
        setGmailError(errMsg);
        setGmailNextRetryInSec(delaySec);

        gmailCountdownTimerRef.current = window.setInterval(() => {
          setGmailNextRetryInSec((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);

        gmailRetryTimerRef.current = window.setTimeout(() => {
          clearGmailRetryTimers();
          if (navigator.onLine !== false && !gmailNeedsReauthRef.current) {
            void fetchGmailDigest(undefined, { silent: true });
          }
        }, delaySec * 1000);
      };

      const applyGmailSuccess = (scannedCount: number, digestItems: GmailDigestItem[]) => {
        gmailRetryAttemptRef.current = 0;
        lastGmailAutoScanMsRef.current = Date.now();
        const syncedIso = new Date().toISOString();
        setGmailError('');
        setGmailLastSyncedIso(syncedIso);
        setGmailScannedCount(scannedCount);
        setGmailDigest(digestItems);
        const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
        saveOfflineWorkspaceCache(OFFLINE_GMAIL_PREFIX, activeUid, {
          digestItems,
          scannedCount,
          syncedIso,
        });
      };

      try {
        type GmailProxyReply = {
          needsReauth?: boolean;
          error?: string;
          scannedCount?: number;
          digestItems?: GmailDigestItem[];
        };
        let proxied: { ok: boolean; status: number; data: GmailProxyReply } | null = null;
        if (hasSameOriginBackend()) {
          try {
            proxied = await apiFetchJson<GmailProxyReply>('/api/gmail/digest', {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal,
            });
          } catch (proxyErr: unknown) {
            if (!(proxyErr instanceof BackendUnavailableError)) throw proxyErr;
          }
        }

        // No backend (Android APK / Windows EXE / hosted PWA): read Gmail directly via Google REST API v1
        if (!proxied) {
          const direct = await fetchGmailDigestDirectClient(token, controller.signal);
          if (direct.needsReauth || direct.status === 401 || direct.status === 403) {
            clearGmailRetryTimers();
            gmailRetryAttemptRef.current = 0;
            setGmailNeedsReauth(true);
            if (direct.status === 401) handleWorkspaceUnauthorized();
            setGmailError(
              direct.error || 'انتهت جلسة مزامنة Google — اضغط «تجديد ربط Google الآن» في الأعلى.'
            );
            return;
          }
          if (!direct.ok) {
            scheduleSmartGmailRetry(direct.error || 'تعذر قراءة ملخص Gmail حالياً.');
            return;
          }
          applyGmailSuccess(direct.scannedCount, direct.digestItems);
          return;
        }

        const { ok, status, data } = proxied;
        if (status === 401 || status === 403 || data.needsReauth) {
          clearGmailRetryTimers();
          gmailRetryAttemptRef.current = 0;
          setGmailNeedsReauth(true);
          if (status === 401) {
            handleWorkspaceUnauthorized();
          }
          setGmailError(
            data.error || 'انتهت جلسة مزامنة Google — اضغط «تجديد ربط Google الآن» في الأعلى.'
          );
          return;
        }
        if (!ok) {
          // Automatic direct client-side fallback if backend proxy is temporarily unavailable
          const direct = await fetchGmailDigestDirectClient(token, controller.signal);
          if (direct.ok) {
            applyGmailSuccess(direct.scannedCount, direct.digestItems);
            return;
          }
          scheduleSmartGmailRetry(direct.error || data.error || 'تعذر قراءة ملخص Gmail حالياً.');
          return;
        }
        applyGmailSuccess(
          Number(data.scannedCount ?? 0),
          Array.isArray(data.digestItems) ? data.digestItems : []
        );
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          scheduleSmartGmailRetry(
            'استغرق فحص Gmail وقتاً أطول من المعتاد — جاري إعادة المحاولة تلقائياً.'
          );
        } else {
          scheduleSmartGmailRetry(
            err instanceof Error
              ? err.message
              : 'انقطع الاتصال بخدمة Gmail — جاري إعادة الاتصال تلقائياً.'
          );
        }
      } finally {
        window.clearTimeout(timer);
        setLoadingGmail(false);
      }
    },
    [clearGmailRetryTimers, fetchGmailDigestDirectClient, handleWorkspaceUnauthorized]
  );

  useEffect(() => {
    return () => clearGmailRetryTimers();
  }, [clearGmailRetryTimers]);

  const refreshWorkspace = useCallback(
    async (tokenOverride?: string, options?: { forceGmail?: boolean }) => {
      const effectiveToken = tokenOverride ?? getCalendarAccessToken();
      if (!effectiveToken) {
        if (authUser && !needsAuth) {
          setWorkspaceTokenExpired(true);
        }
        return;
      }
      const tasks: Promise<unknown>[] = [
        fetchCalendarEvents(effectiveToken),
        fetchGoogleTasks(effectiveToken),
      ];
      const shouldAutoScanGmail =
        Boolean(options?.forceGmail) ||
        (!gmailNeedsReauthRef.current && Date.now() - lastGmailAutoScanMsRef.current >= 5 * 60_000);
      if (shouldAutoScanGmail) {
        lastGmailAutoScanMsRef.current = Date.now();
        tasks.push(fetchGmailDigest(effectiveToken, { silent: !options?.forceGmail }));
      }
      await Promise.all(tasks);
    },
    [authUser, needsAuth, fetchCalendarEvents, fetchGoogleTasks, fetchGmailDigest]
  );

  const handleRefreshWorkspaceToken = useCallback(async () => {
    setIsRefreshingWorkspaceToken(true);
    try {
      const res = await refreshGoogleCalendarToken();
      if (res) {
        setAuthUser(res.user);
        setNeedsAuth(false);
        setWorkspaceTokenExpired(false);
        setGmailNeedsReauth(false);
        setGmailError('');
        await refreshWorkspace(res.accessToken, { forceGmail: true });
        showToast('🔄 تم تجديد ربط Google Workspace بنجاح ومزامنة التقويم والمهام ✓');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تجديد رمز Google Workspace الآن.';
      showToast(msg);
    } finally {
      setIsRefreshingWorkspaceToken(false);
    }
  }, [refreshWorkspace, showToast]);

  // Give the Android service what it needs to send/receive "alarm dismissed" by itself when the
  // app's WebView isn't running (phone ↔ PC: stopping on one stops the other).
  useEffect(() => {
    const native = (window as Window & { DayRhythmNative?: { setCloudAuth?: (json: string) => void } })
      .DayRhythmNative;
    if (!native?.setCloudAuth || !firebaseUser?.uid) return;
    const payload = getNativeCloudAuthPayload();
    if (!payload) return;
    try {
      native.setCloudAuth(payload);
    } catch {
      // older APK without this bridge method
    }
  }, [firebaseUser?.uid, firebaseUser?.emailVerified]);

  // Keep the Android service's charge-limit alert in sync with the app setting.
  useEffect(() => {
    try {
      (window as Window & { DayRhythmNative?: { setChargeLimit?: (l: number, e: boolean) => void } })
        .DayRhythmNative?.setChargeLimit?.(phoneChargeLimitPct, smartChargeAlertEnabled);
    } catch {
      // older APK without this bridge method
    }
  }, [phoneChargeLimitPct, smartChargeAlertEnabled]);

  // The phone itself doesn't show its charge % (that's for following it from the PC);
  // it still gets the charge-limit alert.
  const isPhoneClient = useMemo(() => detectIsMobileDeviceClient(), []);

  // ── ☀️ Sunlight mode (per device; the night theme stays the default) ───────────────
  const [sunMode, setSunMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dayrhythm_sun_mode_v1') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('theme-sun', sunMode);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sunMode ? '#eef1f4' : '#000000');
    try {
      localStorage.setItem('dayrhythm_sun_mode_v1', sunMode ? '1' : '0');
    } catch {
      // ignore
    }
  }, [sunMode]);

  // Daily cloud quota spent: hold saves (local stays the truth, badge stays steady instead of
  // flipping every second), then retry automatically when the pause ends.
  useEffect(() => {
    const onQuota = (ev: Event) => {
      const until = (ev as CustomEvent<{ until?: number }>).detail?.until ?? 0;
      setCloudPausedUntil(until);
      setFirestoreSynced(false);
    };
    window.addEventListener('dayrhythm:cloud-quota', onQuota);
    return () => window.removeEventListener('dayrhythm:cloud-quota', onQuota);
  }, []);
  useEffect(() => {
    if (cloudPausedUntil <= Date.now()) return;
    const id = window.setTimeout(() => setCloudPausedUntil(0), cloudPausedUntil - Date.now() + 500);
    return () => window.clearTimeout(id);
  }, [cloudPausedUntil]);

  // App settings that used to be per-device only: change it on one device, it changes on the other.
  useEffect(() => {
    if (!hasHydratedRemoteRef.current) {
      return;
    }
    // Same key order as sanitizeAppSyncSettings, so equal settings serialize identically.
    const next: AppSyncSettings = {
      phoneChargeLimitPct,
      smartChargeAlertEnabled,
      smartChargeKeepUntilUnplugged,
      waterRemindersEnabled,
      sunMode,
    };
    const json = JSON.stringify(next);
    if (json === lastServerAppSettingsRef.current) return;
    lastServerAppSettingsRef.current = json;
    void pushToTasksVaultRef.current({ appSettings: next });
  }, [
    phoneChargeLimitPct,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    waterRemindersEnabled,
    sunMode,
  ]);

  // Reactive cross-device sync for Creative Activities & Hobbies
  const lastSyncedCreativeSigRef = useRef<string>('');
  useEffect(() => {
    if (!hasHydratedRemoteRef.current) return;
    const sig = JSON.stringify(creativeActivities);
    if (sig === lastSyncedCreativeSigRef.current) return;
    lastSyncedCreativeSigRef.current = sig;
    void pushToTasksVaultRef.current({ creativeActivities });
  }, [creativeActivities]);

  // Reactive cross-device sync for Gemini Long-term Memories
  const lastSyncedMemoriesSigRef = useRef<string>('');
  useEffect(() => {
    if (!hasHydratedRemoteRef.current) return;
    const sig = JSON.stringify(memories);
    if (sig === lastSyncedMemoriesSigRef.current) return;
    lastSyncedMemoriesSigRef.current = sig;
    void pushToTasksVaultRef.current({ memories });
  }, [memories]);

  // Reactive cross-device sync for Daily Streaks & Commitments
  const lastSyncedStreaksSigRef = useRef<string>('');
  useEffect(() => {
    if (!hasHydratedRemoteRef.current) return;
    const sig = `${streaks.dailyCommitmentDays}:${streaks.dailyCommitmentDoneToday}:${streaks.waterTargetDays}:${streaks.waterTargetDoneToday}`;
    if (sig === lastSyncedStreaksSigRef.current) return;
    lastSyncedStreaksSigRef.current = sig;
    void pushToTasksVaultRef.current({
      dailyCommitmentDays: streaks.dailyCommitmentDays,
      dailyCommitmentDoneToday: streaks.dailyCommitmentDoneToday,
      waterTargetDays: streaks.waterTargetDays,
      waterTargetDoneToday: streaks.waterTargetDoneToday,
    });
  }, [streaks]);

  // Reactive cross-device sync for Quiet Mode & Adhan Silent Override
  const lastSyncedQuietSigRef = useRef<string>('');
  useEffect(() => {
    if (!hasHydratedRemoteRef.current) return;
    const sig = `${quietMode}:${adhanOverrideSilent}`;
    if (sig === lastSyncedQuietSigRef.current) return;
    lastSyncedQuietSigRef.current = sig;
    void pushToTasksVaultRef.current({
      quietMode,
      adhanOverrideSilent,
    });
  }, [quietMode, adhanOverrideSilent]);

  // ── Permanent Google link ────────────────────────────────────────────────────────────
  const [permanentLinkActive, setPermanentLinkActive] = useState<boolean>(() => hasPermanentLink());
  const [isStartingPermanentLink, setIsStartingPermanentLink] = useState(false);
  const [permanentLinkHintDismissed, setPermanentLinkHintDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dayrhythm_permanent_link_hint_dismissed_v1') === '1';
    } catch {
      return false;
    }
  });

  const hydrateGoogleDriveOnce = useCallback(
    async (customToken?: string): Promise<boolean> => {
      let token = customToken || (await getOrRefreshCalendarAccessToken());
      if (!token) {
        hasHydratedGoogleDriveRef.current = true;
        return false;
      }

      setIsSyncingGoogleDrive(true);
      try {
        const backup = await loadFromGoogleDriveAppData(token);
        if (backup) {
          if (backup.lifeProfile) {
            const cleanProfile = sanitizeLifeProfile(backup.lifeProfile);
            setLifeProfile(cleanProfile);
            try {
              const raw = localStorage.getItem(STORAGE_KEY);
              const parsed = raw ? JSON.parse(raw) : {};
              localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, lifeProfile: cleanProfile }));
            } catch {
              // ignore storage errors
            }
          }
          if (Array.isArray(backup.medications)) {
            const cleanMeds = backup.medications.map((m) => sanitizeMedicationItem(m));
            setMedications(cleanMeds);
            try {
              localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(cleanMeds));
            } catch {
              // ignore storage errors
            }
          }
          if (Array.isArray(backup.hydrationHistory) && backup.hydrationHistory.length === 7) {
            setHydrationHistory(backup.hydrationHistory);
            try {
              const raw = localStorage.getItem(STORAGE_KEY);
              const parsed = raw ? JSON.parse(raw) : {};
              localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, hydrationHistory: backup.hydrationHistory }));
            } catch {
              // ignore storage errors
            }
          }
          if (Array.isArray(backup.creativeActivities)) {
            const cleanCreative = backup.creativeActivities.map((a) => sanitizeCreativeActivityItem(a));
            setCreativeActivities(cleanCreative);
            try {
              localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(cleanCreative));
            } catch {
              // ignore storage errors
            }
          }
          if (Array.isArray(backup.memories)) {
            const cleanMemories = backup.memories.map((m) => sanitizeMemoryItem(m));
            setMemories(cleanMemories);
            try {
              localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(cleanMemories));
            } catch {
              // ignore storage errors
            }
          }
          if (backup.deviceSettings) {
            const cleanDev = sanitizeDeviceSettings(backup.deviceSettings);
            setDeviceSettings(cleanDev);
            try {
              const raw = localStorage.getItem(STORAGE_KEY);
              const parsed = raw ? JSON.parse(raw) : {};
              localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, deviceSettings: cleanDev }));
            } catch {
              // ignore storage errors
            }
          }
          if (backup.capsulePrefs) {
            setCapsulePrefs(backup.capsulePrefs);
            try {
              window.localStorage.setItem(CAPSULE_PREFS_STORAGE_KEY, JSON.stringify(backup.capsulePrefs));
            } catch {
              // ignore storage errors
            }
          }
          if (backup.selectedLogoId) {
            setSelectedLogoId(backup.selectedLogoId);
            try {
              window.localStorage.setItem(SELECTED_LOGO_STORAGE_KEY, backup.selectedLogoId);
            } catch {
              // ignore storage errors
            }
          }
          if (backup.quietMode) setQuietMode(backup.quietMode);
          if (typeof backup.adhanOverrideSilent === 'boolean') setAdhanOverrideSilent(backup.adhanOverrideSilent);
          if (Array.isArray(backup.chatMessages) && backup.chatMessages.length > 0) {
            setChatMessages(backup.chatMessages);
            try {
              localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(backup.chatMessages.slice(-100)));
            } catch {
              // ignore storage errors
            }
          }
          setGoogleDriveSynced(true);
          showToast('✓ تمت استعادة إعدادات ودستور حساب Google بالكامل');
        }
        hasHydratedGoogleDriveRef.current = true;
        return true;
      } catch (err) {
        console.warn('Failed hydrating Google Drive appData:', err);
        hasHydratedGoogleDriveRef.current = true;
        return false;
      } finally {
        setIsSyncingGoogleDrive(false);
      }
    },
    [showToast]
  );

  const pushFullCloudBackupImmediately = useCallback(
    async (
      customToken?: string,
      overrides?: Partial<FullDayRhythmCloudBackup>
    ): Promise<boolean> => {
      let token = customToken || (await getOrRefreshCalendarAccessToken());
      if (!token) return false;

      const backup: FullDayRhythmCloudBackup = {
        version: 1,
        updatedAtIso: new Date().toISOString(),
        updatedAtMs: Date.now(),
        lifeProfile: overrides?.lifeProfile ?? lifeProfile,
        medications: overrides?.medications ?? medications,
        hydrationHistory: overrides?.hydrationHistory ?? hydrationHistory,
        creativeActivities: overrides?.creativeActivities ?? creativeActivities,
        memories: overrides?.memories ?? memories,
        deviceSettings: overrides?.deviceSettings ?? deviceSettings,
        quietMode: overrides?.quietMode ?? quietMode,
        adhanOverrideSilent: overrides?.adhanOverrideSilent ?? adhanOverrideSilent,
        waterRemindersEnabled: overrides?.waterRemindersEnabled ?? waterRemindersEnabled,
        phoneChargeLimitPct: overrides?.phoneChargeLimitPct ?? phoneChargeLimitPct,
        smartChargeAlertEnabled: overrides?.smartChargeAlertEnabled ?? smartChargeAlertEnabled,
        smartChargeKeepUntilUnplugged: overrides?.smartChargeKeepUntilUnplugged ?? smartChargeKeepUntilUnplugged,
        capsulePrefs: overrides?.capsulePrefs ?? capsulePrefs,
        selectedLogoId: overrides?.selectedLogoId ?? selectedLogoId,
        chatMessages: (overrides?.chatMessages ?? chatMessages).slice(-50),
      };

      setIsSyncingGoogleDrive(true);
      try {
        const ok = await saveToGoogleDriveAppData(token, backup);
        if (ok) {
          setGoogleDriveSynced(true);
          hasHydratedGoogleDriveRef.current = true;
          showToast('✓ تم حفظ ومزامنة جميع الإعدادات والدستور مع حساب Google بنجاح');
          return true;
        }
        return false;
      } catch (err) {
        console.warn('Failed pushing immediate backup to Google Drive:', err);
        return false;
      } finally {
        setIsSyncingGoogleDrive(false);
      }
    },
    [
      lifeProfile,
      medications,
      hydrationHistory,
      creativeActivities,
      memories,
      deviceSettings,
      quietMode,
      adhanOverrideSilent,
      waterRemindersEnabled,
      phoneChargeLimitPct,
      smartChargeAlertEnabled,
      smartChargeKeepUntilUnplugged,
      capsulePrefs,
      selectedLogoId,
      chatMessages,
      showToast,
    ]
  );

  const handleStartPermanentLink = useCallback(async () => {
    if (!authUser) return;
    setIsStartingPermanentLink(true);
    try {
      await startPermanentLink({ uid: authUser.uid, loginHint: authUser.email });
    } catch (err: unknown) {
      setIsStartingPermanentLink(false);
      showToast(err instanceof Error ? err.message : 'تعذر بدء الربط الدائم.');
    }
  }, [authUser, showToast]);

  // Report the result of the Google redirect handled in main.tsx.
  useEffect(() => {
    const w = window as Window & {
      __dayRhythmPermanentLinkResult?: { ok: boolean; error?: string };
    };
    const result = w.__dayRhythmPermanentLinkResult;
    if (!result) return;
    delete w.__dayRhythmPermanentLinkResult;
    if (result.ok) {
      setPermanentLinkActive(true);
      setWorkspaceTokenExpired(false);
      showToast('🔗 تم الربط الدائم مع Google — مش هتحتاج تجدد الربط تاني على الجهاز ده ✓');
      void hydrateGoogleDriveOnce();
    } else if (result.error) {
      showToast(result.error);
    }
  }, [showToast, hydrateGoogleDriveOnce]);

  // Silent renewal: when the token is missing/expired, or 5 minutes before it expires.
  useEffect(() => {
    if (!authUser || needsAuth) return;
    let cancelled = false;
    const renewIfNeeded = async (force: boolean) => {
      if (!hasPermanentLink(authUser.uid)) return;
      if (!force && !isCalendarTokenExpiringSoon(5 * 60_000)) return;
      const token = await refreshGoogleCalendarTokenSilently();
      if (cancelled) return;
      if (token) {
        setWorkspaceTokenExpired(false);
        setGmailNeedsReauth(false);
        if (force) void refreshWorkspace(token);
        if (!hasHydratedGoogleDriveRef.current) {
          void hydrateGoogleDriveOnce(token);
        }
      } else {
        setPermanentLinkActive(hasPermanentLink(authUser.uid));
      }
    };
    if (workspaceTokenExpired) void renewIfNeeded(true);
    const id = window.setInterval(() => void renewIfNeeded(false), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void renewIfNeeded(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authUser, needsAuth, workspaceTokenExpired, refreshWorkspace]);

  // Automatic Background Poller for Gmail Digest (silently skips when OAuth token is absent — zero annoying hourly banners!)
  useEffect(() => {
    if (!authUser || needsAuth || gmailNeedsReauth) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        if (!getCalendarAccessToken()) return;
        void fetchGmailDigest(undefined, { silent: true });
      }
    }, 10 * 60_000);

    const handleOnlineReconnect = () => {
      if (!getCalendarAccessToken()) return;
      gmailRetryAttemptRef.current = 0;
      clearGmailRetryTimers();
      void refreshWorkspace(undefined, { forceGmail: false });
    };

    const handleVisibilityResume = () => {
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine !== false &&
        Date.now() - lastGmailAutoScanMsRef.current >= 10 * 60_000
      ) {
        if (!getCalendarAccessToken()) return;
        void fetchGmailDigest(undefined, { silent: true });
      }
    };

    window.addEventListener('online', handleOnlineReconnect);
    document.addEventListener('visibilitychange', handleVisibilityResume);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnlineReconnect);
      document.removeEventListener('visibilitychange', handleVisibilityResume);
    };
  }, [
    authUser,
    needsAuth,
    gmailNeedsReauth,
    workspaceTokenExpired,
    fetchGmailDigest,
    refreshWorkspace,
    clearGmailRetryTimers,
  ]);

  useEffect(() => {
    const unsubCalendar = initCalendarAuth(
      (user, token) => {
        setAuthUser(user);
        setNeedsAuth(false);
        setUseOfflineDemo(false);
        setWorkspaceTokenExpired(!token);
        // Hydrate cached Calendar/Tasks/Gmail immediately so the user can work 100% offline!
        const cachedCal = loadOfflineWorkspaceCache<{
          calendars?: GoogleCalendarInfo[];
          events?: GoogleCalendarEventItem[];
        }>(OFFLINE_CAL_PREFIX, user.uid);
        if (cachedCal) {
          if (Array.isArray(cachedCal.calendars) && cachedCal.calendars.length > 0) {
            setCalendarList(cachedCal.calendars);
          }
          if (Array.isArray(cachedCal.events)) {
            setCalendarEvents(cachedCal.events);
          }
        }
        const cachedTasks = loadOfflineWorkspaceCache<{
          taskLists?: GoogleTaskList[];
          tasks?: GoogleTaskItem[];
        }>(OFFLINE_TASKS_PREFIX, user.uid);
        if (cachedTasks) {
          if (Array.isArray(cachedTasks.taskLists) && cachedTasks.taskLists.length > 0) {
            setGoogleTaskLists(cachedTasks.taskLists);
          }
          if (Array.isArray(cachedTasks.tasks)) {
            setGoogleTasks(cachedTasks.tasks);
          }
        }
        const cachedGmail = loadOfflineWorkspaceCache<{
          digestItems?: GmailDigestItem[];
          scannedCount?: number;
          syncedIso?: string;
        }>(OFFLINE_GMAIL_PREFIX, user.uid);
        if (cachedGmail) {
          if (Array.isArray(cachedGmail.digestItems)) setGmailDigest(cachedGmail.digestItems);
          if (typeof cachedGmail.scannedCount === 'number') {
            setGmailScannedCount(cachedGmail.scannedCount);
          }
          if (typeof cachedGmail.syncedIso === 'string') {
            setGmailLastSyncedIso(cachedGmail.syncedIso);
          }
        }
        if (token && navigator.onLine !== false) {
          void refreshWorkspace(token, { forceGmail: true });
        }
        void pullFromTasksVault();
        if (token) {
          void hydrateGoogleDriveOnce(token);
        } else {
          void getOrRefreshCalendarAccessToken().then((freshToken) => {
            if (freshToken) {
              setWorkspaceTokenExpired(false);
              void pullFromTasksVault();
              void hydrateGoogleDriveOnce(freshToken);
            } else {
              hasHydratedGoogleDriveRef.current = true;
            }
          });
        }
      },
      () => {
        setAuthUser(null);
        setNeedsAuth(true);
        setWorkspaceTokenExpired(false);
      }
    );
    const unsubFirebase = observeFirebaseUser((user) => {
      // Strictly keep Anonymous or unverified accounts isolated & empty
      if (!user || user.isAnonymous) {
        setFirebaseUser(null);
        hasHydratedRemoteRef.current = false;
        hasHydratedCloudChatRef.current = false;
        syncedChatTextByIdRef.current.clear();
        cloudChatIdsRef.current.clear();
        setFirestoreReady(false);
        setFirestoreSynced(false);
        return;
      }
      setFirebaseUser(user);
      void pullFromTasksVault();
      try {
        const prevUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
        if (prevUid && prevUid !== user.uid) {
          // Different user signed in: clear previous user's local cache immediately before hydrating cloud
          clearAllPersonalLocalStorage();
          setMedications(DEFAULT_MEDICATIONS);
          setCreativeActivities(DEFAULT_CREATIVE_ACTIVITIES);
          setMemories(DEFAULT_MEMORIES);
          setLifeProfile(DEFAULT_LIFE_PROFILE);
          setDeviceSettings(DEFAULT_DEVICE_SETTINGS);
          setChatMessages([WELCOME_MESSAGE]);
          setGmailDigest([]);
          setGmailScannedCount(0);
          setGmailLastSyncedIso('');
        }
        localStorage.setItem(ACTIVE_UID_STORAGE_KEY, user.uid);
      } catch {
        // ignore storage errors
      }
    });
    return () => {
      unsubCalendar();
      unsubFirebase();
    };
  }, [refreshWorkspace]);

  const handleIncomingRemoteSync = useCallback(
    (payload: {
      opId?: string;
      clientId?: string;
      scope?: string;
      action?: string;
      undoSnapshot?: DeletedWorkspaceSnapshot;
      extra?: Record<string, unknown>;
    }) => {
      if (!payload || payload.clientId === clientIdRef.current) return;
      if (payload.opId) {
        if (seenSyncOpIdsRef.current.has(payload.opId)) return;
        seenSyncOpIdsRef.current.add(payload.opId);
        if (seenSyncOpIdsRef.current.size > 150) {
          const oldest = seenSyncOpIdsRef.current.values().next().value;
          if (oldest) seenSyncOpIdsRef.current.delete(oldest);
        }
      }

      if (payload.scope === 'alarm_dismiss') {
        stopContinuousAlert();
        stopSmartChargeCompleteAlert();
        stopNativeAlerts();
        setSmartChargeAudioActive(false);
        setActiveAudioAlert(null);
        setPersistentAlert(null);
        setAlarmRinging(false);
        showToast('🔕 تم إيقاف التنبيه تلقائياً من جهازك الآخر ✓');
        return;
      }

      if (payload.scope === 'alarm_trigger') {
        setAlarmRinging(true);
        const extra = payload.extra as
          | {
              title?: string;
              body?: string;
              kind?: TaskSoundCategory;
              privacyEmoji?: string;
              sourceLabel?: string;
              snoozeMinutes?: number;
            }
          | undefined;
        const emoji = extra?.privacyEmoji || '🔔';
        const title = extra?.title || 'تنبيه متزامن (الموبايل ↔ الكمبيوتر)';
        const source = extra?.sourceLabel || 'مزامنة سحابية فورية';
        const soundCat = (extra?.kind || 'general') as TaskSoundCategory;
        triggerTaskAlert(emoji, soundCat, {
          privacyEmoji: emoji,
          displayTitle: title,
          sourceLabel: source,
        });
        return;
      }

      if (payload.action === 'undo_restore') {
        setLastDeletedWorkspaceItem(null);
      } else if (payload.undoSnapshot) {
        setLastDeletedWorkspaceItem(payload.undoSnapshot);
      }

      if (payload.scope === 'calendar') {
        void fetchCalendarEvents();
      } else if (payload.scope === 'tasks') {
        void fetchGoogleTasks();
      } else {
        void refreshWorkspace();
      }
    },
    [fetchCalendarEvents, fetchGoogleTasks, refreshWorkspace, showToast, stopNativeAlerts, triggerTaskAlert]
  );

  // The long-lived listeners below (WebSocket + Firestore) must NOT re-subscribe whenever these
  // callbacks change identity. They used to: every Firestore snapshot replaced lifeProfile →
  // triggerTaskAlert/handleIncomingRemoteSync changed → the Firestore listener re-subscribed →
  // a fresh (stale) snapshot arrived → loop. That reset just-tapped water cups and spammed
  // WebSocket reconnects. The listeners now call the latest version through refs.
  const handleIncomingRemoteSyncRef = useRef(handleIncomingRemoteSync);
  handleIncomingRemoteSyncRef.current = handleIncomingRemoteSync;
  const refreshWorkspaceRef = useRef(refreshWorkspace);
  refreshWorkspaceRef.current = refreshWorkspace;
  const callRemoteSync = useCallback(
    (payload: Parameters<typeof handleIncomingRemoteSync>[0]) => handleIncomingRemoteSyncRef.current(payload),
    []
  );
  const callRefreshWorkspace = useCallback(() => refreshWorkspaceRef.current(), []);

  // Instant Cross-Device WebSocket Sync Hub (/ws/sync) + Auto-Recovery (Dead-Socket Teardown + Exponential Backoff + Wake/Online Recovery)
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid || !firebaseUser?.emailVerified) {
      setWsConnected(false);
      return;
    }

    let closedByCleanup = false;
    let reconnectTimer: number | null = null;
    let connectWatchdogTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let pongTimeoutTimer: number | null = null;
    let backoffAttempt = 0;
    // A host with no sync server (static build, plain preview) never accepts the socket:
    // stop retrying after a few failures instead of reconnecting forever.
    let everConnected = false;
    let failedWithoutConnect = 0;
    let hadPreviousDisconnect = false;
    let lastVisibleAtMs = Date.now();

    const clearTimers = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (connectWatchdogTimer !== null) {
        window.clearTimeout(connectWatchdogTimer);
        connectWatchdogTimer = null;
      }
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (pongTimeoutTimer !== null) {
        window.clearTimeout(pongTimeoutTimer);
        pongTimeoutTimer = null;
      }
    };

    const teardownSocket = (sock: WebSocket | null, reason = 'auto_recovery_reset') => {
      if (!sock) return;
      sock.onopen = null;
      sock.onmessage = null;
      sock.onclose = null;
      sock.onerror = null;
      try {
        if (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING) {
          sock.close(4000, reason);
        }
      } catch {
        // ignore socket close errors
      }
      if (wsRef.current === sock) {
        wsRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (closedByCleanup) return;
      if (reconnectTimer !== null) return;
      if (!everConnected) {
        failedWithoutConnect += 1;
        if (failedWithoutConnect >= 5) return;
      }
      const baseMs = Math.min(30_000, 1000 * Math.pow(2, backoffAttempt));
      const jitterMs = Math.floor(Math.random() * Math.min(1500, baseMs * 0.3));
      const delayMs = Math.min(30_000, baseMs + jitterMs);
      backoffAttempt = Math.min(backoffAttempt + 1, 6);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectWs();
      }, delayMs);
    };

    const connectWs = () => {
      if (closedByCleanup) return;
      clearTimers();
      teardownSocket(wsRef.current, 'replace_stale_socket');

      // Skip local /ws/sync if running on static virtual Firebase Hosting domain without a WS backend
      const hostLower = window.location.hostname.toLowerCase();
      if (hostLower.endsWith('.web.app') || hostLower.endsWith('.firebaseapp.com')) {
        setWsConnected(false);
        return;
      }

      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/sync`);
        wsRef.current = ws;

        // Abort hung CONNECTING handshakes after 10s
        connectWatchdogTimer = window.setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            setWsConnected(false);
            hadPreviousDisconnect = true;
            teardownSocket(ws, 'connect_timeout');
            scheduleReconnect();
          }
        }, 10_000);

        ws.onopen = () => {
          if (connectWatchdogTimer !== null) {
            window.clearTimeout(connectWatchdogTimer);
            connectWatchdogTimer = null;
          }
          backoffAttempt = 0;
          everConnected = true;
          setWsConnected(true);
          ws.send(
            JSON.stringify({
              type: 'join',
              uid,
              clientId: clientIdRef.current,
            })
          );

          if (hadPreviousDisconnect) {
            hadPreviousDisconnect = false;
            void callRefreshWorkspace();
            triggerFirestoreRecovery(false);
          }

          // Active Ping/Pong dead-socket liveness monitor
          heartbeatTimer = window.setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) {
              setWsConnected(false);
              hadPreviousDisconnect = true;
              teardownSocket(ws, 'socket_not_open');
              scheduleReconnect();
              return;
            }
            try {
              ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
            } catch {
              setWsConnected(false);
              hadPreviousDisconnect = true;
              teardownSocket(ws, 'ping_send_failed');
              scheduleReconnect();
              return;
            }
            if (pongTimeoutTimer !== null) window.clearTimeout(pongTimeoutTimer);
            pongTimeoutTimer = window.setTimeout(() => {
              // Zombie/half-open connection detected: no pong within 10s -> force teardown & recover
              setWsConnected(false);
              hadPreviousDisconnect = true;
              teardownSocket(ws, 'pong_timeout');
              scheduleReconnect();
            }, 10_000);
          }, 20_000);
        };

        ws.onmessage = (ev) => {
          if (pongTimeoutTimer !== null) {
            window.clearTimeout(pongTimeoutTimer);
            pongTimeoutTimer = null;
          }
          try {
            const msg = JSON.parse(String(ev.data)) as {
              type?: string;
              opId?: string;
              clientId?: string;
              scope?: string;
              action?: string;
              undoSnapshot?: DeletedWorkspaceSnapshot;
              levelPct?: number;
              charging?: boolean;
              chargeLimitPct?: number;
              updatedAtMs?: number;
              deviceLabel?: string;
            };
            if (msg.type === 'pong') return;
            if (msg.type === 'battery' && typeof msg.levelPct === 'number') {
              const rawEta = (msg as { chargeTimeRemainingMin?: number }).chargeTimeRemainingMin;
              const incoming: PhoneBatteryTelemetry = {
                levelPct: Math.max(0, Math.min(100, Math.round(msg.levelPct))),
                charging: Boolean(msg.charging),
                chargeLimitPct:
                  typeof msg.chargeLimitPct === 'number'
                    ? Math.max(60, Math.min(100, Math.round(msg.chargeLimitPct)))
                    : phoneChargeLimitRef.current,
                chargeTimeRemainingMin:
                  typeof rawEta === 'number' && Number.isFinite(rawEta)
                    ? Math.max(-1, Math.min(1440, Math.round(rawEta)))
                    : -1,
                updatedAtMs: typeof msg.updatedAtMs === 'number' ? msg.updatedAtMs : Date.now(),
                deviceLabel: typeof msg.deviceLabel === 'string' && msg.deviceLabel ? msg.deviceLabel : 'الهاتف',
              };
              setPhoneBattery(incoming);
              setBatteryGuard((prev) => ({
                ...prev,
                levelPct: incoming.levelPct,
                cableConnected: incoming.charging,
                pcAlertActive:
                  incoming.charging &&
                  incoming.levelPct >= incoming.chargeLimitPct &&
                  prev.bypassChargingLimitPct === null,
                autoSilencedByDisconnect: !incoming.charging && prev.cableConnected,
              }));
              return;
            }
            if (msg.type === 'sync') {
              callRemoteSync(msg);
            }
          } catch {
            // ignore malformed message
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          hadPreviousDisconnect = true;
          clearTimers();
          if (wsRef.current === ws) {
            wsRef.current = null;
          }
          scheduleReconnect();
        };

        ws.onerror = () => {
          setWsConnected(false);
          hadPreviousDisconnect = true;
          teardownSocket(ws, 'ws_error');
          scheduleReconnect();
        };
      } catch {
        setWsConnected(false);
        hadPreviousDisconnect = true;
        scheduleReconnect();
      }
    };

    connectWs();

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('dayrhythm_sync');
        bc.onmessage = (ev) => {
          if (ev.data?.type === 'sync') {
            callRemoteSync(ev.data);
          }
        };
      } catch {
        // ignore BroadcastChannel errors
      }
    }

    const triggerImmediateAutoRecovery = (forceFirestoreReset: boolean) => {
      if (closedByCleanup) return;
      backoffAttempt = 0;
      const sock = wsRef.current;
      if ((everConnected || failedWithoutConnect < 5) && (!sock || sock.readyState !== WebSocket.OPEN)) {
        connectWs();
      }
      triggerFirestoreRecovery(forceFirestoreReset);
      void callRefreshWorkspace();
    };

    const handleOnline = () => {
      triggerImmediateAutoRecovery(true);
    };

    const handleNativeNetworkRecovered = () => {
      triggerImmediateAutoRecovery(true);
    };

    const handleNativeWsSync = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent<string>).detail;
        if (typeof detail === 'string') {
          const parsed = JSON.parse(detail);
          if (parsed && typeof parsed === 'object') {
            callRemoteSync(parsed);
          }
        }
      } catch {
        // ignore malformed native WS payload
      }
    };

    const handleResumeSync = () => {
      if (document.visibilityState === 'visible') {
        const sleptMs = Date.now() - lastVisibleAtMs;
        lastVisibleAtMs = Date.now();
        triggerImmediateAutoRecovery(sleptMs > 45_000);
      } else {
        lastVisibleAtMs = Date.now();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleResumeSync);
    window.addEventListener('dayrhythm:network-recovered', handleNativeNetworkRecovered);
    window.addEventListener('dayrhythm:ws-sync', handleNativeWsSync);
    document.addEventListener('visibilitychange', handleResumeSync);

    return () => {
      closedByCleanup = true;
      clearTimers();
      teardownSocket(wsRef.current, 'unmount');
      bc?.close();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleResumeSync);
      window.removeEventListener('dayrhythm:network-recovered', handleNativeNetworkRecovered);
      window.removeEventListener('dayrhythm:ws-sync', handleNativeWsSync);
      document.removeEventListener('visibilitychange', handleResumeSync);
    };
  }, [firebaseUser?.uid, firebaseUser?.emailVerified, callRemoteSync, callRefreshWorkspace]);

  const applyRemote = useCallback((remote: SyncedRhythmPayload & {
    medications?: MedicationItem[];
    creativeActivities?: CreativeActivityItem[];
    memories?: MemoryItem[];
  }) => {
    // ── Instant Bidirectional Remote Alarm Dismissal (Phone ↔ PC) ──
    const remoteDismiss =
      (remote as { lastDismissSignal?: { timestampMs: number; scope: string; action: string; clientId: string } })
        .lastDismissSignal || remote.syncSignal;
    const remoteSenderId =
      (remoteDismiss as { clientId?: string; originClientId?: string })?.clientId ||
      (remoteDismiss as { originClientId?: string })?.originClientId;
    if (remoteDismiss && remoteSenderId !== clientIdRef.current) {
      const dismissTs = remoteDismiss.timestampMs || 0;
      if (Date.now() - dismissTs < 180_000) {
        if (
          remoteDismiss.scope === 'alarm_dismiss' ||
          remoteDismiss.action?.includes('dismiss') ||
          remoteDismiss.action?.includes('done') ||
          remoteDismiss.action?.includes('water')
        ) {
          stopContinuousAlert();
          stopNativeAlerts();
          setActiveAudioAlert(null);
          setPersistentAlert(null);
          setAlarmRinging(false);
          try {
            const bridge = (
              window as Window & {
                DayRhythmNative?: {
                  dismissActiveAlerts?: () => void;
                  stopNativeAlarmSound?: () => void;
                };
              }
            ).DayRhythmNative;
            bridge?.stopNativeAlarmSound?.();
            bridge?.dismissActiveAlerts?.();
          } catch {
            // ignore bridge
          }
        }
      }
    }
    if (remote.appSettings) {
      const a = remote.appSettings;
      setPhoneChargeLimitPct(a.phoneChargeLimitPct);
      setSmartChargeAlertEnabled(a.smartChargeAlertEnabled);
      setSmartChargeKeepUntilUnplugged(a.smartChargeKeepUntilUnplugged);
      setWaterRemindersEnabled(a.waterRemindersEnabled);
      setSunMode(a.sunMode);
      try {
        localStorage.setItem('dayrhythm_phone_charge_limit', String(a.phoneChargeLimitPct));
        localStorage.setItem('dayrhythm_smart_charge_alert_enabled', String(a.smartChargeAlertEnabled));
        localStorage.setItem(SMART_CHARGE_KEEP_KEY, String(a.smartChargeKeepUntilUnplugged));
        localStorage.setItem(WATER_REMINDER_STORAGE_KEY, String(a.waterRemindersEnabled));
      } catch {
        // ignore storage errors
      }
    }
    if (remote.quietMode) setQuietMode(remote.quietMode);
    if (typeof remote.adhanOverrideSilent === 'boolean') setAdhanOverrideSilent(remote.adhanOverrideSilent);
    lastSyncedQuietSigRef.current = `${remote.quietMode || quietMode}:${remote.adhanOverrideSilent ?? adhanOverrideSilent}`;
    setSurfaceTheme('amoled');
    if (remote.deviceSettings) {
      const cleanDev = sanitizeDeviceSettings(remote.deviceSettings);
      setDeviceSettings(cleanDev);
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, deviceSettings: cleanDev }));
      } catch {
        // ignore
      }
    }
    if (remote.lifeProfile) {
      const cleanProfile = sanitizeLifeProfile(remote.lifeProfile);
      setLifeProfile(cleanProfile);
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, lifeProfile: cleanProfile }));
      } catch {
        // ignore
      }
    }
    if (Array.isArray(remote.medications) && remote.medications.length > 0) {
      const cleanMeds = remote.medications.map((m) => sanitizeMedicationItem(m));
      setMedications(cleanMeds);
      try {
        localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(cleanMeds));
      } catch {
        // ignore
      }
    }
    if (Array.isArray(remote.memories) && remote.memories.length > 0) {
      const cleanMems = remote.memories.map((m) => sanitizeMemoryItem(m));
      lastSyncedMemoriesSigRef.current = JSON.stringify(cleanMems);
      setMemories(cleanMems);
      try {
        localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(cleanMems));
      } catch {
        // ignore
      }
    }
    if (Array.isArray(remote.creativeActivities) && remote.creativeActivities.length > 0) {
      const cleanCreatives = remote.creativeActivities.map((c) => sanitizeCreativeActivityItem(c));
      lastSyncedCreativeSigRef.current = JSON.stringify(cleanCreatives);
      setCreativeActivities(cleanCreatives);
      try {
        localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(cleanCreatives));
      } catch {
        // ignore
      }
    }
    if (remote.uiPrefs) {
      const cleanUi = sanitizeUiPrefs(remote.uiPrefs);
      if (cleanUi) {
        setSelectedLogoId(cleanUi.selectedLogoId);
        setCapsulePrefs({
          orientation: cleanUi.capsuleOrientation,
          size: cleanUi.capsuleSize,
        });
        if (cleanUi.cloudApiUrl) {
          syncSavedCloudApiUrlFromRemote(cleanUi.cloudApiUrl);
          try {
            window.dispatchEvent(
              new CustomEvent('dayrhythm:cloud-api-updated', { detail: { url: cleanUi.cloudApiUrl } })
            );
          } catch {
            // ignore event errors
          }
        }
        try {
          window.localStorage.setItem(SELECTED_LOGO_STORAGE_KEY, cleanUi.selectedLogoId);
          window.localStorage.setItem(
            CAPSULE_PREFS_STORAGE_KEY,
            JSON.stringify({
              orientation: cleanUi.capsuleOrientation,
              size: cleanUi.capsuleSize,
            })
          );
        } catch {
          // ignore storage errors
        }
      }
    }

    if (typeof remote.dailyCommitmentDays === 'number') {
      lastSyncedStreaksSigRef.current = `${remote.dailyCommitmentDays}:${Boolean(remote.dailyCommitmentDoneToday)}:${remote.waterTargetDays ?? 0}:${Boolean(remote.waterTargetDoneToday)}`;
      setStreaks((prev) => {
        if (Date.now() < localWriteLockUntilRef.current) return prev;
        return {
          dailyCommitmentDays: remote.dailyCommitmentDays!,
          dailyCommitmentDoneToday: Boolean(remote.dailyCommitmentDoneToday),
          waterTargetDays: remote.waterTargetDays ?? 0,
          waterTargetDoneToday: Boolean(remote.waterTargetDoneToday),
        };
      });
    }

    if (typeof remote.cupsLogged === 'number') {
      const remoteTz = remote.lifeProfile?.currentTimeZone || activeTimeZone || 'Africa/Cairo';
      const labels = getLast7DayLabels(remoteTz);
      const todayIso = getDateIsoInTimeZone(remoteTz);
      const isSameDay = remote.hydrationDateKey === todayIso;
      const baseCounts = isSameDay
        ? (remote.hydrationWeeklyCounts || [0, 0, 0, 0, 0, 0, 0])
        : [...(remote.hydrationWeeklyCounts || [0, 0, 0, 0, 0, 0, 0]).slice(1), 0];

      setHydrationHistory((prev) => {
        const prevToday = prev.length > 0 ? prev[prev.length - 1] : null;
        return labels.map((labelAr, idx) => {
          const isToday = idx === 6;
          const t = remote.targetCups || (prevToday ? prevToday.targetCups : 13);
          let c = isToday
            ? isSameDay
              ? remote.cupsLogged!
              : 0
            : baseCounts[idx] ?? 0;

          // Bulletproof Anti-Downgrade: NEVER allow remote sync to wipe today's logged cups!
          if (isToday) {
            if (isSameDay) {
              if (Date.now() < localWriteLockUntilRef.current || (prevToday && prevToday.cupsLogged > c)) {
                c = Math.max(c, prevToday ? prevToday.cupsLogged : 0);
              }
            } else {
              // Remote snapshot hasn't recorded today yet or is from a previous day:
              // Preserve today's local logged progress completely!
              if (prevToday && prevToday.dateKey === todayIso) {
                c = prevToday.cupsLogged;
              }
            }
          }

          const slots =
            isToday && prevToday && prevToday.dateKey === todayIso && prevToday.cupsLogged >= c && prevToday.slots.length === t
              ? prevToday.slots
              : Array.from({ length: t }, (_, sIdx) => sIdx < c);

          return {
            dateKey: isToday ? todayIso : `day-${idx}`,
            labelAr,
            cupsLogged: Math.min(t, c),
            targetCups: t,
            slots,
          };
        });
      });
    }
  }, []);

  const applyOrDefer = useCallback(
    (remote: SyncedRhythmPayload & {
      medications?: MedicationItem[];
      creativeActivities?: CreativeActivityItem[];
      memories?: MemoryItem[];
    }) => {
      const waitMs = localWriteLockUntilRef.current - Date.now();
      if (waitMs > 0) {
        pendingRemoteRef.current = remote as SyncedRhythmPayload;
        if (pendingRemoteTimerRef.current !== null) {
          window.clearTimeout(pendingRemoteTimerRef.current);
        }
        pendingRemoteTimerRef.current = window.setTimeout(() => {
          pendingRemoteTimerRef.current = null;
          const latest = pendingRemoteRef.current;
          pendingRemoteRef.current = null;
          if (latest) applyOrDefer(latest);
        }, waitMs + 50);
        return;
      }
      applyRemote(remote);
    },
    [applyRemote]
  );

  const lastAppliedTasksSyncMsRef = useRef<number>(0);
  const isPullingTasksVaultRef = useRef<boolean>(false);

  const pushToTasksVaultImmediately = useCallback(
    async (patch?: Partial<TasksVaultPayload>) => {
      // Avoid pushing default state before having hydrated from cloud on startup
      if (!hasHydratedRemoteRef.current && !patch) return;

      const token = await getOrRefreshCalendarAccessToken();
      if (!token) return;

      const todayEntry = hydrationHistory[hydrationHistory.length - 1];
      const remoteTz = (patch?.lifeProfile || lifeProfile).currentTimeZone || 'Africa/Cairo';
      const todayIso = getDateIsoInTimeZone(remoteTz);

      const payload: TasksVaultPayload = {
        updatedAtMs: Date.now(),
        originClientId: clientIdRef.current,
        hydrationDateKey: todayIso,
        cupsLogged: patch?.cupsLogged ?? todayEntry?.cupsLogged ?? 0,
        targetCups: patch?.targetCups ?? todayEntry?.targetCups ?? 13,
        hydrationWeeklyCounts: patch?.hydrationWeeklyCounts ?? hydrationHistory.map((d) => d.cupsLogged),
        dailyCommitmentDays: patch?.dailyCommitmentDays ?? streaks.dailyCommitmentDays,
        dailyCommitmentDoneToday: patch?.dailyCommitmentDoneToday ?? streaks.dailyCommitmentDoneToday,
        waterTargetDays: patch?.waterTargetDays ?? streaks.waterTargetDays,
        waterTargetDoneToday: patch?.waterTargetDoneToday ?? streaks.waterTargetDoneToday,
        quietMode: patch?.quietMode ?? quietMode,
        adhanOverrideSilent: patch?.adhanOverrideSilent ?? adhanOverrideSilent,
        surfaceTheme,
        deviceSettings: patch?.deviceSettings ?? deviceSettings,
        lifeProfile: patch?.lifeProfile ?? lifeProfile,
        medications: patch?.medications ?? medications,
        creativeActivities: patch?.creativeActivities ?? creativeActivities,
        memories: patch?.memories ?? memories,
        appSettings: patch?.appSettings ?? {
          phoneChargeLimitPct,
          smartChargeAlertEnabled,
          smartChargeKeepUntilUnplugged,
          waterRemindersEnabled,
          sunMode,
        },
        uiPrefs: sanitizeUiPrefs({
          selectedLogoId: patch?.uiPrefs?.selectedLogoId ?? selectedLogoId,
          capsuleOrientation: patch?.uiPrefs?.capsuleOrientation ?? capsulePrefs.orientation,
          capsuleSize: patch?.uiPrefs?.capsuleSize ?? capsulePrefs.size,
          cloudApiUrl: getSavedCloudApiUrl() || undefined,
        }),
      };

      lastAppliedTasksSyncMsRef.current = payload.updatedAtMs;
      void pushRhythmStateToTasks(token, payload);
    },
    [
      hydrationHistory,
      lifeProfile,
      streaks,
      quietMode,
      adhanOverrideSilent,
      surfaceTheme,
      deviceSettings,
      medications,
      creativeActivities,
      memories,
      phoneChargeLimitPct,
      smartChargeAlertEnabled,
      smartChargeKeepUntilUnplugged,
      waterRemindersEnabled,
      sunMode,
      selectedLogoId,
      capsulePrefs,
    ]
  );

  useEffect(() => {
    pushToTasksVaultRef.current = pushToTasksVaultImmediately;
  }, [pushToTasksVaultImmediately]);

  const pullFromTasksVault = useCallback(async () => {
    if (isPullingTasksVaultRef.current) return;
    const token = await getOrRefreshCalendarAccessToken();
    if (!token) return;

    isPullingTasksVaultRef.current = true;
    try {
      const remote = await pullRhythmStateFromTasks(token);
      if (!remote) {
        hasHydratedRemoteRef.current = true;
        return;
      }
      if (remote.originClientId === clientIdRef.current) return;
      if (remote.updatedAtMs <= lastAppliedTasksSyncMsRef.current) return;

      lastAppliedTasksSyncMsRef.current = remote.updatedAtMs;
      hasHydratedRemoteRef.current = true;
      setFirestoreSynced(true);
      setGoogleDriveSynced(true);
      applyOrDefer(remote as SyncedRhythmPayload & {
        medications?: MedicationItem[];
        creativeActivities?: CreativeActivityItem[];
        memories?: MemoryItem[];
      });
    } catch (err) {
      console.warn('[TasksVault] pull error:', err);
    } finally {
      isPullingTasksVaultRef.current = false;
    }
  }, [applyOrDefer]);

  // Real-time automatic polling & focus resume for Google Tasks Cloud Sync (sub-second cross-device sync)
  useEffect(() => {
    const checkSync = () => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        void pullFromTasksVault();
      }
    };

    checkSync();
    const intervalId = window.setInterval(checkSync, 3000);

    window.addEventListener('visibilitychange', checkSync);
    window.addEventListener('focus', checkSync);
    window.addEventListener('online', checkSync);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('visibilitychange', checkSync);
      window.removeEventListener('focus', checkSync);
      window.removeEventListener('online', checkSync);
    };
  }, [pullFromTasksVault]);

  // Google Cloud Session Initializer (strictly verified Google account)
  useEffect(() => {
    const isGoogle = Boolean(firebaseUser?.providerData?.some((p) => p.providerId === 'google.com'));
    if (!firebaseUser?.uid || firebaseUser.isAnonymous || (!firebaseUser.emailVerified && !isGoogle)) {
      return;
    }

    hasHydratedRemoteRef.current = true;
    setFirestoreReady(true);
    setFirestoreSynced(true);
    void pullFromTasksVault();
  }, [firebaseUser?.uid, firebaseUser?.isAnonymous, firebaseUser?.emailVerified, firebaseUser?.providerData, pullFromTasksVault]);

  useEffect(() => {
    try {
      localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(medications));
    } catch {
      // ignore storage errors
    }
  }, [medications]);

  useEffect(() => {
    try {
      localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(creativeActivities));
    } catch {
      // ignore storage errors
    }
  }, [creativeActivities]);

  useEffect(() => {
    try {
      localStorage.setItem(WATER_REMINDER_STORAGE_KEY, String(waterRemindersEnabled));
    } catch {
      // ignore storage errors
    }
  }, [waterRemindersEnabled]);

  const handleToggleWaterReminders = useCallback(() => {
    setWaterRemindersEnabled((prev) => {
      const next = !prev;
      showToast(
        next
          ? '🔔 تم تفعيل تنبيهات كل كوب ماء تلقائياً حسب جدولك العلمي'
          : '🔕 تم إيقاف تنبيهات أكواب الماء مؤقتاً'
      );
      return next;
    });
  }, [showToast]);

  const handleRequestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      showToast('المتصفح لا يدعم إشعارات النظام — ستعمل التنبيهات الصوتية داخل التطبيق');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        setWaterRemindersEnabled(true);
        showToast('🔔 تم تفعيل إشعارات النظام لكل كوب ماء وجرعة علاج بنجاح ✓');
      } else {
        showToast('تم رفض إشعارات المتصفح — ستظل التنبيهات الصوتية تعمل داخل التطبيق');
      }
    } catch {
      showToast('تعذر طلب صلاحية الإشعارات — ستعمل التنبيهات الصوتية داخل التطبيق');
    }
  }, [showToast]);

  useEffect(() => {
    try {
      localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(memories));
    } catch {
      // ignore storage errors
    }
  }, [memories]);

  // Continuous Auto-Save to Google Drive appDataFolder (Single Account Source of Truth)
  useEffect(() => {
    if (!hasHydratedGoogleDriveRef.current) return;

    const timer = window.setTimeout(async () => {
      const token = await getOrRefreshCalendarAccessToken();
      if (!token) return;

      const backup: FullDayRhythmCloudBackup = {
        version: 1,
        updatedAtIso: new Date().toISOString(),
        updatedAtMs: Date.now(),
        lifeProfile,
        medications,
        hydrationHistory,
        creativeActivities,
        memories,
        deviceSettings,
        quietMode,
        adhanOverrideSilent,
        waterRemindersEnabled,
        phoneChargeLimitPct,
        smartChargeAlertEnabled,
        smartChargeKeepUntilUnplugged,
        capsulePrefs,
        selectedLogoId,
        chatMessages: chatMessages.slice(-50),
      };

      if (isSavingGoogleDriveRef.current) return;
      isSavingGoogleDriveRef.current = true;
      try {
        const ok = await saveToGoogleDriveAppData(token, backup);
        if (ok) setGoogleDriveSynced(true);
      } finally {
        isSavingGoogleDriveRef.current = false;
      }
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [
    lifeProfile,
    medications,
    hydrationHistory,
    creativeActivities,
    memories,
    deviceSettings,
    quietMode,
    adhanOverrideSilent,
    waterRemindersEnabled,
    phoneChargeLimitPct,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    capsulePrefs,
    selectedLogoId,
    chatMessages,
  ]);

  // Persist local cache & push changes IMMEDIATELY to Firebase Firestore across devices (zero debounce lag)
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ hydrationHistory, deviceSettings, lifeProfile })
      );
    } catch {
      // ignore quota errors
    }

    if (!hasHydratedRemoteRef.current) {
      return;
    }

    const todayEntry = hydrationHistory[hydrationHistory.length - 1];
    if (!todayEntry) return;

    const payload: TasksVaultPayload = {
      updatedAtMs: Date.now(),
      originClientId: clientIdRef.current,
      hydrationDateKey: getDateIsoInTimeZone(activeTimeZone),
      cupsLogged: todayEntry.cupsLogged,
      targetCups: todayEntry.targetCups,
      hydrationWeeklyCounts: hydrationHistory.map((d) => d.cupsLogged),
      dailyCommitmentDays: streaks.dailyCommitmentDays,
      dailyCommitmentDoneToday: streaks.dailyCommitmentDoneToday,
      waterTargetDays: streaks.waterTargetDays,
      waterTargetDoneToday: streaks.waterTargetDoneToday,
      quietMode,
      adhanOverrideSilent,
      surfaceTheme,
      deviceSettings,
      lifeProfile,
      medications,
      creativeActivities,
      memories,
      appSettings: {
        phoneChargeLimitPct,
        smartChargeAlertEnabled,
        smartChargeKeepUntilUnplugged,
        waterRemindersEnabled,
        sunMode,
      },
      uiPrefs: sanitizeUiPrefs({
        selectedLogoId,
        capsuleOrientation: capsulePrefs.orientation,
        capsuleSize: capsulePrefs.size,
        cloudApiUrl: getSavedCloudApiUrl() || undefined,
      }),
    };

    const localFields = serializeRhythmFields(sanitizeRhythmPayload(payload as SyncedRhythmPayload));
    const serverFields = lastServerFieldsRef.current;
    const changedKeys: Array<keyof SyncedRhythmPayload> = [];
    for (const group of RHYTHM_FIELD_GROUPS) {
      if (group.some((key) => localFields[key] !== serverFields[key])) {
        changedKeys.push(...group);
      }
    }
    if (changedKeys.length === 0) return;

    // Immediately push to Google Tasks Cloud Vault for sub-second cross-device sync
    void pushToTasksVaultImmediately(payload);
    setFirestoreSynced(true);
  }, [
    activeTimeZone,
    firebaseUser?.uid,
    firestoreReady,
    hydrationHistory,
    streaks,
    quietMode,
    adhanOverrideSilent,
    surfaceTheme,
    deviceSettings,
    lifeProfile,
    medications,
    creativeActivities,
    memories,
    phoneChargeLimitPct,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    waterRemindersEnabled,
    sunMode,
    selectedLogoId,
    capsulePrefs.orientation,
    capsulePrefs.size,
    cloudPausedUntil,
    pushToTasksVaultImmediately,
  ]);

  const syncUiPrefsCloud = useCallback(
    (nextLogoId: string, nextCapsule: CapsulePrefs, cloudApiUrlOverride?: string) => {
      const effectiveUrl =
        cloudApiUrlOverride !== undefined ? cloudApiUrlOverride : getSavedCloudApiUrl();
      const clean: UiPrefs = sanitizeUiPrefs({
        selectedLogoId: nextLogoId,
        capsuleOrientation: nextCapsule.orientation,
        capsuleSize: nextCapsule.size,
        cloudApiUrl: effectiveUrl || undefined,
      }) ?? {
        selectedLogoId: DEFAULT_LOGO_ID,
        capsuleOrientation: 'horizontal',
        capsuleSize: 'md',
      };
      void pushToTasksVaultImmediately({ uiPrefs: clean });
    },
    [pushToTasksVaultImmediately]
  );

  const handleSaveCloudApiUrl = useCallback(
    (url: string) => {
      syncUiPrefsCloud(selectedLogoId, capsulePrefs, url);
    },
    [capsulePrefs, selectedLogoId, syncUiPrefsCloud]
  );

  // One-time migration from legacy Cairo default (30.0444, 31.2357) to user's home (الضهرية · شربين · الدقهلية)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const migrationKey = 'dayrhythm_home_dahriya_migrated_v1';
    try {
      if (window.localStorage.getItem(migrationKey) === '1') return;
    } catch {
      return;
    }
    const isLegacyCairoDefault =
      Math.abs((lifeProfile.currentLat ?? 0) - 30.0444) < 0.005 &&
      Math.abs((lifeProfile.currentLng ?? 0) - 31.2357) < 0.005;
    if (isLegacyCairoDefault) {
      updateLifeProfileLocal((prev) => ({
        ...prev,
        currentCityName: HOME_LOCATION.nameAr,
        currentLat: HOME_LOCATION.lat,
        currentLng: HOME_LOCATION.lng,
        currentTimeZone: HOME_LOCATION.timeZone || 'Africa/Cairo',
      }));
    }
    try {
      window.localStorage.setItem(migrationKey, '1');
    } catch {
      // ignore storage errors
    }
  }, [lifeProfile.currentLat, lifeProfile.currentLng]);

  const handleUpdateCapsulePrefs = useCallback(
    (next: CapsulePrefs) => {
      setCapsulePrefs(next);
      try {
        window.localStorage.setItem(CAPSULE_PREFS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      syncUiPrefsCloud(selectedLogoId, next);
    },
    [selectedLogoId, syncUiPrefsCloud]
  );

  // Right-click menu on the Windows desktop capsule (DesktopCapsuleForm.cs).
  useEffect(() => {
    const onCapsulePrefs = (ev: Event) => {
      const d = (ev as CustomEvent<{ orientation?: string; size?: string }>).detail || {};
      handleUpdateCapsulePrefs({
        orientation: d.orientation === 'vertical' ? 'vertical' : 'horizontal',
        size: d.size === 'sm' || d.size === 'lg' ? d.size : 'md',
      });
    };
    window.addEventListener('dayrhythm:capsule-prefs', onCapsulePrefs);
    return () => window.removeEventListener('dayrhythm:capsule-prefs', onCapsulePrefs);
  }, [handleUpdateCapsulePrefs]);

  const handleSelectBrandLogo = useCallback(
    (id: string) => {
      setSelectedLogoId(id);
      try {
        window.localStorage.setItem(SELECTED_LOGO_STORAGE_KEY, id);
      } catch {
        // ignore storage errors
      }
      syncUiPrefsCloud(id, capsulePrefs);
      const picked = getLogoConceptById(id);
      if (picked) {
        showToast(`تم تفعيل ومزامنة شعار «${picked.titleAr}» على أجهزتك ✓`);
      }
    },
    [capsulePrefs, showToast, syncUiPrefsCloud]
  );

  const handleResetBrandLogo = useCallback(() => {
    setSelectedLogoId(DEFAULT_LOGO_ID);
    try {
      window.localStorage.setItem(SELECTED_LOGO_STORAGE_KEY, DEFAULT_LOGO_ID);
    } catch {
      // ignore storage errors
    }
    syncUiPrefsCloud(DEFAULT_LOGO_ID, capsulePrefs);
    showToast('تمت العودة للشعار الافتراضي (أفق الشروق الزجاجي) ومزامنته ✓');
  }, [capsulePrefs, showToast, syncUiPrefsCloud]);

  const handleUpdateDeviceSettings = useCallback(
    (patch: Partial<OnePlusDeviceSettings>) => {
      localWriteLockUntilRef.current = Date.now() + 5000;
      setDeviceSettings((prev) => {
        const next = sanitizeDeviceSettings({ ...prev, ...patch });
        void pushToTasksVaultImmediately({ deviceSettings: next });
        return next;
      });
    },
    [pushToTasksVaultImmediately]
  );

  const handleUpdateLifeProfile = useCallback(
    (patch: Partial<LifeProfile>) => {
      let nextProfile: LifeProfile | null = null;
      updateLifeProfileLocal((prev) => {
        nextProfile = sanitizeLifeProfile({ ...prev, ...patch });
        try {
          const currentRaw = localStorage.getItem(STORAGE_KEY);
          const current = currentRaw ? JSON.parse(currentRaw) : {};
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...current, lifeProfile: nextProfile })
          );
        } catch {
          // ignore storage quota
        }
        return nextProfile;
      });
      showToast('تم حفظ وتحديث «الدستور الشخصي» ومزامنته سحابياً ✓');
      if (nextProfile) {
        void pushFullCloudBackupImmediately(undefined, { lifeProfile: nextProfile });
        void pushToTasksVaultImmediately({ lifeProfile: nextProfile });
      } else {
        void pushFullCloudBackupImmediately();
        void pushToTasksVaultImmediately();
      }
    },
    [updateLifeProfileLocal, showToast, pushFullCloudBackupImmediately, pushToTasksVaultImmediately]
  );

  const handleQuickUpdateWeight = useCallback(
    (nextWeightKg: number) => {
      const clamped = Math.max(35, Math.min(220, Math.round(nextWeightKg * 2) / 2));
      let nextProfile: LifeProfile | null = null;
      updateLifeProfileLocal((prev) => {
        nextProfile = sanitizeLifeProfile({ ...prev, weightKg: clamped });
        try {
          const currentRaw = localStorage.getItem(STORAGE_KEY);
          const current = currentRaw ? JSON.parse(currentRaw) : {};
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...current, lifeProfile: nextProfile })
          );
        } catch {
          // ignore storage quota
        }
        return nextProfile;
      });
      showToast(`⚖️ تم تحديث الوزن إلى ${clamped} كجم وإعادة حساب الماء تلقائياً`);
      if (nextProfile) {
        void pushFullCloudBackupImmediately(undefined, { lifeProfile: nextProfile });
        void pushToTasksVaultImmediately({ lifeProfile: nextProfile });
      }
    },
    [updateLifeProfileLocal, showToast, pushFullCloudBackupImmediately, pushToTasksVaultImmediately]
  );

  const handleToggleLowEnergyToday = useCallback(() => {
    const todayIso = getDateIsoInTimeZone(activeTimeZone);
    const nextActive = lifeProfile.lowEnergyDateKey !== todayIso;
    updateLifeProfileLocal((prev) =>
      sanitizeLifeProfile({
        ...prev,
        lowEnergyDateKey: nextActive ? todayIso : '',
      })
    );
    showToast(
      nextActive
        ? '🌿 تم تفعيل وضع اليوم الهادئ — الصلاة والنوم محميان ويمكنك تنسيق أي تأجيل مع Gemini'
        : '✓ تم إنهاء وضع اليوم الهادئ وعاد الإيقاع العادي'
    );
  }, [activeTimeZone, lifeProfile.lowEnergyDateKey, showToast]);

  const handleUpdateSoundRepeat = useCallback(
    (category: TaskSoundCategory, setting: SoundRepeatSetting) => {
      updateLifeProfileLocal((prev) => {
        const nextRepeats = sanitizeSoundRepeats({
          ...(prev.soundRepeats ?? DEFAULT_SOUND_REPEATS),
          [category]: setting,
        });
        return sanitizeLifeProfile({
          ...prev,
          soundRepeats: nextRepeats,
        });
      });
      const label = TASK_SOUND_META[category].labelAr;
      showToast(
        setting === 'continuous'
          ? `🔊 «${label}»: رنين مستمر حتى الإيقاف ✓`
          : `🔊 «${label}»: تكرار الرنين ${setting}× ✓`
      );
    },
    [showToast]
  );

  const handleLogSleepQuality = useCallback(
    (mode: 'good' | 'short_30' | 'short_60' | 'reset') => {
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      if (mode === 'reset') {
        updateLifeProfileLocal((prev) =>
          sanitizeLifeProfile({
            ...prev,
            sleepDebtMinutes: 0,
            sleepDebtLogDateKey: todayIso,
          })
        );
        triggerHapticWaveform('water_cup');
        showToast('😴 تم تصفير رصيد النوم — نومك متوازن الآن ✓');
        return;
      }
      if (mode === 'good') {
        const currentDebt = lifeProfile.sleepDebtMinutes;
        const paidBack =
          currentDebt > 0
            ? Math.min(currentDebt, Math.max(dailyRhythmPlan.nightlyRecoveryMin, 30))
            : 0;
        const nextDebt = Math.max(0, currentDebt - paidBack);
        updateLifeProfileLocal((prev) =>
          sanitizeLifeProfile({
            ...prev,
            sleepDebtMinutes: nextDebt,
            sleepDebtLogDateKey: todayIso,
          })
        );
        triggerHapticWaveform('water_cup');
        showToast(
          paidBack > 0
            ? nextDebt === 0
              ? '✨ ممتاز! تم تعويض رصيد النوم بالكامل وعاد نومك لوضعه الطبيعي ✓'
              : `✨ ممتاز! تم تعويض ${paidBack} د من رصيد النوم — المتبقي ${nextDebt} د`
            : '✨ ممتاز! نومك متوازن اليوم (صفر عجز) ✓'
        );
        return;
      }
      const addMin = mode === 'short_60' ? 60 : 30;
      const nextDebt = Math.min(480, lifeProfile.sleepDebtMinutes + addMin);
      updateLifeProfileLocal((prev) =>
        sanitizeLifeProfile({
          ...prev,
          sleepDebtMinutes: nextDebt,
          sleepDebtLogDateKey: todayIso,
        })
      );
      triggerHapticWaveform('water_cup');
      showToast(
        `🌙 سُجّل نقص ${addMin} د (الإجمالي ${nextDebt} د) — سيُبكّر موعد نوم الليلة تلقائياً للتعويض بهدوء`
      );
    },
    [activeTimeZone, dailyRhythmPlan.nightlyRecoveryMin, lifeProfile.sleepDebtMinutes, showToast]
  );

  const handleOpenAssistantWithPrompt = useCallback(
    (prompt: string) => {
      setPendingAssistantPrompt(prompt);
      handleSelectTab('assistant');
    },
    [handleSelectTab]
  );

  const handleAddMemory = useCallback(
    (input: { category: MemoryCategory; ruleText: string; source?: MemoryItem['source'] }) => {
      const trimmed = input.ruleText.trim();
      if (!trimmed) return;
      const item = sanitizeMemoryItem({
        id: sanitizeMemoryId(`mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
        category: input.category,
        ruleText: trimmed,
        source: input.source ?? 'user',
      });
      setMemories((prev) => {
        const next = [item, ...prev];
        void pushToTasksVaultImmediately({ memories: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      showToast('🧠 تم حفظ القاعدة في ذاكرة Gemini الدائمة (Google Cloud) ✓');
    },
    [pushToTasksVaultImmediately, pushFullCloudBackupImmediately, showToast]
  );

  const handleDeleteMemory = useCallback(
    (id: string) => {
      setMemories((prev) => {
        const next = prev.filter((m) => m.id !== id);
        void pushToTasksVaultImmediately({ memories: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      showToast('تم حذف القاعدة من ذاكرة Gemini الدائمة');
    },
    [pushToTasksVaultImmediately, pushFullCloudBackupImmediately, showToast]
  );

  const handleUpdateMemory = useCallback(
    (id: string, patch: { category: MemoryCategory; ruleText: string }) => {
      const trimmed = patch.ruleText.trim();
      if (!trimmed) return;
      const existing = memories.find((m) => m.id === id);
      if (!existing) return;
      const updatedItem = sanitizeMemoryItem({
        ...existing,
        category: patch.category,
        ruleText: trimmed,
      });
      setMemories((prev) => {
        const next = prev.map((m) => (m.id === id ? updatedItem : m));
        void pushToTasksVaultImmediately({ memories: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      showToast('✏️ تم حفظ تعديل القاعدة في ذاكرة Gemini الدائمة ✓');
    },
    [memories, pushToTasksVaultImmediately, pushFullCloudBackupImmediately, showToast]
  );

  const handleResetChatMode = useCallback(
    (targetMode: 'chat' | 'maps' | 'search') => {
      setChatMessages((prev) => {
        const preserved = prev.filter((m) => m.mode !== targetMode);
        if (targetMode === 'chat') {
          return [WELCOME_MESSAGE, ...preserved];
        }
        return preserved.some((m) => m.mode === 'chat')
          ? preserved
          : [WELCOME_MESSAGE, ...preserved];
      });
    },
    []
  );

  const handleExecuteMemoryActions = useCallback(
    (memoryActions: MemoryActionProposal[]) => {
      setMemories((prev) => {
        let next = [...prev];
        for (const act of memoryActions) {
          if (act.operation === 'remove') {
            const target = next.find(
              (m) =>
                (act.memoryId && m.id === act.memoryId) ||
                m.ruleText.trim() === act.ruleText.trim()
            );
            if (target) {
              next = next.filter((m) => m.id !== target.id);
            }
          } else if (act.operation === 'update' && act.memoryId) {
            const targetIdx = next.findIndex((m) => m.id === act.memoryId);
            if (targetIdx >= 0) {
              const updated = sanitizeMemoryItem({
                ...next[targetIdx],
                category: act.category,
                ruleText: act.ruleText,
              });
              next[targetIdx] = updated;
            }
          } else {
            const existing = next.find((m) => m.ruleText.trim() === act.ruleText.trim());
            if (!existing) {
              const created = sanitizeMemoryItem({
                id: sanitizeMemoryId(
                  act.memoryId || `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
                ),
                category: act.category,
                ruleText: act.ruleText,
                source: 'gemini',
              });
              next = [created, ...next];
            }
          }
        }
        void pushToTasksVaultImmediately({ memories: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleDetectGpsLocation = useCallback(async () => {
    const browserTz =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo';
    const isMobileClient = detectIsMobileDeviceClient();

    const tryIpGeolocationFallback = async (): Promise<boolean> => {
      try {
        const res = await fetch('https://get.geojs.io/v1/ip/geo.json', {
          signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined,
        });
        if (!res.ok) return false;
        const geo = (await res.json()) as {
          latitude?: string | number;
          longitude?: string | number;
          city?: string;
          timezone?: string;
        };
        const lat = Number(geo.latitude);
        const lng = Number(geo.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        const roundedLat = Math.round(lat * 10000) / 10000;
        const roundedLng = Math.round(lng * 10000) / 10000;
        const tz = geo.timezone || browserTz;
        const offlineCity = resolveOfflineCityName(roundedLat, roundedLng, tz);
        const displayCity = geo.city ? `${geo.city}` : offlineCity;
        lastCoordsRef.current = { lat: roundedLat, lng: roundedLng };
        updateLifeProfileLocal((prev) =>
          sanitizeLifeProfile({
            ...prev,
            currentCityName: displayCity,
            currentTimeZone: tz,
            currentLat: roundedLat,
            currentLng: roundedLng,
          })
        );
        setLocationResolutionState('gps_locked');
        showToast(`🌐 تم تحديد موقعك التقريبي (${displayCity}) — وموقع GPS الموبايل يتزامن تلقائياً`);
        void reverseGeocodeCityName(roundedLat, roundedLng, displayCity).then((refined) => {
          if (refined && refined !== displayCity) {
            updateLifeProfileLocal((prev) => sanitizeLifeProfile({ ...prev, currentCityName: refined }));
          }
        });
        return true;
      } catch {
        return false;
      }
    };

    if (!navigator.geolocation) {
      setIsDetectingGps(true);
      const ok = !isMobileClient ? await tryIpGeolocationFallback() : false;
      setIsDetectingGps(false);
      if (!ok) {
        showToast('📱 افتح التطبيق على الموبايل لتحديث GPS وسيتزامن الموقع تلقائياً للكمبيوتر');
      }
      return;
    }

    setIsDetectingGps(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: isMobileClient ? 12000 : 6000,
          maximumAge: 0,
          enableHighAccuracy: isMobileClient,
        });
      });
      const lat = Math.round(pos.coords.latitude * 10000) / 10000;
      const lng = Math.round(pos.coords.longitude * 10000) / 10000;

      const offlineCityName = resolveOfflineCityName(lat, lng, browserTz);
      lastCoordsRef.current = { lat, lng };
      updateLifeProfileLocal((prev) =>
        sanitizeLifeProfile({
          ...prev,
          currentCityName: offlineCityName,
          currentTimeZone: browserTz,
          currentLat: lat,
          currentLng: lng,
        })
      );
      setLocationResolutionState('gps_locked');
      showToast(
        isMobileClient
          ? `📍 تم تحديد موقعك بالـ GPS (${offlineCityName}) ومزامنته تلقائياً للكمبيوتر ✓`
          : `📍 تم تحديد موقعك بالـ GPS وحساب المواقيت بدقة: ${offlineCityName}`
      );

      // Refine exact Arabic town/district name in background when online (non-blocking)
      void reverseGeocodeCityName(lat, lng, offlineCityName).then((refinedName) => {
        if (refinedName && refinedName !== offlineCityName) {
          updateLifeProfileLocal((prev) =>
            sanitizeLifeProfile({
              ...prev,
              currentCityName: refinedName,
            })
          );
        }
      });
    } catch (err: unknown) {
      if (!isMobileClient) {
        const ipOk = await tryIpGeolocationFallback();
        if (ipOk) return;
        showToast('📱 الكمبيوتر لا يملك GPS مباشر — سيتبع تلقائياً آخر موقع GPS من موبايلك');
        return;
      }
      const geoErr = err as { code?: number } | null;
      if (geoErr?.code === 1) {
        showToast('⚠️ يرجى السماح بصلاحية الموقع (GPS) من إعدادات التطبيق على الموبايل لتحديد مدينتك الفعلية.');
      } else {
        showToast('تعذر التقاط إشارة GPS حالياً — تأكد من تفعيل الموقع (Location) على الموبايل.');
      }
    } finally {
      setIsDetectingGps(false);
    }
  }, [showToast]);

  // Continuous live GPS tracking (> 5 km movement automatically updates Prayer, Sunrise, Sunset & Sleep 100% offline)
  const lastCoordsRef = useRef<{ lat: number; lng: number }>({
    lat: lifeProfile.currentLat,
    lng: lifeProfile.currentLng,
  });
  useEffect(() => {
    lastCoordsRef.current = {
      lat: lifeProfile.currentLat,
      lng: lifeProfile.currentLng,
    };
  }, [lifeProfile.currentLat, lifeProfile.currentLng]);

  useEffect(() => {
    if (!lifeProfile.autoLocationSync) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    let watchId: number | null = null;
    const startWatch = () => {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = Math.round(pos.coords.latitude * 10000) / 10000;
          const lng = Math.round(pos.coords.longitude * 10000) / 10000;
          const prevCoords = lastCoordsRef.current;
          const movedKm = haversineDistanceKm(
            { id: 'prev', nameAr: '', nameEn: '', lat: prevCoords.lat, lng: prevCoords.lng, tzOffsetHours: 2 },
            { id: 'curr', nameAr: '', nameEn: '', lat, lng, tzOffsetHours: 2 }
          );
          if (movedKm < 5) return;

          const browserTz =
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo';
          const cityName = resolveOfflineCityName(lat, lng, browserTz);

          lastCoordsRef.current = { lat, lng };
          updateLifeProfileLocal((prev) =>
            sanitizeLifeProfile({
              ...prev,
              currentCityName: cityName,
              currentTimeZone: browserTz,
              currentLat: lat,
              currentLng: lng,
            })
          );
          showToast(`📍 تم رصد انتقالك تلقائياً (${Math.round(movedKm)} كم) وتحديث المواقيت أوفلاين: ${cityName}`);
          void reverseGeocodeCityName(lat, lng, cityName).then((refined) => {
            if (refined && refined !== cityName) {
              updateLifeProfileLocal((prev) => sanitizeLifeProfile({ ...prev, currentCityName: refined }));
            }
          });
        },
        () => {
          // Silently ignore background watch errors; user can tap location name anytime
        },
        { enableHighAccuracy: false, maximumAge: 180_000, timeout: 12_000 }
      );
    };

    // Only start passive watch if permission is already granted so we don't spam prompts on first load
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((perm) => {
          if (perm.state === 'granted') {
            startWatch();
          }
        })
        .catch(() => {});
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [lifeProfile.autoLocationSync, showToast]);

  // Auto-adapt to a new country/timezone automatically when traveling abroad (Mobile is GPS authority; PC inherits from Phone)
  const autoSyncedTzRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lifeProfile.autoLocationSync) return;
    if (!detectIsMobileDeviceClient()) return;
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserTz || browserTz === lifeProfile.currentTimeZone) return;
    if (autoSyncedTzRef.current === browserTz) return;
    autoSyncedTzRef.current = browserTz;

    const tzPreset = PRESET_LOCATIONS.find((l) => l.timeZone === browserTz);
    if (tzPreset) {
      updateLifeProfileLocal((prev) =>
        sanitizeLifeProfile({
          ...prev,
          currentCityName: tzPreset.nameAr,
          currentTimeZone: browserTz,
          currentLat: tzPreset.lat,
          currentLng: tzPreset.lng,
        })
      );
      showToast(`🌍 تم اكتشاف منطقة زمنية جديدة (${tzPreset.nameAr}) وتحديث المواقيت والنوم تلقائياً`);
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((perm) => {
          if (perm.state === 'granted') {
            void handleDetectGpsLocation();
          } else {
            updateLifeProfileLocal((prev) =>
              sanitizeLifeProfile({
                ...prev,
                currentCityName: browserTz.split('/').pop()?.replace(/_/g, ' ') || prev.currentCityName,
                currentTimeZone: browserTz,
              })
            );
          }
        })
        .catch(() => {});
    }
  }, [lifeProfile.autoLocationSync, lifeProfile.currentTimeZone, handleDetectGpsLocation, showToast]);

  // Unified Phone-First GPS Resolution:
  // - On Mobile (OnePlus 12R): acquire hardware GPS and sync to Firestore so PC automatically follows!
  // - On Desktop (Windows EXE / Web PC): NEVER overwrite synced Phone GPS with Cairo/timezone fallback!
  // Prayer times are computed fully offline, so they must NOT wait for Google sign-in.
  // (Sign-out resets gpsFirstAttemptedRef; the needsAuth dependency then re-runs this effect.)
  const gpsFirstAttemptedRef = useRef<boolean>(false);
  useEffect(() => {
    if (gpsFirstAttemptedRef.current) return;
    gpsFirstAttemptedRef.current = true;

    const isMobileClient = detectIsMobileDeviceClient();
    if (!isMobileClient) {
      // Desktop inherits live Phone GPS via Firestore automatically without overwriting coordinates
      setLocationResolutionState('gps_locked');
      return;
    }

    setLocationResolutionState('resolving_gps');

    const applyTimezoneFallback = () => {
      setLocationResolutionState('timezone_fallback');
    };

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      applyTimezoneFallback();
      return;
    }

    let settled = false;
    const hardTimeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        applyTimezoneFallback();
      }
    }, 7500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(hardTimeoutId);
        const lat = Math.round(pos.coords.latitude * 10000) / 10000;
        const lng = Math.round(pos.coords.longitude * 10000) / 10000;
        const browserTz =
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          lifeProfile.currentTimeZone ||
          'Africa/Cairo';
        const offlineCityName = resolveOfflineCityName(lat, lng, browserTz);

        lastCoordsRef.current = { lat, lng };
        updateLifeProfileLocal((prev) =>
          sanitizeLifeProfile({
            ...prev,
            currentCityName: offlineCityName,
            currentTimeZone: browserTz,
            currentLat: lat,
            currentLng: lng,
          })
        );
        setLocationResolutionState('gps_locked');

        void reverseGeocodeCityName(lat, lng, offlineCityName).then((refined) => {
          if (refined && refined !== offlineCityName) {
            updateLifeProfileLocal((prev) => sanitizeLifeProfile({ ...prev, currentCityName: refined }));
          }
        });
      },
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(hardTimeoutId);
        applyTimezoneFallback();
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 7000 }
    );

    return () => {
      window.clearTimeout(hardTimeoutId);
    };
  }, [needsAuth, lifeProfile.currentTimeZone]);

  const prayersReady =
    locationResolutionState === 'gps_locked' || locationResolutionState === 'timezone_fallback';

  // Receive real-time update status callbacks from native Windows EXE & Android APK shells
  useEffect(() => {
    const onUpdateStatus = (evt: Event) => {
      const detail = (evt as CustomEvent<{ state?: string; message?: string }>).detail;
      if (!detail) return;
      if (detail.state === 'checking' || detail.state === 'downloading') {
        setIsCheckingUpdates(true);
      } else {
        setIsCheckingUpdates(false);
      }
      if (detail.message) {
        showToast(detail.message);
      }
    };
    window.addEventListener('dayrhythm:update-status', onUpdateStatus);
    return () => window.removeEventListener('dayrhythm:update-status', onUpdateStatus);
  }, [showToast]);

  const handleCheckAppUpdates = useCallback(() => {
    setIsCheckingUpdates(true);
    const stopSpinnerLater = () => {
      window.setTimeout(() => setIsCheckingUpdates(false), 8000);
    };
    const androidBridge = (
      window as Window & {
        DayRhythmNative?: { checkForUpdates?: () => void };
      }
    ).DayRhythmNative;
    if (androidBridge?.checkForUpdates) {
      androidBridge.checkForUpdates();
      showToast('جاري فحص التحديثات من GitHub...');
      stopSpinnerLater();
      return;
    }
    const wv = (
      window as Window & {
        chrome?: { webview?: { postMessage?: (msg: string) => void } };
      }
    ).chrome?.webview;
    if (wv?.postMessage) {
      wv.postMessage('check-updates');
      showToast('جاري فحص التحديثات من GitHub...');
      stopSpinnerLater();
      return;
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          if (reg) {
            return reg.update().then(() => {
              showToast('تم فحص التحديثات — أنت على أحدث إصدار متاح');
            });
          }
          showToast('أنت تستخدم أحدث إصدار حالياً');
        })
        .catch(() => {
          showToast('أنت تستخدم أحدث إصدار حالياً');
        })
        .finally(() => setIsCheckingUpdates(false));
      return;
    }
    setIsCheckingUpdates(false);
    showToast('أنت تستخدم أحدث إصدار حالياً');
  }, [showToast]);

  const handleGoogleSignIn = useCallback(async () => {
    setIsLoggingIn(true);
    try {
      const result = await signInWithGoogleCalendar();
      if (result) {
        setAuthUser(result.user);
        setNeedsAuth(false);
        setUseOfflineDemo(false);
        await refreshWorkspace(result.accessToken, { forceGmail: true });
        showToast('تم ربط حساب Google Calendar و Tasks و Gmail والسحابة بنجاح ✓');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول بحساب Google.';
      showToast(msg);
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  }, [refreshWorkspace, showToast]);

  const handleGoogleSignOut = useCallback(async () => {
    await signOutGoogleCalendar();
    clearAllPersonalLocalStorage();
    hasHydratedRemoteRef.current = false;
    hasHydratedCloudChatRef.current = false;
    syncedChatTextByIdRef.current.clear();
    cloudChatIdsRef.current.clear();
    lastGmailAutoScanMsRef.current = 0;
    gpsFirstAttemptedRef.current = false;
    setLocationResolutionState('idle');

    setAuthUser(null);
    setNeedsAuth(true);
    setWorkspaceTokenExpired(false);
    clearGmailRetryTimers();
    gmailRetryAttemptRef.current = 0;
    setCalendarList([]);
    setCalendarEvents([]);
    setGoogleTaskLists([]);
    setGoogleTasks([]);
    setGmailDigest([]);
    setGmailScannedCount(0);
    setGmailLastSyncedIso('');
    setGmailError('');
    setGmailNeedsReauth(false);
    setMedications(DEFAULT_MEDICATIONS);
    setCreativeActivities(DEFAULT_CREATIVE_ACTIVITIES);
    setMemories(DEFAULT_MEMORIES);
    setLifeProfile(DEFAULT_LIFE_PROFILE);
    setDeviceSettings(DEFAULT_DEVICE_SETTINGS);
    setChatMessages([WELCOME_MESSAGE]);
    setSilentNotifications([]);
    setPeriodicRituals([]);
    setChangelog([]);
    setPhoneBattery(null);
    setPersistentAlert(null);
    setStreaks({
      dailyCommitmentDays: 0,
      dailyCommitmentDoneToday: false,
      waterTargetDays: 0,
      waterTargetDoneToday: false,
    });
    setHydrationHistory(buildInitialHydrationHistory(10, activeTimeZone));
    setReflowedBlocksOverride(null);
    showToast('تم تسجيل الخروج وتنظيف جميع البيانات الشخصية من هذا الجهاز ✓');
  }, [activeTimeZone, showToast, clearGmailRetryTimers]);

  const rebuildOfflineSchedule = useCallback(
    (
      nextMode: DayMode,
      nextTravel: TravelState,
      friday: boolean,
      biweeklyPc: boolean
    ) => {
      const loc = nextTravel.active ? nextTravel.location : HOME_LOCATION;
      const nextPrayers = calculateEgyptianPrayerTimes(
        loc,
        new Date(),
        lifeProfile.adhanLeadMinutes
      );
      const base = buildBaseSchedule(nextMode, nextPrayers, {
        isFriday: friday,
        includeBiweeklyPcCleanup: biweeklyPc,
      });
      setOfflineBlocks(nextTravel.active ? applyTravelMatrix(base, nextTravel) : base);
    },
    [lifeProfile.adhanLeadMinutes]
  );

  // Build LIVE ScheduleBlocks from Real Google Calendar + optional Astronomical Prayer Anchors!

  const baseLiveBlocks: ScheduleBlock[] = useMemo(() => {
    if (reflowedBlocksOverride) {
      return reflowedBlocksOverride.map((b) => ({
        ...b,
        completed: completedOverrides[b.id] ?? b.completed,
      }));
    }

    // Compute real Google Calendar blocks for today first so we avoid duplicating prayers already in Calendar
    let todaysGoogleBlocks: ScheduleBlock[] = [];
    if (!needsAuth) {
      todaysGoogleBlocks = calendarEvents
        .map((ev): ScheduleBlock | null => {
          const startInfo = parseIsoToTimeZoneInfo(ev.start, activeTimeZone);
          if (startInfo.dateIso !== todayCairoIso) return null;
          const endInfo = ev.end ? parseIsoToTimeZoneInfo(ev.end, activeTimeZone) : null;
          let durationMin = 30;
          if (!startInfo.isAllDay && endInfo && endInfo.dateIso === startInfo.dateIso) {
            durationMin = Math.max(15, endInfo.minutesSinceMidnight - startInfo.minutesSinceMidnight);
          } else if (!startInfo.isAllDay && ev.start && ev.end) {
            const diff = Math.round((new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60_000);
            if (diff > 0 && diff < 1440) durationMin = diff;
          }
          const blockId = `gcal_${ev.calendarId ?? 'primary'}_${ev.id}`;
          const emojiPair = extractEmojiPair(ev.summary, '📅');
          const combinedDescription = [
            cleanCalendarText(ev.description),
            ev.location ? `📍 ${ev.location}` : '',
          ]
            .filter(Boolean)
            .join('\n');
          return {
            id: blockId,
            emojiPair,
            categoryAr: ev.summary,
            categoryEn: ev.summary,
            startMin: startInfo.minutesSinceMidnight,
            durationMin,
            minDurationMin: Math.min(15, durationMin),
            isAnchor: emojiPair.includes('🕌'),
            travelGroup: emojiPair.includes('🕌') ? 'ANCHOR' : 'B_WORK',
            canShiftEvening: !emojiPair.includes('🕌'),
            completed: completedOverrides[blockId] ?? false,
            deleted: false,
            googleEventId: ev.id,
            googleCalendarId: ev.calendarId ?? 'primary',
            calendarTitle: ev.calendarTitle,
            calendarColor: ev.calendarColor,
            googleHtmlLink: ev.htmlLink,
            dateIso: startInfo.dateIso,
            startIso: ev.start,
            endIso: ev.end,
            isAllDay: startInfo.isAllDay || ev.isAllDay,
            description: combinedDescription,
            source: 'google_calendar',
          };
        })
        .filter((x): x is ScheduleBlock => x !== null);
    }

    // Prayer anchors computed astronomically — skip any prayer already represented in Google Calendar
    const prayerAnchors: ScheduleBlock[] = includePrayerAnchors
      ? prayers
          .filter((p) => p.isObligatory)
          .filter(
            (p) =>
              !todaysGoogleBlocks.some(
                (gb) =>
                  Math.abs(gb.startMin - p.alarmMinutes) <= 10 ||
                  Math.abs(gb.startMin - p.adhanMinutes) <= 10 ||
                  (gb.emojiPair.includes('🕌') && Math.abs(gb.startMin - p.alarmMinutes) <= 25)
              )
          )
          .map((p) => ({
            id: `prayer_${p.id}`,
            emojiPair: p.emojiPair,
            categoryAr: `أذان -${lifeProfile.adhanLeadMinutes} د · ${p.nameAr}`,
            categoryEn: `-${lifeProfile.adhanLeadMinutes}m Adhan · ${p.nameEn}`,
            startMin: p.alarmMinutes,
            durationMin: 20,
            minDurationMin: 20,
            isAnchor: true,
            isFridayRitual: isFridayMode && p.id === 'dhuhr',
            travelGroup: 'ANCHOR' as const,
            canShiftEvening: false,
            completed: completedOverrides[`prayer_${p.id}`] ?? false,
            deleted: false,
            dateIso: todayCairoIso,
            source: 'prayer' as const,
          }))
      : [];

    if (!needsAuth) {
      return [...todaysGoogleBlocks, ...prayerAnchors].sort((a, b) => a.startMin - b.startMin);
    }

    // Disconnected / Anonymous mode: keep schedule 100% empty until signed in (unless explicit Offline Demo)
    if (useOfflineDemo) {
      return offlineBlocks.map((b) => ({
        ...b,
        completed: completedOverrides[b.id] ?? b.completed,
        source: b.source ?? 'offline',
      }));
    }

    return [];
  }, [
    reflowedBlocksOverride,
    includePrayerAnchors,
    prayers,
    isFridayMode,
    todayCairoIso,
    needsAuth,
    calendarEvents,
    completedOverrides,
    useOfflineDemo,
    offlineBlocks,
    lifeProfile.adhanLeadMinutes,
    activeTimeZone,
  ]);

  // Genuinely free time slots today (away from Prayers, Sleep, Work & existing Google Calendar events)
  const freeSlotsToday: FreeTimeSlot[] = useMemo(
    () => findFreeTimeSlotsForToday(prayers, dailyRhythmPlan, lifeProfile, baseLiveBlocks),
    [prayers, dailyRhythmPlan, lifeProfile, baseLiveBlocks]
  );

  // Auto-place Creative Activities ONLY into genuinely free slots today
  const creativePlacements: CreativeActivityPlacement[] = useMemo(
    () => computeCreativePlacements(creativeActivities, freeSlotsToday, todayCairoIso, nowTickMin),
    [creativeActivities, freeSlotsToday, todayCairoIso, nowTickMin]
  );

  // Merge free-slot Creative Activities gently into the daily timeline (skip duplicates already in Calendar)
  const liveBlocks: ScheduleBlock[] = useMemo(() => {
    const creativeBlocks: ScheduleBlock[] = creativePlacements
      .filter((p) => !p.doneToday && p.suggestedSlot)
      .filter(
        (p) =>
          !baseLiveBlocks.some(
            (b) =>
              !b.deleted &&
              (b.googleEventId === p.activity.calendarEventId ||
                b.categoryAr.includes(p.activity.name))
          )
      )
      .map((p) => ({
        id: `creative_${p.activity.id}`,
        emojiPair: p.activity.emoji || '🎨',
        categoryAr: `${p.activity.emoji || '🎨'} ${p.activity.name} (${p.sessionsInPeriod}/${p.goalInPeriod} ${p.periodLabelAr})`,
        categoryEn: `${p.activity.emoji || '🎨'} ${p.activity.name}`,
        startMin: p.suggestedSlot!.startMin,
        durationMin: p.activity.sessionMinutes,
        minDurationMin: 15,
        isAnchor: false,
        travelGroup: 'B_WORK' as const,
        canShiftEvening: true,
        completed: false,
        deleted: false,
        dateIso: todayCairoIso,
        source: 'creative' as const,
        creativeActivityId: p.activity.id,
      }));

    return [...baseLiveBlocks, ...creativeBlocks].sort((a, b) => a.startMin - b.startMin);
  }, [baseLiveBlocks, creativePlacements, todayCairoIso]);


  useEffect(() => {
    const id = window.setInterval(() => {
      setLiveCountdownSec((s) => (s <= 1 ? 59 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (shakeUndoSecondsLeft <= 0) return;
    const id = window.setTimeout(() => {
      setShakeUndoSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [shakeUndoSecondsLeft]);

  const handleTriggerShakeUndo = useCallback(() => {
    if (!lastDeletedBlock || shakeUndoSecondsLeft <= 0) return;
    const targetId = lastDeletedBlock.id;
    setOfflineBlocks((prev) =>
      prev.map((b) => (b.id === targetId ? { ...b, deleted: false } : b))
    );
    setLastDeletedBlock(null);
    setShakeUndoSecondsLeft(0);
    triggerHapticWaveform('shake_undo');
    showToast(`تم التراجع واسترجاع الحدث بنجاح (${lastDeletedBlock.emojiPair})`);
  }, [lastDeletedBlock, shakeUndoSecondsLeft, showToast]);

  useEffect(() => {
    if (shakeUndoSecondsLeft <= 0 || typeof window === 'undefined') return;
    const onMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const gx = (acc.x ?? 0) / 9.81;
      const gy = (acc.y ?? 0) / 9.81;
      const gz = (acc.z ?? 0) / 9.81;
      const gForce = Math.sqrt(gx * gx + gy * gy + gz * gz);
      if (gForce > 2.6) {
        handleTriggerShakeUndo();
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [shakeUndoSecondsLeft, handleTriggerShakeUndo]);

  useEffect(() => {
    if (!pomodoro.isRunning) return;
    const id = window.setInterval(() => {
      setPomodoro((prev) => {
        if (!prev.isRunning) return prev;
        if (prev.remainingSeconds > 1) {
          return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
        }
        if (prev.phase === 'focus') {
          if (quietMode === 'normal') {
            playSoftChime('focus_done', activeSanctuary);
          }
          triggerHapticWaveform('pomodoro');
          return {
            ...prev,
            phase: 'break',
            remainingSeconds: 5 * 60,
            totalSeconds: 5 * 60,
            isRunning: true,
            completedCycles: prev.completedCycles + 1,
          };
        }
        if (quietMode === 'normal') {
          playSoftChime('break_done', activeSanctuary);
        }
        triggerHapticWaveform('pomodoro');
        return {
          ...prev,
          phase: 'focus',
          remainingSeconds: prev.presetMinutes * 60,
          totalSeconds: prev.presetMinutes * 60,
          isRunning: false,
        };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [pomodoro.isRunning, quietMode, activeSanctuary]);

  const handleToggleFridayMode = (v: boolean) => {
    setIsFridayMode(v);
    setUndoSnapshot(null);
    setReflowedBlocksOverride(null);
    rebuildOfflineSchedule(effectiveDayMode, travelState, v, includeBiweeklyPcCleanup);
  };

  const handleToggleBiweeklyPcCleanup = (v: boolean) => {
    setIncludeBiweeklyPcCleanup(v);
    setUndoSnapshot(null);
    setReflowedBlocksOverride(null);
    rebuildOfflineSchedule(effectiveDayMode, travelState, isFridayMode, v);
  };

  const handleApplyTravel = (nextTravel: TravelState) => {
    setTravelState(nextTravel);
    setReflowedBlocksOverride(null);
    rebuildOfflineSchedule(effectiveDayMode, nextTravel, isFridayMode, includeBiweeklyPcCleanup);
    appendChangelog('Web/PC', `تفعيل وضع السفر (${nextTravel.location.nameAr})`, `Activated Travel Mode`);
    showToast('تم تفعيل وضع السفر وتحديث المواقيت.');
  };

  const handleDisableTravel = () => {
    const resetTravel: TravelState = {
      ...travelState,
      active: false,
      location: profileLocation,
      distanceKm: 0,
    };
    setTravelState(resetTravel);
    setReflowedBlocksOverride(null);
    rebuildOfflineSchedule(effectiveDayMode, resetTravel, isFridayMode, includeBiweeklyPcCleanup);
  };

  const handleApplyOfflineActions = useCallback(
    (actions: CalendarActionProposal[]) => {
      setOfflineBlocks((prev) => {
        let next = [...prev];
        actions.forEach((act) => {
          const parseMin = (hhmm?: string): number => {
            if (!hhmm || !hhmm.includes(':')) return 9 * 60;
            const [hStr, mStr] = hhmm.split(':');
            return (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
          };

          if (act.operation === 'delete') {
            next = next.map((b) =>
              b.id === act.eventId || b.emojiPair === act.title || b.categoryAr.includes(act.title)
                ? { ...b, deleted: true }
                : b
            );
          } else if (act.operation === 'update' || act.operation === 'shift') {
            const newStart = parseMin(act.startTime24);
            next = next.map((b) =>
              b.id === act.eventId || b.emojiPair === act.title || b.categoryAr.includes(act.title)
                ? {
                    ...b,
                    startMin: newStart,
                    durationMin: act.durationMinutes ?? b.durationMin,
                    reflowStatus: 'shifted_evening',
                  }
                : b
            );
          } else {
            const startMin = parseMin(act.startTime24);
            next.push({
              id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              emojiPair: extractEmojiPair(act.title, '📅 ✨'),
              categoryAr: act.title,
              startMin,
              durationMin: act.durationMinutes ?? 30,
              minDurationMin: 15,
              isAnchor: false,
              travelGroup: 'B_WORK',
              canShiftEvening: true,
              completed: false,
              deleted: false,
              source: 'offline',
            });
          }
        });
        return next.sort((a, b) => a.startMin - b.startMin);
      });
    },
    []
  );

  const executeCalendarActionsNow = useCallback(
    async (
      actions: CalendarActionProposal[],
      options?: { isUndoRestore?: boolean; alreadyResolved?: boolean }
    ): Promise<{ googleSynced: boolean; results: CalendarExecutionResult[] }> => {
      if (actions.length === 0) return { googleSynced: false, results: [] };
      // Undo-restores re-create events that are no longer in the list, so only validate normal runs.
      if (!options?.isUndoRestore && !options?.alreadyResolved) {
        actions = resolveCalendarActionTargets(actions, calendarEvents);
      }
      const token = getCalendarAccessToken();
      let results: CalendarExecutionResult[] = [];
      let googleSynced = false;

      // Capture reversible undo snapshot & apply optimistic removal for delete operations
      const deleteAct = actions.find((a) => a.operation === 'delete' && a.eventId);
      let undoSnap: DeletedWorkspaceSnapshot | undefined;
      if (deleteAct) {
        const existingEv = calendarEvents.find((e) => e.id === deleteAct.eventId);
        const startInfo = existingEv?.start
          ? parseIsoToTimeZoneInfo(existingEv.start, activeTimeZone)
          : null;
        let durationMinutes = 30;
        if (existingEv?.start && existingEv?.end && !existingEv.isAllDay) {
          const diff = Math.round(
            (new Date(existingEv.end).getTime() - new Date(existingEv.start).getTime()) / 60_000
          );
          if (diff >= 15 && diff <= 720) durationMinutes = diff;
        }
        const h24 = startInfo ? Math.floor(startInfo.minutesSinceMidnight / 60) : 9;
        const m24 = startInfo ? startInfo.minutesSinceMidnight % 60 : 0;
        undoSnap = {
          opId: `del_ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          kind: 'event',
          title: existingEv?.summary || deleteAct.title,
          calendarId: existingEv?.calendarId || deleteAct.calendarId || 'primary',
          dateIso: startInfo?.dateIso || getDateIsoInTimeZone(activeTimeZone),
          startTime24: `${String(h24).padStart(2, '0')}:${String(m24).padStart(2, '0')}`,
          durationMinutes,
          description: existingEv?.description || '',
          deletedAtMs: Date.now(),
        };
        const deleteIds = new Set(
          actions.filter((a) => a.operation === 'delete' && a.eventId).map((a) => a.eventId!)
        );
        if (deleteIds.size > 0) {
          setCalendarEvents((prev) => prev.filter((ev) => !deleteIds.has(ev.id)));
        }
      }

      if (token) {
        let serverHandled = false;
        try {
          const { ok, status, data } = await apiFetchJson<{
            results?: CalendarExecutionResult[];
            error?: string;
          }>('/api/calendar/execute', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              ...(firebaseUser?.uid ? { 'x-user-uid': firebaseUser.uid } : {}),
              'x-client-id': clientIdRef.current,
            },
            body: JSON.stringify({ actions, undoSnapshot: undoSnap }),
          });
          if (!ok) {
            if (status === 401) {
              handleWorkspaceUnauthorized();
              showToast('انتهت جلسة مزامنة Google — اضغط «تجديد ربط Google الآن» في الأعلى بضغطة واحدة');
            }
            await fetchCalendarEvents(token);
            throw new Error(data.error || 'تعذر تنفيذ التعديلات على Google Calendar.');
          }
          results = Array.isArray(data.results) ? data.results : [];
          serverHandled = true;
        } catch (proxyErr: unknown) {
          // If running standalone APK/EXE without backend proxy, execute directly via Google Calendar API v3
          const tzOffsetStr = formatUtcOffsetForIso(activeTimeZone);
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
              directResults.push({
                operation: 'delete',
                title: act.title,
                status: 'deleted',
                id: act.eventId,
              });
            } else if (act.operation === 'create' && act.dateIso && act.startTime24) {
              const startDt = `${act.dateIso}T${act.startTime24}:00${tzOffsetStr}`;
              const startMs = new Date(startDt).getTime();
              const endDt = new Date(startMs + (act.durationMinutes || 30) * 60_000).toISOString();
              const validByDays = Array.isArray(act.byDays)
                ? act.byDays.filter((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].includes(d))
                : [];
              const recurrence =
                act.recurrenceRule === 'DAILY'
                  ? ['RRULE:FREQ=DAILY']
                  : act.recurrenceRule === 'WEEKLY'
                    ? [
                        validByDays.length > 0
                          ? `RRULE:FREQ=WEEKLY;BYDAY=${validByDays.join(',')}`
                          : 'RRULE:FREQ=WEEKLY',
                      ]
                    : undefined;
              const r = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    summary: act.title,
                    description: act.description || '',
                    start: { dateTime: startDt, timeZone: activeTimeZone },
                    end: { dateTime: endDt, timeZone: activeTimeZone },
                    ...(recurrence ? { recurrence } : {}),
                  }),
                }
              );
              if (r.status === 401) {
                handleWorkspaceUnauthorized();
                showToast('انتهت صلاحية رمز Google Calendar — اضغط «تجديد ربط Google الآن» بضغطة واحدة');
                throw new Error(GOOGLE_SESSION_EXPIRED_AR);
              }
              if (!r.ok) throw new Error('تعذر إنشاء الحدث في Google Calendar.');
              const created = (await r.json()) as { id?: string; htmlLink?: string };
              directResults.push({
                operation: 'create',
                title: act.title,
                status: 'created',
                id: created.id,
                htmlLink: created.htmlLink,
              });
            } else if (act.operation === 'update' && act.eventId) {
              const body: Record<string, unknown> = { summary: act.title };
              if (act.description !== undefined) body.description = act.description;
              if (act.dateIso && act.startTime24) {
                const startDt = `${act.dateIso}T${act.startTime24}:00${tzOffsetStr}`;
                const startMs = new Date(startDt).getTime();
                const endDt = new Date(startMs + (act.durationMinutes || 30) * 60_000).toISOString();
                body.start = { dateTime: startDt, timeZone: activeTimeZone };
                body.end = { dateTime: endDt, timeZone: activeTimeZone };
              }
              const r = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(act.eventId)}`,
                {
                  method: 'PATCH',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
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
                operation: 'update',
                title: act.title,
                status: 'updated',
                id: updated.id || act.eventId,
                htmlLink: updated.htmlLink,
              });
            }
          }
          results = directResults;
          serverHandled = true;
        }
        if (serverHandled) {
          googleSynced = true;
          setReflowedBlocksOverride(null);
          await fetchCalendarEvents(token);
        }

        if (undoSnap) {
          setLastDeletedWorkspaceItem(undoSnap);
        }
        emitCrossDeviceSync(
          'calendar',
          options?.isUndoRestore ? 'undo_restore' : deleteAct ? 'delete' : 'update',
          undoSnap
        );

        appendChangelog(
          'Gemini API',
          `تحديث ${results.length} حدثاً في Google Calendar الحقيقي`,
          `Updated ${results.length} events in Google Calendar`
        );
        showToast(
          options?.isUndoRestore
            ? '↩️ تم استرجاع الحدث ومزامنته على جميع أجهزتك ✓'
            : deleteAct
              ? 'تم حذف الحدث ومزامنته فوراً — يمكنك التراجع الآن ✓'
              : `تمت المزامنة مع Google Calendar (${results.length} عمليات) ✓`
        );
      } else {
        handleApplyOfflineActions(actions);
        showToast('تم التطبيق في وضع المعاينة (سجّل الدخول بحساب Google للتنفيذ في تقويمك).');
      }

      return { googleSynced, results };
    },
    [
      activeTimeZone,
      appendChangelog,
      calendarEvents,
      emitCrossDeviceSync,
      fetchCalendarEvents,
      firebaseUser?.uid,
      handleApplyOfflineActions,
      handleWorkspaceUnauthorized,
      showToast,
    ]
  );

  const executeTaskActionsNow = useCallback(
    async (
      taskActions: TaskActionProposal[],
      options?: { isUndoRestore?: boolean; alreadyResolved?: boolean }
    ): Promise<{ googleSynced: boolean; results: TaskExecutionResult[] }> => {
      if (taskActions.length === 0) return { googleSynced: false, results: [] };
      if (!options?.isUndoRestore && !options?.alreadyResolved) {
        taskActions = resolveTaskActionTargets(taskActions, googleTasks);
      }
      const token = getCalendarAccessToken();
      if (!token) {
        throw new Error('يرجى تسجيل الدخول بحساب Google لتنفيذ تعديلات Google Tasks.');
      }

      // Capture reversible undo snapshot & apply optimistic removal for delete operations
      const deleteAct = taskActions.find((a) => a.operation === 'delete' && a.taskId);
      let undoSnap: DeletedWorkspaceSnapshot | undefined;
      if (deleteAct) {
        const existingTk = googleTasks.find((tk) => tk.id === deleteAct.taskId);
        undoSnap = {
          opId: `del_tk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          kind: 'task',
          title: existingTk?.title || deleteAct.title,
          taskListId: existingTk?.taskListId || deleteAct.taskListId || '@default',
          notes: existingTk?.notes || '',
          dueDateIso: existingTk?.due ? existingTk.due.slice(0, 10) : undefined,
          deletedAtMs: Date.now(),
        };
        const deleteIds = new Set(
          taskActions.filter((a) => a.operation === 'delete' && a.taskId).map((a) => a.taskId!)
        );
        if (deleteIds.size > 0) {
          setGoogleTasks((prev) => prev.filter((tk) => !deleteIds.has(tk.id)));
        }
      }

      let results: TaskExecutionResult[] = [];
      try {
        const { ok, status, data } = await apiFetchJson<{
          results?: TaskExecutionResult[];
          error?: string;
        }>('/api/tasks/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(firebaseUser?.uid ? { 'x-user-uid': firebaseUser.uid } : {}),
            'x-client-id': clientIdRef.current,
          },
          body: JSON.stringify({ taskActions, undoSnapshot: undoSnap }),
        });
        if (!ok) {
          if (status === 401) {
            handleWorkspaceUnauthorized();
            showToast('انتهت جلسة مزامنة Google Tasks — اضغط «تجديد ربط Google الآن» في الأعلى');
          }
          await fetchGoogleTasks(token);
          throw new Error(data.error || 'تعذر تنفيذ التعديلات على Google Tasks.');
        }
        results = Array.isArray(data.results) ? data.results : [];
      } catch (proxyErr: unknown) {
        // Standalone APK/EXE fallback: execute directly via Google Tasks API v1
        const directResults: TaskExecutionResult[] = [];
        for (const act of taskActions) {
          const listId = encodeURIComponent(act.taskListId || '@default');
          if (act.operation === 'create') {
            const body: Record<string, unknown> = { title: act.title };
            if (act.notes) body.notes = act.notes;
            if (act.dueDateIso) body.due = `${act.dueDateIso}T00:00:00.000Z`;
            const r = await fetch(
              `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`,
              {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              }
            );
            if (r.status === 401) {
              handleWorkspaceUnauthorized();
              showToast('انتهت صلاحية رمز Google Tasks — اضغط «تجديد ربط Google الآن» في الأعلى');
              throw new Error(GOOGLE_SESSION_EXPIRED_AR);
            }
            if (!r.ok) throw new Error('تعذر إنشاء المهمة في Google Tasks.');
            const created = (await r.json()) as { id?: string };
            directResults.push({
              operation: 'create',
              title: act.title,
              status: 'created',
              id: created.id,
              taskListId: act.taskListId || '@default',
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
              operation: 'delete',
              title: act.title,
              status: 'deleted',
              id: act.taskId,
              taskListId: act.taskListId || '@default',
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
              operation: act.operation,
              title: act.title,
              status: act.operation,
              id: act.taskId,
              taskListId: act.taskListId || '@default',
            });
          }
        }
        results = directResults;
      }
      await fetchGoogleTasks(token);

      if (undoSnap) {
        setLastDeletedWorkspaceItem(undoSnap);
      }
      emitCrossDeviceSync(
        'tasks',
        options?.isUndoRestore ? 'undo_restore' : deleteAct ? 'delete' : 'update',
        undoSnap
      );

      appendChangelog(
        'Gemini API',
        `تحديث ${results.length} مهمة في Google Tasks الحقيقي`,
        `Updated ${results.length} tasks in Google Tasks`
      );
      showToast(
        options?.isUndoRestore
          ? '↩️ تم استرجاع المهمة ومزامنتها على جميع أجهزتك ✓'
          : deleteAct
            ? 'تم حذف المهمة ومزامنتها فوراً — يمكنك التراجع الآن ✓'
            : `تم تحديث Google Tasks بنجاح (${results.length} عمليات) ✓`
      );
      return { googleSynced: true, results };
    },
    [
      appendChangelog,
      emitCrossDeviceSync,
      fetchGoogleTasks,
      firebaseUser?.uid,
      googleTasks,
      handleWorkspaceUnauthorized,
      showToast,
    ]
  );

  // ── Offline queue for Google Calendar / Tasks edits ──────────────────────────────────
  // With no internet, an edit is validated, shown right away, saved, and sent to Google
  // automatically when the connection returns (also after an app restart).
  const [queuedGoogleOpsCount, setQueuedGoogleOpsCount] = useState<number>(
    () => readGoogleOfflineQueue().length
  );

  const queueGoogleOp = useCallback(
    (kind: QueuedGoogleOp['kind'], actions: QueuedGoogleOp['actions']) => {
      const next = [
        ...readGoogleOfflineQueue(),
        { id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, kind, actions, createdAtMs: Date.now() },
      ];
      writeGoogleOfflineQueue(next);
      setQueuedGoogleOpsCount(next.length);
      showToast('📴 مفيش إنترنت — التعديل اتحفظ وهيتنفذ في Google لوحده أول ما النت يرجع');
    },
    [showToast]
  );

  const handleExecuteCalendarActions = useCallback(
    async (
      actions: CalendarActionProposal[],
      options?: { isUndoRestore?: boolean }
    ): Promise<{ googleSynced: boolean; results: CalendarExecutionResult[]; queued?: boolean }> => {
      if (actions.length === 0) return { googleSynced: false, results: [] };
      const queueNow = (resolved: CalendarActionProposal[]) => {
        queueGoogleOp('calendar', resolved);
        // Show the change immediately.
        const deleteIds = new Set(resolved.filter((a) => a.operation === 'delete').map((a) => a.eventId));
        setCalendarEvents((prev) => {
          const kept = prev.filter((e) => !deleteIds.has(e.id));
          const created = resolved
            .filter((a) => a.operation === 'create' && a.dateIso && a.startTime24)
            .map((a, i) => {
              const start = `${a.dateIso}T${a.startTime24}:00${formatUtcOffsetForIso(activeTimeZone)}`;
              const end = new Date(new Date(start).getTime() + (a.durationMinutes || 30) * 60_000).toISOString();
              return {
                id: `queued-${Date.now()}-${i}`,
                calendarId: a.calendarId || 'primary',
                summary: a.title,
                description: a.description || '',
                start,
                end,
                isAllDay: false,
              } as GoogleCalendarEventItem;
            });
          return [...kept, ...created].sort((x, y) => x.start.localeCompare(y.start));
        });
        return { googleSynced: false, results: [], queued: true };
      };
      const resolved = options?.isUndoRestore
        ? actions
        : resolveCalendarActionTargets(resolveRelativeCalendarStarts(actions, activeTimeZone), calendarEvents);
      if (navigator.onLine === false) return queueNow(resolved);
      try {
        return await executeCalendarActionsNow(resolved, { ...options, alreadyResolved: true });
      } catch (err: unknown) {
        if (isNetworkFailure(err)) return queueNow(resolved);
        throw err;
      }
    },
    [activeTimeZone, calendarEvents, executeCalendarActionsNow, queueGoogleOp]
  );

  const handleExecuteTaskActions = useCallback(
    async (
      taskActions: TaskActionProposal[],
      options?: { isUndoRestore?: boolean }
    ): Promise<{ googleSynced: boolean; results: TaskExecutionResult[]; queued?: boolean }> => {
      if (taskActions.length === 0) return { googleSynced: false, results: [] };
      const queueNow = (resolved: TaskActionProposal[]) => {
        queueGoogleOp('tasks', resolved);
        setGoogleTasks((prev) =>
          prev
            .filter((t) => !resolved.some((a) => a.operation === 'delete' && a.taskId === t.id))
            .map((t) => {
              const act = resolved.find((a) => a.taskId === t.id);
              if (!act) return t;
              if (act.operation === 'complete') return { ...t, status: 'completed' as const };
              if (act.operation === 'reopen') return { ...t, status: 'needsAction' as const };
              if (act.operation === 'update') return { ...t, title: act.title || t.title };
              return t;
            })
        );
        return { googleSynced: false, results: [], queued: true };
      };
      const resolved = options?.isUndoRestore ? taskActions : resolveTaskActionTargets(taskActions, googleTasks);
      if (navigator.onLine === false) return queueNow(resolved);
      try {
        return await executeTaskActionsNow(resolved, { ...options, alreadyResolved: true });
      } catch (err: unknown) {
        if (isNetworkFailure(err)) return queueNow(resolved);
        throw err;
      }
    },
    [executeTaskActionsNow, googleTasks, queueGoogleOp]
  );

  // Flush the queue when the connection returns, on start-up, and when Google access is renewed.
  const flushingQueueRef = useRef(false);
  useEffect(() => {
    if (!authUser || needsAuth || workspaceTokenExpired) return;
    const flush = async () => {
      if (flushingQueueRef.current || navigator.onLine === false || !getCalendarAccessToken()) return;
      const queue = readGoogleOfflineQueue();
      if (queue.length === 0) return;
      flushingQueueRef.current = true;
      let done = 0;
      try {
        for (const op of queue) {
          try {
            if (op.kind === 'calendar') {
              await executeCalendarActionsNow(op.actions as CalendarActionProposal[], { alreadyResolved: true });
            } else {
              await executeTaskActionsNow(op.actions as TaskActionProposal[], { alreadyResolved: true });
            }
            done += 1;
          } catch (err: unknown) {
            if (isNetworkFailure(err)) break;
            // a permanent failure (e.g. event deleted elsewhere): drop it and tell the user
            showToast(`تعذر تنفيذ تعديل محفوظ: ${err instanceof Error ? err.message : ''}`);
          }
          const rest = readGoogleOfflineQueue().filter((q) => q.id !== op.id);
          writeGoogleOfflineQueue(rest);
          setQueuedGoogleOpsCount(rest.length);
        }
        if (done > 0) showToast(`✓ رجع النت — اتنفذ ${done} تعديل محفوظ في Google`);
      } finally {
        flushingQueueRef.current = false;
      }
    };
    void flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [authUser, needsAuth, workspaceTokenExpired, executeCalendarActionsNow, executeTaskActionsNow, showToast]);

  const handleUndoWorkspaceDelete = useCallback(async () => {
    const snap = lastDeletedWorkspaceItem;
    if (!snap) return;
    // Idempotency guard: prevent duplicate re-creation if Undo is clicked rapidly or across devices
    if (restoredOpIdsRef.current.has(snap.opId)) {
      setLastDeletedWorkspaceItem(null);
      return;
    }
    restoredOpIdsRef.current.add(snap.opId);
    setLastDeletedWorkspaceItem(null);

    try {
      if (snap.kind === 'task') {
        await handleExecuteTaskActions(
          [
            {
              operation: 'create',
              taskListId: snap.taskListId || '@default',
              title: snap.title,
              notes: snap.notes,
              dueDateIso: snap.dueDateIso,
            },
          ],
          { isUndoRestore: true }
        );
      } else {
        await handleExecuteCalendarActions(
          [
            {
              operation: 'create',
              calendarId: snap.calendarId || 'primary',
              title: snap.title,
              dateIso: snap.dateIso || getDateIsoInTimeZone(activeTimeZone),
              startTime24: snap.startTime24 || '09:00',
              durationMinutes: snap.durationMinutes || 30,
              description: snap.description,
            },
          ],
          { isUndoRestore: true }
        );
      }
    } catch {
      restoredOpIdsRef.current.delete(snap.opId);
      showToast('تعذر الاسترجاع — تأكد من الاتصال بحساب Google');
    }
  }, [
    activeTimeZone,
    handleExecuteCalendarActions,
    handleExecuteTaskActions,
    lastDeletedWorkspaceItem,
    showToast,
  ]);

  const handleImportIcsBlocks = useCallback(
    (newBlocks: ScheduleBlock[]) => {
      setUseOfflineDemo(true);
      setOfflineBlocks((prev) => {
        const existingIds = new Set(prev.map((b) => b.id));
        const filtered = newBlocks.filter((nb) => !existingIds.has(nb.id));
        return [...prev, ...filtered].sort((a, b) => a.startMin - b.startMin);
      });
      appendChangelog(
        'Web/PC',
        `استيراد ${newBlocks.length} أحداث عبر خلاصة .ics (RRULE)`,
        `Imported ${newBlocks.length} ICS RRULE events`
      );
      showToast(`تم استيراد ${newBlocks.length} أحداث من خلاصة .ics ✓`);
    },
    [appendChangelog, showToast]
  );

  const handleCompletePeriodicRitual = useCallback(
    (id: PeriodicRitualStatus['id']) => {
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      setPeriodicRituals((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, daysSinceLast: 0, lastCompletedIso: todayIso } : r
        )
      );
      appendChangelog('Web/PC', `تسجيل إتمام المهمة الدورية (${id})`, `Completed periodic ritual ${id}`);
      showToast('تم تسجيل إنجاز المهمة الدورية وتصفير العداد ✓');
    },
    [activeTimeZone, appendChangelog, showToast]
  );

  const handleToggleCreativeToday = useCallback(
    (activityId: string) => {
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      setCreativeActivities((prev) => {
        const next = prev.map((act) => {
          if (act.id !== activityId) return act;
          const exists = act.loggedDates.includes(todayIso);
          const nextDates = exists
            ? act.loggedDates.filter((d) => d !== todayIso)
            : [...act.loggedDates, todayIso].slice(-30);
          const updated: CreativeActivityItem = { ...act, loggedDates: nextDates };
          showToast(
            exists
              ? `تم إلغاء تسجيل جلسة «${act.name}» اليوم`
              : `${act.emoji} أحسنت! تم تسجيل جلسة «${act.name}» اليوم ✓`
          );
          return updated;
        });
        void pushToTasksVaultImmediately({ creativeActivities: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      triggerHapticWaveform('water_cup');
    },
    [activeTimeZone, showToast, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleToggleComplete = (id: string) => {
    if (id.startsWith('creative_')) {
      handleToggleCreativeToday(id.slice('creative_'.length));
      return;
    }
    setCompletedOverrides((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleDeleteBlock = (id: string) => {
    const target = liveBlocks.find((b) => b.id === id) ?? null;
    setOfflineBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, deleted: true } : b))
    );
    if (target) {
      setLastDeletedBlock(target);
      setShakeUndoSecondsLeft(8);
      setTombstones((prev) => [
        {
          id: `tomb-${Date.now()}`,
          blockId: target.id,
          emojiPair: target.emojiPair,
          categoryAr: target.categoryAr,
          deletedAtIso: getDateIsoInTimeZone(activeTimeZone),
          ageDays: 0,
        },
        ...prev,
      ]);
    }
  };

  const handleRestoreBlock = (id: string) => {
    setOfflineBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, deleted: false } : b))
    );
  };

  const handleRestoreAllDeleted = () => {
    setOfflineBlocks((prev) => prev.map((b) => ({ ...b, deleted: false })));
  };

  const handleSweepOldTombstones = () => {
    const expired = tombstones.filter((t) => t.ageDays > 14).length;
    setTombstones((prev) => prev.filter((t) => t.ageDays <= 14));
    if (expired > 0) {
      appendChangelog('Web/PC', `تنظيف ${expired} سجل Tombstones > 14 يوماً`, `Purged ${expired} tombstones > 14d`);
    }
    return expired;
  };

  const handleCommitReflow = (reflowed: ScheduleBlock[]) => {
    if (!undoSnapshot) {
      setUndoSnapshot(liveBlocks);
    }
    setReflowedBlocksOverride(reflowed);
    appendChangelog('Web/PC', 'تطبيق زحزحة وتدارك اليوم الخالية من التصادم', 'Applied Collision-Free Reflow');

    // "خلي اللي بيتخطّى يبقى متعلَّم عليه، مش بس يروح كده وخلاص": a block picked "❌ تخطّي اليوم"
    // used to just vanish for the day with nothing remembered. Once the SAME item has been
    // skipped 3 times via تدارك اليوم, save one memory so Gemini notices the pattern and can
    // proactively offer to retime/simplify/remove it, instead of silently proposing it again.
    try {
      const skipped = reflowed.filter((b) => b.reflowStatus === 'skipped');
      if (skipped.length > 0) {
        const counts: Record<string, number> = JSON.parse(
          localStorage.getItem(SKIP_PATTERN_STORAGE_KEY) || '{}'
        );
        const flaggedTitles: string[] = [];
        skipped.forEach((b) => {
          const titleAr = cleanCalendarText(b.categoryAr) || b.emojiPair;
          const key = normalizeSkipPatternKey(titleAr);
          if (!key) return;
          counts[key] = (counts[key] ?? 0) + 1;
          const alreadyNoted = memories.some((m) => m.ruleText.includes(titleAr));
          if (counts[key] === 3 && !alreadyNoted) {
            flaggedTitles.push(titleAr);
          }
        });
        localStorage.setItem(SKIP_PATTERN_STORAGE_KEY, JSON.stringify(counts));
        flaggedTitles.forEach((titleAr) => {
          handleAddMemory({
            category: 'priority',
            ruleText: `لاحظ النظام أن المستخدم تخطّى «${titleAr}» ٣ أيام على الأقل عبر "تدارك اليوم" — هذا نمط متكرر، فاقترح بنفسك تعديل ميعاده أو تبسيطه أو حذفه بدل الاستمرار في جدولته كما هو دون تغيير.`,
            source: 'system_seed',
          });
        });
      }
    } catch {
      // ignore skip-pattern tracking errors
    }
  };

  const handleUndoReflow = () => {
    if (undoSnapshot) {
      setReflowedBlocksOverride(null);
      setUndoSnapshot(null);
    }
  };

  const handleTestAdhanChime = () => {
    if (quietMode === 'normal' || adhanOverrideSilent) {
      playSoftChime('alarm_pulse');
      triggerHapticWaveform('wake_fajr');
      showToast(
        quietMode !== 'normal'
          ? '🔊 نداء الصلاة يعمل بصوت نقي (تم تجاوز الصامت والاهتزاز)'
          : '🔊 نداء الصلاة نشط بصوت نقي'
      );
    } else {
      showToast('🔇 الهاتف صامت والتجاوز معطّل');
    }
  };

  const handleDismissTwoWay = useCallback(() => {
    stopContinuousAlert();
    stopSmartChargeCompleteAlert();
    stopNativeAlerts();
    setSmartChargeAudioActive(false);
    setActiveAudioAlert(null);
    setPersistentAlert(null);
    setAlarmRinging(false);
    emitCrossDeviceSync('alarm_dismiss', 'dismiss');
    showToast('🔕 تم الإيقاف المتزامن على الموبايل والكمبيوتر في نفس اللحظة ✓');
  }, [emitCrossDeviceSync, showToast, stopNativeAlerts]);

  const handleTriggerRing = useCallback(() => {
    setAlarmRinging(true);
    emitCrossDeviceSync('alarm_trigger', 'test_ring');
    triggerTaskAlert('🔔', 'general', {
      privacyEmoji: '🔔',
      displayTitle: 'اختبار تنبيه متزامن (الموبايل ↔ الكمبيوتر)',
      sourceLabel: 'مزامنة فورية عبر السحابة',
    });
  }, [emitCrossDeviceSync, triggerTaskAlert]);

  const handleSimulateCharge90 = () => {
    if (batteryGuard.bypassChargingLimitPct !== null) {
      showToast(
        `🎮 الشحن التجاوزي (${batteryGuard.bypassChargingLimitPct}%) نشط — تم منع تنبيه الامتلاء الوهمي`
      );
      return;
    }
    setBatteryGuard((prev) => ({
      ...prev,
      levelPct: 90,
      cableConnected: true,
      pcAlertActive: true,
      autoSilencedByDisconnect: false,
      bedtimeGuardTriggered: false,
    }));
    playSoftChime('focus_done');
    showToast('⚡ SUPERVOOC وصل 90%: تم إرسال التنبيه إلى الكمبيوتر');
  };

  const handleSimulatePowerDisconnect = () => {
    setBatteryGuard((prev) => ({
      ...prev,
      cableConnected: false,
      pcAlertActive: false,
      autoSilencedByDisconnect: true,
    }));
    showToast('🔌 ACTION_POWER_DISCONNECTED: تم كتم الصوت وإغلاق كارد التنبيه بالكمبيوتر تلقائياً');
  };

  const handleSimulateBedtimeLowBattery = () => {
    setBatteryGuard((prev) => ({
      ...prev,
      levelPct: 22,
      cableConnected: false,
      pcAlertActive: false,
      autoSilencedByDisconnect: false,
      bedtimeGuardTriggered: true,
      eveningTimeSimMin: 20 * 60 + 45,
    }));
    showToast('🔋 تنبيه وقائي قبل النوم (08:45 م · 22%): اشحن الهاتف قبل 09:15 م');
  };

  const handleToggleBypassCharging = (limit: 80 | 90 | null) => {
    setBatteryGuard((prev) => ({
      ...prev,
      bypassChargingLimitPct: limit,
      pcAlertActive: limit !== null ? false : prev.pcAlertActive,
    }));
    showToast(
      limit === null
        ? 'تم الرجوع لوضع الشحن العادي'
        : `🎮 تفعيل الشحن التجاوزي عند ${limit}% (منع الإنذارات الوهمية)`
    );
  };

  const handleSimulateWindowsWake = () => {
    const ts = formatNow12hInTimeZone(activeTimeZone, 'ar');
    appendChangelog('Web/PC', `تعافي فوري من Sleep عبر WM_POWERBROADCAST (${ts})`, `Win32 Sleep/Wake recovery (${ts})`);
    showToast('💻 WM_POWERBROADCAST: تمت إعادة جدولة المنبهات والمزامنة فور استيقاظ ويندوز');
    return `PBT_APMRESUMEAUTOMATIC (${ts}) — تم تحديث المنبهات وجدول اليوم ✓`;
  };

  const hydrationToday = hydrationHistory[hydrationHistory.length - 1];

  // Stable (useCallback) so the effects that depend on handleLogWaterCup don't re-subscribe every render.
  //
  // ROOT CAUSE of "water cups revert on their own": this never armed localWriteLockUntilRef, so a
  // Firestore snapshot that arrived for any unrelated reason (even just the phone's battery ping)
  // while our own save was still in flight would re-derive hydrationHistory from the document as it
  // stood BEFORE this click — wiping out the cup you just logged. Same class of bug as the
  // lifeProfile toggles above; arming the lock here is the actual fix (every previous attempt only
  // patched symptoms around this).
  const updateTodayHydration = useCallback(
    (
      updater: (today: HydrationDayLog) => HydrationDayLog,
      dismissSignal?: { scope: 'alarm_dismiss'; action: string }
    ) => {
      localWriteLockUntilRef.current = Date.now() + 6000;
      const todayIso = getDateIsoInTimeZone(activeTimeZone);

      setHydrationHistory((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const updated = updater(next[next.length - 1]);
        next[next.length - 1] = updated;

        const reachedTarget = updated.cupsLogged >= updated.targetCups;
        let nextTargetDone = streaks.waterTargetDoneToday;
        let nextTargetDays = streaks.waterTargetDays;

        if (reachedTarget && !streaks.waterTargetDoneToday) {
          nextTargetDone = true;
          nextTargetDays = streaks.waterTargetDays + 1;
        } else if (!reachedTarget && streaks.waterTargetDoneToday) {
          nextTargetDone = false;
          nextTargetDays = Math.max(0, streaks.waterTargetDays - 1);
        }

        setStreaks((s) => ({
          ...s,
          waterTargetDoneToday: nextTargetDone,
          waterTargetDays: nextTargetDays,
        }));

        const nextWeekly = next.map((d) => d.cupsLogged);

        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : {};
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...parsed, hydrationHistory: next, deviceSettings, lifeProfile })
          );
        } catch {
          // ignore storage quota
        }

        // 1) Push to Google Tasks Cloud Vault immediately
        void pushToTasksVaultImmediately({
          hydrationDateKey: todayIso,
          cupsLogged: updated.cupsLogged,
          targetCups: updated.targetCups,
          hydrationWeeklyCounts: nextWeekly,
          waterTargetDays: nextTargetDays,
          waterTargetDoneToday: nextTargetDone,
          ...(dismissSignal
            ? {
                lastDismissSignal: {
                  timestampMs: Date.now(),
                  scope: dismissSignal.scope,
                  action: dismissSignal.action,
                  clientId: clientIdRef.current,
                },
              }
            : {}),
        });

        // 2) Trigger Google Drive AppData full backup
        void pushFullCloudBackupImmediately();

        return next;
      });
    },
    [
      activeTimeZone,
      streaks,
      deviceSettings,
      lifeProfile,
      pushToTasksVaultImmediately,
      pushFullCloudBackupImmediately,
    ]
  );

  const handleLogWaterCup = useCallback(() => {
    stopContinuousAlert();
    stopNativeAlerts();
    setActiveAudioAlert(null);
    setPersistentAlert(null);
    setAlarmRinging(false);
    emitCrossDeviceSync('alarm_dismiss', 'water_confirmed');

    updateTodayHydration((today) => {
      const nextIdx = today.slots.findIndex((filled) => !filled);
      if (nextIdx === -1) return today;
      const nextSlots = [...today.slots];
      nextSlots[nextIdx] = true;
      const nextLogged = nextSlots.filter(Boolean).length;
      return {
        ...today,
        slots: nextSlots,
        cupsLogged: nextLogged,
      };
    }, { scope: 'alarm_dismiss', action: 'water_confirmed' });
  }, [
    updateTodayHydration,
    stopContinuousAlert,
    stopNativeAlerts,
    emitCrossDeviceSync,
  ]);

  const handleToggleWaterSlot = (index: number) => {
    updateTodayHydration((today) => {
      const nextSlots = [...today.slots];
      const becomingActive = !nextSlots[index];
      nextSlots[index] = becomingActive;
      const nextLogged = nextSlots.filter(Boolean).length;

      if (becomingActive) {
        stopContinuousAlert();
        stopNativeAlerts();
        setActiveAudioAlert(null);
        setPersistentAlert(null);
        setAlarmRinging(false);
        emitCrossDeviceSync('alarm_dismiss', 'water_confirmed');
      }

      return {
        ...today,
        slots: nextSlots,
        cupsLogged: nextLogged,
      };
    }, { scope: 'alarm_dismiss', action: 'water_confirmed' });
  };

  // Handle PWA Home Screen App Shortcuts (/?action=water | meeting | voice)
  useEffect(() => {
    if (shortcutHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (!action) return;

    shortcutHandledRef.current = true;
    try {
      window.history.replaceState({}, '', window.location.pathname || '/');
    } catch {
      // ignore history errors
    }

    if (action === 'water') {
      setActiveTab('dashboard');
      setHydrationHistory((prev) => {
        const next = [...prev];
        const today = next[next.length - 1];
        if (!today) return prev;
        const nextIdx = today.slots.findIndex((filled) => !filled);
        if (nextIdx === -1) return prev;
        const nextSlots = [...today.slots];
        nextSlots[nextIdx] = true;
        const newCount = nextSlots.filter(Boolean).length;
        next[next.length - 1] = {
          ...today,
          slots: nextSlots,
          cupsLogged: newCount,
        };
        if (newCount >= today.targetCups) {
          setStreaks((s) =>
            s.waterTargetDoneToday
              ? s
              : {
                  ...s,
                  waterTargetDoneToday: true,
                  waterTargetDays: s.waterTargetDays + 1,
                }
          );
        }
        return next;
      });
      triggerHapticWaveform('water_cup');
      showToast('💧 اختصار سريع: تم تسجيل +1 كوب ماء بنجاح ✓');
    } else if (action === 'meeting') {
      setActiveTab('dashboard');
      handleSetQuietMode('vibrate_only', 30);
      triggerHapticWaveform('water_cup');
    } else if (action === 'voice') {
      setActiveTab('assistant');
      setAutoStartVoice(true);
      showToast('🎙️ اختصار سريع: فتح شات Gemini بالصوت');
    } else if (action === 'chat') {
      setActiveTab('assistant');
    }
  }, [showToast, handleSetQuietMode]);

  // Home-screen widget / native shortcuts while the app is already open.
  useEffect(() => {
    const onOpenAssistant = (ev: Event) => {
      const detail = (ev as CustomEvent<{ voice?: boolean }>).detail || {};
      setActiveTab('assistant');
      if (detail.voice) setAutoStartVoice(true);
    };
    window.addEventListener('dayrhythm:open-assistant', onOpenAssistant);
    return () => window.removeEventListener('dayrhythm:open-assistant', onOpenAssistant);
  }, []);

  // Active Water Cup & Multi-Dose Medication Reminder Engine (fires every 5s/30s tick, respects Fasting & Silence Sanctuaries)
  useEffect(() => {
    const todayIso = getDateIsoInTimeZone(activeTimeZone);
    const todayW = getWeekdayInTimeZone(activeTimeZone);

    const sendSystemNotification = (
      title: string,
      body: string,
      tag: string,
      onClickAction?: () => void
    ) => {
      if (
        activeSanctuary.type !== 'none' ||
        quietMode === 'silent_all' ||
        typeof window === 'undefined' ||
        !('Notification' in window) ||
        Notification.permission !== 'granted'
      ) {
        return;
      }
      try {
        const notif = new Notification(title, { body, tag, icon: '/icon-192.png' });
        if (onClickAction) {
          notif.onclick = () => {
            onClickAction();
            notif.close();
          };
        }
      } catch {
        // ignore browser notification errors in restricted iframes
      }
    };

    // Android APK: these reminders are already exact native alarms (they ring even with the app
    // closed). Firing them here as well made the phone ring two or three times for one reminder.
    const nativeOwnsReminders = Boolean(
      (window as Window & { DayRhythmNative?: { scheduleExactAlarms?: unknown } }).DayRhythmNative
        ?.scheduleExactAlarms
    );
    if (!nativeOwnsReminders) {
    // 1. Water cup reminders (Emoji-only privacy notification — clicking confirms drinking)
    if (waterRemindersEnabled && hydrationToday) {
      dailyRhythmPlan.hydrationSlots.forEach((slot, idx) => {
        if (hydrationToday.slots[idx]) return;
        const diff = nowTickMin - slot.timeMinutes;
        if (diff >= 0 && diff <= 4) {
          const key = `${todayIso}:water:${slot.cupIndex}`;
          if (firedReminderKeysRef.current.has(key)) return;
          firedReminderKeysRef.current.add(key);
          const time12 = formatMinutes12h(slot.timeMinutes, 'ar');
          triggerTaskAlert('💧', 'water', {
            privacyEmoji: '💧',
            displayTitle: `موعد شرب كوب ماء (${dailyRhythmPlan.cupSizeMl} مل)`,
            sourceLabel: 'ترطيب يومي',
          });
          sendSystemNotification('💧', `${time12} · اضغط عند الشرب ✓`, key, () => {
            handleLogWaterCup();
            handleAcknowledgeAudioAlert();
          });
        }
      });
    }

    // 2. Medication & Supplement reminders (5-min high-visibility alert + sound + quick-confirm metadata)
    medications.forEach((med) => {
      if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(todayW)) {
        return;
      }
      const times =
        med.times24 && med.times24.length > 0
          ? med.times24
          : med.time24
            ? [med.time24]
            : [];
      times.forEach((t24) => {
        const match = t24.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return;
        const medMin = Number(match[1]) * 60 + Number(match[2]);
        const diff = nowTickMin - medMin;
        if (diff < 0 || diff > 4) return;
        const takenDoses = med.takenDateKey === todayIso ? med.takenDosesToday ?? [] : [];
        const alreadyTaken =
          times.length > 1 ? takenDoses.includes(t24) : med.takenDateKey === todayIso;
        if (alreadyTaken) return;

        const key = `${todayIso}:med:${med.id}:${t24}`;
        if (firedReminderKeysRef.current.has(key)) return;
        firedReminderKeysRef.current.add(key);
        const time12 = formatMinutes12h(medMin, 'ar');
        triggerTaskAlert('💊', 'medication', {
          privacyEmoji: '💊',
          displayTitle: `موعد الجرعة: ${med.name}`,
          sourceLabel: 'العلاجات والأدوية',
          medicationId: med.id,
          medicationDoseTime24: t24,
        });
        sendSystemNotification('💊', `${med.name} · ${time12}`, key);
      });
    });

    // 3. Live Google Calendar event reminders (5-min high-visibility alert on Secondary Screen / Side Dock / Mobile)
    liveBlocks.forEach((block) => {
      if (block.deleted || block.completed || block.isAllDay) return;
      const diff = nowTickMin - block.startMin;
      if (diff >= 0 && diff <= 2) {
        const key = `${todayIso}:event:${block.id}:${block.startMin}`;
        if (firedReminderKeysRef.current.has(key)) return;
        firedReminderKeysRef.current.add(key);
        const emojiOnly = (block.emojiPair || '📅').trim();
        const cleanTitle = cleanCalendarText(block.categoryAr) || 'موعد في التقويم';
        const time12 = formatMinutes12h(block.startMin, 'ar');
        const soundCat = classifyTaskSound(block.categoryAr, block.emojiPair, block.isAnchor);
        triggerTaskAlert(emojiOnly, soundCat, {
          privacyEmoji: emojiOnly,
          displayTitle: cleanTitle,
          sourceLabel: 'تقويم Google',
          description: block.description,
        });
        sendSystemNotification(emojiOnly, `${cleanTitle} · ${time12}`, key);
      }
    });

    // 3B. Timed Google Tasks reminders (fires 5-minute persistent alert + sound when a timed task arrives!)
    googleTasks.forEach((tk) => {
      if (tk.status === 'completed') return;
      const info = extractTaskTimeMinutesForToday(tk, todayIso, activeTimeZone);
      if (!info || !info.hasExplicitTime) return;
      const diff = nowTickMin - info.startMin;
      if (diff >= 0 && diff <= 2) {
        const key = `${todayIso}:gtask:${tk.id}:${info.startMin}`;
        if (firedReminderKeysRef.current.has(key)) return;
        firedReminderKeysRef.current.add(key);
        const cleanTitle = cleanCalendarText(tk.title) || 'مهمة مطلوبة الآن';
        const time12 = formatMinutes12h(info.startMin, 'ar');
        const soundCat = classifyTaskSound(tk.title, '☑️', false);
        triggerTaskAlert('☑️', soundCat, {
          privacyEmoji: '☑️',
          displayTitle: cleanTitle,
          sourceLabel: tk.taskListTitle ? `مهام · ${tk.taskListTitle}` : 'مهام Google',
          taskId: tk.id,
          taskListId: tk.taskListId,
          description: tk.notes,
        });
        sendSystemNotification('☑️ مهمة الآن', `${cleanTitle} · ${time12}`, key);
      }
    });
    } // end: reminders owned by native alarms on Android

    // 4. Proactive Medication Low-Stock Refill Reminder (default 3 days before running out)
    medications.forEach((med) => {
      if (typeof med.remainingDoses !== 'number' || med.remainingDoses < 0) return;
      const dosesPerDay = Math.max(
        1,
        med.times24 && med.times24.length > 0 ? med.times24.length : 1
      );
      const alertLeadDays = Math.max(1, Math.min(14, med.refillAlertDays ?? 3));
      const daysLeft = med.remainingDoses / dosesPerDay;
      if (daysLeft <= alertLeadDays) {
        const refillKey = `${todayIso}:med_refill:${med.id}`;
        if (firedReminderKeysRef.current.has(refillKey)) return;
        firedReminderKeysRef.current.add(refillKey);
        const daysRounded = Math.ceil(daysLeft);
        const bodyText =
          med.remainingDoses === 0
            ? `نفدت جرعات «${med.name}» — اشترِ عبوة جديدة اليوم`
            : `متبقٍ ${med.remainingDoses} جرعة (حوالي ${daysRounded} ${daysRounded === 1 ? 'يوم' : 'أيام'}) — جهّز شراء جرعات جديدة`;
        sendSystemNotification('💊 تنبيه إعادة شراء العلاج', bodyText, refillKey);
      }
    });
  }, [
    nowTickMin,
    waterRemindersEnabled,
    dailyRhythmPlan.hydrationSlots,
    dailyRhythmPlan.cupSizeMl,
    hydrationToday,
    medications,
    liveBlocks,
    googleTasks,
    activeTimeZone,
    activeSanctuary.type,
    quietMode,
    triggerTaskAlert,
    handleLogWaterCup,
    handleAcknowledgeAudioAlert,
  ]);

  // Real-time Phone Battery Sync (Mobile publishes local battery; PC receives & displays)
  useEffect(() => {
    const isMobileClient = detectIsMobileDeviceClient();
    const nativeWindow = window as Window & {
      __dayRhythmNativeBattery?: {
        levelPct?: number;
        charging?: boolean;
        chargeTimeRemainingMin?: number;
        deviceLabel?: string;
        chargeLimitPct?: number;
        updatedAtMs?: number;
      };
      DayRhythmNative?: {
        getBatterySnapshotJson?: () => string;
      };
    };

    // 1. DESKTOP / PC RECEIVER:
    // We only listen for Phone battery telemetry forwarded from MainForm.cs via 'dayrhythm:native-battery'
    // NEVER poll navigator.getBattery() on PC, as that would read the PC's power state and overwrite the phone!
    if (!isMobileClient) {
      const onNativeBattery = (ev: Event) => {
        const detail = (
          ev as CustomEvent<{
            levelPct?: number;
            charging?: boolean;
            chargeTimeRemainingMin?: number;
            chargeLimitPct?: number;
            deviceLabel?: string;
            updatedAtMs?: number;
          }>
        ).detail;
        if (detail && typeof detail.levelPct === 'number') {
          const clampedLevel = Math.max(0, Math.min(100, Math.round(detail.levelPct)));
          const clampedEta =
            typeof detail.chargeTimeRemainingMin === 'number' && Number.isFinite(detail.chargeTimeRemainingMin)
              ? Math.max(-1, Math.min(1440, Math.round(detail.chargeTimeRemainingMin)))
              : -1;
          const limit =
            typeof detail.chargeLimitPct === 'number' && detail.chargeLimitPct > 0
              ? detail.chargeLimitPct
              : phoneChargeLimitRef.current;
          const incoming: PhoneBatteryTelemetry = {
            levelPct: clampedLevel,
            charging: Boolean(detail.charging),
            chargeLimitPct: limit,
            chargeTimeRemainingMin: detail.charging ? clampedEta : -1,
            updatedAtMs: typeof detail.updatedAtMs === 'number' ? detail.updatedAtMs : Date.now(),
            deviceLabel: detail.deviceLabel || 'OnePlus 12R',
          };
          setPhoneBattery(incoming);
          setBatteryGuard((prev) => ({
            ...prev,
            levelPct: incoming.levelPct,
            cableConnected: incoming.charging,
            pcAlertActive:
              incoming.charging &&
              incoming.levelPct >= incoming.chargeLimitPct &&
              prev.bypassChargingLimitPct === null,
            autoSilencedByDisconnect: !incoming.charging && prev.cableConnected,
          }));
        }
      };

      window.addEventListener('dayrhythm:native-battery', onNativeBattery);
      if (nativeWindow.__dayRhythmNativeBattery && typeof nativeWindow.__dayRhythmNativeBattery.levelPct === 'number') {
        const b = nativeWindow.__dayRhythmNativeBattery;
        setPhoneBattery({
          levelPct: Math.max(0, Math.min(100, Math.round(b.levelPct ?? 0))),
          charging: Boolean(b.charging),
          chargeLimitPct: b.chargeLimitPct || phoneChargeLimitRef.current,
          chargeTimeRemainingMin: b.charging ? (b.chargeTimeRemainingMin ?? -1) : -1,
          updatedAtMs: b.updatedAtMs || Date.now(),
          deviceLabel: b.deviceLabel || 'OnePlus 12R',
        });
      }

      return () => {
        window.removeEventListener('dayrhythm:native-battery', onNativeBattery);
      };
    }

    // 2. MOBILE PUBLISHER (Runs strictly on Phone: Android APK or mobile browser)
    let lastSentKey = '';
    let lastFirestorePushMs = 0;
    let pushedToFirestoreOnce = false;

    const pushPhoneBattery = (
      levelPct: number,
      charging: boolean,
      deviceLabel: string,
      chargeTimeRemainingMin = -1
    ) => {
      const clampedLevel = Math.max(0, Math.min(100, Math.round(levelPct)));
      const clampedEta =
        typeof chargeTimeRemainingMin === 'number' && Number.isFinite(chargeTimeRemainingMin)
          ? Math.max(-1, Math.min(1440, Math.round(chargeTimeRemainingMin)))
          : -1;
      const limit = phoneChargeLimitRef.current;
      const nowMs = Date.now();
      const snapshot: PhoneBatteryTelemetry = {
        levelPct: clampedLevel,
        charging,
        chargeLimitPct: limit,
        chargeTimeRemainingMin: charging ? clampedEta : -1,
        updatedAtMs: nowMs,
        deviceLabel: deviceLabel || 'OnePlus 12R',
      };
      setPhoneBattery(snapshot);

      const dedupeKey = `${clampedLevel}:${charging ? 1 : 0}:${limit}:${snapshot.chargeTimeRemainingMin}`;
      const changed = dedupeKey !== lastSentKey;
      if (changed) {
        lastSentKey = dedupeKey;
      }

      // Instant sub-second relay over WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'battery', ...snapshot }));
        } catch {
          // ignore ws send errors
        }
      }

      // Persist in Firestore immediately on first sync, on any change, or every 45s while charging
      if (
        firebaseUser?.uid &&
        firebaseUser.emailVerified &&
        firestoreSynced &&
        (!pushedToFirestoreOnce || changed || (charging && nowMs - lastFirestorePushMs > 45_000))
      ) {
        pushedToFirestoreOnce = true;
        lastFirestorePushMs = nowMs;
        void publishPhoneBatteryTelemetry(firebaseUser.uid, snapshot).catch(() => {});
      }
    };

    const onNativeBattery = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          levelPct?: number;
          charging?: boolean;
          chargeTimeRemainingMin?: number;
          deviceLabel?: string;
        }>
      ).detail;
      if (detail && typeof detail.levelPct === 'number') {
        pushPhoneBattery(
          detail.levelPct,
          Boolean(detail.charging),
          detail.deviceLabel || 'OnePlus 12R',
          typeof detail.chargeTimeRemainingMin === 'number' ? detail.chargeTimeRemainingMin : -1
        );
      }
    };
    window.addEventListener('dayrhythm:native-battery', onNativeBattery);

    // Pull immediate native battery snapshot (includes Android BatteryManager.computeChargeTimeRemaining)
    const pullNativeBatterySnapshot = () => {
      if (nativeWindow.DayRhythmNative?.getBatterySnapshotJson) {
        try {
          const parsed = JSON.parse(nativeWindow.DayRhythmNative.getBatterySnapshotJson()) as {
            levelPct?: number;
            charging?: boolean;
            chargeTimeRemainingMin?: number;
            deviceLabel?: string;
          };
          if (typeof parsed.levelPct === 'number') {
            pushPhoneBattery(
              parsed.levelPct,
              Boolean(parsed.charging),
              parsed.deviceLabel || 'OnePlus 12R',
              typeof parsed.chargeTimeRemainingMin === 'number' ? parsed.chargeTimeRemainingMin : -1
            );
            return true;
          }
        } catch {
          // ignore malformed native battery JSON
        }
      }
      if (
        nativeWindow.__dayRhythmNativeBattery &&
        typeof nativeWindow.__dayRhythmNativeBattery.levelPct === 'number'
      ) {
        pushPhoneBattery(
          nativeWindow.__dayRhythmNativeBattery.levelPct,
          Boolean(nativeWindow.__dayRhythmNativeBattery.charging),
          nativeWindow.__dayRhythmNativeBattery.deviceLabel || 'OnePlus 12R',
          typeof nativeWindow.__dayRhythmNativeBattery.chargeTimeRemainingMin === 'number'
            ? nativeWindow.__dayRhythmNativeBattery.chargeTimeRemainingMin
            : -1
        );
        return true;
      }
      return false;
    };

    pullNativeBatterySnapshot();
    const nativePollTimer = nativeWindow.DayRhythmNative?.getBatterySnapshotJson
      ? window.setInterval(pullNativeBatterySnapshot, 30_000)
      : null;

    type BatteryManagerLike = {
      level: number;
      charging: boolean;
      chargingTime?: number;
      addEventListener: (type: string, listener: () => void) => void;
      removeEventListener: (type: string, listener: () => void) => void;
    };
    let batteryManager: BatteryManagerLike | null = null;
    let onWebBatteryChange: (() => void) | null = null;
    let pollTimer: number | null = null;

    const navWithBattery = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManagerLike>;
    };

    // Only query Web Battery API on mobile web browsers that lack the DayRhythmNative APK bridge
    if (!nativeWindow.DayRhythmNative && typeof navWithBattery.getBattery === 'function') {
      navWithBattery
        .getBattery()
        .then((bm) => {
          batteryManager = bm;
          const emitFromWeb = () => {
            const etaMin =
              bm.charging &&
              typeof bm.chargingTime === 'number' &&
              Number.isFinite(bm.chargingTime) &&
              bm.chargingTime > 0 &&
              bm.chargingTime < 86400
                ? Math.max(1, Math.round(bm.chargingTime / 60))
                : -1;
            pushPhoneBattery(Math.round(bm.level * 100), Boolean(bm.charging), 'الهاتف', etaMin);
          };
          onWebBatteryChange = emitFromWeb;
          emitFromWeb();
          bm.addEventListener('levelchange', emitFromWeb);
          bm.addEventListener('chargingchange', emitFromWeb);
          bm.addEventListener('chargingtimechange', emitFromWeb);
          pollTimer = window.setInterval(emitFromWeb, 25_000);
        })
        .catch(() => {
          // Battery Status API unavailable on this browser
        });
    }

    return () => {
      window.removeEventListener('dayrhythm:native-battery', onNativeBattery);
      if (nativePollTimer !== null) {
        window.clearInterval(nativePollTimer);
      }
      if (batteryManager && onWebBatteryChange) {
        batteryManager.removeEventListener('levelchange', onWebBatteryChange);
        batteryManager.removeEventListener('chargingchange', onWebBatteryChange);
        batteryManager.removeEventListener('chargingtimechange', onWebBatteryChange);
      }
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
    };
  }, [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced, wsConnected]);

  const handleStopSmartChargeAlert = useCallback(() => {
    stopSmartChargeCompleteAlert();
    stopNativeAlerts();
    setSmartChargeAudioActive(false);
    setPhoneChargeAlertDismissed(true);
    setPersistentAlert((prev) => (prev?.id.startsWith('charge_') ? null : prev));
    emitCrossDeviceSync('alarm_dismiss', 'charge_dismiss');
    showToast('🔕 تم إسكات تنبيه الشحن على كل أجهزتك ✓ (هينبّه تاني في الشحنة الجاية)');
  }, [emitCrossDeviceSync, showToast, stopNativeAlerts]);

  const handleToggleSmartChargeKeepUntilUnplugged = useCallback(() => {
    setSmartChargeKeepUntilUnplugged((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SMART_CHARGE_KEEP_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      showToast(
        next
          ? '🔌 سيستمر منبّه الشحن بالرنين حتى فصل الموبايل من الشاحن (أو إيقافه يدوياً)'
          : '⏱️ سيتوقف منبّه الشحن تلقائياً بعد دقيقتين إذا لم يتم إيقافه'
      );
      return next;
    });
  }, [showToast]);

  const handleToggleSmartChargeAlertEnabled = useCallback(() => {
    setSmartChargeAlertEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('dayrhythm_smart_charge_alert_enabled', String(next));
      } catch {
        // ignore storage errors
      }
      if (!next) {
        stopSmartChargeCompleteAlert();
        setSmartChargeAudioActive(false);
      }
      showToast(
        next
          ? `🔋 تم تفعيل التنبيه الذكي عند اكتمال الشحن (${phoneChargeLimitRef.current}%)`
          : '🔕 تم إيقاف التنبيه الصوتي التلقائي لاكتمال الشحن'
      );
      return next;
    });
  }, [showToast]);

  // Settings changed from the Gemini chat (propose_app_settings). Each field is optional.
  const handleApplyAppSettings = useCallback(
    (patch: AppSettingsPatch) => {
      const persist = (key: string, value: string) => {
        try {
          localStorage.setItem(key, value);
        } catch {
          // ignore storage errors
        }
      };
      if (typeof patch.phoneChargeLimitPct === 'number') handleUpdatePhoneChargeLimit(patch.phoneChargeLimitPct);
      if (typeof patch.chargeAlertEnabled === 'boolean') {
        setSmartChargeAlertEnabled(patch.chargeAlertEnabled);
        persist('dayrhythm_smart_charge_alert_enabled', String(patch.chargeAlertEnabled));
        if (!patch.chargeAlertEnabled) {
          stopSmartChargeCompleteAlert();
          setSmartChargeAudioActive(false);
        }
      }
      if (typeof patch.chargeAlertKeepUntilUnplugged === 'boolean') {
        setSmartChargeKeepUntilUnplugged(patch.chargeAlertKeepUntilUnplugged);
        persist(SMART_CHARGE_KEEP_KEY, String(patch.chargeAlertKeepUntilUnplugged));
      }
      if (typeof patch.waterRemindersEnabled === 'boolean') setWaterRemindersEnabled(patch.waterRemindersEnabled);
      if (patch.quietMode) {
        handleSetQuietMode(patch.quietMode, patch.quietMode === 'normal' ? 0 : Math.max(0, patch.quietModeMinutes ?? 0));
      }
      if (typeof patch.adhanSoundInSilent === 'boolean') setAdhanOverrideSilent(patch.adhanSoundInSilent);
      if (typeof patch.sunMode === 'boolean') setSunMode(patch.sunMode);
      if (patch.language === 'ar' || patch.language === 'en') setLanguage(patch.language);
      if (patch.capsuleOrientation || patch.capsuleSize) {
        handleUpdateCapsulePrefs({
          orientation: patch.capsuleOrientation ?? capsulePrefs.orientation,
          size: patch.capsuleSize ?? capsulePrefs.size,
        });
      }
      const devicePatch: Partial<OnePlusDeviceSettings> = {};
      if (typeof patch.liveAlertsEnabled === 'boolean') devicePatch.liveAlertsEnabled = patch.liveAlertsEnabled;
      if (patch.liveAlertsLeadMinutes) devicePatch.liveAlertsLeadMinutes = patch.liveAlertsLeadMinutes;
      if (typeof patch.persistentCountdownNotif === 'boolean') {
        devicePatch.persistentCountdownNotif = patch.persistentCountdownNotif;
      }
      if (Object.keys(devicePatch).length > 0) handleUpdateDeviceSettings(devicePatch);
      if (patch.soundRepeats) {
        for (const [category, value] of Object.entries(patch.soundRepeats)) {
          if (value === undefined) continue;
          const setting: SoundRepeatSetting =
            value === 'continuous' ? 'continuous' : (Math.max(1, Math.min(10, Math.round(Number(value)))) as SoundRepeatSetting);
          handleUpdateSoundRepeat(category as TaskSoundCategory, setting);
        }
      }
      showToast('⚙️ تم تطبيق الإعدادات من Gemini ✓');
    },
    [
      capsulePrefs.orientation,
      capsulePrefs.size,
      handleSetQuietMode,
      handleUpdateCapsulePrefs,
      handleUpdateDeviceSettings,
      handleUpdatePhoneChargeLimit,
      handleUpdateSoundRepeat,
      showToast,
    ]
  );

  const handleTestSmartChargeAlert = useCallback(() => {
    if (smartChargeAudioActive) {
      handleStopSmartChargeAlert();
      return;
    }
    playBatteryFullSignature();
    showToast(`🔊 نغمة التنبيه الذكي عند وصول الموبايل إلى ${phoneChargeLimitRef.current}%`);
  }, [smartChargeAudioActive, handleStopSmartChargeAlert, showToast]);

  // Stop smart charge audio cleanly on unmount
  useEffect(() => {
    return () => {
      stopSmartChargeCompleteAlert();
    };
  }, []);

  // Charge-limit alert (default 90%) on BOTH the PC and the phone, so the phone gets unplugged
  // before 100% (keeping a Li-ion battery at 100% on the charger shortens its life).
  useEffect(() => {
    if (!phoneBattery) return;
    const isPhoneClient = detectIsMobileDeviceClient();

    if (!phoneBattery.charging || phoneBattery.levelPct < phoneBattery.chargeLimitPct - 2) {
      if (phoneChargeNotifiedCycleRef.current || smartChargeAudioActive) {
        stopSmartChargeCompleteAlert();
        setSmartChargeAudioActive(false);
        setPersistentAlert((prev) => (prev?.id.startsWith('charge_') ? null : prev));
      }
      phoneChargeNotifiedCycleRef.current = false;
      setPhoneChargeAlertDismissed(false);
      return;
    }

    if (
      smartChargeAlertEnabled &&
      phoneBattery.charging &&
      phoneBattery.levelPct >= phoneBattery.chargeLimitPct &&
      !phoneChargeNotifiedCycleRef.current
    ) {
      phoneChargeNotifiedCycleRef.current = true;
      setPhoneChargeAlertDismissed(false);

      const isAndroidNative = Boolean(
        (window as Window & { DayRhythmNative?: unknown }).DayRhythmNative
      );
      if (!isAndroidNative) {
        const audioResult = startSmartChargeCompleteAlert({
          sanctuary: activeSanctuary,
          keepRingingUntilUnplugged: smartChargeKeepUntilUnplugged,
          onAutoStop: () => setSmartChargeAudioActive(false),
        });
        if (audioResult.playedAudio) {
          setSmartChargeAudioActive(true);
        }
      }

      const nowTime12 = formatNow12hInTimeZone(activeTimeZone, 'ar');
      setPersistentAlert({
        id: `charge_${Date.now().toString(36)}`,
        emoji: `🔋 ${phoneBattery.levelPct}%`,
        title: `وصل شحن ${phoneBattery.deviceLabel || 'الموبايل'} إلى ${phoneBattery.levelPct}% — افصل الشاحن الآن`,
        sourceLabel: smartChargeKeepUntilUnplugged
          ? 'تنبيه الشحن · يستمر حتى فصل الشاحن'
          : 'التنبيه الذكي لاكتمال الشحن',
        time12h: nowTime12,
        category: 'general',
        createdAtMs: Date.now(),
        durationMs: 300_000,
        isContinuous: smartChargeKeepUntilUnplugged,
      });

      showToast(
        `🔋 التنبيه الذكي: وصل شحن ${phoneBattery.deviceLabel || 'الموبايل'} إلى ${phoneBattery.levelPct}% (الحد ${phoneBattery.chargeLimitPct}%) — يمكنك فصله أو إيقاف التنبيه الآن`
      );

      // Desktop OS Notification
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(`🔋 اكتمل شحن الموبايل (${phoneBattery.levelPct}%)`, {
            body: `وصل شحن ${phoneBattery.deviceLabel || 'الهاتف'} إلى ${phoneBattery.chargeLimitPct}% — افصل الشاحن أو أوقف التنبيه من لوحة التحكم.`,
            tag: 'dayrhythm-phone-charge-limit',
            icon: '/icon-192.png',
          });
        } catch {
          // ignore notification errors
        }
      }

      // Phone (APK): the Android background service rings its own notification at the limit
      // (also when the app is closed), so nothing extra is triggered from here.

      // Windows Secondary Monitor Toast (zero focus-steal on Screen 1!)
      try {
        const wv = (
          window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } }
        ).chrome?.webview;
        if (wv?.postMessage) {
          wv.postMessage(
            JSON.stringify({
              type: 'native-alert',
              emoji: `🔋 ${phoneBattery.levelPct}%`,
              title: `وصل شحن ${phoneBattery.deviceLabel || 'الموبايل'} إلى ${phoneBattery.levelPct}% — افصل الشاحن`,
              sourceLabel: 'التنبيه الذكي لاكتمال الشحن',
              time12h: nowTime12,
              category: 'general',
              isHydration: false,
              isContinuous: smartChargeKeepUntilUnplugged,
              durationSeconds: 300,
            })
          );
        }
      } catch {
        // ignore WebView2 postMessage errors
      }
    }
  }, [
    activeTimeZone,
    phoneBattery,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    smartChargeAudioActive,
    activeSanctuary,
    showToast,
  ]);

  // Proactive 3-Day Low-Stock Medication Reminder (notifies once per day when any tracked medication is <= 3 days left)
  useEffect(() => {
    if (medications.length === 0) return;
    const todayIso = getDateIsoInTimeZone(activeTimeZone);
    const lowMeds = medications.filter((m) => {
      if (typeof m.remainingDoses !== 'number' || m.remainingDoses < 0) return false;
      const dosesPerScheduledDay = Math.max(
        1,
        m.times24 && m.times24.length > 0 ? m.times24.length : 1
      );
      const daysPerWeek = m.daysOfWeek && m.daysOfWeek.length > 0 ? m.daysOfWeek.length : 7;
      const dailyRate = Math.max(0.14, (dosesPerScheduledDay * daysPerWeek) / 7);
      const alertLeadDays = Math.max(1, Math.min(14, m.refillAlertDays ?? 3));
      return m.remainingDoses / dailyRate <= alertLeadDays;
    });

    if (lowMeds.length === 0) return;
    const dedupKey = `${todayIso}:${lowMeds.map((m) => `${m.id}=${m.remainingDoses}`).join(',')}`;
    if (lowStockProactiveNotifiedKeyRef.current === dedupKey) return;
    lowStockProactiveNotifiedKeyRef.current = dedupKey;

    const namesSummary = lowMeds
      .slice(0, 2)
      .map((m) => `«${m.name}» (${m.remainingDoses} جرعة)`)
      .join(' و');
    const extraCount = lowMeds.length > 2 ? ` +${lowMeds.length - 2}` : '';

    showToast(
      `💊 تنبيه استباقي: مخزون ${namesSummary}${extraCount} قارب على الانتهاء (خلال 3 أيام) — استخدم «إضافة شراء جديد»`
    );
  }, [activeTimeZone, medications, showToast]);

  const handleToggleMedication = useCallback(
    (id: string, doseTime24?: string) => {
      const target = medications.find((m) => m.id === id);
      if (!target) return;

      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      const allTimes =
        target.times24 && target.times24.length > 0
          ? target.times24
          : target.time24
            ? [target.time24]
            : [];
      let updated: MedicationItem;
      let deltaDoses = 0;

      if (doseTime24 && allTimes.length > 1) {
        const currentTaken =
          target.takenDateKey === todayIso ? target.takenDosesToday ?? [] : [];
        const exists = currentTaken.includes(doseTime24);
        const nextTaken = exists
          ? currentTaken.filter((t) => t !== doseTime24)
          : [...currentTaken, doseTime24];
        deltaDoses = exists ? 1 : -1;
        updated = {
          ...target,
          takenDosesToday: nextTaken,
          takenDateKey: nextTaken.length > 0 ? todayIso : '',
        };
      } else {
        const isFullyTaken =
          target.takenDateKey === todayIso &&
          (allTimes.length <= 1 ||
            allTimes.every((t) => (target.takenDosesToday ?? []).includes(t)));
        const currentCount =
          target.takenDateKey === todayIso
            ? allTimes.length > 1
              ? (target.takenDosesToday ?? []).length
              : 1
            : 0;
        const totalToday = Math.max(1, allTimes.length);
        deltaDoses = isFullyTaken ? currentCount : -(totalToday - currentCount);
        updated = {
          ...target,
          takenDateKey: isFullyTaken ? '' : todayIso,
          takenDosesToday: isFullyTaken ? [] : allTimes,
        };
      }

      const isFullyTakenAfter =
        updated.takenDateKey === todayIso &&
        (allTimes.length <= 1 ||
          allTimes.every((t) => (updated.takenDosesToday ?? []).includes(t)));
      const cutoff7Iso = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
      const existingDates = Array.isArray(target.takenDates) ? target.takenDates : [];
      const nextTakenDates = (
        isFullyTakenAfter
          ? Array.from(new Set([...existingDates, todayIso]))
          : existingDates.filter((d) => d !== todayIso)
      )
        .filter((d) => d >= cutoff7Iso)
        .sort()
        .slice(-7);
      updated = { ...updated, takenDates: nextTakenDates };

      let lowStockMsg = '';
      if (typeof target.remainingDoses === 'number' && target.remainingDoses >= 0) {
        const maxCap =
          typeof target.totalDoses === 'number' && target.totalDoses > 0
            ? Math.max(target.totalDoses, target.remainingDoses)
            : 500;
        const nextRem = Math.max(0, Math.min(maxCap, target.remainingDoses + deltaDoses));
        updated = { ...updated, remainingDoses: nextRem };
        const dosesPerDay = Math.max(1, allTimes.length);
        const alertLeadDays = Math.max(1, Math.min(14, target.refillAlertDays ?? 3));
        const daysLeft = nextRem / dosesPerDay;
        if (deltaDoses < 0 && daysLeft <= alertLeadDays) {
          const roundedDays = Math.ceil(daysLeft);
          lowStockMsg =
            nextRem === 0
              ? `⚠️ نفدت جرعات «${target.name}» — حان وقت شراء عبوة جديدة`
              : `💊 تنبيه مخزون: متبقٍ ${nextRem} جرعة من «${target.name}» (تكفي ~${roundedDays} ${roundedDays === 1 ? 'يوم' : 'أيام'}) — جهّز شراء جرعات جديدة`;
        }
      }

      setMedications((prev) => {
        const next = prev.map((m) => (m.id === id ? updated : m));
        void pushToTasksVaultImmediately({ medications: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });

      if (lowStockMsg) {
        showToast(lowStockMsg);
      } else if (!doseTime24 && isFullyTakenAfter) {
        const remSuffix =
          typeof updated.remainingDoses === 'number' && updated.remainingDoses >= 0
            ? ` (متبقٍ ${updated.remainingDoses})`
            : '';
        showToast(`تم تسجيل «${target.name}» لليوم${remSuffix}`);
      }
      triggerHapticWaveform('water_cup');
    },
    [activeTimeZone, medications, showToast, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleToggleMedicationDate = useCallback(
    (id: string, dateIso: string) => {
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      const cutoff7Iso = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
      setMedications((prev) => {
        const next = prev.map((m) => {
          if (m.id !== id) return m;
          const allTimes =
            m.times24 && m.times24.length > 0 ? m.times24 : m.time24 ? [m.time24] : [];
          const existingDates = Array.isArray(m.takenDates) ? m.takenDates : [];
          const hasDate = existingDates.includes(dateIso) || (dateIso === todayIso && m.takenDateKey === todayIso);
          const nextDates = (
            hasDate
              ? existingDates.filter((d) => d !== dateIso)
              : Array.from(new Set([...existingDates, dateIso]))
          )
            .filter((d) => d >= cutoff7Iso)
            .sort()
            .slice(-7);

          // Properly decrement/increment remainingDoses when toggling any day in the 7-day strip!
          const dosesPerDay = Math.max(1, allTimes.length);
          let nextRemaining = m.remainingDoses;
          if (typeof m.remainingDoses === 'number' && m.remainingDoses >= 0) {
            const maxCap =
              typeof m.totalDoses === 'number' && m.totalDoses > 0
                ? Math.max(m.totalDoses, m.remainingDoses)
                : 500;
            const delta = hasDate ? dosesPerDay : -dosesPerDay;
            nextRemaining = Math.max(0, Math.min(maxCap, m.remainingDoses + delta));
          }

          const updated: MedicationItem = {
            ...m,
            takenDates: nextDates,
            remainingDoses: nextRemaining,
            ...(dateIso === todayIso
              ? {
                  takenDateKey: hasDate ? '' : todayIso,
                  takenDosesToday: hasDate ? [] : allTimes,
                }
              : {}),
          };
          return updated;
        });
        void pushToTasksVaultImmediately({ medications: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
      triggerHapticWaveform('water_cup');
    },
    [activeTimeZone, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleRefillMedication = useCallback(
    (id: string, newDoses: number, refillAlertDays?: number) => {
      const target = medications.find((m) => m.id === id);
      if (!target) return;

      const clampedDoses = Math.max(0, Math.min(500, Math.round(newDoses)));
      const nextAlertDays =
        typeof refillAlertDays === 'number'
          ? Math.max(1, Math.min(14, Math.round(refillAlertDays)))
          : target.refillAlertDays ?? 3;
      const nextTotal = Math.max(clampedDoses, target.totalDoses ?? clampedDoses);
      const updated = sanitizeMedicationItem({
        ...target,
        remainingDoses: clampedDoses,
        totalDoses: nextTotal,
        refillAlertDays: nextAlertDays,
      });

      setMedications((prev) => {
        const next = prev.map((m) => (m.id === id ? updated : m));
        void pushToTasksVaultImmediately({ medications: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });

      showToast(`💊 تم تحديث مخزون «${target.name}» إلى ${clampedDoses} جرعة متبقية ✓`);
    },
    [medications, showToast, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleAddMedication = useCallback(
    (input: {
      name: string;
      time24?: string;
      times24?: string[];
      daysOfWeek?: number[];
      doseNote?: string;
      calendarEventId?: string;
      courseEndDate?: string;
      remainingDoses?: number;
      totalDoses?: number;
      refillAlertDays?: number;
    }) => {
      const cleanTimes =
        input.times24 && input.times24.length > 0
          ? input.times24
          : input.time24
            ? [input.time24]
            : [];
      const rem =
        typeof input.remainingDoses === 'number' && input.remainingDoses >= 0
          ? input.remainingDoses
          : -1;
      const tot =
        typeof input.totalDoses === 'number' && input.totalDoses >= 0
          ? input.totalDoses
          : rem;
      const med = sanitizeMedicationItem({
        id: sanitizeMedicationId(`med_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
        name: input.name,
        time24: cleanTimes[0] ?? '',
        times24: cleanTimes,
        daysOfWeek: input.daysOfWeek ?? [],
        doseNote: input.doseNote ?? '',
        takenDateKey: '',
        takenDosesToday: [],
        takenDates: [],
        calendarEventId: input.calendarEventId ?? '',
        courseEndDate: input.courseEndDate ?? '',
        remainingDoses: rem,
        totalDoses: tot,
        refillAlertDays:
          typeof input.refillAlertDays === 'number'
            ? Math.max(1, Math.min(14, Math.round(input.refillAlertDays)))
            : 3,
      });
      setMedications((prev) => {
        const next = [...prev, med];
        void pushToTasksVaultImmediately({ medications: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
      showToast(`💊 تمت إضافة «${med.name}» إلى قائمة العلاجات والمكملات`);
      return med;
    },
    [showToast, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleDeleteMedication = useCallback(
    (id: string) => {
      setMedications((prev) => {
        const next = prev.filter((m) => m.id !== id);
        void pushToTasksVaultImmediately({ medications: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
      showToast('تم حذف العلاج من القائمة اليومية');
    },
    [showToast, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleExecuteMedicationActions = useCallback(
    async (
      medActions: MedicationActionProposal[],
      linkedCalendarIds?: Record<string, string>
    ): Promise<MedicationExecutionResult[]> => {
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      const results: MedicationExecutionResult[] = [];

      setMedications((prev) => {
        let next = [...prev];
        for (const act of medActions) {
          const op = act.operation;
          const actTimes =
            act.times24 && act.times24.length > 0
              ? act.times24
              : act.time24
                ? [act.time24]
                : undefined;

          if (op === 'remove') {
            const needle = act.name.trim().toLowerCase();
            const target =
              next.find(
                (m) =>
                  (act.medicationId && m.id === act.medicationId) ||
                  m.name.trim().toLowerCase() === needle
              ) ??
              (needle.length >= 2
                ? next.find(
                    (m) =>
                      m.name.trim().toLowerCase().includes(needle) ||
                      needle.includes(m.name.trim().toLowerCase())
                  )
                : undefined);
            if (target) {
              next = next.filter((m) => m.id !== target.id);
              results.push({ name: target.name, operation: 'remove', status: 'removed', id: target.id });
              showToast(`🗑️ تم حذف «${target.name}» من قائمة العلاجات والمكملات`);
            }
          } else if (op === 'mark_taken') {
            const target = next.find(
              (m) =>
                (act.medicationId && m.id === act.medicationId) ||
                m.name.includes(act.name.trim())
            );
            if (target) {
              const allTimes =
                target.times24 && target.times24.length > 0
                  ? target.times24
                  : target.time24
                    ? [target.time24]
                    : [];
              const alreadyTakenToday = target.takenDateKey === todayIso;
              const nextRem =
                !alreadyTakenToday &&
                typeof target.remainingDoses === 'number' &&
                target.remainingDoses > 0
                  ? target.remainingDoses - 1
                  : target.remainingDoses;
              const updated: MedicationItem = {
                ...target,
                takenDateKey: todayIso,
                takenDosesToday: allTimes,
                takenDates: Array.from(new Set([...(target.takenDates ?? []), todayIso]))
                  .sort()
                  .slice(-31),
                remainingDoses: nextRem,
              };
              next = next.map((m) => (m.id === target.id ? updated : m));
              results.push({ name: target.name, operation: 'mark_taken', status: 'taken', id: target.id });
            }
          } else if (op === 'update') {
            const target = next.find(
              (m) =>
                (act.medicationId && m.id === act.medicationId) ||
                m.name.trim() === act.name.trim()
            );
            if (target) {
              const updated = sanitizeMedicationItem({
                ...target,
                name: act.name || target.name,
                time24: actTimes?.[0] ?? act.time24 ?? target.time24,
                times24: actTimes ?? target.times24,
                daysOfWeek: act.daysOfWeek ?? target.daysOfWeek,
                doseNote: act.doseNote ?? target.doseNote,
                courseEndDate: act.courseEndDate ?? target.courseEndDate,
                remainingDoses:
                  typeof act.remainingDoses === 'number'
                    ? act.remainingDoses
                    : target.remainingDoses,
                totalDoses:
                  typeof act.totalDoses === 'number'
                    ? act.totalDoses
                    : target.totalDoses,
                refillAlertDays:
                  typeof act.refillAlertDays === 'number'
                    ? act.refillAlertDays
                    : target.refillAlertDays,
              });
              next = next.map((m) => (m.id === target.id ? updated : m));
              results.push({ name: updated.name, operation: 'update', status: 'updated', id: updated.id });
            }
          } else {
            const existing = next.find((m) => m.name.trim() === act.name.trim());
            const calId = linkedCalendarIds?.[act.name] ?? '';
            if (existing) {
              const updated = sanitizeMedicationItem({
                ...existing,
                time24: actTimes?.[0] ?? act.time24 ?? existing.time24,
                times24: actTimes ?? existing.times24,
                daysOfWeek: act.daysOfWeek ?? existing.daysOfWeek,
                doseNote: act.doseNote ?? existing.doseNote,
                calendarEventId: calId || existing.calendarEventId,
                courseEndDate: act.courseEndDate ?? existing.courseEndDate,
                remainingDoses:
                  typeof act.remainingDoses === 'number'
                    ? act.remainingDoses
                    : existing.remainingDoses,
                totalDoses:
                  typeof act.totalDoses === 'number'
                    ? act.totalDoses
                    : existing.totalDoses,
                refillAlertDays:
                  typeof act.refillAlertDays === 'number'
                    ? act.refillAlertDays
                    : existing.refillAlertDays,
              });
              next = next.map((m) => (m.id === existing.id ? updated : m));
              results.push({ name: updated.name, operation: 'update', status: 'updated', id: updated.id });
            } else {
              const rem =
                typeof act.remainingDoses === 'number' && act.remainingDoses >= 0
                  ? act.remainingDoses
                  : -1;
              const tot =
                typeof act.totalDoses === 'number' && act.totalDoses >= 0
                  ? act.totalDoses
                  : rem;
              const created = sanitizeMedicationItem({
                id: sanitizeMedicationId(
                  act.medicationId || `med_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
                ),
                name: act.name,
                time24: actTimes?.[0] ?? act.time24 ?? '',
                times24: actTimes ?? [],
                daysOfWeek: act.daysOfWeek ?? [],
                doseNote: act.doseNote ?? '',
                takenDateKey: '',
                takenDosesToday: [],
                takenDates: [],
                calendarEventId: calId,
                courseEndDate: act.courseEndDate ?? '',
                remainingDoses: rem,
                totalDoses: tot,
                refillAlertDays:
                  typeof act.refillAlertDays === 'number' ? act.refillAlertDays : 3,
              });
              next = [...next, created];
              results.push({ name: created.name, operation: 'add', status: 'added', id: created.id });
            }
          }
        }
        void pushToTasksVaultImmediately({ medications: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });

      return results;
    },
    [activeTimeZone, showToast, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleAddCreativeActivity = useCallback(
    (input: {
      name: string;
      emoji?: string;
      cadence?: CreativeCadence;
      goalCount?: number;
      weeklyGoalSessions: number;
      sessionMinutes: number;
      expiresOnDate?: string;
    }) => {
      const cadence: CreativeCadence = input.cadence ?? 'weekly';
      const goalCount = input.goalCount ?? input.weeklyGoalSessions;
      const act = sanitizeCreativeActivityItem({
        id: sanitizeCreativeActivityId(
          `cr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        ),
        name: input.name,
        emoji: input.emoji || '🎨',
        cadence,
        goalCount,
        weeklyGoalSessions: Math.min(14, goalCount),
        sessionMinutes: input.sessionMinutes,
        loggedDates: [],
        scheduledTime24: '',
        calendarEventId: '',
        expiresOnDate: input.expiresOnDate ?? '',
      });
      setCreativeActivities((prev) => {
        const next = [...prev, act];
        void pushToTasksVaultImmediately({ creativeActivities: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
      showToast(`${act.emoji} تمت إضافة «${act.name}» وسيُوضع تلقائياً في أوقاتك الفاضية ✓`);
      return act;
    },
    [showToast, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleDeleteCreativeActivity = useCallback(
    (id: string) => {
      setCreativeActivities((prev) => {
        const next = prev.filter((a) => a.id !== id);
        void pushToTasksVaultImmediately({ creativeActivities: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
      showToast('تم حذف النشاط الإبداعي');
    },
    [showToast, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleScheduleCreativeInCalendar = useCallback(
    async (placement: CreativeActivityPlacement) => {
      if (!placement.suggestedSlot) {
        showToast('لا توجد فترة فراغ كافية متبقية اليوم — يمكنك جدولته عبر شات Gemini لغدٍ');
        return;
      }
      const action: CalendarActionProposal = {
        operation: 'create',
        calendarId: 'primary',
        title: `${placement.activity.emoji} ${placement.activity.name}`,
        dateIso: getDateIsoInTimeZone(activeTimeZone),
        startTime24: placement.suggestedSlot.time24,
        durationMinutes: placement.activity.sessionMinutes,
        description: `نشاط إبداعي مجدول في وقت فراغك · الهدف: ${placement.goalInPeriod} جلسات (${placement.periodLabelAr})`,
      };
      const res = await handleExecuteCalendarActions([action]);
      const createdId = res.results[0]?.id ?? '';
      setCreativeActivities((prev) => {
        const next = prev.map((a) => {
          if (a.id !== placement.activity.id) return a;
          const updated: CreativeActivityItem = {
            ...a,
            scheduledTime24: placement.suggestedSlot!.time24,
            calendarEventId: createdId || a.calendarEventId,
          };
          return updated;
        });
        void pushToTasksVaultImmediately({ creativeActivities: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
    },
    [
      activeTimeZone,
      handleExecuteCalendarActions,
      showToast,
      pushToTasksVaultImmediately,
      pushFullCloudBackupImmediately,
    ]
  );

  const handleExecuteCreativeActions = useCallback(
    async (
      creativeActions: CreativeActivityActionProposal[],
      linkedCalendarIds?: Record<string, string>
    ): Promise<CreativeExecutionResult[]> => {
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      const results: CreativeExecutionResult[] = [];

      setCreativeActivities((prev) => {
        let next = [...prev];
        for (const act of creativeActions) {
          const op = act.operation;
          if (op === 'remove') {
            const target = next.find(
              (a) =>
                (act.activityId && a.id === act.activityId) ||
                a.name.trim() === act.name.trim()
            );
            if (target) {
              next = next.filter((a) => a.id !== target.id);
              results.push({ name: target.name, operation: 'remove', status: 'removed', id: target.id });
            }
          } else if (op === 'log_session' || op === 'log_today') {
            const target = next.find(
              (a) =>
                (act.activityId && a.id === act.activityId) ||
                a.name.includes(act.name.trim())
            );
            if (target) {
              const nextDates = target.loggedDates.includes(todayIso)
                ? target.loggedDates
                : [...target.loggedDates, todayIso].slice(-30);
              const updated: CreativeActivityItem = { ...target, loggedDates: nextDates };
              next = next.map((a) => (a.id === target.id ? updated : a));
              results.push({ name: target.name, operation: 'log_session', status: 'logged', id: target.id });
            }
          } else {
            const existing = next.find(
              (a) =>
                (act.activityId && a.id === act.activityId) ||
                a.name.trim() === act.name.trim()
            );
            const calId = linkedCalendarIds?.[act.name] ?? '';
            if (existing) {
              const nextCadence = act.cadence ?? existing.cadence ?? 'weekly';
              const nextGoal =
                act.goalCount ?? act.weeklyGoalSessions ?? existing.goalCount ?? existing.weeklyGoalSessions;
              const updated = sanitizeCreativeActivityItem({
                ...existing,
                name: act.name || existing.name,
                emoji: act.emoji ?? existing.emoji,
                cadence: nextCadence,
                goalCount: nextGoal,
                weeklyGoalSessions: Math.min(14, nextGoal),
                sessionMinutes: act.sessionMinutes ?? existing.sessionMinutes,
                scheduledTime24: act.scheduledTime24 ?? existing.scheduledTime24,
                calendarEventId: calId || existing.calendarEventId,
                expiresOnDate: act.expiresOnDate ?? existing.expiresOnDate,
              });
              next = next.map((a) => (a.id === existing.id ? updated : a));
              results.push({ name: updated.name, operation: 'update', status: 'updated', id: updated.id });
            } else {
              const nextCadence: CreativeCadence = act.cadence ?? 'weekly';
              const nextGoal =
                act.goalCount ??
                act.weeklyGoalSessions ??
                (nextCadence === 'daily' ? 1 : nextCadence === 'monthly' ? 8 : 3);
              const created = sanitizeCreativeActivityItem({
                id: sanitizeCreativeActivityId(
                  act.activityId || `cr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
                ),
                name: act.name,
                emoji: act.emoji ?? '🎨',
                cadence: nextCadence,
                goalCount: nextGoal,
                weeklyGoalSessions: Math.min(14, nextGoal),
                sessionMinutes: act.sessionMinutes ?? 30,
                loggedDates: [],
                scheduledTime24: act.scheduledTime24 ?? '',
                calendarEventId: calId,
                expiresOnDate: act.expiresOnDate ?? '',
              });
              next = [...next, created];
              results.push({ name: created.name, operation: 'add', status: 'added', id: created.id });
            }
          }
        }
        void pushToTasksVaultImmediately({ creativeActivities: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });

      return results;
    },
    [activeTimeZone, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleToggleDailyCommitmentStreak = () => {
    localWriteLockUntilRef.current = Date.now() + 5000;

    setStreaks((s) => {
      const nextDone = !s.dailyCommitmentDoneToday;
      const nextDays = nextDone
        ? s.dailyCommitmentDays + 1
        : Math.max(0, s.dailyCommitmentDays - 1);
      const nextStreaks = {
        ...s,
        dailyCommitmentDoneToday: nextDone,
        dailyCommitmentDays: nextDays,
      };

      void pushToTasksVaultImmediately({
        dailyCommitmentDays: nextDays,
        dailyCommitmentDoneToday: nextDone,
        waterTargetDays: s.waterTargetDays,
        waterTargetDoneToday: s.waterTargetDoneToday,
      });

      void pushFullCloudBackupImmediately();

      return nextStreaks;
    });
  };

  // Next untaken medication dose for today (used by Floating Capsule 1-tap Check-In & Windows Tray Capsule)
  const nextMedicationQuick = useMemo(() => {
    const todayW = getWeekdayInTimeZone(activeTimeZone);
    const candidates: Array<{
      id: string;
      name: string;
      doseTime24?: string;
      timeLabel?: string;
      sortMin: number;
    }> = [];
    for (const med of medications) {
      if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(todayW)) {
        continue;
      }
      const times =
        med.times24 && med.times24.length > 0 ? med.times24 : med.time24 ? [med.time24] : [];
      const takenDoses = med.takenDateKey === todayCairoIso ? med.takenDosesToday ?? [] : [];
      if (times.length === 0) {
        if (med.takenDateKey !== todayCairoIso) {
          candidates.push({ id: med.id, name: med.name, sortMin: 24 * 60 + 1 });
        }
        continue;
      }
      for (const t24 of times) {
        const alreadyTaken =
          times.length > 1 ? takenDoses.includes(t24) : med.takenDateKey === todayCairoIso;
        if (alreadyTaken) continue;
        const m = t24.match(/^(\d{1,2}):(\d{2})$/);
        const min = m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60;
        candidates.push({
          id: med.id,
          name: med.name,
          doseTime24: times.length > 1 ? t24 : undefined,
          timeLabel: m ? formatMinutes12h(min, 'ar') : undefined,
          sortMin: min,
        });
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.sortMin - b.sortMin);
    const upcoming = candidates.find((c) => c.sortMin >= nowTickMin - 15) ?? candidates[0];
    return {
      id: upcoming.id,
      name: upcoming.name,
      doseTime24: upcoming.doseTime24,
      timeLabel: upcoming.timeLabel,
    };
  }, [activeTimeZone, medications, nowTickMin, todayCairoIso]);

  // Feature #4: One-Click Full JSON Backup Export & Restore (zero OAuth tokens or secrets!)
  const handleExportBackupJson = useCallback(() => {
    const todayIso = getDateIsoInTimeZone(activeTimeZone);
    const payload = {
      app: 'DayRhythm',
      version: 1,
      exportedAtIso: new Date().toISOString(),
      lifeProfile,
      medications,
      memories,
      creativeActivities,
      hydrationHistory,
      streaks,
      deviceSettings,
      uiPrefs: sanitizeUiPrefs({
        selectedLogoId,
        capsuleOrientation: capsulePrefs.orientation,
        capsuleSize: capsulePrefs.size,
      }),
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dayrhythm-backup-${todayIso}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`💾 تم تنزيل النسخة الاحتياطية الكاملة (dayrhythm-backup-${todayIso}.json) ✓`);
    } catch {
      showToast('تعذر تنزيل ملف النسخة الاحتياطية — حاول مرة أخرى');
    }
  }, [
    activeTimeZone,
    capsulePrefs.orientation,
    capsulePrefs.size,
    creativeActivities,
    deviceSettings,
    hydrationHistory,
    lifeProfile,
    medications,
    memories,
    selectedLogoId,
    showToast,
    streaks,
  ]);

  const handleImportBackupJson = useCallback(
    async (rawText: string): Promise<{ ok: boolean; summaryAr: string }> => {
      try {
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        if (!parsed || parsed.app !== 'DayRhythm') {
          return {
            ok: false,
            summaryAr: 'الملف غير صالح — تأكد أنه ملف نسخة احتياطية مُصدّر من «إيقاع اليوم».',
          };
        }

        const nextProfile = parsed.lifeProfile
          ? sanitizeLifeProfile(parsed.lifeProfile as Partial<LifeProfile>)
          : lifeProfile;
        const nextDevice = parsed.deviceSettings
          ? sanitizeDeviceSettings(parsed.deviceSettings as Partial<OnePlusDeviceSettings>)
          : deviceSettings;
        const nextMeds = Array.isArray(parsed.medications)
          ? parsed.medications.map((m) => sanitizeMedicationItem(m as Partial<MedicationItem>))
          : medications;
        const nextMems = Array.isArray(parsed.memories)
          ? parsed.memories.map((m) => sanitizeMemoryItem(m as Partial<MemoryItem>))
          : memories;
        const nextCreative = Array.isArray(parsed.creativeActivities)
          ? parsed.creativeActivities.map((a) =>
              sanitizeCreativeActivityItem(a as Partial<CreativeActivityItem>)
            )
          : creativeActivities;
        const nextUi: UiPrefs =
          (parsed.uiPrefs ? sanitizeUiPrefs(parsed.uiPrefs as Partial<UiPrefs>) : undefined) ?? {
            selectedLogoId,
            capsuleOrientation: capsulePrefs.orientation,
            capsuleSize: capsulePrefs.size,
          };
        const nextStreaks: DualStreaks =
          parsed.streaks && typeof parsed.streaks === 'object'
            ? {
                dailyCommitmentDays: Math.max(
                  0,
                  Math.min(3650, Number((parsed.streaks as Partial<DualStreaks>).dailyCommitmentDays) || 0)
                ),
                dailyCommitmentDoneToday: Boolean(
                  (parsed.streaks as Partial<DualStreaks>).dailyCommitmentDoneToday
                ),
                waterTargetDays: Math.max(
                  0,
                  Math.min(3650, Number((parsed.streaks as Partial<DualStreaks>).waterTargetDays) || 0)
                ),
                waterTargetDoneToday: Boolean(
                  (parsed.streaks as Partial<DualStreaks>).waterTargetDoneToday
                ),
              }
            : streaks;
        const restoreTz = nextProfile.currentTimeZone || activeTimeZone;
        const nextHydration =
          Array.isArray(parsed.hydrationHistory) && parsed.hydrationHistory.length === 7
            ? rollOverHydrationHistoryIfNeeded(
                parsed.hydrationHistory as HydrationDayLog[],
                targetCups,
                restoreTz
              )
            : hydrationHistory;

        localWriteLockUntilRef.current = Date.now() + 5000;
        setLifeProfile(nextProfile);
        setDeviceSettings(nextDevice);
        setMedications(nextMeds);
        setMemories(nextMems);
        setCreativeActivities(nextCreative);
        setStreaks(nextStreaks);
        setHydrationHistory(nextHydration);
        setSelectedLogoId(nextUi.selectedLogoId);
        setCapsulePrefs({
          orientation: nextUi.capsuleOrientation,
          size: nextUi.capsuleSize,
        });

        try {
          window.localStorage.setItem(SELECTED_LOGO_STORAGE_KEY, nextUi.selectedLogoId);
          window.localStorage.setItem(
            CAPSULE_PREFS_STORAGE_KEY,
            JSON.stringify({
              orientation: nextUi.capsuleOrientation,
              size: nextUi.capsuleSize,
            })
          );
        } catch {
          // ignore storage errors
        }

        const todayEntry = nextHydration[nextHydration.length - 1];
        void pushToTasksVaultImmediately({
          hydrationDateKey: getDateIsoInTimeZone(restoreTz),
          cupsLogged: todayEntry?.cupsLogged ?? 0,
          targetCups: todayEntry?.targetCups ?? targetCups,
          hydrationWeeklyCounts: nextHydration.map((d) => d.cupsLogged),
          dailyCommitmentDays: nextStreaks.dailyCommitmentDays,
          dailyCommitmentDoneToday: nextStreaks.dailyCommitmentDoneToday,
          waterTargetDays: nextStreaks.waterTargetDays,
          waterTargetDoneToday: nextStreaks.waterTargetDoneToday,
          quietMode,
          adhanOverrideSilent,
          surfaceTheme,
          deviceSettings: nextDevice,
          lifeProfile: nextProfile,
          medications: nextMeds,
          creativeActivities: nextCreative,
          memories: nextMems,
          uiPrefs: nextUi,
        });
        void pushFullCloudBackupImmediately();

        const summaryAr = `تم استرجاع النسخة الاحتياطية بنجاح ✓ (${nextMeds.length} علاج · ${nextMems.length} قاعدة ذاكرة · ${nextCreative.length} نشاط إبداعي)`;
        showToast(summaryAr);
        return { ok: true, summaryAr };
      } catch {
        return {
          ok: false,
          summaryAr: 'تعذر قراءة ملف JSON — تأكد أن الملف سليم وغير تالف.',
        };
      }
    },
    [
      activeTimeZone,
      adhanOverrideSilent,
      capsulePrefs.orientation,
      capsulePrefs.size,
      creativeActivities,
      deviceSettings,
      firebaseUser?.emailVerified,
      firebaseUser?.uid,
      firestoreSynced,
      hydrationHistory,
      lifeProfile,
      medications,
      memories,
      quietMode,
      selectedLogoId,
      showToast,
      streaks,
      surfaceTheme,
      targetCups,
    ]
  );

  // Confirm hydration, medication, snooze & Android background quick actions (Windows Screen 2, Android Notifications, Desktop Capsule)
  useEffect(() => {
    const processAndroidQuickActions = (rawJson?: string | null) => {
      if (!rawJson || rawJson === '[]') return;
      try {
        const items = JSON.parse(rawJson) as Array<{
          kind?: string;
          medicationId?: string;
          doseTime24?: string;
        }>;
        if (!Array.isArray(items) || items.length === 0) return;
        for (const item of items) {
          if (item.kind === 'water') {
            handleLogWaterCup();
          } else if (item.kind === 'medication' && item.medicationId) {
            handleToggleMedication(item.medicationId, item.doseTime24 || undefined);
          }
        }
        stopContinuousAlert();
        setActiveAudioAlert(null);
        setPersistentAlert(null);
        setAlarmRinging(false);
        emitCrossDeviceSync('alarm_dismiss', 'native_action');
        showToast(`✓ تمت مزامنة ${items.length} إجراء وإيقاف التنبيه على أجهزتك`);
      } catch {
        // ignore malformed Android action queue
      }
    };

    const flushAndroidPendingActions = () => {
      const androidBridge = (
        window as Window & {
          DayRhythmNative?: { consumePendingNativeActions?: () => string };
        }
      ).DayRhythmNative;
      if (androidBridge?.consumePendingNativeActions) {
        try {
          processAndroidQuickActions(androidBridge.consumePendingNativeActions());
        } catch {
          // ignore Android bridge errors
        }
      }
    };

    flushAndroidPendingActions();

    const onWaterConfirmed = () => {
      handleLogWaterCup();
      stopContinuousAlert();
      stopNativeAlerts();
      setActiveAudioAlert(null);
      setPersistentAlert(null);
      setAlarmRinging(false);
      emitCrossDeviceSync('alarm_dismiss', 'water_confirmed');
    };
    const onMedicationConfirmed = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{ medicationId?: string; doseTime24?: string }>
      ).detail;
      if (detail?.medicationId) {
        handleToggleMedication(detail.medicationId, detail.doseTime24 || undefined);
      }
      stopContinuousAlert();
      stopNativeAlerts();
      setActiveAudioAlert(null);
      setPersistentAlert(null);
      setAlarmRinging(false);
      emitCrossDeviceSync('alarm_dismiss', 'med_confirmed');
    };
    const onQuickMedConfirm = () => {
      if (nextMedicationQuick) {
        handleToggleMedication(nextMedicationQuick.id, nextMedicationQuick.doseTime24);
      } else {
        showToast('✓ لا توجد جرعات علاج متبقية اليوم');
      }
    };
    const onAlertSnoozed = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          id?: string;
          emoji?: string;
          title?: string;
          sourceLabel?: string;
          category?: TaskSoundCategory;
          isHydration?: boolean;
          medicationId?: string;
          medicationDoseTime24?: string;
          minutes?: number;
        }>
      ).detail;
      const alertItem: PersistentAlertItem = {
        id: detail?.id || `snooze_${Date.now()}`,
        emoji: detail?.emoji || '🔔',
        title: detail?.title || 'تذكير مؤجّل',
        sourceLabel: detail?.sourceLabel || 'إيقاع اليوم',
        time12h: formatNow12hInTimeZone(activeTimeZone, 'ar'),
        category: detail?.category || 'general',
        createdAtMs: Date.now(),
        durationMs: 300_000,
        isHydration: Boolean(detail?.isHydration),
        medicationId: detail?.medicationId || undefined,
        medicationDoseTime24: detail?.medicationDoseTime24 || undefined,
      };
      handleSnoozeAlert(alertItem, detail?.minutes || 15);
    };
    const onNativeQuickActions = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (typeof detail === 'string') {
        processAndroidQuickActions(detail);
      } else {
        flushAndroidPendingActions();
      }
    };
    const onAlertDismissed = () => {
      handleAcknowledgeAudioAlert();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') flushAndroidPendingActions();
    };

    window.addEventListener('dayrhythm:water-confirmed', onWaterConfirmed);
    window.addEventListener('dayrhythm:medication-confirmed', onMedicationConfirmed);
    window.addEventListener('dayrhythm:quick-med-confirm', onQuickMedConfirm);
    window.addEventListener('dayrhythm:alert-snoozed', onAlertSnoozed);
    window.addEventListener('dayrhythm:native-quick-actions', onNativeQuickActions);
    window.addEventListener('dayrhythm:alert-dismissed', onAlertDismissed);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('dayrhythm:water-confirmed', onWaterConfirmed);
      window.removeEventListener('dayrhythm:medication-confirmed', onMedicationConfirmed);
      window.removeEventListener('dayrhythm:quick-med-confirm', onQuickMedConfirm);
      window.removeEventListener('dayrhythm:alert-snoozed', onAlertSnoozed);
      window.removeEventListener('dayrhythm:native-quick-actions', onNativeQuickActions);
      window.removeEventListener('dayrhythm:alert-dismissed', onAlertDismissed);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [
    activeTimeZone,
    emitCrossDeviceSync,
    handleAcknowledgeAudioAlert,
    handleLogWaterCup,
    handleSnoozeAlert,
    handleToggleMedication,
    nextMedicationQuick,
    showToast,
    stopNativeAlerts,
  ]);

  const [capsuleNowMs, setCapsuleNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const syncNow = () => setCapsuleNowMs(Date.now());
    const timer = window.setInterval(syncNow, 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncNow();
    };
    window.addEventListener('focus', syncNow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', syncNow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Show "الورد والالتزام اليومي" ONLY when signed in AND user actually has that habit in their account
  const hasDailyWirdHabit = useMemo(() => {
    if (needsAuth || !firebaseUser?.uid || firebaseUser.isAnonymous) return false;
    if (streaks.dailyCommitmentDays > 0 || streaks.dailyCommitmentDoneToday) return true;
    const wirdRe = /(ورد|الورد|قرآن|قران|أذكار|اذكار|تلاوة|الالتزام اليومي|🌱)/i;
    if (calendarEvents.some((e) => wirdRe.test(`${e.summary ?? ''} ${e.description ?? ''}`))) return true;
    if (googleTasks.some((tk) => wirdRe.test(`${tk.title ?? ''} ${tk.notes ?? ''}`))) return true;
    if (creativeActivities.some((a) => wirdRe.test(`${a.name} ${a.emoji}`))) return true;
    if (memories.some((m) => wirdRe.test(m.ruleText))) return true;
    return false;
  }, [
    needsAuth,
    firebaseUser?.uid,
    firebaseUser?.isAnonymous,
    streaks.dailyCommitmentDays,
    streaks.dailyCommitmentDoneToday,
    calendarEvents,
    googleTasks,
    creativeActivities,
    memories,
  ]);

  const nextActiveBlock = useMemo(() => {
    if (needsAuth && !useOfflineDemo) return null;
    const nowMin = getNowMinutesInTimeZone(activeTimeZone, new Date(capsuleNowMs));
    return (
      liveBlocks.find(
        (b) =>
          !b.completed &&
          !b.deleted &&
          (b.isAllDay || b.startMin + b.durationMin > nowMin)
      ) ?? null
    );
  }, [needsAuth, useOfflineDemo, liveBlocks, activeTimeZone, capsuleNowMs]);

  const capsuleTimerState = useMemo(() => {
    const display = resolveBlockDisplayInfo(nextActiveBlock);
    const fallbackEmoji = (nextActiveBlock?.emojiPair || '✅').split(' ')[0] || '📅';

    if (needsAuth && !useOfflineDemo) {
      return {
        emoji: '🔐',
        title: 'سجّل الدخول بحساب Google',
        statusLabel: 'بانتظار الربط السحابي',
        sourceKind: 'none' as const,
        countdownText: '00:00',
        isNow: false,
        isUrgent: false,
        progressRatio: 0,
        targetEpochMs: 0,
        durationSeconds: 0,
        calendarTrack: null as CapsuleTrackInfo | null,
        taskTrack: null as CapsuleTrackInfo | null,
        upcomingQueue: [] as CapsuleTrackInfo[],
      };
    }

    if (simulateUnder60s) {
      const targetMs = capsuleNowMs + liveCountdownSec * 1000;
      const simTrack: CapsuleTrackInfo = {
        emoji: fallbackEmoji,
        title: nextActiveBlock ? display.title : 'المهمة القادمة',
        statusLabel: 'أقل من دقيقة',
        countdownText: `00:${String(liveCountdownSec).padStart(2, '0')}`,
        isNow: false,
        isUrgent: true,
        targetEpochMs: targetMs,
        durationSeconds: 60,
      };
      return {
        emoji: fallbackEmoji,
        title: nextActiveBlock ? display.title : 'المهمة القادمة',
        statusLabel: 'أقل من دقيقة',
        sourceKind: (nextActiveBlock ? 'calendar' : 'none') as
          | 'calendar'
          | 'task'
          | 'water'
          | 'medication'
          | 'none',
        countdownText: `00:${String(liveCountdownSec).padStart(2, '0')}`,
        isNow: false,
        isUrgent: true,
        progressRatio: 0,
        targetEpochMs: targetMs,
        durationSeconds: 60,
        calendarTrack: simTrack,
        taskTrack: null as CapsuleTrackInfo | null,
        upcomingQueue: [simTrack] as CapsuleTrackInfo[],
      };
    }

    // Active user timezone wall-clock seconds since midnight for smooth 1-second dual countdown
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: activeTimeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(capsuleNowMs));
    const hhRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const hh = hhRaw === 24 ? 0 : hhRaw;
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const ss = Number(parts.find((p) => p.type === 'second')?.value ?? '0');
    const nowSecOfDay = hh * 3600 + mm * 60 + ss;

    interface UnifiedCapsuleCandidate {
      sourceKind: 'calendar' | 'water' | 'medication' | 'task';
      emoji: string;
      title: string;
      clockLabel: string;
      startSec: number;
      endSec: number;
      targetSec: number;
      isNow: boolean;
      durationSec: number;
    }

    const candidates: UnifiedCapsuleCandidate[] = [];

    // 1. Remaining / active timed Google Calendar & Prayer blocks today
    for (const block of liveBlocks) {
      if (block.completed || block.deleted || block.isAllDay) continue;
      const startSec = block.startMin * 60;
      const durationSec = Math.max(60, block.durationMin * 60);
      const endSec = startSec + durationSec;
      if (endSec <= nowSecOfDay) continue;
      const isNow = nowSecOfDay >= startSec && nowSecOfDay < endSec;
      const bDisplay = resolveBlockDisplayInfo(block);
      candidates.push({
        sourceKind: 'calendar',
        emoji: (block.emojiPair || '📅').split(' ')[0] || '📅',
        title: bDisplay.title,
        clockLabel: formatMinutes12h(block.startMin, 'ar'),
        startSec,
        endSec,
        targetSec: isNow ? endSec : startSec,
        isNow,
        durationSec,
      });
    }

    // 2. Next Upcoming Water Cup from today's scientific hydration schedule (shows exact cup # & time!)
    const hydrationTodayEntry = hydrationHistory[hydrationHistory.length - 1];
    if (hydrationTodayEntry && dailyRhythmPlan.hydrationSlots.length > 0) {
      const nextUpcomingCup = dailyRhythmPlan.hydrationSlots.find(
        (slot, idx) => !hydrationTodayEntry.slots[idx] && slot.timeMinutes * 60 + 5 * 60 > nowSecOfDay
      );
      const nextDueNowCup = !nextUpcomingCup
        ? dailyRhythmPlan.hydrationSlots.find((_, idx) => !hydrationTodayEntry.slots[idx])
        : null;
      const waterSlot = nextUpcomingCup ?? nextDueNowCup;
      if (waterSlot) {
        const startSec = waterSlot.timeMinutes * 60;
        const durationSec = 5 * 60;
        const endSec = startSec + durationSec;
        const isNow = nowSecOfDay >= startSec;
        candidates.push({
          sourceKind: 'water',
          emoji: '💧',
          title: `كوب ماء ${waterSlot.cupIndex}`,
          clockLabel: formatMinutes12h(waterSlot.timeMinutes, 'ar'),
          startSec,
          endSec: isNow ? nowSecOfDay : endSec,
          targetSec: isNow ? nowSecOfDay : startSec,
          isNow,
          durationSec,
        });
      }
    }

    // 3. Upcoming Medication & Supplement doses for today (not yet taken)
    const todayWeekday = getWeekdayInTimeZone(activeTimeZone);
    for (const med of medications) {
      if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(todayWeekday)) {
        continue;
      }
      const times =
        med.times24 && med.times24.length > 0
          ? med.times24
          : med.time24
            ? [med.time24]
            : [];
      const takenDoses = med.takenDateKey === todayCairoIso ? med.takenDosesToday ?? [] : [];
      for (const t24 of times) {
        const match = t24.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) continue;
        const alreadyTaken =
          times.length > 1 ? takenDoses.includes(t24) : med.takenDateKey === todayCairoIso;
        if (alreadyTaken) continue;
        const medMin = Number(match[1]) * 60 + Number(match[2]);
        const startSec = medMin * 60;
        const durationSec = 10 * 60;
        const endSec = startSec + durationSec;
        if (endSec <= nowSecOfDay) continue;
        const isNow = nowSecOfDay >= startSec && nowSecOfDay < endSec;
        candidates.push({
          sourceKind: 'medication',
          emoji: '💊',
          title: med.name,
          clockLabel: formatMinutes12h(medMin, 'ar'),
          startSec,
          endSec,
          targetSec: isNow ? endSec : startSec,
          isNow,
          durationSec,
        });
      }
    }

    // 4. Active / upcoming Google Tasks for today (with explicit time competing directly by nearest timestamp!)
    let untimedTaskFallback: GoogleTaskItem | null = null;
    for (const tk of googleTasks) {
      const info = extractTaskTimeMinutesForToday(tk, todayCairoIso, activeTimeZone);
      if (!info) continue;
      if (!info.hasExplicitTime) {
        if (!untimedTaskFallback) untimedTaskFallback = tk;
        continue;
      }
      const startSec = info.startMin * 60;
      const durationSec = 15 * 60;
      const endSec = startSec + durationSec;
      if (endSec <= nowSecOfDay) continue;
      const isNow = nowSecOfDay >= startSec && nowSecOfDay < endSec;
      const cleanTitle = cleanCalendarText(tk.title) || 'مهمة';
      candidates.push({
        sourceKind: 'task',
        emoji: '☑️',
        title: cleanTitle,
        clockLabel: formatMinutes12h(info.startMin, 'ar'),
        startSec,
        endSec,
        targetSec: isNow ? endSec : startSec,
        isNow,
        durationSec,
      });
    }

    candidates.sort((a, b) => a.targetSec - b.targetSec);

    const buildTrack = (c: UnifiedCapsuleCandidate): CapsuleTrackInfo => {
      const remSec = Math.max(0, c.targetSec - nowSecOfDay);
      const h = Math.floor(remSec / 3600);
      const m = Math.floor((remSec % 3600) / 60);
      const s = remSec % 60;
      const countdownText =
        c.sourceKind === 'water' && c.isNow && remSec === 0
          ? 'الآن'
          : h > 0
            ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      const statusLabel =
        c.sourceKind === 'water'
          ? c.isNow
            ? 'موعد شرب الماء الآن'
            : `الكوب القادم · ${c.clockLabel}`
          : c.sourceKind === 'medication'
            ? c.isNow
              ? 'موعد الجرعة الآن'
              : `جرعة قادمة · ${c.clockLabel}`
            : c.sourceKind === 'task'
              ? c.isNow
                ? 'مهمة الآن'
                : `مهمة · ${c.clockLabel}`
              : c.isNow
                ? 'جارٍ الآن'
                : `موعد · ${c.clockLabel}`;
      return {
        emoji: c.emoji,
        title: c.title,
        statusLabel,
        clockLabel: c.clockLabel,
        countdownText,
        isNow: c.isNow,
        isUrgent: remSec > 0 && remSec <= 60,
        targetEpochMs: remSec > 0 ? capsuleNowMs + remSec * 1000 : 0,
        durationSeconds: c.durationSec,
      };
    };

    const nearestCalendar = candidates.find((c) => c.sourceKind === 'calendar') ?? null;
    // Secondary track highlights the nearest upcoming non-calendar rhythm item (Water Cup / Medication / Timed Task)
    const nearestRhythmOrTask =
      candidates.find((c) => c.sourceKind !== 'calendar') ?? null;

    const calendarTrack: CapsuleTrackInfo | null = nearestCalendar
      ? buildTrack(nearestCalendar)
      : nextActiveBlock?.isAllDay
        ? {
            emoji: fallbackEmoji,
            title: display.title,
            statusLabel: 'طوال اليوم',
            countdownText: 'اليوم',
            isNow: true,
            isUrgent: false,
            targetEpochMs: 0,
            durationSeconds: 0,
          }
        : null;

    const taskTrack: CapsuleTrackInfo | null = nearestRhythmOrTask
      ? buildTrack(nearestRhythmOrTask)
      : untimedTaskFallback
        ? {
            emoji: '☑️',
            title: cleanCalendarText(untimedTaskFallback.title) || 'مهمة اليوم',
            statusLabel: 'مهام اليوم',
            countdownText: 'اليوم',
            isNow: false,
            isUrgent: false,
            targetEpochMs: 0,
            durationSeconds: 0,
          }
        : null;

    const upcomingQueue: CapsuleTrackInfo[] = candidates.slice(0, 4).map(buildTrack);
    if (upcomingQueue.length < 4 && untimedTaskFallback) {
      upcomingQueue.push({
        emoji: '☑️',
        title: cleanCalendarText(untimedTaskFallback.title) || 'مهمة اليوم',
        statusLabel: 'مهام اليوم',
        countdownText: 'اليوم',
        isNow: false,
        isUrgent: false,
        targetEpochMs: 0,
        durationSeconds: 0,
      });
    }

    const winner = candidates[0];

    if (winner) {
      const winnerTrack = buildTrack(winner);
      const remainingSec = Math.max(0, winner.targetSec - nowSecOfDay);
      const progressRatio = winner.isNow
        ? Math.min(1, Math.max(0, (nowSecOfDay - winner.startSec) / winner.durationSec))
        : 0;

      return {
        emoji: winnerTrack.emoji,
        title: winnerTrack.title,
        statusLabel: winnerTrack.statusLabel,
        sourceKind: winner.sourceKind,
        countdownText: winnerTrack.countdownText,
        isNow: winnerTrack.isNow,
        isUrgent: winnerTrack.isUrgent,
        progressRatio,
        targetEpochMs: remainingSec > 0 ? capsuleNowMs + remainingSec * 1000 : 0,
        durationSeconds: winner.durationSec,
        calendarTrack,
        taskTrack,
        upcomingQueue,
      };
    }

    if (nextActiveBlock?.isAllDay) {
      return {
        emoji: fallbackEmoji,
        title: display.title,
        statusLabel: 'طوال اليوم',
        sourceKind: 'calendar' as const,
        countdownText: 'اليوم',
        isNow: true,
        isUrgent: false,
        progressRatio: 0,
        targetEpochMs: 0,
        durationSeconds: 0,
        calendarTrack,
        taskTrack,
        upcomingQueue,
      };
    }

    if (untimedTaskFallback) {
      return {
        emoji: '☑️',
        title: cleanCalendarText(untimedTaskFallback.title) || 'مهمة اليوم',
        statusLabel: 'مهمة اليوم',
        sourceKind: 'task' as const,
        countdownText: 'اليوم',
        isNow: false,
        isUrgent: false,
        progressRatio: 0,
        targetEpochMs: 0,
        durationSeconds: 0,
        calendarTrack,
        taskTrack,
        upcomingQueue,
      };
    }

    return {
      emoji: '✅',
      title: 'أنجزت مهام اليوم',
      statusLabel: 'يوم هادئ ومكتمل',
      sourceKind: 'none' as const,
      countdownText: '✓',
      isNow: false,
      isUrgent: false,
      progressRatio: 0,
      targetEpochMs: 0,
      durationSeconds: 0,
      calendarTrack: null as CapsuleTrackInfo | null,
      taskTrack: null as CapsuleTrackInfo | null,
      upcomingQueue: [] as CapsuleTrackInfo[],
    };
  }, [
    needsAuth,
    useOfflineDemo,
    activeTimeZone,
    liveBlocks,
    hydrationHistory,
    dailyRhythmPlan.hydrationSlots,
    medications,
    googleTasks,
    todayCairoIso,
    nextActiveBlock,
    simulateUnder60s,
    liveCountdownSec,
    capsuleNowMs,
  ]);

  // Push live countdown + Dynamic Island (OnePlus 12R Live Alerts, 5/10m lead) + persistent countdown notification to Android
  useEffect(() => {
    const androidBridge = (
      window as Window & {
        DayRhythmNative?: {
          updateLiveStatus?: (payloadJson: string) => void;
          updateCapsule?: (emoji: string, title: string, countdown: string, sourceLabel: string) => void;
        };
      }
    ).DayRhythmNative;
    if (!androidBridge) return;
    try {
      if (androidBridge.updateLiveStatus) {
        androidBridge.updateLiveStatus(
          JSON.stringify({
            emoji: capsuleTimerState.emoji,
            title: capsuleTimerState.title,
            countdown: capsuleTimerState.countdownText,
            statusLabel: capsuleTimerState.statusLabel,
            targetEpochMs: capsuleTimerState.targetEpochMs || 0,
            liveAlertsEnabled: deviceSettings.liveAlertsEnabled,
            liveAlertsLeadMinutes: deviceSettings.liveAlertsLeadMinutes,
            persistentCountdownNotif: deviceSettings.persistentCountdownNotif ?? true,
          })
        );
      } else if (androidBridge.updateCapsule) {
        androidBridge.updateCapsule(
          capsuleTimerState.emoji,
          capsuleTimerState.title,
          capsuleTimerState.countdownText,
          capsuleTimerState.statusLabel
        );
      }
    } catch {
      // ignore Android bridge errors
    }
  }, [
    capsuleTimerState.emoji,
    capsuleTimerState.title,
    capsuleTimerState.countdownText,
    capsuleTimerState.statusLabel,
    capsuleTimerState.targetEpochMs,
    deviceSettings.liveAlertsEnabled,
    deviceSettings.liveAlertsLeadMinutes,
    deviceSettings.persistentCountdownNotif,
  ]);

  // Schedule Native Android Exact Alarms (AlarmManager) for Prayers, Water, Medications, Calendar Events & Timed Tasks
  useEffect(() => {
    const androidBridge = (
      window as Window & {
        DayRhythmNative?: {
          scheduleExactAlarms?: (alarmsJson: string) => void;
        };
      }
    ).DayRhythmNative;
    if (!androidBridge?.scheduleExactAlarms || needsAuth) return;

    const nowMs = trueNowMs();
    const nowMinInTz = getNowMinutesInTimeZone(activeTimeZone, new Date(nowMs));
    // Anchor on the start of the current minute. `nowMs + (target - nowMin) * 60s` kept the
    // current seconds: scheduling at 10:04:45 made a 10:10 reminder ring at 10:10:45, so the phone
    // rang a random 0–59 s after the PC (which fires on the minute).
    const minuteStartMs = nowMs - (nowMs % 60_000);
    const msForMinuteToday = (targetMin: number) => minuteStartMs + (targetMin - nowMinInTz) * 60_000;
    const todayW = getWeekdayInTimeZone(activeTimeZone);

    const snoozeMinutes =
      lifeProfile.defaultSnoozeMinutes === 10 || lifeProfile.defaultSnoozeMinutes === 15
        ? lifeProfile.defaultSnoozeMinutes
        : 5;

    const alarms: Array<{
      id: string;
      kind: 'prayer' | 'water' | 'medication' | 'event' | 'task';
      title: string;
      body: string;
      triggerAtMs: number;
      snoozeMinutes: number;
      medicationId?: string;
      doseTime24?: string;
    }> = [];

    // 1. Obligatory Prayers (-adhanLeadMinutes)
    if (includePrayerAnchors) {
      for (const p of prayers) {
        if (!p.isObligatory) continue;
        const triggerAtMs = msForMinuteToday(p.alarmMinutes);
        if (triggerAtMs > nowMs + 1_000) {
          alarms.push({
            id: `prayer_${todayCairoIso}_${p.id}`,
            kind: 'prayer',
            title: `${p.emojiPair} ${p.nameAr}`,
            body: `متبقي ${lifeProfile.adhanLeadMinutes} د على أذان ${p.nameAr} (${formatMinutes12h(p.adhanMinutes, 'ar')})`,
            triggerAtMs,
            snoozeMinutes,
          });
        }
      }
    }

    // 2. Remaining Water Cups today
    if (waterRemindersEnabled && hydrationToday) {
      dailyRhythmPlan.hydrationSlots.forEach((slot, idx) => {
        if (hydrationToday.slots[idx]) return;
        const triggerAtMs = msForMinuteToday(slot.timeMinutes);
        if (triggerAtMs > nowMs + 1_000) {
          alarms.push({
            id: `water_${todayCairoIso}_${slot.cupIndex}`,
            kind: 'water',
            title: `💧 كوب ماء #${slot.cupIndex}`,
            body: `موعد شرب ${dailyRhythmPlan.cupSizeMl} مل (${formatMinutes12h(slot.timeMinutes, 'ar')})`,
            triggerAtMs,
            snoozeMinutes,
          });
        }
      });
    }

    // 3. Remaining Medication Doses today
    for (const med of medications) {
      if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(todayW)) {
        continue;
      }
      const times =
        med.times24 && med.times24.length > 0 ? med.times24 : med.time24 ? [med.time24] : [];
      const takenDoses = med.takenDateKey === todayCairoIso ? med.takenDosesToday ?? [] : [];
      for (const t24 of times) {
        const alreadyTaken =
          times.length > 1 ? takenDoses.includes(t24) : med.takenDateKey === todayCairoIso;
        if (alreadyTaken) continue;
        const m = t24.match(/^(\d{1,2}):(\d{2})$/);
        if (!m) continue;
        const medMin = Number(m[1]) * 60 + Number(m[2]);
        const triggerAtMs = msForMinuteToday(medMin);
        if (triggerAtMs > nowMs + 1_000) {
          alarms.push({
            id: `med_${todayCairoIso}_${med.id}_${t24}`,
            kind: 'medication',
            title: `💊 موعد الجرعة: ${med.name}`,
            body: `${med.doseNote ? `${med.doseNote} · ` : ''}${formatMinutes12h(medMin, 'ar')}`,
            triggerAtMs,
            snoozeMinutes,
            medicationId: med.id,
            doseTime24: times.length > 1 ? t24 : '',
          });
        }
      }
    }

    // 4. Upcoming Google Calendar Events today (exact simultaneous firing with PC)
    for (const block of liveBlocks) {
      if (block.deleted || block.completed || block.isAllDay) continue;
      const triggerAtMs = msForMinuteToday(block.startMin);
      if (triggerAtMs > nowMs + 1_000) {
        const emoji = (block.emojiPair || '📅').trim();
        const titleText = cleanCalendarText(block.categoryAr) || 'موعد في التقويم';
        const desc = cleanCalendarText(block.description || '').slice(0, 220);
        alarms.push({
          id: `event_${todayCairoIso}_${block.id}_${block.startMin}`,
          kind: 'event',
          title: `${emoji} ${titleText}`,
          body: `${desc ? `${desc}\n` : ''}تقويم Google · ${formatMinutes12h(block.startMin, 'ar')}`,
          triggerAtMs,
          snoozeMinutes,
        });
      }
    }

    // 5. Timed Google Tasks today
    for (const tk of googleTasks) {
      if (tk.status === 'completed') continue;
      const info = extractTaskTimeMinutesForToday(tk, todayCairoIso, activeTimeZone);
      if (!info || !info.hasExplicitTime) continue;
      const triggerAtMs = msForMinuteToday(info.startMin);
      if (triggerAtMs > nowMs + 1_000) {
        const titleText = cleanCalendarText(tk.title) || 'مهمة مطلوبة الآن';
        const notes = cleanCalendarText(tk.notes || '').slice(0, 220);
        alarms.push({
          id: `task_${todayCairoIso}_${tk.id}_${info.startMin}`,
          kind: 'task',
          title: `☑️ ${titleText}`,
          body: `${notes ? `${notes}\n` : ''}مهام Google · ${formatMinutes12h(info.startMin, 'ar')}`,
          triggerAtMs,
          snoozeMinutes,
        });
      }
    }

    alarms.sort((a, b) => a.triggerAtMs - b.triggerAtMs);

    try {
      androidBridge.scheduleExactAlarms(JSON.stringify(alarms.slice(0, 60)));
    } catch {
      // ignore Android bridge errors
    }
  }, [
    activeTimeZone,
    dailyRhythmPlan.cupSizeMl,
    dailyRhythmPlan.hydrationSlots,
    googleTasks,
    hydrationToday,
    includePrayerAnchors,
    lifeProfile.adhanLeadMinutes,
    lifeProfile.defaultSnoozeMinutes,
    liveBlocks,
    medications,
    needsAuth,
    prayers,
    todayCairoIso,
    waterRemindersEnabled,
  ]);

  const assistantContextSummary = useMemo(() => {
    const lifeConstitution = buildLifeProfileGeminiSummary(
      lifeProfile,
      dailyRhythmPlan,
      memories,
      weatherInfo,
      todayCalendarMeta,
      creativePlacements,
      freeSlotsToday,
      tomorrowAlert,
      todayCairoIso
    );
    const prayerLines = prayers
      .filter((p) => p.isObligatory)
      .map((p) => `${p.nameAr}: ${formatMinutes12h(p.adhanMinutes, 'ar')} (تنبيه ${formatMinutes12h(p.alarmMinutes, 'ar')})`)
      .join(' | ');

    return `
${lifeConstitution}
حالة حماية الصوت الآن: ${activeSanctuary.type === 'none' ? 'عادي' : activeSanctuary.labelAr}
مواقيت الصلاة اليوم (${activeLocation.nameAr}): ${prayerLines}
الترطيب المسجل اليوم: ${hydrationToday.cupsLogged}/${hydrationToday.targetCups} كوب (${hydrationToday.cupsLogged * lifeProfile.cupSizeMl} / ${dailyRhythmPlan.activeTargetMl} مل)
الحدث القادم: ${nextActiveBlock ? `${nextActiveBlock.emojiPair} ${nextActiveBlock.categoryAr} (${formatMinutes12h(nextActiveBlock.startMin, 'ar')})` : 'لا يوجد'}
`.trim();
  }, [
    activeLocation.nameAr,
    activeSanctuary,
    creativePlacements,
    dailyRhythmPlan,
    freeSlotsToday,
    hydrationToday.cupsLogged,
    hydrationToday.targetCups,
    lifeProfile,
    memories,
    nextActiveBlock,
    prayers,
    todayCairoIso,
    todayCalendarMeta,
    tomorrowAlert,
    weatherInfo,
  ]);

  return (
    <div
      className={`app-root min-h-[100dvh] overflow-x-clip transition-colors ${
        surfaceTheme === 'amoled' ? 'bg-black' : 'bg-[#070A0F]'
      } text-zinc-100 pb-16`}
    >
      <TopBar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onOpenCatchUp={() => setIsCatchUpModalOpen(true)}
        language={language}
        onToggleLanguage={() => setLanguage((l) => (l === 'ar' ? 'en' : 'ar'))}
        brandLogoSrc={activeBrandLogo?.src ?? null}
        onCheckAppUpdates={handleCheckAppUpdates}
        isCheckingUpdates={isCheckingUpdates}
        sunMode={sunMode}
        onToggleSunMode={() => setSunMode((v) => !v)}
      />

      {toastMessage && (
        <div className="fixed top-[calc(env(safe-area-inset-top)+4rem)] inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:max-w-lg z-50 rounded-xl border border-[#7FFFD4]/50 bg-black/95 px-4 py-2.5 text-xs font-semibold text-[#7FFFD4] text-center shadow-2xl break-words">
          {toastMessage}
        </div>
      )}

      <main className={activeTab === 'assistant' ? 'md:pb-8' : 'pb-24 md:pb-8'}>
        {authUser && !needsAuth && (workspaceTokenExpired || (!permanentLinkActive && isPermanentLinkAvailable() && !permanentLinkHintDismissed)) && (
          <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-3">
            <div
              className={`rounded-xl border px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs ${
                workspaceTokenExpired
                  ? 'border-amber-400/35 bg-amber-400/[0.06]'
                  : 'border-[#7FFFD4]/25 bg-[#7FFFD4]/[0.04]'
              }`}
            >
              <span className={workspaceTokenExpired ? 'text-amber-200 font-semibold' : 'text-zinc-300'}>
                {workspaceTokenExpired
                  ? 'ربط Google انتهى — التقويم والمهام مش بيتحدّثوا دلوقتي.'
                  : 'فعّل الربط الدائم مع Google علشان الربط ميقعش كل ساعة.'}
              </span>
              <div className="flex items-center gap-2">
                {isPermanentLinkAvailable() && !permanentLinkActive && (
                  <button
                    type="button"
                    onClick={() => void handleStartPermanentLink()}
                    disabled={isStartingPermanentLink}
                    className="min-h-[34px] px-3 rounded-lg bg-[#7FFFD4] text-black font-bold hover:bg-[#7FFFD4]/90 disabled:opacity-60 cursor-pointer"
                  >
                    {isStartingPermanentLink ? 'جارٍ التحويل لـ Google…' : '🔗 ربط دائم'}
                  </button>
                )}
                {workspaceTokenExpired && (
                  <button
                    type="button"
                    onClick={() => void handleRefreshWorkspaceToken()}
                    disabled={isRefreshingWorkspaceToken}
                    className="min-h-[34px] px-3 rounded-lg border border-amber-400/40 text-amber-200 font-semibold hover:bg-amber-400/10 disabled:opacity-60 cursor-pointer"
                  >
                    {isRefreshingWorkspaceToken ? 'جارٍ التجديد…' : 'تجديد الربط'}
                  </button>
                )}
                {!workspaceTokenExpired && (
                  <button
                    type="button"
                    onClick={() => {
                      setPermanentLinkHintDismissed(true);
                      try {
                        localStorage.setItem('dayrhythm_permanent_link_hint_dismissed_v1', '1');
                      } catch {
                        // ignore
                      }
                    }}
                    aria-label="إخفاء"
                    className="min-h-[34px] px-2 rounded-lg text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {queuedGoogleOpsCount > 0 && (
          <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-zinc-300">
              ⏳ {queuedGoogleOpsCount} تعديل مستني النت — هيتنفذوا في Google لوحدهم أول ما الاتصال يرجع.
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            language={language}
            isFridayMode={isFridayMode}
            onToggleFridayMode={handleToggleFridayMode}
            includeBiweeklyPcCleanup={includeBiweeklyPcCleanup}
            onToggleBiweeklyPcCleanup={handleToggleBiweeklyPcCleanup}
            adhanOverrideSilent={adhanOverrideSilent}
            onToggleAdhanOverrideSilent={() => setAdhanOverrideSilent((v) => !v)}
            onTestAdhanChime={handleTestAdhanChime}
            surfaceTheme={surfaceTheme}
            onToggleSurfaceTheme={setSurfaceTheme}
            prayers={prayers}
            blocks={liveBlocks}
            includePrayerAnchors={includePrayerAnchors}
            onToggleIncludePrayerAnchors={() => setIncludePrayerAnchors((v) => !v)}
            useOfflineDemo={useOfflineDemo}
            onToggleOfflineDemo={() => setUseOfflineDemo((v) => !v)}
            onToggleComplete={handleToggleComplete}
            onDeleteBlock={handleDeleteBlock}
            onRestoreBlock={handleRestoreBlock}
            onRestoreAllDeleted={handleRestoreAllDeleted}
            lastDeletedBlock={lastDeletedBlock}
            shakeUndoSecondsLeft={shakeUndoSecondsLeft}
            onTriggerShakeUndo={handleTriggerShakeUndo}
            tombstones={tombstones}
            onSweepOldTombstones={handleSweepOldTombstones}
            hydrationToday={hydrationToday}
            hydrationHistory={hydrationHistory}
            onLogWaterCup={handleLogWaterCup}
            onToggleWaterSlot={handleToggleWaterSlot}
            medications={medications}
            onToggleMedication={handleToggleMedication}
            onToggleMedicationDate={handleToggleMedicationDate}
            onRefillMedication={handleRefillMedication}
            onAddMedication={handleAddMedication}
            onDeleteMedication={handleDeleteMedication}
            streaks={streaks}
            onToggleDailyCommitmentStreak={handleToggleDailyCommitmentStreak}
            pomodoro={pomodoro}
            onOpenPomodoro={() => setIsPomodoroModalOpen(true)}
            travelState={travelState}
            onOpenTravel={() => setIsTravelModalOpen(true)}
            onOpenCatchUp={() => setIsCatchUpModalOpen(true)}
            hasUndoSnapshot={!!undoSnapshot}
            onUndoReflow={handleUndoReflow}
            quietMode={quietMode}
            quietRemainingSec={quietRemainingSec}
            onSetQuietMode={handleSetQuietMode}
            liveCountdownSec={liveCountdownSec}
            simulateUnder60s={simulateUnder60s}
            onToggleSimulateUnder60s={() => setSimulateUnder60s((v) => !v)}
            calendarConnected={!needsAuth}
            prayersReady={prayersReady}
            locationResolutionState={locationResolutionState}
            calendarUserEmail={authUser?.email ?? undefined}
            isLoggingIn={isLoggingIn}
            loadingCalendarEvents={loadingEvents}
            calendarList={calendarList}
            calendarEvents={calendarEvents}
            googleTaskLists={googleTaskLists}
            googleTasks={googleTasks}
            loadingTasks={loadingTasks}
            chatMessages={chatMessages}
            onGoogleSignIn={handleGoogleSignIn}
            onGoogleSignOut={handleGoogleSignOut}
            onRefreshWorkspace={() => refreshWorkspace()}
            onExecuteCalendarActions={handleExecuteCalendarActions}
            onExecuteTaskActions={handleExecuteTaskActions}
            onOpenAssistant={() => handleSelectTab('assistant')}
            syncTier={syncTier}
            onChangeSyncTier={setSyncTier}
            onImportIcsBlocks={handleImportIcsBlocks}
            periodicRituals={periodicRituals}
            onCompletePeriodicRitual={handleCompletePeriodicRitual}
            batteryGuard={batteryGuard}
            phoneBattery={phoneBattery}
            phoneChargeLimitPct={phoneChargeLimitPct}
            onUpdatePhoneChargeLimit={handleUpdatePhoneChargeLimit}
            phoneChargeAlertDismissed={phoneChargeAlertDismissed}
            onDismissPhoneChargeAlert={handleStopSmartChargeAlert}
            smartChargeAlertEnabled={smartChargeAlertEnabled}
            onToggleSmartChargeAlertEnabled={handleToggleSmartChargeAlertEnabled}
            smartChargeAudioActive={smartChargeAudioActive}
            onTestSmartChargeAlert={handleTestSmartChargeAlert}
            firestoreSynced={firestoreSynced || googleDriveSynced}
            aquaTouchMode={deviceSettings.aquaTouchMode}
            alertSliderLinked={deviceSettings.alertSliderLinked}
            lifeProfile={lifeProfile}
            dailyRhythmPlan={dailyRhythmPlan}
            fastingOverride={fastingOverride}
            onChangeFastingOverride={setFastingOverride}
            onOpenLifeProfile={() => setIsLifeProfileModalOpen(true)}
            onQuickUpdateWeight={handleQuickUpdateWeight}
            memoryCount={memories.length}
            onDetectGpsLocation={handleDetectGpsLocation}
            isDetectingGps={isDetectingGps}
            activeSanctuary={activeSanctuary}
            silentNotifications={silentNotifications}
            onClearSilentNotifications={handleClearSilentNotifications}
            activeAudioAlert={activeAudioAlert}
            onAcknowledgeAudioAlert={handleAcknowledgeAudioAlert}
            onTriggerTaskAlert={triggerTaskAlert}
            weatherInfo={weatherInfo}
            gmailDigest={gmailDigest}
            gmailScannedCount={gmailScannedCount}
            loadingGmail={loadingGmail}
            gmailNeedsReauth={gmailNeedsReauth}
            gmailError={gmailError}
            gmailLastSyncedIso={gmailLastSyncedIso}
            gmailNextRetryInSec={gmailNextRetryInSec}
            onFetchGmailDigest={() => fetchGmailDigest()}
            hasDailyWirdHabit={hasDailyWirdHabit}
            activeTimeZone={activeTimeZone}
            onLogSleepQuality={handleLogSleepQuality}
            onOpenAssistantWithPrompt={handleOpenAssistantWithPrompt}
            todayCalendarMeta={todayCalendarMeta}
            creativePlacements={creativePlacements}
            freeSlotsToday={freeSlotsToday}
            onAddCreativeActivity={handleAddCreativeActivity}
            onToggleCreativeToday={handleToggleCreativeToday}
            onDeleteCreativeActivity={handleDeleteCreativeActivity}
            onScheduleCreativeInCalendar={handleScheduleCreativeInCalendar}
            waterRemindersEnabled={waterRemindersEnabled}
            notificationPermission={notificationPermission}
            onToggleWaterReminders={handleToggleWaterReminders}
            onRequestNotificationPermission={handleRequestNotificationPermission}
            tomorrowAlert={tomorrowAlert}
            lowEnergyActive={lowEnergyActive}
            onToggleLowEnergyToday={handleToggleLowEnergyToday}
            soundRepeats={lifeProfile.soundRepeats ?? DEFAULT_SOUND_REPEATS}
            onUpdateSoundRepeat={handleUpdateSoundRepeat}
            lastDeletedWorkspaceItem={lastDeletedWorkspaceItem}
            onUndoWorkspaceDelete={handleUndoWorkspaceDelete}
            onDismissWorkspaceUndo={() => setLastDeletedWorkspaceItem(null)}
            wsConnected={wsConnected}
            activeOneTimeSilenceMinutes={activeOneTimeSilenceMinutes}
          />
        )}

        {activeTab === 'mobile' && (
          <MobilePreviewView
            language={language}
            activeTimeZone={activeTimeZone}
            activeLocation={activeLocation}
            onRefreshGps={handleDetectGpsLocation}
            gpsSyncing={isDetectingGps}
            phoneBattery={phoneBattery}
            upcomingPreview={{
              emoji: capsuleTimerState.emoji,
              title: capsuleTimerState.title,
              countdownText: capsuleTimerState.countdownText,
            }}
            prayers={prayers}
            blocks={liveBlocks}
            hydrationToday={hydrationToday}
            onLogWaterCup={handleLogWaterCup}
            quietMode={quietMode}
            quietRemainingSec={quietRemainingSec}
            onCycleQuietMode={handleCycleQuietMode}
            onSetQuietMode={handleSetQuietMode}
            adhanOverrideSilent={adhanOverrideSilent}
            onTestAdhanChime={handleTestAdhanChime}
            travelState={travelState}
            onOpenTravel={() => setIsTravelModalOpen(true)}
            onOpenCatchUp={() => setIsCatchUpModalOpen(true)}
            onOpenPomodoro={() => setIsPomodoroModalOpen(true)}
            liveCountdownSec={liveCountdownSec}
            batteryGuard={batteryGuard}
            onSimulateCharge90={handleSimulateCharge90}
            onSimulatePowerDisconnect={handleSimulatePowerDisconnect}
            onSimulateBedtimeLowBattery={handleSimulateBedtimeLowBattery}
            onToggleBypassCharging={handleToggleBypassCharging}
            hasShakeUndoActive={!!lastDeletedBlock && shakeUndoSecondsLeft > 0}
            onTriggerShakeUndo={handleTriggerShakeUndo}
            alarmRinging={alarmRinging}
            onDismissTwoWay={handleDismissTwoWay}
            deviceSettings={deviceSettings}
            onUpdateDeviceSettings={handleUpdateDeviceSettings}
            firestoreSynced={firestoreSynced || googleDriveSynced}
          />
        )}

        {activeTab === 'overlay' && (
          <OverlaySimulatorView
            blocks={liveBlocks}
            batteryGuard={batteryGuard}
            quietMode={quietMode}
            stealthAudioOnly={stealthAudioOnly}
            onToggleStealthAudioOnly={() => setStealthAudioOnly((v) => !v)}
            alarmRinging={alarmRinging}
            onTriggerRing={handleTriggerRing}
            onDismissTwoWay={handleDismissTwoWay}
            onSimulateCharge90={handleSimulateCharge90}
            onSimulatePowerDisconnect={handleSimulatePowerDisconnect}
            onSimulateWindowsWake={handleSimulateWindowsWake}
            phoneBattery={phoneBattery}
            onChangeChargeLimit={handleUpdatePhoneChargeLimit}
            capsulePrefs={capsulePrefs}
            onChangeCapsulePrefs={handleUpdateCapsulePrefs}
            activeLocation={activeLocation}
            firestoreSynced={firestoreSynced || googleDriveSynced}
          />
        )}

        {/* Keep GeminiAssistantView persistently mounted so switching to Dashboard NEVER cancels in-flight chat/search/maps queries or wipes drafts */}
        <div className={activeTab === 'assistant' ? '' : 'hidden'}>
          <GeminiAssistantView
            isActive={activeTab === 'assistant'}
            language={language}
            activeLocation={activeLocation}
            contextSummary={assistantContextSummary}
            needsAuth={needsAuth}
            authUser={authUser}
            isLoggingIn={isLoggingIn}
            calendarEvents={calendarEvents}
            googleTasks={googleTasks}
            medications={medications}
            creativePlacements={creativePlacements}
            loadingEvents={loadingEvents}
            loadingTasks={loadingTasks}
            messages={chatMessages}
            onChangeMessages={setChatMessages}
            onResetChat={handleResetChatMode}
            onGoogleSignIn={handleGoogleSignIn}
            onGoogleSignOut={handleGoogleSignOut}
            onRefreshWorkspace={() => refreshWorkspace()}
            onExecuteCalendarActions={handleExecuteCalendarActions}
            onExecuteTaskActions={handleExecuteTaskActions}
            onExecuteMedicationActions={handleExecuteMedicationActions}
            onExecuteCreativeActions={handleExecuteCreativeActions}
            onApplyProfileUpdates={handleUpdateLifeProfile}
            onApplyAppSettings={handleApplyAppSettings}
            onExecuteMemoryActions={handleExecuteMemoryActions}
            onOpenLifeProfile={() => setIsLifeProfileModalOpen(true)}
            initialPrompt={pendingAssistantPrompt}
            onConsumeInitialPrompt={() => setPendingAssistantPrompt(null)}
            autoStartVoice={autoStartVoice}
            onConsumeAutoStartVoice={() => setAutoStartVoice(false)}
            memoryCount={memories.length}
            memories={memories}
            lifeProfile={lifeProfile}
            firestoreSynced={firestoreSynced || googleDriveSynced}
            onAddMemory={handleAddMemory}
            onUpdateMemory={handleUpdateMemory}
            onDeleteMemory={handleDeleteMemory}
            onSaveCloudApiUrl={handleSaveCloudApiUrl}
          />
        </div>
      </main>

      <FloatingPiPCapsule
        nextEmoji={capsuleTimerState.emoji}
        nextTitle={capsuleTimerState.title}
        statusLabel={capsuleTimerState.statusLabel}
        sourceKind={capsuleTimerState.sourceKind}
        countdownText={capsuleTimerState.countdownText}
        isNow={capsuleTimerState.isNow}
        isUrgent={capsuleTimerState.isUrgent}
        progressRatio={capsuleTimerState.progressRatio}
        targetEpochMs={capsuleTimerState.targetEpochMs}
        durationSeconds={capsuleTimerState.durationSeconds}
        calendarTrack={capsuleTimerState.calendarTrack}
        taskTrack={capsuleTimerState.taskTrack}
        upcomingQueue={capsuleTimerState.upcomingQueue}
        phoneBattery={phoneBattery}
        capsulePrefs={capsulePrefs}
        onChangeCapsulePrefs={handleUpdateCapsulePrefs}
        onQuickLogWater={handleLogWaterCup}
        nextMedicationQuick={nextMedicationQuick}
        onQuickTakeMedication={handleToggleMedication}
        onOpenDashboard={() => handleSelectTab('dashboard')}
      />

      <PersistentAlertOverlay
        alert={
          typeof window !== 'undefined' &&
          Boolean(
            (window as Window & { chrome?: { webview?: { postMessage?: unknown } } }).chrome
              ?.webview?.postMessage
          )
            ? null
            : persistentAlert
        }
        defaultSnoozeMinutes={lifeProfile.defaultSnoozeMinutes ?? 5}
        onDismiss={() => {
          if (persistentAlert?.id.startsWith('charge_')) {
            handleStopSmartChargeAlert();
          } else {
            handleAcknowledgeAudioAlert();
            setPersistentAlert(null);
          }
        }}
        onConfirmWater={() => {
          handleLogWaterCup();
          handleAcknowledgeAudioAlert();
          setPersistentAlert(null);
        }}
        onConfirmMedication={(medId, doseTime24) => {
          handleToggleMedication(medId, doseTime24);
          handleAcknowledgeAudioAlert();
          setPersistentAlert(null);
        }}
        onCompleteTask={(taskId, taskListId) => {
          void handleExecuteTaskActions([
            {
              operation: 'complete',
              title: persistentAlert?.title || 'مهمة',
              taskId,
              taskListId,
            },
          ]).catch(() => {});
          handleAcknowledgeAudioAlert();
          setPersistentAlert(null);
        }}
        onSnoozeAlert={handleSnoozeAlert}
      />

      <OfflineIndicator language={language} />

      <LifeProfileModal
        isOpen={isLifeProfileModalOpen}
        onClose={() => setIsLifeProfileModalOpen(false)}
        profile={lifeProfile}
        prayers={prayers}
        activeLocation={activeLocation}
        memories={memories}
        onAddMemory={handleAddMemory}
        onUpdateMemory={handleUpdateMemory}
        onDeleteMemory={handleDeleteMemory}
        onSaveProfile={handleUpdateLifeProfile}
        onDetectGpsLocation={handleDetectGpsLocation}
        isDetectingGps={isDetectingGps}
        includePrayerAnchors={includePrayerAnchors}
        onToggleIncludePrayerAnchors={() => setIncludePrayerAnchors((v) => !v)}
        isFridayMode={isFridayMode}
        onToggleFridayMode={setIsFridayMode}
        includeBiweeklyPcCleanup={includeBiweeklyPcCleanup}
        onToggleBiweeklyPcCleanup={setIncludeBiweeklyPcCleanup}
        calendarConnected={!needsAuth}
        onGoogleSignOut={handleGoogleSignOut}
        quietMode={quietMode}
        onSetQuietMode={handleSetQuietMode}
        soundRepeats={lifeProfile.soundRepeats ?? DEFAULT_SOUND_REPEATS}
        onUpdateSoundRepeat={handleUpdateSoundRepeat}
        onTriggerTaskAlert={triggerTaskAlert}
        phoneBattery={phoneBattery}
        phoneChargeLimitPct={phoneChargeLimitPct}
        onUpdatePhoneChargeLimit={handleUpdatePhoneChargeLimit}
        smartChargeAlertEnabled={smartChargeAlertEnabled}
        onToggleSmartChargeAlertEnabled={handleToggleSmartChargeAlertEnabled}
        smartChargeKeepUntilUnplugged={smartChargeKeepUntilUnplugged}
        onToggleSmartChargeKeepUntilUnplugged={handleToggleSmartChargeKeepUntilUnplugged}
        smartChargeAudioActive={smartChargeAudioActive}
        onTestSmartChargeAlert={handleTestSmartChargeAlert}
        onCheckAppUpdates={handleCheckAppUpdates}
        activeBrandLogo={{
          titleAr: activeBrandLogo.titleAr,
          src: activeBrandLogo.src,
          isDefault: activeBrandLogo.id === DEFAULT_LOGO_ID,
        }}
        onOpenLogoPicker={() => setIsLogoPickerOpen(true)}
        capsulePrefs={capsulePrefs}
        onChangeCapsulePrefs={handleUpdateCapsulePrefs}
        googleDriveSynced={googleDriveSynced}
        onSyncGoogleDriveNow={pushFullCloudBackupImmediately}
        isSyncingGoogleDrive={isSyncingGoogleDrive}
        onExportBackupJson={handleExportBackupJson}
        onImportBackupJson={handleImportBackupJson}
      />

      <TravelModeModal
        isOpen={isTravelModalOpen}
        onClose={() => setIsTravelModalOpen(false)}
        travelState={travelState}
        scheduleBlocks={liveBlocks}
        onApplyTravel={handleApplyTravel}
        onDisableTravel={handleDisableTravel}
      />

      <SmartCatchUpModal
        isOpen={isCatchUpModalOpen}
        onClose={() => setIsCatchUpModalOpen(false)}
        blocks={liveBlocks}
        hasUndoSnapshot={!!undoSnapshot}
        onCommitReflow={handleCommitReflow}
        onUndoToOriginal={handleUndoReflow}
      />

      <PomodoroModal
        isOpen={isPomodoroModalOpen}
        onClose={() => setIsPomodoroModalOpen(false)}
        state={pomodoro}
        onToggleRun={() =>
          setPomodoro((p) => ({ ...p, isRunning: !p.isRunning }))
        }
        onReset={() =>
          setPomodoro((p) => ({
            ...p,
            phase: 'focus',
            remainingSeconds: p.presetMinutes * 60,
            totalSeconds: p.presetMinutes * 60,
            isRunning: false,
          }))
        }
        onSelectPreset={(minutes) =>
          setPomodoro((p) => ({
            ...p,
            phase: minutes === 5 ? 'break' : 'focus',
            presetMinutes: minutes,
            remainingSeconds: minutes * 60,
            totalSeconds: minutes * 60,
            isRunning: false,
          }))
        }
        onFastForwardTest={() =>
          setPomodoro((p) => ({
            ...p,
            phase: 'focus',
            remainingSeconds: 3,
            totalSeconds: p.presetMinutes * 60,
            isRunning: true,
          }))
        }
      />

      <LogoPickerModal
        isOpen={isLogoPickerOpen}
        selectedLogoId={selectedLogoId}
        onSelectLogo={handleSelectBrandLogo}
        onResetDefault={handleResetBrandLogo}
        onClose={() => setIsLogoPickerOpen(false)}
      />
    </div>
  );
}
