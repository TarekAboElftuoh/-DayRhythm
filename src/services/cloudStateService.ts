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
import { db, AppSyncSettings, OnePlusDeviceSettings } from '../firebase';
import {
  CreativeActivityItem,
  DualStreaks,
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
} from '../types/dayrhythm';

export interface ActiveAlarmItem {
  id: string;
  uid: string;
  title: string;
  body?: string;
  category: TaskSoundCategory;
  status: 'ringing' | 'dismissed' | 'snoozed';
  originClientId: string;
  dismissedByClientId?: string;
  firedAtMs: number;
  dismissedAtMs?: number;
  medicationId?: string;
  doseTime24?: string;
  taskId?: string;
  taskListId?: string;
}

export interface UserSettingsPayload {
  lifeProfile?: LifeProfile;
  deviceSettings?: OnePlusDeviceSettings;
  appSettings?: AppSyncSettings;
  quietMode?: QuietModeType;
  adhanOverrideSilent?: boolean;
  surfaceTheme?: SurfaceTheme;
  hydrationHistory?: HydrationDayLog[];
  streaks?: DualStreaks;
  uiPrefs?: UiPrefs;
  medications?: MedicationItem[];
  creativeActivities?: CreativeActivityItem[];
  memories?: MemoryItem[];
  hydrationDateKey?: string;
  cupsLogged?: number;
  targetCups?: number;
  hydrationWeeklyCounts?: number[];
  dailyCommitmentDays?: number;
  dailyCommitmentDoneToday?: boolean;
  waterTargetDays?: number;
  waterTargetDoneToday?: boolean;
  completedOverrides?: Record<string, boolean>;
  fastingOverride?: 'auto' | 'fasting' | 'normal';
  isFridayMode?: boolean;
  includeBiweeklyPcCleanup?: boolean;
  periodicRituals?: PeriodicRitualStatus[];
  travelState?: TravelState;
  pomodoro?: PomodoroState;
  syncSignal?: WorkspaceSyncSignal;
  originClientId?: string;
  lastDismissSignal?: {
    timestampMs: number;
    scope: string;
    action: string;
    clientId: string;
  };
  updatedAtMs?: number;
}

/**
 * Requirement 1: Fetch user settings from Firestore cloud (users/{uid}/settings/profile & users/{uid}).
 * Guarantees that cloud settings take strict priority over local defaults.
 */
export async function fetchCloudUserSettings(uid: string): Promise<UserSettingsPayload | null> {
  if (!uid) return null;
  try {
    const profileRef = doc(db, 'users', uid, 'settings', 'profile');
    const userDocRef = doc(db, 'users', uid);

    const [profileSnap, userDocSnap] = await Promise.all([
      getDoc(profileRef).catch((e) => {
        console.warn('[CloudSync] Failed reading users/{uid}/settings/profile:', e);
        return null;
      }),
      getDoc(userDocRef).catch((e) => {
        console.warn('[CloudSync] Failed reading users/{uid}:', e);
        return null;
      }),
    ]);

    const profileData = profileSnap?.exists() ? (profileSnap.data() as UserSettingsPayload) : null;
    const userData = userDocSnap?.exists() ? (userDocSnap.data() as UserSettingsPayload) : null;

    if (!profileData && !userData) {
      console.info('[CloudSync] No existing cloud settings found for user:', uid);
      return null;
    }

    // Merge document data with subcollection profile data taking precedence
    const merged: UserSettingsPayload = {
      ...userData,
      ...profileData,
    };

    return merged;
  } catch (error) {
    console.error('[CloudSync] Error in fetchCloudUserSettings:', error);
    return null;
  }
}

/**
 * Requirement 1: Save user settings to Firestore cloud with merge: true.
 * Updates both users/{uid}/settings/profile and users/{uid} for maximum compatibility.
 */
export async function saveCloudUserSettings(
  uid: string,
  patch: Partial<UserSettingsPayload>
): Promise<boolean> {
  if (!uid) return false;
  try {
    const nowMs = Date.now();
    const payload = {
      ...patch,
      updatedAtMs: nowMs,
      updatedAt: serverTimestamp(),
    };

    const profileRef = doc(db, 'users', uid, 'settings', 'profile');
    const userDocRef = doc(db, 'users', uid);

    await Promise.all([
      setDoc(profileRef, payload, { merge: true }),
      setDoc(userDocRef, payload, { merge: true }),
    ]);

    return true;
  } catch (error) {
    console.error('[CloudSync] Failed saving user settings to cloud:', error);
    return false;
  }
}

/**
 * Requirement 3: Register a newly firing alarm in the active_alarms collection with status "ringing".
 */
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
export function subscribeToUserDocument(
  uid: string,
  onUpdate: (data: UserSettingsPayload) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!uid) return () => {};

  const userDocRef = doc(db, 'users', uid);
  const profileRef = doc(db, 'users', uid, 'settings', 'profile');

  let cachedUserDoc: UserSettingsPayload = {};
  let cachedProfile: UserSettingsPayload = {};

  const handleMergeAndNotify = () => {
    onUpdate({
      ...cachedUserDoc,
      ...cachedProfile,
    });
  };

  const unsubUser = onSnapshot(
    userDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        cachedUserDoc = snapshot.data() as UserSettingsPayload;
        handleMergeAndNotify();
      }
    },
    (err) => {
      console.warn('[CloudSync] UserDoc onSnapshot error:', err);
      onError?.(err);
    }
  );

  const unsubProfile = onSnapshot(
    profileRef,
    (snapshot) => {
      if (snapshot.exists()) {
        cachedProfile = snapshot.data() as UserSettingsPayload;
        handleMergeAndNotify();
      }
    },
    (err) => {
      console.warn('[CloudSync] ProfileDoc onSnapshot error:', err);
      onError?.(err);
    }
  );

  return () => {
    unsubUser();
    unsubProfile();
  };
}

/**
 * Automatically clean up and delete the old "[DayRhythm Sync Vault]" list from Google Tasks
 * so it no longer clutters the user's Google Tasks account.
 */
export async function deleteTasksVaultListIfPresent(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const listRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) return false;
    const data = (await listRes.json()) as { items?: Array<{ id: string; title: string }> };
    const items = data.items || [];
    const vaultList = items.find((l) => l.title === '[DayRhythm Sync Vault]');
    if (vaultList?.id) {
      console.info('[TasksVault] Found old sync vault list. Deleting from Google Tasks:', vaultList.id);
      const delRes = await fetch(`https://tasks.googleapis.com/tasks/v1/users/@me/lists/${vaultList.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (delRes.ok) {
        console.info('[TasksVault] Successfully deleted [DayRhythm Sync Vault] from Google Tasks!');
        return true;
      }
    }
  } catch (err) {
    console.warn('[TasksVault] Failed deleting sync vault list:', err);
  }
  return false;
}
