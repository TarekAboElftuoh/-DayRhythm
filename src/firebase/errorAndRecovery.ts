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

import { auth, db } from './core';

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

export const FS_BASE_BACKOFF_MS = 1000;
export const FS_MAX_BACKOFF_MS = 30_000;
const FS_NETWORK_RESET_COOLDOWN_MS = 6_000;

let activeNetworkRecovery: Promise<void> | null = null;
let lastNetworkResetMs = 0;
export const activeListenerRecoverers = new Set<() => void>();

export function computeExponentialBackoffMs(attempt: number, baseMs = FS_BASE_BACKOFF_MS, maxMs = FS_MAX_BACKOFF_MS): number {
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

export function isTransientFirestoreError(error: unknown): boolean {
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

