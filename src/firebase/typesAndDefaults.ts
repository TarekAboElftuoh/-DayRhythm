import { auth } from './core';
import { clampInt } from './fieldSanitizers';
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

import { db } from './core';
import { getCloudQuotaPausedUntil, handleFirestoreError, OperationType } from './errorAndRecovery';
import { withFirestoreWriteRetry } from './snapshotAndRetry';

export type LiveAlertsLeadMinutes = 5 | 10 | 15 | 20 | 30;

export interface OnePlusDeviceSettings {
  alertSliderLinked: boolean;
  liveAlertsEnabled: boolean;
  liveAlertsLeadMinutes: LiveAlertsLeadMinutes;
  liveAlertsAlwaysOn?: boolean;
  liveAlertsShowCharging?: boolean;
  persistentCountdownNotif?: boolean;
  aquaTouchMode: boolean;
  ltpoNight1Hz: boolean;
  pocketProtectionEnabled: boolean;
}

export const DEFAULT_DEVICE_SETTINGS: OnePlusDeviceSettings = {
  alertSliderLinked: false,
  liveAlertsEnabled: true,
  liveAlertsLeadMinutes: 10,
  liveAlertsAlwaysOn: false,
  liveAlertsShowCharging: true,
  persistentCountdownNotif: true,
  aquaTouchMode: true,
  ltpoNight1Hz: true,
  pocketProtectionEnabled: true,
};

export const DEFAULT_MEDICATIONS: MedicationItem[] = [];

export const DEFAULT_CREATIVE_ACTIVITIES: CreativeActivityItem[] = [];

export const DEFAULT_HABITS: DynamicHabit[] = [];

export interface SyncedRhythmPayload {
  hydrationDateKey: string;
  cupsLogged: number;
  targetCups: number;
  hydrationWeeklyCounts: number[];
  hydrationSlotOpIds?: string[];
  hydrationRemovedOpIds?: string[];
  hydrationUpdatedAtMs?: number;
  dailyCommitmentDays: number;
  dailyCommitmentDoneToday: boolean;
  waterTargetDays: number;
  waterTargetDoneToday: boolean;
  quietMode?: QuietModeType;
  adhanOverrideSilent: boolean;
  surfaceTheme: SurfaceTheme;
  deviceSettings: OnePlusDeviceSettings;
  lifeProfile: LifeProfile;
  syncSignal?: WorkspaceSyncSignal;
  phoneBattery?: PhoneBatteryTelemetry;
  uiPrefs?: UiPrefs;
  appSettings?: AppSyncSettings;
  medications?: MedicationItem[];
  medicationsUpdatedAt?: number;
  deletedMedicationIds?: string[];
  creativeActivities?: CreativeActivityItem[];
  habits?: DynamicHabit[];
  memories?: MemoryItem[];
  completedOverrides?: Record<string, boolean>;
  fastingOverride?: 'auto' | 'fasting' | 'normal';
  isFridayMode?: boolean;
  includeBiweeklyPcCleanup?: boolean;
  periodicRituals?: PeriodicRitualStatus[];
  travelState?: TravelState;
  pomodoro?: PomodoroState;
}

/** App preferences that must match on every device (they used to live only in localStorage). */
export interface AppSyncSettings {
  phoneChargeLimitPct: number;
  smartChargeAlertEnabled: boolean;
  smartChargeKeepUntilUnplugged: boolean;
  waterRemindersEnabled: boolean;
  sunMode: boolean;
  includePrayerAnchors?: boolean;
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
    includePrayerAnchors: o.includePrayerAnchors !== false,
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

export const VALID_LEAD_MINUTES: readonly LiveAlertsLeadMinutes[] = [5, 10, 15, 20, 30];
export const VALID_QUIET_MODES: readonly QuietModeType[] = [
  'normal',
  'mute_audio',
  'vibrate_only',
  'silent_all',
];
export const VALID_THEMES: readonly SurfaceTheme[] = ['amoled', 'obsidian'];
export const VALID_SLEEP_STRATEGIES: readonly SleepStrategy[] = [
  'night_only_strict',
  'biphasic_qailulah',
  'anchor_early_bed',
];
export const VALID_MEMORY_CATEGORIES: readonly MemoryCategory[] = [
  'priority',
  'sleep',
  'fasting',
  'hydration',
  'work_devops',
  'travel',
  'general',
];
export const VALID_MEMORY_SOURCES: readonly MemoryItem['source'][] = [
  'user',
  'gemini',
  'system_seed',
];

export { DEFAULT_MEMORIES };
