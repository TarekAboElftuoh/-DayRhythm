import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import { db, AppSyncSettings, OnePlusDeviceSettings } from '../../firebase';
import {
  CreativeActivityItem,
  DualStreaks,
  DynamicHabit,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  PeriodicRitualStatus,
  PomodoroState,
  QuietModeType,
  SurfaceTheme,
  TaskSoundCategory,
  TravelState,
  UiPrefs,
  WorkspaceSyncSignal,
} from '../../types/dayrhythm';

import type { ActiveAlarmItem } from './types';

export async function registerActiveAlarm(
  uid: string,
  alarm: {
    id: string;
    title: string;
    body?: string;
    category?: TaskSoundCategory;
    originClientId: string;
    medicationId?: string;
    doseTime24?: string;
    taskId?: string;
    taskListId?: string;
  }
): Promise<boolean> {
  if (!uid || !alarm.id) return false;
  try {
    const nowMs = Date.now();
    const alarmDoc: ActiveAlarmItem = {
      id: alarm.id,
      uid,
      title: alarm.title,
      body: alarm.body || '',
      category: alarm.category || 'general',
      status: 'ringing',
      originClientId: alarm.originClientId,
      firedAtMs: nowMs,
      medicationId: alarm.medicationId,
      doseTime24: alarm.doseTime24,
      taskId: alarm.taskId,
      taskListId: alarm.taskListId,
    };

    const alarmRef = doc(db, 'users', uid, 'active_alarms', alarm.id);
    await setDoc(
      alarmRef,
      {
        ...alarmDoc,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return true;
  } catch (error) {
    console.error('[CloudSync] Failed registering active alarm:', error);
    return false;
  }
}

/**
 * Requirement 3: Update alarm status to "dismissed" in the active_alarms collection.
 * When called on either device, the other device's onSnapshot triggers and stops sound/notification immediately.
 */
export async function dismissActiveAlarmInCloud(
  uid: string,
  alarmId: string,
  clientId: string
): Promise<boolean> {
  if (!uid) return false;
  try {
    const nowMs = Date.now();

    if (alarmId && alarmId !== 'all') {
      const alarmRef = doc(db, 'users', uid, 'active_alarms', alarmId);
      await setDoc(
        alarmRef,
        {
          status: 'dismissed',
          dismissedByClientId: clientId,
          dismissedAtMs: nowMs,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    // Also mark any ringing alarms in the collection as dismissed to guarantee all ringing sounds stop
    const alarmsCol = collection(db, 'users', uid, 'active_alarms');
    const ringingQuery = query(alarmsCol, where('status', '==', 'ringing'));
    const snap = await getDocs(ringingQuery);

    if (!snap.empty) {
      await Promise.all(
        snap.docs.map((d) =>
          updateDoc(d.ref, {
            status: 'dismissed',
            dismissedByClientId: clientId,
            dismissedAtMs: nowMs,
            updatedAt: serverTimestamp(),
          }).catch((err) => {
            console.warn('[CloudSync] Failed updating alarm doc:', d.id, err);
          })
        )
      );
    }

    // Also notify Android background service via users/{uid}.syncSignal for seamless cross-device silence
    const userDocRef = doc(db, 'users', uid);
    await setDoc(
      userDocRef,
      {
        syncSignal: {
          scope: 'alarm_dismiss',
          action: 'dismiss',
          clientId,
          timestampMs: nowMs,
          opId: `dismiss_${nowMs}_${clientId}`,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((e) => console.warn('[CloudSync] Failed writing syncSignal:', e));

    return true;
  } catch (error) {
    console.error('[CloudSync] Failed dismissing active alarm in cloud:', error);
    return false;
  }
}

/**
 * Requirement 3: Subscribe to real-time updates on active_alarms.
 * Both PC and Mobile listen via onSnapshot.
 */
export function subscribeToActiveAlarms(
  uid: string,
  onUpdate: (alarms: ActiveAlarmItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!uid) {
    return () => {};
  }

  const alarmsCol = collection(db, 'users', uid, 'active_alarms');
  return onSnapshot(
    alarmsCol,
    (snapshot) => {
      const alarms: ActiveAlarmItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as ActiveAlarmItem;
        alarms.push({
          ...data,
          id: docSnap.id,
        });
      });
      onUpdate(alarms);
    },
    (err) => {
      console.error('[CloudSync] Real-time active_alarms listener error:', err);
      onError?.(err);
    }
  );
}

/**
 * Periodically cleanup alarms that fired or were dismissed.
 * Dismissed alarms are purged after 30 seconds to prevent them from acting as poison pills.
 */
export async function cleanupExpiredActiveAlarms(uid: string): Promise<void> {
  if (!uid) return;
  try {
    const nowMs = Date.now();
    const ringingCutoffMs = nowMs - 5 * 60_000;
    const dismissedCutoffMs = nowMs - 30_000;
    const alarmsCol = collection(db, 'users', uid, 'active_alarms');
    const snap = await getDocs(alarmsCol);

    const toDelete: Promise<void>[] = [];
    snap.forEach((d) => {
      const data = d.data() as Partial<ActiveAlarmItem>;
      const isDismissedExpired =
        data.status === 'dismissed' && (!data.dismissedAtMs || data.dismissedAtMs < dismissedCutoffMs);
      const isRingingExpired = data.firedAtMs && data.firedAtMs < ringingCutoffMs;

      if (isDismissedExpired || isRingingExpired) {
        toDelete.push(deleteDoc(d.ref).catch(() => {}));
      }
    });

    if (toDelete.length > 0) {
      await Promise.all(toDelete);
    }
  } catch (err) {
    console.warn('[CloudSync] Cleanup expired alarms failed:', err);
  }
}

/**
 * Real-time listener for the user root document (users/{uid})
 * and the profile document (users/{uid}/settings/profile).
 * Merges updates from both documents in real time so changes from any client
 * or subcollection are immediately received without requiring a manual refresh.
 */
