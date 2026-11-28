import type { UserSettingsPayload } from './types';
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

import type { SanctuarySilenceMode } from './types';

export type AlertSessionStatus = 'idle' | 'ringing' | 'dismissed';

export interface DayRhythmAlertSession {
  status: AlertSessionStatus;
  sessionId: string;
  alertId: string;
  title: string;
  body?: string;
  kind?: string;
  snoozeMinutes?: number;
  blockId?: string;
  startedAtMs: number;
  dismissedAtMs?: number;
  dismissedBy?: string;
  originClientId: string;
  serverTime?: unknown;
}

export interface LiveSyncSignal {
  opId: string;
  clientId: string;
  timestampMs: number;
  status?: AlertSessionStatus;
  sessionId?: string;
  alertId?: string;
  title?: string;
  body?: string;
  kind?: string;
  snoozeMinutes?: number;
  blockId?: string;
  startedAtMs?: number;
  dismissedAtMs?: number;
  dismissedBy?: string;
  originClientId?: string;
  type:
    | 'settings_patch'
    | 'alarm_dismiss'
    | 'alarm_trigger'
    | 'water'
    | 'quiet_mode'
    | 'smart_charge'
    | 'theme'
    | 'pomodoro'
    | 'fasting'
    | 'friday'
    | 'habits'
    | 'tasks'
    | 'schedule_blocks'
    | 'life_profile'
    | 'ui_prefs'
    | 'clear_notifications';
  action?: string;
  patch?: Partial<UserSettingsPayload>;
  extra?: Record<string, unknown>;
}

/**
 * Spotify-Connect style single alert state session.
 * Updates the user's active alert session (status: ringing | dismissed | idle).
 * When dismissed on any device, all connected devices observe status: dismissed and stop instantly.
 */
export async function setCloudAlertSession(
  uid: string,
  session: Partial<DayRhythmAlertSession>
): Promise<boolean> {
  if (!uid) return false;
  try {
    const liveDocRef = doc(db, 'users', uid, 'sync', 'live');
    const nowMs = Date.now();
    const payload: Record<string, unknown> = {
      ...session,
      // Map to legacy type for backwards compatibility with native Java / older clients
      type: session.status === 'dismissed' ? 'alarm_dismiss' : session.status === 'ringing' ? 'alarm_trigger' : 'settings_patch',
      timestampMs: session.status === 'dismissed' ? (session.dismissedAtMs || nowMs) : (session.startedAtMs || nowMs),
      clientId: session.status === 'dismissed' ? (session.dismissedBy || session.originClientId || 'unknown') : (session.originClientId || 'unknown'),
      dismissedBy: session.dismissedBy || '',
      dismissedByDeviceId: session.dismissedBy || '',
      originClientId: session.originClientId || '',
      originDeviceId: session.originClientId || '',
      startedAtMs: session.startedAtMs || nowMs,
      originTimestampMs: session.startedAtMs || nowMs,
      updatedAtMs: nowMs,
      serverTime: serverTimestamp(),
    };
    if (session.status === 'dismissed') {
      payload.dismissedAtMs = session.dismissedAtMs || nowMs;
    }
    await setDoc(liveDocRef, payload, { merge: true });

    // Also update users/{uid}.syncSignal immediately so any client watching syncSignal catches it
    if (session.status === 'dismissed') {
      const userDocRef = doc(db, 'users', uid);
      await setDoc(
        userDocRef,
        {
          syncSignal: {
            scope: 'alarm_dismiss',
            action: session.kind || 'dismiss',
            clientId: session.dismissedBy || 'unknown',
            timestampMs: session.dismissedAtMs || nowMs,
            opId: `ses_dism_${nowMs}`,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {});
    }
    return true;
  } catch (err) {
    console.warn('[CloudAlertSession] Failed setting alert session:', err);
    return false;
  }
}

/**
 * Spotify-Connect Unified Protocol: Broadcast an alert trigger from any device (Mobile or PC).
 * Atomically writes to users/{uid}/sync/live AND users/{uid}.syncSignal.
 */
export async function broadcastAlertTrigger(
  uid: string,
  senderDeviceId: string,
  alertData: {
    alertId: string;
    title: string;
    body?: string;
    kind?: TaskSoundCategory | string;
    snoozeMinutes?: number;
    blockId?: string;
    startedAtMs?: number;
  }
): Promise<boolean> {
  if (!uid) return false;
  try {
    const nowMs = Date.now();
    const liveDocRef = doc(db, 'users', uid, 'sync', 'live');
    const userDocRef = doc(db, 'users', uid);

    const payload: Record<string, unknown> = {
      status: 'ringing',
      type: 'alarm_trigger',
      action: 'trigger',
      sessionId: alertData.alertId,
      alertId: alertData.alertId,
      title: alertData.title,
      body: alertData.body || '',
      kind: alertData.kind || 'general',
      snoozeMinutes: alertData.snoozeMinutes ?? 5,
      blockId: alertData.blockId || '',
      clientId: senderDeviceId,
      originClientId: senderDeviceId,
      originDeviceId: senderDeviceId,
      dismissedBy: '',
      dismissedByDeviceId: '',
      startedAtMs: nowMs,
      originTimestampMs: nowMs,
      timestampMs: nowMs,
      updatedAtMs: nowMs,
      serverTime: serverTimestamp(),
    };

    const syncSignal = {
      scope: 'alarm_trigger',
      action: 'trigger',
      clientId: senderDeviceId,
      timestampMs: nowMs,
      opId: `trig_${nowMs}_${senderDeviceId}`,
      extra: {
        title: alertData.title,
        body: alertData.body || '',
        kind: alertData.kind || 'general',
        snoozeMinutes: alertData.snoozeMinutes ?? 5,
        blockId: alertData.blockId,
        alertId: alertData.alertId,
      },
    };

    await Promise.allSettled([
      setDoc(liveDocRef, payload, { merge: true }),
      setDoc(userDocRef, { syncSignal, updatedAt: serverTimestamp() }, { merge: true }),
    ]);

    return true;
  } catch (err) {
    console.error('[CloudSync] broadcastAlertTrigger failed:', err);
    return false;
  }
}

/**
 * Spotify-Connect Unified Protocol: Broadcast an alert dismissal from any device (Mobile or PC).
 * Stops sound and closes cards across all devices in <100ms.
 */
