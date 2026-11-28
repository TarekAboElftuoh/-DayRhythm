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
import { isFirestoreTimestamp } from './rhythmSubscriptions';

const VALID_CHAT_MODES: ReadonlyArray<PersistedChatMessage['mode']> = ['chat', 'maps', 'search'];

export function sanitizeChatMessageId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 56);
  return cleaned || `msg_${Date.now().toString(36)}`;
}

export function subscribeChatMessages(
  uid: string,
  onMessages: (items: PersistedChatMessage[]) => void,
  onSyncError?: (message: string) => void
): Unsubscribe {
  const path = `users/${uid}/chatMessages`;
  const colQuery = query(
    collection(db, 'users', uid, 'chatMessages'),
    where('uid', '==', uid),
    limit(100)
  );

  return createResilientSnapshot(
    (onHealthy, onError) =>
      onSnapshot(
        colQuery,
        (snapshot) => {
          onHealthy();
          const rows = snapshot.docs
            .map((d) => {
              const data = d.data();
              const text = typeof data.text === 'string' ? data.text.trim() : '';
              if (!text) return null;
              const role: 'user' | 'model' = data.role === 'user' ? 'user' : 'model';
              const rawMode = String(data.mode ?? 'chat') as PersistedChatMessage['mode'];
              const mode: PersistedChatMessage['mode'] = VALID_CHAT_MODES.includes(rawMode)
                ? rawMode
                : 'chat';
              let timestampMs =
                typeof data.timestampMs === 'number' && Number.isFinite(data.timestampMs) && data.timestampMs > 1_000_000_000_000
                  ? data.timestampMs
                  : 0;

              if (!timestampMs && typeof data.createdAtIso === 'string' && data.createdAtIso) {
                const parsed = Date.parse(data.createdAtIso);
                if (Number.isFinite(parsed) && parsed > 1_000_000_000_000) {
                  timestampMs = parsed;
                }
              }

              if (!timestampMs && data.createdAt) {
                if (typeof data.createdAt.toMillis === 'function') {
                  const ms = data.createdAt.toMillis();
                  if (Number.isFinite(ms) && ms > 1_000_000_000_000) timestampMs = ms;
                } else if (typeof data.createdAt.seconds === 'number') {
                  timestampMs = data.createdAt.seconds * 1000;
                }
              }

              if (!timestampMs) {
                const docId = String(data.id ?? d.id);
                const match = docId.match(/\b(?:u|m|msg|chat)-(\d{12,14})\b/);
                if (match) {
                  const parsed = parseInt(match[1], 10);
                  if (Number.isFinite(parsed) && parsed > 1_000_000_000_000) {
                    timestampMs = parsed;
                  }
                }
              }

              if (!timestampMs) {
                timestampMs = 0;
              }

              const createdAtIso =
                typeof data.createdAtIso === 'string' && data.createdAtIso
                  ? data.createdAtIso
                  : timestampMs > 0
                    ? new Date(timestampMs).toISOString()
                    : undefined;

              return {
                timestampMs,
                msg: {
                  id: String(data.id ?? d.id),
                  role,
                  mode,
                  text,
                  createdAtIso,
                } as PersistedChatMessage,
              };
            })
            .filter((item): item is { timestampMs: number; msg: PersistedChatMessage } => item !== null);

          rows.sort((a, b) => {
            if (a.timestampMs !== b.timestampMs) {
              return a.timestampMs - b.timestampMs;
            }
            if (a.msg.role === 'user' && b.msg.role === 'model') return -1;
            if (a.msg.role === 'model' && b.msg.role === 'user') return 1;
            return a.msg.id.localeCompare(b.msg.id);
          });
          onMessages(rows.map((r) => r.msg));
        },
        onError
      ),
    OperationType.LIST,
    path,
    onSyncError
  );
}

export async function upsertChatMessageRecord(
  uid: string,
  message: PersistedChatMessage,
  knownToExist?: boolean
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const trimmedText = (message.text ?? '').trim().slice(0, 4000);
  if (!trimmedText) return;
  const cleanId = sanitizeChatMessageId(message.id);
  const role: 'user' | 'model' = message.role === 'user' ? 'user' : 'model';
  const mode: PersistedChatMessage['mode'] = VALID_CHAT_MODES.includes(message.mode)
    ? message.mode
    : 'chat';
  const parsedTs = message.createdAtIso ? Date.parse(message.createdAtIso) : NaN;
  const timestampMs =
    Number.isFinite(parsedTs) && parsedTs >= 1_000_000_000_000 && parsedTs <= 4_102_444_800_000
      ? Math.round(parsedTs)
      : Date.now();
  const createdAtIso = (message.createdAtIso || new Date(timestampMs).toISOString()).slice(0, 40);
  const path = `users/${uid}/chatMessages/${cleanId}`;
  const docRef = doc(db, 'users', uid, 'chatMessages', cleanId);

  await withFirestoreWriteRetry(
    async () => {
      // Every message write used to read the doc first. The caller already knows whether the
      // message is in the cloud (it came from the snapshot or was written before), and the
      // free-tier database has a hard daily read cap that, once spent, blocks ALL writes.
      const exists = knownToExist ?? (await getDoc(docRef)).exists();
      if (!exists) {
        await setDoc(docRef, {
          id: cleanId,
          uid,
          role,
          mode,
          text: trimmedText,
          timestampMs,
          createdAtIso,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(docRef, {
          text: trimmedText,
          updatedAt: serverTimestamp(),
        });
      }
    },
    OperationType.WRITE,
    path
  );
}

export async function clearUserChatMessages(
  uid: string,
  targetMode?: PersistedChatMessage['mode']
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const colQuery = query(
    collection(db, 'users', uid, 'chatMessages'),
    where('uid', '==', uid),
    limit(100)
  );
  const snap = await getDocs(colQuery);
  await Promise.all(
    snap.docs
      .filter((d) => !targetMode || String(d.data()?.mode ?? 'chat') === targetMode)
      .map((d) => deleteDoc(doc(db, 'users', uid, 'chatMessages', d.id)).catch(() => {}))
  );
}



