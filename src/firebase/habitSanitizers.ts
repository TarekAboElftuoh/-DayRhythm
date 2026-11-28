import { VALID_QUIET_MODES } from './typesAndDefaults';
import { sanitizePhoneBattery, sanitizeSyncSignal } from './fieldSanitizers';
import { sanitizeMedicationId } from './medSanitizers';
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

import { VALID_THEMES, sanitizeAppSyncSettings, type SyncedRhythmPayload } from './typesAndDefaults';
import { VALID_CADENCES, clampInt, sanitizeWeekdayList } from './fieldSanitizers';
import { sanitizeDeviceSettings, sanitizeLifeProfile } from './profileSanitizers';
import { sanitizeMedicationItem } from './medSanitizers';

import { sanitizeCreativeActivityId, sanitizeCreativeActivityItem } from './creativeSanitizers';
export { sanitizeCreativeActivityId, sanitizeCreativeActivityItem };

const VALID_HABIT_ANCHORS: ReadonlyArray<DynamicHabitAnchor> = [
  'after-fajr',
  'sunrise-light',
  'duha',
  'after-dhuhr',
  'after-asr',
  'pre-maghrib',
  'after-maghrib',
  'after-isha',
  'any-free-slot',
];

export function sanitizeHabitId(rawId: string): string {
  const clean = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  if (clean.length >= 1) return clean;
  return `hab_${Date.now().toString(36)}`;
}

export function sanitizeDynamicHabit(raw: Partial<DynamicHabit>): DynamicHabit {
  const id = sanitizeHabitId(String(raw.id ?? '').trim() || `hab_${Date.now().toString(36)}`);
  const title = String(raw.title ?? '').trim().slice(0, 100) || 'عادة يومية';
  const status: DynamicHabitStatus = raw.status === 'planned' ? 'planned' : 'active';
  const anchor: DynamicHabitAnchor =
    raw.anchor && VALID_HABIT_ANCHORS.includes(raw.anchor) ? raw.anchor : 'any-free-slot';
  const durationMin = clampInt(raw.durationMin, 5, 240, 30);
  const daysOfWeek = Array.isArray(raw.daysOfWeek)
    ? Array.from(
        new Set(
          raw.daysOfWeek
            .map((d) => Number(d))
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        )
      ).sort((a, b) => a - b)
    : undefined;
  const completedDates: string[] = [];
  if (Array.isArray(raw.completedDates)) {
    for (const d of raw.completedDates) {
      const s = String(d ?? '').trim();
      if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s) && !completedDates.includes(s)) {
        completedDates.push(s);
      }
    }
  }
  completedDates.sort();
  let cleanDailyOverrides: DynamicHabit['dailyOverrides'];
  if (raw.dailyOverrides && typeof raw.dailyOverrides === 'object' && !Array.isArray(raw.dailyOverrides)) {
    const entries = Object.entries(raw.dailyOverrides)
      .filter(([dateKey, ov]) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateKey) && ov && typeof ov === 'object')
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14);
    const out: NonNullable<DynamicHabit['dailyOverrides']> = {};
    for (const [dateKey, ov] of entries) {
      const startMin =
        typeof ov.startMin === 'number' && Number.isFinite(ov.startMin) && ov.startMin >= 0 && ov.startMin < 1440
          ? Math.round(ov.startMin)
          : undefined;
      const ovDur =
        typeof ov.durationMin === 'number' && Number.isFinite(ov.durationMin)
          ? clampInt(ov.durationMin, 5, 240, durationMin)
          : undefined;
      const unplaced = ov.unplaced === true ? true : undefined;
      const updatedAtMs =
        typeof ov.updatedAtMs === 'number' && Number.isFinite(ov.updatedAtMs)
          ? Math.round(ov.updatedAtMs)
          : undefined;
      if (startMin !== undefined || unplaced) {
        out[dateKey] = {
          ...(startMin !== undefined ? { startMin } : {}),
          ...(ovDur !== undefined ? { durationMin: ovDur } : {}),
          ...(unplaced ? { unplaced: true } : {}),
          ...(updatedAtMs !== undefined ? { updatedAtMs } : {}),
        };
      }
    }
    if (Object.keys(out).length > 0) {
      cleanDailyOverrides = out;
    }
  }
  return {
    id,
    title,
    status,
    anchor,
    durationMin,
    ...(daysOfWeek && daysOfWeek.length > 0 ? { daysOfWeek } : {}),
    ...(raw.skipOnFasting ? { skipOnFasting: true } : {}),
    completedDates: completedDates.slice(-60),
    ...(cleanDailyOverrides ? { dailyOverrides: cleanDailyOverrides } : {}),
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
  const safeSlotOpIds = Array.isArray(payload.hydrationSlotOpIds)
    ? payload.hydrationSlotOpIds.slice(0, 40).map((s) => (typeof s === 'string' ? s.slice(0, 48) : ''))
    : undefined;
  const safeRemovedOpIds = Array.isArray(payload.hydrationRemovedOpIds)
    ? payload.hydrationRemovedOpIds
        .slice(-80)
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.slice(0, 48))
    : undefined;
  const safeHydrationUpdatedAtMs =
    typeof payload.hydrationUpdatedAtMs === 'number' && Number.isFinite(payload.hydrationUpdatedAtMs)
      ? Math.max(0, Math.round(payload.hydrationUpdatedAtMs))
      : undefined;

  const safeQuiet: QuietModeType | undefined =
    payload.quietMode && VALID_QUIET_MODES.includes(payload.quietMode)
      ? payload.quietMode
      : undefined;
  const safeTheme: SurfaceTheme = VALID_THEMES.includes(payload.surfaceTheme)
    ? payload.surfaceTheme
    : 'amoled';

  const cleanSignal = sanitizeSyncSignal(payload.syncSignal);
  const cleanBattery = sanitizePhoneBattery(payload.phoneBattery);
  const cleanUiPrefs = sanitizeUiPrefs(payload.uiPrefs);
  const cleanAppSettings = sanitizeAppSyncSettings(payload.appSettings);
  const safeMedicationsUpdatedAt =
    typeof payload.medicationsUpdatedAt === 'number' && Number.isFinite(payload.medicationsUpdatedAt)
      ? Math.max(0, Math.round(payload.medicationsUpdatedAt))
      : undefined;
  const safeDeletedMedicationIds = Array.isArray(payload.deletedMedicationIds)
    ? payload.deletedMedicationIds
        .slice(-100)
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => sanitizeMedicationId(s))
    : undefined;
  const safeHabits = Array.isArray(payload.habits)
    ? payload.habits.slice(0, 100).map((h) => sanitizeDynamicHabit(h))
    : undefined;

  return {
    hydrationDateKey: safeDateKey,
    cupsLogged: clampInt(payload.cupsLogged, 0, 40, 0),
    targetCups: clampInt(payload.targetCups, 1, 40, 13),
    hydrationWeeklyCounts: safeWeekly,
    ...(safeSlotOpIds ? { hydrationSlotOpIds: safeSlotOpIds } : {}),
    ...(safeRemovedOpIds ? { hydrationRemovedOpIds: safeRemovedOpIds } : {}),
    ...(safeHydrationUpdatedAtMs !== undefined ? { hydrationUpdatedAtMs: safeHydrationUpdatedAtMs } : {}),
    dailyCommitmentDays: clampInt(payload.dailyCommitmentDays, 0, 10000, 0),
    dailyCommitmentDoneToday: Boolean(payload.dailyCommitmentDoneToday),
    waterTargetDays: clampInt(payload.waterTargetDays, 0, 10000, 0),
    waterTargetDoneToday: Boolean(payload.waterTargetDoneToday),
    ...(safeQuiet !== undefined ? { quietMode: safeQuiet } : {}),
    adhanOverrideSilent: Boolean(payload.adhanOverrideSilent),
    surfaceTheme: safeTheme,
    deviceSettings: sanitizeDeviceSettings(payload.deviceSettings),
    lifeProfile: sanitizeLifeProfile(payload.lifeProfile),
    ...(cleanSignal ? { syncSignal: cleanSignal } : {}),
    ...(cleanBattery ? { phoneBattery: cleanBattery } : {}),
    ...(cleanUiPrefs ? { uiPrefs: cleanUiPrefs } : {}),
    ...(cleanAppSettings ? { appSettings: cleanAppSettings } : {}),
    ...(safeMedicationsUpdatedAt !== undefined ? { medicationsUpdatedAt: safeMedicationsUpdatedAt } : {}),
    ...(safeDeletedMedicationIds ? { deletedMedicationIds: safeDeletedMedicationIds } : {}),
    ...(safeHabits ? { habits: safeHabits } : {}),
  };
}

