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

import type { HydrationMergeInput, HydrationMergeResult, UserSettingsPayload } from './types';

function normalizeSlotOpIds(
  slotOpIds: string[] | undefined,
  cupsLogged: number,
  targetCups: number,
  fallbackPrefix: string
): string[] {
  const safeTarget = Math.max(1, Math.min(40, targetCups || 13));
  const out = Array.from({ length: safeTarget }, (_, i) => {
    const raw = Array.isArray(slotOpIds) ? slotOpIds[i] : '';
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : '';
  });
  let filledCount = out.filter(Boolean).length;
  const wantCount = Math.max(0, Math.min(safeTarget, cupsLogged || 0));
  if (filledCount < wantCount && (!Array.isArray(slotOpIds) || slotOpIds.length === 0)) {
    for (let i = 0; i < safeTarget && filledCount < wantCount; i++) {
      if (!out[i]) {
        out[i] = `${fallbackPrefix}_s${i}`;
        filledCount++;
      }
    }
  }
  return out;
}

/**
 * Conflict-free hydration state merger (2P-Set by cup slot opId):
 * - Simultaneous cup taps on PC & Mobile generate distinct opIds and union cleanly without losing a cup.
 * - Explicit cup unchecks add their opId to removedOpIds tombstones so stale caches never resurrect them.
 * - Legacy snapshots without slotOpIds fall back cleanly when timestamps advance.
 */
export function mergeHydrationTodaySlots(
  local: HydrationMergeInput,
  remote: HydrationMergeInput
): HydrationMergeResult {
  const targetCups = Math.max(
    1,
    Math.min(40, remote.targetCups || local.targetCups || 13)
  );
  if (remote.dateKey && local.dateKey && remote.dateKey !== local.dateKey) {
    // Only replace with the newer day if remote has no stale dateMismatch
    const rSlots = normalizeSlotOpIds(remote.slotOpIds, remote.cupsLogged, targetCups, 'r');
    return {
      dateKey: remote.dateKey,
      targetCups,
      cupsLogged: rSlots.filter(Boolean).length,
      slots: rSlots.map(Boolean),
      slotOpIds: rSlots,
      removedOpIds: (remote.removedOpIds || []).slice(-80),
      updatedAtMs: Math.max(local.updatedAtMs || 0, remote.updatedAtMs || 0),
    };
  }

  const removedSet = new Set<string>([
    ...(local.removedOpIds || []),
    ...(remote.removedOpIds || []),
  ]);

  const localSlots = normalizeSlotOpIds(local.slotOpIds, local.cupsLogged, targetCups, 'legacy');
  const remoteSlots = normalizeSlotOpIds(remote.slotOpIds, remote.cupsLogged, targetCups, 'legacy');

  const merged = Array.from({ length: targetCups }, () => '');
  const usedIds = new Set<string>();

  // 1. Place local non-tombstoned opIds in their exact slots
  for (let i = 0; i < targetCups; i++) {
    const id = localSlots[i];
    if (id && !removedSet.has(id) && !usedIds.has(id)) {
      merged[i] = id;
      usedIds.add(id);
    }
  }

  // 2. Union remote non-tombstoned opIds (preserving exact slot if free, else nearest empty slot)
  for (let i = 0; i < targetCups; i++) {
    const id = remoteSlots[i];
    if (!id || removedSet.has(id) || usedIds.has(id)) continue;
    // Do not duplicate generic 'legacy_sN' markers when local already has as many cups or more
    if (id.startsWith('legacy_s') && usedIds.size >= remote.cupsLogged) continue;
    if (!merged[i]) {
      merged[i] = id;
      usedIds.add(id);
    } else {
      const nextEmpty = merged.indexOf('');
      if (nextEmpty !== -1) {
        merged[nextEmpty] = id;
        usedIds.add(id);
      }
    }
  }

  // 3. Support legacy decrement (older client uncheck without opIds, strictly newer timestamp)
  const localTs = local.updatedAtMs || 0;
  const remoteTs = remote.updatedAtMs || 0;
  const remoteHasNoOpIds = !Array.isArray(remote.slotOpIds) || remote.slotOpIds.length === 0;
  if (remoteHasNoOpIds && remoteTs > localTs + 1500 && remote.cupsLogged < usedIds.size) {
    let toRemove = usedIds.size - Math.max(0, remote.cupsLogged);
    for (let i = targetCups - 1; i >= 0 && toRemove > 0; i--) {
      if (merged[i]) {
        removedSet.add(merged[i]);
        merged[i] = '';
        toRemove--;
      }
    }
  }

  const finalCount = merged.filter(Boolean).length;
  return {
    dateKey: local.dateKey || remote.dateKey,
    targetCups,
    cupsLogged: finalCount,
    slots: merged.map(Boolean),
    slotOpIds: merged,
    removedOpIds: Array.from(removedSet).slice(-80),
    updatedAtMs: Math.max(localTs, remoteTs),
  };
}

/**
 * Pure deep merge for UserSettingsPayload to prevent nested maps (appSettings, deviceSettings, uiPrefs, lifeProfile)
 * from overwriting sibling properties during concurrent or partial updates.
 */
export function mergeUserSettingsPayloads(
  base?: UserSettingsPayload | null,
  incoming?: UserSettingsPayload | null
): UserSettingsPayload {
  if (!base) return incoming ? { ...incoming } : {};
  if (!incoming) return { ...base };

  const mergedAppSettings = incoming.appSettings
    ? ({ ...(base.appSettings || {}), ...incoming.appSettings } as AppSyncSettings)
    : base.appSettings;

  const mergedDeviceSettings = incoming.deviceSettings
    ? ({ ...(base.deviceSettings || {}), ...incoming.deviceSettings } as OnePlusDeviceSettings)
    : base.deviceSettings;

  const mergedUiPrefs = incoming.uiPrefs
    ? ({ ...(base.uiPrefs || {}), ...incoming.uiPrefs } as UiPrefs)
    : base.uiPrefs;

  const mergedLifeProfile = incoming.lifeProfile
    ? ({ ...(base.lifeProfile || {}), ...incoming.lifeProfile } as LifeProfile)
    : base.lifeProfile;

  let hydrationPatch: Partial<UserSettingsPayload> = {};
  if (
    typeof base.cupsLogged === 'number' &&
    typeof incoming.cupsLogged === 'number' &&
    (!base.hydrationDateKey || !incoming.hydrationDateKey || base.hydrationDateKey === incoming.hydrationDateKey)
  ) {
    const mergedH = mergeHydrationTodaySlots(
      {
        dateKey: base.hydrationDateKey || incoming.hydrationDateKey || '',
        targetCups: base.targetCups || incoming.targetCups || 13,
        cupsLogged: base.cupsLogged,
        slotOpIds: base.hydrationSlotOpIds,
        removedOpIds: base.hydrationRemovedOpIds,
        updatedAtMs: base.hydrationUpdatedAtMs ?? base.updatedAtMs ?? 0,
      },
      {
        dateKey: incoming.hydrationDateKey || base.hydrationDateKey || '',
        targetCups: incoming.targetCups || base.targetCups || 13,
        cupsLogged: incoming.cupsLogged,
        slotOpIds: incoming.hydrationSlotOpIds,
        removedOpIds: incoming.hydrationRemovedOpIds,
        updatedAtMs: incoming.hydrationUpdatedAtMs ?? incoming.updatedAtMs ?? 0,
      }
    );
    hydrationPatch = {
      hydrationDateKey: mergedH.dateKey || incoming.hydrationDateKey,
      cupsLogged: mergedH.cupsLogged,
      targetCups: mergedH.targetCups,
      hydrationSlotOpIds: mergedH.slotOpIds,
      hydrationRemovedOpIds: mergedH.removedOpIds,
      hydrationUpdatedAtMs: mergedH.updatedAtMs,
    };
  }

  return {
    ...base,
    ...incoming,
    ...hydrationPatch,
    appSettings: mergedAppSettings,
    deviceSettings: mergedDeviceSettings,
    uiPrefs: mergedUiPrefs,
    lifeProfile: mergedLifeProfile,
  };
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
    const merged: UserSettingsPayload = mergeUserSettingsPayloads(userData, profileData);

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
