import { auth } from './core';
import { VALID_QUIET_MODES } from './typesAndDefaults';
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
import type { OnePlusDeviceSettings } from './typesAndDefaults';
import { sanitizeDeviceSettings, sanitizeLifeProfile } from './profileSanitizers';

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

