import { computeExponentialBackoffMs, isFirestoreQuotaError, isTransientFirestoreError, markCloudQuotaExhausted, recoverFirestoreNetwork } from './errorAndRecovery';
import { sanitizePhoneBattery, sanitizeSyncSignal } from './fieldSanitizers';
import { sanitizeUiPrefs } from './habitSanitizers';
import { isFirestoreTimestamp, knownCreatedAtByUid } from './rhythmSubscriptions';
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
import { getCloudQuotaPausedUntil, handleFirestoreError, OperationType } from './errorAndRecovery';
import { withFirestoreWriteRetry } from './snapshotAndRetry';
import type { SyncedRhythmPayload } from './typesAndDefaults';
import { sanitizeRhythmPayload } from './habitSanitizers';
import { ALLOWED_USER_DOC_KEYS } from './rhythmSubscriptions';

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
 * Direct real-time streak updater — writes immediately to Firestore.
 */
