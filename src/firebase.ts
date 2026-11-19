import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  limit,
  onSnapshot,
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
export const db = getFirestore(app, configuredDbId);
export const auth = getAuth(app);

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

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
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

export const DEFAULT_MEDICATIONS: MedicationItem[] = [
  {
    id: 'pumpkin_seed_oil',
    name: 'زيت بذور اليقطين',
    time24: '',
    times24: [],
    daysOfWeek: [],
    takenDosesToday: [],
    doseNote: 'اسأل Gemini أو اضبط ميعادها',
    takenDateKey: '',
    calendarEventId: '',
  },
];

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

  return onSnapshot(
    docRef,
    (snap) => {
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
        })
      );
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (err) {
        onSyncError?.(err instanceof Error ? err.message : String(err));
      }
    }
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

const pendingUserSaves = new Map<string, Promise<void>>();

export async function saveUserRhythmState(
  uid: string,
  payload: SyncedRhythmPayload
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
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

    let preservedCreatedAt: Timestamp | null = null;
    if (existingData?.createdAt instanceof Timestamp) {
      preservedCreatedAt = existingData.createdAt;
      knownCreatedAtByUid.set(uid, preservedCreatedAt);
    } else if (exists && knownCreatedAtByUid.has(uid)) {
      preservedCreatedAt = knownCreatedAtByUid.get(uid) ?? null;
    }

    const preservedSignal =
      clean.syncSignal ?? (existingData ? sanitizeSyncSignal(existingData.syncSignal) : undefined);

    // Atomic full-document setDoc (no merge): guarantees ZERO legacy/unknown fields can survive
    // while preserving the server's immutable createdAt Timestamp when present.
    const fullDoc: Record<string, unknown> = {
      uid,
      ...clean,
      ...(preservedSignal ? { syncSignal: preservedSignal } : {}),
      createdAt: preservedCreatedAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(docRef, fullDoc);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!isRetry && msg.toLowerCase().includes('permission')) {
        // Handle simultaneous first-create race across PC <-> Mobile by re-fetching server createdAt once
        await attemptAtomicSave(true);
        return;
      }
      console.warn('DayRhythm Firestore write diagnostic:', {
        hadExistingDoc: exists,
        existingCreatedAtType: existingData
          ? existingData.createdAt instanceof Timestamp
            ? 'Timestamp'
            : existingData.createdAt === null
              ? 'null'
              : typeof existingData.createdAt
          : 'no_doc',
        existingUidMatches: existingData ? existingData.uid === uid : false,
        existingKeys: existingData ? Object.keys(existingData) : [],
        fullDocKeys: Object.keys(fullDoc),
        lifeProfileKeys: Object.keys(clean.lifeProfile),
      });
      handleFirestoreError(error, OperationType.WRITE, path);
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

  return onSnapshot(
    colQuery,
    (snapshot) => {
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
        });
      });
      items.sort((a, b) => (a.time24 || '99:99').localeCompare(b.time24 || '99:99'));
      onMedications(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (err) {
        onSyncError?.(err instanceof Error ? err.message : String(err));
      }
    }
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

  try {
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
        doseNote: clean.doseNote,
        takenDateKey: clean.takenDateKey,
        calendarEventId: clean.calendarEventId,
        courseEndDate: clean.courseEndDate ?? '',
        remainingDoses: clean.remainingDoses ?? -1,
        totalDoses: clean.totalDoses ?? -1,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMedicationRecord(
  uid: string,
  medicationId: string
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const cleanId = sanitizeMedicationId(medicationId);
  const path = `users/${uid}/medications/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'medications', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
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

  return onSnapshot(
    colQuery,
    (snapshot) => {
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
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (err) {
        onSyncError?.(err instanceof Error ? err.message : String(err));
      }
    }
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

  try {
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
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCreativeActivityRecord(
  uid: string,
  activityId: string
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const cleanId = sanitizeCreativeActivityId(activityId);
  const path = `users/${uid}/creativeActivities/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'creativeActivities', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
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
      ? raw.ruleText.trim().slice(0, 320)
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
    limit(50)
  );

  return onSnapshot(
    colQuery,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return sanitizeMemoryItem({
          id: String(data.id ?? d.id),
          category: data.category as MemoryCategory,
          ruleText: String(data.ruleText ?? ''),
          source: data.source as MemoryItem['source'],
        });
      });
      // Keep system_seed foundational memories in stable order, newest custom rules at the top
      const seedOrder = DEFAULT_MEMORIES.map((m) => m.id);
      items.sort((a, b) => {
        const ia = seedOrder.indexOf(a.id);
        const ib = seedOrder.indexOf(b.id);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return 1;
        if (ib !== -1) return -1;
        return b.id.localeCompare(a.id);
      });
      onMemories(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (err) {
        onSyncError?.(err instanceof Error ? err.message : String(err));
      }
    }
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

  try {
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
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMemoryRecord(
  uid: string,
  memoryId: string
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const cleanId = sanitizeMemoryId(memoryId);
  const path = `users/${uid}/memories/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'memories', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

