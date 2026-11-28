import type React from 'react';
import type {
  CreativeActivityItem,
  DynamicHabit,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  PersistedChatMessage,
  QuietModeType,
  TravelState,
} from '../types/dayrhythm';
import type { CapsulePrefs } from '../components/FloatingPiPCapsule';
import {
  sanitizeCreativeActivityItem,
  sanitizeDeviceSettings,
  sanitizeDynamicHabit,
  sanitizeMedicationItem,
  sanitizeMemoryItem,
  type OnePlusDeviceSettings,
} from '../firebase';
import { loadFromGoogleDriveAppData, type FullDayRhythmCloudBackup } from '../services/googleDriveStorage';
import { migrateAppState } from '../utils/schemaMigration';
import { SCHEMA_VERSION } from '../utils/schemaMigration';
import { SELECTED_LOGO_STORAGE_KEY } from '../components/logoRegistry';
import {
  CAPSULE_PREFS_STORAGE_KEY,
  CHAT_STORAGE_KEY,
  CREATIVE_STORAGE_KEY,
  HABITS_STORAGE_KEY,
  MEMORIES_STORAGE_KEY,
  STORAGE_KEY,
} from '../utils/appHelpers';
import {
  loadDeletedMedicationIds,
  loadMedicationsUpdatedAt,
  MEDS_DELETED_IDS_STORAGE_KEY,
  MEDS_STORAGE_KEY,
  MEDS_UPDATED_AT_STORAGE_KEY,
} from '../hooks/medications/storage';
import { sanitizeLifeProfile, sanitizeTravelState } from './sanitizers';

export interface HydrateDriveCtx {
  LAST_FIRESTORE_UPDATED_AT_KEY: string;
  TRAVEL_STATE_STORAGE_KEY: string;
  hasHydratedGoogleDriveRef: React.MutableRefObject<boolean>;
  lastFirestoreUpdatedAtRef: React.MutableRefObject<number>;
  localWriteLockUntilRef: React.MutableRefObject<number>;
  lifeProfileRef: React.MutableRefObject<LifeProfile>;
  medicationsRef: React.MutableRefObject<MedicationItem[]>;
  quietModeRef: React.MutableRefObject<QuietModeType>;
  sanctuaryOverrideUntilMsRef: React.MutableRefObject<number>;
  lastScheduledAlarmsJsonRef: React.MutableRefObject<string>;
  travelStateRef: React.MutableRefObject<TravelState>;
  setGoogleDriveSynced: React.Dispatch<React.SetStateAction<boolean>>;
  setLifeProfile: React.Dispatch<React.SetStateAction<LifeProfile>>;
  setMedications: React.Dispatch<React.SetStateAction<MedicationItem[]>>;
  setHydrationHistory: React.Dispatch<React.SetStateAction<HydrationDayLog[]>>;
  setCreativeActivities: React.Dispatch<React.SetStateAction<CreativeActivityItem[]>>;
  setHabits: React.Dispatch<React.SetStateAction<DynamicHabit[]>>;
  setMemories: React.Dispatch<React.SetStateAction<MemoryItem[]>>;
  setDeviceSettings: React.Dispatch<React.SetStateAction<OnePlusDeviceSettings>>;
  setCapsulePrefs: React.Dispatch<React.SetStateAction<CapsulePrefs>>;
  setSelectedLogoId: React.Dispatch<React.SetStateAction<string>>;
  setQuietMode: React.Dispatch<React.SetStateAction<QuietModeType>>;
  setQuietUntilTs: React.Dispatch<React.SetStateAction<number | null>>;
  setQuietRemainingSec: React.Dispatch<React.SetStateAction<number>>;
  setAdhanOverrideSilent: React.Dispatch<React.SetStateAction<boolean>>;
  setSanctuaryOverrideUntilMs: React.Dispatch<React.SetStateAction<number>>;
  setTravelState: React.Dispatch<React.SetStateAction<TravelState>>;
  setChatMessages: React.Dispatch<React.SetStateAction<PersistedChatMessage[]>>;
  showToast: (msg: string) => void;
}

export async function hydrateDriveBackup(token: string, ctx: HydrateDriveCtx): Promise<boolean> {
  const backup = await loadFromGoogleDriveAppData(token);
  if (!backup) {
    ctx.hasHydratedGoogleDriveRef.current = true;
    return true;
  }

  const migratedBackup = migrateAppState(backup);
  const remoteUpdatedAt = typeof backup.updatedAtMs === 'number' ? backup.updatedAtMs : 0;
  let latestFirestoreUpdatedAt = ctx.lastFirestoreUpdatedAtRef.current;
  try {
    const storedFsTs = Number(localStorage.getItem(ctx.LAST_FIRESTORE_UPDATED_AT_KEY) || 0);
    if (Number.isFinite(storedFsTs) && storedFsTs > latestFirestoreUpdatedAt) {
      latestFirestoreUpdatedAt = storedFsTs;
    }
  } catch { /* ignore */ }
  if (latestFirestoreUpdatedAt > 0 && remoteUpdatedAt <= latestFirestoreUpdatedAt) {
    ctx.setGoogleDriveSynced(true);
    ctx.hasHydratedGoogleDriveRef.current = true;
    return true;
  }

  if (backup.lifeProfile && Date.now() >= ctx.localWriteLockUntilRef.current) {
    let localProfileUpdatedAt = 0;
    try { localProfileUpdatedAt = Number(localStorage.getItem('dayrhythm_life_profile_updated_at_v1') || 0); } catch { localProfileUpdatedAt = 0; }
    if (remoteUpdatedAt > localProfileUpdatedAt || localProfileUpdatedAt === 0) {
      const cleanProfile = sanitizeLifeProfile(migratedBackup.lifeProfile);
      ctx.lifeProfileRef.current = cleanProfile;
      ctx.setLifeProfile(cleanProfile);
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, schemaVersion: SCHEMA_VERSION, lifeProfile: cleanProfile }));
        localStorage.setItem('dayrhythm_life_profile_updated_at_v1', String(remoteUpdatedAt || Date.now()));
      } catch { /* ignore */ }
    }
  }

  if (Array.isArray(backup.medications)) {
    const bAny = backup as FullDayRhythmCloudBackup & { medicationsUpdatedAt?: number; deletedMedicationIds?: string[] };
    const remoteMedsUpdatedAt = typeof bAny.medicationsUpdatedAt === 'number' ? bAny.medicationsUpdatedAt : remoteUpdatedAt;
    const localMedsUpdatedAt = loadMedicationsUpdatedAt();
    const mergedDeleted = Array.from(
      new Set([...loadDeletedMedicationIds(), ...(Array.isArray(bAny.deletedMedicationIds) ? bAny.deletedMedicationIds : [])])
    ).slice(-100);
    try { localStorage.setItem(MEDS_DELETED_IDS_STORAGE_KEY, JSON.stringify(mergedDeleted)); } catch { /* ignore */ }
    const deletedSet = new Set(mergedDeleted);
    if (remoteMedsUpdatedAt >= localMedsUpdatedAt) {
      const cleanMeds = backup.medications.map((m) => sanitizeMedicationItem(m)).filter((m) => !deletedSet.has(m.id));
      ctx.medicationsRef.current = cleanMeds;
      ctx.setMedications(cleanMeds);
      try {
        localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(cleanMeds));
        localStorage.setItem(MEDS_UPDATED_AT_STORAGE_KEY, String(remoteMedsUpdatedAt || Date.now()));
      } catch { /* ignore */ }
    } else if (mergedDeleted.length > 0) {
      ctx.setMedications((prev) => prev.filter((m) => !deletedSet.has(m.id)));
    }
  }

  if (Array.isArray(backup.hydrationHistory) && backup.hydrationHistory.length === 7) {
    ctx.setHydrationHistory(backup.hydrationHistory);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, hydrationHistory: backup.hydrationHistory }));
    } catch { /* ignore */ }
  }
  if (Array.isArray(backup.creativeActivities)) {
    const cleanCreative = backup.creativeActivities.map((a) => sanitizeCreativeActivityItem(a));
    ctx.setCreativeActivities(cleanCreative);
    try { localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(cleanCreative)); } catch { /* ignore */ }
  }
  if (Array.isArray(backup.habits)) {
    const cleanHabits = backup.habits.map((h) => sanitizeDynamicHabit(h));
    ctx.setHabits(cleanHabits);
    try { localStorage.setItem(HABITS_STORAGE_KEY, JSON.stringify(cleanHabits)); } catch { /* ignore */ }
  }
  if (Array.isArray(backup.memories)) {
    const cleanMemories = backup.memories.map((m) => sanitizeMemoryItem(m));
    ctx.setMemories(cleanMemories);
    try { localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(cleanMemories)); } catch { /* ignore */ }
  }
  if (backup.deviceSettings && Date.now() >= ctx.localWriteLockUntilRef.current) {
    const cleanDev = sanitizeDeviceSettings(backup.deviceSettings);
    ctx.setDeviceSettings(cleanDev);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, deviceSettings: cleanDev }));
    } catch { /* ignore */ }
  }
  if (backup.capsulePrefs) {
    ctx.setCapsulePrefs(backup.capsulePrefs);
    try { window.localStorage.setItem(CAPSULE_PREFS_STORAGE_KEY, JSON.stringify(backup.capsulePrefs)); } catch { /* ignore */ }
  }
  if (backup.selectedLogoId) {
    ctx.setSelectedLogoId(backup.selectedLogoId);
    try { window.localStorage.setItem(SELECTED_LOGO_STORAGE_KEY, backup.selectedLogoId); } catch { /* ignore */ }
  }

  if (backup.quietMode && Date.now() >= ctx.localWriteLockUntilRef.current) {
    let localQuietUpdatedAt = 0;
    try { localQuietUpdatedAt = Number(localStorage.getItem('dayrhythm_quiet_mode_updated_at_v1') || 0); } catch { localQuietUpdatedAt = 0; }
    const backupQuietMeta = backup as FullDayRhythmCloudBackup & { quietUntilTs?: number | null; quietModeUpdatedAt?: number };
    const backupQuietUpdatedAt = backupQuietMeta.quietModeUpdatedAt ?? remoteUpdatedAt;
    if (backupQuietUpdatedAt > localQuietUpdatedAt || localQuietUpdatedAt === 0) {
      const nextUntil = backup.quietMode === 'normal' ? null : typeof backupQuietMeta.quietUntilTs === 'number' && backupQuietMeta.quietUntilTs > 0 ? backupQuietMeta.quietUntilTs : null;
      ctx.quietModeRef.current = backup.quietMode;
      ctx.setQuietMode(backup.quietMode);
      ctx.setQuietUntilTs(nextUntil);
      ctx.setQuietRemainingSec(
        backup.quietMode !== 'normal' && nextUntil !== null && nextUntil > Date.now()
          ? Math.max(1, Math.ceil((nextUntil - Date.now()) / 1000))
          : 0
      );
      try {
        localStorage.setItem('dayrhythm_quiet_mode_v1', backup.quietMode);
        localStorage.setItem('dayrhythm_quiet_until_ts_v1', nextUntil === null ? 'null' : String(nextUntil));
        localStorage.setItem('dayrhythm_quiet_mode_updated_at_v1', String(backupQuietUpdatedAt || Date.now()));
      } catch { /* ignore */ }
    }
  }
  if (typeof backup.adhanOverrideSilent === 'boolean') ctx.setAdhanOverrideSilent(backup.adhanOverrideSilent);
  const backupWithSanctuary = backup as FullDayRhythmCloudBackup & { sanctuaryOverrideUntilMs?: number };
  if (typeof backupWithSanctuary.sanctuaryOverrideUntilMs === 'number' && Date.now() >= ctx.localWriteLockUntilRef.current) {
    const incomingUntil = Math.max(0, Math.round(backupWithSanctuary.sanctuaryOverrideUntilMs));
    const effectiveUntil = incomingUntil > Date.now() ? incomingUntil : 0;
    if (effectiveUntil !== ctx.sanctuaryOverrideUntilMsRef.current) {
      ctx.sanctuaryOverrideUntilMsRef.current = effectiveUntil;
      ctx.setSanctuaryOverrideUntilMs(effectiveUntil);
      ctx.lastScheduledAlarmsJsonRef.current = '';
      try {
        if (effectiveUntil > 0) localStorage.setItem('dayrhythm_sanctuary_override_until_v1', String(effectiveUntil));
        else localStorage.removeItem('dayrhythm_sanctuary_override_until_v1');
      } catch { /* ignore */ }
    }
  }
  const backupWithTravel = backup as FullDayRhythmCloudBackup & { travelState?: TravelState };
  if (backupWithTravel.travelState && Date.now() >= ctx.localWriteLockUntilRef.current) {
    const cleanDriveTravel = sanitizeTravelState(migratedBackup.travelState);
    const localTravelTs = ctx.travelStateRef.current.updatedAt ?? 0;
    if ((cleanDriveTravel.updatedAt ?? 0) > localTravelTs || localTravelTs === 0) {
      ctx.travelStateRef.current = cleanDriveTravel;
      ctx.setTravelState(cleanDriveTravel);
      try { localStorage.setItem(ctx.TRAVEL_STATE_STORAGE_KEY, JSON.stringify(cleanDriveTravel)); } catch { /* ignore */ }
    }
  }
  if (Array.isArray(backup.chatMessages) && backup.chatMessages.length > 0) {
    ctx.setChatMessages(backup.chatMessages);
    try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(backup.chatMessages.slice(-100))); } catch { /* ignore */ }
  }
  ctx.setGoogleDriveSynced(true);
  ctx.showToast('✓ تمت استعادة إعدادات ودستور حساب Google بالكامل');
  ctx.hasHydratedGoogleDriveRef.current = true;
  return true;
}
