import { auth } from './core';
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
import { VALID_MEMORY_CATEGORIES, VALID_MEMORY_SOURCES } from './typesAndDefaults';
import { isFirestoreTimestamp } from './rhythmSubscriptions';

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

