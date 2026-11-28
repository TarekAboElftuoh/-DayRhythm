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
import { sanitizeMedicationId, sanitizeMedicationItem } from './medSanitizers';
import { sanitizeCreativeActivityId, sanitizeCreativeActivityItem } from './habitSanitizers';

export function subscribeMedications(
  uid: string,
  onMedications: (items: MedicationItem[]) => void,
  onSyncError?: (message: string) => void
): Unsubscribe {
  const path = `users/${uid}/medications`;
  const colQuery = query(
    collection(db, 'users', uid, 'medications'),
    where('uid', '==', uid),
    limit(30)
  );

  return createResilientSnapshot(
    (onHealthy, onError) =>
      onSnapshot(
        colQuery,
        (snapshot) => {
          onHealthy();
          const items = snapshot.docs.map((d) => {
            const data = d.data();
            return sanitizeMedicationItem({
              id: String(data.id ?? d.id),
              name: String(data.name ?? ''),
              time24: String(data.time24 ?? ''),
              times24: Array.isArray(data.times24) ? data.times24.map(String) : undefined,
              daysOfWeek: Array.isArray(data.daysOfWeek) ? data.daysOfWeek.map(Number) : undefined,
              fastingPolicy: data.fastingPolicy as MedicationFastingPolicy | undefined,
              takenDosesToday: Array.isArray(data.takenDosesToday)
                ? data.takenDosesToday.map(String)
                : undefined,
              doseNote: String(data.doseNote ?? ''),
              takenDateKey: String(data.takenDateKey ?? ''),
              calendarEventId: String(data.calendarEventId ?? ''),
              courseEndDate: String(data.courseEndDate ?? ''),
              remainingDoses:
                typeof data.remainingDoses === 'number' ? data.remainingDoses : -1,
              totalDoses: typeof data.totalDoses === 'number' ? data.totalDoses : -1,
              refillAlertDays:
                typeof data.refillAlertDays === 'number' ? data.refillAlertDays : 3,
              takenDates: Array.isArray(data.takenDates) ? data.takenDates.map(String) : undefined,
            });
          });
          items.sort((a, b) => (a.time24 || '99:99').localeCompare(b.time24 || '99:99'));
          onMedications(items);
        },
        onError
      ),
    OperationType.LIST,
    path,
    onSyncError
  );
}

export async function upsertMedicationRecord(
  uid: string,
  med: MedicationItem
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const clean = sanitizeMedicationItem(med);
  const path = `users/${uid}/medications/${clean.id}`;
  const docRef = doc(db, 'users', uid, 'medications', clean.id);

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
          name: clean.name,
          time24: clean.time24,
          times24: clean.times24 ?? [],
          daysOfWeek: clean.daysOfWeek ?? [],
          fastingPolicy: clean.fastingPolicy ?? 'auto-nearest',
          takenDosesToday: clean.takenDosesToday ?? [],
          takenDates: clean.takenDates ?? [],
          doseNote: clean.doseNote,
          takenDateKey: clean.takenDateKey,
          calendarEventId: clean.calendarEventId,
          courseEndDate: clean.courseEndDate ?? '',
          remainingDoses: clean.remainingDoses ?? -1,
          totalDoses: clean.totalDoses ?? -1,
          refillAlertDays: clean.refillAlertDays ?? 3,
          updatedAt: serverTimestamp(),
        });
      }
    },
    OperationType.WRITE,
    path
  );
}

export async function deleteMedicationRecord(
  uid: string,
  medicationId: string
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const cleanId = sanitizeMedicationId(medicationId);
  const path = `users/${uid}/medications/${cleanId}`;
  await withFirestoreWriteRetry(
    () => deleteDoc(doc(db, 'users', uid, 'medications', cleanId)),
    OperationType.DELETE,
    path
  );
}

export function subscribeCreativeActivities(
  uid: string,
  onActivities: (items: CreativeActivityItem[]) => void,
  onSyncError?: (message: string) => void
): Unsubscribe {
  const path = `users/${uid}/creativeActivities`;
  const colQuery = query(
    collection(db, 'users', uid, 'creativeActivities'),
    where('uid', '==', uid),
    limit(100)
  );

  return createResilientSnapshot(
    (onHealthy, onError) =>
      onSnapshot(
        colQuery,
        (snapshot) => {
          onHealthy();
          const items = snapshot.docs.map((d) => {
            const data = d.data();
            return sanitizeCreativeActivityItem({
              id: String(data.id ?? d.id),
              name: String(data.name ?? ''),
              emoji: String(data.emoji ?? '🎨'),
              cadence: data.cadence as CreativeCadence | undefined,
              goalCount: typeof data.goalCount === 'number' ? data.goalCount : undefined,
              weeklyGoalSessions: Number(data.weeklyGoalSessions ?? 3),
              sessionMinutes: Number(data.sessionMinutes ?? 45),
              loggedDates: Array.isArray(data.loggedDates) ? data.loggedDates.map(String) : [],
              scheduledTime24: String(data.scheduledTime24 ?? ''),
              calendarEventId: String(data.calendarEventId ?? ''),
              expiresOnDate: String(data.expiresOnDate ?? ''),
            });
          });
          items.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
          onActivities(items);
        },
        onError
      ),
    OperationType.LIST,
    path,
    onSyncError
  );
}

export async function upsertCreativeActivityRecord(
  uid: string,
  activity: CreativeActivityItem
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const clean = sanitizeCreativeActivityItem(activity);
  const path = `users/${uid}/creativeActivities/${clean.id}`;
  const docRef = doc(db, 'users', uid, 'creativeActivities', clean.id);

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
          name: clean.name,
          emoji: clean.emoji,
          cadence: clean.cadence ?? 'weekly',
          goalCount: clean.goalCount ?? clean.weeklyGoalSessions,
          weeklyGoalSessions: clean.weeklyGoalSessions,
          sessionMinutes: clean.sessionMinutes,
          loggedDates: clean.loggedDates,
          scheduledTime24: clean.scheduledTime24,
          calendarEventId: clean.calendarEventId,
          expiresOnDate: clean.expiresOnDate ?? '',
          updatedAt: serverTimestamp(),
        });
      }
    },
    OperationType.WRITE,
    path
  );
}

export async function deleteCreativeActivityRecord(
  uid: string,
  activityId: string
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const cleanId = sanitizeCreativeActivityId(activityId);
  const path = `users/${uid}/creativeActivities/${cleanId}`;
  await withFirestoreWriteRetry(
    () => deleteDoc(doc(db, 'users', uid, 'creativeActivities', cleanId)),
    OperationType.DELETE,
    path
  );
}

