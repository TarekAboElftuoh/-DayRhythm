import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { flushSync } from 'react-dom';
import type {
  ActiveTab,
  BatteryGuardState,
  CalendarTombstone,
  CreativeActivityItem,
  DailyRhythmPlan,
  DynamicHabit,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  PhoneBatteryTelemetry,
  ScheduleBlock,
} from '../types/dayrhythm';
import type { AppSyncSettings } from '../firebase';
import type { TasksVaultPayload } from '../types/appTypes';
import type { UserSettingsPayload } from '../services/cloudStateService';
import { calculateEgyptianPrayerTimes, getDateIsoInTimeZone, HOME_LOCATION } from '../engines/prayerEngine';
import { buildBaseSchedule } from '../engines/scheduleEngine';
import { loadSavedMedications } from '../hooks/medications/storage';
import {
  buildInitialHydrationHistory,
  INITIAL_TOMBSTONES,
  loadSavedCreativeActivities,
  loadSavedHabits,
  rollOverHydrationHistoryIfNeeded,
  SMART_CHARGE_KEEP_KEY,
  STORAGE_KEY,
  WATER_REMINDER_STORAGE_KEY,
} from '../utils/appHelpers';
import { readMigratedStorageBundle } from './useCoreStates';

export interface UseHydrationAndBatteryStatesParams {
  lifeProfile: LifeProfile;
  dailyRhythmPlan: DailyRhythmPlan;
  includePrayerAnchors: boolean;
  localWriteLockUntilRef: React.MutableRefObject<number>;
  saveCloudUserSettingsRef: React.MutableRefObject<(patch?: Partial<UserSettingsPayload>) => Promise<void>>;
  pushToTasksVaultRef: React.MutableRefObject<(patch?: Partial<TasksVaultPayload>) => Promise<void>>;
  setActiveTab: React.Dispatch<React.SetStateAction<ActiveTab>>;
  setIncludePrayerAnchors: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useHydrationAndBatteryStates(p: UseHydrationAndBatteryStatesParams) {
  const [offlineBlocks, setOfflineBlocks] = useState<ScheduleBlock[]>(() =>
    buildBaseSchedule('normal', calculateEgyptianPrayerTimes(HOME_LOCATION), {
      isFriday: new Date().getDay() === 5,
      includeBiweeklyPcCleanup: true,
    })
  );
  const [lastDeletedBlock, setLastDeletedBlock] = useState<ScheduleBlock | null>(null);
  const [shakeUndoSecondsLeft, setShakeUndoSecondsLeft] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [tombstones, setTombstones] = useState<CalendarTombstone[]>(INITIAL_TOMBSTONES);

  const [batteryGuard, setBatteryGuard] = useState<BatteryGuardState>(() => {
    let initialBypass: 80 | 90 | null = 90;
    try {
      const savedBypass = localStorage.getItem('dayrhythm_bypass_limit_v1');
      if (savedBypass === 'off' || savedBypass === 'null') initialBypass = null;
      else if (savedBypass !== null) {
        const parsed = Number(savedBypass);
        if (Number.isFinite(parsed) && parsed >= 60 && parsed <= 100) initialBypass = parsed <= 80 ? 80 : 90;
      }
    } catch { /* ignore */ }
    return {
      levelPct: 78,
      cableConnected: true,
      bypassChargingLimitPct: initialBypass,
      eveningTimeSimMin: 20 * 60 + 45,
      pcAlertActive: false,
      autoSilencedByDisconnect: false,
      bedtimeGuardTriggered: false,
    };
  });

  const [phoneChargeLimitPct, setPhoneChargeLimitPct] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('dayrhythm_phone_charge_limit'));
      if (Number.isFinite(saved) && saved >= 50 && saved <= 100) return Math.round(saved);
      const savedBypass = Number(localStorage.getItem('dayrhythm_bypass_limit_v1'));
      if (Number.isFinite(savedBypass) && savedBypass >= 50 && savedBypass <= 100) return Math.round(savedBypass);
      const migrated = readMigratedStorageBundle();
      if (migrated) return migrated.phoneChargeLimitPct;
    } catch { /* ignore */ }
    return 90;
  });

  const [phoneBattery, setPhoneBattery] = useState<PhoneBatteryTelemetry | null>(null);
  const [phoneChargeAlertDismissed, setPhoneChargeAlertDismissed] = useState(false);
  const [smartChargeAudioActive, setSmartChargeAudioActive] = useState(false);
  const [smartChargeAlertEnabled, setSmartChargeAlertEnabled] = useState<boolean>(() => {
    try { if (localStorage.getItem('dayrhythm_smart_charge_alert_enabled') === 'false') return false; } catch { /* ignore */ }
    return true;
  });
  const [smartChargeKeepUntilUnplugged, setSmartChargeKeepUntilUnplugged] = useState<boolean>(() => {
    try { if (localStorage.getItem(SMART_CHARGE_KEEP_KEY) === 'false') return false; } catch { /* ignore */ }
    return true;
  });
  const phoneChargeNotifiedCycleRef = useRef<boolean>(false);
  const phoneChargeLimitRef = useRef<number>(phoneChargeLimitPct);
  phoneChargeLimitRef.current = phoneChargeLimitPct;

  const handleSelectTab = useCallback((tab: ActiveTab) => {
    if (tab === 'assistant') {
      flushSync(() => { p.setActiveTab('assistant'); });
      window.dispatchEvent(new CustomEvent('dayrhythm:focus-chat'));
      window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('dayrhythm:focus-chat')));
      return;
    }
    p.setActiveTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const targetCups = p.dailyRhythmPlan.hydrationSlots.length || p.dailyRhythmPlan.activeTargetCups;
  const [hydrationHistory, setHydrationHistory] = useState<HydrationDayLog[]>(() => {
    const initialTz = p.lifeProfile.currentTimeZone || 'Africa/Cairo';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.hydrationHistory) && parsed.hydrationHistory.length === 7) {
          return rollOverHydrationHistoryIfNeeded(parsed.hydrationHistory, targetCups, initialTz);
        }
      }
    } catch { /* ignore */ }
    return buildInitialHydrationHistory(targetCups, initialTz);
  });

  const hydrationHistoryRef = useRef<HydrationDayLog[]>(hydrationHistory);
  hydrationHistoryRef.current = hydrationHistory;

  useEffect(() => {
    setHydrationHistory((prev) => {
      const today = prev[prev.length - 1];
      if (!today || (today.targetCups === targetCups && today.slots.length === targetCups)) return prev;
      const next = [...prev];
      const nextSlots = Array.from({ length: targetCups }, (_, idx) => Boolean(today.slots[idx]));
      const nextSlotOpIds = Array.from({ length: targetCups }, (_, idx) => today.slotOpIds?.[idx] || (nextSlots[idx] ? `init_s${idx}` : ''));
      next[next.length - 1] = { ...today, targetCups, cupsLogged: nextSlots.filter(Boolean).length, slots: nextSlots, slotOpIds: nextSlotOpIds };
      return next;
    });
  }, [targetCups]);

  useEffect(() => {
    const tz = p.lifeProfile.currentTimeZone || 'Africa/Cairo';
    const timerId = window.setInterval(() => {
      const todayIso = getDateIsoInTimeZone(tz);
      setHydrationHistory((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.dateKey === todayIso) return prev;
        return rollOverHydrationHistoryIfNeeded(prev, targetCups, tz);
      });
    }, 60_000);
    return () => window.clearInterval(timerId);
  }, [p.lifeProfile.currentTimeZone, targetCups]);

  const [medications, setMedications] = useState<MedicationItem[]>(loadSavedMedications);
  const seededDefaultMedRef = useRef(false);
  const [creativeActivities, setCreativeActivities] = useState<CreativeActivityItem[]>(loadSavedCreativeActivities);
  const seededDefaultCreativeRef = useRef(false);
  const [habits, setHabits] = useState<DynamicHabit[]>(loadSavedHabits);

  const [waterRemindersEnabled, setWaterRemindersEnabled] = useState<boolean>(() => {
    try { if (localStorage.getItem(WATER_REMINDER_STORAGE_KEY) === 'false') return false; } catch { /* ignore */ }
    return true;
  });

  const [sunMode, setSunMode] = useState<boolean>(() => {
    try { return localStorage.getItem('dayrhythm_sun_mode_v1') === '1'; } catch { return false; }
  });
  const [themeWaveDirection, setThemeWaveDirection] = useState<'sun' | 'night' | null>(null);
  const themeWaveTimerRef = useRef<number | null>(null);

  const appSettingsRef = useRef<AppSyncSettings>({
    phoneChargeLimitPct, smartChargeAlertEnabled, smartChargeKeepUntilUnplugged,
    waterRemindersEnabled, sunMode, includePrayerAnchors: p.includePrayerAnchors,
  });
  appSettingsRef.current = {
    phoneChargeLimitPct, smartChargeAlertEnabled, smartChargeKeepUntilUnplugged,
    waterRemindersEnabled, sunMode, includePrayerAnchors: p.includePrayerAnchors,
  };

  const updateAppSettings = useCallback((patch: Partial<AppSyncSettings>) => {
    const prev = appSettingsRef.current;
    const next: AppSyncSettings = { ...prev, ...patch };
    appSettingsRef.current = next;

    if (typeof patch.phoneChargeLimitPct === 'number') {
      const clamped = Math.max(50, Math.min(100, Math.round(patch.phoneChargeLimitPct)));
      next.phoneChargeLimitPct = clamped;
      setPhoneChargeLimitPct(clamped);
      phoneChargeLimitRef.current = clamped;
      try { localStorage.setItem('dayrhythm_phone_charge_limit', String(clamped)); } catch { /* ignore */ }
    }
    if (typeof patch.smartChargeAlertEnabled === 'boolean') {
      setSmartChargeAlertEnabled(patch.smartChargeAlertEnabled);
      try { localStorage.setItem('dayrhythm_smart_charge_alert_enabled', String(patch.smartChargeAlertEnabled)); } catch { /* ignore */ }
    }
    if (typeof patch.smartChargeKeepUntilUnplugged === 'boolean') {
      setSmartChargeKeepUntilUnplugged(patch.smartChargeKeepUntilUnplugged);
      try { localStorage.setItem(SMART_CHARGE_KEEP_KEY, String(patch.smartChargeKeepUntilUnplugged)); } catch { /* ignore */ }
    }
    if (typeof patch.waterRemindersEnabled === 'boolean') {
      setWaterRemindersEnabled(patch.waterRemindersEnabled);
      try { localStorage.setItem(WATER_REMINDER_STORAGE_KEY, String(patch.waterRemindersEnabled)); } catch { /* ignore */ }
    }
    if (typeof patch.sunMode === 'boolean') {
      setSunMode(patch.sunMode);
      try { localStorage.setItem('dayrhythm_sun_mode_v1', patch.sunMode ? '1' : '0'); } catch { /* ignore */ }
    }
    if (typeof patch.includePrayerAnchors === 'boolean') {
      p.setIncludePrayerAnchors(patch.includePrayerAnchors);
      try { localStorage.setItem('dayrhythm_include_prayer_anchors', String(patch.includePrayerAnchors)); } catch { /* ignore */ }
    }
    if (typeof patch.phoneChargeLimitPct === 'number' || typeof patch.smartChargeAlertEnabled === 'boolean') {
      p.localWriteLockUntilRef.current = Date.now() + 5000;
      try {
        (window as Window & { DayRhythmNative?: { setChargeLimit?: (l: number, e: boolean) => void } })
          .DayRhythmNative?.setChargeLimit?.(next.phoneChargeLimitPct, next.smartChargeAlertEnabled);
      } catch { /* ignore */ }
      void p.saveCloudUserSettingsRef.current({ appSettings: next });
    }
    void p.pushToTasksVaultRef.current({ appSettings: next });
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleIncludePrayerAnchors = useCallback(() => {
    updateAppSettings({ includePrayerAnchors: !appSettingsRef.current.includePrayerAnchors });
  }, [updateAppSettings]);

  return {
    offlineBlocks, setOfflineBlocks, lastDeletedBlock, setLastDeletedBlock,
    shakeUndoSecondsLeft, setShakeUndoSecondsLeft, toastMessage, setToastMessage,
    tombstones, setTombstones, batteryGuard, setBatteryGuard,
    phoneChargeLimitPct, setPhoneChargeLimitPct, phoneBattery, setPhoneBattery,
    phoneChargeAlertDismissed, setPhoneChargeAlertDismissed, smartChargeAudioActive, setSmartChargeAudioActive,
    smartChargeAlertEnabled, setSmartChargeAlertEnabled, smartChargeKeepUntilUnplugged, setSmartChargeKeepUntilUnplugged,
    phoneChargeNotifiedCycleRef, phoneChargeLimitRef, handleSelectTab, targetCups,
    hydrationHistory, setHydrationHistory, hydrationHistoryRef, medications, setMedications,
    seededDefaultMedRef, creativeActivities, setCreativeActivities, seededDefaultCreativeRef,
    habits, setHabits, waterRemindersEnabled, setWaterRemindersEnabled, sunMode, setSunMode,
    themeWaveDirection, setThemeWaveDirection, themeWaveTimerRef, appSettingsRef,
    updateAppSettings, handleToggleIncludePrayerAnchors,
  };
}
