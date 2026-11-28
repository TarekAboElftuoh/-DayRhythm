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
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  CreativeActivityItem,
  CreativeCadence,
  DynamicHabit,
  DynamicHabitAnchor,
  DynamicHabitStatus,
  LifeProfile,
  MedicationFastingPolicy,
  MedicationItem,
  MemoryCategory,
  MemoryItem,
  PersistedChatMessage,
  PeriodicRitualStatus,
  PhoneBatteryTelemetry,
  PomodoroState,
  QuietModeType,
  SleepStrategy,
  SoundRepeatMap,
  SoundRepeatSetting,
  SurfaceTheme,
  TaskSoundCategory,
  TravelState,
  UiPrefs,
  WorkspaceSyncSignal,
} from '../types/dayrhythm';
import { DEFAULT_LIFE_PROFILE, DEFAULT_MEMORIES } from '../engines/lifeRhythmEngine';
import { DEFAULT_SOUND_REPEATS } from '../engines/audioEngine';



export function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? Math.round(val) : fallback;
  const clamped = Math.max(min, Math.min(max, n));
  return clamped === 0 ? 0 : clamped;
}

export function clampFloat(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  const clamped = Math.max(min, Math.min(max, Math.round(n * 10000) / 10000));
  return clamped === 0 ? 0 : clamped;
}

export function sanitizeWeekdayList(raw: unknown, fallback: number[]): number[] {
  if (!Array.isArray(raw)) return [...fallback];
  const unique = new Set<number>();
  for (const item of raw) {
    const n = typeof item === 'number' && Number.isFinite(item) ? Math.round(item) : -1;
    if (n >= 0 && n <= 6) unique.add(n === 0 ? 0 : n);
  }
  return Array.from(unique).slice(0, 7);
}

export const VALID_CADENCES: readonly CreativeCadence[] = ['daily', 'weekly', 'monthly'];
export const SOUND_CATEGORIES: readonly TaskSoundCategory[] = [
  'prayer',
  'water',
  'medication',
  'focus_work',
  'pomodoro',
  'walk_health',
  'sleep_suhoor',
  'meeting_event',
  'general',
];

export function sanitizeRepeatSetting(val: unknown, fallback: SoundRepeatSetting): SoundRepeatSetting {
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

