import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import {
  CreativeActivityItem,
  DualStreaks,
  DynamicHabit,
  MemoryItem,
  QuietModeType,
} from '../types/dayrhythm';
import type { AppSyncSettings } from '../firebase';

export interface UseThemeAndReactiveSyncParams {
  sunMode: boolean;
  appSettingsRef: MutableRefObject<AppSyncSettings>;
  updateAppSettings: (patch: Partial<AppSyncSettings>) => void;
  themeWaveTimerRef: MutableRefObject<number | null>;
  setThemeWaveDirection: Dispatch<SetStateAction<'sun' | 'night' | null>>;
  cloudPausedUntil: number;
  setCloudPausedUntil: Dispatch<SetStateAction<number>>;
  setFirestoreSynced: Dispatch<SetStateAction<boolean>>;
  isLoadingSettingsRef: MutableRefObject<boolean>;
  hasHydratedRemoteRef: MutableRefObject<boolean>;
  lastServerAppSettingsRef: MutableRefObject<string>;
  pushToTasksVaultRef: MutableRefObject<(patch?: Record<string, unknown>) => Promise<void> | Promise<boolean> | void>;
  phoneChargeLimitPct: number;
  smartChargeAlertEnabled: boolean;
  smartChargeKeepUntilUnplugged: boolean;
  waterRemindersEnabled: boolean;
  includePrayerAnchors: boolean;
  creativeActivities: CreativeActivityItem[];
  habits: DynamicHabit[];
  memories: MemoryItem[];
  streaks: DualStreaks;
  quietMode: QuietModeType;
  quietUntilTs: number | null;
  adhanOverrideSilent: boolean;
}

export function useThemeAndReactiveSync(p: UseThemeAndReactiveSyncParams) {
  const {
    sunMode,
    appSettingsRef,
    updateAppSettings,
    themeWaveTimerRef,
    setThemeWaveDirection,
    cloudPausedUntil,
    setCloudPausedUntil,
    setFirestoreSynced,
    isLoadingSettingsRef,
    hasHydratedRemoteRef,
    lastServerAppSettingsRef,
    pushToTasksVaultRef,
    phoneChargeLimitPct,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    waterRemindersEnabled,
    includePrayerAnchors,
    creativeActivities,
    habits,
    memories,
    streaks,
    quietMode,
    quietUntilTs,
    adhanOverrideSilent,
  } = p;

  useEffect(() => {
    document.documentElement.classList.toggle('theme-sun', sunMode);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sunMode ? '#eef1f4' : '#000000');
    try {
      localStorage.setItem('dayrhythm_sun_mode_v1', sunMode ? '1' : '0');
    } catch {
      // ignore
    }
  }, [sunMode]);

  const handleToggleSunMode = useCallback(() => {
    const nextSun = !appSettingsRef.current.sunMode;
    const rootEl = document.documentElement;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      updateAppSettings({ sunMode: nextSun });
      return;
    }

    const docWithTransition = document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };
    const sweepClass = nextSun ? 'theme-sweep-to-sun' : 'theme-sweep-to-night';
    if (themeWaveTimerRef.current !== null) {
      window.clearTimeout(themeWaveTimerRef.current);
      themeWaveTimerRef.current = null;
    }

    if (typeof docWithTransition.startViewTransition === 'function') {
      rootEl.classList.remove('theme-sweep-to-sun', 'theme-sweep-to-night');
      rootEl.classList.add('theme-sweeping', sweepClass);
      const transition = docWithTransition.startViewTransition(() => {
        flushSync(() => {
          updateAppSettings({ sunMode: nextSun });
        });
        rootEl.classList.toggle('theme-sun', nextSun);
      });
      transition.finished.finally(() => {
        rootEl.classList.remove('theme-sweeping', 'theme-sweep-to-sun', 'theme-sweep-to-night');
      });
      return;
    }

    rootEl.classList.add('theme-sweeping');
    setThemeWaveDirection(nextSun ? 'sun' : 'night');
    updateAppSettings({ sunMode: nextSun });
    themeWaveTimerRef.current = window.setTimeout(() => {
      themeWaveTimerRef.current = null;
      rootEl.classList.remove('theme-sweeping');
      setThemeWaveDirection(null);
    }, 860);
  }, [appSettingsRef, setThemeWaveDirection, themeWaveTimerRef, updateAppSettings]);

  useEffect(() => {
    const onQuota = (ev: Event) => {
      const until = (ev as CustomEvent<{ until?: number }>).detail?.until ?? 0;
      setCloudPausedUntil(until);
      setFirestoreSynced(false);
    };
    window.addEventListener('dayrhythm:cloud-quota', onQuota);
    return () => window.removeEventListener('dayrhythm:cloud-quota', onQuota);
  }, [setCloudPausedUntil, setFirestoreSynced]);

  useEffect(() => {
    if (cloudPausedUntil <= Date.now()) return;
    const id = window.setTimeout(() => setCloudPausedUntil(0), cloudPausedUntil - Date.now() + 500);
    return () => window.clearTimeout(id);
  }, [cloudPausedUntil, setCloudPausedUntil]);

  useEffect(() => {
    if (isLoadingSettingsRef.current || !hasHydratedRemoteRef.current) return;
    const json = JSON.stringify(appSettingsRef.current);
    if (json === lastServerAppSettingsRef.current) return;
    lastServerAppSettingsRef.current = json;
    void pushToTasksVaultRef.current({ appSettings: appSettingsRef.current });
  }, [
    appSettingsRef,
    hasHydratedRemoteRef,
    includePrayerAnchors,
    isLoadingSettingsRef,
    lastServerAppSettingsRef,
    phoneChargeLimitPct,
    pushToTasksVaultRef,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    sunMode,
    waterRemindersEnabled,
  ]);

  const lastSyncedCreativeSigRef = useRef<string>('');
  useEffect(() => {
    if (!hasHydratedRemoteRef.current) return;
    const sig = JSON.stringify(creativeActivities);
    if (sig === lastSyncedCreativeSigRef.current) return;
    lastSyncedCreativeSigRef.current = sig;
    void pushToTasksVaultRef.current({ creativeActivities });
  }, [creativeActivities, hasHydratedRemoteRef, pushToTasksVaultRef]);

  const lastSyncedHabitsSigRef = useRef<string>('');
  useEffect(() => {
    if (!hasHydratedRemoteRef.current) return;
    const sig = JSON.stringify(habits);
    if (sig === lastSyncedHabitsSigRef.current) return;
    lastSyncedHabitsSigRef.current = sig;
    void pushToTasksVaultRef.current({ habits });
  }, [habits, hasHydratedRemoteRef, pushToTasksVaultRef]);

  const lastSyncedMemoriesSigRef = useRef<string>('');
  useEffect(() => {
    if (!hasHydratedRemoteRef.current) return;
    const sig = JSON.stringify(memories);
    if (sig === lastSyncedMemoriesSigRef.current) return;
    lastSyncedMemoriesSigRef.current = sig;
    void pushToTasksVaultRef.current({ memories });
  }, [hasHydratedRemoteRef, memories, pushToTasksVaultRef]);

  const lastSyncedStreaksSigRef = useRef<string>('');
  useEffect(() => {
    if (!hasHydratedRemoteRef.current) return;
    const sig = `${streaks.dailyCommitmentDays}:${streaks.dailyCommitmentDoneToday}:${streaks.waterTargetDays}:${streaks.waterTargetDoneToday}`;
    if (sig === lastSyncedStreaksSigRef.current) return;
    lastSyncedStreaksSigRef.current = sig;
    void pushToTasksVaultRef.current({
      dailyCommitmentDays: streaks.dailyCommitmentDays,
      dailyCommitmentDoneToday: streaks.dailyCommitmentDoneToday,
      waterTargetDays: streaks.waterTargetDays,
      waterTargetDoneToday: streaks.waterTargetDoneToday,
    });
  }, [hasHydratedRemoteRef, pushToTasksVaultRef, streaks]);

  const lastSyncedQuietSigRef = useRef<string>('');
  useEffect(() => {
    if (!hasHydratedRemoteRef.current) return;
    const sig = `${quietMode}:${adhanOverrideSilent}`;
    if (sig === lastSyncedQuietSigRef.current) return;
    lastSyncedQuietSigRef.current = sig;
    let quietModeUpdatedAt = Date.now();
    try {
      quietModeUpdatedAt = Number(localStorage.getItem('dayrhythm_quiet_mode_updated_at_v1') || 0) || Date.now();
    } catch {
      // ignore
    }
    void pushToTasksVaultRef.current({ quietMode, quietUntilTs, quietModeUpdatedAt, adhanOverrideSilent });
  }, [adhanOverrideSilent, hasHydratedRemoteRef, pushToTasksVaultRef, quietMode, quietUntilTs]);

  return {
    handleToggleSunMode,
    lastSyncedCreativeSigRef,
    lastSyncedHabitsSigRef,
    lastSyncedMemoriesSigRef,
    lastSyncedStreaksSigRef,
    lastSyncedQuietSigRef,
  };
}
