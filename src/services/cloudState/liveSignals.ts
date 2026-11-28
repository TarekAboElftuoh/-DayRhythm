import { dismissActiveAlarmInCloud } from './alarms';
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
import type { LiveSyncSignal } from './alertSessions';

export async function broadcastAlertDismiss(
  uid: string,
  senderDeviceId: string,
  alertId?: string,
  action?: string,
  extra?: Record<string, unknown>
): Promise<boolean> {
  if (!uid) return false;
  try {
    const nowMs = Date.now();
    const liveDocRef = doc(db, 'users', uid, 'sync', 'live');
    const userDocRef = doc(db, 'users', uid);

    const payload: Record<string, unknown> = {
      status: 'dismissed',
      type: 'alarm_dismiss',
      action: action || 'dismiss',
      alertId: alertId || 'all',
      sessionId: alertId || 'all',
      dismissedBy: senderDeviceId,
      dismissedByDeviceId: senderDeviceId,
      clientId: senderDeviceId,
      dismissedAtMs: nowMs,
      timestampMs: nowMs,
      updatedAtMs: nowMs,
      serverTime: serverTimestamp(),
      ...(extra ? { extra } : {}),
    };

    const syncSignal: Record<string, unknown> = {
      scope: 'alarm_dismiss',
      action: action || 'dismiss',
      clientId: senderDeviceId,
      timestampMs: nowMs,
      opId: `dism_${nowMs}_${senderDeviceId}`,
      ...(extra ? { extra } : {}),
    };

    await Promise.allSettled([
      setDoc(liveDocRef, payload, { merge: true }),
      setDoc(userDocRef, { syncSignal, updatedAt: serverTimestamp() }, { merge: true }),
      dismissActiveAlarmInCloud(uid, alertId || 'all', senderDeviceId),
    ]);

    return true;
  } catch (err) {
    console.error('[CloudSync] broadcastAlertDismiss failed:', err);
    return false;
  }
}

/**
 * Publishes an ultra-low-latency real-time live signal (<100ms) over Google Cloud Firestore.
 * Broadcasts to all connected devices on the user's account without requiring any local server or port.
 */
export async function emitCloudLiveSignal(
  uid: string,
  signal: LiveSyncSignal
): Promise<boolean> {
  if (!uid || !signal) return false;
  try {
    const liveDocRef = doc(db, 'users', uid, 'sync', 'live');
    await setDoc(liveDocRef, {
      ...signal,
      serverTime: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('[CloudLiveSync] Failed emitting live signal:', err);
    return false;
  }
}

/**
 * Pushes the user's upcoming exact alarms to Firestore so Android background service
 * can arm Android AlarmManager hardware wake-ups even when events were created or edited on PC.
 */
export async function syncScheduledAlarmsToCloud(
  uid: string,
  alarmsJson: string,
  originClientId?: string
): Promise<boolean> {
  if (!uid || !alarmsJson) return false;
  try {
    const docRef = doc(db, 'users', uid, 'sync', 'scheduled_alarms');
    await setDoc(docRef, {
      alarmsJson,
      ...(originClientId ? { originClientId } : {}),
      updatedAtMs: Date.now(),
      serverTime: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.warn('[CloudSync] Failed to sync scheduled alarms:', err);
    return false;
  }
}

/**
 * Subscribes to the real-time live signal stream (<100ms) over Google Cloud Firestore.
 * Any button clicked on PC or Mobile triggers this listener immediately on the other device.
 */
export function subscribeToCloudLiveSignals(
  uid: string,
  onSignal: (signal: LiveSyncSignal) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!uid) return () => {};
  const liveDocRef = doc(db, 'users', uid, 'sync', 'live');
  return onSnapshot(
    liveDocRef,
    (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as LiveSyncSignal;
      onSignal(data);
    },
    (err) => {
      console.warn('[CloudLiveSync] Live signal listener error:', err);
      onError?.(err);
    }
  );
}

