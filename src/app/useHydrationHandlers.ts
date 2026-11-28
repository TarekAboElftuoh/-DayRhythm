import { useCallback } from 'react';
import type React from 'react';
import type { DualStreaks, HydrationDayLog, LifeProfile, TaskSoundCategory } from '../types/dayrhythm';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import type { OnePlusDeviceSettings } from '../firebase';
import type { EmitCrossDeviceSync, TasksVaultPayload } from '../types/appTypes';
import { stopContinuousAlert } from '../engines/audioEngine';
import { getDateIsoInTimeZone } from '../engines/prayerEngine';
import { rollOverHydrationHistoryIfNeeded, STORAGE_KEY } from '../utils/appHelpers';
import { stopNativeAlerts } from '../utils/deviceHelpers';

export interface UseHydrationHandlersParams {
  activeTimeZone: string;
  targetCups: number;
  streaks: DualStreaks;
  deviceSettings: OnePlusDeviceSettings;
  lifeProfile: LifeProfile;
  hydrationHistoryRef: React.MutableRefObject<HydrationDayLog[]>;
  localWriteLockUntilRef: React.MutableRefObject<number>;
  lastServerFieldsRef: React.MutableRefObject<Record<string, string>>;
  clientIdRef: React.MutableRefObject<string>;
  handleLogWaterCupRef: React.MutableRefObject<(opts?: { fromRemote?: boolean; waterOpId?: string; dateKey?: string }) => void>;
  setHydrationHistory: React.Dispatch<React.SetStateAction<HydrationDayLog[]>>;
  setStreaks: React.Dispatch<React.SetStateAction<DualStreaks>>;
  setActiveAudioAlert: React.Dispatch<React.SetStateAction<{ id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean } | null>>;
  setPersistentAlert: React.Dispatch<React.SetStateAction<PersistentAlertItem | null>>;
  setAlarmRinging: React.Dispatch<React.SetStateAction<boolean>>;
  pushToTasksVaultImmediately: (patch?: Partial<TasksVaultPayload>) => Promise<void>;
  pushFullCloudBackupImmediately: () => Promise<boolean>;
  emitCrossDeviceSync: EmitCrossDeviceSync;
}

export function useHydrationHandlers(p: UseHydrationHandlersParams) {
  const updateTodayHydration = useCallback(
    (
      updater: (today: HydrationDayLog) => HydrationDayLog,
      dismissSignal?: { scope: 'alarm_dismiss'; action: string }
    ) => {
      const prev = p.hydrationHistoryRef.current;
      if (prev.length === 0) return;

      const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
      const rolled = rollOverHydrationHistoryIfNeeded(prev, p.targetCups, p.activeTimeZone);
      const currentToday = rolled[rolled.length - 1];
      const updatedRaw = updater(currentToday);
      if (updatedRaw === currentToday && rolled === prev) return;

      const nowMs = Date.now();
      const normalizedSlotOpIds = Array.from({ length: updatedRaw.targetCups }, (_, idx) => {
        if (!updatedRaw.slots[idx]) return '';
        return updatedRaw.slotOpIds?.[idx] || `loc_${nowMs.toString(36)}_${idx}`;
      });
      const updated: HydrationDayLog = {
        ...updatedRaw,
        dateKey: todayIso,
        cupsLogged: updatedRaw.slots.filter(Boolean).length,
        slotOpIds: normalizedSlotOpIds,
        removedOpIds: (updatedRaw.removedOpIds || []).slice(-80),
        hydrationUpdatedAtMs: nowMs,
      };
      const next = [...rolled];
      next[next.length - 1] = updated;

      p.localWriteLockUntilRef.current = nowMs + 2500;
      p.hydrationHistoryRef.current = next;
      p.setHydrationHistory(next);

      const reachedTarget = updated.cupsLogged >= updated.targetCups;
      let nextTargetDone = p.streaks.waterTargetDoneToday;
      let nextTargetDays = p.streaks.waterTargetDays;
      if (reachedTarget && !p.streaks.waterTargetDoneToday) {
        nextTargetDone = true;
        nextTargetDays = p.streaks.waterTargetDays + 1;
      } else if (!reachedTarget && p.streaks.waterTargetDoneToday) {
        nextTargetDone = false;
        nextTargetDays = Math.max(0, p.streaks.waterTargetDays - 1);
      }
      p.setStreaks((s) => ({ ...s, waterTargetDoneToday: nextTargetDone, waterTargetDays: nextTargetDays }));

      const nextWeekly = next.map((d) => d.cupsLogged);
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, hydrationHistory: next, deviceSettings: p.deviceSettings, lifeProfile: p.lifeProfile }));
      } catch { /* ignore */ }

      p.lastServerFieldsRef.current = {
        ...p.lastServerFieldsRef.current,
        hydrationDateKey: JSON.stringify(todayIso),
        cupsLogged: JSON.stringify(updated.cupsLogged),
        targetCups: JSON.stringify(updated.targetCups),
        hydrationWeeklyCounts: JSON.stringify(nextWeekly),
        hydrationSlotOpIds: JSON.stringify(updated.slotOpIds ?? []),
        hydrationRemovedOpIds: JSON.stringify(updated.removedOpIds ?? []),
        hydrationUpdatedAtMs: JSON.stringify(updated.hydrationUpdatedAtMs ?? nowMs),
        waterTargetDays: JSON.stringify(nextTargetDays),
        waterTargetDoneToday: JSON.stringify(nextTargetDone),
      };

      void p.pushToTasksVaultImmediately({
        hydrationDateKey: todayIso,
        cupsLogged: updated.cupsLogged,
        targetCups: updated.targetCups,
        hydrationWeeklyCounts: nextWeekly,
        hydrationSlotOpIds: updated.slotOpIds ?? [],
        hydrationRemovedOpIds: updated.removedOpIds ?? [],
        hydrationUpdatedAtMs: updated.hydrationUpdatedAtMs ?? nowMs,
        waterTargetDays: nextTargetDays,
        waterTargetDoneToday: nextTargetDone,
        ...(dismissSignal
          ? {
              lastDismissSignal: {
                timestampMs: nowMs,
                scope: dismissSignal.scope,
                action: dismissSignal.action,
                clientId: p.clientIdRef.current,
              },
            }
          : {}),
      });
      void p.pushFullCloudBackupImmediately();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.activeTimeZone, p.targetCups, p.streaks, p.deviceSettings, p.lifeProfile, p.pushToTasksVaultImmediately, p.pushFullCloudBackupImmediately]
  );

  const handleLogWaterCup = useCallback(
    (options?: { fromRemote?: boolean; waterOpId?: string; dateKey?: string }) => {
      stopContinuousAlert();
      stopNativeAlerts();
      p.setActiveAudioAlert(null);
      p.setPersistentAlert(null);
      p.setAlarmRinging(false);

      const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
      if (options?.dateKey && options.dateKey !== todayIso) return;

      const opId =
        options?.waterOpId ||
        `w_${Date.now().toString(36)}_${p.clientIdRef.current.slice(-4)}_${Math.random().toString(36).slice(2, 5)}`;

      if (!options?.fromRemote) {
        p.emitCrossDeviceSync('alarm_dismiss', 'water_confirmed', undefined, {
          alertId: 'water',
          waterOpId: opId,
          hydrationDateKey: todayIso,
        });
      }

      updateTodayHydration((today) => {
        const existingOpIds = today.slotOpIds || [];
        const removed = today.removedOpIds || [];
        if (existingOpIds.includes(opId) || removed.includes(opId)) return today;
        const nextIdx = today.slots.findIndex((filled) => !filled);
        if (nextIdx === -1) return today;
        const nextSlots = [...today.slots];
        nextSlots[nextIdx] = true;
        const nextSlotOpIds = Array.from({ length: today.targetCups }, (_, i) =>
          i === nextIdx ? opId : existingOpIds[i] || (nextSlots[i] ? `loc_s${i}` : '')
        );
        return { ...today, slots: nextSlots, slotOpIds: nextSlotOpIds, cupsLogged: nextSlots.filter(Boolean).length };
      }, options?.fromRemote ? undefined : { scope: 'alarm_dismiss', action: 'water_confirmed' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.activeTimeZone, updateTodayHydration, p.emitCrossDeviceSync]
  );
  p.handleLogWaterCupRef.current = handleLogWaterCup;

  const handleToggleWaterSlot = (index: number) => {
    const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
    const currentToday = p.hydrationHistoryRef.current[p.hydrationHistoryRef.current.length - 1];
    const becomingActive = currentToday ? !currentToday.slots[index] : true;
    const newOpId = becomingActive
      ? `w_${Date.now().toString(36)}_${p.clientIdRef.current.slice(-4)}_${index}`
      : '';

    if (becomingActive) {
      stopContinuousAlert();
      stopNativeAlerts();
      p.setActiveAudioAlert(null);
      p.setPersistentAlert(null);
      p.setAlarmRinging(false);
      p.emitCrossDeviceSync('alarm_dismiss', 'water_confirmed', undefined, {
        alertId: 'water',
        waterOpId: newOpId,
        hydrationDateKey: todayIso,
      });
    }

    updateTodayHydration((today) => {
      const nextSlots = [...today.slots];
      const slotActive = !nextSlots[index];
      nextSlots[index] = slotActive;
      const existingOpIds = Array.from({ length: today.targetCups }, (_, i) =>
        today.slotOpIds?.[i] || (today.slots[i] ? `loc_s${i}` : '')
      );
      const removedSet = new Set(today.removedOpIds || []);
      if (slotActive) {
        const idToUse = newOpId || `w_${Date.now().toString(36)}_${index}`;
        removedSet.delete(idToUse);
        existingOpIds[index] = idToUse;
      } else {
        const oldId = existingOpIds[index];
        if (oldId) removedSet.add(oldId);
        existingOpIds[index] = '';
      }
      return {
        ...today,
        slots: nextSlots,
        slotOpIds: existingOpIds,
        removedOpIds: Array.from(removedSet).slice(-80),
        cupsLogged: nextSlots.filter(Boolean).length,
      };
    }, becomingActive ? { scope: 'alarm_dismiss', action: 'water_confirmed' } : undefined);
  };

  return { updateTodayHydration, handleLogWaterCup, handleToggleWaterSlot };
}
