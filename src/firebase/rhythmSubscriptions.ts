import { auth } from './core';
import { VALID_QUIET_MODES, type OnePlusDeviceSettings } from './typesAndDefaults';
import { sanitizePhoneBattery, sanitizeSyncSignal } from './fieldSanitizers';
import { sanitizeRhythmPayload } from './habitSanitizers';
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
import { createResilientSnapshot, withFirestoreWriteRetry } from './snapshotAndRetry';
import { DEFAULT_DEVICE_SETTINGS, DEFAULT_MEDICATIONS, DEFAULT_CREATIVE_ACTIVITIES, DEFAULT_HABITS, sanitizeAppSyncSettings, type SyncedRhythmPayload } from './typesAndDefaults';
import { sanitizeDeviceSettings, sanitizeLifeProfile } from './profileSanitizers';
import { sanitizeCreativeActivityItem, sanitizeDynamicHabit, sanitizeUiPrefs } from './habitSanitizers';
import { sanitizeMedicationItem } from './medSanitizers';

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

export const knownCreatedAtByUid = new Map<string, Timestamp>();

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
              hydrationSlotOpIds: Array.isArray(data.hydrationSlotOpIds)
                ? (data.hydrationSlotOpIds as string[])
                : undefined,
              hydrationRemovedOpIds: Array.isArray(data.hydrationRemovedOpIds)
                ? (data.hydrationRemovedOpIds as string[])
                : undefined,
              hydrationUpdatedAtMs:
                typeof data.hydrationUpdatedAtMs === 'number'
                  ? data.hydrationUpdatedAtMs
                  : undefined,
              dailyCommitmentDays: Number(data.dailyCommitmentDays ?? 0),
              dailyCommitmentDoneToday: Boolean(data.dailyCommitmentDoneToday),
              waterTargetDays: Number(data.waterTargetDays ?? 0),
              waterTargetDoneToday: Boolean(data.waterTargetDoneToday),
              ...(typeof data.quietMode === 'string' &&
              VALID_QUIET_MODES.includes(data.quietMode as QuietModeType)
                ? { quietMode: data.quietMode as QuietModeType }
                : {}),
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
              medicationsUpdatedAt:
                typeof data.medicationsUpdatedAt === 'number'
                  ? data.medicationsUpdatedAt
                  : undefined,
              deletedMedicationIds: Array.isArray(data.deletedMedicationIds)
                ? (data.deletedMedicationIds as string[])
                : undefined,
              habits: Array.isArray(data.habits)
                ? (data.habits as DynamicHabit[]).map((h) => sanitizeDynamicHabit(h))
                : undefined,
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
    await setDoc(
      docRef,
      {
        syncSignal: cleanSignal,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
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

export const ALLOWED_USER_DOC_KEYS = new Set([
  'uid',
  'hydrationDateKey',
  'cupsLogged',
  'targetCups',
  'hydrationWeeklyCounts',
  'hydrationSlotOpIds',
  'hydrationRemovedOpIds',
  'hydrationUpdatedAtMs',
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
  'medicationsUpdatedAt',
  'deletedMedicationIds',
  'habits',
  'createdAt',
  'updatedAt',
]);

