import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type {
  ActiveTab,
  AppLanguage,
  DayMode,
  DeletedWorkspaceSnapshot,
  LifeProfile,
  PeriodicRitualStatus,
  QuietModeType,
  SharedChangelogEntry,
  SilentNotificationItem,
  SurfaceTheme,
  SyncTierMode,
  TaskSoundCategory,
  TravelState,
} from '../types/dayrhythm';
import type { PersistentAlertItem } from '../components/PersistentAlertOverlay';
import type { TasksVaultPayload } from '../types/appTypes';
import type { SpircClusterHandle } from '../services/spircClient';
import type { UserSettingsPayload } from '../services/cloudStateService';
import type { UpdateCheckResult } from '../services/updateCheckService';
import {
  DEFAULT_DEVICE_SETTINGS,
  sanitizeDeviceSettings,
  type OnePlusDeviceSettings,
  type SyncedRhythmPayload,
} from '../firebase';
import { DEFAULT_LIFE_PROFILE } from '../engines/lifeRhythmEngine';
import { getNowMinutesInTimeZone } from '../engines/prayerEngine';
import { stopContinuousAlert, unlockAudioContext } from '../engines/audioEngine';
import {
  detectIsMobileDeviceClient,
  INITIAL_CHANGELOG,
  INITIAL_PERIODIC_RITUALS,
  loadSavedSilentNotifications,
  STORAGE_KEY,
} from '../utils/appHelpers';
import { resolveMyDeviceId } from '../utils/deviceHelpers';
import { migrateAppState, SCHEMA_VERSION } from '../utils/schemaMigration';
import { sanitizeLifeProfile, sanitizeTravelState } from './sanitizers';

export const SURFACE_THEME_STORAGE_KEY = 'dayrhythm_surface_theme_v1';
export const TRAVEL_STATE_STORAGE_KEY = 'dayrhythm_travel_state_v1';

export function readMigratedStorageBundle() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return migrateAppState(JSON.parse(saved));
  } catch {
    return null;
  }
}

export function useCoreStates() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const hasOpenedAssistantRef = useRef(false);
  if (activeTab === 'assistant') hasOpenedAssistantRef.current = true;

  useEffect(() => {
    const isMobilePlatform =
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
    if ((isMobilePlatform && activeTab === 'overlay') || (!isMobilePlatform && activeTab === 'mobile')) {
      setActiveTab('dashboard');
    }
  }, [activeTab]);

  const [language, setLanguage] = useState<AppLanguage>('ar');
  const [dayMode] = useState<DayMode>('normal');
  const [isFridayMode, setIsFridayMode] = useState<boolean>(() => new Date().getDay() === 5);
  const [includeBiweeklyPcCleanup, setIncludeBiweeklyPcCleanup] = useState<boolean>(true);
  const [surfaceTheme, setSurfaceTheme] = useState<SurfaceTheme>(() => {
    try {
      const saved = localStorage.getItem(SURFACE_THEME_STORAGE_KEY);
      if (saved === 'amoled' || saved === 'obsidian') return saved;
    } catch { /* ignore */ }
    return 'amoled';
  });

  const [quietMode, setQuietMode] = useState<QuietModeType>(() => {
    try {
      const saved = localStorage.getItem('dayrhythm_quiet_mode_v1');
      if (saved === 'normal' || saved === 'mute_audio' || saved === 'vibrate_only' || saved === 'silent_all') {
        return saved;
      }
    } catch { /* ignore */ }
    return 'normal';
  });
  const [quietUntilTs, setQuietUntilTs] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem('dayrhythm_quiet_until_ts_v1');
      if (!raw || raw === 'null') return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch {
      return null;
    }
  });
  const [quietRemainingSec, setQuietRemainingSec] = useState<number>(() => {
    try {
      const savedMode = localStorage.getItem('dayrhythm_quiet_mode_v1');
      if (!savedMode || savedMode === 'normal') return 0;
      const rawUntil = localStorage.getItem('dayrhythm_quiet_until_ts_v1');
      if (!rawUntil || rawUntil === 'null') return 0;
      const until = Number(rawUntil);
      if (Number.isFinite(until) && until > Date.now()) return Math.max(1, Math.ceil((until - Date.now()) / 1000));
    } catch { /* ignore */ }
    return 0;
  });
  const [stealthAudioOnly, setStealthAudioOnly] = useState<boolean>(() => {
    try { return localStorage.getItem('dayrhythm_stealth_audio_only_v1') === '1'; } catch { return false; }
  });
  const [adhanOverrideSilent, setAdhanOverrideSilent] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dayrhythm_adhan_override_silent_v1');
      return saved === null ? true : saved === '1';
    } catch { return true; }
  });
  const [alarmRinging, setAlarmRinging] = useState<boolean>(false);
  const [syncTier, setSyncTier] = useState<SyncTierMode>('google_calendar_api');
  const [periodicRituals, setPeriodicRituals] = useState<PeriodicRitualStatus[]>(() => INITIAL_PERIODIC_RITUALS);
  const [changelog, setChangelog] = useState<SharedChangelogEntry[]>(INITIAL_CHANGELOG);

  const [travelState, setTravelState] = useState<TravelState>(() => {
    try {
      const saved = localStorage.getItem(TRAVEL_STATE_STORAGE_KEY);
      if (saved) return sanitizeTravelState(JSON.parse(saved));
      const migrated = readMigratedStorageBundle();
      if (migrated?.travelState) return sanitizeTravelState(migrated.travelState);
    } catch { /* ignore */ }
    return sanitizeTravelState(null);
  });

  const [needsAuth, setNeedsAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firestoreReady, setFirestoreReady] = useState(false);
  const [firestoreSynced, setFirestoreSynced] = useState(false);
  const [googleDriveSynced, setGoogleDriveSynced] = useState(false);
  const [isSyncingGoogleDrive, setIsSyncingGoogleDrive] = useState(false);
  const hasHydratedGoogleDriveRef = useRef(false);
  const isSavingGoogleDriveRef = useRef(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [deviceSettings, setDeviceSettings] = useState<OnePlusDeviceSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.deviceSettings) return sanitizeDeviceSettings(parsed.deviceSettings);
      }
    } catch { /* ignore */ }
    return DEFAULT_DEVICE_SETTINGS;
  });

  const [lifeProfile, setLifeProfile] = useState<LifeProfile>(() => {
    const migrated = readMigratedStorageBundle();
    return migrated?.lifeProfile ? sanitizeLifeProfile(migrated.lifeProfile) : sanitizeLifeProfile(DEFAULT_LIFE_PROFILE);
  });
  const lifeProfileRef = useRef<LifeProfile>(lifeProfile);
  lifeProfileRef.current = lifeProfile;

  const [fastingOverride, setFastingOverride] = useState<'auto' | 'fasting' | 'normal'>('auto');
  const [isLifeProfileModalOpen, setIsLifeProfileModalOpen] = useState(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [locationResolutionState, setLocationResolutionState] = useState<
    'idle' | 'resolving_gps' | 'gps_locked' | 'timezone_fallback'
  >('idle');

  const [workspaceTokenExpired, setWorkspaceTokenExpired] = useState(false);
  const [isRefreshingWorkspaceToken, setIsRefreshingWorkspaceToken] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateCheckResult | null>(null);
  const [nowTickMin, setNowTickMin] = useState<number>(() =>
    getNowMinutesInTimeZone(lifeProfile.currentTimeZone || 'Africa/Cairo')
  );
  const snoozeTimersRef = useRef<number[]>([]);
  const [silentNotifications, setSilentNotifications] = useState<SilentNotificationItem[]>(loadSavedSilentNotifications);
  const [activeAudioAlert, setActiveAudioAlert] = useState<{
    id: string; title: string; category: TaskSoundCategory; isContinuous?: boolean;
  } | null>(null);
  const [persistentAlert, setPersistentAlert] = useState<PersistentAlertItem | null>(null);
  const activeAudioAlertRef = useRef<{ id: string; firedAtMs: number } | null>(null);
  const persistentAlertRef = useRef<{ id: string; createdAtMs: number } | null>(null);
  const handledDismissedAlarmIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeAudioAlertRef.current = activeAudioAlert ? { id: activeAudioAlert.id, firedAtMs: Date.now() } : null;
  }, [activeAudioAlert]);
  useEffect(() => {
    persistentAlertRef.current = persistentAlert ? { id: persistentAlert.id, createdAtMs: persistentAlert.createdAtMs } : null;
  }, [persistentAlert]);

  const alarmRingingRef = useRef<boolean>(alarmRinging);
  useEffect(() => { alarmRingingRef.current = alarmRinging; }, [alarmRinging]);

  const clientIdRef = useRef<string>(resolveMyDeviceId());

  useEffect(() => {
    if (typeof window === 'undefined' || detectIsMobileDeviceClient()) return;
    let disposed = false;
    const cleanup = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    const unlock = () => { cleanup(); if (!disposed) unlockAudioContext(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
    return () => { disposed = true; cleanup(); };
  }, []);

  useEffect(() => {
    stopContinuousAlert();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(0); } catch { /* ignore */ }
    }
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  const wsConnected = firestoreSynced;
  const seenSyncOpIdsRef = useRef<Set<string>>(new Set());
  const restoredOpIdsRef = useRef<Set<string>>(new Set());
  const wasInPrayerSanctuaryRef = useRef<boolean>(false);
  const [lastDeletedWorkspaceItem, setLastDeletedWorkspaceItem] = useState<DeletedWorkspaceSnapshot | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(true);
  const isLoadingSettingsRef = useRef<boolean>(true);
  const hasHydratedRemoteRef = useRef(false);
  const localWriteLockUntilRef = useRef<number>(0);
  const lastServerFieldsRef = useRef<Record<string, string>>({});
  const pendingRemoteRef = useRef<SyncedRhythmPayload | null>(null);
  const lastServerAppSettingsRef = useRef<string>('');
  const [cloudPausedUntil, setCloudPausedUntil] = useState(0);
  const pendingRemoteTimerRef = useRef<number | null>(null);
  const pushToTasksVaultRef = useRef<(patch?: Partial<TasksVaultPayload>) => Promise<void>>(() => Promise.resolve());
  const spircClusterRef = useRef<SpircClusterHandle | null>(null);
  const lastScheduledAlarmsJsonRef = useRef<string>('');
  const lastSyncedCloudAlarmsJsonRef = useRef<string>('');
  const recentCloudWriteTimestampsRef = useRef<number[]>([]);
  const pendingBurstFlushTimerRef = useRef<number | null>(null);
  const pendingBurstPatchRef = useRef<Partial<UserSettingsPayload> | null>(null);
  const saveCloudUserSettingsRef = useRef<(patch?: Partial<UserSettingsPayload>) => Promise<void>>(() => Promise.resolve());
  const lastSpircFullStateRef = useRef<Record<string, unknown>>({});
  const pendingPatchesBeforeHydrationRef = useRef<Array<Partial<TasksVaultPayload>>>([]);
  const handleToggleMedicationRef = useRef<(id: string, doseTime24?: string, options?: { fromRemote?: boolean }) => void>(() => {});
  const handleLogWaterCupRef = useRef<(options?: { fromRemote?: boolean; waterOpId?: string; dateKey?: string }) => void>(() => {});

  const updateLifeProfileLocal = useCallback((updater: Parameters<typeof setLifeProfile>[0]) => {
    localWriteLockUntilRef.current = Date.now() + 300;
    const nowMs = Date.now();
    const prev = lifeProfileRef.current;
    const next = sanitizeLifeProfile(typeof updater === 'function' ? updater(prev) : updater);
    lifeProfileRef.current = next;
    setLifeProfile(next);
    try {
      const currentRaw = localStorage.getItem(STORAGE_KEY);
      const current = currentRaw ? JSON.parse(currentRaw) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, schemaVersion: SCHEMA_VERSION, lifeProfile: next }));
      localStorage.setItem('dayrhythm_life_profile_updated_at_v1', String(nowMs));
    } catch { /* ignore */ }
    void pushToTasksVaultRef.current({ lifeProfile: next });
    return next;
  }, []);

  return {
    activeTab, setActiveTab, hasOpenedAssistantRef, language, setLanguage, dayMode,
    isFridayMode, setIsFridayMode, includeBiweeklyPcCleanup, setIncludeBiweeklyPcCleanup,
    surfaceTheme, setSurfaceTheme, quietMode, setQuietMode, quietUntilTs, setQuietUntilTs,
    quietRemainingSec, setQuietRemainingSec, stealthAudioOnly, setStealthAudioOnly,
    adhanOverrideSilent, setAdhanOverrideSilent, alarmRinging, setAlarmRinging,
    syncTier, setSyncTier, periodicRituals, setPeriodicRituals, changelog, setChangelog,
    travelState, setTravelState, needsAuth, setNeedsAuth, authUser, setAuthUser,
    firebaseUser, setFirebaseUser, firestoreReady, setFirestoreReady, firestoreSynced, setFirestoreSynced,
    googleDriveSynced, setGoogleDriveSynced, isSyncingGoogleDrive, setIsSyncingGoogleDrive,
    hasHydratedGoogleDriveRef, isSavingGoogleDriveRef, isLoggingIn, setIsLoggingIn,
    deviceSettings, setDeviceSettings, lifeProfile, setLifeProfile, lifeProfileRef,
    fastingOverride, setFastingOverride, isLifeProfileModalOpen, setIsLifeProfileModalOpen,
    isDetectingGps, setIsDetectingGps, locationResolutionState, setLocationResolutionState,
    workspaceTokenExpired, setWorkspaceTokenExpired, isRefreshingWorkspaceToken, setIsRefreshingWorkspaceToken,
    isCheckingUpdates, setIsCheckingUpdates, availableUpdate, setAvailableUpdate,
    nowTickMin, setNowTickMin, snoozeTimersRef, silentNotifications, setSilentNotifications,
    activeAudioAlert, setActiveAudioAlert, persistentAlert, setPersistentAlert,
    activeAudioAlertRef, persistentAlertRef, handledDismissedAlarmIdsRef, alarmRingingRef,
    clientIdRef, wsRef, wsConnected, seenSyncOpIdsRef, restoredOpIdsRef, wasInPrayerSanctuaryRef,
    lastDeletedWorkspaceItem, setLastDeletedWorkspaceItem, isLoadingSettings, setIsLoadingSettings,
    isLoadingSettingsRef, hasHydratedRemoteRef, localWriteLockUntilRef, lastServerFieldsRef,
    pendingRemoteRef, lastServerAppSettingsRef, cloudPausedUntil, setCloudPausedUntil,
    pendingRemoteTimerRef, pushToTasksVaultRef, spircClusterRef, lastScheduledAlarmsJsonRef,
    lastSyncedCloudAlarmsJsonRef, recentCloudWriteTimestampsRef, pendingBurstFlushTimerRef,
    pendingBurstPatchRef, saveCloudUserSettingsRef, lastSpircFullStateRef,
    pendingPatchesBeforeHydrationRef, handleToggleMedicationRef, handleLogWaterCupRef,
    updateLifeProfileLocal,
  };
}
