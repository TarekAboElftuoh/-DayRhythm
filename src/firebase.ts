import { initializeApp, getApps } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  setPersistence,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  disableNetwork,
  doc,
  enableNetwork,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  limit,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  CreativeActivityItem,
  CreativeCadence,
  LifeProfile,
  MedicationItem,
  MemoryCategory,
  MemoryItem,
  PersistedChatMessage,
  PhoneBatteryTelemetry,
  QuietModeType,
  SleepStrategy,
  SoundRepeatMap,
  SoundRepeatSetting,
  SurfaceTheme,
  TaskSoundCategory,
  WorkspaceSyncSignal,
} from './types/dayrhythm';
import { DEFAULT_LIFE_PROFILE, DEFAULT_MEMORIES } from './engines/lifeRhythmEngine';
import { DEFAULT_SOUND_REPEATS } from './engines/audioEngine';

export const app =
  getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

const configuredDbId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-dayrhythm-1f2dd321-5d9e-4566-bb4c-87a3962fa6f7';

function createResilientFirestore() {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
        experimentalAutoDetectLongPolling: true,
      },
      configuredDbId
    );
  } catch {
    return getFirestore(app, configuredDbId);
  }
}

export const db = createResilientFirestore();
export const auth = getAuth(app);

// Keep Firebase Auth session permanently across app restarts, reboots, and updates
void setPersistence(auth, indexedDBLocalPersistence).catch(() =>
  setPersistence(auth, browserLocalPersistence).catch(() => {})
);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const FS_BASE_BACKOFF_MS = 1000;
const FS_MAX_BACKOFF_MS = 30_000;
const FS_NETWORK_RESET_COOLDOWN_MS = 6_000;

let activeNetworkRecovery: Promise<void> | null = null;
let lastNetworkResetMs = 0;
const activeListenerRecoverers = new Set<() => void>();

function computeExponentialBackoffMs(attempt: number, baseMs = FS_BASE_BACKOFF_MS, maxMs = FS_MAX_BACKOFF_MS): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt)));
  const jitter = Math.floor(Math.random() * Math.min(1200, exp * 0.3));
  return Math.min(maxMs, exp + jitter);
}

function isTransientFirestoreError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code ?? '').toLowerCase()
      : '';
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();

  if (code.includes('permission-denied') || msg.includes('missing or insufficient permissions')) {
    return false;
  }

  return (
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    code.includes('aborted') ||
    code.includes('internal') ||
    code.includes('resource-exhausted') ||
    code.includes('cancelled') ||
    msg.includes('unavailable') ||
    msg.includes('offline') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('transport') ||
    msg.includes('timed out')
  );
}

/**
 * Tears down stalled/half-open Firestore network channels via disableNetwork -> enableNetwork
 * (coalesced with cooldown so concurrent listeners never stampede).
 */
export async function recoverFirestoreNetwork(force = false): Promise<void> {
  if (activeNetworkRecovery) {
    return activeNetworkRecovery;
  }
  const now = Date.now();
  if (!force && now - lastNetworkResetMs < FS_NETWORK_RESET_COOLDOWN_MS) {
    return;
  }
  lastNetworkResetMs = now;

  activeNetworkRecovery = (async () => {
    try {
      await disableNetwork(db);
      await new Promise((r) => setTimeout(r, 250));
      await enableNetwork(db);
    } catch {
      try {
        await enableNetwork(db);
      } catch {
        // SDK will retry on next network event
      }
    } finally {
      activeNetworkRecovery = null;
    }
  })();

  return activeNetworkRecovery;
}

/**
 * Proactively resets stalled Firestore channels & re-attaches all active real-time listeners
 * (called on device wake, network restore, or native Windows/Android recovery events).
 */
export function triggerFirestoreRecovery(forceNetworkReset = true): void {
  void recoverFirestoreNetwork(forceNetworkReset).then(() => {
    activeListenerRecoverers.forEach((recover) => {
      try {
        recover();
      } catch {
        // ignore individual listener error
      }
    });
  });
}

function createResilientSnapshot(
  attach: (onHealthy: () => void, onError: (error: unknown) => void) => Unsubscribe,
  operationType: OperationType,
  path: string,
  onSyncError?: (message: string) => void
): Unsubscribe {
  let disposed = false;
  let attempt = 0;
  let currentUnsub: Unsubscribe | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRetryTimer = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const teardownCurrent = () => {
    if (currentUnsub) {
      try {
        currentUnsub();
      } catch {
        // ignore teardown errors
      }
      currentUnsub = null;
    }
  };

  const startSubscription = () => {
    if (disposed) return;
    clearRetryTimer();
    teardownCurrent();

    currentUnsub = attach(
      () => {
        attempt = 0;
      },
      (error) => {
        if (disposed) return;
        if (isTransientFirestoreError(error)) {
          teardownCurrent();
          const delayMs = computeExponentialBackoffMs(attempt);
          attempt = Math.min(attempt + 1, 8);
          void recoverFirestoreNetwork(false);
          retryTimer = setTimeout(() => {
            retryTimer = null;
            startSubscription();
          }, delayMs);
          return;
        }
        try {
          handleFirestoreError(error, operationType, path);
        } catch (err) {
          onSyncError?.(err instanceof Error ? err.message : String(err));
        }
      }
    );
  };

  const forceRecover = () => {
    if (disposed) return;
    // Only re-attach immediately if we are currently waiting on a backoff retry
    if (retryTimer !== null || currentUnsub === null) {
      attempt = 0;
      startSubscription();
    }
  };

  activeListenerRecoverers.add(forceRecover);
  startSubscription();

  return () => {
    disposed = true;
    activeListenerRecoverers.delete(forceRecover);
    clearRetryTimer();
    teardownCurrent();
  };
}

async function withFirestoreWriteRetry<T>(
  action: () => Promise<T>,
  operationType: OperationType,
  path: string
): Promise<T> {
  let attempt = 0;
  const maxRetries = 3;
  while (true) {
    try {
      return await action();
    } catch (error) {
      if (attempt < maxRetries && isTransientFirestoreError(error)) {
        const delayMs = computeExponentialBackoffMs(attempt, 800, 8_000);
        attempt += 1;
        await recoverFirestoreNetwork(false);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      handleFirestoreError(error, operationType, path);
    }
  }
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      void recoverFirestoreNetwork(true);
    }
  }
}

void testConnection();

export type LiveAlertsLeadMinutes = 5 | 10 | 15 | 20 | 30;

export interface OnePlusDeviceSettings {
  alertSliderLinked: boolean;
  liveAlertsEnabled: boolean;
  liveAlertsLeadMinutes: LiveAlertsLeadMinutes;
  aquaTouchMode: boolean;
  ltpoNight1Hz: boolean;
  pocketProtectionEnabled: boolean;
}

export const DEFAULT_DEVICE_SETTINGS: OnePlusDeviceSettings = {
  alertSliderLinked: false,
  liveAlertsEnabled: true,
  liveAlertsLeadMinutes: 10,
  aquaTouchMode: true,
  ltpoNight1Hz: true,
  pocketProtectionEnabled: true,
};

export const DEFAULT_MEDICATIONS: MedicationItem[] = [];

export const DEFAULT_CREATIVE_ACTIVITIES: CreativeActivityItem[] = [];

export interface SyncedRhythmPayload {
  hydrationDateKey: string;
  cupsLogged: number;
  targetCups: number;
  hydrationWeeklyCounts: number[];
  dailyCommitmentDays: number;
  dailyCommitmentDoneToday: boolean;
  waterTargetDays: number;
  waterTargetDoneToday: boolean;
  quietMode: QuietModeType;
  adhanOverrideSilent: boolean;
  surfaceTheme: SurfaceTheme;
  deviceSettings: OnePlusDeviceSettings;
  lifeProfile: LifeProfile;
  syncSignal?: WorkspaceSyncSignal;
  phoneBattery?: PhoneBatteryTelemetry;
}

const VALID_LEAD_MINUTES: readonly LiveAlertsLeadMinutes[] = [5, 10, 15, 20, 30];
const VALID_QUIET_MODES: readonly QuietModeType[] = [
  'normal',
  'mute_audio',
  'vibrate_only',
  'silent_all',
];
const VALID_THEMES: readonly SurfaceTheme[] = ['amoled', 'obsidian'];
const VALID_SLEEP_STRATEGIES: readonly SleepStrategy[] = [
  'night_only_strict',
  'biphasic_qailulah',
  'anchor_early_bed',
];
const VALID_MEMORY_CATEGORIES: readonly MemoryCategory[] = [
  'priority',
  'sleep',
  'fasting',
  'hydration',
  'work_devops',
  'travel',
  'general',
];
const VALID_MEMORY_SOURCES: readonly MemoryItem['source'][] = [
  'user',
  'gemini',
  'system_seed',
];

export { DEFAULT_MEMORIES };

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? Math.round(val) : fallback;
  const clamped = Math.max(min, Math.min(max, n));
  return clamped === 0 ? 0 : clamped;
}

function clampFloat(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  const clamped = Math.max(min, Math.min(max, Math.round(n * 10000) / 10000));
  return clamped === 0 ? 0 : clamped;
}

function sanitizeWeekdayList(raw: unknown, fallback: number[]): number[] {
  if (!Array.isArray(raw)) return [...fallback];
  const unique = new Set<number>();
  for (const item of raw) {
    const n = typeof item === 'number' && Number.isFinite(item) ? Math.round(item) : -1;
    if (n >= 0 && n <= 6) unique.add(n === 0 ? 0 : n);
  }
  return Array.from(unique).slice(0, 7);
}

const VALID_CADENCES: readonly CreativeCadence[] = ['daily', 'weekly', 'monthly'];
const SOUND_CATEGORIES: readonly TaskSoundCategory[] = [
  'prayer',
  'water',
  'medication',
  'focus_work',
  'walk_health',
  'sleep_suhoor',
  'meeting_event',
  'general',
];

function sanitizeRepeatSetting(val: unknown, fallback: SoundRepeatSetting): SoundRepeatSetting {
  if (val === 'continuous') return 'continuous';
  const n = typeof val === 'number' ? Math.round(val) : Number(val);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return fallback;
}

export function sanitizeSoundRepeats(
  raw: Partial<SoundRepeatMap> | undefined
): SoundRepeatMap {
  const out: Partial<SoundRepeatMap> = {};
  for (const cat of SOUND_CATEGORIES) {
    out[cat] = sanitizeRepeatSetting(raw?.[cat], DEFAULT_SOUND_REPEATS[cat]);
  }
  return out as SoundRepeatMap;
}

export function sanitizeSyncSignal(raw: unknown): WorkspaceSyncSignal | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const opId = String(r.opId ?? '').trim().slice(0, 64);
  const clientId = String(r.clientId ?? '').trim().slice(0, 64);
  const scopeRaw = String(r.scope ?? '').trim();
  const action = String(r.action ?? '').trim().slice(0, 48);
  const timestampMs =
    typeof r.timestampMs === 'number' && Number.isFinite(r.timestampMs) && r.timestampMs >= 0
      ? Math.round(r.timestampMs)
      : 0;
  if (
    !opId ||
    !clientId ||
    !action ||
    !['calendar', 'tasks', 'all', 'alarm_dismiss'].includes(scopeRaw)
  ) {
    return undefined;
  }
  return {
    opId,
    clientId,
    scope: scopeRaw as WorkspaceSyncSignal['scope'],
    action,
    timestampMs,
  };
}

export function sanitizePhoneBattery(raw: unknown): PhoneBatteryTelemetry | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.levelPct !== 'number' || !Number.isFinite(r.levelPct)) return undefined;
  const levelPct = clampInt(r.levelPct, 0, 100, 0);
  const charging = Boolean(r.charging);
  const chargeLimitPct = clampInt(r.chargeLimitPct, 60, 100, 90);
  const updatedAtMs =
    typeof r.updatedAtMs === 'number' && Number.isFinite(r.updatedAtMs) && r.updatedAtMs >= 0
      ? Math.round(r.updatedAtMs)
      : Date.now();
  const deviceLabel = String(r.deviceLabel ?? 'الهاتف').trim().slice(0, 40) || 'الهاتف';
  return {
    levelPct,
    charging,
    chargeLimitPct,
    updatedAtMs,
    deviceLabel,
  };
}

export function sanitizeLifeProfile(
  raw: Partial<LifeProfile> | undefined
): LifeProfile {
  const rawStart = String(raw?.workStart24 ?? DEFAULT_LIFE_PROFILE.workStart24).trim();
  const workStart24 = /^[0-2][0-9]:[0-5][0-9]$/.test(rawStart) ? rawStart : '';
  const rawEnd = String(raw?.workEnd24 ?? DEFAULT_LIFE_PROFILE.workEnd24).trim();
  const workEnd24 = /^[0-2][0-9]:[0-5][0-9]$/.test(rawEnd) ? rawEnd : '';

  const strategyRaw = raw?.sleepStrategy;
  const sleepStrategy: SleepStrategy = VALID_SLEEP_STRATEGIES.includes(
    strategyRaw as SleepStrategy
  )
    ? (strategyRaw as SleepStrategy)
    : DEFAULT_LIFE_PROFILE.sleepStrategy;

  const cityName =
    String(raw?.currentCityName ?? DEFAULT_LIFE_PROFILE.currentCityName)
      .trim()
      .slice(0, 100) || DEFAULT_LIFE_PROFILE.currentCityName;
  const timeZone =
    String(raw?.currentTimeZone ?? DEFAULT_LIFE_PROFILE.currentTimeZone)
      .trim()
      .slice(0, 64) || DEFAULT_LIFE_PROFILE.currentTimeZone;

  const rawOneTimeDate = String(raw?.oneTimeSilenceDateKey ?? '').trim();
  const oneTimeSilenceDateKey = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rawOneTimeDate)
    ? rawOneTimeDate
    : '';
  const rawLowEnergyDate = String(raw?.lowEnergyDateKey ?? '').trim();
  const lowEnergyDateKey = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rawLowEnergyDate)
    ? rawLowEnergyDate
    : '';

  return {
    weightKg: clampFloat(raw?.weightKg, 30, 250, DEFAULT_LIFE_PROFILE.weightKg),
    heightCm: clampFloat(raw?.heightCm, 100, 240, DEFAULT_LIFE_PROFILE.heightCm),
    cupSizeMl: clampInt(raw?.cupSizeMl, 50, 2000, DEFAULT_LIFE_PROFILE.cupSizeMl),
    fastingDays: sanitizeWeekdayList(raw?.fastingDays, DEFAULT_LIFE_PROFILE.fastingDays),
    suhoorLeadMinutes: clampInt(
      raw?.suhoorLeadMinutes,
      10,
      180,
      DEFAULT_LIFE_PROFILE.suhoorLeadMinutes
    ),
    sleepTargetMinutes: clampInt(
      raw?.sleepTargetMinutes,
      180,
      720,
      DEFAULT_LIFE_PROFILE.sleepTargetMinutes
    ),
    sleepStrategy,
    sleepDebtMinutes: clampInt(
      raw?.sleepDebtMinutes,
      0,
      480,
      DEFAULT_LIFE_PROFILE.sleepDebtMinutes
    ),
    sleepDebtLogDateKey: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(
      String(raw?.sleepDebtLogDateKey ?? '').trim()
    )
      ? String(raw?.sleepDebtLogDateKey ?? '').trim()
      : '',
    adhanLeadMinutes: clampInt(
      raw?.adhanLeadMinutes,
      0,
      30,
      DEFAULT_LIFE_PROFILE.adhanLeadMinutes
    ),
    prayerSilenceMinutes: clampInt(
      raw?.prayerSilenceMinutes,
      5,
      90,
      DEFAULT_LIFE_PROFILE.prayerSilenceMinutes
    ),
    fajrSilenceMinutes: clampInt(
      raw?.fajrSilenceMinutes,
      5,
      90,
      DEFAULT_LIFE_PROFILE.fajrSilenceMinutes
    ),
    oneTimeSilenceMinutes: clampInt(raw?.oneTimeSilenceMinutes, 0, 120, 0),
    oneTimeSilenceDateKey,
    lowEnergyDateKey,
    soundRepeats: sanitizeSoundRepeats(raw?.soundRepeats),
    careerTrack: String(raw?.careerTrack ?? DEFAULT_LIFE_PROFILE.careerTrack)
      .trim()
      .slice(0, 120),
    workEnabled:
      typeof raw?.workEnabled === 'boolean'
        ? raw.workEnabled
        : DEFAULT_LIFE_PROFILE.workEnabled,
    workStart24,
    workEnd24,
    workDays: sanitizeWeekdayList(raw?.workDays, DEFAULT_LIFE_PROFILE.workDays),
    autoLocationSync:
      typeof raw?.autoLocationSync === 'boolean'
        ? raw.autoLocationSync
        : DEFAULT_LIFE_PROFILE.autoLocationSync,
    currentCityName: cityName,
    currentTimeZone: timeZone,
    currentLat: clampFloat(raw?.currentLat, -90, 90, DEFAULT_LIFE_PROFILE.currentLat),
    currentLng: clampFloat(raw?.currentLng, -180, 180, DEFAULT_LIFE_PROFILE.currentLng),
    priorityOrderAr: String(raw?.priorityOrderAr ?? DEFAULT_LIFE_PROFILE.priorityOrderAr)
      .trim()
      .slice(0, 260),
    personalNotes: String(raw?.personalNotes ?? DEFAULT_LIFE_PROFILE.personalNotes)
      .trim()
      .slice(0, 600),
  };
}

export function sanitizeDeviceSettings(
  raw: Partial<OnePlusDeviceSettings> | undefined
): OnePlusDeviceSettings {
  const leadRaw = raw?.liveAlertsLeadMinutes;
  const lead: LiveAlertsLeadMinutes = VALID_LEAD_MINUTES.includes(
    leadRaw as LiveAlertsLeadMinutes
  )
    ? (leadRaw as LiveAlertsLeadMinutes)
    : DEFAULT_DEVICE_SETTINGS.liveAlertsLeadMinutes;

  return {
    alertSliderLinked:
      typeof raw?.alertSliderLinked === 'boolean'
        ? raw.alertSliderLinked
        : DEFAULT_DEVICE_SETTINGS.alertSliderLinked,
    liveAlertsEnabled:
      typeof raw?.liveAlertsEnabled === 'boolean'
        ? raw.liveAlertsEnabled
        : DEFAULT_DEVICE_SETTINGS.liveAlertsEnabled,
    liveAlertsLeadMinutes: lead,
    aquaTouchMode:
      typeof raw?.aquaTouchMode === 'boolean'
        ? raw.aquaTouchMode
        : DEFAULT_DEVICE_SETTINGS.aquaTouchMode,
    ltpoNight1Hz:
      typeof raw?.ltpoNight1Hz === 'boolean'
        ? raw.ltpoNight1Hz
        : DEFAULT_DEVICE_SETTINGS.ltpoNight1Hz,
    pocketProtectionEnabled:
      typeof raw?.pocketProtectionEnabled === 'boolean'
        ? raw.pocketProtectionEnabled
        : DEFAULT_DEVICE_SETTINGS.pocketProtectionEnabled,
  };
}

export function sanitizeMedicationId(rawId: string): string {
  const clean = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  if (clean.length >= 1) return clean;
  return `med_${Date.now().toString(36)}`;
}

function sanitizeTimesList(raw: unknown, fallbackSingle?: string): string[] {
  const out: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const s = String(item ?? '').trim();
      if (/^[0-2][0-9]:[0-5][0-9]$/.test(s) && !out.includes(s)) {
        out.push(s);
      }
      if (out.length >= 6) break;
    }
  }
  if (out.length === 0 && fallbackSingle && /^[0-2][0-9]:[0-5][0-9]$/.test(fallbackSingle)) {
    out.push(fallbackSingle);
  }
  return out;
}

function sanitizeDoseKeysList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const s = String(item ?? '').trim().slice(0, 16);
    if (s.length >= 1 && !out.includes(s)) out.push(s);
    if (out.length >= 6) break;
  }
  return out;
}

export function sanitizeMedicationItem(raw: Partial<MedicationItem>): MedicationItem {
  const id = sanitizeMedicationId(raw.id || `med_${Date.now().toString(36)}`);
  const name = String(raw.name ?? '').trim().slice(0, 80) || 'علاج / مكمل';
  const rawTime = String(raw.time24 ?? '').trim();
  const safeSingle = /^[0-2][0-9]:[0-5][0-9]$/.test(rawTime) ? rawTime : '';
  const times24 = sanitizeTimesList(raw.times24, safeSingle);
  const time24 = times24[0] ?? safeSingle;
  const daysOfWeek = sanitizeWeekdayList(raw.daysOfWeek, []);
  const takenDosesToday = sanitizeDoseKeysList(raw.takenDosesToday);
  const doseNote = String(raw.doseNote ?? '').trim().slice(0, 120);
  const rawDateKey = String(raw.takenDateKey ?? '').trim();
  const takenDateKey = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rawDateKey) ? rawDateKey : '';
  const calendarEventId = String(raw.calendarEventId ?? '').trim().slice(0, 128);
  const rawCourseEnd = String(raw.courseEndDate ?? '').trim();
  const courseEndDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rawCourseEnd) ? rawCourseEnd : '';
  const remainingDoses =
    typeof raw.remainingDoses === 'number' && Number.isFinite(raw.remainingDoses)
      ? clampInt(raw.remainingDoses, -1, 500, -1)
      : -1;
  const totalDoses =
    typeof raw.totalDoses === 'number' && Number.isFinite(raw.totalDoses)
      ? clampInt(raw.totalDoses, -1, 500, -1)
      : -1;
  const refillAlertDays = clampInt(raw.refillAlertDays, 1, 14, 3);
  const takenDatesSet = new Set<string>();
  if (Array.isArray(raw.takenDates)) {
    for (const d of raw.takenDates) {
      const s = String(d ?? '').trim();
      if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) {
        takenDatesSet.add(s);
      }
    }
  }
  if (takenDateKey) {
    takenDatesSet.add(takenDateKey);
  }
  const takenDates = Array.from(takenDatesSet).sort().slice(-31);
  return {
    id,
    name,
    time24,
    times24,
    daysOfWeek,
    takenDosesToday,
    doseNote,
    takenDateKey,
    calendarEventId,
    courseEndDate,
    remainingDoses,
    totalDoses,
    refillAlertDays,
    takenDates,
  };
}

export function sanitizeCreativeActivityId(rawId: string): string {
  const clean = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  if (clean.length >= 1) return clean;
  return `act_${Date.now().toString(36)}`;
}

export function sanitizeCreativeActivityItem(
  raw: Partial<CreativeActivityItem>
): CreativeActivityItem {
  const id = sanitizeCreativeActivityId(raw.id || `act_${Date.now().toString(36)}`);
  const name = String(raw.name ?? '').trim().slice(0, 80) || 'نشاط إبداعي';
  const emoji = String(raw.emoji ?? '🎨').trim().slice(0, 16) || '🎨';
  const cadence: CreativeCadence =
    raw.cadence && VALID_CADENCES.includes(raw.cadence) ? raw.cadence : 'weekly';
  const fallbackGoal = cadence === 'daily' ? 1 : cadence === 'monthly' ? 8 : 3;
  const goalCount = clampInt(
    raw.goalCount ?? raw.weeklyGoalSessions,
    1,
    31,
    fallbackGoal
  );
  const weeklyGoalSessions = clampInt(
    raw.weeklyGoalSessions ?? Math.min(14, goalCount),
    1,
    14,
    Math.min(14, goalCount)
  );
  const sessionMinutes = clampInt(raw.sessionMinutes, 15, 240, 45);
  const loggedDates: string[] = [];
  if (Array.isArray(raw.loggedDates)) {
    for (const d of raw.loggedDates) {
      const s = String(d ?? '').trim();
      if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s) && !loggedDates.includes(s)) {
        loggedDates.push(s);
      }
    }
  }
  loggedDates.sort();
  const trimmedDates = loggedDates.slice(-31);
  const rawSched = String(raw.scheduledTime24 ?? '').trim();
  const scheduledTime24 = /^[0-2][0-9]:[0-5][0-9]$/.test(rawSched) ? rawSched : '';
  const calendarEventId = String(raw.calendarEventId ?? '').trim().slice(0, 128);
  const rawExpires = String(raw.expiresOnDate ?? '').trim();
  const expiresOnDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rawExpires) ? rawExpires : '';
  return {
    id,
    name,
    emoji,
    cadence,
    goalCount,
    weeklyGoalSessions,
    sessionMinutes,
    loggedDates: trimmedDates,
    scheduledTime24,
    calendarEventId,
    expiresOnDate,
  };
}

function sanitizeRhythmPayload(payload: SyncedRhythmPayload): SyncedRhythmPayload {
  const dateOk = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(payload.hydrationDateKey);
  const safeDateKey = dateOk
    ? payload.hydrationDateKey
    : new Date().toISOString().slice(0, 10);

  const rawWeekly = Array.isArray(payload.hydrationWeeklyCounts)
    ? payload.hydrationWeeklyCounts
    : [];
  const safeWeekly = Array.from({ length: 7 }, (_, i) =>
    clampInt(rawWeekly[i], 0, 40, 0)
  );

  const safeQuiet: QuietModeType = VALID_QUIET_MODES.includes(payload.quietMode)
    ? payload.quietMode
    : 'normal';
  const safeTheme: SurfaceTheme = VALID_THEMES.includes(payload.surfaceTheme)
    ? payload.surfaceTheme
    : 'amoled';

  const cleanSignal = sanitizeSyncSignal(payload.syncSignal);
  const cleanBattery = sanitizePhoneBattery(payload.phoneBattery);

  return {
    hydrationDateKey: safeDateKey,
    cupsLogged: clampInt(payload.cupsLogged, 0, 40, 0),
    targetCups: clampInt(payload.targetCups, 1, 40, 13),
    hydrationWeeklyCounts: safeWeekly,
    dailyCommitmentDays: clampInt(payload.dailyCommitmentDays, 0, 10000, 0),
    dailyCommitmentDoneToday: Boolean(payload.dailyCommitmentDoneToday),
    waterTargetDays: clampInt(payload.waterTargetDays, 0, 10000, 0),
    waterTargetDoneToday: Boolean(payload.waterTargetDoneToday),
    quietMode: safeQuiet,
    adhanOverrideSilent: Boolean(payload.adhanOverrideSilent),
    surfaceTheme: safeTheme,
    deviceSettings: sanitizeDeviceSettings(payload.deviceSettings),
    lifeProfile: sanitizeLifeProfile(payload.lifeProfile),
    ...(cleanSignal ? { syncSignal: cleanSignal } : {}),
    ...(cleanBattery ? { phoneBattery: cleanBattery } : {}),
  };
}

const knownCreatedAtByUid = new Map<string, Timestamp>();

export function subscribeUserRhythmState(
  uid: string,
  onRemoteState: (state: SyncedRhythmPayload) => void,
  onMissingDoc: () => void,
  onSyncError?: (message: string) => void
): Unsubscribe {
  const path = `users/${uid}`;
  const docRef = doc(db, 'users', uid);

  return createResilientSnapshot(
    (onHealthy, onError) =>
      onSnapshot(
        docRef,
        (snap) => {
          onHealthy();
          if (!snap.exists()) {
            onMissingDoc();
            return;
          }
          const data = snap.data();
          if (data.createdAt instanceof Timestamp) {
            knownCreatedAtByUid.set(uid, data.createdAt);
          }
          onRemoteState(
            sanitizeRhythmPayload({
              hydrationDateKey: String(data.hydrationDateKey ?? ''),
              cupsLogged: Number(data.cupsLogged ?? 0),
              targetCups: Number(data.targetCups ?? 13),
              hydrationWeeklyCounts: Array.isArray(data.hydrationWeeklyCounts)
                ? data.hydrationWeeklyCounts.map(Number)
                : [0, 0, 0, 0, 0, 0, 0],
              dailyCommitmentDays: Number(data.dailyCommitmentDays ?? 0),
              dailyCommitmentDoneToday: Boolean(data.dailyCommitmentDoneToday),
              waterTargetDays: Number(data.waterTargetDays ?? 0),
              waterTargetDoneToday: Boolean(data.waterTargetDoneToday),
              quietMode: (data.quietMode as QuietModeType) ?? 'normal',
              adhanOverrideSilent:
                typeof data.adhanOverrideSilent === 'boolean'
                  ? data.adhanOverrideSilent
                  : true,
              surfaceTheme: (data.surfaceTheme as SurfaceTheme) ?? 'amoled',
              deviceSettings: sanitizeDeviceSettings(
                data.deviceSettings as Partial<OnePlusDeviceSettings> | undefined
              ),
              lifeProfile: sanitizeLifeProfile(
                data.lifeProfile as Partial<LifeProfile> | undefined
              ),
              syncSignal: sanitizeSyncSignal(data.syncSignal),
              phoneBattery: sanitizePhoneBattery(data.phoneBattery),
            })
          );
        },
        onError
      ),
    OperationType.GET,
    path,
    onSyncError
  );
}

export async function publishWorkspaceSyncSignal(
  uid: string,
  signal: WorkspaceSyncSignal
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const cleanSignal = sanitizeSyncSignal(signal);
  if (!cleanSignal) return;
  try {
    const docRef = doc(db, 'users', uid);
    await updateDoc(docRef, {
      syncSignal: cleanSignal,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking: WebSocket + polling still reconcile
  }
}

export async function publishPhoneBatteryTelemetry(
  uid: string,
  telemetry: PhoneBatteryTelemetry
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const clean = sanitizePhoneBattery(telemetry);
  if (!clean) return;
  try {
    const docRef = doc(db, 'users', uid);
    await updateDoc(docRef, {
      phoneBattery: clean,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking: WebSocket still delivers instant live updates
  }
}

const ALLOWED_USER_DOC_KEYS = new Set([
  'uid',
  'hydrationDateKey',
  'cupsLogged',
  'targetCups',
  'hydrationWeeklyCounts',
  'dailyCommitmentDays',
  'dailyCommitmentDoneToday',
  'waterTargetDays',
  'waterTargetDoneToday',
  'quietMode',
  'adhanOverrideSilent',
  'surfaceTheme',
  'deviceSettings',
  'lifeProfile',
  'syncSignal',
  'phoneBattery',
  'createdAt',
  'updatedAt',
]);

const pendingUserSaves = new Map<string, Promise<void>>();

export async function saveUserRhythmState(
  uid: string,
  payload: SyncedRhythmPayload
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid || !auth.currentUser.emailVerified) return;
  const path = `users/${uid}`;
  const docRef = doc(db, 'users', uid);
  const clean = sanitizeRhythmPayload(payload);

  const attemptAtomicSave = async (isRetry: boolean): Promise<void> => {
    let existingSnap;
    try {
      existingSnap = await getDocFromServer(docRef);
    } catch {
      existingSnap = await getDoc(docRef);
    }

    const exists = existingSnap.exists();
    const existingData = exists ? (existingSnap.data() ?? {}) : null;

    if (existingData?.createdAt instanceof Timestamp) {
      knownCreatedAtByUid.set(uid, existingData.createdAt);
    }

    const runWrite = async () => {
      if (exists && existingData) {
        // Use updateDoc on existing documents so Firestore preserves the server's exact immutable createdAt
        // and never races with concurrent phoneBattery / syncSignal writes from another device.
        const updatePatch: Record<string, unknown> = {
          uid,
          ...clean,
          updatedAt: serverTimestamp(),
        };

        // Repair missing or non-Timestamp legacy createdAt (matches rules fallback)
        if (!(existingData.createdAt instanceof Timestamp)) {
          updatePatch.createdAt = serverTimestamp();
        }

        // Clean up any malformed optional maps or legacy unknown keys so hasOnly() always passes
        if ('syncSignal' in existingData && !('syncSignal' in updatePatch)) {
          const validSig = sanitizeSyncSignal(existingData.syncSignal);
          updatePatch.syncSignal = validSig ?? deleteField();
        }
        if ('phoneBattery' in existingData && !('phoneBattery' in updatePatch)) {
          const validBat = sanitizePhoneBattery(existingData.phoneBattery);
          updatePatch.phoneBattery = validBat ?? deleteField();
        }
        for (const key of Object.keys(existingData)) {
          if (!ALLOWED_USER_DOC_KEYS.has(key)) {
            updatePatch[key] = deleteField();
          }
        }

        await updateDoc(docRef, updatePatch);
      } else {
        const fullDoc: Record<string, unknown> = {
          uid,
          ...clean,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(docRef, fullDoc);
      }
    };

    try {
      if (!isRetry) {
        // Run first attempt directly so a recoverable create-vs-update race across PC <-> Mobile
        // can retry cleanly before surfacing a Firestore permission error.
        let attempt = 0;
        while (true) {
          try {
            await runWrite();
            return;
          } catch (err) {
            if (attempt < 2 && isTransientFirestoreError(err)) {
              const delayMs = computeExponentialBackoffMs(attempt, 800, 5_000);
              attempt += 1;
              await recoverFirestoreNetwork(false);
              await new Promise((r) => setTimeout(r, delayMs));
              continue;
            }
            throw err;
          }
        }
      } else {
        await withFirestoreWriteRetry(runWrite, OperationType.WRITE, path);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        !isRetry &&
        (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('not-found'))
      ) {
        await attemptAtomicSave(true);
        return;
      }
      if (!isRetry) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
      throw error;
    }
  };

  const prev = pendingUserSaves.get(uid) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => attemptAtomicSave(false));
  pendingUserSaves.set(uid, next);
  return next;
}

export function subscribeMedications(
  uid: string,
  onMedications: (items: MedicationItem[]) => void,
  onSyncError?: (message: string) => void
): Unsubscribe {
  const path = `users/${uid}/medications`;
  const colQuery = query(
    collection(db, 'users', uid, 'medications'),
    where('uid', '==', uid),
    limit(30)
  );

  return createResilientSnapshot(
    (onHealthy, onError) =>
      onSnapshot(
        colQuery,
        (snapshot) => {
          onHealthy();
          const items = snapshot.docs.map((d) => {
            const data = d.data();
            return sanitizeMedicationItem({
              id: String(data.id ?? d.id),
              name: String(data.name ?? ''),
              time24: String(data.time24 ?? ''),
              times24: Array.isArray(data.times24) ? data.times24.map(String) : undefined,
              daysOfWeek: Array.isArray(data.daysOfWeek) ? data.daysOfWeek.map(Number) : undefined,
              takenDosesToday: Array.isArray(data.takenDosesToday)
                ? data.takenDosesToday.map(String)
                : undefined,
              doseNote: String(data.doseNote ?? ''),
              takenDateKey: String(data.takenDateKey ?? ''),
              calendarEventId: String(data.calendarEventId ?? ''),
              courseEndDate: String(data.courseEndDate ?? ''),
              remainingDoses:
                typeof data.remainingDoses === 'number' ? data.remainingDoses : -1,
              totalDoses: typeof data.totalDoses === 'number' ? data.totalDoses : -1,
              refillAlertDays:
                typeof data.refillAlertDays === 'number' ? data.refillAlertDays : 3,
              takenDates: Array.isArray(data.takenDates) ? data.takenDates.map(String) : undefined,
            });
          });
          items.sort((a, b) => (a.time24 || '99:99').localeCompare(b.time24 || '99:99'));
          onMedications(items);
        },
        onError
      ),
    OperationType.LIST,
    path,
    onSyncError
  );
}

export async function upsertMedicationRecord(
  uid: string,
  med: MedicationItem
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const clean = sanitizeMedicationItem(med);
  const path = `users/${uid}/medications/${clean.id}`;
  const docRef = doc(db, 'users', uid, 'medications', clean.id);

  await withFirestoreWriteRetry(
    async () => {
      const existingSnap = await getDoc(docRef);
      if (!existingSnap.exists()) {
        await setDoc(docRef, {
          ...clean,
          uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(docRef, {
          name: clean.name,
          time24: clean.time24,
          times24: clean.times24 ?? [],
          daysOfWeek: clean.daysOfWeek ?? [],
          takenDosesToday: clean.takenDosesToday ?? [],
          takenDates: clean.takenDates ?? [],
          doseNote: clean.doseNote,
          takenDateKey: clean.takenDateKey,
          calendarEventId: clean.calendarEventId,
          courseEndDate: clean.courseEndDate ?? '',
          remainingDoses: clean.remainingDoses ?? -1,
          totalDoses: clean.totalDoses ?? -1,
          refillAlertDays: clean.refillAlertDays ?? 3,
          updatedAt: serverTimestamp(),
        });
      }
    },
    OperationType.WRITE,
    path
  );
}

export async function deleteMedicationRecord(
  uid: string,
  medicationId: string
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const cleanId = sanitizeMedicationId(medicationId);
  const path = `users/${uid}/medications/${cleanId}`;
  await withFirestoreWriteRetry(
    () => deleteDoc(doc(db, 'users', uid, 'medications', cleanId)),
    OperationType.DELETE,
    path
  );
}

export function subscribeCreativeActivities(
  uid: string,
  onActivities: (items: CreativeActivityItem[]) => void,
  onSyncError?: (message: string) => void
): Unsubscribe {
  const path = `users/${uid}/creativeActivities`;
  const colQuery = query(
    collection(db, 'users', uid, 'creativeActivities'),
    where('uid', '==', uid),
    limit(100)
  );

  return createResilientSnapshot(
    (onHealthy, onError) =>
      onSnapshot(
        colQuery,
        (snapshot) => {
          onHealthy();
          const items = snapshot.docs.map((d) => {
            const data = d.data();
            return sanitizeCreativeActivityItem({
              id: String(data.id ?? d.id),
              name: String(data.name ?? ''),
              emoji: String(data.emoji ?? '🎨'),
              cadence: data.cadence as CreativeCadence | undefined,
              goalCount: typeof data.goalCount === 'number' ? data.goalCount : undefined,
              weeklyGoalSessions: Number(data.weeklyGoalSessions ?? 3),
              sessionMinutes: Number(data.sessionMinutes ?? 45),
              loggedDates: Array.isArray(data.loggedDates) ? data.loggedDates.map(String) : [],
              scheduledTime24: String(data.scheduledTime24 ?? ''),
              calendarEventId: String(data.calendarEventId ?? ''),
              expiresOnDate: String(data.expiresOnDate ?? ''),
            });
          });
          items.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
          onActivities(items);
        },
        onError
      ),
    OperationType.LIST,
    path,
    onSyncError
  );
}

export async function upsertCreativeActivityRecord(
  uid: string,
  activity: CreativeActivityItem
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const clean = sanitizeCreativeActivityItem(activity);
  const path = `users/${uid}/creativeActivities/${clean.id}`;
  const docRef = doc(db, 'users', uid, 'creativeActivities', clean.id);

  await withFirestoreWriteRetry(
    async () => {
      const existingSnap = await getDoc(docRef);
      if (!existingSnap.exists()) {
        await setDoc(docRef, {
          ...clean,
          uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(docRef, {
          name: clean.name,
          emoji: clean.emoji,
          cadence: clean.cadence ?? 'weekly',
          goalCount: clean.goalCount ?? clean.weeklyGoalSessions,
          weeklyGoalSessions: clean.weeklyGoalSessions,
          sessionMinutes: clean.sessionMinutes,
          loggedDates: clean.loggedDates,
          scheduledTime24: clean.scheduledTime24,
          calendarEventId: clean.calendarEventId,
          expiresOnDate: clean.expiresOnDate ?? '',
          updatedAt: serverTimestamp(),
        });
      }
    },
    OperationType.WRITE,
    path
  );
}

export async function deleteCreativeActivityRecord(
  uid: string,
  activityId: string
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const cleanId = sanitizeCreativeActivityId(activityId);
  const path = `users/${uid}/creativeActivities/${cleanId}`;
  await withFirestoreWriteRetry(
    () => deleteDoc(doc(db, 'users', uid, 'creativeActivities', cleanId)),
    OperationType.DELETE,
    path
  );
}

export function sanitizeMemoryId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 56);
  return cleaned || `mem_${Date.now().toString(36)}`;
}

export function sanitizeMemoryItem(raw: Partial<MemoryItem>): MemoryItem {
  const id = sanitizeMemoryId(
    typeof raw.id === 'string' && raw.id.trim().length > 0
      ? raw.id.trim()
      : `mem_${Date.now().toString(36)}`
  );
  const category: MemoryCategory =
    raw.category && VALID_MEMORY_CATEGORIES.includes(raw.category)
      ? raw.category
      : 'general';
  const ruleText =
    typeof raw.ruleText === 'string' && raw.ruleText.trim().length > 0
      ? raw.ruleText.trim().slice(0, 600)
      : 'قاعدة شخصية';
  const source: MemoryItem['source'] =
    raw.source && VALID_MEMORY_SOURCES.includes(raw.source)
      ? raw.source
      : 'user';

  return { id, category, ruleText, source };
}

export function subscribeMemories(
  uid: string,
  onMemories: (items: MemoryItem[]) => void,
  onSyncError?: (message: string) => void
): Unsubscribe {
  const path = `users/${uid}/memories`;
  const colQuery = query(
    collection(db, 'users', uid, 'memories'),
    where('uid', '==', uid),
    limit(150)
  );

  return createResilientSnapshot(
    (onHealthy, onError) =>
      onSnapshot(
        colQuery,
        (snapshot) => {
          onHealthy();
          const items = snapshot.docs.map((d) => {
            const data = d.data();
            return sanitizeMemoryItem({
              id: String(data.id ?? d.id),
              category: data.category as MemoryCategory,
              ruleText: String(data.ruleText ?? ''),
              source: data.source as MemoryItem['source'],
            });
          });
          items.sort((a, b) => b.id.localeCompare(a.id));
          onMemories(items);
        },
        onError
      ),
    OperationType.LIST,
    path,
    onSyncError
  );
}

export async function upsertMemoryRecord(
  uid: string,
  memory: MemoryItem
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const clean = sanitizeMemoryItem(memory);
  const path = `users/${uid}/memories/${clean.id}`;
  const docRef = doc(db, 'users', uid, 'memories', clean.id);

  await withFirestoreWriteRetry(
    async () => {
      const existingSnap = await getDoc(docRef);
      if (!existingSnap.exists()) {
        await setDoc(docRef, {
          ...clean,
          uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(docRef, {
          category: clean.category,
          ruleText: clean.ruleText,
          updatedAt: serverTimestamp(),
        });
      }
    },
    OperationType.WRITE,
    path
  );
}

export async function deleteMemoryRecord(
  uid: string,
  memoryId: string
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const cleanId = sanitizeMemoryId(memoryId);
  const path = `users/${uid}/memories/${cleanId}`;
  await withFirestoreWriteRetry(
    () => deleteDoc(doc(db, 'users', uid, 'memories', cleanId)),
    OperationType.DELETE,
    path
  );
}

const VALID_CHAT_MODES: ReadonlyArray<PersistedChatMessage['mode']> = ['chat', 'maps', 'search'];

export function sanitizeChatMessageId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 56);
  return cleaned || `msg_${Date.now().toString(36)}`;
}

export function subscribeChatMessages(
  uid: string,
  onMessages: (items: PersistedChatMessage[]) => void,
  onSyncError?: (message: string) => void
): Unsubscribe {
  const path = `users/${uid}/chatMessages`;
  const colQuery = query(
    collection(db, 'users', uid, 'chatMessages'),
    where('uid', '==', uid),
    limit(100)
  );

  return createResilientSnapshot(
    (onHealthy, onError) =>
      onSnapshot(
        colQuery,
        (snapshot) => {
          onHealthy();
          const rows = snapshot.docs
            .map((d) => {
              const data = d.data();
              const text = typeof data.text === 'string' ? data.text.trim() : '';
              if (!text) return null;
              const role: 'user' | 'model' = data.role === 'user' ? 'user' : 'model';
              const rawMode = String(data.mode ?? 'chat') as PersistedChatMessage['mode'];
              const mode: PersistedChatMessage['mode'] = VALID_CHAT_MODES.includes(rawMode)
                ? rawMode
                : 'chat';
              const timestampMs =
                typeof data.timestampMs === 'number' && Number.isFinite(data.timestampMs)
                  ? data.timestampMs
                  : Date.now();
              const createdAtIso =
                typeof data.createdAtIso === 'string' && data.createdAtIso
                  ? data.createdAtIso
                  : new Date(timestampMs).toISOString();
              return {
                timestampMs,
                msg: {
                  id: String(data.id ?? d.id),
                  role,
                  mode,
                  text,
                  createdAtIso,
                } as PersistedChatMessage,
              };
            })
            .filter((item): item is { timestampMs: number; msg: PersistedChatMessage } => item !== null);

          rows.sort((a, b) => a.timestampMs - b.timestampMs);
          onMessages(rows.map((r) => r.msg));
        },
        onError
      ),
    OperationType.LIST,
    path,
    onSyncError
  );
}

export async function upsertChatMessageRecord(
  uid: string,
  message: PersistedChatMessage
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const trimmedText = (message.text ?? '').trim().slice(0, 4000);
  if (!trimmedText) return;
  const cleanId = sanitizeChatMessageId(message.id);
  const role: 'user' | 'model' = message.role === 'user' ? 'user' : 'model';
  const mode: PersistedChatMessage['mode'] = VALID_CHAT_MODES.includes(message.mode)
    ? message.mode
    : 'chat';
  const parsedTs = message.createdAtIso ? Date.parse(message.createdAtIso) : NaN;
  const timestampMs =
    Number.isFinite(parsedTs) && parsedTs >= 1_000_000_000_000 && parsedTs <= 4_102_444_800_000
      ? Math.round(parsedTs)
      : Date.now();
  const createdAtIso = (message.createdAtIso || new Date(timestampMs).toISOString()).slice(0, 40);
  const path = `users/${uid}/chatMessages/${cleanId}`;
  const docRef = doc(db, 'users', uid, 'chatMessages', cleanId);

  await withFirestoreWriteRetry(
    async () => {
      const existingSnap = await getDoc(docRef);
      if (!existingSnap.exists()) {
        await setDoc(docRef, {
          id: cleanId,
          uid,
          role,
          mode,
          text: trimmedText,
          timestampMs,
          createdAtIso,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(docRef, {
          text: trimmedText,
          updatedAt: serverTimestamp(),
        });
      }
    },
    OperationType.WRITE,
    path
  );
}

export async function clearUserChatMessages(
  uid: string,
  targetMode?: PersistedChatMessage['mode']
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const colQuery = query(
    collection(db, 'users', uid, 'chatMessages'),
    where('uid', '==', uid),
    limit(100)
  );
  const snap = await getDocs(colQuery);
  await Promise.all(
    snap.docs
      .filter((d) => !targetMode || String(d.data()?.mode ?? 'chat') === targetMode)
      .map((d) => deleteDoc(doc(db, 'users', uid, 'chatMessages', d.id)).catch(() => {}))
  );
}


