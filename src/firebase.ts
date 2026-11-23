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
  persistentSingleTabManager,
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
  UiPrefs,
  WorkspaceSyncSignal,
} from './types/dayrhythm';
import { DEFAULT_LIFE_PROFILE, DEFAULT_MEMORIES } from './engines/lifeRhythmEngine';
import { DEFAULT_SOUND_REPEATS } from './engines/audioEngine';

export const app =
  getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

const configuredDbId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-dayrhythm-1f2dd321-5d9e-4566-bb4c-87a3962fa6f7';

/**
 * What the Android background service needs to send/receive the "alarm dismissed" signal on its
 * own (when the app's WebView isn't running): project ids + the signed-in user's Firebase
 * refresh token. It stays in the app's private storage on the phone.
 */
export function getNativeCloudAuthPayload(): string | null {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;
  const refreshToken =
    user.refreshToken ||
    (user as unknown as { stsTokenManager?: { refreshToken?: string } }).stsTokenManager?.refreshToken;
  if (!refreshToken) return null;
  return JSON.stringify({
    apiKey: firebaseConfig.apiKey,
    projectId: firebaseConfig.projectId,
    databaseId: configuredDbId,
    uid: user.uid,
    refreshToken,
  });
}

function createResilientFirestore() {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentSingleTabManager(undefined),
        }),
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

// While the daily quota is spent, writes are rejected and Firestore rolls back its optimistic local
// copy — the listeners then deliver the OLD values (a just-logged cup vanishes). The app keeps its
// local state as the truth during this pause and pushes it once the pause ends.
let cloudQuotaPausedUntil = 0;
export function getCloudQuotaPausedUntil(): number {
  return cloudQuotaPausedUntil;
}
export function markCloudQuotaExhausted(): void {
  cloudQuotaPausedUntil = Date.now() + 15 * 60_000;
  try {
    window.dispatchEvent(
      new CustomEvent('dayrhythm:cloud-quota', { detail: { until: cloudQuotaPausedUntil } })
    );
  } catch {
    // non-browser context
  }
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  if (isFirestoreQuotaError(error)) markCloudQuotaExhausted();
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

/**
 * The free-tier database has a hard daily read quota. Once it's spent every request fails until the
 * daily reset, so retrying (and resetting the network, which re-attaches listeners) only burns more.
 */
export function isFirestoreQuotaError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return msg.includes('quota') || msg.includes('free daily read units');
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
  if (isFirestoreQuotaError(error)) {
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
  persistentCountdownNotif?: boolean;
  aquaTouchMode: boolean;
  ltpoNight1Hz: boolean;
  pocketProtectionEnabled: boolean;
}

export const DEFAULT_DEVICE_SETTINGS: OnePlusDeviceSettings = {
  alertSliderLinked: false,
  liveAlertsEnabled: true,
  liveAlertsLeadMinutes: 10,
  persistentCountdownNotif: true,
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
  uiPrefs?: UiPrefs;
  appSettings?: AppSyncSettings;
  medications?: MedicationItem[];
  creativeActivities?: CreativeActivityItem[];
  memories?: MemoryItem[];
}

/** App preferences that must match on every device (they used to live only in localStorage). */
export interface AppSyncSettings {
  phoneChargeLimitPct: number;
  smartChargeAlertEnabled: boolean;
  smartChargeKeepUntilUnplugged: boolean;
  waterRemindersEnabled: boolean;
  sunMode: boolean;
}

export function sanitizeAppSyncSettings(raw: unknown): AppSyncSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  return {
    phoneChargeLimitPct: clampInt(o.phoneChargeLimitPct, 60, 100, 90),
    smartChargeAlertEnabled: o.smartChargeAlertEnabled !== false,
    smartChargeKeepUntilUnplugged: o.smartChargeKeepUntilUnplugged !== false,
    waterRemindersEnabled: o.waterRemindersEnabled !== false,
    sunMode: o.sunMode === true,
  };
}

/**
 * Written on its own (only `appSettings` + `updatedAt` change) so that, until the updated Firestore
 * rules are published, a rejection here can't break the main state saves.
 */
export async function saveUserAppSettings(uid: string, settings: AppSyncSettings): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const clean = sanitizeAppSyncSettings(settings);
  if (!clean) return;
  try {
    await updateDoc(doc(db, 'users', uid), { appSettings: clean, updatedAt: serverTimestamp() });
  } catch {
    // rules not published yet, or offline — the next change retries
  }
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
    !['calendar', 'tasks', 'all', 'alarm_dismiss', 'alarm_trigger'].includes(scopeRaw)
  ) {
    return undefined;
  }
  return {
    opId,
    clientId,
    scope: scopeRaw as WorkspaceSyncSignal['scope'],
    action,
    timestampMs,
    // No `extra` here: this object is written to Firestore, whose rules allow exactly these five
    // keys — an `extra` map got every signal rejected, and `extra: undefined` made the SDK refuse
    // the write outright. Rich alert content travels over the WebSocket only.
  };
}

export function sanitizePhoneBattery(raw: unknown): PhoneBatteryTelemetry | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.levelPct !== 'number' || !Number.isFinite(r.levelPct)) return undefined;
  const levelPct = clampInt(r.levelPct, 0, 100, 0);
  const charging = Boolean(r.charging);
  const chargeLimitPct = clampInt(r.chargeLimitPct, 60, 100, 90);
  const rawEta =
    typeof r.chargeTimeRemainingMin === 'number' && Number.isFinite(r.chargeTimeRemainingMin)
      ? clampInt(r.chargeTimeRemainingMin, -1, 1440, -1)
      : undefined;
  const updatedAtMs =
    typeof r.updatedAtMs === 'number' && Number.isFinite(r.updatedAtMs) && r.updatedAtMs >= 0
      ? Math.round(r.updatedAtMs)
      : Date.now();
  const deviceLabel = String(r.deviceLabel ?? 'الهاتف').trim().slice(0, 40) || 'الهاتف';
  return {
    levelPct,
    charging,
    chargeLimitPct,
    ...(rawEta !== undefined ? { chargeTimeRemainingMin: rawEta } : {}),
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
    defaultSnoozeMinutes:
      raw?.defaultSnoozeMinutes === 10 || raw?.defaultSnoozeMinutes === 15
        ? raw.defaultSnoozeMinutes
        : 5,
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
    persistentCountdownNotif:
      typeof raw?.persistentCountdownNotif === 'boolean'
        ? raw.persistentCountdownNotif
        : DEFAULT_DEVICE_SETTINGS.persistentCountdownNotif ?? true,
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
  // Rolling 7-day window: keep only dates within the last 7 days so day 8 drops automatically
  const cutoffDate = new Date(Date.now() - 6 * 86_400_000);
  const cutoffIso = cutoffDate.toISOString().slice(0, 10);
  const takenDates = Array.from(takenDatesSet)
    .filter((d) => d >= cutoffIso)
    .sort()
    .slice(-7);
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

export function sanitizeUiPrefs(raw: unknown): UiPrefs | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const selectedLogoId = String(obj.selectedLogoId ?? '').trim().slice(0, 40);
  if (!selectedLogoId) return undefined;
  const capsuleOrientation: UiPrefs['capsuleOrientation'] =
    obj.capsuleOrientation === 'vertical' ? 'vertical' : 'horizontal';
  const capsuleSize: UiPrefs['capsuleSize'] =
    obj.capsuleSize === 'sm' || obj.capsuleSize === 'lg' ? obj.capsuleSize : 'md';
  const rawCloudApiUrl =
    typeof obj.cloudApiUrl === 'string' ? obj.cloudApiUrl.trim().replace(/\/+$/, '').slice(0, 240) : '';
  const cloudApiUrl =
    rawCloudApiUrl && /^https?:\/\//i.test(rawCloudApiUrl) ? rawCloudApiUrl : undefined;
  return {
    selectedLogoId,
    capsuleOrientation,
    capsuleSize,
    ...(cloudApiUrl ? { cloudApiUrl } : {}),
  };
}

export function sanitizeRhythmPayload(payload: SyncedRhythmPayload): SyncedRhythmPayload {
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
  const cleanUiPrefs = sanitizeUiPrefs(payload.uiPrefs);
  const cleanAppSettings = sanitizeAppSyncSettings(payload.appSettings);

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
    ...(cleanUiPrefs ? { uiPrefs: cleanUiPrefs } : {}),
    ...(cleanAppSettings ? { appSettings: cleanAppSettings } : {}),
  };
}

export function isFirestoreTimestamp(val: unknown): val is Timestamp {
  return (
    val instanceof Timestamp ||
    (typeof val === 'object' &&
      val !== null &&
      (typeof (val as { toMillis?: unknown }).toMillis === 'function' ||
        (typeof (val as { seconds?: unknown }).seconds === 'number' &&
          typeof (val as { nanoseconds?: unknown }).nanoseconds === 'number')))
  );
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
          if (isFirestoreTimestamp(data.createdAt)) {
            knownCreatedAtByUid.set(uid, data.createdAt as Timestamp);
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
              uiPrefs: sanitizeUiPrefs(data.uiPrefs),
              appSettings: sanitizeAppSyncSettings(data.appSettings),
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

export async function saveUserUiPrefs(
  uid: string,
  uiPrefs: UiPrefs
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const clean = sanitizeUiPrefs(uiPrefs);
  if (!clean) return;
  try {
    const docRef = doc(db, 'users', uid);
    await updateDoc(docRef, {
      uiPrefs: clean,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking: full state save will also sync uiPrefs
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
  'uiPrefs',
  'appSettings',
  'createdAt',
  'updatedAt',
]);

const pendingUserSaves = new Map<string, Promise<void>>();

export async function saveUserRhythmState(
  uid: string,
  payload: SyncedRhythmPayload,
  onlyKeys?: ReadonlyArray<keyof SyncedRhythmPayload>
): Promise<void> {
  if (
    !auth.currentUser ||
    auth.currentUser.uid !== uid ||
    auth.currentUser.isAnonymous
  ) {
    return;
  }
  const path = `users/${uid}`;
  const docRef = doc(db, 'users', uid);
  const clean = sanitizeRhythmPayload(payload);

  // Field-level patch: each device only writes the fields IT changed. Writing the whole document
  // from every device meant a device holding a stale value (e.g. cupsLogged: 0 from before the
  // phone logged two cups) silently overwrote the real value the next time it saved anything at
  // all — the "cups reset on refresh" bug. No server read first either: the doc is known to
  // exist, and that read was a full network round-trip of delay before every write.
  if (onlyKeys && onlyKeys.length > 0 && knownCreatedAtByUid.has(uid)) {
    const patch: Record<string, unknown> = { uid, updatedAt: serverTimestamp() };
    for (const key of onlyKeys) {
      if (clean[key] !== undefined) patch[key] = clean[key];
    }
    try {
      await updateDoc(docRef, patch);
      return;
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markCloudQuotaExhausted();
        throw err;
      }
      // Legacy/malformed doc that only a full write can repair — fall through to it.
    }
  }

  const attemptAtomicSave = async (isRetry: boolean): Promise<void> => {
    let existingSnap;
    try {
      existingSnap = await getDocFromServer(docRef);
    } catch {
      existingSnap = await getDoc(docRef);
    }

    const fromCache = existingSnap.metadata.fromCache;
    const exists = existingSnap.exists();
    const existingData = exists ? (existingSnap.data() ?? {}) : null;

    if (existingData && isFirestoreTimestamp(existingData.createdAt)) {
      knownCreatedAtByUid.set(uid, existingData.createdAt);
    }

    const runWrite = async () => {
      const treatAsExisting = (exists && existingData !== null) || (fromCache && knownCreatedAtByUid.has(uid));

      if (treatAsExisting) {
        // Use updateDoc on existing documents so Firestore preserves the server's exact immutable createdAt
        // and never races with concurrent phoneBattery / syncSignal writes from another device.
        const updatePatch: Record<string, unknown> = {
          uid,
          ...clean,
          updatedAt: serverTimestamp(),
        };

        // NEVER overwrite createdAt if the document already has one on server
        if (
          !fromCache &&
          existingData &&
          (!('createdAt' in existingData) || existingData.createdAt === null || existingData.createdAt === undefined) &&
          !knownCreatedAtByUid.has(uid)
        ) {
          updatePatch.createdAt = serverTimestamp();
        } else {
          delete updatePatch.createdAt;
        }

        // Clean up any malformed optional maps or legacy unknown keys so hasOnly() always passes
        if (existingData) {
          if ('syncSignal' in existingData && !('syncSignal' in updatePatch)) {
            const validSig = sanitizeSyncSignal(existingData.syncSignal);
            updatePatch.syncSignal = validSig ?? deleteField();
          }
          if ('phoneBattery' in existingData && !('phoneBattery' in updatePatch)) {
            const validBat = sanitizePhoneBattery(existingData.phoneBattery);
            updatePatch.phoneBattery = validBat ?? deleteField();
          }
          if ('uiPrefs' in existingData && !('uiPrefs' in updatePatch)) {
            const validUi = sanitizeUiPrefs(existingData.uiPrefs);
            updatePatch.uiPrefs = validUi ?? deleteField();
          }
          for (const key of Object.keys(existingData)) {
            if (!ALLOWED_USER_DOC_KEYS.has(key)) {
              updatePatch[key] = deleteField();
            }
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

/**
 * Direct real-time hydration updater — writes immediately to Firestore (matching upsertMedicationRecord pattern).
 * Completely eliminates debounce delay, ensures cross-device consistency, and prevents local state reversion.
 */
export async function saveHydrationRecord(
  uid: string,
  data: {
    hydrationDateKey: string;
    cupsLogged: number;
    targetCups: number;
    hydrationWeeklyCounts: number[];
    waterTargetDays?: number;
    waterTargetDoneToday?: boolean;
  }
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid || auth.currentUser.isAnonymous) return;
  const docRef = doc(db, 'users', uid);
  const safeDateKey = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(data.hydrationDateKey)
    ? data.hydrationDateKey
    : new Date().toISOString().slice(0, 10);
  const rawWeekly = Array.isArray(data.hydrationWeeklyCounts) ? data.hydrationWeeklyCounts : [];
  const safeWeekly = Array.from({ length: 7 }, (_, i) => clampInt(rawWeekly[i], 0, 40, 0));

  const patch: Record<string, unknown> = {
    uid,
    hydrationDateKey: safeDateKey,
    cupsLogged: clampInt(data.cupsLogged, 0, 40, 0),
    targetCups: clampInt(data.targetCups, 1, 40, 13),
    hydrationWeeklyCounts: safeWeekly,
    updatedAt: serverTimestamp(),
  };

  if (typeof data.waterTargetDays === 'number') {
    patch.waterTargetDays = clampInt(data.waterTargetDays, 0, 10000, 0);
  }
  if (typeof data.waterTargetDoneToday === 'boolean') {
    patch.waterTargetDoneToday = Boolean(data.waterTargetDoneToday);
  }

  await withFirestoreWriteRetry(
    async () => {
      try {
        await updateDoc(docRef, patch);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes('not-found') || msg.toLowerCase().includes('no document to update')) {
          const snap = await getDoc(docRef);
          if (!snap.exists()) {
            await setDoc(docRef, {
              ...patch,
              dailyCommitmentDays: 0,
              dailyCommitmentDoneToday: false,
              waterTargetDays: data.waterTargetDays ?? 0,
              waterTargetDoneToday: data.waterTargetDoneToday ?? false,
              quietMode: 'normal',
              adhanOverrideSilent: true,
              surfaceTheme: 'amoled',
              deviceSettings: DEFAULT_DEVICE_SETTINGS,
              lifeProfile: DEFAULT_LIFE_PROFILE,
              createdAt: serverTimestamp(),
            });
            return;
          }
        }
        throw err;
      }
    },
    OperationType.WRITE,
    `users/${uid}`
  );
}

/**
 * Direct real-time streak updater — writes immediately to Firestore.
 */
export async function saveStreaksRecord(
  uid: string,
  streaks: {
    dailyCommitmentDays: number;
    dailyCommitmentDoneToday: boolean;
    waterTargetDays?: number;
    waterTargetDoneToday?: boolean;
  }
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid || auth.currentUser.isAnonymous) return;
  const docRef = doc(db, 'users', uid);
  const patch: Record<string, unknown> = {
    uid,
    dailyCommitmentDays: clampInt(streaks.dailyCommitmentDays, 0, 10000, 0),
    dailyCommitmentDoneToday: Boolean(streaks.dailyCommitmentDoneToday),
    updatedAt: serverTimestamp(),
  };
  if (typeof streaks.waterTargetDays === 'number') {
    patch.waterTargetDays = clampInt(streaks.waterTargetDays, 0, 10000, 0);
  }
  if (typeof streaks.waterTargetDoneToday === 'boolean') {
    patch.waterTargetDoneToday = Boolean(streaks.waterTargetDoneToday);
  }
  await withFirestoreWriteRetry(
    async () => {
      await updateDoc(docRef, patch);
    },
    OperationType.WRITE,
    `users/${uid}`
  );
}

/**
 * Direct real-time quiet mode updater — writes immediately to Firestore.
 */
export async function saveQuietModeRecord(
  uid: string,
  settings: {
    quietMode: QuietModeType;
    adhanOverrideSilent?: boolean;
  }
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid || auth.currentUser.isAnonymous) return;
  const docRef = doc(db, 'users', uid);
  const safeQuiet: QuietModeType = VALID_QUIET_MODES.includes(settings.quietMode)
    ? settings.quietMode
    : 'normal';
  const patch: Record<string, unknown> = {
    uid,
    quietMode: safeQuiet,
    updatedAt: serverTimestamp(),
  };
  if (typeof settings.adhanOverrideSilent === 'boolean') {
    patch.adhanOverrideSilent = settings.adhanOverrideSilent;
  }
  await withFirestoreWriteRetry(
    async () => {
      await updateDoc(docRef, patch);
    },
    OperationType.WRITE,
    `users/${uid}`
  );
}

/**
 * Direct real-time LifeProfile updater — writes immediately to Firestore.
 */
export async function saveLifeProfileRecord(
  uid: string,
  profile: Partial<LifeProfile>
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid || auth.currentUser.isAnonymous) return;
  const docRef = doc(db, 'users', uid);
  const clean = sanitizeLifeProfile(profile);
  await withFirestoreWriteRetry(
    async () => {
      await updateDoc(docRef, {
        uid,
        lifeProfile: clean,
        updatedAt: serverTimestamp(),
      });
    },
    OperationType.WRITE,
    `users/${uid}`
  );
}

/**
 * Direct real-time device settings updater — writes immediately to Firestore.
 */
export async function saveDeviceSettingsRecord(
  uid: string,
  settings: Partial<OnePlusDeviceSettings>
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid || auth.currentUser.isAnonymous) return;
  const docRef = doc(db, 'users', uid);
  const clean = sanitizeDeviceSettings(settings);
  await withFirestoreWriteRetry(
    async () => {
      await updateDoc(docRef, {
        uid,
        deviceSettings: clean,
        updatedAt: serverTimestamp(),
      });
    },
    OperationType.WRITE,
    `users/${uid}`
  );
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
              let timestampMs =
                typeof data.timestampMs === 'number' && Number.isFinite(data.timestampMs) && data.timestampMs > 1_000_000_000_000
                  ? data.timestampMs
                  : 0;

              if (!timestampMs && typeof data.createdAtIso === 'string' && data.createdAtIso) {
                const parsed = Date.parse(data.createdAtIso);
                if (Number.isFinite(parsed) && parsed > 1_000_000_000_000) {
                  timestampMs = parsed;
                }
              }

              if (!timestampMs && data.createdAt) {
                if (typeof data.createdAt.toMillis === 'function') {
                  const ms = data.createdAt.toMillis();
                  if (Number.isFinite(ms) && ms > 1_000_000_000_000) timestampMs = ms;
                } else if (typeof data.createdAt.seconds === 'number') {
                  timestampMs = data.createdAt.seconds * 1000;
                }
              }

              if (!timestampMs) {
                const docId = String(data.id ?? d.id);
                const match = docId.match(/\b(?:u|m|msg|chat)-(\d{12,14})\b/);
                if (match) {
                  const parsed = parseInt(match[1], 10);
                  if (Number.isFinite(parsed) && parsed > 1_000_000_000_000) {
                    timestampMs = parsed;
                  }
                }
              }

              if (!timestampMs) {
                timestampMs = 0;
              }

              const createdAtIso =
                typeof data.createdAtIso === 'string' && data.createdAtIso
                  ? data.createdAtIso
                  : timestampMs > 0
                    ? new Date(timestampMs).toISOString()
                    : undefined;

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

          rows.sort((a, b) => {
            if (a.timestampMs !== b.timestampMs) {
              return a.timestampMs - b.timestampMs;
            }
            if (a.msg.role === 'user' && b.msg.role === 'model') return -1;
            if (a.msg.role === 'model' && b.msg.role === 'user') return 1;
            return a.msg.id.localeCompare(b.msg.id);
          });
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
  message: PersistedChatMessage,
  knownToExist?: boolean
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
      // Every message write used to read the doc first. The caller already knows whether the
      // message is in the cloud (it came from the snapshot or was written before), and the
      // free-tier database has a hard daily read cap that, once spent, blocks ALL writes.
      const exists = knownToExist ?? (await getDoc(docRef)).exists();
      if (!exists) {
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


