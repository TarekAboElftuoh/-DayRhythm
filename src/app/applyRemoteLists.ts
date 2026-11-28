import type React from 'react';
import {
  sanitizeCreativeActivityItem,
  sanitizeDynamicHabit,
  sanitizeMedicationItem,
  sanitizeMemoryItem,
  sanitizeUiPrefs,
  type SyncedRhythmPayload,
} from '../firebase';
import {
  loadDeletedMedicationIds,
  loadMedicationsUpdatedAt,
  MEDS_DELETED_IDS_STORAGE_KEY,
  MEDS_STORAGE_KEY,
  MEDS_UPDATED_AT_STORAGE_KEY,
} from '../hooks/useMedications';
import { getDateIsoInTimeZone } from '../engines/prayerEngine';
import { mergeHydrationTodaySlots } from '../services/cloudStateService';
import { syncSavedCloudApiUrlFromRemote } from '../services/apiClient';
import { getLast7DayLabels } from '../utils/appHelpers';
import type { CapsulePrefs } from '../components/FloatingPiPCapsule';
import type {
  CreativeActivityItem,
  DualStreaks,
  DynamicHabit,
  HydrationDayLog,
  MedicationItem,
  MemoryItem,
} from '../types/dayrhythm';

export interface ApplyRemoteListsCtx {
  activeTimeZone: string;
  localWriteLockUntilRef: React.MutableRefObject<number>;
  medicationsRef: React.MutableRefObject<MedicationItem[]>;
  memoriesRef: React.MutableRefObject<MemoryItem[]>;
  lastSyncedMemoriesSigRef: React.MutableRefObject<string>;
  creativeActivitiesRef: React.MutableRefObject<CreativeActivityItem[]>;
  lastSyncedCreativeSigRef: React.MutableRefObject<string>;
  habitsRef: React.MutableRefObject<DynamicHabit[]>;
  lastSyncedHabitsSigRef: React.MutableRefObject<string>;
  selectedLogoIdRef: React.MutableRefObject<string>;
  capsulePrefsRef: React.MutableRefObject<CapsulePrefs>;
  lastSyncedStreaksSigRef: React.MutableRefObject<string>;
  hydrationHistoryRef: React.MutableRefObject<HydrationDayLog[]>;
  setMedications: React.Dispatch<React.SetStateAction<MedicationItem[]>>;
  setMemories: React.Dispatch<React.SetStateAction<MemoryItem[]>>;
  setCreativeActivities: React.Dispatch<React.SetStateAction<CreativeActivityItem[]>>;
  setHabits: React.Dispatch<React.SetStateAction<DynamicHabit[]>>;
  setSelectedLogoId: React.Dispatch<React.SetStateAction<string>>;
  setCapsulePrefs: React.Dispatch<React.SetStateAction<CapsulePrefs>>;
  setStreaks: React.Dispatch<React.SetStateAction<DualStreaks>>;
  setHydrationHistory: React.Dispatch<React.SetStateAction<HydrationDayLog[]>>;
  MEMORIES_STORAGE_KEY: string;
  CREATIVE_STORAGE_KEY: string;
  HABITS_STORAGE_KEY: string;
  SELECTED_LOGO_STORAGE_KEY: string;
  CAPSULE_PREFS_STORAGE_KEY: string;
}

export function applyRemoteListsAndHydration(
  remote: SyncedRhythmPayload & {
    medications?: MedicationItem[];
    creativeActivities?: CreativeActivityItem[];
    habits?: DynamicHabit[];
    memories?: MemoryItem[];
  },
  ctx: ApplyRemoteListsCtx
): void {
  if (Array.isArray(remote.medications)) {
    const rMedsMeta = remote as { medicationsUpdatedAt?: number; deletedMedicationIds?: string[]; updatedAtMs?: number };
    const remoteMedsUpdatedAt =
      typeof rMedsMeta.medicationsUpdatedAt === 'number'
        ? rMedsMeta.medicationsUpdatedAt
        : typeof rMedsMeta.updatedAtMs === 'number'
          ? rMedsMeta.updatedAtMs
          : 0;
    const localMedsUpdatedAt = loadMedicationsUpdatedAt();
    const mergedDeleted = Array.from(new Set([...loadDeletedMedicationIds(), ...(Array.isArray(rMedsMeta.deletedMedicationIds) ? rMedsMeta.deletedMedicationIds : [])])).slice(-100);
    try { localStorage.setItem(MEDS_DELETED_IDS_STORAGE_KEY, JSON.stringify(mergedDeleted)); } catch { /* ignore */ }
    const deletedSet = new Set(mergedDeleted);
    if (remoteMedsUpdatedAt === 0 || remoteMedsUpdatedAt >= localMedsUpdatedAt) {
      const cleanMeds = remote.medications.map((m) => sanitizeMedicationItem(m)).filter((m) => !deletedSet.has(m.id));
      const sig = JSON.stringify(cleanMeds);
      if (sig !== JSON.stringify(ctx.medicationsRef.current)) {
        ctx.medicationsRef.current = cleanMeds;
        ctx.setMedications(cleanMeds);
        try {
          localStorage.setItem(MEDS_STORAGE_KEY, sig);
          if (remoteMedsUpdatedAt > 0) localStorage.setItem(MEDS_UPDATED_AT_STORAGE_KEY, String(remoteMedsUpdatedAt));
        } catch { /* ignore */ }
      }
    } else if (mergedDeleted.length > 0) {
      const filtered = ctx.medicationsRef.current.filter((m) => !deletedSet.has(m.id));
      if (filtered.length !== ctx.medicationsRef.current.length) {
        ctx.medicationsRef.current = filtered;
        ctx.setMedications(filtered);
        try { localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(filtered)); } catch { /* ignore */ }
      }
    }
  }

  if (Array.isArray(remote.memories)) {
    const cleanMems = remote.memories.map((m) => sanitizeMemoryItem(m));
    const sig = JSON.stringify(cleanMems);
    if (sig !== JSON.stringify(ctx.memoriesRef.current)) {
      ctx.lastSyncedMemoriesSigRef.current = sig;
      ctx.memoriesRef.current = cleanMems;
      ctx.setMemories(cleanMems);
      try { localStorage.setItem(ctx.MEMORIES_STORAGE_KEY, sig); } catch { /* ignore */ }
    }
  }

  if (Array.isArray(remote.creativeActivities)) {
    const cleanCreatives = remote.creativeActivities.map((c) => sanitizeCreativeActivityItem(c));
    const sig = JSON.stringify(cleanCreatives);
    if (sig !== JSON.stringify(ctx.creativeActivitiesRef.current)) {
      ctx.lastSyncedCreativeSigRef.current = sig;
      ctx.creativeActivitiesRef.current = cleanCreatives;
      ctx.setCreativeActivities(cleanCreatives);
      try { localStorage.setItem(ctx.CREATIVE_STORAGE_KEY, sig); } catch { /* ignore */ }
    }
  }

  if (Array.isArray(remote.habits)) {
    const cleanHabits = remote.habits.map((h) => sanitizeDynamicHabit(h));
    const sig = JSON.stringify(cleanHabits);
    if (sig !== JSON.stringify(ctx.habitsRef.current)) {
      ctx.lastSyncedHabitsSigRef.current = sig;
      ctx.habitsRef.current = cleanHabits;
      ctx.setHabits(cleanHabits);
      try { localStorage.setItem(ctx.HABITS_STORAGE_KEY, sig); } catch { /* ignore */ }
    }
  }

  if (remote.uiPrefs) {
    const cleanUi = sanitizeUiPrefs(remote.uiPrefs);
    if (cleanUi) {
      if (cleanUi.selectedLogoId && cleanUi.selectedLogoId !== ctx.selectedLogoIdRef.current) {
        ctx.selectedLogoIdRef.current = cleanUi.selectedLogoId;
        ctx.setSelectedLogoId(cleanUi.selectedLogoId);
      }
      if (cleanUi.capsuleOrientation !== ctx.capsulePrefsRef.current.orientation || cleanUi.capsuleSize !== ctx.capsulePrefsRef.current.size) {
        ctx.capsulePrefsRef.current = { orientation: cleanUi.capsuleOrientation, size: cleanUi.capsuleSize };
        ctx.setCapsulePrefs(ctx.capsulePrefsRef.current);
      }
      if (cleanUi.cloudApiUrl) {
        syncSavedCloudApiUrlFromRemote(cleanUi.cloudApiUrl);
        try { window.dispatchEvent(new CustomEvent('dayrhythm:cloud-api-updated', { detail: { url: cleanUi.cloudApiUrl } })); } catch { /* ignore */ }
      }
      try {
        window.localStorage.setItem(ctx.SELECTED_LOGO_STORAGE_KEY, cleanUi.selectedLogoId);
        window.localStorage.setItem(ctx.CAPSULE_PREFS_STORAGE_KEY, JSON.stringify({ orientation: cleanUi.capsuleOrientation, size: cleanUi.capsuleSize }));
      } catch { /* ignore */ }
    }
  }

  if (typeof remote.dailyCommitmentDays === 'number') {
    const nextDaily = remote.dailyCommitmentDays;
    const nextDailyDone = Boolean(remote.dailyCommitmentDoneToday);
    const nextWater = remote.waterTargetDays ?? 0;
    const nextWaterDone = Boolean(remote.waterTargetDoneToday);
    ctx.lastSyncedStreaksSigRef.current = `${nextDaily}:${nextDailyDone}:${nextWater}:${nextWaterDone}`;
    ctx.setStreaks((prev) => {
      if (Date.now() < ctx.localWriteLockUntilRef.current) return prev;
      if (prev.dailyCommitmentDays === nextDaily && prev.dailyCommitmentDoneToday === nextDailyDone && prev.waterTargetDays === nextWater && prev.waterTargetDoneToday === nextWaterDone) return prev;
      return { dailyCommitmentDays: nextDaily, dailyCommitmentDoneToday: nextDailyDone, waterTargetDays: nextWater, waterTargetDoneToday: nextWaterDone };
    });
  }

  if (typeof remote.cupsLogged === 'number') {
    const remoteTz = remote.lifeProfile?.currentTimeZone || ctx.activeTimeZone || 'Africa/Cairo';
    const labels = getLast7DayLabels(remoteTz);
    const todayIso = getDateIsoInTimeZone(remoteTz);
    const isSameDay = !remote.hydrationDateKey || remote.hydrationDateKey === todayIso;
    const baseCounts = isSameDay
      ? (remote.hydrationWeeklyCounts || [0, 0, 0, 0, 0, 0, 0])
      : [...(remote.hydrationWeeklyCounts || [0, 0, 0, 0, 0, 0, 0]).slice(1), 0];

    ctx.setHydrationHistory((prev) => {
      const prevToday = prev.length > 0 ? prev[prev.length - 1] : null;
      const targetVal = remote.targetCups || (prevToday ? prevToday.targetCups : 13);
      const remoteTodayInput = isSameDay
        ? { dateKey: todayIso, targetCups: targetVal, cupsLogged: remote.cupsLogged ?? 0, slotOpIds: remote.hydrationSlotOpIds, removedOpIds: remote.hydrationRemovedOpIds, updatedAtMs: remote.hydrationUpdatedAtMs ?? 0 }
        : null;
      const mergedToday = remoteTodayInput
        ? mergeHydrationTodaySlots(
            {
              dateKey: todayIso, targetCups: targetVal, cupsLogged: prevToday?.dateKey === todayIso ? prevToday.cupsLogged : 0,
              slotOpIds: prevToday?.dateKey === todayIso ? prevToday.slotOpIds || prevToday.slots.map((filled, idx) => (filled ? `loc_s${idx}` : '')) : undefined,
              removedOpIds: prevToday?.dateKey === todayIso ? prevToday.removedOpIds : undefined,
              updatedAtMs: prevToday?.dateKey === todayIso ? prevToday.hydrationUpdatedAtMs ?? 0 : 0,
            },
            remoteTodayInput
          )
        : null;

      if (
        prevToday && prevToday.dateKey === todayIso && mergedToday &&
        prevToday.cupsLogged === mergedToday.cupsLogged && prevToday.targetCups === targetVal &&
        JSON.stringify(prevToday.slots) === JSON.stringify(mergedToday.slots) &&
        JSON.stringify(prevToday.slotOpIds || []) === JSON.stringify(mergedToday.slotOpIds) &&
        prev.length === labels.length && prev.every((d, i) => i === 6 || d.cupsLogged === (baseCounts[i] ?? 0))
      ) return prev;

      const nextHistory = labels.map((labelAr, idx) => {
        if (idx === 6) {
          if (mergedToday) {
            return { dateKey: todayIso, labelAr, cupsLogged: Math.min(targetVal, mergedToday.cupsLogged), targetCups: targetVal, slots: mergedToday.slots.slice(0, targetVal), slotOpIds: mergedToday.slotOpIds.slice(0, targetVal), removedOpIds: mergedToday.removedOpIds, hydrationUpdatedAtMs: mergedToday.updatedAtMs };
          }
          if (prevToday && prevToday.dateKey === todayIso) return { ...prevToday, labelAr, targetCups: targetVal };
          return { dateKey: todayIso, labelAr, cupsLogged: 0, targetCups: targetVal, slots: Array.from({ length: targetVal }, () => false), slotOpIds: Array.from({ length: targetVal }, () => ''), removedOpIds: [], hydrationUpdatedAtMs: 0 };
        }
        const c = baseCounts[idx] ?? 0;
        return { dateKey: `day-${idx}`, labelAr, cupsLogged: Math.min(targetVal, c), targetCups: targetVal, slots: Array.from({ length: targetVal }, (_, sIdx) => sIdx < c) };
      });
      ctx.hydrationHistoryRef.current = nextHistory;
      return nextHistory;
    });
  }
}
