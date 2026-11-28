import { OperationType, handleFirestoreError, recoverFirestoreNetwork } from './errorAndRecovery';
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
import { activeListenerRecoverers, computeExponentialBackoffMs, isFirestoreQuotaError, isTransientFirestoreError, markCloudQuotaExhausted, triggerFirestoreRecovery } from './errorAndRecovery';

export function createResilientSnapshot(
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

export async function withFirestoreWriteRetry<T>(
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

