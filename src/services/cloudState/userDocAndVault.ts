import type { UserSettingsPayload } from './types';
import { mergeUserSettingsPayloads } from './hydrationAndSettings';
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
  let notifyScheduled = false;

  const handleMergeAndNotify = () => {
    if (notifyScheduled) return;
    notifyScheduled = true;
    queueMicrotask(() => {
      notifyScheduled = false;
      const origin =
        (cachedProfile.updatedAtMs || 0) >= (cachedUserDoc.updatedAtMs || 0)
          ? (cachedProfile.originClientId || cachedUserDoc.originClientId)
          : (cachedUserDoc.originClientId || cachedProfile.originClientId);
      const merged = mergeUserSettingsPayloads(cachedUserDoc, cachedProfile);
      onUpdate({
        ...merged,
        originClientId: origin,
      });
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

