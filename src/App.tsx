/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { User } from 'firebase/auth';
import {
  ActiveSanctuaryState,
  ActiveTab,
  AppLanguage,
  BatteryGuardState,
  AppSettingsPatch,
  CalendarActionProposal,
  CalendarExecutionResult,
  CalendarTombstone,
  CreativeActivityActionProposal,
  CreativeActivityItem,
  CreativeActivityPlacement,
  CreativeCadence,
  CreativeExecutionResult,
  DayMode,
  DeletedWorkspaceSnapshot,
  DualStreaks,
  FreeTimeSlot,
  GmailDigestItem,
  GoogleCalendarEventItem,
  GoogleCalendarInfo,
  GoogleTaskItem,
  GoogleTaskList,
  HydrationDayLog,
  LifeProfile,
  MedicationActionProposal,
  MedicationExecutionResult,
  MedicationItem,
  MemoryActionProposal,
  MemoryCategory,
  MemoryItem,
  PeriodicRitualStatus,
  PersistedChatMessage,
  PhoneBatteryTelemetry,
  PomodoroState,
  QuietModeType,
  ScheduleBlock,
  SharedChangelogEntry,
  SilentNotificationItem,
  SoundRepeatSetting,
  SunlightSessionId,
  SunlightSettings,
  SurfaceTheme,
  DEFAULT_SUNLIGHT_SETTINGS,
  SyncTierMode,
  TaskActionProposal,
  TaskExecutionResult,
  TaskSoundCategory,
  TodayCalendarMeta,
  TomorrowAlertInfo,
  TravelState,
  UiPrefs,
  WeatherHydrationInfo,
  WorkspaceSyncSignal,
} from './types/dayrhythm';
import {
  getCalendarAccessToken,
  getOrRefreshCalendarAccessToken,
  initCalendarAuth,
  markCalendarTokenExpired,
  isCalendarTokenExpiringSoon,
  observeFirebaseUser,
  refreshGoogleCalendarToken,
  refreshGoogleCalendarTokenSilently,
  signInWithGoogleCalendar,
  signOutGoogleCalendar,
} from './services/googleCalendarAuth';
import {
  hasPermanentLink,
  isPermanentLinkAvailable,
  startPermanentLink,
} from './services/googleOfflineAccess';
import {
  apiFetchJson,
  cleanCalendarText,
  clearGeminiClientCache,
  BackendUnavailableError,
  getSavedCloudApiUrl,
  hasSameOriginBackend,
  resolveBlockDisplayInfo,
  sanitizePersistedChats,
  sortChatMessagesChronologically,
  syncSavedCloudApiUrlFromRemote,
} from './services/apiClient';
import {
  FullDayRhythmCloudBackup,
  loadFromGoogleDriveAppData,
  saveToGoogleDriveAppData,
} from './services/googleDriveStorage';
import {
  fetchCloudUserSettings,
  saveCloudUserSettings,
  registerActiveAlarm,
  dismissActiveAlarmInCloud,
  subscribeToActiveAlarms,
  subscribeToUserDocument,
  cleanupExpiredActiveAlarms,
  deleteTasksVaultListIfPresent,
  emitCloudLiveSignal,
  subscribeToCloudLiveSignals,
  syncScheduledAlarmsToCloud,
  setCloudAlertSession,
  broadcastAlertTrigger,
  broadcastAlertDismiss,
  mergeHydrationTodaySlots,
  type DayRhythmAlertSession,
  type LiveSyncSignal,
  type SanctuarySilenceMode,
  type UserSettingsPayload,
} from './services/cloudStateService';

import {
  connectSpircCluster,
  loadFromNativeSqlite,
  persistToNativeSqlite,
  SPIRC_ACTION,
  SPIRC_ENTITY,
  type SpircClusterHandle,
} from './services/spircClient';
import {
  auth,
  firebaseConfig,
  configuredDbId,
  DEFAULT_CREATIVE_ACTIVITIES,
  DEFAULT_DEVICE_SETTINGS,
  DEFAULT_MEDICATIONS,
  DEFAULT_MEMORIES,
  OnePlusDeviceSettings,
  publishPhoneBatteryTelemetry,
  getNativeCloudAuthPayload,
  publishWorkspaceSyncSignal,
  sanitizeCreativeActivityId,
  sanitizeCreativeActivityItem,
  sanitizeDeviceSettings,
  sanitizeLifeProfile as firebaseSanitizeLifeProfile,
  sanitizeMedicationItem,
  sanitizeMemoryId,
  sanitizeMemoryItem,
  sanitizeRhythmPayload as firebaseSanitizeRhythmPayload,
  sanitizeSoundRepeats,
  sanitizeUiPrefs,
  sanitizeAppSyncSettings,
  sanitizePhoneBattery,
  getCloudQuotaPausedUntil,
  type AppSyncSettings,
  type SyncedRhythmPayload,
  triggerFirestoreRecovery,
} from './firebase';

const VALID_SANCTUARY_SILENCE_MODES: ReadonlyArray<SanctuarySilenceMode> = [
  'silent_inbox',
  'silent_notif',
  'vibrate_notif',
  'hide_all',
];

function sanitizeLifeProfile(raw: Partial<LifeProfile> | undefined): LifeProfile {
  const base = firebaseSanitizeLifeProfile(raw);
  const rawMode = raw?.sanctuarySilenceMode;
  const sanctuarySilenceMode: SanctuarySilenceMode = VALID_SANCTUARY_SILENCE_MODES.includes(
    rawMode as SanctuarySilenceMode
  )
    ? (rawMode as SanctuarySilenceMode)
    : 'silent_inbox';
  return { ...base, sanctuarySilenceMode, schemaVersion: SCHEMA_VERSION };
}

function sanitizeRhythmPayload(payload: SyncedRhythmPayload): SyncedRhythmPayload {
  const clean = firebaseSanitizeRhythmPayload(payload);
  return {
    ...clean,
    lifeProfile: sanitizeLifeProfile(payload.lifeProfile),
  };
}
import {
  loadDeletedMedicationIds,
  loadMedicationsUpdatedAt,
  loadSavedMedications,
  MEDS_DELETED_IDS_STORAGE_KEY,
  MEDS_STORAGE_KEY,
  MEDS_UPDATED_AT_STORAGE_KEY,
  useMedicationActions,
} from './hooks/useMedications';
import {
  HOME_LOCATION,
  PRESET_LOCATIONS,
  calculateEgyptianPrayerTimes,
  computeEventRangeInTimeZone,
  formatIsoTo12h,
  formatMinutes12h,
  formatNow12hInTimeZone,
  getDateIsoInTimeZone,
  getNowMinutesInTimeZone,
  getTimeZoneOffsetString,
  getTimeZoneUtcOffsetHours,
  getTodayCalendarMeta,
  getSpecialFastDay,
  getWeekdayInTimeZone,
  haversineDistanceKm,
  parseIsoToTimeZoneInfo,
  resolveOfflineCityName,
  reverseGeocodeCityName,
} from './engines/prayerEngine';
import {
  DEFAULT_LIFE_PROFILE,
  analyzeTomorrowAlert,
  buildLifeProfileGeminiSummary,
  computeCreativePlacements,
  computeDailyRhythmPlan,
  computeMedicationDaysLeft,
  findFreeTimeSlotsForToday,
} from './engines/lifeRhythmEngine';
import { applyTravelMatrix, buildBaseSchedule } from './engines/scheduleEngine';
import {
  DEFAULT_SOUND_REPEATS,
  TASK_SOUND_META,
  classifyTaskSound,
  evaluateAudioSanctuary,
  playBatteryFullSignature,
  playSoftChime,
  playSunlightChime,
  playTaskSignature,
  startSmartChargeCompleteAlert,
  stopContinuousAlert,
  stopSmartChargeCompleteAlert,
  unlockAudioContext,
} from './engines/audioEngine';
import { fetchOpenMeteoWeather, loadCachedWeather } from './engines/weatherEngine';
import {
  computeDailySunlightSessions,
  type ComputedSunlightSession,
} from './engines/sunlightEngine';
import { triggerHapticWaveform } from './engines/hapticsEngine';
import { formatCountdown } from './hooks/useCountdown';
import { TopBar } from './components/TopBar';
import { DashboardView } from './components/DashboardView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SCHEMA_VERSION, migrateAppState } from './utils/schemaMigration';
import {
  checkForGitHubReleaseUpdate,
  type UpdateCheckResult,
} from './services/updateCheckService';
import {
  DEFAULT_LOGO_ID,
  SELECTED_LOGO_STORAGE_KEY,
  getLogoConceptById,
} from './components/logoRegistry';
import type {
  CapsulePrefs,
  CapsuleTrackInfo,
} from './components/FloatingPiPCapsule';
import { isAndroidNativeApp } from './services/platform';
import { AppModals } from './components/AppModals';
import { useBackupActions } from './hooks/useBackupActions';
import { useDeviceSync } from './hooks/useDeviceSync';
import { readNativeBatterySnapshot, resolveMyDeviceId, stopNativeAlerts } from './utils/deviceHelpers';
import { SYNC_TASK_TITLE, VAULT_LIST_TITLE, type TasksVaultPayload } from './types/appTypes';
const MobilePreviewView = lazy(() => import('./components/MobilePreviewView').then((m) => ({ default: m.MobilePreviewView })));
const OverlaySimulatorView = lazy(() => import('./components/OverlaySimulatorView').then((m) => ({ default: m.OverlaySimulatorView })));
const GeminiAssistantView = lazy(() => import('./components/GeminiAssistantView').then((m) => ({ default: m.GeminiAssistantView })));
const SmartCatchUpModal = lazy(() => import('./components/SmartCatchUpModal').then((m) => ({ default: m.SmartCatchUpModal })));
const PomodoroModal = lazy(() => import('./components/PomodoroModal').then((m) => ({ default: m.PomodoroModal })));
const LifeProfileModal = lazy(() => import('./components/LifeProfileModal').then((m) => ({ default: m.LifeProfileModal })));
const LogoPickerModal = lazy(() => import('./components/LogoPickerModal').then((m) => ({ default: m.LogoPickerModal })));
const FloatingPiPCapsule = lazy(() => import('./components/FloatingPiPCapsule').then((m) => ({ default: m.FloatingPiPCapsule })));
import { trueNowMs } from './engines/trueClock';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  PersistentAlertItem,
  PersistentAlertOverlay,
} from './components/PersistentAlertOverlay';

import {
  STORAGE_KEY,
  CREATIVE_STORAGE_KEY,
  MEMORIES_STORAGE_KEY,
  CHAT_STORAGE_KEY,
  SILENT_NOTIFS_STORAGE_KEY,
  WATER_REMINDER_STORAGE_KEY,
  ACTIVE_UID_STORAGE_KEY,
  SMART_CHARGE_KEEP_KEY,
  OFFLINE_CAL_PREFIX,
  OFFLINE_TASKS_PREFIX,
  OFFLINE_GMAIL_PREFIX,
  CAPSULE_PREFS_STORAGE_KEY,
  loadSavedCapsulePrefs,
  saveOfflineWorkspaceCache,
  loadOfflineWorkspaceCache,
  clearAllPersonalLocalStorage,
  WELCOME_MESSAGE,
  loadSavedChats,
  loadSavedCreativeActivities,
  loadSavedMemories,
  loadSavedSilentNotifications,
  getLast7DayLabels,
  buildInitialHydrationHistory,
  rollOverHydrationHistoryIfNeeded,
  resolveCalendarActionTargets,
  resolveRelativeCalendarStarts,
  type QueuedGoogleOp,
  readGoogleOfflineQueue,
  writeGoogleOfflineQueue,
  isNetworkFailure,
  resolveTaskActionTargets,
  GOOGLE_SESSION_EXPIRED_AR,
  SKIP_PATTERN_STORAGE_KEY,
  RHYTHM_FIELD_GROUPS,
  serializeRhythmFields,
  normalizeSkipPatternKey,
  detectIsMobileDeviceClient,
  extractTaskTimeMinutesForToday,
  INITIAL_TOMBSTONES,
  INITIAL_PERIODIC_RITUALS,
  INITIAL_CHANGELOG,
  extractEmojiPair,
} from './utils/appHelpers';
export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const hasOpenedAssistantRef = useRef(false);
  if (activeTab === 'assistant') {
    hasOpenedAssistantRef.current = true;
  }
  useEffect(() => {
    const isMobilePlatform =
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      window.innerWidth < 768;
    if (
      (isMobilePlatform && activeTab === 'overlay') ||
      (!isMobilePlatform && activeTab === 'mobile')
    ) {
      setActiveTab('dashboard');
    }
  }, [activeTab]);
  const [language, setLanguage] = useState<AppLanguage>('ar');
  const [dayMode] = useState<DayMode>('normal');
  const [isFridayMode, setIsFridayMode] = useState<boolean>(
    () => new Date().getDay() === 5
  );
  const [includeBiweeklyPcCleanup, setIncludeBiweeklyPcCleanup] = useState<boolean>(true);
  const SURFACE_THEME_STORAGE_KEY = 'dayrhythm_surface_theme_v1';
  const [surfaceTheme, setSurfaceTheme] = useState<SurfaceTheme>(() => {
    try {
      const saved = localStorage.getItem(SURFACE_THEME_STORAGE_KEY);
      if (saved === 'amoled' || saved === 'obsidian') return saved;
    } catch {
      // ignore
    }
    return 'amoled';
  });

  // 4 Smart Timed Quiet Modes + Auto-Revert Timer (persisted with absolute quietUntilTs)
  const [quietMode, setQuietMode] = useState<QuietModeType>(() => {
    try {
      const saved = localStorage.getItem('dayrhythm_quiet_mode_v1');
      if (saved === 'normal' || saved === 'mute_audio' || saved === 'vibrate_only' || saved === 'silent_all') {
        return saved;
      }
    } catch {
      // ignore
    }
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
      if (Number.isFinite(until) && until > Date.now()) {
        return Math.max(1, Math.ceil((until - Date.now()) / 1000));
      }
    } catch {
      // ignore
    }
    return 0;
  });
  const [stealthAudioOnly, setStealthAudioOnly] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dayrhythm_stealth_audio_only_v1') === '1';
    } catch {
      return false;
    }
  });
  const [adhanOverrideSilent, setAdhanOverrideSilent] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dayrhythm_adhan_override_silent_v1');
      return saved === null ? true : saved === '1';
    } catch {
      return true;
    }
  });
  const [alarmRinging, setAlarmRinging] = useState<boolean>(false);

  const [syncTier, setSyncTier] = useState<SyncTierMode>('google_calendar_api');
  const [periodicRituals, setPeriodicRituals] = useState<PeriodicRitualStatus[]>(() =>
    INITIAL_PERIODIC_RITUALS
  );
  const [changelog, setChangelog] = useState<SharedChangelogEntry[]>(INITIAL_CHANGELOG);

  const TRAVEL_STATE_STORAGE_KEY = 'dayrhythm_travel_state_v1';
  const readMigratedStorageBundle = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      return migrateAppState(JSON.parse(saved));
    } catch {
      return null;
    }
  };
  const sanitizeTravelState = (raw: Partial<TravelState> | null | undefined): TravelState => ({
    active: Boolean(raw?.active),
    location: raw?.location && typeof raw.location.lat === 'number' ? raw.location : HOME_LOCATION,
    distanceKm: typeof raw?.distanceKm === 'number' ? raw.distanceKm : 0,
    durationMode: raw?.durationMode || 'until_return',
    returnDate: typeof raw?.returnDate === 'string' && raw.returnDate ? raw.returnDate : undefined,
    deferredCategories: Array.isArray(raw?.deferredCategories) ? raw.deferredCategories : [],
    deferredMedIds: Array.isArray(raw?.deferredMedIds) ? raw.deferredMedIds : [],
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : 0,
    postponedTaskIds: Array.isArray(raw?.postponedTaskIds) ? raw.postponedTaskIds : ['room_cleanup'],
    enabledWorkTaskIds: Array.isArray(raw?.enabledWorkTaskIds)
      ? raw.enabledWorkTaskIds
      : ['deep_work_1', 'deep_work_2', 'practical_work_3', 'light_workout'],
  });

  const [travelState, setTravelState] = useState<TravelState>(() => {
    try {
      const saved = localStorage.getItem(TRAVEL_STATE_STORAGE_KEY);
      if (saved) return sanitizeTravelState(JSON.parse(saved));
      const migrated = readMigratedStorageBundle();
      if (migrated?.travelState) return sanitizeTravelState(migrated.travelState);
    } catch {
      // ignore storage errors
    }
    return sanitizeTravelState(null);
  });

  // Live Google Workspace & Firebase Sync State (Calendar + Tasks + Firestore + Persisted Gemini Chat)
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
        if (parsed.deviceSettings) {
          return sanitizeDeviceSettings(parsed.deviceSettings);
        }
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_DEVICE_SETTINGS;
  });

  const [lifeProfile, setLifeProfile] = useState<LifeProfile>(() => {
    const migrated = readMigratedStorageBundle();
    if (migrated?.lifeProfile) {
      return sanitizeLifeProfile(migrated.lifeProfile);
    }
    return sanitizeLifeProfile(DEFAULT_LIFE_PROFILE);
  });
  const lifeProfileRef = useRef<LifeProfile>(lifeProfile);
  lifeProfileRef.current = lifeProfile;

  const [fastingOverride, setFastingOverride] = useState<'auto' | 'fasting' | 'normal'>('auto');
  const [isLifeProfileModalOpen, setIsLifeProfileModalOpen] = useState(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [locationResolutionState, setLocationResolutionState] = useState<
    'idle' | 'resolving_gps' | 'gps_locked' | 'timezone_fallback'
  >('idle');

  // Automatic Audio Silence Sanctuaries + Timed Meeting Mode (driven by quietMode) + Preserved Silent Notifications
  const [workspaceTokenExpired, setWorkspaceTokenExpired] = useState(false);
  const [isRefreshingWorkspaceToken, setIsRefreshingWorkspaceToken] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateCheckResult | null>(null);
  const [nowTickMin, setNowTickMin] = useState<number>(() =>
    getNowMinutesInTimeZone(lifeProfile.currentTimeZone || 'Africa/Cairo')
  );
  const snoozeTimersRef = useRef<number[]>([]);
  const [silentNotifications, setSilentNotifications] = useState<SilentNotificationItem[]>(
    loadSavedSilentNotifications
  );
  const [activeAudioAlert, setActiveAudioAlert] = useState<{
    id: string;
    title: string;
    category: TaskSoundCategory;
    isContinuous?: boolean;
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
  useEffect(() => {
    alarmRingingRef.current = alarmRinging;
  }, [alarmRinging]);

  const clientIdRef = useRef<string>(resolveMyDeviceId());

  // Browsers keep the Web Audio context suspended until a real user gesture, so an alarm firing
  // hours later stayed silent on the PC while the phone rang. Warm the audio stack on the first
  // interaction (silent 20ms blip) so every later alert card actually plays its sound.
  useEffect(() => {
    if (typeof window === 'undefined' || detectIsMobileDeviceClient()) return;
    let disposed = false;
    const cleanup = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    const unlock = () => {
      cleanup();
      if (disposed) return;
      unlockAudioContext();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    // Kill any leftover continuous alarm or vibration on app launch
    stopContinuousAlert();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {
        // ignore
      }
    }
  }, []);
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnected = firestoreSynced;
  const seenSyncOpIdsRef = useRef<Set<string>>(new Set());
  const restoredOpIdsRef = useRef<Set<string>>(new Set());
  const wasInPrayerSanctuaryRef = useRef<boolean>(false);
  const [lastDeletedWorkspaceItem, setLastDeletedWorkspaceItem] =
    useState<DeletedWorkspaceSnapshot | null>(null);

  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(true);
  const isLoadingSettingsRef = useRef<boolean>(true);
  const hasHydratedRemoteRef = useRef(false);
  const localWriteLockUntilRef = useRef<number>(0);
  // Last value of each synced field as the server has it (from snapshots). A save only sends the
  // fields whose local value differs from this, so a device never pushes a field it didn't change.
  const lastServerFieldsRef = useRef<Record<string, string>>({});
  // Newest snapshot that arrived during the write-lock; applied when the lock ends instead of
  // being dropped (a dropped snapshot is never re-delivered, so that device stayed stale forever).
  const pendingRemoteRef = useRef<SyncedRhythmPayload | null>(null);
  const lastServerAppSettingsRef = useRef<string>('');
  const [cloudPausedUntil, setCloudPausedUntil] = useState(0);
  const pendingRemoteTimerRef = useRef<number | null>(null);
  const pushToTasksVaultRef = useRef<(patch?: Partial<TasksVaultPayload>) => Promise<void>>(() => Promise.resolve());
  const spircClusterRef = useRef<SpircClusterHandle | null>(null);
  const recentCloudWriteTimestampsRef = useRef<number[]>([]);
  const pendingBurstFlushTimerRef = useRef<number | null>(null);
  const pendingBurstPatchRef = useRef<Partial<UserSettingsPayload> | null>(null);
  const saveCloudUserSettingsRef = useRef<(patch?: Partial<UserSettingsPayload>) => Promise<void>>(() => Promise.resolve());
  const lastSpircFullStateRef = useRef<Record<string, unknown>>({});
  const pendingPatchesBeforeHydrationRef = useRef<Array<Partial<TasksVaultPayload>>>([]);
  const handleToggleMedicationRef = useRef<(id: string, doseTime24?: string, options?: { fromRemote?: boolean }) => void>(() => {});
  const handleLogWaterCupRef = useRef<(options?: { fromRemote?: boolean; waterOpId?: string; dateKey?: string }) => void>(() => {});

  // Any LOCALLY-initiated lifeProfile edit arms the write lock (see the Firestore listener's
  // "Date.now() < localWriteLockUntilRef.current" guard above) so a snapshot that happens to
  // arrive mid-flight — triggered by something unrelated, like the phone's battery ping — can't
  // revert the very click/tap that caused this edit back to its pre-click value. Previously only
  // some lifeProfile updaters armed this lock by hand; the quiet-day toggle, the sleep buttons,
  // and others did not, which is why clicking them could appear to silently "undo itself".
  const updateLifeProfileLocal = useCallback(
    (updater: Parameters<typeof setLifeProfile>[0]) => {
      localWriteLockUntilRef.current = Date.now() + 300;
      const nowMs = Date.now();
      const prev = lifeProfileRef.current;
      const next = sanitizeLifeProfile(typeof updater === 'function' ? updater(prev) : updater);
      lifeProfileRef.current = next;
      setLifeProfile(next);
      try {
        const currentRaw = localStorage.getItem(STORAGE_KEY);
        const current = currentRaw ? JSON.parse(currentRaw) : {};
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...current, schemaVersion: SCHEMA_VERSION, lifeProfile: next })
        );
        localStorage.setItem('dayrhythm_life_profile_updated_at_v1', String(nowMs));
      } catch {
        // ignore storage errors
      }
      void pushToTasksVaultRef.current({ lifeProfile: next });
      return next;
    },
    []
  );

  const [calendarList, setCalendarList] = useState<GoogleCalendarInfo[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEventItem[]>([]);
  const recentlyCreatedEventIdsRef = useRef<Set<string>>(new Set());
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [googleTaskLists, setGoogleTaskLists] = useState<GoogleTaskList[]>([]);
  const [googleTasks, setGoogleTasks] = useState<GoogleTaskItem[]>([]);
  const recentlyCreatedTaskIdsRef = useRef<Set<string>>(new Set());
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Free Open-Meteo Weather Hydration Sync + Read-Only Smart Gmail Digest
  const [weatherInfo, setWeatherInfo] = useState<WeatherHydrationInfo | null>(loadCachedWeather);
  const [gmailDigest, setGmailDigest] = useState<GmailDigestItem[]>([]);
  const [gmailScannedCount, setGmailScannedCount] = useState<number>(0);
  const [loadingGmail, setLoadingGmail] = useState(false);
  const [gmailNeedsReauth, setGmailNeedsReauth] = useState(false);
  const [gmailError, setGmailError] = useState('');

  // Persisted Gemini chat messages across sessions/tabs
  const [chatMessages, setChatMessages] = useState<PersistedChatMessage[]>(loadSavedChats);

  // Toggles for Prayer Anchors overlay & Explicit Offline Demo fallback (false by default!)
  const [includePrayerAnchors, setIncludePrayerAnchors] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dayrhythm_include_prayer_anchors');
      if (saved !== null) return saved === 'true';
    } catch {
      // ignore
    }
    return true;
  });
  const [useOfflineDemo, setUseOfflineDemo] = useState<boolean>(false);
  const [completedOverrides, setCompletedOverrides] = useState<Record<string, boolean>>({});
  const [reflowedBlocksOverride, setReflowedBlocksOverride] = useState<ScheduleBlock[] | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<ScheduleBlock[] | null>(null);

  const profileLocation = useMemo(
    () => ({
      id: 'profile_loc',
      nameAr: lifeProfile.currentCityName,
      nameEn: lifeProfile.currentCityName,
      lat: lifeProfile.currentLat,
      lng: lifeProfile.currentLng,
      tzOffsetHours: getTimeZoneUtcOffsetHours(lifeProfile.currentTimeZone),
      timeZone: lifeProfile.currentTimeZone,
    }),
    [lifeProfile]
  );

  const activeLocation = travelState.active ? travelState.location : profileLocation;
  const activeTimeZone = useMemo(() => {
    const browserTz =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : 'Africa/Cairo';
    return activeLocation.timeZone || lifeProfile.currentTimeZone || browserTz || 'Africa/Cairo';
  }, [activeLocation.timeZone, lifeProfile.currentTimeZone]);

  // Auto-sync free Open-Meteo temperature for active location (only when signed in so signed-out state stays clean)
  useEffect(() => {
    if (needsAuth) return;
    let cancelled = false;
    void fetchOpenMeteoWeather(activeLocation.lat, activeLocation.lng).then((info) => {
      if (!cancelled && info) {
        setWeatherInfo(info);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [needsAuth, activeLocation.lat, activeLocation.lng]);

  const todayCairoIso = useMemo(
    () => getDateIsoInTimeZone(activeTimeZone),
    // Re-evaluate automatically when minute/hour ticks cross midnight
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTimeZone, nowTickMin]
  );

  const prayers = useMemo(
    () =>
      calculateEgyptianPrayerTimes(
        activeLocation,
        new Date(),
        lifeProfile.adhanLeadMinutes
      ),
    // Recalculate automatically at midnight when todayCairoIso rolls over
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeLocation, lifeProfile.adhanLeadMinutes, todayCairoIso]
  );

  const todayCalendarMeta: TodayCalendarMeta = useMemo(
    () => getTodayCalendarMeta(activeTimeZone),
    // Refresh metadata when timezone changes or date rolls over
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTimeZone, todayCairoIso]
  );

  const tomorrowInfo = useMemo(() => {
    const tz = activeLocation.timeZone ?? lifeProfile.currentTimeZone ?? 'Africa/Cairo';
    const todayW = getWeekdayInTimeZone(tz);
    const base = new Date(`${todayCairoIso}T12:00:00Z`);
    const nextIso = Number.isNaN(base.getTime())
      ? ''
      : new Date(base.getTime() + 86_400_000).toISOString().slice(0, 10);
    return {
      todayW,
      tomorrowW: (todayW + 1) % 7,
      tomorrowIso: nextIso,
    };
  }, [activeLocation.timeZone, lifeProfile.currentTimeZone, todayCairoIso]);

  // Sunnah fasts from the Hijri calendar: يوم عرفة (9 Dhu al-Hijjah) and يوم عاشوراء (10 Muharram).
  const specialFastToday = useMemo(
    () => getSpecialFastDay(todayCairoIso, activeTimeZone),
    [todayCairoIso, activeTimeZone]
  );
  const specialFastTomorrow = useMemo(
    () => getSpecialFastDay(tomorrowInfo.tomorrowIso, activeTimeZone),
    [tomorrowInfo.tomorrowIso, activeTimeZone]
  );

  const dailyRhythmPlan = useMemo(
    () =>
      computeDailyRhythmPlan(lifeProfile, prayers, {
        todayWeekday: tomorrowInfo.todayW,
        tomorrowWeekday: tomorrowInfo.tomorrowW,
        fastingOverride,
        heatBonusMl: weatherInfo?.heatBonusMl ?? 0,
        specialFastTodayAr: specialFastToday?.nameAr ?? null,
        specialFastTomorrowAr: specialFastTomorrow?.nameAr ?? null,
      }),
    [
      tomorrowInfo.todayW,
      tomorrowInfo.tomorrowW,
      fastingOverride,
      lifeProfile,
      prayers,
      weatherInfo?.heatBonusMl,
      specialFastToday,
      specialFastTomorrow,
    ]
  );

  const tomorrowAlert: TomorrowAlertInfo | null = useMemo(() => {
    const routineKeywords =
      /(نوم|استيقاظ|الصلوات|صلاة|صلاه|الفجر|الظهر|العصر|المغرب|العشاء|الوتر|وتر|الضحى|قيام|تراويح|الجمعة|سنن|أذكار|اذكار|قرآن|قران|ورد|شرب|ماء|ماية|مياه|ترطيب|فطار|إفطار|افطار|غداء|عشاء|سحور|وجبة|تنظيف|ترتيب|الأوضة|الاوضة|اوضة|أوضة|الغرفة|الغرفه|غرفة|غرفه|مذاكرة|مراجعة|جيم|تمرين|رياضة|مشي|روتين|قيلولة|استحمام|دش|مكمل|فيتامين|بذور اليقطين|دواء|علاج|قهوة|شاي|شمس|sunlight)/i;
    const externalSpecialPattern =
      /(سفر|رحلة|طيران|مطار|قطار|دكتور|طبيب|عيادة|مستشفى|تحليل|مقابلة|إنترفيو|انترفيو|امتحان|اختبار|تسليم|اجتماع|لقاء|مكالمة|مؤتمر|موعد|زيارة|مناسبة|حجز|flight|airport|travel|trip|doctor|clinic|hospital|interview|exam|deadline|meeting|call|sync|appointment|visit|booking)/i;

    const normalizeEvSig = (ev: GoogleCalendarEventItem): string => {
      const cleaned = cleanCalendarText(ev.summary || '').toLowerCase();
      return cleaned
        .replace(/\d{1,2}:\d{2}\s*(ص|م|am|pm)?/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const sigDays = new Map<string, Set<string>>();
    for (const ev of calendarEvents) {
      const dIso = String(ev.start ?? '').slice(0, 10);
      if (!dIso) continue;
      const sig = normalizeEvSig(ev);
      if (!sig) continue;
      if (!sigDays.has(sig)) sigDays.set(sig, new Set());
      sigDays.get(sig)!.add(dIso);
    }

    const nonRoutineTomorrowEvents = calendarEvents.filter((ev) => {
      const dIso = String(ev.start ?? '').slice(0, 10);
      if (dIso !== tomorrowInfo.tomorrowIso) return false;
      if (ev.isRecurring || ev.recurringEventId) return false;
      const sig = normalizeEvSig(ev);
      const text = `${ev.summary ?? ''} ${ev.description ?? ''} ${ev.location ?? ''}`;
      if (externalSpecialPattern.test(text)) return true;
      if (sig && (sigDays.get(sig)?.size ?? 1) >= 2) return false;
      if (routineKeywords.test(text)) return false;
      return true;
    });

    const base = analyzeTomorrowAlert(
      nonRoutineTomorrowEvents,
      tomorrowInfo.tomorrowIso,
      tomorrowInfo.tomorrowW
    );
    if (!specialFastTomorrow) return base;
    const headline = `${specialFastTomorrow.emoji} بكرة ${specialFastTomorrow.nameAr} — صيام سُنّة`;
    const detail = 'السحور ومواعيد المية اتظبطوا تلقائياً على الصيام';
    if (base) return { ...base, headlineAr: headline, detailAr: `${detail} · ${base.detailAr}` };
    return {
      tomorrowIso: tomorrowInfo.tomorrowIso,
      weekdayAr: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][tomorrowInfo.tomorrowW] ?? '',
      isBusy: false,
      hasSpecialEvent: true,
      eventCount: 0,
      totalHours: 0,
      specialEvents: [],
      headlineAr: headline,
      detailAr: detail,
    };
  }, [calendarEvents, tomorrowInfo.tomorrowIso, tomorrowInfo.tomorrowW, specialFastTomorrow]);

  const lowEnergyActive = lifeProfile.lowEnergyDateKey === todayCairoIso;
  const activeOneTimeSilenceMinutes =
    lifeProfile.oneTimeSilenceDateKey === todayCairoIso
      ? lifeProfile.oneTimeSilenceMinutes ?? 0
      : 0;

  const [sanctuaryOverrideUntilMs, setSanctuaryOverrideUntilMs] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('dayrhythm_sanctuary_override_until_v1');
      if (raw !== null) {
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > Date.now() ? parsed : 0;
      }
      const migrated = readMigratedStorageBundle();
      if (migrated && migrated.sanctuaryOverrideUntilMs > Date.now()) {
        return migrated.sanctuaryOverrideUntilMs;
      }
    } catch {
      return 0;
    }
    return 0;
  });
  const sanctuaryOverrideUntilMsRef = useRef<number>(sanctuaryOverrideUntilMs);
  sanctuaryOverrideUntilMsRef.current = sanctuaryOverrideUntilMs;

  const rawActiveSanctuary: ActiveSanctuaryState = useMemo(
    () =>
      evaluateAudioSanctuary({
        nowMin: nowTickMin,
        prayers,
        bedtimeMin: dailyRhythmPlan.bedtimeMin,
        wakeMin: dailyRhythmPlan.wakeMin,
        prayerSilenceMinutes: lifeProfile.prayerSilenceMinutes,
        fajrSilenceMinutes: lifeProfile.fajrSilenceMinutes,
        oneTimeSilenceMinutes: activeOneTimeSilenceMinutes,
        // Any non-normal quietMode (set via the dashboard's timed meeting-mode picker, Gemini,
        // or another device) now genuinely silences task/water/medication alerts — previously
        // this depended on a separate meetingModeActive boolean that quietMode never touched,
        // so picking "mute" or "vibrate" from the picker had no actual muting effect.
        meetingActive: quietMode !== 'normal',
        meetingMuteFully: quietMode === 'mute_audio' || quietMode === 'silent_all',
        isFriday: isFridayMode,
      }),
    [
      nowTickMin,
      prayers,
      dailyRhythmPlan.bedtimeMin,
      dailyRhythmPlan.wakeMin,
      lifeProfile.prayerSilenceMinutes,
      lifeProfile.fajrSilenceMinutes,
      activeOneTimeSilenceMinutes,
      quietMode,
      isFridayMode,
    ]
  );

  const activeSanctuary: ActiveSanctuaryState = useMemo(() => {
    if (
      (rawActiveSanctuary.type === 'prayer' || rawActiveSanctuary.type === 'sleep') &&
      sanctuaryOverrideUntilMs > Date.now()
    ) {
      return {
        type: 'none',
        labelAr: 'الوضع العادي',
        muteAll: false,
        vibrateOnly: false,
      };
    }
    return rawActiveSanctuary;
  }, [rawActiveSanctuary, sanctuaryOverrideUntilMs]);

  const handleCancelActiveSanctuaryEarly = useCallback(() => {
    const endsAtMin = rawActiveSanctuary.endsAtMin;
    const deltaMin =
      endsAtMin !== undefined
        ? endsAtMin >= nowTickMin
          ? endsAtMin - nowTickMin
          : 1440 - nowTickMin + endsAtMin
        : 60;
    const untilMs = Date.now() + Math.max(1, deltaMin) * 60_000;
    localWriteLockUntilRef.current = Date.now() + 5000;
    sanctuaryOverrideUntilMsRef.current = untilMs;
    setSanctuaryOverrideUntilMs(untilMs);
    try {
      localStorage.setItem('dayrhythm_sanctuary_override_until_v1', String(untilMs));
    } catch {
      // ignore storage errors
    }
    lastScheduledAlarmsJsonRef.current = '';
    lastSyncedCloudAlarmsJsonRef.current = '';
    void saveCloudUserSettingsRef.current({ sanctuaryOverrideUntilMs: untilMs });
    void pushToTasksVaultRef.current({ sanctuaryOverrideUntilMs: untilMs });
  }, [rawActiveSanctuary.endsAtMin, nowTickMin]);

  // Auto-revert one-time prayer silence override immediately after that single prayer finishes
  useEffect(() => {
    if (activeSanctuary.type === 'prayer' && activeOneTimeSilenceMinutes >= 5) {
      wasInPrayerSanctuaryRef.current = true;
      return;
    }
    if (activeSanctuary.type !== 'prayer' && wasInPrayerSanctuaryRef.current) {
      wasInPrayerSanctuaryRef.current = false;
      updateLifeProfileLocal((prev) =>
        sanitizeLifeProfile({
          ...prev,
          oneTimeSilenceMinutes: 0,
          oneTimeSilenceDateKey: '',
        })
      );
    }
  }, [activeSanctuary.type, activeOneTimeSilenceMinutes]);

  const effectiveDayMode: DayMode = dailyRhythmPlan.isFastingToday ? 'fasting' : dayMode;

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
      if (savedBypass === 'off' || savedBypass === 'null') {
        initialBypass = null;
      } else if (savedBypass !== null) {
        const parsed = Number(savedBypass);
        if (Number.isFinite(parsed) && parsed >= 60 && parsed <= 100) {
          initialBypass = parsed <= 80 ? 80 : 90;
        }
      }
    } catch {
      // ignore storage errors
    }
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
      if (Number.isFinite(saved) && saved >= 60 && saved <= 100) return Math.round(saved);
      const savedBypass = Number(localStorage.getItem('dayrhythm_bypass_limit_v1'));
      if (Number.isFinite(savedBypass) && savedBypass >= 60 && savedBypass <= 100) return Math.round(savedBypass);
      const migrated = readMigratedStorageBundle();
      if (migrated) return migrated.phoneChargeLimitPct;
    } catch {
      // ignore storage errors
    }
    return 90;
  });

  const [phoneBattery, setPhoneBattery] = useState<PhoneBatteryTelemetry | null>(null);
  const [phoneChargeAlertDismissed, setPhoneChargeAlertDismissed] = useState(false);
  const [smartChargeAudioActive, setSmartChargeAudioActive] = useState(false);
  const [smartChargeAlertEnabled, setSmartChargeAlertEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dayrhythm_smart_charge_alert_enabled');
      if (saved === 'false') return false;
    } catch {
      // ignore storage errors
    }
    return true;
  });
  const [smartChargeKeepUntilUnplugged, setSmartChargeKeepUntilUnplugged] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(SMART_CHARGE_KEEP_KEY);
      if (saved === 'false') return false;
    } catch {
      // ignore storage errors
    }
    return true;
  });
  const phoneChargeNotifiedCycleRef = useRef<boolean>(false);
  const phoneChargeLimitRef = useRef<number>(phoneChargeLimitPct);
  phoneChargeLimitRef.current = phoneChargeLimitPct;

  const handleSelectTab = useCallback((tab: ActiveTab) => {
    if (tab === 'assistant') {
      flushSync(() => {
        setActiveTab('assistant');
      });
      window.dispatchEvent(new CustomEvent('dayrhythm:focus-chat'));
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('dayrhythm:focus-chat'));
      });
      return;
    }
    setActiveTab(tab);
  }, []);

  const targetCups = dailyRhythmPlan.hydrationSlots.length || dailyRhythmPlan.activeTargetCups;

  const [hydrationHistory, setHydrationHistory] = useState<HydrationDayLog[]>(() => {
    const initialTz = lifeProfile.currentTimeZone || 'Africa/Cairo';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.hydrationHistory) && parsed.hydrationHistory.length === 7) {
          return rollOverHydrationHistoryIfNeeded(parsed.hydrationHistory, targetCups, initialTz);
        }
      }
    } catch {
      // ignore storage errors
    }
    return buildInitialHydrationHistory(targetCups, initialTz);
  });

  const hydrationHistoryRef = useRef<HydrationDayLog[]>(hydrationHistory);
  hydrationHistoryRef.current = hydrationHistory;

  // Sync today's hydration target & slot count whenever weight/height/cupSize/fasting changes
  useEffect(() => {
    setHydrationHistory((prev) => {
      const today = prev[prev.length - 1];
      if (!today || (today.targetCups === targetCups && today.slots.length === targetCups)) return prev;
      const next = [...prev];
      const nextSlots = Array.from({ length: targetCups }, (_, idx) => Boolean(today.slots[idx]));
      const nextSlotOpIds = Array.from({ length: targetCups }, (_, idx) =>
        today.slotOpIds?.[idx] || (nextSlots[idx] ? `init_s${idx}` : '')
      );
      const nextLogged = nextSlots.filter(Boolean).length;
      next[next.length - 1] = {
        ...today,
        targetCups,
        cupsLogged: nextLogged,
        slots: nextSlots,
        slotOpIds: nextSlotOpIds,
      };
      return next;
    });
  }, [targetCups]);

  // Live midnight rollover for hydrationHistory when the app stays open across 00:00
  useEffect(() => {
    const tz = lifeProfile.currentTimeZone || 'Africa/Cairo';
    const checkRollover = () => {
      const todayIso = getDateIsoInTimeZone(tz);
      setHydrationHistory((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.dateKey === todayIso) return prev;
        return rollOverHydrationHistoryIfNeeded(prev, targetCups, tz);
      });
    };
    const timerId = window.setInterval(checkRollover, 60_000);
    return () => window.clearInterval(timerId);
  }, [lifeProfile.currentTimeZone, targetCups]);

  const [medications, setMedications] = useState<MedicationItem[]>(loadSavedMedications);
  const seededDefaultMedRef = useRef(false);

  const [creativeActivities, setCreativeActivities] = useState<CreativeActivityItem[]>(
    loadSavedCreativeActivities
  );
  const seededDefaultCreativeRef = useRef(false);

  const [waterRemindersEnabled, setWaterRemindersEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(WATER_REMINDER_STORAGE_KEY);
      if (saved === 'false') return false;
    } catch {
      // ignore storage errors
    }
    return true;
  });

  // ── ☀️ Sunlight mode (per device; the night theme stays the default) ───────────────
  const [sunMode, setSunMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dayrhythm_sun_mode_v1') === '1';
    } catch {
      return false;
    }
  });
  const [themeWaveDirection, setThemeWaveDirection] = useState<'sun' | 'night' | null>(null);
  const themeWaveTimerRef = useRef<number | null>(null);

  // ── ☀️ Daily Sunlight Exposure Settings & Snooze ─────────────────────────────────
  const SUNLIGHT_SETTINGS_STORAGE_KEY = 'dayrhythm_sunlight_settings_v1';

  const sanitizeSunlightSettings = useCallback((raw: unknown): SunlightSettings => {
    if (!raw || typeof raw !== 'object') return DEFAULT_SUNLIGHT_SETTINGS;
    const obj = raw as Record<string, unknown>;
    const skinTone =
      obj.skinTone === 'fair' || obj.skinTone === 'wheat' || obj.skinTone === 'dark'
        ? obj.skinTone
        : DEFAULT_SUNLIGHT_SETTINGS.skinTone;
    const exposureMode =
      obj.exposureMode === 'auto' ||
      obj.exposureMode === 'face_hands' ||
      obj.exposureMode === 'arms_light'
        ? obj.exposureMode
        : DEFAULT_SUNLIGHT_SETTINGS.exposureMode;
    const rawSessions =
      obj.sessions && typeof obj.sessions === 'object'
        ? (obj.sessions as Record<string, unknown>)
        : {};
    const sanitizeSession = (id: SunlightSessionId) => {
      const def = DEFAULT_SUNLIGHT_SETTINGS.sessions[id];
      const s =
        rawSessions[id] && typeof rawSessions[id] === 'object'
          ? (rawSessions[id] as Record<string, unknown>)
          : {};
      return {
        enabled: typeof s.enabled === 'boolean' ? s.enabled : def.enabled,
        autoDuration: typeof s.autoDuration === 'boolean' ? s.autoDuration : def.autoDuration,
        customMinutes:
          typeof s.customMinutes === 'number' && Number.isFinite(s.customMinutes)
            ? Math.round(s.customMinutes)
            : def.customMinutes,
        labelAr: typeof s.labelAr === 'string' && s.labelAr.trim() ? s.labelAr : def.labelAr,
        emoji: typeof s.emoji === 'string' && s.emoji.trim() ? s.emoji : def.emoji,
        descAr: typeof s.descAr === 'string' && s.descAr.trim() ? s.descAr : def.descAr,
      };
    };
    return {
      enabled: typeof obj.enabled === 'boolean' ? obj.enabled : DEFAULT_SUNLIGHT_SETTINGS.enabled,
      leadMinutes:
        typeof obj.leadMinutes === 'number' && Number.isFinite(obj.leadMinutes)
          ? Math.max(0, Math.min(15, Math.round(obj.leadMinutes)))
          : DEFAULT_SUNLIGHT_SETTINGS.leadMinutes,
      skinTone,
      exposureMode,
      sessions: {
        morning: sanitizeSession('morning'),
        noon: sanitizeSession('noon'),
        evening: sanitizeSession('evening'),
      },
    };
  }, []);

  const [sunlightSettings, setSunlightSettings] = useState<SunlightSettings>(() => {
    try {
      const saved = localStorage.getItem('dayrhythm_sunlight_settings_v1');
      if (!saved) return DEFAULT_SUNLIGHT_SETTINGS;
      return sanitizeSunlightSettings(JSON.parse(saved));
    } catch {
      return DEFAULT_SUNLIGHT_SETTINGS;
    }
  });

  const handleUpdateSunlightSettings = useCallback(
    (next: SunlightSettings) => {
      const clean = sanitizeSunlightSettings(next);
      setSunlightSettings(clean);
      try {
        localStorage.setItem(SUNLIGHT_SETTINGS_STORAGE_KEY, JSON.stringify(clean));
      } catch {
        // ignore storage errors
      }
    },
    [sanitizeSunlightSettings]
  );

  const [sunlightSnooze, setSunlightSnooze] = useState<{
    dateKey: string;
    offsets: Record<SunlightSessionId, number>;
  }>(() => ({
    dateKey: todayCairoIso,
    offsets: { morning: 0, noon: 0, evening: 0 },
  }));

  useEffect(() => {
    setSunlightSnooze((prev) =>
      prev.dateKey === todayCairoIso
        ? prev
        : { dateKey: todayCairoIso, offsets: { morning: 0, noon: 0, evening: 0 } }
    );
  }, [todayCairoIso]);

  const sunlightSessions = useMemo<ComputedSunlightSession[]>(() => {
    const base = computeDailySunlightSessions(
      prayers,
      weatherInfo,
      sunlightSettings,
      nowTickMin
    );
    const activeOffsets =
      sunlightSnooze.dateKey === todayCairoIso ? sunlightSnooze.offsets : null;
    const hourlyList = Array.isArray(weatherInfo?.hourly) ? weatherInfo.hourly : [];
    return base.map((s) => {
      const snoozeMin = activeOffsets ? activeOffsets[s.id] ?? 0 : 0;
      const startMinutes = s.startMinutes + snoozeMin;
      const endMinutes = s.endMinutes + snoozeMin;
      const alertMinutes = Math.max(0, startMinutes - s.leadMinutes);
      const canSnooze =
        Math.max(nowTickMin, startMinutes) + 5 + s.durationMinutes <=
        s.windowEndMinutes;

      const targetHour = Math.max(0, Math.min(23, Math.floor(startMinutes / 60)));
      const matchedHourly =
        hourlyList.find((h) => h.hour === targetHour) ??
        hourlyList.find((h) => Math.abs(h.hour - targetHour) <= 1) ??
        null;
      const isCloudBlocked = matchedHourly ? matchedHourly.cloudCover >= 75 : false;
      const cloudNoteAr = isCloudBlocked
        ? nowTickMin >= startMinutes && nowTickMin < endMinutes
          ? '☁️ غيوم كثيفة — لا توجد أشعة الآن'
          : '☁️ توقع غيوم كثيفة في وقت الجلسة'
        : null;

      return {
        ...s,
        startMinutes,
        endMinutes,
        alertMinutes,
        canSnooze,
        isCloudBlocked,
        cloudNoteAr,
        cloudCover: matchedHourly?.cloudCover ?? s.cloudCover,
      };
    });
  }, [prayers, weatherInfo, sunlightSettings, nowTickMin, sunlightSnooze, todayCairoIso]);

  const handleSnoozeSunlight = useCallback(
    (id: SunlightSessionId) => {
      setSunlightSnooze((prev) => {
        const baseOffsets =
          prev.dateKey === todayCairoIso
            ? prev.offsets
            : { morning: 0, noon: 0, evening: 0 };
        return {
          dateKey: todayCairoIso,
          offsets: {
            ...baseOffsets,
            [id]: (baseOffsets[id] ?? 0) + 5,
          },
        };
      });
    },
    [todayCairoIso]
  );

  const appSettingsRef = useRef<AppSyncSettings>({
    phoneChargeLimitPct,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    waterRemindersEnabled,
    sunMode,
    includePrayerAnchors,
  });
  appSettingsRef.current = {
    phoneChargeLimitPct,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    waterRemindersEnabled,
    sunMode,
    includePrayerAnchors,
  };

  const updateAppSettings = useCallback(
    (patch: Partial<AppSyncSettings>) => {
      const prev = appSettingsRef.current;
      const next: AppSyncSettings = {
        ...prev,
        ...patch,
      };
      appSettingsRef.current = next;

      if (typeof patch.phoneChargeLimitPct === 'number') {
        const clamped = Math.max(60, Math.min(100, Math.round(patch.phoneChargeLimitPct)));
        next.phoneChargeLimitPct = clamped;
        setPhoneChargeLimitPct(clamped);
        phoneChargeLimitRef.current = clamped;
        try {
          localStorage.setItem('dayrhythm_phone_charge_limit', String(clamped));
        } catch {}
      }
      if (typeof patch.smartChargeAlertEnabled === 'boolean') {
        setSmartChargeAlertEnabled(patch.smartChargeAlertEnabled);
        try {
          localStorage.setItem('dayrhythm_smart_charge_alert_enabled', String(patch.smartChargeAlertEnabled));
        } catch {}
      }
      if (typeof patch.smartChargeKeepUntilUnplugged === 'boolean') {
        setSmartChargeKeepUntilUnplugged(patch.smartChargeKeepUntilUnplugged);
        try {
          localStorage.setItem(SMART_CHARGE_KEEP_KEY, String(patch.smartChargeKeepUntilUnplugged));
        } catch {}
      }
      if (typeof patch.waterRemindersEnabled === 'boolean') {
        setWaterRemindersEnabled(patch.waterRemindersEnabled);
        try {
          localStorage.setItem(WATER_REMINDER_STORAGE_KEY, String(patch.waterRemindersEnabled));
        } catch {}
      }
      if (typeof patch.sunMode === 'boolean') {
        setSunMode(patch.sunMode);
        try {
          localStorage.setItem('dayrhythm_sun_mode_v1', patch.sunMode ? '1' : '0');
        } catch {}
      }
      if (typeof patch.includePrayerAnchors === 'boolean') {
        setIncludePrayerAnchors(patch.includePrayerAnchors);
        try {
          localStorage.setItem('dayrhythm_include_prayer_anchors', String(patch.includePrayerAnchors));
        } catch {}
      }

      if (typeof patch.phoneChargeLimitPct === 'number' || typeof patch.smartChargeAlertEnabled === 'boolean') {
        localWriteLockUntilRef.current = Date.now() + 5000;
        try {
          (window as Window & { DayRhythmNative?: { setChargeLimit?: (l: number, e: boolean) => void } })
            .DayRhythmNative?.setChargeLimit?.(next.phoneChargeLimitPct, next.smartChargeAlertEnabled);
        } catch {
          // ignore bridge errors
        }
        void saveCloudUserSettingsRef.current({ appSettings: next });
      }

      void pushToTasksVaultRef.current({ appSettings: next });
      return next;
    },
    []
  );

  const handleToggleIncludePrayerAnchors = useCallback(() => {
    updateAppSettings({ includePrayerAnchors: !appSettingsRef.current.includePrayerAnchors });
  }, [updateAppSettings]);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );
  const firedReminderKeysRef = useRef<Set<string>>(new Set());
  const acknowledgedBlockIdsRef = useRef<Set<string>>(new Set());

  const [memories, setMemories] = useState<MemoryItem[]>(loadSavedMemories);
  const seededDefaultMemoriesRef = useRef(false);
  const [pendingAssistantPrompt, setPendingAssistantPrompt] = useState<string | null>(null);
  const [autoStartVoice, setAutoStartVoice] = useState(false);
  const shortcutHandledRef = useRef(false);

  const [streaks, setStreaks] = useState<DualStreaks>({
    dailyCommitmentDays: 0,
    dailyCommitmentDoneToday: false,
    waterTargetDays: 0,
    waterTargetDoneToday: false,
  });

  const [pomodoro, setPomodoro] = useState<PomodoroState>({
    phase: 'focus',
    presetMinutes: 25,
    remainingSeconds: 25 * 60,
    totalSeconds: 25 * 60,
    isRunning: false,
    completedCycles: 0,
  });

  const [isTravelModalOpen, setIsTravelModalOpen] = useState(false);
  const [isCatchUpModalOpen, setIsCatchUpModalOpen] = useState(false);
  const [isPomodoroModalOpen, setIsPomodoroModalOpen] = useState(false);
  const [isLogoPickerOpen, setIsLogoPickerOpen] = useState(false);
  const [selectedLogoId, setSelectedLogoId] = useState<string>(() => {
    try {
      return window.localStorage.getItem(SELECTED_LOGO_STORAGE_KEY) || DEFAULT_LOGO_ID;
    } catch {
      return DEFAULT_LOGO_ID;
    }
  });
  const [capsulePrefs, setCapsulePrefs] = useState<CapsulePrefs>(loadSavedCapsulePrefs);

  const surfaceThemeRef = useRef(surfaceTheme);
  surfaceThemeRef.current = surfaceTheme;
  const quietModeRef = useRef(quietMode);
  quietModeRef.current = quietMode;
  const adhanOverrideSilentRef = useRef(adhanOverrideSilent);
  adhanOverrideSilentRef.current = adhanOverrideSilent;
  const deviceSettingsRef = useRef(deviceSettings);
  deviceSettingsRef.current = deviceSettings;
  const medicationsRef = useRef(medications);
  medicationsRef.current = medications;
  const creativeActivitiesRef = useRef(creativeActivities);
  creativeActivitiesRef.current = creativeActivities;
  const memoriesRef = useRef(memories);
  memoriesRef.current = memories;
  const selectedLogoIdRef = useRef(selectedLogoId);
  selectedLogoIdRef.current = selectedLogoId;
  const capsulePrefsRef = useRef(capsulePrefs);
  capsulePrefsRef.current = capsulePrefs;
  const completedOverridesRef = useRef(completedOverrides);
  completedOverridesRef.current = completedOverrides;
  const fastingOverrideRef = useRef(fastingOverride);
  fastingOverrideRef.current = fastingOverride;
  const isFridayModeRef = useRef(isFridayMode);
  isFridayModeRef.current = isFridayMode;
  const includeBiweeklyPcCleanupRef = useRef(includeBiweeklyPcCleanup);
  includeBiweeklyPcCleanupRef.current = includeBiweeklyPcCleanup;
  const travelStateRef = useRef(travelState);
  travelStateRef.current = travelState;
  const pomodoroRef = useRef(pomodoro);
  pomodoroRef.current = pomodoro;
  const periodicRitualsRef = useRef(periodicRituals);
  periodicRitualsRef.current = periodicRituals;
  const LAST_FIRESTORE_UPDATED_AT_KEY = 'dayrhythm_firestore_updated_at_v1';
  const lastFirestoreUpdatedAtRef = useRef<number>((() => {
    try {
      const parsed = Number(localStorage.getItem(LAST_FIRESTORE_UPDATED_AT_KEY) || 0);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  })());

  const activeBrandLogo = useMemo(() => getLogoConceptById(selectedLogoId), [selectedLogoId]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) {
      link.href = activeBrandLogo.src;
    }
  }, [activeBrandLogo]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? '' : prev));
    }, 4000);
  }, []);

  const handleUpdatePhoneChargeLimit = useCallback(
    (nextLimit: number) => {
      const clamped = Math.max(60, Math.min(100, Math.round(nextLimit)));
      phoneChargeNotifiedCycleRef.current = false;
      setPhoneChargeAlertDismissed(false);
      updateAppSettings({ phoneChargeLimitPct: clamped });
      setBatteryGuard((prev) => ({
        ...prev,
        bypassChargingLimitPct: prev.bypassChargingLimitPct === null ? null : clamped <= 80 ? 80 : 90,
      }));
      try {
        const savedBypass = localStorage.getItem('dayrhythm_bypass_limit_v1');
        if (savedBypass !== 'off' && savedBypass !== 'null') {
          localStorage.setItem('dayrhythm_bypass_limit_v1', String(clamped));
        }
      } catch {
        // ignore storage errors
      }
      setPhoneBattery((prev) => {
        if (!prev) return prev;
        const updated: PhoneBatteryTelemetry = {
          ...prev,
          chargeLimitPct: clamped,
          updatedAtMs: Date.now(),
        };

        if (firebaseUser?.uid && firebaseUser.emailVerified) {
          void publishPhoneBatteryTelemetry(firebaseUser.uid, updated).catch(() => {});
        }
        return updated;
      });
      showToast(`🔋 تم ضبط حد تنبيه شحن الموبايل على ${clamped}%`);
    },
    [firebaseUser?.uid, firebaseUser?.emailVerified, showToast, updateAppSettings]
  );

  const appendChangelog = useCallback(
    (
      device: SharedChangelogEntry['device'],
      noteAr: string,
      noteEn: string
    ) => {
      const ts = `${getDateIsoInTimeZone(activeTimeZone)} · ${formatNow12hInTimeZone(activeTimeZone, 'ar')}`;
      setChangelog((prev) => [
        {
          id: `cl-${Date.now()}`,
          version: (prev[0]?.version ?? 13) + 1,
          timestampStr: ts,
          device,
          noteAr,
          noteEn,
        },
        ...prev,
      ]);
    },
    [activeTimeZone]
  );

  // Instant AR <-> EN DOM dir + lang switching without reload
  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  // Persist sanitized Gemini chat messages locally only while signed in
  useEffect(() => {
    if (!firebaseUser?.uid && !authUser) return;
    try {
      const safeChats = sanitizePersistedChats(chatMessages, WELCOME_MESSAGE);
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(safeChats.slice(-100)));
    } catch {
      // ignore quota errors
    }
  }, [chatMessages, firebaseUser?.uid, authUser]);

  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== CHAT_STORAGE_KEY || !ev.newValue) return;
      try {
        const parsed = JSON.parse(ev.newValue);
        setChatMessages(sanitizePersistedChats(parsed, WELCOME_MESSAGE));
      } catch {
        // ignore invalid external payload
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Persist preserved silent notifications (during Prayer, Sleep, or Meeting sanctuaries)
  useEffect(() => {
    try {
      localStorage.setItem(
        SILENT_NOTIFS_STORAGE_KEY,
        JSON.stringify(silentNotifications.slice(0, 25))
      );
    } catch {
      // ignore quota errors
    }
  }, [silentNotifications]);

  // High-precision wall-clock sync every 5s + instant visibility/focus resync (zero 30s drift!)
  useEffect(() => {
    // trueNowMs(): network time, so a drifted Windows clock (it was ~15 s fast) can't make the PC
    // ring before the phone.
    const syncClockNow = () => {
      setNowTickMin(getNowMinutesInTimeZone(activeTimeZone, new Date(trueNowMs())));
    };
    syncClockNow();
    // Fire exactly at hh:mm:00 so the PC rings in the same second as the phone's native alarm
    // (the 5s interval alone could be up to 5s late).
    let boundaryTimer = 0;
    const scheduleNextBoundary = () => {
      const msToNextMinute = 60_000 - (trueNowMs() % 60_000) + 25;
      boundaryTimer = window.setTimeout(() => {
        syncClockNow();
        scheduleNextBoundary();
      }, msToNextMinute);
    };
    scheduleNextBoundary();
    const id = window.setInterval(syncClockNow, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncClockNow();
    };
    window.addEventListener('focus', syncClockNow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(boundaryTimer);
      window.clearInterval(id);
      window.removeEventListener('focus', syncClockNow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeTimeZone]);

  const handleClearSilentNotifications = useCallback(() => {
    setSilentNotifications([]);
    showToast('تم مسح الإشعارات الصامتة المحفوظة ✓');
  }, [showToast]);

  const { emitCrossDeviceSync } = useDeviceSync({
    authUser,
    clientIdRef,
    firebaseUser,
    firestoreSynced,
    pushToTasksVaultRef,
    seenSyncOpIdsRef,
    spircClusterRef,
  });

  const handleAcknowledgeAudioAlert = useCallback(() => {
    stopContinuousAlert();
    stopNativeAlerts();
    const hadAlert = Boolean(activeAudioAlert || persistentAlert || alarmRinging);
    const title = activeAudioAlert?.title || persistentAlert?.title || 'التنبيه';
    const alertId = activeAudioAlert?.id || persistentAlert?.id || 'all';
    const dismissedBlockId = persistentAlert?.blockId;

    if (dismissedBlockId) {
      acknowledgedBlockIdsRef.current.add(dismissedBlockId);
      setCompletedOverrides((prev) => ({
        ...prev,
        [dismissedBlockId]: true,
      }));
    }

    setActiveAudioAlert(null);
    setPersistentAlert(null);
    setAlarmRinging(false);
    triggerHapticWaveform('shake_undo');
    emitCrossDeviceSync('alarm_dismiss', 'dismiss', undefined, {
      blockId: dismissedBlockId,
      alertId,
    });

    if (hadAlert) {
      showToast(`✓ تم إيقاف وتأكيد تنبيه «${title}» على أجهزتك`);
    }
  }, [
    activeAudioAlert,
    alarmRinging,
    emitCrossDeviceSync,
    firebaseUser?.isAnonymous,
    firebaseUser?.uid,
    persistentAlert,
    showToast,
    stopNativeAlerts,
  ]);

  // Auto-dismiss non-continuous active audio alert banner after 12 seconds (continuous loops stay until user stops!)
  useEffect(() => {
    if (!activeAudioAlert || activeAudioAlert.isContinuous) return;
    const id = window.setTimeout(() => {
      setActiveAudioAlert(null);
    }, 12_000);
    return () => window.clearTimeout(id);
  }, [activeAudioAlert]);

  // Hardware Shake-to-Acknowledge listener (gForce > 2.5g when a distinct task alert is active)
  useEffect(() => {
    if (!activeAudioAlert || typeof window === 'undefined') return;
    const onMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const gx = (acc.x ?? 0) / 9.81;
      const gy = (acc.y ?? 0) / 9.81;
      const gz = (acc.z ?? 0) / 9.81;
      const gForce = Math.sqrt(gx * gx + gy * gy + gz * gz);
      if (gForce > 2.5) {
        handleAcknowledgeAudioAlert();
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [activeAudioAlert, handleAcknowledgeAudioAlert]);

  const triggerTaskAlert = useCallback(
    (
      title: string,
      category: TaskSoundCategory,
      options?: {
        bypassSanctuary?: boolean;
        privacyEmoji?: string;
        displayTitle?: string;
        sourceLabel?: string;
        medicationId?: string;
        medicationDoseTime24?: string;
        taskId?: string;
        taskListId?: string;
        durationMs?: number;
        description?: string;
        isRemoteSignal?: boolean;
        blockId?: string;
      }
    ) => {
      const meta = TASK_SOUND_META[category];
      const privacyBadge = (options?.privacyEmoji || extractEmojiPair(title, meta.icon)).trim();
      const visibleTitle = (options?.displayTitle || title || meta.labelAr).trim();
      const visibleSource =
        options?.sourceLabel ||
        (category === 'water'
          ? 'ترطيب يومي'
          : category === 'medication'
            ? 'موعد العلاج'
            : 'تقويم ومهام اليوم');
      // 1 minute active card window: if unacknowledged after 60s, card auto-snoozes for 5 minutes and re-rings in a loop.
      const durationMs = Math.min(options?.durationMs ?? 60_000, 60_000);
      const visibleDescription = cleanCalendarText(options?.description || '').slice(0, 220);
      const repeatCount: SoundRepeatSetting =
        (lifeProfile.soundRepeats ?? DEFAULT_SOUND_REPEATS)[category] ??
        DEFAULT_SOUND_REPEATS[category] ??
        1;

      const androidNative = (
        window as Window & {
          DayRhythmNative?: {
            triggerNativeAlarm?: (
              title: string,
              body: string,
              kind: string,
              continuous: boolean,
              snoozeMinutes: number
            ) => void;
          };
        }
      ).DayRhythmNative;
      const isAndroidNative = Boolean(androidNative);

      if (!options?.bypassSanctuary && activeSanctuary.type !== 'none') {
        const isPrayerOrSleep =
          activeSanctuary.type === 'prayer' || activeSanctuary.type === 'sleep';
        const silenceMode: SanctuarySilenceMode = isPrayerOrSleep
          ? lifeProfile.sanctuarySilenceMode ?? 'silent_inbox'
          : 'silent_inbox';

        if (silenceMode === 'hide_all') {
          return;
        }

        const cleanedTitle = cleanCalendarText(visibleTitle);
        const hasReadableChars =
          cleanedTitle.replace(/[\p{Extended_Pictographic}\uFE0F\u200D\s]/gu, '').length > 0;
        const readableTitle = hasReadableChars ? cleanedTitle : meta.labelAr;
        const shortDescription = visibleDescription || visibleSource;

        if (!isPrayerOrSleep && !isAndroidNative) {
          playTaskSignature(category, { sanctuary: activeSanctuary, repeatCount: 1 });
        } else if (silenceMode === 'vibrate_notif' && !isAndroidNative) {
          triggerHapticWaveform('pomodoro');
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate([160, 80, 160]);
            } catch {
              // ignore
            }
          }
        }

        const reasonAr =
          activeSanctuary.type === 'prayer'
            ? 'وقت الصلاة'
            : activeSanctuary.type === 'sleep'
              ? 'وقت النوم'
              : 'وضع الاجتماع';
        const item: SilentNotificationItem = {
          id: `sn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          title: readableTitle,
          description: shortDescription,
          reasonAr,
          time12h: formatNow12hInTimeZone(activeTimeZone, 'ar'),
          soundCategory: category,
          createdAtIso: new Date().toISOString(),
        };
        setSilentNotifications((prev) => [item, ...prev].slice(0, 25));

        if (silenceMode === 'silent_notif' || silenceMode === 'vibrate_notif') {
          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            try {
              new Notification(readableTitle, {
                body: shortDescription ? `${shortDescription} · ${reasonAr}` : reasonAr,
                silent: true,
              });
            } catch {
              // ignore notification error
            }
          }
          showToast(
            `${silenceMode === 'vibrate_notif' ? '📳' : '🔕'} ${readableTitle}${
              shortDescription ? ` — ${shortDescription}` : ''
            }`
          );
          return;
        }

        showToast(
          `🔕 ${readableTitle}${shortDescription ? ` — ${shortDescription}` : ''}`
        );
        return;
      }

      // If running inside Android Native APK, ALL audio is routed strictly to the native
      // Android Alarm Stream (STREAM_ALARM / AudioAttributes.USAGE_ALARM) via triggerNativeAlarm.
      // Web Audio (AudioContext) in Chromium WebView outputs strictly to STREAM_MUSIC (Media volume),
      // which creates dual-channel playback and gets muted when the user silences Media volume.
      const isContinuous = repeatCount === 'continuous';
      const alertId = `alert_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      let playRes = { playedAudio: false, vibrated: false, isContinuous };
      if (!isAndroidNative) {
        playRes = playTaskSignature(category, {
          bypassSanctuary: true,
          repeatCount,
          alertId,
        });
      }
      const nowTime12 = formatNow12hInTimeZone(activeTimeZone, 'ar');
      const defaultSnooze =
        lifeProfile.defaultSnoozeMinutes === 10 || lifeProfile.defaultSnoozeMinutes === 15
          ? lifeProfile.defaultSnoozeMinutes
          : 5;
      const wv = (
        window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } }
      ).chrome?.webview;
      const isNativeWin = Boolean(wv?.postMessage);

      setActiveAudioAlert({
        id: alertId,
        title: privacyBadge,
        category,
        isContinuous: Boolean(playRes.isContinuous || isContinuous),
      });

      // Requirement 3: Register ringing alarm in Firestore active_alarms
      if (firebaseUser?.uid && !firebaseUser.isAnonymous) {
        void registerActiveAlarm(firebaseUser.uid, {
          id: alertId,
          title: visibleTitle,
          body: visibleDescription,
          category,
          originClientId: clientIdRef.current,
          medicationId: options?.medicationId,
          doseTime24: options?.medicationDoseTime24,
          taskId: options?.taskId,
          taskListId: options?.taskListId,
        });
      }

      // Avoid showing TWO duplicate alerts on Windows EXE (native SecondaryMonitorToastForm handles PC alert cleanly!)
      if (!isNativeWin) {
        if (Boolean(androidNative) && document.visibilityState === 'visible') {
          showToast(
            `${privacyBadge} ${visibleTitle}${visibleDescription ? ` — ${visibleDescription}` : ''}`
          );
        } else {
          setPersistentAlert({
            id: alertId,
            emoji: privacyBadge,
            title: visibleTitle,
            description: visibleDescription,
            sourceLabel: visibleSource,
            time12h: nowTime12,
            category,
            createdAtMs: Date.now(),
            durationMs,
            isContinuous: Boolean(playRes.isContinuous || isContinuous),
            isHydration: category === 'water',
            medicationId: options?.medicationId,
            medicationDoseTime24: options?.medicationDoseTime24,
            taskId: options?.taskId,
            taskListId: options?.taskListId,
            blockId: options?.blockId,
          });
        }
      }

      // On Android APK: fire native OS alarm sound strictly on STREAM_ALARM + vibration + heads-up notification so OnePlus 12R rings loudly even if Media volume is muted
      try {
        androidNative?.triggerNativeAlarm?.(
          `${privacyBadge} ${visibleTitle}`,
          visibleDescription
            ? `${visibleDescription}\n${visibleSource} · ${nowTime12}`
            : `${visibleSource} · ${nowTime12}`,
          category,
          Boolean(playRes.isContinuous || isContinuous),
          defaultSnooze
        );
      } catch {
        // ignore Android bridge errors
      }

      // Route alerts to Windows Secondary Monitor (2 screens) or sleek side-edge dock (1 screen) — zero focus-steal!
      try {
        if (wv?.postMessage) {
          wv.postMessage(
            JSON.stringify({
              type: 'native-alert',
              id: alertId,
              emoji: privacyBadge,
              title: visibleTitle,
              description: visibleDescription,
              sourceLabel: visibleSource,
              time12h: nowTime12,
              category,
              isHydration: category === 'water',
              isMedication: category === 'medication',
              medicationId: options?.medicationId || '',
              medicationDoseTime24: options?.medicationDoseTime24 || '',
              isContinuous: playRes.isContinuous,
              cupSizeMl: lifeProfile.cupSizeMl,
              durationSeconds: Math.round(durationMs / 1000),
              snoozeMinutes: defaultSnooze,
            })
          );
        }
      } catch {
        // ignore WebView2 postMessage errors
      }

      // Broadcast real-time alarm trigger across devices (PC <-> Mobile) via Spirc WebSocket + Firestore
      if (!options?.isRemoteSignal) {
        emitCrossDeviceSync('alarm_trigger', options?.bypassSanctuary ? 'test_ring' : 'trigger', undefined, {
          title: visibleTitle,
          body: visibleDescription,
          kind: category,
          privacyEmoji: privacyBadge,
          sourceLabel: visibleSource,
          snoozeMinutes: defaultSnooze,
          alertId,
          blockId: options?.blockId,
          bypassSanctuary: Boolean(options?.bypassSanctuary),
        });
        const effectiveUid =
          firebaseUser?.uid ||
          authUser?.uid ||
          auth.currentUser?.uid ||
          localStorage.getItem(ACTIVE_UID_STORAGE_KEY) ||
          '';
        if (effectiveUid) {
          void broadcastAlertTrigger(effectiveUid, clientIdRef.current, {
            alertId,
            title: visibleTitle,
            body: visibleDescription,
            kind: category,
            snoozeMinutes: defaultSnooze,
            blockId: options?.blockId,
            startedAtMs: Date.now(), // absolute timestamp so receiver syncs to same moment
          });
        }
      }

      if (!isNativeWin) {
        showToast(`${privacyBadge} · ${visibleTitle} · ${nowTime12}`);
      }
    },
    [
      activeSanctuary,
      activeTimeZone,
      emitCrossDeviceSync,
      lifeProfile.cupSizeMl,
      lifeProfile.defaultSnoozeMinutes,
      lifeProfile.sanctuarySilenceMode,
      lifeProfile.soundRepeats,
      showToast,
    ]
  );

  // Interactive Notification & Auto-Snooze: Snooze any alert for N minutes (default from LifeProfile: 5/10/15m)
  const handleSnoozeAlert = useCallback(
    (alertItem: PersistentAlertItem, minutes?: number, options?: { localOnly?: boolean }) => {
      const configuredDefault =
        lifeProfile.defaultSnoozeMinutes === 10 || lifeProfile.defaultSnoozeMinutes === 15
          ? lifeProfile.defaultSnoozeMinutes
          : 5;
      const safeMin = Math.max(1, Math.min(60, Math.round(minutes ?? configuredDefault)));
      stopContinuousAlert();
      stopNativeAlerts();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(0);
        } catch {}
      }
      setActiveAudioAlert(null);
      setPersistentAlert(null);
      setAlarmRinging(false);
      if (!options?.localOnly) {
        emitCrossDeviceSync('alarm_dismiss', 'snooze', undefined, { alertId: alertItem.id });
      }
      const timerId = window.setTimeout(() => {
        snoozeTimersRef.current = snoozeTimersRef.current.filter((id) => id !== timerId);
        triggerTaskAlert(alertItem.emoji || alertItem.title, alertItem.category, {
          privacyEmoji: alertItem.emoji,
          displayTitle: alertItem.title,
          description: alertItem.description,
          sourceLabel: options?.localOnly
            ? `${alertItem.sourceLabel} (إعادة تنبيه بعد ${safeMin} د)`
            : `${alertItem.sourceLabel} (مؤجّل ${safeMin} د)`,
          medicationId: alertItem.medicationId,
          medicationDoseTime24: alertItem.medicationDoseTime24,
          taskId: alertItem.taskId,
          taskListId: alertItem.taskListId,
          blockId: alertItem.blockId,
        });
      }, safeMin * 60_000);
      snoozeTimersRef.current.push(timerId);
      if (!options?.localOnly) {
        triggerHapticWaveform('water_cup');
        showToast(`⏰ تم تأجيل «${alertItem.title}» لمدة ${safeMin} دقيقة وإيقافه على أجهزتك`);
      } else {
        showToast(`⏰ لم يتم الرد خلال دقيقة — سيتم إعادة التنبيه لـ «${alertItem.title}» بعد ${safeMin} دقائق`);
      }
    },
    [emitCrossDeviceSync, lifeProfile.defaultSnoozeMinutes, showToast, stopNativeAlerts, triggerTaskAlert]
  );

  useEffect(() => {
    return () => {
      snoozeTimersRef.current.forEach((id) => window.clearTimeout(id));
      snoozeTimersRef.current = [];
    };
  }, []);

  // Auto-revert countdown for Smart Timed Quiet Modes (background revert timer stays active; 1s UI tick pauses while hidden)
  useEffect(() => {
    if (quietMode === 'normal' || quietRemainingSec <= 0) return;

    const targetRevertMs =
      quietUntilTs && quietUntilTs > Date.now()
        ? quietUntilTs
        : Date.now() + quietRemainingSec * 1000;

    const revertNow = () => {
      const nowMs = Date.now();
      quietModeRef.current = 'normal';
      setQuietMode('normal');
      setQuietUntilTs(null);
      setQuietRemainingSec(0);
      try {
        localStorage.setItem('dayrhythm_quiet_mode_v1', 'normal');
        localStorage.setItem('dayrhythm_quiet_until_ts_v1', 'null');
        localStorage.setItem('dayrhythm_quiet_mode_updated_at_v1', String(nowMs));
      } catch {}
      showToast('🔊 انتهى مؤقت الهدوء — عاد النظام للوضع العادي تلقائياً');
    };

    const revertTimeoutId = window.setTimeout(
      revertNow,
      Math.max(0, targetRevertMs - Date.now())
    );

    let uiIntervalId: number | null = null;
    const syncRemaining = () => {
      const leftSec = Math.max(0, Math.ceil((targetRevertMs - Date.now()) / 1000));
      setQuietRemainingSec(leftSec);
    };
    const startUiTicker = () => {
      if (uiIntervalId !== null) return;
      uiIntervalId = window.setInterval(syncRemaining, 1000);
    };
    const stopUiTicker = () => {
      if (uiIntervalId === null) return;
      window.clearInterval(uiIntervalId);
      uiIntervalId = null;
    };
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'hidden') {
        stopUiTicker();
      } else {
        syncRemaining();
        startUiTicker();
      }
    };

    if (document.visibilityState !== 'hidden') {
      startUiTicker();
    }
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);

    return () => {
      window.clearTimeout(revertTimeoutId);
      stopUiTicker();
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, [quietMode, quietRemainingSec, quietUntilTs, showToast]);

  const handleSetQuietMode = useCallback(
    (mode: QuietModeType, durationMinutes: number) => {
      const nowMs = Date.now();
      const untilTs = mode === 'normal' || durationMinutes <= 0 ? null : nowMs + durationMinutes * 60_000;
      localWriteLockUntilRef.current = nowMs + 5000;
      quietModeRef.current = mode;
      setQuietMode(mode);
      setQuietUntilTs(untilTs);
      try {
        localStorage.setItem('dayrhythm_quiet_mode_v1', mode);
        localStorage.setItem('dayrhythm_quiet_until_ts_v1', untilTs === null ? 'null' : String(untilTs));
        localStorage.setItem('dayrhythm_quiet_mode_updated_at_v1', String(nowMs));
      } catch {}
      if (mode === 'normal') {
        setQuietRemainingSec(0);
        showToast('🔊 تم التبديل للوضع العادي الكامل');
      } else if (durationMinutes <= 0) {
        // No timer: stays on until turned off (the auto-revert only runs while seconds remain).
        setQuietRemainingSec(0);
        showToast(mode === 'vibrate_only' ? '📳 اهتزاز فقط لحد ما تلغيه' : '🔇 ميوت لحد ما تلغيه');
      } else {
        setQuietRemainingSec(durationMinutes * 60);
        showToast(`🔕 تفعيل وضع الهدوء (${mode}) لمدة ${durationMinutes} دقيقة`);
      }
      appendChangelog('Web/PC', `ضبط وضع الهدوء إلى ${mode}`, `Set quiet mode to ${mode}`);

      const quietPatch: Partial<UserSettingsPayload> & {
        quietUntilTs?: number | null;
        quietModeUpdatedAt?: number;
      } = {
        quietMode: mode,
        quietUntilTs: untilTs,
        quietModeUpdatedAt: nowMs,
        adhanOverrideSilent: adhanOverrideSilentRef.current,
      };
      void saveCloudUserSettingsRef.current(quietPatch);
      void pushToTasksVaultRef.current(quietPatch);
    },
    [appendChangelog, showToast]
  );

  const handleCycleQuietMode = useCallback(() => {
    const order: QuietModeType[] = ['normal', 'mute_audio', 'vibrate_only', 'silent_all'];
    const next = order[(order.indexOf(quietMode) + 1) % order.length];
    handleSetQuietMode(next, next === 'normal' ? 0 : 30);
  }, [handleSetQuietMode, quietMode]);

  const handleWorkspaceUnauthorized = useCallback(() => {
    markCalendarTokenExpired();
    setWorkspaceTokenExpired(true);
  }, []);

  const fetchCalendarEvents = useCallback(async (tokenOverride?: string) => {
    let token: string | null = tokenOverride ?? getCalendarAccessToken();
    if (!token) {
      try {
        token = (await getOrRefreshCalendarAccessToken()) || null;
      } catch {
        // ignore
      }
    }
    if (!token) {
      return;
    }
    setLoadingEvents(true);
    // Dev backend (server.ts) only — static APK/EXE/PWA builds skip straight to Google.
    if (hasSameOriginBackend()) try {
      const res = await fetch('/api/calendar/events', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.status === 401 && contentType.includes('application/json')) {
        handleWorkspaceUnauthorized();
        setLoadingEvents(false);
        return;
      }
      if (res.ok && contentType.includes('application/json')) {
        setLoadingEvents(false);
        setWorkspaceTokenExpired(false);
        const data = await res.json();
        const nextCals = Array.isArray(data.calendars) ? data.calendars : undefined;
        const nextEvs = Array.isArray(data.events) ? data.events : undefined;
        if (nextCals) setCalendarList(nextCals);
        if (nextEvs) {
          setCalendarEvents((prev) => {
            const missingNew = prev.filter(
              (e) => !nextEvs.some((fresh: GoogleCalendarEventItem) => fresh.id === e.id) && recentlyCreatedEventIdsRef.current.has(e.id)
            );
            return [...nextEvs, ...missingNew].sort((a, b) => a.start.localeCompare(b.start));
          });
        }
        const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
        if (nextCals || nextEvs) {
          saveOfflineWorkspaceCache(OFFLINE_CAL_PREFIX, activeUid, {
            calendars: nextCals ?? [],
            events: nextEvs ?? [],
          });
        }
        return;
      }
    } catch {
      // Standalone APK/EXE without Express proxy: fall through to direct Google API
    }

    // Direct client-side Google Calendar API v3 (works 100% natively inside standalone EXE & APK)
    try {
      const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (calRes.status === 401) {
        handleWorkspaceUnauthorized();
        return;
      }
      if (!calRes.ok) return;
      setWorkspaceTokenExpired(false);
      const calJson = (await calRes.json()) as { items?: Array<Record<string, unknown>> };
      const rawCals = Array.isArray(calJson.items) ? calJson.items : [];
      const mappedCals: GoogleCalendarInfo[] = rawCals.map((c) => ({
        id: String(c.id || 'primary'),
        summary: String(c.summary || 'التقويم الرئيسي'),
        primary: Boolean(c.primary),
        backgroundColor: typeof c.backgroundColor === 'string' ? c.backgroundColor : undefined,
      }));
      setCalendarList(mappedCals);

      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14).toISOString();
      const targetCals = mappedCals.slice(0, 6);
      const allEvents: GoogleCalendarEventItem[] = [];

      await Promise.all(
        targetCals.map(async (cal) => {
          try {
            const baseUrl =
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events` +
              `?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
            // A full daily routine is ~20 events/day, so 15 days can exceed one page (250): follow pageToken.
            const items: Array<Record<string, unknown>> = [];
            let pageToken = '';
            for (let page = 0; page < 6; page += 1) {
              const evRes = await fetch(
                pageToken ? `${baseUrl}&pageToken=${encodeURIComponent(pageToken)}` : baseUrl,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (!evRes.ok) break;
              const evJson = (await evRes.json()) as {
                items?: Array<Record<string, unknown>>;
                nextPageToken?: string;
              };
              items.push(...(evJson.items || []));
              pageToken = evJson.nextPageToken || '';
              if (!pageToken) break;
            }
            for (const ev of items) {
              const startObj = (ev.start || {}) as { dateTime?: string; date?: string };
              const endObj = (ev.end || {}) as { dateTime?: string; date?: string };
              const startVal = startObj.dateTime || startObj.date || '';
              const endVal = endObj.dateTime || endObj.date || startVal;
              if (!startVal) continue;
              allEvents.push({
                id: String(ev.id || `${cal.id}-${startVal}`),
                calendarId: cal.id,
                calendarTitle: cal.summary,
                calendarColor: cal.backgroundColor,
                summary: String(ev.summary || '(بدون عنوان)'),
                description: typeof ev.description === 'string' ? ev.description : '',
                location: typeof ev.location === 'string' ? ev.location : undefined,
                start: startVal,
                end: endVal,
                isAllDay: Boolean(startObj.date && !startObj.dateTime),
                htmlLink: typeof ev.htmlLink === 'string' ? ev.htmlLink : undefined,
                status: typeof ev.status === 'string' ? ev.status : undefined,
                isRecurring: Boolean(ev.recurringEventId),
                recurringEventId:
                  typeof ev.recurringEventId === 'string' ? ev.recurringEventId : undefined,
              });
            }
          } catch {
            // skip individual calendar error
          }
        })
      );

      allEvents.sort((a, b) => a.start.localeCompare(b.start));
      setCalendarEvents((prev) => {
        const missingNew = prev.filter(
          (e) => !allEvents.some((fresh) => fresh.id === e.id) && recentlyCreatedEventIdsRef.current.has(e.id)
        );
        return [...allEvents, ...missingNew].sort((a, b) => a.start.localeCompare(b.start));
      });
      const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
      saveOfflineWorkspaceCache(OFFLINE_CAL_PREFIX, activeUid, {
        calendars: mappedCals,
        events: allEvents,
      });
    } catch {
      // ignore offline errors
    } finally {
      setLoadingEvents(false);
    }
  }, [handleWorkspaceUnauthorized]);

  const fetchGoogleTasks = useCallback(async (tokenOverride?: string) => {
    let token: string | null = tokenOverride ?? getCalendarAccessToken();
    if (!token) {
      try {
        token = (await getOrRefreshCalendarAccessToken()) || null;
      } catch {
        // ignore
      }
    }
    if (!token) return;
    setLoadingTasks(true);
    // Dev backend (server.ts) only — static APK/EXE/PWA builds skip straight to Google.
    if (hasSameOriginBackend()) try {
      const res = await fetch('/api/tasks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.status === 401 && contentType.includes('application/json')) {
        handleWorkspaceUnauthorized();
        setLoadingTasks(false);
        return;
      }
      if (res.ok && contentType.includes('application/json')) {
        setLoadingTasks(false);
        setWorkspaceTokenExpired(false);
        const data = await res.json();
        const nextLists = Array.isArray(data.taskLists)
          ? data.taskLists.filter((l: { title?: string }) => l.title !== VAULT_LIST_TITLE)
          : undefined;
        const nextTasks = Array.isArray(data.tasks)
          ? data.tasks.filter(
              (t: { title?: string; taskListTitle?: string }) =>
                t.title !== SYNC_TASK_TITLE && t.taskListTitle !== VAULT_LIST_TITLE
            )
          : undefined;
        if (nextLists) setGoogleTaskLists(nextLists);
        if (nextTasks) {
          setGoogleTasks((prev) => {
            const missingNew = prev.filter(
              (t) => !nextTasks.some((fresh: GoogleTaskItem) => fresh.id === t.id) && recentlyCreatedTaskIdsRef.current.has(t.id)
            );
            return [...nextTasks, ...missingNew];
          });
        }
        const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
        if (nextLists || nextTasks) {
          saveOfflineWorkspaceCache(OFFLINE_TASKS_PREFIX, activeUid, {
            taskLists: nextLists ?? [],
            tasks: nextTasks ?? [],
          });
        }
        return;
      }
    } catch {
      // Standalone APK/EXE fallback below
    }

    // Direct client-side Google Tasks API v1
    try {
      const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (listsRes.status === 401) {
        handleWorkspaceUnauthorized();
        return;
      }
      if (!listsRes.ok) return;
      setWorkspaceTokenExpired(false);
      const listsJson = (await listsRes.json()) as { items?: Array<Record<string, unknown>> };
      const mappedLists: GoogleTaskList[] = (listsJson.items || [])
        .filter((l) => String(l.title || '') !== VAULT_LIST_TITLE)
        .map((l) => ({
          id: String(l.id || '@default'),
          title: String(l.title || 'مهامي'),
        }));
      setGoogleTaskLists(mappedLists);

      const allTasks: GoogleTaskItem[] = [];
      await Promise.all(
        mappedLists.slice(0, 6).map(async (list) => {
          try {
            const tRes = await fetch(
              `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=true&showHidden=false&maxResults=100`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!tRes.ok) return;
            const tJson = (await tRes.json()) as { items?: Array<Record<string, unknown>> };
            for (const item of tJson.items || []) {
              const itemTitle = String(item.title || '');
              if (itemTitle === SYNC_TASK_TITLE || list.title === VAULT_LIST_TITLE) {
                continue;
              }
              allTasks.push({
                id: String(item.id || ''),
                taskListId: list.id,
                taskListTitle: list.title,
                title: String(item.title || '(مهمة بدون عنوان)'),
                notes: typeof item.notes === 'string' ? item.notes : undefined,
                status: item.status === 'completed' ? 'completed' : 'needsAction',
                due: typeof item.due === 'string' ? item.due : undefined,
                completed: typeof item.completed === 'string' ? item.completed : undefined,
                updated: typeof item.updated === 'string' ? item.updated : undefined,
              });
            }
          } catch {
            // skip individual list error
          }
        })
      );
      setGoogleTasks((prev) => {
        const missingNew = prev.filter(
          (t) => !allTasks.some((fresh) => fresh.id === t.id) && recentlyCreatedTaskIdsRef.current.has(t.id)
        );
        return [...allTasks, ...missingNew];
      });
      const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
      saveOfflineWorkspaceCache(OFFLINE_TASKS_PREFIX, activeUid, {
        taskLists: mappedLists,
        tasks: allTasks,
      });
    } catch {
      // ignore offline errors
    } finally {
      setLoadingTasks(false);
    }
  }, [handleWorkspaceUnauthorized]);

  const lastGmailAutoScanMsRef = useRef<number>(0);
  const gmailNeedsReauthRef = useRef<boolean>(false);
  const gmailRetryAttemptRef = useRef<number>(0);
  const gmailRetryTimerRef = useRef<number | null>(null);
  const gmailCountdownTimerRef = useRef<number | null>(null);
  const [gmailLastSyncedIso, setGmailLastSyncedIso] = useState<string>('');
  const [gmailNextRetryInSec, setGmailNextRetryInSec] = useState<number>(0);
  const syncedChatTextByIdRef = useRef<Map<string, string>>(new Map());
  // Message ids that definitely exist in the cloud (seen in a snapshot or written OK) — lets a
  // write skip its read-before-write. Never cleared on a failed write.
  const cloudChatIdsRef = useRef<Set<string>>(new Set());
  const hasHydratedCloudChatRef = useRef<boolean>(false);

  useEffect(() => {
    gmailNeedsReauthRef.current = gmailNeedsReauth;
  }, [gmailNeedsReauth]);

  const clearGmailRetryTimers = useCallback(() => {
    if (gmailRetryTimerRef.current !== null) {
      window.clearTimeout(gmailRetryTimerRef.current);
      gmailRetryTimerRef.current = null;
    }
    if (gmailCountdownTimerRef.current !== null) {
      window.clearInterval(gmailCountdownTimerRef.current);
      gmailCountdownTimerRef.current = null;
    }
    setGmailNextRetryInSec(0);
  }, []);

  const fetchGmailDigestDirectClient = useCallback(
    async (
      token: string,
      signal: AbortSignal
    ): Promise<{
      ok: boolean;
      status: number;
      needsReauth?: boolean;
      error?: string;
      scannedCount: number;
      digestItems: GmailDigestItem[];
    }> => {
      const listUrl =
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=12&q=' +
        encodeURIComponent('in:inbox newer_than:7d -category:promotions -category:social');
      const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (listRes.status === 401 || listRes.status === 403) {
        return {
          ok: false,
          status: listRes.status,
          needsReauth: true,
          error: 'انتهت جلسة صلاحية Gmail — اضغط «تجديد ربط Google الآن» في الأعلى.',
          scannedCount: 0,
          digestItems: [],
        };
      }
      if (!listRes.ok) {
        return {
          ok: false,
          status: listRes.status,
          error: 'تعذر الوصول إلى صندوق Gmail حالياً.',
          scannedCount: 0,
          digestItems: [],
        };
      }
      const listJson = (await listRes.json()) as { messages?: Array<{ id: string }> };
      const msgRefs = Array.isArray(listJson.messages) ? listJson.messages.slice(0, 10) : [];
      if (msgRefs.length === 0) {
        return { ok: true, status: 200, scannedCount: 0, digestItems: [] };
      }

      const noisePattern =
        /verification code|otp|security alert|password reset|unsubscribe|newsletter|promo|receipt|invoice paid|كود التحقق|رمز التحقق|نشرة|إعلان|عروض/i;
      const categoryRules: Array<{
        category: GmailDigestItem['category'];
        pattern: RegExp;
        duration: number;
        emoji: string;
      }> = [
        {
          category: 'meeting',
          pattern: /meeting|zoom|teams|google meet|interview|call|invite|اجتماع|مقابلة|دعوة/i,
          duration: 45,
          emoji: '📅',
        },
        {
          category: 'travel',
          pattern: /flight|boarding|ticket|hotel|booking|check-in|رحلة|طيران|حجز|فندق/i,
          duration: 90,
          emoji: '✈️',
        },
        {
          category: 'medical',
          pattern: /doctor|clinic|hospital|lab|medical|appointment|دكتور|عيادة|مستشفى|تحاليل|كشف/i,
          duration: 60,
          emoji: '🏥',
        },
        {
          category: 'deadline',
          pattern: /deadline|due|submit|renewal|expire|exam|bill due|موعد نهائي|تسليم|تجديد|استحقاق|فاتورة/i,
          duration: 30,
          emoji: '⏳',
        },
        {
          category: 'delivery',
          pattern: /delivery|shipment|courier|order arriving|out for delivery|شحنة|توصيل|مندوب|طلبك/i,
          duration: 20,
          emoji: '📦',
        },
      ];

      const detailResults = await Promise.all(
        msgRefs.map(async (ref) => {
          try {
            const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
              ref.id
            )}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;
            const res = await fetch(detailUrl, {
              headers: { Authorization: `Bearer ${token}` },
              signal,
            });
            if (!res.ok) return null;
            return (await res.json()) as {
              id: string;
              snippet?: string;
              payload?: { headers?: Array<{ name?: string; value?: string }> };
            };
          } catch {
            return null;
          }
        })
      );

      const fallbackDateIso = getDateIsoInTimeZone(activeTimeZone);
      const digestItems: GmailDigestItem[] = [];

      for (const msg of detailResults) {
        if (!msg) continue;
        const headers = msg.payload?.headers ?? [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value?.trim() || '';
        const subject = getHeader('Subject') || 'رسالة بريد مهمة';
        const fromRaw = getHeader('From');
        const sender = fromRaw.replace(/<[^>]+>/g, '').replace(/"/g, '').trim() || 'Gmail';
        const snippet = (msg.snippet || '').replace(/\s+/g, ' ').trim();
        const combined = `${subject} ${snippet}`;

        if (noisePattern.test(combined)) continue;

        const matchedRule = categoryRules.find((r) => r.pattern.test(combined));
        if (!matchedRule) continue;

        const isoMatch = combined.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
        const timeMatch = combined.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
        const dateIso = isoMatch ? isoMatch[1] : fallbackDateIso;
        const startTime24 = timeMatch
          ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
          : '10:00';

        digestItems.push({
          id: `gm_${msg.id}`,
          messageId: msg.id,
          category: matchedRule.category,
          titleAr: subject.slice(0, 90),
          sender: sender.slice(0, 50),
          summaryAr: (snippet || subject).slice(0, 140),
          dateIso,
          startTime24,
          durationMinutes: matchedRule.duration,
          suggestedAction: {
            operation: 'create',
            title: `${matchedRule.emoji} ${subject.slice(0, 70)}`,
            dateIso,
            startTime24,
            durationMinutes: matchedRule.duration,
            description: `من: ${sender}\n${snippet.slice(0, 200)}`,
          },
        });
      }

      return {
        ok: true,
        status: 200,
        scannedCount: msgRefs.length,
        digestItems: digestItems.slice(0, 6),
      };
    },
    [activeTimeZone]
  );

  const fetchGmailDigest = useCallback(
    async (tokenOverride?: string, options?: { silent?: boolean }) => {
      const token = tokenOverride ?? getCalendarAccessToken();
      if (!token) {
        clearGmailRetryTimers();
        setGmailNeedsReauth(true);
        return;
      }
      clearGmailRetryTimers();
      setLoadingGmail(true);
      if (!options?.silent) {
        setGmailError('');
      }
      setGmailNeedsReauth(false);
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 18_000);

      const scheduleSmartGmailRetry = (errMsg: string) => {
        const backoffStepsSec = [15, 30, 60, 120, 300];
        const attempt = gmailRetryAttemptRef.current;
        if (attempt >= backoffStepsSec.length) {
          setGmailError(errMsg);
          return;
        }
        const delaySec = backoffStepsSec[attempt];
        gmailRetryAttemptRef.current = attempt + 1;
        setGmailError(errMsg);
        setGmailNextRetryInSec(delaySec);

        gmailCountdownTimerRef.current = window.setInterval(() => {
          setGmailNextRetryInSec((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);

        gmailRetryTimerRef.current = window.setTimeout(() => {
          clearGmailRetryTimers();
          if (navigator.onLine !== false && !gmailNeedsReauthRef.current) {
            void fetchGmailDigest(undefined, { silent: true });
          }
        }, delaySec * 1000);
      };

      const applyGmailSuccess = (scannedCount: number, digestItems: GmailDigestItem[]) => {
        gmailRetryAttemptRef.current = 0;
        lastGmailAutoScanMsRef.current = Date.now();
        const syncedIso = new Date().toISOString();
        setGmailError('');
        setGmailLastSyncedIso(syncedIso);
        setGmailScannedCount(scannedCount);
        setGmailDigest(digestItems);
        const activeUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
        saveOfflineWorkspaceCache(OFFLINE_GMAIL_PREFIX, activeUid, {
          digestItems,
          scannedCount,
          syncedIso,
        });
      };

      try {
        type GmailProxyReply = {
          needsReauth?: boolean;
          error?: string;
          scannedCount?: number;
          digestItems?: GmailDigestItem[];
        };
        let proxied: { ok: boolean; status: number; data: GmailProxyReply } | null = null;
        if (hasSameOriginBackend()) {
          try {
            proxied = await apiFetchJson<GmailProxyReply>('/api/gmail/digest', {
              headers: { Authorization: `Bearer ${token}` },
              signal: controller.signal,
            });
          } catch (proxyErr: unknown) {
            if (!(proxyErr instanceof BackendUnavailableError)) throw proxyErr;
          }
        }

        // No backend (Android APK / Windows EXE / hosted PWA): read Gmail directly via Google REST API v1
        if (!proxied) {
          const direct = await fetchGmailDigestDirectClient(token, controller.signal);
          if (direct.needsReauth || direct.status === 401 || direct.status === 403) {
            clearGmailRetryTimers();
            gmailRetryAttemptRef.current = 0;
            setGmailNeedsReauth(true);
            if (direct.status === 401) handleWorkspaceUnauthorized();
            setGmailError(
              direct.error || 'انتهت جلسة مزامنة Google — اضغط «تجديد ربط Google الآن» في الأعلى.'
            );
            return;
          }
          if (!direct.ok) {
            scheduleSmartGmailRetry(direct.error || 'تعذر قراءة ملخص Gmail حالياً.');
            return;
          }
          applyGmailSuccess(direct.scannedCount, direct.digestItems);
          return;
        }

        const { ok, status, data } = proxied;
        if (status === 401 || status === 403 || data.needsReauth) {
          clearGmailRetryTimers();
          gmailRetryAttemptRef.current = 0;
          setGmailNeedsReauth(true);
          if (status === 401) {
            handleWorkspaceUnauthorized();
          }
          setGmailError(
            data.error || 'انتهت جلسة مزامنة Google — اضغط «تجديد ربط Google الآن» في الأعلى.'
          );
          return;
        }
        if (!ok) {
          // Automatic direct client-side fallback if backend proxy is temporarily unavailable
          const direct = await fetchGmailDigestDirectClient(token, controller.signal);
          if (direct.ok) {
            applyGmailSuccess(direct.scannedCount, direct.digestItems);
            return;
          }
          scheduleSmartGmailRetry(direct.error || data.error || 'تعذر قراءة ملخص Gmail حالياً.');
          return;
        }
        applyGmailSuccess(
          Number(data.scannedCount ?? 0),
          Array.isArray(data.digestItems) ? data.digestItems : []
        );
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          scheduleSmartGmailRetry(
            'استغرق فحص Gmail وقتاً أطول من المعتاد — جاري إعادة المحاولة تلقائياً.'
          );
        } else {
          scheduleSmartGmailRetry(
            err instanceof Error
              ? err.message
              : 'انقطع الاتصال بخدمة Gmail — جاري إعادة الاتصال تلقائياً.'
          );
        }
      } finally {
        window.clearTimeout(timer);
        setLoadingGmail(false);
      }
    },
    [clearGmailRetryTimers, fetchGmailDigestDirectClient, handleWorkspaceUnauthorized]
  );

  useEffect(() => {
    return () => clearGmailRetryTimers();
  }, [clearGmailRetryTimers]);

  const refreshWorkspace = useCallback(
    async (tokenOverride?: string, options?: { forceGmail?: boolean }) => {
      const effectiveToken = tokenOverride ?? getCalendarAccessToken();
      if (!effectiveToken) {
        if (authUser && !needsAuth) {
          setWorkspaceTokenExpired(true);
        }
        return;
      }
      const tasks: Promise<unknown>[] = [
        fetchCalendarEvents(effectiveToken),
        fetchGoogleTasks(effectiveToken),
      ];
      const shouldAutoScanGmail =
        Boolean(options?.forceGmail) ||
        (!gmailNeedsReauthRef.current && Date.now() - lastGmailAutoScanMsRef.current >= 5 * 60_000);
      if (shouldAutoScanGmail) {
        lastGmailAutoScanMsRef.current = Date.now();
        tasks.push(fetchGmailDigest(effectiveToken, { silent: !options?.forceGmail }));
      }
      await Promise.all(tasks);
    },
    [authUser, needsAuth, fetchCalendarEvents, fetchGoogleTasks, fetchGmailDigest]
  );

  const handleRefreshWorkspaceToken = useCallback(async () => {
    setIsRefreshingWorkspaceToken(true);
    try {
      const res = await refreshGoogleCalendarToken();
      if (res) {
        setAuthUser(res.user);
        setNeedsAuth(false);
        setWorkspaceTokenExpired(false);
        setGmailNeedsReauth(false);
        setGmailError('');
        await refreshWorkspace(res.accessToken, { forceGmail: true });
        showToast('🔄 تم تجديد ربط Google Workspace بنجاح ومزامنة التقويم والمهام ✓');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تجديد رمز Google Workspace الآن.';
      showToast(msg);
    } finally {
      setIsRefreshingWorkspaceToken(false);
    }
  }, [refreshWorkspace, showToast]);

  // Give the Android service what it needs to send/receive "alarm dismissed" by itself when the
  // app's WebView isn't running (phone ↔ PC: stopping on one stops the other).
  useEffect(() => {
    const effectiveUid =
      firebaseUser?.uid ||
      authUser?.uid ||
      auth.currentUser?.uid ||
      localStorage.getItem(ACTIVE_UID_STORAGE_KEY) ||
      '';
    try {
      const wv = (
        window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } }
      ).chrome?.webview;
      wv?.postMessage?.(JSON.stringify({ type: 'sync-uid', uid: effectiveUid }));
    } catch {
      // ignore WebView2 postMessage errors
    }

    const native = (window as Window & { DayRhythmNative?: { setCloudAuth?: (json: string) => void } })
      .DayRhythmNative;
    if (!native?.setCloudAuth) return;
    if (!effectiveUid) return;

    const pushNativeAuthSnapshot = async () => {
      let idToken: string | undefined;
      try {
        idToken = await auth.currentUser?.getIdToken();
      } catch {
        // ignore token error
      }
      const rawPayload = getNativeCloudAuthPayload();
      let payloadObj: Record<string, unknown> = {};
      if (rawPayload) {
        try {
          payloadObj = JSON.parse(rawPayload);
        } catch {}
      } else {
        payloadObj = {
          apiKey: firebaseConfig.apiKey,
          projectId: firebaseConfig.projectId,
          databaseId: (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId || 'ai-studio-dayrhythm-1f2dd321-5d9e-4566-bb4c-87a3962fa6f7',
          uid: effectiveUid,
        };
      }
      if (idToken) payloadObj.idToken = idToken;
      try {
        native?.setCloudAuth?.(JSON.stringify(payloadObj));
      } catch {
        // older APK without this bridge method
      }
    };

    void pushNativeAuthSnapshot();
    const unsubToken = auth.onIdTokenChanged(() => {
      void pushNativeAuthSnapshot();
    });
    return () => unsubToken();
  }, [firebaseUser?.uid, authUser?.uid]);

  // Keep the Android service's charge-limit alert in sync with the app setting.
  useEffect(() => {
    try {
      (window as Window & { DayRhythmNative?: { setChargeLimit?: (l: number, e: boolean) => void } })
        .DayRhythmNative?.setChargeLimit?.(phoneChargeLimitPct, smartChargeAlertEnabled);
    } catch {
      // older APK without this bridge method
    }
  }, [phoneChargeLimitPct, smartChargeAlertEnabled]);

  // The phone itself doesn't show its charge % (that's for following it from the PC);
  // it still gets the charge-limit alert.
  const isPhoneClient = useMemo(() => detectIsMobileDeviceClient(), []);

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
  }, [updateAppSettings]);

  // Daily cloud quota spent: hold saves (local stays the truth, badge stays steady instead of
  // flipping every second), then retry automatically when the pause ends.
  useEffect(() => {
    const onQuota = (ev: Event) => {
      const until = (ev as CustomEvent<{ until?: number }>).detail?.until ?? 0;
      setCloudPausedUntil(until);
      setFirestoreSynced(false);
    };
    window.addEventListener('dayrhythm:cloud-quota', onQuota);
    return () => window.removeEventListener('dayrhythm:cloud-quota', onQuota);
  }, []);
  useEffect(() => {
    if (cloudPausedUntil <= Date.now()) return;
    const id = window.setTimeout(() => setCloudPausedUntil(0), cloudPausedUntil - Date.now() + 500);
    return () => window.clearTimeout(id);
  }, [cloudPausedUntil]);

  // Synchronize appSettings with server whenever any setting changes
  useEffect(() => {
    if (isLoadingSettingsRef.current || !hasHydratedRemoteRef.current) {
      return;
    }
    const json = JSON.stringify(appSettingsRef.current);
    if (json === lastServerAppSettingsRef.current) return;
    lastServerAppSettingsRef.current = json;
    void pushToTasksVaultRef.current({ appSettings: appSettingsRef.current });
  }, [
    phoneChargeLimitPct,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    waterRemindersEnabled,
    sunMode,
    includePrayerAnchors,
  ]);

  // Reactive cross-device sync for Creative Activities & Hobbies
  const lastSyncedCreativeSigRef = useRef<string>('');
  useEffect(() => {
    if (!hasHydratedRemoteRef.current) return;
    const sig = JSON.stringify(creativeActivities);
    if (sig === lastSyncedCreativeSigRef.current) return;
    lastSyncedCreativeSigRef.current = sig;
    void pushToTasksVaultRef.current({ creativeActivities });
  }, [creativeActivities]);

  // Reactive cross-device sync for Gemini Long-term Memories
  const lastSyncedMemoriesSigRef = useRef<string>('');
  useEffect(() => {
    if (!hasHydratedRemoteRef.current) return;
    const sig = JSON.stringify(memories);
    if (sig === lastSyncedMemoriesSigRef.current) return;
    lastSyncedMemoriesSigRef.current = sig;
    void pushToTasksVaultRef.current({ memories });
  }, [memories]);

  // Reactive cross-device sync for Daily Streaks & Commitments
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
  }, [streaks]);

  // Reactive cross-device sync for Quiet Mode & Adhan Silent Override
  const lastSyncedQuietSigRef = useRef<string>('');
  useEffect(() => {
    if (!hasHydratedRemoteRef.current) return;
    const sig = `${quietMode}:${adhanOverrideSilent}`;
    if (sig === lastSyncedQuietSigRef.current) return;
    lastSyncedQuietSigRef.current = sig;
    const quietMeta = {
      quietMode,
      quietUntilTs,
      quietModeUpdatedAt: (() => {
        try {
          return Number(localStorage.getItem('dayrhythm_quiet_mode_updated_at_v1') || 0) || Date.now();
        } catch {
          return Date.now();
        }
      })(),
      adhanOverrideSilent,
    };
    void pushToTasksVaultRef.current(quietMeta);
  }, [quietMode, quietUntilTs, adhanOverrideSilent]);

  // ── Permanent Google link ────────────────────────────────────────────────────────────
  const [permanentLinkActive, setPermanentLinkActive] = useState<boolean>(() => hasPermanentLink());
  const [isStartingPermanentLink, setIsStartingPermanentLink] = useState(false);
  const [permanentLinkHintDismissed, setPermanentLinkHintDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dayrhythm_permanent_link_hint_dismissed_v1') === '1';
    } catch {
      return false;
    }
  });

  const hydrateGoogleDriveOnce = useCallback(
    async (customToken?: string): Promise<boolean> => {
      let token = customToken || (await getOrRefreshCalendarAccessToken());
      if (!token) {
        hasHydratedGoogleDriveRef.current = true;
        return false;
      }

      setIsSyncingGoogleDrive(true);
      try {
        const backup = await loadFromGoogleDriveAppData(token);
        if (backup) {
          const migratedBackup = migrateAppState(backup);
          const remoteUpdatedAt = typeof backup.updatedAtMs === 'number' ? backup.updatedAtMs : 0;
          let latestFirestoreUpdatedAt = lastFirestoreUpdatedAtRef.current;
          try {
            const storedFsTs = Number(localStorage.getItem(LAST_FIRESTORE_UPDATED_AT_KEY) || 0);
            if (Number.isFinite(storedFsTs) && storedFsTs > latestFirestoreUpdatedAt) {
              latestFirestoreUpdatedAt = storedFsTs;
            }
          } catch {
            // ignore
          }
          if (latestFirestoreUpdatedAt > 0 && remoteUpdatedAt <= latestFirestoreUpdatedAt) {
            setGoogleDriveSynced(true);
            hasHydratedGoogleDriveRef.current = true;
            return true;
          }
          if (backup.lifeProfile && Date.now() >= localWriteLockUntilRef.current) {
            let localProfileUpdatedAt = 0;
            try {
              localProfileUpdatedAt = Number(
                localStorage.getItem('dayrhythm_life_profile_updated_at_v1') || 0
              );
            } catch {
              localProfileUpdatedAt = 0;
            }
            if (remoteUpdatedAt > localProfileUpdatedAt || localProfileUpdatedAt === 0) {
              const cleanProfile = sanitizeLifeProfile(migratedBackup.lifeProfile);
              lifeProfileRef.current = cleanProfile;
              setLifeProfile(cleanProfile);
              try {
                const raw = localStorage.getItem(STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : {};
                localStorage.setItem(
                  STORAGE_KEY,
                  JSON.stringify({ ...parsed, schemaVersion: SCHEMA_VERSION, lifeProfile: cleanProfile })
                );
                localStorage.setItem('dayrhythm_life_profile_updated_at_v1', String(remoteUpdatedAt || Date.now()));
              } catch {
                // ignore storage errors
              }
            }
          }
          if (Array.isArray(backup.medications)) {
            const bAny = backup as FullDayRhythmCloudBackup & {
              medicationsUpdatedAt?: number;
              deletedMedicationIds?: string[];
            };
            const remoteMedsUpdatedAt =
              typeof bAny.medicationsUpdatedAt === 'number'
                ? bAny.medicationsUpdatedAt
                : remoteUpdatedAt;
            const localMedsUpdatedAt = loadMedicationsUpdatedAt();
            const mergedDeleted = Array.from(
              new Set([
                ...loadDeletedMedicationIds(),
                ...(Array.isArray(bAny.deletedMedicationIds) ? bAny.deletedMedicationIds : []),
              ])
            ).slice(-100);
            try {
              localStorage.setItem(MEDS_DELETED_IDS_STORAGE_KEY, JSON.stringify(mergedDeleted));
            } catch {
              // ignore storage errors
            }
            const deletedSet = new Set(mergedDeleted);
            if (remoteMedsUpdatedAt >= localMedsUpdatedAt) {
              const cleanMeds = backup.medications
                .map((m) => sanitizeMedicationItem(m))
                .filter((m) => !deletedSet.has(m.id));
              medicationsRef.current = cleanMeds;
              setMedications(cleanMeds);
              try {
                localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(cleanMeds));
                localStorage.setItem(
                  MEDS_UPDATED_AT_STORAGE_KEY,
                  String(remoteMedsUpdatedAt || Date.now())
                );
              } catch {
                // ignore storage errors
              }
            } else if (mergedDeleted.length > 0) {
              setMedications((prev) => prev.filter((m) => !deletedSet.has(m.id)));
            }
          }
          if (Array.isArray(backup.hydrationHistory) && backup.hydrationHistory.length === 7) {
            setHydrationHistory(backup.hydrationHistory);
            try {
              const raw = localStorage.getItem(STORAGE_KEY);
              const parsed = raw ? JSON.parse(raw) : {};
              localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, hydrationHistory: backup.hydrationHistory }));
            } catch {
              // ignore storage errors
            }
          }
          if (Array.isArray(backup.creativeActivities)) {
            const cleanCreative = backup.creativeActivities.map((a) => sanitizeCreativeActivityItem(a));
            setCreativeActivities(cleanCreative);
            try {
              localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(cleanCreative));
            } catch {
              // ignore storage errors
            }
          }
          if (Array.isArray(backup.memories)) {
            const cleanMemories = backup.memories.map((m) => sanitizeMemoryItem(m));
            setMemories(cleanMemories);
            try {
              localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(cleanMemories));
            } catch {
              // ignore storage errors
            }
          }
          if (backup.deviceSettings) {
            const cleanDev = sanitizeDeviceSettings(backup.deviceSettings);
            if (Date.now() >= localWriteLockUntilRef.current) {
              setDeviceSettings(cleanDev);
              try {
                const raw = localStorage.getItem(STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : {};
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, deviceSettings: cleanDev }));
              } catch {
                // ignore storage errors
              }
            }
          }
          if (backup.capsulePrefs) {
            setCapsulePrefs(backup.capsulePrefs);
            try {
              window.localStorage.setItem(CAPSULE_PREFS_STORAGE_KEY, JSON.stringify(backup.capsulePrefs));
            } catch {
              // ignore storage errors
            }
          }
          if (backup.selectedLogoId) {
            setSelectedLogoId(backup.selectedLogoId);
            try {
              window.localStorage.setItem(SELECTED_LOGO_STORAGE_KEY, backup.selectedLogoId);
            } catch {
              // ignore storage errors
            }
          }
          if (backup.quietMode && Date.now() >= localWriteLockUntilRef.current) {
            let localQuietUpdatedAt = 0;
            try {
              localQuietUpdatedAt = Number(
                localStorage.getItem('dayrhythm_quiet_mode_updated_at_v1') || 0
              );
            } catch {
              localQuietUpdatedAt = 0;
            }
            const backupQuietMeta = backup as FullDayRhythmCloudBackup & {
              quietUntilTs?: number | null;
              quietModeUpdatedAt?: number;
            };
            const backupQuietUpdatedAt = backupQuietMeta.quietModeUpdatedAt ?? remoteUpdatedAt;
            if (backupQuietUpdatedAt > localQuietUpdatedAt || localQuietUpdatedAt === 0) {
              const nextUntil =
                backup.quietMode === 'normal'
                  ? null
                  : typeof backupQuietMeta.quietUntilTs === 'number' && backupQuietMeta.quietUntilTs > 0
                    ? backupQuietMeta.quietUntilTs
                    : null;
              quietModeRef.current = backup.quietMode;
              setQuietMode(backup.quietMode);
              setQuietUntilTs(nextUntil);
              setQuietRemainingSec(
                backup.quietMode !== 'normal' && nextUntil !== null && nextUntil > Date.now()
                  ? Math.max(1, Math.ceil((nextUntil - Date.now()) / 1000))
                  : 0
              );
              try {
                localStorage.setItem('dayrhythm_quiet_mode_v1', backup.quietMode);
                localStorage.setItem('dayrhythm_quiet_until_ts_v1', nextUntil === null ? 'null' : String(nextUntil));
                localStorage.setItem('dayrhythm_quiet_mode_updated_at_v1', String(backupQuietUpdatedAt || Date.now()));
              } catch {
                // ignore storage errors
              }
            }
          }
          if (typeof backup.adhanOverrideSilent === 'boolean') setAdhanOverrideSilent(backup.adhanOverrideSilent);
          const backupWithSanctuary = backup as FullDayRhythmCloudBackup & {
            sanctuaryOverrideUntilMs?: number;
          };
          if (
            typeof backupWithSanctuary.sanctuaryOverrideUntilMs === 'number' &&
            Date.now() >= localWriteLockUntilRef.current
          ) {
            const incomingUntil = Math.max(0, Math.round(backupWithSanctuary.sanctuaryOverrideUntilMs));
            const effectiveUntil = incomingUntil > Date.now() ? incomingUntil : 0;
            if (effectiveUntil !== sanctuaryOverrideUntilMsRef.current) {
              sanctuaryOverrideUntilMsRef.current = effectiveUntil;
              setSanctuaryOverrideUntilMs(effectiveUntil);
              lastScheduledAlarmsJsonRef.current = '';
              try {
                if (effectiveUntil > 0) {
                  localStorage.setItem('dayrhythm_sanctuary_override_until_v1', String(effectiveUntil));
                } else {
                  localStorage.removeItem('dayrhythm_sanctuary_override_until_v1');
                }
              } catch {
                // ignore storage errors
              }
            }
          }
          const backupWithTravel = backup as FullDayRhythmCloudBackup & { travelState?: TravelState };
          if (backupWithTravel.travelState && Date.now() >= localWriteLockUntilRef.current) {
            const cleanDriveTravel = sanitizeTravelState(migratedBackup.travelState);
            const localTravelTs = travelStateRef.current.updatedAt ?? 0;
            if ((cleanDriveTravel.updatedAt ?? 0) > localTravelTs || localTravelTs === 0) {
              travelStateRef.current = cleanDriveTravel;
              setTravelState(cleanDriveTravel);
              try {
                localStorage.setItem(TRAVEL_STATE_STORAGE_KEY, JSON.stringify(cleanDriveTravel));
              } catch {
                // ignore storage errors
              }
            }
          }
          if (Array.isArray(backup.chatMessages) && backup.chatMessages.length > 0) {
            setChatMessages(backup.chatMessages);
            try {
              localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(backup.chatMessages.slice(-100)));
            } catch {
              // ignore storage errors
            }
          }
          setGoogleDriveSynced(true);
          showToast('✓ تمت استعادة إعدادات ودستور حساب Google بالكامل');
        }
        hasHydratedGoogleDriveRef.current = true;
        return true;
      } catch (err) {
        console.warn('Failed hydrating Google Drive appData:', err);
        hasHydratedGoogleDriveRef.current = true;
        return false;
      } finally {
        setIsSyncingGoogleDrive(false);
      }
    },
    [showToast]
  );

  const pushFullCloudBackupImmediately = useCallback(
    async (
      customToken?: string,
      overrides?: Partial<FullDayRhythmCloudBackup> & { travelState?: TravelState }
    ): Promise<boolean> => {
      let token = customToken || (await getOrRefreshCalendarAccessToken());
      if (!token) return false;

      const backup: FullDayRhythmCloudBackup & {
        schemaVersion: number;
        quietUntilTs?: number | null;
        quietModeUpdatedAt?: number;
        sanctuaryOverrideUntilMs?: number;
        travelState?: TravelState;
      } = {
        version: 1,
        schemaVersion: SCHEMA_VERSION,
        updatedAtIso: new Date().toISOString(),
        updatedAtMs: Date.now(),
        lifeProfile: overrides?.lifeProfile ?? lifeProfile,
        medications: overrides?.medications ?? medications,
        ...( {
          medicationsUpdatedAt: loadMedicationsUpdatedAt() || Date.now(),
          deletedMedicationIds: loadDeletedMedicationIds(),
        } as Record<string, unknown> ),
        hydrationHistory: overrides?.hydrationHistory ?? hydrationHistory,
        creativeActivities: overrides?.creativeActivities ?? creativeActivities,
        memories: overrides?.memories ?? memories,
        deviceSettings: overrides?.deviceSettings ?? deviceSettings,
        quietMode: overrides?.quietMode ?? quietMode,
        quietUntilTs,
        quietModeUpdatedAt: (() => {
          try {
            return Number(localStorage.getItem('dayrhythm_quiet_mode_updated_at_v1') || 0) || Date.now();
          } catch {
            return Date.now();
          }
        })(),
        adhanOverrideSilent: overrides?.adhanOverrideSilent ?? adhanOverrideSilent,
        sanctuaryOverrideUntilMs,
        waterRemindersEnabled: overrides?.waterRemindersEnabled ?? waterRemindersEnabled,
        phoneChargeLimitPct: overrides?.phoneChargeLimitPct ?? phoneChargeLimitPct,
        smartChargeAlertEnabled: overrides?.smartChargeAlertEnabled ?? smartChargeAlertEnabled,
        smartChargeKeepUntilUnplugged: overrides?.smartChargeKeepUntilUnplugged ?? smartChargeKeepUntilUnplugged,
        capsulePrefs: overrides?.capsulePrefs ?? capsulePrefs,
        selectedLogoId: overrides?.selectedLogoId ?? selectedLogoId,
        travelState: overrides?.travelState ?? travelState,
        chatMessages: (overrides?.chatMessages ?? chatMessages).slice(-50),
      };

      setIsSyncingGoogleDrive(true);
      try {
        const ok = await saveToGoogleDriveAppData(token, backup);
        if (ok) {
          setGoogleDriveSynced(true);
          hasHydratedGoogleDriveRef.current = true;
          showToast('✓ تم حفظ ومزامنة جميع الإعدادات والدستور مع حساب Google بنجاح');
          return true;
        }
        return false;
      } catch (err) {
        console.warn('Failed pushing immediate backup to Google Drive:', err);
        return false;
      } finally {
        setIsSyncingGoogleDrive(false);
      }
    },
    [
      lifeProfile,
      medications,
      hydrationHistory,
      creativeActivities,
      memories,
      deviceSettings,
      quietMode,
      quietUntilTs,
      adhanOverrideSilent,
      waterRemindersEnabled,
      phoneChargeLimitPct,
      smartChargeAlertEnabled,
      smartChargeKeepUntilUnplugged,
      capsulePrefs,
      selectedLogoId,
      travelState,
      chatMessages,
      showToast,
    ]
  );

  const handleStartPermanentLink = useCallback(async () => {
    if (!authUser) return;
    setIsStartingPermanentLink(true);
    try {
      await startPermanentLink({ uid: authUser.uid, loginHint: authUser.email });
    } catch (err: unknown) {
      setIsStartingPermanentLink(false);
      showToast(err instanceof Error ? err.message : 'تعذر بدء الربط الدائم.');
    }
  }, [authUser, showToast]);

  // Report the result of the Google redirect handled in main.tsx.
  useEffect(() => {
    const w = window as Window & {
      __dayRhythmPermanentLinkResult?: { ok: boolean; error?: string };
    };
    const result = w.__dayRhythmPermanentLinkResult;
    if (!result) return;
    delete w.__dayRhythmPermanentLinkResult;
    if (result.ok) {
      setPermanentLinkActive(true);
      setWorkspaceTokenExpired(false);
      showToast('🔗 تم الربط الدائم مع Google — مش هتحتاج تجدد الربط تاني على الجهاز ده ✓');
      void hydrateGoogleDriveOnce();
    } else if (result.error) {
      showToast(result.error);
    }
  }, [showToast, hydrateGoogleDriveOnce]);

  // Silent renewal: when the token is missing/expired, or 5 minutes before it expires.
  useEffect(() => {
    if (!authUser || needsAuth) return;
    let cancelled = false;
    const renewIfNeeded = async (force: boolean) => {
      if (!hasPermanentLink(authUser.uid)) return;
      if (!force && !isCalendarTokenExpiringSoon(5 * 60_000)) return;
      const token = await refreshGoogleCalendarTokenSilently();
      if (cancelled) return;
      if (token) {
        setWorkspaceTokenExpired(false);
        setGmailNeedsReauth(false);
        if (force) void refreshWorkspace(token);
        if (!hasHydratedGoogleDriveRef.current) {
          void hydrateGoogleDriveOnce(token);
        }
      } else {
        setPermanentLinkActive(hasPermanentLink(authUser.uid));
      }
    };
    if (workspaceTokenExpired) void renewIfNeeded(true);
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
    const id = isMobile ? window.setInterval(() => void renewIfNeeded(false), 60_000) : undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void renewIfNeeded(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authUser, needsAuth, workspaceTokenExpired, refreshWorkspace]);

  // Automatic Background Poller for Gmail Digest (silently skips when OAuth token is absent — zero annoying hourly banners!)
  useEffect(() => {
    if (!authUser || needsAuth || gmailNeedsReauth) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        if (!getCalendarAccessToken()) return;
        void fetchGmailDigest(undefined, { silent: true });
      }
    }, 10 * 60_000);

    const handleOnlineReconnect = () => {
      if (!getCalendarAccessToken()) return;
      gmailRetryAttemptRef.current = 0;
      clearGmailRetryTimers();
      void refreshWorkspace(undefined, { forceGmail: false });
    };

    const handleVisibilityResume = () => {
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine !== false &&
        Date.now() - lastGmailAutoScanMsRef.current >= 10 * 60_000
      ) {
        if (!getCalendarAccessToken()) return;
        void fetchGmailDigest(undefined, { silent: true });
      }
    };

    window.addEventListener('online', handleOnlineReconnect);
    document.addEventListener('visibilitychange', handleVisibilityResume);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnlineReconnect);
      document.removeEventListener('visibilitychange', handleVisibilityResume);
    };
  }, [
    authUser,
    needsAuth,
    gmailNeedsReauth,
    workspaceTokenExpired,
    fetchGmailDigest,
    refreshWorkspace,
    clearGmailRetryTimers,
  ]);

  useEffect(() => {
    const unsubCalendar = initCalendarAuth(
      (user, token) => {
        setAuthUser(user);
        setNeedsAuth(false);
        setUseOfflineDemo(false);
        setWorkspaceTokenExpired(!token);
        // Hydrate cached Calendar/Tasks/Gmail immediately so the user can work 100% offline!
        const cachedCal = loadOfflineWorkspaceCache<{
          calendars?: GoogleCalendarInfo[];
          events?: GoogleCalendarEventItem[];
        }>(OFFLINE_CAL_PREFIX, user.uid);
        if (cachedCal) {
          if (Array.isArray(cachedCal.calendars) && cachedCal.calendars.length > 0) {
            setCalendarList(cachedCal.calendars);
          }
          if (Array.isArray(cachedCal.events)) {
            setCalendarEvents(cachedCal.events);
          }
        }
        const cachedTasks = loadOfflineWorkspaceCache<{
          taskLists?: GoogleTaskList[];
          tasks?: GoogleTaskItem[];
        }>(OFFLINE_TASKS_PREFIX, user.uid);
        if (cachedTasks) {
          if (Array.isArray(cachedTasks.taskLists) && cachedTasks.taskLists.length > 0) {
            setGoogleTaskLists(cachedTasks.taskLists);
          }
          if (Array.isArray(cachedTasks.tasks)) {
            setGoogleTasks(cachedTasks.tasks);
          }
        }
        const cachedGmail = loadOfflineWorkspaceCache<{
          digestItems?: GmailDigestItem[];
          scannedCount?: number;
          syncedIso?: string;
        }>(OFFLINE_GMAIL_PREFIX, user.uid);
        if (cachedGmail) {
          if (Array.isArray(cachedGmail.digestItems)) setGmailDigest(cachedGmail.digestItems);
          if (typeof cachedGmail.scannedCount === 'number') {
            setGmailScannedCount(cachedGmail.scannedCount);
          }
          if (typeof cachedGmail.syncedIso === 'string') {
            setGmailLastSyncedIso(cachedGmail.syncedIso);
          }
        }
        if (token && navigator.onLine !== false) {
          void refreshWorkspace(token, { forceGmail: true });
        }
        if (token) {
          void hydrateGoogleDriveOnce(token);
        } else {
          void getOrRefreshCalendarAccessToken().then((freshToken) => {
            if (freshToken) {
              setWorkspaceTokenExpired(false);
              void hydrateGoogleDriveOnce(freshToken);
            } else {
              hasHydratedGoogleDriveRef.current = true;
            }
          });
        }
      },
      () => {
        setAuthUser(null);
        setNeedsAuth(true);
        setWorkspaceTokenExpired(false);
      }
    );
    const unsubFirebase = observeFirebaseUser((user) => {
      // Strictly keep Anonymous or unverified accounts isolated & empty
      if (!user || user.isAnonymous) {
        setFirebaseUser(null);
        hasHydratedRemoteRef.current = false;
        hasHydratedCloudChatRef.current = false;
        syncedChatTextByIdRef.current.clear();
        cloudChatIdsRef.current.clear();
        setFirestoreReady(false);
        setFirestoreSynced(false);
        return;
      }
      setFirebaseUser(user);
      try {
        const prevUid = localStorage.getItem(ACTIVE_UID_STORAGE_KEY);
        if (prevUid && prevUid !== user.uid) {
          // Different user signed in: clear previous user's local cache immediately before hydrating cloud
          clearAllPersonalLocalStorage();
          setMedications(DEFAULT_MEDICATIONS);
          setCreativeActivities(DEFAULT_CREATIVE_ACTIVITIES);
          setMemories(DEFAULT_MEMORIES);
          setLifeProfile(DEFAULT_LIFE_PROFILE);
          setDeviceSettings(DEFAULT_DEVICE_SETTINGS);
          setChatMessages([WELCOME_MESSAGE]);
          setGmailDigest([]);
          setGmailScannedCount(0);
          setGmailLastSyncedIso('');
        }
        localStorage.setItem(ACTIVE_UID_STORAGE_KEY, user.uid);
      } catch {
        // ignore storage errors
      }
    });
    return () => {
      unsubCalendar();
      unsubFirebase();
    };
  }, [refreshWorkspace]);

  const handleIncomingRemoteSync = useCallback(
    (payload: {
      opId?: string;
      clientId?: string;
      scope?: string;
      action?: string;
      undoSnapshot?: DeletedWorkspaceSnapshot;
      extra?: Record<string, unknown>;
    }) => {
      if (!payload || payload.clientId === clientIdRef.current) return;
      if (payload.opId) {
        if (seenSyncOpIdsRef.current.has(payload.opId)) return;
        seenSyncOpIdsRef.current.add(payload.opId);
        if (seenSyncOpIdsRef.current.size > 150) {
          const oldest = seenSyncOpIdsRef.current.values().next().value;
          if (oldest) seenSyncOpIdsRef.current.delete(oldest);
        }
      }

      if (payload.scope === 'alarm_dismiss') {
        stopContinuousAlert();
        stopSmartChargeCompleteAlert();
        stopNativeAlerts();
        setSmartChargeAudioActive(false);
        setActiveAudioAlert(null);
        setPersistentAlert(null);
        setAlarmRinging(false);
        const extraDismiss = payload.extra as { blockId?: string } | undefined;
        if (extraDismiss?.blockId) {
          acknowledgedBlockIdsRef.current.add(extraDismiss.blockId);
          setCompletedOverrides((prev) => ({
            ...prev,
            [extraDismiss.blockId!]: true,
          }));
        }
        showToast('🔕 تم إيقاف التنبيه تلقائياً من جهازك الآخر ✓');
        return;
      }

      if (payload.scope === 'alarm_trigger') {
        setAlarmRinging(true);
        const extra = payload.extra as
          | {
              title?: string;
              body?: string;
              kind?: TaskSoundCategory;
              privacyEmoji?: string;
              sourceLabel?: string;
              snoozeMinutes?: number;
              blockId?: string;
              bypassSanctuary?: boolean;
            }
          | undefined;
        const emoji = extra?.privacyEmoji || '🔔';
        const title = extra?.title || 'تنبيه متزامن (الموبايل ↔ الكمبيوتر)';
        const source = extra?.sourceLabel || 'مزامنة سحابية فورية';
        const soundCat = (extra?.kind || 'general') as TaskSoundCategory;
        triggerTaskAlert(emoji, soundCat, {
          privacyEmoji: emoji,
          displayTitle: title,
          sourceLabel: source,
          description: extra?.body,
          blockId: extra?.blockId,
          isRemoteSignal: true,
          bypassSanctuary: Boolean(extra?.bypassSanctuary),
        });
        return;
      }

      if (payload.action === 'undo_restore') {
        setLastDeletedWorkspaceItem(null);
      } else if (payload.undoSnapshot) {
        setLastDeletedWorkspaceItem(payload.undoSnapshot);
      }

      if (payload.scope === 'calendar') {
        acknowledgedBlockIdsRef.current.clear();
        void fetchCalendarEvents();
      } else if (payload.scope === 'tasks') {
        void fetchGoogleTasks();
      } else {
        void refreshWorkspace();
      }
    },
    [fetchCalendarEvents, fetchGoogleTasks, refreshWorkspace, showToast, stopNativeAlerts, triggerTaskAlert]
  );

  // The long-lived listeners below (WebSocket + Firestore) must NOT re-subscribe whenever these
  // callbacks change identity. They used to: every Firestore snapshot replaced lifeProfile →
  // triggerTaskAlert/handleIncomingRemoteSync changed → the Firestore listener re-subscribed →
  // a fresh (stale) snapshot arrived → loop. That reset just-tapped water cups and spammed
  // WebSocket reconnects. The listeners now call the latest version through refs.
  const handleIncomingRemoteSyncRef = useRef(handleIncomingRemoteSync);
  handleIncomingRemoteSyncRef.current = handleIncomingRemoteSync;
  const refreshWorkspaceRef = useRef(refreshWorkspace);
  refreshWorkspaceRef.current = refreshWorkspace;
  const applyRemoteRef = useRef<(remote: SyncedRhythmPayload) => void>(() => {});
  const callRemoteSync = useCallback(
    (payload: Parameters<typeof handleIncomingRemoteSync>[0]) => handleIncomingRemoteSyncRef.current(payload),
    []
  );
  const callRefreshWorkspace = useCallback(() => refreshWorkspaceRef.current(), []);

  // Wake/Online/Visibility Recovery: ensures Firestore streams recover instantly after sleep or network toggle
  useEffect(() => {
    let lastVisibleAtMs = Date.now();

    const handleResumeSync = () => {
      if (document.visibilityState === 'visible') {
        const sleptMs = Date.now() - lastVisibleAtMs;
        lastVisibleAtMs = Date.now();
        triggerFirestoreRecovery(sleptMs > 45_000);
        void callRefreshWorkspace();
      } else {
        lastVisibleAtMs = Date.now();
      }
    };

    const handleOnline = () => {
      triggerFirestoreRecovery(true);
      void callRefreshWorkspace();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleResumeSync);
    window.addEventListener('dayrhythm:network-recovered', handleOnline);
    document.addEventListener('visibilitychange', handleResumeSync);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleResumeSync);
      window.removeEventListener('dayrhythm:network-recovered', handleOnline);
      document.removeEventListener('visibilitychange', handleResumeSync);
    };
  }, [callRefreshWorkspace]);

  const applyRemote = useCallback((remote: SyncedRhythmPayload & {
    medications?: MedicationItem[];
    creativeActivities?: CreativeActivityItem[];
    memories?: MemoryItem[];
  }) => {
    const migratedRemote = migrateAppState(remote);
    const remoteTs = (remote as { updatedAtMs?: number }).updatedAtMs;
    if (typeof remoteTs === 'number' && remoteTs > lastFirestoreUpdatedAtRef.current) {
      lastFirestoreUpdatedAtRef.current = remoteTs;
      try {
        localStorage.setItem(LAST_FIRESTORE_UPDATED_AT_KEY, String(remoteTs));
      } catch {
        // ignore storage errors
      }
    }
    // ── Instant Bidirectional Remote Alarm Dismissal (Phone ↔ PC) ──
    const remoteDismiss =
      (remote as { lastDismissSignal?: { opId?: string; timestampMs: number; scope: string; action: string; clientId: string } })
        .lastDismissSignal || remote.syncSignal;
    const remoteSenderId =
      (remoteDismiss as { clientId?: string; originClientId?: string })?.clientId ||
      (remoteDismiss as { originClientId?: string })?.originClientId;
    if (remoteDismiss && remoteSenderId !== clientIdRef.current) {
      const dismissTs = remoteDismiss.timestampMs || 0;
      const dismissOpId =
        (remoteDismiss as { opId?: string }).opId ||
        `remote_dism_${dismissTs}_${remoteSenderId || 'unknown'}`;
      const activeAlertCreatedAt = persistentAlertRef.current?.createdAtMs ?? 0;
      const isOlderThanActiveAlert = activeAlertCreatedAt > 0 && dismissTs < activeAlertCreatedAt;
      if (
        !isOlderThanActiveAlert &&
        Date.now() - dismissTs < 180_000 &&
        !seenSyncOpIdsRef.current.has(dismissOpId)
      ) {
        if (
          remoteDismiss.scope === 'alarm_dismiss' ||
          remoteDismiss.action?.includes('dismiss') ||
          remoteDismiss.action?.includes('done') ||
          remoteDismiss.action?.includes('water')
        ) {
          seenSyncOpIdsRef.current.add(dismissOpId);
          if (seenSyncOpIdsRef.current.size > 150) {
            const oldest = seenSyncOpIdsRef.current.values().next().value;
            if (oldest) seenSyncOpIdsRef.current.delete(oldest);
          }
          stopContinuousAlert();
          stopNativeAlerts();
          setActiveAudioAlert(null);
          setPersistentAlert(null);
          setAlarmRinging(false);
          try {
            const bridge = (
              window as Window & {
                DayRhythmNative?: {
                  dismissActiveAlerts?: () => void;
                  stopNativeAlarmSound?: () => void;
                };
              }
            ).DayRhythmNative;
            bridge?.stopNativeAlarmSound?.();
            bridge?.dismissActiveAlerts?.();
          } catch {
            // ignore bridge
          }
        }
      }
    }
    if (remote.appSettings && Date.now() >= localWriteLockUntilRef.current) {
      const a = sanitizeAppSyncSettings(remote.appSettings);
      if (a) {
        const merged: AppSyncSettings = {
          ...appSettingsRef.current,
          ...a,
        };
        appSettingsRef.current = merged;
        setPhoneChargeLimitPct(merged.phoneChargeLimitPct);
        phoneChargeLimitRef.current = merged.phoneChargeLimitPct;
        setBatteryGuard((prev) => ({
          ...prev,
          bypassChargingLimitPct:
            prev.bypassChargingLimitPct === null
              ? null
              : merged.phoneChargeLimitPct <= 80
                ? 80
                : 90,
        }));
        setSmartChargeAlertEnabled(merged.smartChargeAlertEnabled);
        setSmartChargeKeepUntilUnplugged(merged.smartChargeKeepUntilUnplugged);
        setWaterRemindersEnabled(merged.waterRemindersEnabled);
        setSunMode(merged.sunMode);
        if (typeof a.includePrayerAnchors === 'boolean') {
          setIncludePrayerAnchors(a.includePrayerAnchors);
        }
        try {
          localStorage.setItem('dayrhythm_phone_charge_limit', String(merged.phoneChargeLimitPct));
          const savedBypass = localStorage.getItem('dayrhythm_bypass_limit_v1');
          if (savedBypass !== 'off' && savedBypass !== 'null') {
            localStorage.setItem('dayrhythm_bypass_limit_v1', String(merged.phoneChargeLimitPct));
          }
          localStorage.setItem('dayrhythm_smart_charge_alert_enabled', String(merged.smartChargeAlertEnabled));
          localStorage.setItem(SMART_CHARGE_KEEP_KEY, String(merged.smartChargeKeepUntilUnplugged));
          localStorage.setItem(WATER_REMINDER_STORAGE_KEY, String(merged.waterRemindersEnabled));
          if (typeof a.includePrayerAnchors === 'boolean') {
            localStorage.setItem('dayrhythm_include_prayer_anchors', String(a.includePrayerAnchors));
          }
        } catch {
          // ignore storage errors
        }
        try {
          (window as Window & { DayRhythmNative?: { setChargeLimit?: (l: number, e: boolean) => void } })
            .DayRhythmNative?.setChargeLimit?.(merged.phoneChargeLimitPct, merged.smartChargeAlertEnabled);
        } catch {
          // ignore bridge errors
        }
      }
    }
    const targetQuiet = remote.quietMode || quietModeRef.current;
    const targetAdhan = typeof remote.adhanOverrideSilent === 'boolean' ? remote.adhanOverrideSilent : adhanOverrideSilentRef.current;
    lastSyncedQuietSigRef.current = `${targetQuiet}:${targetAdhan}`;

    if (remote.quietMode && remote.quietMode !== quietModeRef.current && Date.now() >= localWriteLockUntilRef.current) {
      let localQuietUpdatedAt = 0;
      try {
        localQuietUpdatedAt = Number(localStorage.getItem('dayrhythm_quiet_mode_updated_at_v1') || 0);
      } catch {
        localQuietUpdatedAt = 0;
      }
      const remoteQuietMeta = remote as {
        quietUntilTs?: number | null;
        quietModeUpdatedAt?: number;
        updatedAtMs?: number;
      };
      const remoteQuietUpdatedAt = remoteQuietMeta.quietModeUpdatedAt ?? remoteQuietMeta.updatedAtMs ?? 0;
      if (remoteQuietUpdatedAt > localQuietUpdatedAt || localQuietUpdatedAt === 0) {
        const nextUntil =
          remote.quietMode === 'normal'
            ? null
            : typeof remoteQuietMeta.quietUntilTs === 'number' && remoteQuietMeta.quietUntilTs > 0
              ? remoteQuietMeta.quietUntilTs
              : null;
        quietModeRef.current = remote.quietMode;
        setQuietMode(remote.quietMode);
        setQuietUntilTs(nextUntil);
        setQuietRemainingSec(
          remote.quietMode !== 'normal' && nextUntil !== null && nextUntil > Date.now()
            ? Math.max(1, Math.ceil((nextUntil - Date.now()) / 1000))
            : 0
        );
        try {
          localStorage.setItem('dayrhythm_quiet_mode_v1', remote.quietMode);
          localStorage.setItem('dayrhythm_quiet_until_ts_v1', nextUntil === null ? 'null' : String(nextUntil));
          localStorage.setItem(
            'dayrhythm_quiet_mode_updated_at_v1',
            String(remoteQuietUpdatedAt || Date.now())
          );
        } catch {
          // ignore
        }
      }
    }
    if (typeof remote.adhanOverrideSilent === 'boolean' && remote.adhanOverrideSilent !== adhanOverrideSilentRef.current) {
      adhanOverrideSilentRef.current = remote.adhanOverrideSilent;
      setAdhanOverrideSilent(remote.adhanOverrideSilent);
    }
    const remoteSanctuaryOverride = (remote as { sanctuaryOverrideUntilMs?: number }).sanctuaryOverrideUntilMs;
    if (
      typeof remoteSanctuaryOverride === 'number' &&
      Date.now() >= localWriteLockUntilRef.current
    ) {
      const incomingUntil = Math.max(0, Math.round(remoteSanctuaryOverride));
      const effectiveUntil = incomingUntil > Date.now() ? incomingUntil : 0;
      if (effectiveUntil !== sanctuaryOverrideUntilMsRef.current) {
        sanctuaryOverrideUntilMsRef.current = effectiveUntil;
        setSanctuaryOverrideUntilMs(effectiveUntil);
        lastScheduledAlarmsJsonRef.current = '';
        lastSyncedCloudAlarmsJsonRef.current = '';
        try {
          if (effectiveUntil > 0) {
            localStorage.setItem('dayrhythm_sanctuary_override_until_v1', String(effectiveUntil));
          } else {
            localStorage.removeItem('dayrhythm_sanctuary_override_until_v1');
          }
        } catch {
          // ignore
        }
      }
    }
    if (remote.surfaceTheme && remote.surfaceTheme !== surfaceThemeRef.current) {
      surfaceThemeRef.current = remote.surfaceTheme;
      setSurfaceTheme(remote.surfaceTheme);
      try {
        localStorage.setItem(SURFACE_THEME_STORAGE_KEY, remote.surfaceTheme);
      } catch {
        // ignore
      }
    }
    if (remote.deviceSettings) {
      const cleanDev = sanitizeDeviceSettings(remote.deviceSettings);
      const isDiff = JSON.stringify(cleanDev) !== JSON.stringify(deviceSettingsRef.current);
      if (isDiff && Date.now() >= localWriteLockUntilRef.current) {
        deviceSettingsRef.current = cleanDev;
        setDeviceSettings(cleanDev);
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : {};
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, deviceSettings: cleanDev }));
        } catch {
          // ignore
        }
      }
    }
    if (remote.lifeProfile) {
      const cleanProfile = sanitizeLifeProfile(migratedRemote.lifeProfile);
      const isDiff = JSON.stringify(cleanProfile) !== JSON.stringify(lifeProfileRef.current);
      if (isDiff && Date.now() >= localWriteLockUntilRef.current) {
        lifeProfileRef.current = cleanProfile;
        setLifeProfile(cleanProfile);
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : {};
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...parsed, schemaVersion: SCHEMA_VERSION, lifeProfile: cleanProfile })
          );
          localStorage.setItem(
            'dayrhythm_life_profile_updated_at_v1',
            String((remote as { updatedAtMs?: number }).updatedAtMs || Date.now())
          );
        } catch {
          // ignore
        }
      }
    }
    if (Array.isArray(remote.medications)) {
      const rMedsMeta = remote as {
        medicationsUpdatedAt?: number;
        deletedMedicationIds?: string[];
        updatedAtMs?: number;
      };
      const remoteMedsUpdatedAt =
        typeof rMedsMeta.medicationsUpdatedAt === 'number'
          ? rMedsMeta.medicationsUpdatedAt
          : typeof rMedsMeta.updatedAtMs === 'number'
            ? rMedsMeta.updatedAtMs
            : 0;
      const localMedsUpdatedAt = loadMedicationsUpdatedAt();
      const mergedDeleted = Array.from(
        new Set([
          ...loadDeletedMedicationIds(),
          ...(Array.isArray(rMedsMeta.deletedMedicationIds) ? rMedsMeta.deletedMedicationIds : []),
        ])
      ).slice(-100);
      try {
        localStorage.setItem(MEDS_DELETED_IDS_STORAGE_KEY, JSON.stringify(mergedDeleted));
      } catch {
        // ignore
      }
      const deletedSet = new Set(mergedDeleted);
      if (remoteMedsUpdatedAt === 0 || remoteMedsUpdatedAt >= localMedsUpdatedAt) {
        const cleanMeds = remote.medications
          .map((m) => sanitizeMedicationItem(m))
          .filter((m) => !deletedSet.has(m.id));
        const sig = JSON.stringify(cleanMeds);
        if (sig !== JSON.stringify(medicationsRef.current)) {
          medicationsRef.current = cleanMeds;
          setMedications(cleanMeds);
          try {
            localStorage.setItem(MEDS_STORAGE_KEY, sig);
            if (remoteMedsUpdatedAt > 0) {
              localStorage.setItem(MEDS_UPDATED_AT_STORAGE_KEY, String(remoteMedsUpdatedAt));
            }
          } catch {
            // ignore
          }
        }
      } else if (mergedDeleted.length > 0) {
        const filtered = medicationsRef.current.filter((m) => !deletedSet.has(m.id));
        if (filtered.length !== medicationsRef.current.length) {
          medicationsRef.current = filtered;
          setMedications(filtered);
          try {
            localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(filtered));
          } catch {
            // ignore
          }
        }
      }
    }
    if (Array.isArray(remote.memories)) {
      const cleanMems = remote.memories.map((m) => sanitizeMemoryItem(m));
      const sig = JSON.stringify(cleanMems);
      if (sig !== JSON.stringify(memoriesRef.current)) {
        lastSyncedMemoriesSigRef.current = sig;
        memoriesRef.current = cleanMems;
        setMemories(cleanMems);
        try {
          localStorage.setItem(MEMORIES_STORAGE_KEY, sig);
        } catch {
          // ignore
        }
      }
    }
    if (Array.isArray(remote.creativeActivities)) {
      const cleanCreatives = remote.creativeActivities.map((c) => sanitizeCreativeActivityItem(c));
      const sig = JSON.stringify(cleanCreatives);
      if (sig !== JSON.stringify(creativeActivitiesRef.current)) {
        lastSyncedCreativeSigRef.current = sig;
        creativeActivitiesRef.current = cleanCreatives;
        setCreativeActivities(cleanCreatives);
        try {
          localStorage.setItem(CREATIVE_STORAGE_KEY, sig);
        } catch {
          // ignore
        }
      }
    }
    if (remote.uiPrefs) {
      const cleanUi = sanitizeUiPrefs(remote.uiPrefs);
      if (cleanUi) {
        if (cleanUi.selectedLogoId && cleanUi.selectedLogoId !== selectedLogoIdRef.current) {
          selectedLogoIdRef.current = cleanUi.selectedLogoId;
          setSelectedLogoId(cleanUi.selectedLogoId);
        }
        if (cleanUi.capsuleOrientation !== capsulePrefsRef.current.orientation || cleanUi.capsuleSize !== capsulePrefsRef.current.size) {
          capsulePrefsRef.current = {
            orientation: cleanUi.capsuleOrientation,
            size: cleanUi.capsuleSize,
          };
          setCapsulePrefs(capsulePrefsRef.current);
        }
        if (cleanUi.cloudApiUrl) {
          syncSavedCloudApiUrlFromRemote(cleanUi.cloudApiUrl);
          try {
            window.dispatchEvent(
              new CustomEvent('dayrhythm:cloud-api-updated', { detail: { url: cleanUi.cloudApiUrl } })
            );
          } catch {
            // ignore event errors
          }
        }
        try {
          window.localStorage.setItem(SELECTED_LOGO_STORAGE_KEY, cleanUi.selectedLogoId);
          window.localStorage.setItem(
            CAPSULE_PREFS_STORAGE_KEY,
            JSON.stringify({
              orientation: cleanUi.capsuleOrientation,
              size: cleanUi.capsuleSize,
            })
          );
        } catch {
          // ignore storage errors
        }
      }
    }

    if (typeof remote.dailyCommitmentDays === 'number') {
      const nextDaily = remote.dailyCommitmentDays!;
      const nextDailyDone = Boolean(remote.dailyCommitmentDoneToday);
      const nextWater = remote.waterTargetDays ?? 0;
      const nextWaterDone = Boolean(remote.waterTargetDoneToday);
      lastSyncedStreaksSigRef.current = `${nextDaily}:${nextDailyDone}:${nextWater}:${nextWaterDone}`;
      setStreaks((prev) => {
        if (Date.now() < localWriteLockUntilRef.current) return prev;
        if (
          prev.dailyCommitmentDays === nextDaily &&
          prev.dailyCommitmentDoneToday === nextDailyDone &&
          prev.waterTargetDays === nextWater &&
          prev.waterTargetDoneToday === nextWaterDone
        ) {
          return prev;
        }
        return {
          dailyCommitmentDays: nextDaily,
          dailyCommitmentDoneToday: nextDailyDone,
          waterTargetDays: nextWater,
          waterTargetDoneToday: nextWaterDone,
        };
      });
    }

    if (typeof remote.cupsLogged === 'number') {
      const remoteTz = remote.lifeProfile?.currentTimeZone || activeTimeZone || 'Africa/Cairo';
      const labels = getLast7DayLabels(remoteTz);
      const todayIso = getDateIsoInTimeZone(remoteTz);
      const isSameDay = !remote.hydrationDateKey || remote.hydrationDateKey === todayIso;
      const baseCounts = isSameDay
        ? (remote.hydrationWeeklyCounts || [0, 0, 0, 0, 0, 0, 0])
        : [...(remote.hydrationWeeklyCounts || [0, 0, 0, 0, 0, 0, 0]).slice(1), 0];

      setHydrationHistory((prev) => {
        const prevToday = prev.length > 0 ? prev[prev.length - 1] : null;
        const targetVal = remote.targetCups || (prevToday ? prevToday.targetCups : 13);
        const remoteTodayInput = isSameDay
          ? {
              dateKey: todayIso,
              targetCups: targetVal,
              cupsLogged: remote.cupsLogged ?? 0,
              slotOpIds: remote.hydrationSlotOpIds,
              removedOpIds: remote.hydrationRemovedOpIds,
              updatedAtMs: remote.hydrationUpdatedAtMs ?? 0,
            }
          : null;

        const mergedToday = remoteTodayInput
          ? mergeHydrationTodaySlots(
              {
                dateKey: prevToday?.dateKey === todayIso ? todayIso : todayIso,
                targetCups: targetVal,
                cupsLogged: prevToday?.dateKey === todayIso ? prevToday.cupsLogged : 0,
                slotOpIds:
                  prevToday?.dateKey === todayIso
                    ? prevToday.slotOpIds ||
                      prevToday.slots.map((filled, idx) => (filled ? `loc_s${idx}` : ''))
                    : undefined,
                removedOpIds: prevToday?.dateKey === todayIso ? prevToday.removedOpIds : undefined,
                updatedAtMs:
                  prevToday?.dateKey === todayIso ? prevToday.hydrationUpdatedAtMs ?? 0 : 0,
              },
              remoteTodayInput
            )
          : null;

        if (
          prevToday &&
          prevToday.dateKey === todayIso &&
          mergedToday &&
          prevToday.cupsLogged === mergedToday.cupsLogged &&
          prevToday.targetCups === targetVal &&
          JSON.stringify(prevToday.slots) === JSON.stringify(mergedToday.slots) &&
          JSON.stringify(prevToday.slotOpIds || []) === JSON.stringify(mergedToday.slotOpIds) &&
          prev.length === labels.length &&
          prev.every((d, i) => i === 6 || d.cupsLogged === (baseCounts[i] ?? 0))
        ) {
          return prev;
        }

        const nextHistory = labels.map((labelAr, idx) => {
          const isToday = idx === 6;
          const t = targetVal;
          if (isToday) {
            if (mergedToday) {
              return {
                dateKey: todayIso,
                labelAr,
                cupsLogged: Math.min(t, mergedToday.cupsLogged),
                targetCups: t,
                slots: mergedToday.slots.slice(0, t),
                slotOpIds: mergedToday.slotOpIds.slice(0, t),
                removedOpIds: mergedToday.removedOpIds,
                hydrationUpdatedAtMs: mergedToday.updatedAtMs,
              };
            }
            if (prevToday && prevToday.dateKey === todayIso) {
              return { ...prevToday, labelAr, targetCups: t };
            }
            return {
              dateKey: todayIso,
              labelAr,
              cupsLogged: 0,
              targetCups: t,
              slots: Array.from({ length: t }, () => false),
              slotOpIds: Array.from({ length: t }, () => ''),
              removedOpIds: [],
              hydrationUpdatedAtMs: 0,
            };
          }
          const c = baseCounts[idx] ?? 0;
          return {
            dateKey: `day-${idx}`,
            labelAr,
            cupsLogged: Math.min(t, c),
            targetCups: t,
            slots: Array.from({ length: t }, (_, sIdx) => sIdx < c),
          };
        });
        hydrationHistoryRef.current = nextHistory;
        return nextHistory;
      });
    }

    if (remote.completedOverrides) {
      if (JSON.stringify(remote.completedOverrides) !== JSON.stringify(completedOverridesRef.current)) {
        completedOverridesRef.current = remote.completedOverrides;
        setCompletedOverrides(remote.completedOverrides);
      }
    }
    if (remote.fastingOverride) {
      if (remote.fastingOverride !== fastingOverrideRef.current) {
        fastingOverrideRef.current = remote.fastingOverride;
        setFastingOverride(remote.fastingOverride);
      }
    }
    if (typeof remote.isFridayMode === 'boolean') {
      if (remote.isFridayMode !== isFridayModeRef.current) {
        isFridayModeRef.current = remote.isFridayMode;
        setIsFridayMode(remote.isFridayMode);
      }
    }
    if (typeof remote.includeBiweeklyPcCleanup === 'boolean') {
      if (remote.includeBiweeklyPcCleanup !== includeBiweeklyPcCleanupRef.current) {
        includeBiweeklyPcCleanupRef.current = remote.includeBiweeklyPcCleanup;
        setIncludeBiweeklyPcCleanup(remote.includeBiweeklyPcCleanup);
      }
    }
    if (remote.travelState && Date.now() >= localWriteLockUntilRef.current) {
      const cleanRemoteTravel = sanitizeTravelState(remote.travelState);
      const remoteTs = cleanRemoteTravel.updatedAt ?? 0;
      const localTs = travelStateRef.current.updatedAt ?? 0;
      if (
        remoteTs >= localTs &&
        JSON.stringify(cleanRemoteTravel) !== JSON.stringify(travelStateRef.current)
      ) {
        travelStateRef.current = cleanRemoteTravel;
        setTravelState(cleanRemoteTravel);
        try {
          localStorage.setItem(TRAVEL_STATE_STORAGE_KEY, JSON.stringify(cleanRemoteTravel));
        } catch {
          // ignore storage errors
        }
      }
    }
    if (remote.pomodoro) {
      if (JSON.stringify(remote.pomodoro) !== JSON.stringify(pomodoroRef.current)) {
        pomodoroRef.current = remote.pomodoro;
        setPomodoro(remote.pomodoro);
      }
    }
    if (Array.isArray(remote.periodicRituals)) {
      if (JSON.stringify(remote.periodicRituals) !== JSON.stringify(periodicRitualsRef.current)) {
        periodicRitualsRef.current = remote.periodicRituals;
        setPeriodicRituals(remote.periodicRituals);
      }
    }
    if (!detectIsMobileDeviceClient() && remote.phoneBattery) {
      const incomingBat = sanitizePhoneBattery(remote.phoneBattery);
      if (incomingBat) {
        setPhoneBattery((prev) => {
          if (
            prev &&
            prev.levelPct === incomingBat.levelPct &&
            prev.charging === incomingBat.charging &&
            prev.chargeLimitPct === incomingBat.chargeLimitPct &&
            prev.chargeTimeRemainingMin === incomingBat.chargeTimeRemainingMin
          ) {
            return prev;
          }
          return incomingBat;
        });
        setBatteryGuard((prev) => ({
          ...prev,
          levelPct: incomingBat.levelPct,
          cableConnected: incomingBat.charging,
          pcAlertActive:
            incomingBat.charging &&
            incomingBat.levelPct >= incomingBat.chargeLimitPct &&
            prev.bypassChargingLimitPct === null,
          autoSilencedByDisconnect: !incomingBat.charging && prev.cableConnected,
        }));
      }
    }

    try {
      // Only update keys that actually arrived on `remote` — never wipe omitted keys in lastServerFieldsRef!
      const incomingObj = remote as unknown as Record<string, unknown>;
      const sanitizedRemote = sanitizeRhythmPayload(remote);
      const nextFields = { ...lastServerFieldsRef.current };
      for (const group of RHYTHM_FIELD_GROUPS) {
        for (const key of group) {
          if (incomingObj[key] !== undefined) {
            nextFields[key] = JSON.stringify(sanitizedRemote[key] ?? null);
          }
        }
      }
      lastServerFieldsRef.current = nextFields;
      lastSpircFullStateRef.current = {
        ...lastSpircFullStateRef.current,
        ...incomingObj,
      };
    } catch {
      // ignore
    }
  }, []);
  applyRemoteRef.current = applyRemote;

  function mergeSyncedRhythmPayloads(
    base: SyncedRhythmPayload | null,
    incoming: SyncedRhythmPayload
  ): SyncedRhythmPayload {
    if (!base) return incoming;
    const mergedDeviceSettings = incoming.deviceSettings
      ? ({ ...(base.deviceSettings || {}), ...incoming.deviceSettings } as OnePlusDeviceSettings)
      : base.deviceSettings;
    const mergedLifeProfile = incoming.lifeProfile
      ? ({ ...(base.lifeProfile || {}), ...incoming.lifeProfile } as LifeProfile)
      : base.lifeProfile;
    const mergedAppSettings = incoming.appSettings
      ? ({ ...(base.appSettings || {}), ...incoming.appSettings } as AppSyncSettings)
      : base.appSettings;
    const mergedUiPrefs = incoming.uiPrefs
      ? ({ ...(base.uiPrefs || {}), ...incoming.uiPrefs } as UiPrefs)
      : base.uiPrefs;

    return {
      ...base,
      ...incoming,
      appSettings: mergedAppSettings,
      deviceSettings: mergedDeviceSettings,
      uiPrefs: mergedUiPrefs,
      lifeProfile: mergedLifeProfile,
    };
  }

  const applyOrDefer = useCallback(
    (remote: SyncedRhythmPayload & {
      medications?: MedicationItem[];
      creativeActivities?: CreativeActivityItem[];
      memories?: MemoryItem[];
    }) => {
      const waitMs = localWriteLockUntilRef.current - Date.now();
      if (waitMs > 0) {
        pendingRemoteRef.current = mergeSyncedRhythmPayloads(
          pendingRemoteRef.current,
          remote as SyncedRhythmPayload
        );
        if (pendingRemoteTimerRef.current !== null) {
          window.clearTimeout(pendingRemoteTimerRef.current);
        }
        pendingRemoteTimerRef.current = window.setTimeout(() => {
          pendingRemoteTimerRef.current = null;
          const latest = pendingRemoteRef.current;
          pendingRemoteRef.current = null;
          if (latest) {
            isLoadingSettingsRef.current = true;
            try {
              applyOrDefer(latest as any);
            } finally {
              window.setTimeout(() => {
                isLoadingSettingsRef.current = false;
              }, 150);
            }
          }
        }, waitMs + 20);
        return;
      }
      applyRemote(remote);
    },
    [applyRemote]
  );

  const lastAppliedTasksSyncMsRef = useRef<number>(0);

  // Dedicated Top-Level LAN & Cross-Tab Reactivity Listener
  // Independent of Firebase auth or network connection:
  // Receives instant messages over local Wi-Fi / LAN WebSocket (Windows port 48721, Android WebKit bridge)
  // and multi-tab BroadcastChannel and storage events.
  useEffect(() => {
    const handleNativeWsSync = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent<string>).detail;
        if (typeof detail === 'string') {
          const parsed = JSON.parse(detail);
          if (parsed && typeof parsed === 'object') {
            const senderId = parsed.clientId || parsed.settings?.originClientId;
            if (senderId === clientIdRef.current) return;
            if (parsed.type === 'settings_update' && parsed.settings) {
              applyRemoteRef.current(parsed.settings);
            } else if (parsed.settings) {
              applyRemoteRef.current(parsed.settings);
            } else {
              callRemoteSync(parsed);
            }
          }
        }
      } catch {
        // ignore malformed native WS payload
      }
    };

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('dayrhythm_sync');
        bc.onmessage = (event) => {
          const data = event.data;
          if (data && typeof data === 'object') {
            const senderId = data.clientId || data.settings?.originClientId;
            if (senderId === clientIdRef.current) return;
            if (data.type === 'settings_update' && data.settings) {
              applyRemoteRef.current(data.settings);
            } else if (data.settings) {
              applyRemoteRef.current(data.settings);
            } else {
              callRemoteSync(data);
            }
          }
        };
      } catch {
        // BroadcastChannel unsupported or blocked
      }
    }

    window.addEventListener('dayrhythm:ws-sync', handleNativeWsSync);

    return () => {
      window.removeEventListener('dayrhythm:ws-sync', handleNativeWsSync);
      bc?.close();
    };
  }, [callRemoteSync]);

  // Requirement 1 & Finding 4: Pure granular patch saving with strict unhydrated write lock
  const saveCloudUserSettingsImmediately = useCallback(
    async (patch?: Partial<UserSettingsPayload>) => {
      // 1. Prepare granular or full payload
      let payload: Partial<UserSettingsPayload>;
      if (patch && Object.keys(patch).length > 0) {
        payload = {
          ...patch,
          originClientId: clientIdRef.current,
          updatedAtMs: Date.now(),
        };
        Object.assign(payload, {
          schemaVersion: SCHEMA_VERSION,
          medicationsUpdatedAt: loadMedicationsUpdatedAt() || Date.now(),
          deletedMedicationIds: loadDeletedMedicationIds(),
        });
      } else {
        // Full rhythm snapshot only when explicitly called without patch
        const todayEntry = hydrationHistory[hydrationHistory.length - 1];
        const currentProfile = lifeProfileRef.current || lifeProfile;
        const remoteTz = currentProfile.currentTimeZone || 'Africa/Cairo';
        const todayIso = getDateIsoInTimeZone(remoteTz);
        payload = {
          hydrationDateKey: todayIso,
          cupsLogged: todayEntry?.cupsLogged ?? 0,
          targetCups: todayEntry?.targetCups ?? 13,
          hydrationWeeklyCounts: hydrationHistory.map((d) => d.cupsLogged),
          hydrationSlotOpIds: todayEntry?.slotOpIds ?? [],
          hydrationRemovedOpIds: todayEntry?.removedOpIds ?? [],
          hydrationUpdatedAtMs: todayEntry?.hydrationUpdatedAtMs ?? Date.now(),
          dailyCommitmentDays: streaks.dailyCommitmentDays,
          dailyCommitmentDoneToday: streaks.dailyCommitmentDoneToday,
          waterTargetDays: streaks.waterTargetDays,
          waterTargetDoneToday: streaks.waterTargetDoneToday,
          quietMode,
          adhanOverrideSilent,
          sanctuaryOverrideUntilMs,
          surfaceTheme,
          deviceSettings,
          lifeProfile: currentProfile,
          medications,
          creativeActivities,
          memories,
          originClientId: clientIdRef.current,
          completedOverrides,
          fastingOverride,
          isFridayMode,
          includeBiweeklyPcCleanup,
          travelState,
          pomodoro,
          periodicRituals,
          appSettings: {
            ...appSettingsRef.current,
          },
          uiPrefs: sanitizeUiPrefs({
            selectedLogoId,
            capsuleOrientation: capsulePrefs.orientation,
            capsuleSize: capsulePrefs.size,
            cloudApiUrl: getSavedCloudApiUrl() || undefined,
          }),
          updatedAtMs: Date.now(),
        };
        Object.assign(payload, {
          schemaVersion: SCHEMA_VERSION,
          medicationsUpdatedAt: loadMedicationsUpdatedAt() || Date.now(),
          deletedMedicationIds: loadDeletedMedicationIds(),
        });
      }

      // 2. Protocol 1 & 2: Broadcast immediately over LAN (< 50ms) & Cross-Tab BroadcastChannel
      const broadcastPacket = {
        type: 'settings_update',
        settings: payload,
        clientId: clientIdRef.current,
        timestampMs: Date.now(),
      };



      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('dayrhythm_sync');
          bc.postMessage(broadcastPacket);
          bc.close();
        } catch {
          // ignore
        }
      }

      // Coalescing burst limiter: never drop writes on rapid taps; queue & flush tail patch after 1.2s
      const nowBurstMs = Date.now();
      recentCloudWriteTimestampsRef.current = recentCloudWriteTimestampsRef.current.filter(
        (ts) => nowBurstMs - ts < 4000
      );
      if (recentCloudWriteTimestampsRef.current.length >= 6) {
        pendingBurstPatchRef.current = {
          ...(pendingBurstPatchRef.current || {}),
          ...payload,
          updatedAtMs: nowBurstMs,
        };
        if (pendingBurstFlushTimerRef.current === null) {
          pendingBurstFlushTimerRef.current = window.setTimeout(() => {
            pendingBurstFlushTimerRef.current = null;
            const queued = pendingBurstPatchRef.current;
            pendingBurstPatchRef.current = null;
            if (queued) {
              void saveCloudUserSettingsRef.current(queued);
            }
          }, 1200);
        }
        return;
      }
      recentCloudWriteTimestampsRef.current.push(nowBurstMs);

      // 2.5 Native Android SQLite WAL (<1ms) + Cloudflare DO Binary Protobuf WebSocket (<35ms)
      const mergedFullState = {
        ...lastSpircFullStateRef.current,
        ...(payload as unknown as Record<string, unknown>),
      };
      lastSpircFullStateRef.current = mergedFullState;
      persistToNativeSqlite(
        'state_v3',
        SPIRC_ENTITY.STATE_V3,
        nowBurstMs,
        clientIdRef.current,
        nowBurstMs,
        false,
        mergedFullState
      );
      const sentViaSpirc = spircClusterRef.current?.sendJsonState(
        'state_v3',
        SPIRC_ENTITY.STATE_V3,
        SPIRC_ACTION.UPSERT,
        mergedFullState
      );

      // Ultra-low-latency real-time live signal (<100ms) over Google Cloud Firestore (fallback when Spirc WS is not connected)
      const liveUid = firebaseUser?.uid;
      if (!sentViaSpirc && liveUid && !firebaseUser.isAnonymous) {
        const liveOpId = `live_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        void emitCloudLiveSignal(liveUid, {
          opId: liveOpId,
          clientId: clientIdRef.current,
          timestampMs: Date.now(),
          type: 'settings_patch',
          patch: payload,
        });
      }

      // 3. Cloud (Firestore) persistence guard:
      if (isLoadingSettingsRef.current || !hasHydratedRemoteRef.current) {
        console.warn('[CloudSync] Write queued: settings are currently unhydrated or loading from cloud.');
        if (patch) {
          pendingPatchesBeforeHydrationRef.current.push(patch);
        }
        return;
      }

      const uid = firebaseUser?.uid;
      if (!uid || firebaseUser?.isAnonymous) return;

      try {
        const ok = await saveCloudUserSettings(uid, payload);
        if (ok) {
          setFirestoreSynced(true);
          try {
            // Only record the fields this write actually carried. Sanitizing the raw partial
            // patch used to fill every ABSENT key with its default (cupsLogged 0, quietMode
            // 'normal', a default lifeProfile...) and overwrite the real known server values, so
            // the push effect below kept seeing "changes" that never happened and rewrote them
            // again — an endless Firestore write <-> snapshot loop that ballooned RAM.
            const present = payload as unknown as Record<string, unknown>;
            const sanitizedFull = sanitizeRhythmPayload(
              payload as SyncedRhythmPayload
            ) as unknown as Record<string, unknown>;
            const updatedFields: Record<string, string> = {};
            for (const group of RHYTHM_FIELD_GROUPS) {
              for (const key of group) {
                if (present[key] !== undefined) {
                  updatedFields[key] = JSON.stringify(sanitizedFull[key] ?? null);
                }
              }
            }
            lastServerFieldsRef.current = {
              ...lastServerFieldsRef.current,
              ...updatedFields,
            };
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.error('[CloudSync] saveCloudUserSettings error:', err);
      }
    },
    [
      firebaseUser?.uid,
      firebaseUser?.isAnonymous,
      hydrationHistory,
      lifeProfile,
      streaks,
      quietMode,
      quietUntilTs,
      adhanOverrideSilent,
      surfaceTheme,
      deviceSettings,
      medications,
      creativeActivities,
      memories,
      phoneChargeLimitPct,
      smartChargeAlertEnabled,
      smartChargeKeepUntilUnplugged,
      waterRemindersEnabled,
      sunMode,
      selectedLogoId,
      capsulePrefs,
    ]
  );

  const pushToTasksVaultImmediately = saveCloudUserSettingsImmediately;
  saveCloudUserSettingsRef.current = saveCloudUserSettingsImmediately;

  useEffect(() => {
    pushToTasksVaultRef.current = saveCloudUserSettingsImmediately;
  }, [saveCloudUserSettingsImmediately]);

  const applyOrDeferRef = useRef(applyOrDefer);
  useEffect(() => {
    applyOrDeferRef.current = applyOrDefer;
  }, [applyOrDefer]);

  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  // Connect to Cloudflare Durable Objects Binary Protobuf WebSocket + hydrate Native SQLite WAL on boot
  useEffect(() => {
    const cachedRows = loadFromNativeSqlite();
    const stateRow = cachedRows.find((r) => r.entityId === 'state_v3' && !r.deleted);
    if (stateRow?.payload && typeof stateRow.payload === 'object') {
      applyOrDeferRef.current(stateRow.payload as unknown as SyncedRhythmPayload);
    }

    const uid =
      firebaseUser?.uid ||
      authUser?.uid ||
      auth.currentUser?.uid ||
      localStorage.getItem(ACTIVE_UID_STORAGE_KEY) ||
      '';
    const workerUrl = getSavedCloudApiUrl();
    if (!uid || !workerUrl) {
      spircClusterRef.current?.close();
      spircClusterRef.current = null;
      return;
    }

    const handle = connectSpircCluster(workerUrl, uid, clientIdRef.current, (entityId, entityKind, payload, frame) => {
      // Phone battery telemetry (<35ms) — drives the PC dashboard card and the floating capsule.
      if (frame.action === SPIRC_ACTION.BATTERY_TELEMETRY || entityId === 'phone_battery') {
        const incoming = sanitizePhoneBattery(payload);
        if (incoming) setPhoneBattery(incoming);
        return;
      }

      if (frame.action === SPIRC_ACTION.DISMISS_ALARM || entityId === 'alarm_dismiss') {
        // Shared opId with the Firestore echo so a single dismiss is processed exactly once.
        const spOpId =
          (typeof payload.opId === 'string' && payload.opId) ||
          frame.opId ||
          `spirc_dism_${frame.timestampMs}_${frame.clientId}`;
        if (!seenSyncOpIdsRef.current.has(spOpId)) {
          seenSyncOpIdsRef.current.add(spOpId);
          if (seenSyncOpIdsRef.current.size > 200) seenSyncOpIdsRef.current.clear();
          stopContinuousAlert();
          stopSmartChargeCompleteAlert();
          stopNativeAlerts();
          setSmartChargeAudioActive(false);
          setActiveAudioAlert(null);
          setPersistentAlert(null);
          setAlarmRinging(false);
          const remoteAction = typeof payload.action === 'string' ? payload.action : '';
          if (remoteAction === 'water_confirmed') {
            const waterOpId =
              (typeof payload.waterOpId === 'string' && payload.waterOpId) ||
              spOpId;
            const dateKey =
              typeof payload.hydrationDateKey === 'string' ? payload.hydrationDateKey : undefined;
            handleLogWaterCupRef.current({ fromRemote: true, waterOpId, dateKey });
          } else if (remoteAction === 'medication_confirmed' || remoteAction === 'med_confirmed') {
            const medId = (payload.medicationId as string) || (payload.medId as string);
            const doseTime = (payload.doseTime24 as string) || (payload.doseTime as string);
            if (medId && medId !== 'all' && medId !== 'medication') {
              handleToggleMedicationRef.current(medId, doseTime, { fromRemote: true });
            }
          }
          showToastRef.current('🔕 تم إيقاف التنبيه فورياً من جهازك الآخر ✓');
        }
        return;
      }

      // Trigger frames reach us from the phone (and from other desktop tabs) only through Spirc now.
      if (
        frame.action === SPIRC_ACTION.UPSERT &&
        (entityKind === SPIRC_ENTITY.ALARM || entityId === 'alarm_trigger')
      ) {
        const senderId =
          (typeof payload.clientId === 'string' && payload.clientId) || frame.clientId;
        if (senderId === clientIdRef.current) return;
        const startedMs = Number(payload.startedAtMs || frame.timestampMs || Date.now());
        if (Math.abs(Date.now() - startedMs) <= 300_000) {
          window.dispatchEvent(new CustomEvent('dayrhythm:cloud-alert-trigger', { detail: payload }));
        }
        return;
      }

      if (entityId === 'state_v3' || entityKind === SPIRC_ENTITY.STATE_V3) {
        isLoadingSettingsRef.current = true;
        try {
          applyOrDeferRef.current(payload as unknown as SyncedRhythmPayload);
        } finally {
          window.setTimeout(() => {
            isLoadingSettingsRef.current = false;
          }, 150);
        }
      }
    });
    spircClusterRef.current = handle;
    return () => {
      handle.close();
      if (spircClusterRef.current === handle) spircClusterRef.current = null;
    };
  }, [firebaseUser?.uid, authUser?.uid]);

  // Requirement 3 & Spotify Connect: Real-time active_alarms listener with poison-pill prevention
  useEffect(() => {
    const uid =
      firebaseUser?.uid ||
      authUser?.uid ||
      auth.currentUser?.uid ||
      localStorage.getItem(ACTIVE_UID_STORAGE_KEY) ||
      '';
    if (!uid || (!firebaseUser && !auth.currentUser)) return;

    void cleanupExpiredActiveAlarms(uid);

    const unsubscribe = subscribeToActiveAlarms(
      uid,
      (alarms) => {
        // Match dismissal: if ANY alert was dismissed by another device, stop native alert & sound immediately
        const relevantDismissal = alarms.find((a) => {
          if (a.status !== 'dismissed') return false;
          if (a.dismissedByClientId === clientIdRef.current) return false;
          if (handledDismissedAlarmIdsRef.current.has(a.id)) return false;
          return true;
        });

        if (relevantDismissal) {
          handledDismissedAlarmIdsRef.current.add(relevantDismissal.id);
          console.info('[CloudSync] Real-time remote alarm dismissed:', relevantDismissal.id, 'by:', relevantDismissal.dismissedByClientId);
          stopContinuousAlert();
          stopSmartChargeCompleteAlert();
          stopNativeAlerts();
          setSmartChargeAudioActive(false);
          setActiveAudioAlert(null);
          setPersistentAlert(null);
          setAlarmRinging(false);
        }
      },
      (err) => {
        console.warn('[CloudSync] active_alarms listener error:', err);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [firebaseUser?.uid, authUser?.uid, stopNativeAlerts]);

  // Requirement 2 & Spotify Connect: Real-time listener for users/{uid} root document and live bus
  // 1) Catches Android background lock-screen alarm dismissals via syncSignal.
  // 2) Streams live settings/rhythm updates across devices live (<100ms).
  useEffect(() => {
    const uid =
      firebaseUser?.uid ||
      authUser?.uid ||
      auth.currentUser?.uid ||
      localStorage.getItem(ACTIVE_UID_STORAGE_KEY) ||
      '';
    if (!uid || (!firebaseUser && !auth.currentUser)) return;

    const unsubscribe = subscribeToUserDocument(
      uid,
      (remote) => {
        // A) Cross-device syncSignal (Alarm dismiss, Calendar, Tasks, Native Done)
        const sig = remote.syncSignal;
        if (sig && sig.clientId !== clientIdRef.current) {
          if (sig.scope === 'alarm_dismiss') {
            const sigTs = sig.timestampMs || 0;
            const isFresh = sigTs > 0 && Math.abs(Date.now() - sigTs) <= 300_000;
            const sigOpId = sig.opId || `dism_${sigTs}_${sig.clientId}`;
            if (isFresh && !seenSyncOpIdsRef.current.has(sigOpId)) {
              seenSyncOpIdsRef.current.add(sigOpId);
              if (seenSyncOpIdsRef.current.size > 200) seenSyncOpIdsRef.current.clear();
              console.info('[CloudSync] Remote alarm dismiss signal received:', sig.action);
              stopContinuousAlert();
              stopSmartChargeCompleteAlert();
              stopNativeAlerts();
              setSmartChargeAudioActive(false);
              setActiveAudioAlert(null);
              setPersistentAlert(null);
              setAlarmRinging(false);

              if (sig.action === 'water_confirmed' || (sig.extra as any)?.kind === 'water') {
                const extraW = sig.extra as Record<string, unknown> | undefined;
                const waterOpId =
                  (typeof extraW?.waterOpId === 'string' && extraW.waterOpId) ||
                  sigOpId;
                const dateKey =
                  typeof extraW?.hydrationDateKey === 'string' ? extraW.hydrationDateKey : undefined;
                handleLogWaterCupRef.current({ fromRemote: true, waterOpId, dateKey });
              } else if (sig.action === 'medication_confirmed' || sig.action === 'med_confirmed' || (sig.extra as any)?.kind === 'medication') {
                const extra = sig.extra as { kind?: string; medId?: string; doseTime?: string; medicationId?: string; doseTime24?: string } | undefined;
                const medId = extra?.medId || extra?.medicationId;
                const doseTime = extra?.doseTime || extra?.doseTime24;
                if (medId) {
                  handleToggleMedicationRef.current(medId, doseTime, { fromRemote: true });
                }
              }
            }
          } else {
            // Forward calendar, tasks, workspace sync signals across devices in real time!
            handleIncomingRemoteSyncRef.current(sig);
          }
        }

        // B) Real-time settings & rhythm live sync from other devices
        const remoteOrigin = remote.originClientId || (remote as any).clientId;
        if (remoteOrigin && remoteOrigin === clientIdRef.current) {
          // Never re-apply our own writes!
          return;
        }
        applyOrDeferRef.current(remote as SyncedRhythmPayload & {
          medications?: MedicationItem[];
          creativeActivities?: CreativeActivityItem[];
          memories?: MemoryItem[];
        });
      },
      (err) => {
        console.warn('[CloudSync] subscribeToUserDocument error:', err);
      }
    );

    // Fast real-time cloud pub/sub live signal listener (<100ms) for all interactive buttons
    const unsubscribeLive = subscribeToCloudLiveSignals(
      uid,
      (signal) => {
        if (!signal) {
          return;
        }
        const rawSender =
          (signal as unknown as { originDeviceId?: string }).originDeviceId ||
          signal.originClientId ||
          (signal as unknown as { dismissedByDeviceId?: string }).dismissedByDeviceId ||
          signal.dismissedBy ||
          signal.clientId;
        if (rawSender && rawSender === clientIdRef.current) {
          return;
        }
        const sigOp = signal.opId || signal.sessionId;
        if (sigOp) {
          if (seenSyncOpIdsRef.current.has(sigOp)) return;
          seenSyncOpIdsRef.current.add(sigOp);
          if (seenSyncOpIdsRef.current.size > 150) {
            const oldest = seenSyncOpIdsRef.current.values().next().value;
            if (oldest) seenSyncOpIdsRef.current.delete(oldest);
          }
        }

        // 1. Alarm dismissal fast-path (<100ms) — Spotify Connect Session Status
        if (signal.status === 'dismissed' || signal.type === 'alarm_dismiss') {
          const dismissedBy =
            (signal as unknown as { dismissedByDeviceId?: string }).dismissedByDeviceId ||
            signal.dismissedBy ||
            signal.clientId;
          if (dismissedBy === clientIdRef.current) {
            return;
          }
          const dismissTs =
            (signal as unknown as { dismissedAtMs?: number }).dismissedAtMs ||
            signal.timestampMs ||
            0;
          if (!dismissTs || Math.abs(Date.now() - dismissTs) > 300_000) {
            return;
          }
          const dismissOpId = signal.opId || `live_dism_${dismissTs}_${dismissedBy}`;
          if (!sigOp && seenSyncOpIdsRef.current.has(dismissOpId)) {
            return;
          }
          seenSyncOpIdsRef.current.add(dismissOpId);
          if (seenSyncOpIdsRef.current.size > 200) seenSyncOpIdsRef.current.clear();
          stopContinuousAlert();
          stopSmartChargeCompleteAlert();
          stopNativeAlerts();
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate(0);
            } catch {
              // ignore
            }
          }
          setSmartChargeAudioActive(false);
          setActiveAudioAlert(null);
          setPersistentAlert(null);
          setAlarmRinging(false);
          const extraDismiss = (signal.extra as { blockId?: string; extra?: { blockId?: string } } | undefined);
          const blockId = signal.blockId || extraDismiss?.blockId || extraDismiss?.extra?.blockId;
          if (blockId) {
            acknowledgedBlockIdsRef.current.add(blockId);
            setCompletedOverrides((prev) => ({
              ...prev,
              [blockId]: true,
            }));
          }
          const action = signal.action || (signal.extra as any)?.action;
          if (action === 'water_confirmed') {
            const extraW = signal.extra as Record<string, unknown> | undefined;
            const waterOpId =
              (typeof extraW?.waterOpId === 'string' && extraW.waterOpId) ||
              dismissOpId;
            const dateKey =
              typeof extraW?.hydrationDateKey === 'string' ? extraW.hydrationDateKey : undefined;
            handleLogWaterCupRef.current({ fromRemote: true, waterOpId, dateKey });
          } else if (action === 'medication_confirmed' || action === 'med_confirmed') {
            const extra = signal.extra as Record<string, unknown> | undefined;
            const medId = (extra?.medicationId as string) || (extra?.medId as string) || signal.alertId;
            const doseTime = (extra?.doseTime24 as string) || (extra?.doseTime as string);
            if (medId && medId !== 'all' && medId !== 'medication') {
              handleToggleMedicationRef.current(medId, doseTime, { fromRemote: true });
            }
          }
          showToastRef.current('🔕 تم إيقاف التنبيه فورياً من جهازك الآخر ✓');
          return;
        }

        // 2. Alarm trigger fast-path (<100ms) — Spotify Connect Session Status
        if (signal.status === 'ringing' || signal.type === 'alarm_trigger') {
          const origin =
            (signal as unknown as { originDeviceId?: string }).originDeviceId ||
            signal.originClientId ||
            signal.clientId;
          if (origin === clientIdRef.current || signal.clientId === clientIdRef.current) {
            return;
          }

          // STALE CHECK: Tolerant to clock skews between PC and Mobile (up to 5m)
          const startTs =
            (signal as unknown as { originTimestampMs?: number }).originTimestampMs ||
            signal.startedAtMs ||
            signal.timestampMs ||
            0;
          if (!startTs || Math.abs(Date.now() - startTs) > 300_000) {
            return;
          }

          const opId = signal.opId || signal.sessionId;
          if (opId) {
            if (seenSyncOpIdsRef.current.has(opId)) return;
            seenSyncOpIdsRef.current.add(opId);
            if (seenSyncOpIdsRef.current.size > 150) {
              const oldest = seenSyncOpIdsRef.current.values().next().value;
              if (oldest) seenSyncOpIdsRef.current.delete(oldest);
            }
          }

          const extra = (signal.extra as { extra?: Record<string, unknown> })?.extra || signal.extra || {};
          const title = signal.title || (extra as Record<string, unknown>).title as string || 'تنبيه إيقاع اليوم';
          const body = signal.body || (extra as Record<string, unknown>).body as string || '';
          const kind = (signal.kind || (extra as Record<string, unknown>).kind || 'general') as TaskSoundCategory;
          const blockId = signal.blockId || (extra as Record<string, unknown>).blockId as string | undefined;

          handleIncomingRemoteSyncRef.current({
            scope: 'alarm_trigger',
            action: signal.action || 'ring',
            extra: {
              title,
              body,
              kind,
              blockId,
              ...(extra as Record<string, unknown>),
            },
            clientId: signal.clientId,
            opId,
          });
          return;
        }

        // 3. Settings / Button changes patch (<100ms)
        if (signal.patch && Object.keys(signal.patch).length > 0) {
          applyOrDeferRef.current(signal.patch as SyncedRhythmPayload & {
            medications?: MedicationItem[];
            creativeActivities?: CreativeActivityItem[];
            memories?: MemoryItem[];
          });
        }

        // 4. Any extra workspace signal forwarding (<100ms)
        if (signal.extra) {
          const extra = signal.extra as {
            scope?: string;
            action?: string;
            undoSnapshot?: DeletedWorkspaceSnapshot;
            extra?: Record<string, unknown>;
          };
          if (extra.scope && extra.scope !== 'alarm_dismiss' && extra.scope !== 'alarm_trigger') {
            handleIncomingRemoteSyncRef.current({
              scope: extra.scope,
              action: extra.action,
              undoSnapshot: extra.undoSnapshot,
              extra: extra.extra,
              clientId: signal.clientId,
              opId: signal.opId,
            });
          }
        }
      },
      (err) => {
        console.warn('[CloudLiveSync] subscribeToCloudLiveSignals error:', err);
      }
    );

    return () => {
      unsubscribe();
      unsubscribeLive();
    };
  }, [firebaseUser?.uid, authUser?.uid, stopNativeAlerts]);

  // Requirement 1 & Finding 3: Load user settings from cloud with strict priority over defaults & offline protection
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid || firebaseUser?.isAnonymous) {
      setIsLoadingSettings(false);
      isLoadingSettingsRef.current = false;
      hasHydratedRemoteRef.current = true;
      return;
    }

    let isMounted = true;
    setIsLoadingSettings(true);
    isLoadingSettingsRef.current = true;

    async function loadCloudSettings() {
      try {
        console.info('[CloudSync] Loading settings for uid:', uid);
        const cloudData = await fetchCloudUserSettings(uid!);
        if (!isMounted) return;

        if (cloudData) {
          console.info('[CloudSync] Applying cloud settings with priority for uid:', uid);
          applyOrDefer(cloudData as any);
          try {
            lastServerFieldsRef.current = serializeRhythmFields(sanitizeRhythmPayload(cloudData as SyncedRhythmPayload));
          } catch {
            // ignore
          }
          hasHydratedRemoteRef.current = true;
          setFirestoreReady(true);
          setFirestoreSynced(true);
        } else {
          console.info('[CloudSync] No cloud settings doc found yet. Keeping existing profile.');
          hasHydratedRemoteRef.current = true;
          setFirestoreReady(true);
          setFirestoreSynced(true);
        }

        // Flush any queued writes that occurred while hydrating
        if (pendingPatchesBeforeHydrationRef.current.length > 0) {
          const queued = [...pendingPatchesBeforeHydrationRef.current];
          pendingPatchesBeforeHydrationRef.current = [];
          for (const patch of queued) {
            void saveCloudUserSettingsImmediately(patch);
          }
        }

        // Send cloud auth to Android Native bridge
        try {
          const authPayload = getNativeCloudAuthPayload();
          const nativeBridge = (
            window as Window & { DayRhythmNative?: { setCloudAuth?: (json: string) => void } }
          ).DayRhythmNative;
          if (authPayload && nativeBridge?.setCloudAuth) {
            nativeBridge.setCloudAuth(authPayload);
          }
        } catch (e) {
          console.warn('[CloudSync] Bridge setCloudAuth error:', e);
        }

        // Clean up legacy "[DayRhythm Sync Vault]" list from Google Tasks
        try {
          const token = await getOrRefreshCalendarAccessToken();
          if (token) {
            void deleteTasksVaultListIfPresent(token);
          }
        } catch {
          // ignore
        }
      } catch (err) {
        console.error('[CloudSync] Error fetching cloud settings (offline or network failure). Keeping cloud write lock ARMED:', err);
        // CRITICAL (Finding 3): Do NOT set hasHydratedRemoteRef.current = true here!
        // This ensures that local default values are NEVER written over remote cloud settings on offline boot.
      } finally {
        if (isMounted) {
          setIsLoadingSettings(false);
          isLoadingSettingsRef.current = false;
        }
      }
    }

    void loadCloudSettings();

    return () => {
      isMounted = false;
    };
  }, [firebaseUser?.uid, firebaseUser?.isAnonymous, applyOrDefer]);

  useEffect(() => {
    try {
      localStorage.setItem(MEDS_STORAGE_KEY, JSON.stringify(medications));
    } catch {
      // ignore storage errors
    }
  }, [medications]);

  useEffect(() => {
    try {
      localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(creativeActivities));
    } catch {
      // ignore storage errors
    }
  }, [creativeActivities]);

  useEffect(() => {
    try {
      localStorage.setItem(WATER_REMINDER_STORAGE_KEY, String(waterRemindersEnabled));
    } catch {
      // ignore storage errors
    }
  }, [waterRemindersEnabled]);

  const handleToggleWaterReminders = useCallback(() => {
    const next = !appSettingsRef.current.waterRemindersEnabled;
    showToast(
      next
        ? '🔔 تم تفعيل تنبيهات كل كوب ماء تلقائياً حسب جدولك العلمي'
        : '🔕 تم إيقاف تنبيهات أكواب الماء مؤقتاً'
    );
    updateAppSettings({ waterRemindersEnabled: next });
  }, [showToast, updateAppSettings]);

  const handleRequestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      showToast('المتصفح لا يدعم إشعارات النظام — ستعمل التنبيهات الصوتية داخل التطبيق');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        setWaterRemindersEnabled(true);
        showToast('🔔 تم تفعيل إشعارات النظام لكل كوب ماء وجرعة علاج بنجاح ✓');
      } else {
        showToast('تم رفض إشعارات المتصفح — ستظل التنبيهات الصوتية تعمل داخل التطبيق');
      }
    } catch {
      showToast('تعذر طلب صلاحية الإشعارات — ستعمل التنبيهات الصوتية داخل التطبيق');
    }
  }, [showToast]);

  useEffect(() => {
    try {
      localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(memories));
    } catch {
      // ignore storage errors
    }
  }, [memories]);

  // Continuous Auto-Save to Google Drive appDataFolder (Single Account Source of Truth)
  useEffect(() => {
    if (!hasHydratedGoogleDriveRef.current) return;

    const timer = window.setTimeout(async () => {
      const token = await getOrRefreshCalendarAccessToken();
      if (!token) return;

      const backup: FullDayRhythmCloudBackup & {
        schemaVersion: number;
        quietUntilTs?: number | null;
        quietModeUpdatedAt?: number;
        sanctuaryOverrideUntilMs?: number;
        travelState?: TravelState;
      } = {
        version: 1,
        schemaVersion: SCHEMA_VERSION,
        updatedAtIso: new Date().toISOString(),
        updatedAtMs: Date.now(),
        lifeProfile,
        medications,
        hydrationHistory,
        creativeActivities,
        memories,
        deviceSettings,
        quietMode,
        quietUntilTs,
        quietModeUpdatedAt: (() => {
          try {
            return Number(localStorage.getItem('dayrhythm_quiet_mode_updated_at_v1') || 0) || Date.now();
          } catch {
            return Date.now();
          }
        })(),
        adhanOverrideSilent,
        sanctuaryOverrideUntilMs,
        waterRemindersEnabled,
        phoneChargeLimitPct,
        smartChargeAlertEnabled,
        smartChargeKeepUntilUnplugged,
        capsulePrefs,
        selectedLogoId,
        travelState,
        chatMessages: chatMessages.slice(-50),
      };

      if (isSavingGoogleDriveRef.current) return;
      isSavingGoogleDriveRef.current = true;
      try {
        const ok = await saveToGoogleDriveAppData(token, backup);
        if (ok) setGoogleDriveSynced(true);
      } finally {
        isSavingGoogleDriveRef.current = false;
      }
    }, 60_000);

    return () => window.clearTimeout(timer);
  }, [
    lifeProfile,
    medications,
    hydrationHistory,
    creativeActivities,
    memories,
    deviceSettings,
    quietMode,
    adhanOverrideSilent,
    sanctuaryOverrideUntilMs,
    waterRemindersEnabled,
    phoneChargeLimitPct,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    capsulePrefs,
    selectedLogoId,
    travelState,
    chatMessages,
  ]);

  // Persist local cache & push changes IMMEDIATELY to Firebase Firestore across devices (zero debounce lag)
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ hydrationHistory, deviceSettings, lifeProfile })
      );
    } catch {
      // ignore quota errors
    }

    if (isLoadingSettingsRef.current || !hasHydratedRemoteRef.current) {
      return;
    }

    const todayEntry = hydrationHistory[hydrationHistory.length - 1];
    if (!todayEntry) return;

    const payload: TasksVaultPayload & {
      quietUntilTs?: number | null;
      quietModeUpdatedAt?: number;
    } = {
      updatedAtMs: Date.now(),
      originClientId: clientIdRef.current,
      hydrationDateKey: getDateIsoInTimeZone(activeTimeZone),
      cupsLogged: todayEntry.cupsLogged,
      targetCups: todayEntry.targetCups,
      hydrationWeeklyCounts: hydrationHistory.map((d) => d.cupsLogged),
      hydrationSlotOpIds: todayEntry.slotOpIds ?? [],
      hydrationRemovedOpIds: todayEntry.removedOpIds ?? [],
      hydrationUpdatedAtMs: todayEntry.hydrationUpdatedAtMs ?? 0,
      dailyCommitmentDays: streaks.dailyCommitmentDays,
      dailyCommitmentDoneToday: streaks.dailyCommitmentDoneToday,
      waterTargetDays: streaks.waterTargetDays,
      waterTargetDoneToday: streaks.waterTargetDoneToday,
      quietMode,
      quietUntilTs,
      quietModeUpdatedAt: (() => {
        try {
          return Number(localStorage.getItem('dayrhythm_quiet_mode_updated_at_v1') || 0) || Date.now();
        } catch {
          return Date.now();
        }
      })(),
      adhanOverrideSilent,
      surfaceTheme,
      deviceSettings,
      lifeProfile,
      medications,
      creativeActivities,
      memories,
      appSettings: {
        ...appSettingsRef.current,
      },
      uiPrefs: sanitizeUiPrefs({
        selectedLogoId,
        capsuleOrientation: capsulePrefs.orientation,
        capsuleSize: capsulePrefs.size,
        cloudApiUrl: getSavedCloudApiUrl() || undefined,
      }),
    };

    const localFields = serializeRhythmFields(sanitizeRhythmPayload(payload as SyncedRhythmPayload));
    const serverFields = lastServerFieldsRef.current;
    const changedKeys: Array<keyof SyncedRhythmPayload> = [];
    for (const group of RHYTHM_FIELD_GROUPS) {
      if (group.some((key) => localFields[key] !== serverFields[key])) {
        changedKeys.push(...group);
      }
    }
    if (changedKeys.length === 0) return;

    // Only send the granular patch of changed fields to avoid overwriting other devices!
    const patch: Partial<UserSettingsPayload> = {};
    for (const key of changedKeys) {
      (patch as any)[key] = (payload as any)[key];
    }

    // Update local copy of server fields immediately to prevent bounce loops
    lastServerFieldsRef.current = {
      ...lastServerFieldsRef.current,
      ...localFields,
    };

    // Immediately push granular patch for sub-second cross-device sync
    void pushToTasksVaultImmediately(patch);
    setFirestoreSynced(true);
  }, [
    activeTimeZone,
    firebaseUser?.uid,
    firestoreReady,
    hydrationHistory,
    streaks,
    quietMode,
    adhanOverrideSilent,
    surfaceTheme,
    deviceSettings,
    lifeProfile,
    medications,
    creativeActivities,
    memories,
    phoneChargeLimitPct,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    waterRemindersEnabled,
    sunMode,
    includePrayerAnchors,
    selectedLogoId,
    capsulePrefs.orientation,
    capsulePrefs.size,
    cloudPausedUntil,
    pushToTasksVaultImmediately,
  ]);

  const syncUiPrefsCloud = useCallback(
    (nextLogoId?: string, nextCapsule?: Partial<CapsulePrefs>, cloudApiUrlOverride?: string) => {
      const effectiveLogo = nextLogoId || selectedLogoIdRef.current;
      const effectiveCapsule: CapsulePrefs = {
        ...capsulePrefsRef.current,
        ...(nextCapsule || {}),
      };
      const effectiveUrl =
        cloudApiUrlOverride !== undefined ? cloudApiUrlOverride : getSavedCloudApiUrl();
      const clean: UiPrefs = sanitizeUiPrefs({
        selectedLogoId: effectiveLogo,
        capsuleOrientation: effectiveCapsule.orientation,
        capsuleSize: effectiveCapsule.size,
        cloudApiUrl: effectiveUrl || undefined,
      }) ?? {
        selectedLogoId: DEFAULT_LOGO_ID,
        capsuleOrientation: 'horizontal',
        capsuleSize: 'md',
      };
      selectedLogoIdRef.current = clean.selectedLogoId;
      capsulePrefsRef.current = {
        orientation: clean.capsuleOrientation,
        size: clean.capsuleSize,
      };
      void pushToTasksVaultImmediately({ uiPrefs: clean });
    },
    [pushToTasksVaultImmediately]
  );

  const handleSaveCloudApiUrl = useCallback(
    (url: string) => {
      syncUiPrefsCloud(selectedLogoIdRef.current, capsulePrefsRef.current, url);
    },
    [syncUiPrefsCloud]
  );

  // Location is synced dynamically from Mobile GPS (and only updates when moving >= 5 km).

  const handleUpdateCapsulePrefs = useCallback(
    (next: CapsulePrefs) => {
      setCapsulePrefs(next);
      capsulePrefsRef.current = next;
      try {
        window.localStorage.setItem(CAPSULE_PREFS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      syncUiPrefsCloud(undefined, next);
    },
    [syncUiPrefsCloud]
  );

  // Right-click menu on the Windows desktop capsule (DesktopCapsuleForm.cs).
  useEffect(() => {
    const onCapsulePrefs = (ev: Event) => {
      const d = (ev as CustomEvent<{ orientation?: string; size?: string }>).detail || {};
      handleUpdateCapsulePrefs({
        orientation: d.orientation === 'vertical' ? 'vertical' : 'horizontal',
        size: d.size === 'sm' || d.size === 'lg' ? d.size : 'md',
      });
    };
    window.addEventListener('dayrhythm:capsule-prefs', onCapsulePrefs);
    return () => window.removeEventListener('dayrhythm:capsule-prefs', onCapsulePrefs);
  }, [handleUpdateCapsulePrefs]);

  const handleSelectBrandLogo = useCallback(
    (id: string) => {
      setSelectedLogoId(id);
      selectedLogoIdRef.current = id;
      try {
        window.localStorage.setItem(SELECTED_LOGO_STORAGE_KEY, id);
      } catch {
        // ignore storage errors
      }
      syncUiPrefsCloud(id);
      const picked = getLogoConceptById(id);
      if (picked) {
        showToast(`تم تفعيل ومزامنة شعار «${picked.titleAr}» على أجهزتك ✓`);
      }
    },
    [showToast, syncUiPrefsCloud]
  );

  const handleResetBrandLogo = useCallback(() => {
    setSelectedLogoId(DEFAULT_LOGO_ID);
    selectedLogoIdRef.current = DEFAULT_LOGO_ID;
    try {
      window.localStorage.setItem(SELECTED_LOGO_STORAGE_KEY, DEFAULT_LOGO_ID);
    } catch {
      // ignore storage errors
    }
    syncUiPrefsCloud(DEFAULT_LOGO_ID);
    showToast('تمت العودة للشعار الافتراضي (أفق الشروق الزجاجي) ومزامنته ✓');
  }, [showToast, syncUiPrefsCloud]);

  const handleChangeFastingOverride = useCallback(
    (next: 'auto' | 'fasting' | 'normal') => {
      setFastingOverride(next);
      void pushToTasksVaultImmediately({ fastingOverride: next });
    },
    [pushToTasksVaultImmediately]
  );

  const handleToggleSurfaceTheme = useCallback(
    (theme: SurfaceTheme) => {
      surfaceThemeRef.current = theme;
      setSurfaceTheme(theme);
      try {
        localStorage.setItem(SURFACE_THEME_STORAGE_KEY, theme);
      } catch {
        // ignore
      }
      void pushToTasksVaultImmediately({ surfaceTheme: theme });
    },
    [pushToTasksVaultImmediately]
  );

  const handleUpdateDeviceSettings = useCallback(
    (patch: Partial<OnePlusDeviceSettings>) => {
      localWriteLockUntilRef.current = Date.now() + 4000;
      const next = sanitizeDeviceSettings({ ...deviceSettingsRef.current, ...patch });
      deviceSettingsRef.current = next;
      setDeviceSettings(next);
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, deviceSettings: next }));
      } catch {
        // ignore
      }
      void pushToTasksVaultImmediately({ deviceSettings: next });
    },
    [pushToTasksVaultImmediately]
  );

  const handleUpdateLifeProfile = useCallback(
    (patch: Partial<LifeProfile>) => {
      localWriteLockUntilRef.current = Date.now() + 4000;
      const nextProfile = sanitizeLifeProfile({ ...lifeProfileRef.current, ...patch });
      lifeProfileRef.current = nextProfile;
      setLifeProfile(nextProfile);
      try {
        const currentRaw = localStorage.getItem(STORAGE_KEY);
        const current = currentRaw ? JSON.parse(currentRaw) : {};
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...current, lifeProfile: nextProfile })
        );
      } catch {
        // ignore storage quota
      }
      showToast('تم حفظ وتحديث «الدستور الشخصي» ومزامنته سحابياً ✓');
      void pushFullCloudBackupImmediately(undefined, { lifeProfile: nextProfile });
      void pushToTasksVaultImmediately({ lifeProfile: nextProfile });
    },
    [showToast, pushFullCloudBackupImmediately, pushToTasksVaultImmediately]
  );

  // Auto-migrate user profile from old 170cm to new 177cm
  // Legitimate user heightCm values (including 170 cm) are preserved without forced overrides.

  const handleQuickUpdateWeight = useCallback(
    (nextWeightKg: number) => {
      const clamped = Math.max(35, Math.min(220, Math.round(nextWeightKg * 2) / 2));
      localWriteLockUntilRef.current = Date.now() + 300;
      const nextProfile = sanitizeLifeProfile({ ...lifeProfileRef.current, weightKg: clamped });
      lifeProfileRef.current = nextProfile;
      setLifeProfile(nextProfile);
      try {
        const currentRaw = localStorage.getItem(STORAGE_KEY);
        const current = currentRaw ? JSON.parse(currentRaw) : {};
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...current, lifeProfile: nextProfile })
        );
      } catch {
        // ignore storage quota
      }
      showToast(`⚖️ تم تحديث الوزن إلى ${clamped} كجم وإعادة حساب الماء تلقائياً`);
      void pushFullCloudBackupImmediately(undefined, { lifeProfile: nextProfile });
      void pushToTasksVaultImmediately({ lifeProfile: nextProfile });
    },
    [showToast, pushFullCloudBackupImmediately, pushToTasksVaultImmediately]
  );

  const handleToggleLowEnergyToday = useCallback(() => {
    const todayIso = getDateIsoInTimeZone(activeTimeZone);
    const nextActive = lifeProfile.lowEnergyDateKey !== todayIso;
    const nextProfile = updateLifeProfileLocal((prev) =>
      sanitizeLifeProfile({
        ...prev,
        lowEnergyDateKey: nextActive ? todayIso : '',
      })
    );
    void saveCloudUserSettingsImmediately({ lifeProfile: nextProfile });
    void pushFullCloudBackupImmediately(undefined, { lifeProfile: nextProfile });
    showToast(
      nextActive
        ? '🌿 تم تفعيل وضع اليوم الهادئ — الصلاة والنوم محميان ويمكنك تنسيق أي تأجيل مع Gemini'
        : '✓ تم إنهاء وضع اليوم الهادئ وعاد الإيقاع العادي'
    );
  }, [activeTimeZone, lifeProfile.lowEnergyDateKey, pushFullCloudBackupImmediately, saveCloudUserSettingsImmediately, showToast, updateLifeProfileLocal]);

  const handleUpdateSoundRepeat = useCallback(
    (category: TaskSoundCategory, setting: SoundRepeatSetting) => {
      updateLifeProfileLocal((prev) => {
        const nextRepeats = sanitizeSoundRepeats({
          ...(prev.soundRepeats ?? DEFAULT_SOUND_REPEATS),
          [category]: setting,
        });
        return sanitizeLifeProfile({
          ...prev,
          soundRepeats: nextRepeats,
        });
      });
      const label = TASK_SOUND_META[category].labelAr;
      showToast(
        setting === 'continuous'
          ? `🔊 «${label}»: رنين مستمر حتى الإيقاف ✓`
          : `🔊 «${label}»: تكرار الرنين ${setting}× ✓`
      );
    },
    [showToast]
  );

  const handleLogSleepQuality = useCallback(
    (mode: 'good' | 'short_30' | 'short_60' | 'reset') => {
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      if (mode === 'reset') {
        updateLifeProfileLocal((prev) =>
          sanitizeLifeProfile({
            ...prev,
            sleepDebtMinutes: 0,
            sleepDebtLogDateKey: todayIso,
          })
        );
        triggerHapticWaveform('water_cup');
        showToast('😴 تم تصفير رصيد النوم — نومك متوازن الآن ✓');
        return;
      }
      if (mode === 'good') {
        const currentDebt = lifeProfile.sleepDebtMinutes;
        const paidBack =
          currentDebt > 0
            ? Math.min(currentDebt, Math.max(dailyRhythmPlan.nightlyRecoveryMin, 30))
            : 0;
        const nextDebt = Math.max(0, currentDebt - paidBack);
        updateLifeProfileLocal((prev) =>
          sanitizeLifeProfile({
            ...prev,
            sleepDebtMinutes: nextDebt,
            sleepDebtLogDateKey: todayIso,
          })
        );
        triggerHapticWaveform('water_cup');
        showToast(
          paidBack > 0
            ? nextDebt === 0
              ? '✨ ممتاز! تم تعويض رصيد النوم بالكامل وعاد نومك لوضعه الطبيعي ✓'
              : `✨ ممتاز! تم تعويض ${paidBack} د من رصيد النوم — المتبقي ${nextDebt} د`
            : '✨ ممتاز! نومك متوازن اليوم (صفر عجز) ✓'
        );
        return;
      }
      const addMin = mode === 'short_60' ? 60 : 30;
      const nextDebt = Math.min(480, lifeProfile.sleepDebtMinutes + addMin);
      updateLifeProfileLocal((prev) =>
        sanitizeLifeProfile({
          ...prev,
          sleepDebtMinutes: nextDebt,
          sleepDebtLogDateKey: todayIso,
        })
      );
      triggerHapticWaveform('water_cup');
      showToast(
        `🌙 سُجّل نقص ${addMin} د (الإجمالي ${nextDebt} د) — سيُبكّر موعد نوم الليلة تلقائياً للتعويض بهدوء`
      );
    },
    [activeTimeZone, dailyRhythmPlan.nightlyRecoveryMin, lifeProfile.sleepDebtMinutes, showToast]
  );

  const handleOpenAssistantWithPrompt = useCallback(
    (prompt: string) => {
      setPendingAssistantPrompt(prompt);
      handleSelectTab('assistant');
    },
    [handleSelectTab]
  );

  const handleAddMemory = useCallback(
    (input: { category: MemoryCategory; ruleText: string; source?: MemoryItem['source'] }) => {
      const trimmed = input.ruleText.trim();
      if (!trimmed) return;
      const item = sanitizeMemoryItem({
        id: sanitizeMemoryId(`mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
        category: input.category,
        ruleText: trimmed,
        source: input.source ?? 'user',
      });
      setMemories((prev) => {
        const next = [item, ...prev];
        void pushToTasksVaultImmediately({ memories: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      showToast('🧠 تم حفظ القاعدة في ذاكرة Gemini الدائمة (Google Cloud) ✓');
    },
    [pushToTasksVaultImmediately, pushFullCloudBackupImmediately, showToast]
  );

  const handleDeleteMemory = useCallback(
    (id: string) => {
      setMemories((prev) => {
        const next = prev.filter((m) => m.id !== id);
        void pushToTasksVaultImmediately({ memories: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      showToast('تم حذف القاعدة من ذاكرة Gemini الدائمة');
    },
    [pushToTasksVaultImmediately, pushFullCloudBackupImmediately, showToast]
  );

  const handleUpdateMemory = useCallback(
    (id: string, patch: { category: MemoryCategory; ruleText: string }) => {
      const trimmed = patch.ruleText.trim();
      if (!trimmed) return;
      const existing = memories.find((m) => m.id === id);
      if (!existing) return;
      const updatedItem = sanitizeMemoryItem({
        ...existing,
        category: patch.category,
        ruleText: trimmed,
      });
      setMemories((prev) => {
        const next = prev.map((m) => (m.id === id ? updatedItem : m));
        void pushToTasksVaultImmediately({ memories: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      showToast('✏️ تم حفظ تعديل القاعدة في ذاكرة Gemini الدائمة ✓');
    },
    [memories, pushToTasksVaultImmediately, pushFullCloudBackupImmediately, showToast]
  );

  const handleResetChatMode = useCallback(
    (targetMode: 'chat' | 'maps' | 'search') => {
      setChatMessages((prev) => {
        const preserved = prev.filter((m) => m.mode !== targetMode);
        if (targetMode === 'chat') {
          return [WELCOME_MESSAGE, ...preserved];
        }
        return preserved.some((m) => m.mode === 'chat')
          ? preserved
          : [WELCOME_MESSAGE, ...preserved];
      });
    },
    []
  );

  const handleExecuteMemoryActions = useCallback(
    (memoryActions: MemoryActionProposal[]) => {
      setMemories((prev) => {
        let next = [...prev];
        for (const act of memoryActions) {
          if (act.operation === 'remove') {
            const target = next.find(
              (m) =>
                (act.memoryId && m.id === act.memoryId) ||
                m.ruleText.trim() === act.ruleText.trim()
            );
            if (target) {
              next = next.filter((m) => m.id !== target.id);
            }
          } else if (act.operation === 'update' && act.memoryId) {
            const targetIdx = next.findIndex((m) => m.id === act.memoryId);
            if (targetIdx >= 0) {
              const updated = sanitizeMemoryItem({
                ...next[targetIdx],
                category: act.category,
                ruleText: act.ruleText,
              });
              next[targetIdx] = updated;
            }
          } else {
            const existing = next.find((m) => m.ruleText.trim() === act.ruleText.trim());
            if (!existing) {
              const created = sanitizeMemoryItem({
                id: sanitizeMemoryId(
                  act.memoryId || `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
                ),
                category: act.category,
                ruleText: act.ruleText,
                source: 'gemini',
              });
              next = [created, ...next];
            }
          }
        }
        void pushToTasksVaultImmediately({ memories: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleDetectGpsLocation = useCallback(async () => {
    const browserTz =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo';
    const isMobileClient = detectIsMobileDeviceClient();

    const tryIpGeolocationFallback = async (): Promise<boolean> => {
      try {
        const res = await fetch('https://get.geojs.io/v1/ip/geo.json', {
          signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined,
        });
        if (!res.ok) return false;
        const geo = (await res.json()) as {
          latitude?: string | number;
          longitude?: string | number;
          city?: string;
          timezone?: string;
        };
        const lat = Number(geo.latitude);
        const lng = Number(geo.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        const roundedLat = Math.round(lat * 10000) / 10000;
        const roundedLng = Math.round(lng * 10000) / 10000;
        const tz = geo.timezone || browserTz;
        const offlineCity = resolveOfflineCityName(roundedLat, roundedLng, tz);
        const displayCity = geo.city ? `${geo.city}` : offlineCity;
        lastCoordsRef.current = { lat: roundedLat, lng: roundedLng };
        updateLifeProfileLocal((prev) =>
          sanitizeLifeProfile({
            ...prev,
            currentCityName: displayCity,
            currentTimeZone: tz,
            currentLat: roundedLat,
            currentLng: roundedLng,
          })
        );
        setLocationResolutionState('gps_locked');
        showToast(`🌐 تم تحديد موقعك التقريبي (${displayCity}) — وموقع GPS الموبايل يتزامن تلقائياً`);
        void reverseGeocodeCityName(roundedLat, roundedLng, displayCity).then((refined) => {
          if (refined && refined !== displayCity) {
            updateLifeProfileLocal((prev) => sanitizeLifeProfile({ ...prev, currentCityName: refined }));
          }
        });
        return true;
      } catch {
        return false;
      }
    };

    if (!navigator.geolocation) {
      setIsDetectingGps(true);
      const ok = !isMobileClient ? await tryIpGeolocationFallback() : false;
      setIsDetectingGps(false);
      if (!ok) {
        showToast('📱 افتح التطبيق على الموبايل لتحديث GPS وسيتزامن الموقع تلقائياً للكمبيوتر');
      }
      return;
    }

    setIsDetectingGps(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: isMobileClient ? 12000 : 6000,
          maximumAge: 0,
          enableHighAccuracy: isMobileClient,
        });
      });
      const lat = Math.round(pos.coords.latitude * 10000) / 10000;
      const lng = Math.round(pos.coords.longitude * 10000) / 10000;

      const offlineCityName = resolveOfflineCityName(lat, lng, browserTz);
      lastCoordsRef.current = { lat, lng };
      updateLifeProfileLocal((prev) =>
        sanitizeLifeProfile({
          ...prev,
          currentCityName: offlineCityName,
          currentTimeZone: browserTz,
          currentLat: lat,
          currentLng: lng,
        })
      );
      setLocationResolutionState('gps_locked');
      showToast(
        isMobileClient
          ? `📍 تم تحديد موقعك بالـ GPS (${offlineCityName}) ومزامنته تلقائياً للكمبيوتر ✓`
          : `📍 تم تحديد موقعك بالـ GPS وحساب المواقيت بدقة: ${offlineCityName}`
      );

      // Refine exact Arabic town/district name in background when online (non-blocking)
      void reverseGeocodeCityName(lat, lng, offlineCityName).then((refinedName) => {
        if (refinedName && refinedName !== offlineCityName) {
          updateLifeProfileLocal((prev) =>
            sanitizeLifeProfile({
              ...prev,
              currentCityName: refinedName,
            })
          );
        }
      });
    } catch (err: unknown) {
      if (!isMobileClient) {
        const ipOk = await tryIpGeolocationFallback();
        if (ipOk) return;
        showToast('📱 الكمبيوتر لا يملك GPS مباشر — سيتبع تلقائياً آخر موقع GPS من موبايلك');
        return;
      }
      const geoErr = err as { code?: number } | null;
      if (geoErr?.code === 1) {
        showToast('⚠️ يرجى السماح بصلاحية الموقع (GPS) من إعدادات التطبيق على الموبايل لتحديد مدينتك الفعلية.');
      } else {
        showToast('تعذر التقاط إشارة GPS حالياً — تأكد من تفعيل الموقع (Location) على الموبايل.');
      }
    } finally {
      setIsDetectingGps(false);
    }
  }, [showToast]);

  // Continuous live GPS tracking (> 5 km movement automatically updates Prayer, Sunrise, Sunset & Sleep 100% offline)
  const lastCoordsRef = useRef<{ lat: number; lng: number }>({
    lat: lifeProfile.currentLat,
    lng: lifeProfile.currentLng,
  });
  useEffect(() => {
    lastCoordsRef.current = {
      lat: lifeProfile.currentLat,
      lng: lifeProfile.currentLng,
    };
  }, [lifeProfile.currentLat, lifeProfile.currentLng]);

  useEffect(() => {
    if (!lifeProfile.autoLocationSync) return;
    // Mobile is the sole GPS authority; PC inherits coordinates & prayer/solar times from Phone via cloud sync.
    if (!detectIsMobileDeviceClient()) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    let watchId: number | null = null;
    const startWatch = () => {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = Math.round(pos.coords.latitude * 10000) / 10000;
          const lng = Math.round(pos.coords.longitude * 10000) / 10000;
          const prevCoords = lastCoordsRef.current;
          const movedKm = haversineDistanceKm(
            { id: 'prev', nameAr: '', nameEn: '', lat: prevCoords.lat, lng: prevCoords.lng, tzOffsetHours: 2 },
            { id: 'curr', nameAr: '', nameEn: '', lat, lng, tzOffsetHours: 2 }
          );
          if (movedKm < 5) return;

          const browserTz =
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo';
          const cityName = resolveOfflineCityName(lat, lng, browserTz);

          lastCoordsRef.current = { lat, lng };
          updateLifeProfileLocal((prev) =>
            sanitizeLifeProfile({
              ...prev,
              currentCityName: cityName,
              currentTimeZone: browserTz,
              currentLat: lat,
              currentLng: lng,
            })
          );
          showToast(`📍 تم رصد انتقالك تلقائياً (${Math.round(movedKm)} كم) وتحديث المواقيت أوفلاين: ${cityName}`);
          void reverseGeocodeCityName(lat, lng, cityName).then((refined) => {
            if (refined && refined !== cityName) {
              updateLifeProfileLocal((prev) => sanitizeLifeProfile({ ...prev, currentCityName: refined }));
            }
          });
        },
        () => {
          // Silently ignore background watch errors; user can tap location name anytime
        },
        { enableHighAccuracy: false, maximumAge: 180_000, timeout: 12_000 }
      );
    };

    // Only start passive watch if permission is already granted so we don't spam prompts on first load
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((perm) => {
          if (perm.state === 'granted') {
            startWatch();
          }
        })
        .catch(() => {});
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [lifeProfile.autoLocationSync, showToast]);

  // Auto-adapt to a new country/timezone automatically when traveling abroad (Mobile is GPS authority; PC inherits from Phone)
  const autoSyncedTzRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lifeProfile.autoLocationSync) return;
    if (!detectIsMobileDeviceClient()) return;
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserTz || browserTz === lifeProfile.currentTimeZone) return;
    if (autoSyncedTzRef.current === browserTz) return;
    autoSyncedTzRef.current = browserTz;

    const tzPreset = PRESET_LOCATIONS.find((l) => l.timeZone === browserTz);
    if (tzPreset) {
      updateLifeProfileLocal((prev) =>
        sanitizeLifeProfile({
          ...prev,
          currentCityName: tzPreset.nameAr,
          currentTimeZone: browserTz,
          currentLat: tzPreset.lat,
          currentLng: tzPreset.lng,
        })
      );
      showToast(`🌍 تم اكتشاف منطقة زمنية جديدة (${tzPreset.nameAr}) وتحديث المواقيت والنوم تلقائياً`);
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((perm) => {
          if (perm.state === 'granted') {
            void handleDetectGpsLocation();
          } else {
            updateLifeProfileLocal((prev) =>
              sanitizeLifeProfile({
                ...prev,
                currentCityName: browserTz.split('/').pop()?.replace(/_/g, ' ') || prev.currentCityName,
                currentTimeZone: browserTz,
              })
            );
          }
        })
        .catch(() => {});
    }
  }, [lifeProfile.autoLocationSync, lifeProfile.currentTimeZone, handleDetectGpsLocation, showToast]);

  // Unified Phone-First GPS Resolution:
  // - On Mobile (OnePlus 12R): acquire hardware GPS and sync to Firestore so PC automatically follows!
  // - On Desktop (Windows EXE / Web PC): NEVER overwrite synced Phone GPS with Cairo/timezone fallback!
  // Prayer times are computed fully offline, so they must NOT wait for Google sign-in.
  // (Sign-out resets gpsFirstAttemptedRef; the needsAuth dependency then re-runs this effect.)
  const gpsFirstAttemptedRef = useRef<boolean>(false);
  useEffect(() => {
    if (gpsFirstAttemptedRef.current) return;
    gpsFirstAttemptedRef.current = true;

    const isMobileClient = detectIsMobileDeviceClient();
    if (!isMobileClient) {
      // Desktop inherits live Phone GPS via Firestore automatically without overwriting coordinates
      setLocationResolutionState('gps_locked');
      return;
    }

    setLocationResolutionState('resolving_gps');

    const applyTimezoneFallback = () => {
      setLocationResolutionState('timezone_fallback');
    };

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      applyTimezoneFallback();
      return;
    }

    let settled = false;
    const hardTimeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        applyTimezoneFallback();
      }
    }, 7500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(hardTimeoutId);
        const lat = Math.round(pos.coords.latitude * 10000) / 10000;
        const lng = Math.round(pos.coords.longitude * 10000) / 10000;
        const browserTz =
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          lifeProfile.currentTimeZone ||
          'Africa/Cairo';
        const offlineCityName = resolveOfflineCityName(lat, lng, browserTz);

        lastCoordsRef.current = { lat, lng };
        updateLifeProfileLocal((prev) =>
          sanitizeLifeProfile({
            ...prev,
            currentCityName: offlineCityName,
            currentTimeZone: browserTz,
            currentLat: lat,
            currentLng: lng,
          })
        );
        setLocationResolutionState('gps_locked');

        void reverseGeocodeCityName(lat, lng, offlineCityName).then((refined) => {
          if (refined && refined !== offlineCityName) {
            updateLifeProfileLocal((prev) => sanitizeLifeProfile({ ...prev, currentCityName: refined }));
          }
        });
      },
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(hardTimeoutId);
        applyTimezoneFallback();
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 7000 }
    );

    return () => {
      window.clearTimeout(hardTimeoutId);
    };
  }, [needsAuth, lifeProfile.currentTimeZone]);

  const prayersReady =
    locationResolutionState === 'gps_locked' || locationResolutionState === 'timezone_fallback';

  // Receive real-time update status callbacks from native Windows EXE & Android APK shells
  useEffect(() => {
    const onUpdateStatus = (evt: Event) => {
      const detail = (evt as CustomEvent<{ state?: string; message?: string }>).detail;
      if (!detail) return;
      if (detail.state === 'checking' || detail.state === 'downloading') {
        setIsCheckingUpdates(true);
      } else {
        setIsCheckingUpdates(false);
      }
      if (detail.message) {
        showToast(detail.message);
      }
    };
    window.addEventListener('dayrhythm:update-status', onUpdateStatus);
    return () => window.removeEventListener('dayrhythm:update-status', onUpdateStatus);
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;
    const timerId = window.setTimeout(() => {
      void checkForGitHubReleaseUpdate({ force: false }).then((res) => {
        if (!cancelled && res?.hasUpdate) {
          setAvailableUpdate(res);
        }
      });
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, []);

  const handleCheckAppUpdates = useCallback(() => {
    setIsCheckingUpdates(true);
    const stopSpinnerLater = () => {
      window.setTimeout(() => setIsCheckingUpdates(false), 8000);
    };
    const androidBridge = (
      window as Window & {
        DayRhythmNative?: { checkForUpdates?: () => void };
      }
    ).DayRhythmNative;
    const wv = (
      window as Window & {
        chrome?: { webview?: { postMessage?: (msg: string) => void } };
      }
    ).chrome?.webview;

    if (androidBridge?.checkForUpdates) {
      androidBridge.checkForUpdates();
      showToast('جاري فحص التحديثات من GitHub...');
      stopSpinnerLater();
      void checkForGitHubReleaseUpdate({ force: true }).then((res) => {
        if (res?.hasUpdate) setAvailableUpdate(res);
        else if (res && !res.hasUpdate) setAvailableUpdate(null);
      });
      return;
    }
    if (wv?.postMessage) {
      wv.postMessage('check-updates');
      showToast('جاري فحص التحديثات من GitHub...');
      stopSpinnerLater();
      void checkForGitHubReleaseUpdate({ force: true }).then((res) => {
        if (res?.hasUpdate) setAvailableUpdate(res);
        else if (res && !res.hasUpdate) setAvailableUpdate(null);
      });
      return;
    }

    void checkForGitHubReleaseUpdate({ force: true })
      .then(async (res) => {
        if (res?.hasUpdate) {
          setAvailableUpdate(res);
          showToast(`يتوفر إصدار جديد ${res.latestVersion} — رابط التحميل جاهز بالأعلى`);
          return;
        }
        setAvailableUpdate(null);
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
          if (reg) {
            await reg.update().catch(() => undefined);
          }
        }
        if (res) {
          showToast('تم فحص التحديثات — أنت على أحدث إصدار متاح');
        } else {
          showToast('تعذر الاتصال بـ GitHub حالياً — تحقق من الإنترنت');
        }
      })
      .finally(() => setIsCheckingUpdates(false));
  }, [showToast]);

  const handleGoogleSignIn = useCallback(async () => {
    setIsLoggingIn(true);
    try {
      const result = await signInWithGoogleCalendar();
      if (result) {
        setAuthUser(result.user);
        setNeedsAuth(false);
        setUseOfflineDemo(false);
        await refreshWorkspace(result.accessToken, { forceGmail: true });
        showToast('تم ربط حساب Google Calendar و Tasks و Gmail والسحابة بنجاح ✓');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول بحساب Google.';
      showToast(msg);
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  }, [refreshWorkspace, showToast]);

  const handleGoogleSignOut = useCallback(async () => {
    await signOutGoogleCalendar();
    clearAllPersonalLocalStorage();
    hasHydratedRemoteRef.current = false;
    hasHydratedCloudChatRef.current = false;
    syncedChatTextByIdRef.current.clear();
    cloudChatIdsRef.current.clear();
    lastGmailAutoScanMsRef.current = 0;
    gpsFirstAttemptedRef.current = false;
    setLocationResolutionState('idle');

    setAuthUser(null);
    setNeedsAuth(true);
    setWorkspaceTokenExpired(false);
    clearGmailRetryTimers();
    gmailRetryAttemptRef.current = 0;
    setCalendarList([]);
    setCalendarEvents([]);
    setGoogleTaskLists([]);
    setGoogleTasks([]);
    setGmailDigest([]);
    setGmailScannedCount(0);
    setGmailLastSyncedIso('');
    setGmailError('');
    setGmailNeedsReauth(false);
    setMedications(DEFAULT_MEDICATIONS);
    setCreativeActivities(DEFAULT_CREATIVE_ACTIVITIES);
    setMemories(DEFAULT_MEMORIES);
    setLifeProfile(DEFAULT_LIFE_PROFILE);
    setDeviceSettings(DEFAULT_DEVICE_SETTINGS);
    setChatMessages([WELCOME_MESSAGE]);
    setSilentNotifications([]);
    setPeriodicRituals([]);
    setChangelog([]);
    setPhoneBattery(null);
    setPersistentAlert(null);
    setStreaks({
      dailyCommitmentDays: 0,
      dailyCommitmentDoneToday: false,
      waterTargetDays: 0,
      waterTargetDoneToday: false,
    });
    setHydrationHistory(buildInitialHydrationHistory(10, activeTimeZone));
    setReflowedBlocksOverride(null);
    showToast('تم تسجيل الخروج وتنظيف جميع البيانات الشخصية من هذا الجهاز ✓');
  }, [activeTimeZone, showToast, clearGmailRetryTimers]);

  const rebuildOfflineSchedule = useCallback(
    (
      nextMode: DayMode,
      nextTravel: TravelState,
      friday: boolean,
      biweeklyPc: boolean
    ) => {
      const loc = nextTravel.active ? nextTravel.location : HOME_LOCATION;
      const nextPrayers = calculateEgyptianPrayerTimes(
        loc,
        new Date(),
        lifeProfile.adhanLeadMinutes
      );
      const base = buildBaseSchedule(nextMode, nextPrayers, {
        isFriday: friday,
        includeBiweeklyPcCleanup: biweeklyPc,
      });
      setOfflineBlocks(nextTravel.active ? applyTravelMatrix(base, nextTravel) : base);
    },
    [lifeProfile.adhanLeadMinutes]
  );

  // Build LIVE ScheduleBlocks from Real Google Calendar + optional Astronomical Prayer Anchors!

  const baseLiveBlocks: ScheduleBlock[] = useMemo(() => {
    if (reflowedBlocksOverride) {
      return reflowedBlocksOverride.map((b) => ({
        ...b,
        completed: completedOverrides[b.id] ?? b.completed,
      }));
    }

    // Compute real Google Calendar blocks for today first so we avoid duplicating prayers already in Calendar
    let todaysGoogleBlocks: ScheduleBlock[] = [];
    if (!needsAuth) {
      todaysGoogleBlocks = calendarEvents
        .map((ev): ScheduleBlock | null => {
          const startInfo = parseIsoToTimeZoneInfo(ev.start, activeTimeZone);
          if (startInfo.dateIso !== todayCairoIso) return null;
          const endInfo = ev.end ? parseIsoToTimeZoneInfo(ev.end, activeTimeZone) : null;
          let durationMin = 0;
          if (!startInfo.isAllDay && endInfo && endInfo.dateIso === startInfo.dateIso) {
            const diff = endInfo.minutesSinceMidnight - startInfo.minutesSinceMidnight;
            durationMin = diff <= 1 ? 0 : diff;
          } else if (!startInfo.isAllDay && ev.start && ev.end) {
            const diff = Math.round((new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60_000);
            durationMin = (diff <= 1 || diff >= 1440) ? 0 : diff;
          }
          const blockId = `gcal_${ev.calendarId ?? 'primary'}_${ev.id}`;
          const emojiPair = extractEmojiPair(ev.summary, '📅');
          const combinedDescription = [
            cleanCalendarText(ev.description),
            ev.location ? `📍 ${ev.location}` : '',
          ]
            .filter(Boolean)
            .join('\n');
          return {
            id: blockId,
            emojiPair,
            categoryAr: ev.summary,
            categoryEn: ev.summary,
            startMin: startInfo.minutesSinceMidnight,
            durationMin,
            minDurationMin: Math.min(15, durationMin),
            isAnchor: emojiPair.includes('🕌'),
            travelGroup: emojiPair.includes('🕌') ? 'ANCHOR' : 'B_WORK',
            canShiftEvening: !emojiPair.includes('🕌'),
            completed: completedOverrides[blockId] ?? false,
            deleted: false,
            googleEventId: ev.id,
            googleCalendarId: ev.calendarId ?? 'primary',
            calendarTitle: ev.calendarTitle,
            calendarColor: ev.calendarColor,
            googleHtmlLink: ev.htmlLink,
            dateIso: startInfo.dateIso,
            startIso: ev.start,
            endIso: ev.end,
            isAllDay: startInfo.isAllDay || ev.isAllDay,
            description: combinedDescription,
            source: 'google_calendar',
            reflowStatus:
              travelState.active &&
              !emojiPair.includes('🕌') &&
              travelState.deferredCategories?.includes('calendar')
                ? 'postponed_travel'
                : undefined,
          };
        })
        .filter((x): x is ScheduleBlock => x !== null);
    }

    // Prayer anchors computed astronomically — skip any prayer already represented in Google Calendar
    const prayerAnchors: ScheduleBlock[] = includePrayerAnchors
      ? prayers
          .filter((p) => p.isObligatory)
          .filter(
            (p) =>
              !todaysGoogleBlocks.some(
                (gb) =>
                  Math.abs(gb.startMin - p.alarmMinutes) <= 10 ||
                  Math.abs(gb.startMin - p.adhanMinutes) <= 10 ||
                  (gb.emojiPair.includes('🕌') && Math.abs(gb.startMin - p.alarmMinutes) <= 25)
              )
          )
          .map((p) => ({
            id: `prayer_${p.id}`,
            emojiPair: p.emojiPair,
            categoryAr:
              lifeProfile.adhanLeadMinutes > 0
                ? `أذان -${lifeProfile.adhanLeadMinutes} د · ${p.nameAr}`
                : `أذان ${p.nameAr}`,
            categoryEn:
              lifeProfile.adhanLeadMinutes > 0
                ? `-${lifeProfile.adhanLeadMinutes}m Adhan · ${p.nameEn}`
                : `Adhan · ${p.nameEn}`,
            startMin: p.alarmMinutes,
            durationMin: 20,
            minDurationMin: 20,
            isAnchor: true,
            isFridayRitual: isFridayMode && p.id === 'dhuhr',
            travelGroup: 'ANCHOR' as const,
            canShiftEvening: false,
            completed: completedOverrides[`prayer_${p.id}`] ?? false,
            deleted: false,
            dateIso: todayCairoIso,
            source: 'prayer' as const,
          }))
      : [];

    const sunlightDeferredByTravel =
      travelState.active && (travelState.deferredCategories?.includes('sunlight') ?? false);
    const sunlightBlocks: ScheduleBlock[] =
      sunlightSettings.enabled && !sunlightDeferredByTravel
        ? sunlightSessions
          .filter((s) => s.enabled)
          .map((s) => ({
            id: `sunlight_${s.id}`,
            emojiPair: s.emoji,
            categoryAr: s.labelAr,
            categoryEn: s.id,
            startMin: s.startMinutes,
            durationMin: s.durationMinutes,
            minDurationMin: s.durationMinutes,
            isAnchor: true,
            travelGroup: 'ANCHOR' as const,
            canShiftEvening: false,
            completed: false,
            deleted: false,
            dateIso: todayCairoIso,
            description: s.isCloudBlocked
              ? s.cloudNoteAr ?? '☁️ غيوم كثيفة — لا توجد أشعة الآن'
              : s.descAr,
            source: 'offline' as const,
          }))
      : [];

    if (!needsAuth) {
      return [...todaysGoogleBlocks, ...prayerAnchors, ...sunlightBlocks].sort(
        (a, b) => a.startMin - b.startMin
      );
    }

    // Disconnected / Anonymous mode: keep schedule 100% empty until signed in (unless explicit Offline Demo)
    if (useOfflineDemo) {
      return [
        ...offlineBlocks.map((b) => ({
          ...b,
          completed: completedOverrides[b.id] ?? b.completed,
          source: b.source ?? 'offline',
        })),
        ...sunlightBlocks,
      ].sort((a, b) => a.startMin - b.startMin);
    }

    return sunlightBlocks;
  }, [
    reflowedBlocksOverride,
    includePrayerAnchors,
    prayers,
    isFridayMode,
    todayCairoIso,
    needsAuth,
    calendarEvents,
    completedOverrides,
    useOfflineDemo,
    offlineBlocks,
    lifeProfile.adhanLeadMinutes,
    activeTimeZone,
    sunlightSettings.enabled,
    sunlightSessions,
    travelState.active,
    travelState.deferredCategories,
  ]);

  // Genuinely free time slots today (away from Prayers, Sleep, Work & existing Google Calendar events)
  const freeSlotsToday: FreeTimeSlot[] = useMemo(
    () => findFreeTimeSlotsForToday(prayers, dailyRhythmPlan, lifeProfile, baseLiveBlocks),
    [prayers, dailyRhythmPlan, lifeProfile, baseLiveBlocks]
  );

  // Auto-place Creative Activities ONLY into genuinely free slots today (hidden on Quiet/Low-Energy days)
  const creativePlacements: CreativeActivityPlacement[] = useMemo(
    () =>
      lowEnergyActive
        ? []
        : computeCreativePlacements(creativeActivities, freeSlotsToday, todayCairoIso, nowTickMin),
    [lowEnergyActive, creativeActivities, freeSlotsToday, todayCairoIso, nowTickMin]
  );

  // Merge free-slot Creative Activities gently into the daily timeline (skip duplicates already in Calendar)
  const liveBlocks: ScheduleBlock[] = useMemo(() => {
    const creativeBlocks: ScheduleBlock[] = creativePlacements
      .filter((p) => !p.doneToday && p.suggestedSlot)
      .filter(
        (p) =>
          !baseLiveBlocks.some(
            (b) =>
              !b.deleted &&
              (b.googleEventId === p.activity.calendarEventId ||
                b.categoryAr.includes(p.activity.name))
          )
      )
      .map((p) => ({
        id: `creative_${p.activity.id}`,
        emojiPair: p.activity.emoji || '🎨',
        categoryAr: `${p.activity.emoji || '🎨'} ${p.activity.name} (${p.sessionsInPeriod}/${p.goalInPeriod} ${p.periodLabelAr})`,
        categoryEn: `${p.activity.emoji || '🎨'} ${p.activity.name}`,
        startMin: p.suggestedSlot!.startMin,
        durationMin: p.activity.sessionMinutes,
        minDurationMin: 15,
        isAnchor: false,
        travelGroup: 'B_WORK' as const,
        canShiftEvening: true,
        completed: completedOverrides[`creative_${p.activity.id}`] ?? false,
        deleted: false,
        dateIso: todayCairoIso,
        source: 'creative' as const,
        creativeActivityId: p.activity.id,
      }));

    return [...baseLiveBlocks, ...creativeBlocks].sort((a, b) => a.startMin - b.startMin);
  }, [baseLiveBlocks, creativePlacements, todayCairoIso]);


  useEffect(() => {
    if (shakeUndoSecondsLeft <= 0) return;
    const id = window.setTimeout(() => {
      setShakeUndoSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [shakeUndoSecondsLeft]);

  const handleTriggerShakeUndo = useCallback(() => {
    if (!lastDeletedBlock || shakeUndoSecondsLeft <= 0) return;
    const targetId = lastDeletedBlock.id;
    setOfflineBlocks((prev) =>
      prev.map((b) => (b.id === targetId ? { ...b, deleted: false } : b))
    );
    setLastDeletedBlock(null);
    setShakeUndoSecondsLeft(0);
    triggerHapticWaveform('shake_undo');
    showToast(`تم التراجع واسترجاع الحدث بنجاح (${lastDeletedBlock.emojiPair})`);
  }, [lastDeletedBlock, shakeUndoSecondsLeft, showToast]);

  useEffect(() => {
    if (shakeUndoSecondsLeft <= 0 || typeof window === 'undefined') return;
    const onMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const gx = (acc.x ?? 0) / 9.81;
      const gy = (acc.y ?? 0) / 9.81;
      const gz = (acc.z ?? 0) / 9.81;
      const gForce = Math.sqrt(gx * gx + gy * gy + gz * gz);
      if (gForce > 2.6) {
        handleTriggerShakeUndo();
      }
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [shakeUndoSecondsLeft, handleTriggerShakeUndo]);

  useEffect(() => {
    if (!pomodoro.isRunning) return;
    const id = window.setInterval(() => {
      setPomodoro((prev) => {
        if (!prev.isRunning) return prev;
        if (prev.remainingSeconds > 1) {
          return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
        }
        if (prev.phase === 'focus') {
          if (quietMode === 'normal') {
            playSoftChime('focus_done', activeSanctuary);
          }
          if (quietMode !== 'silent_all' && quietMode !== 'mute_audio') {
            triggerHapticWaveform('pomodoro');
          }
          return {
            ...prev,
            phase: 'break',
            remainingSeconds: 5 * 60,
            totalSeconds: 5 * 60,
            isRunning: true,
            completedCycles: prev.completedCycles + 1,
          };
        }
        if (quietMode === 'normal') {
          playSoftChime('break_done', activeSanctuary);
        }
        if (quietMode !== 'silent_all' && quietMode !== 'mute_audio') {
          triggerHapticWaveform('pomodoro');
        }
        return {
          ...prev,
          phase: 'focus',
          remainingSeconds: prev.presetMinutes * 60,
          totalSeconds: prev.presetMinutes * 60,
          isRunning: false,
        };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [pomodoro.isRunning, quietMode, activeSanctuary]);

  const handleToggleFridayMode = (v: boolean) => {
    isFridayModeRef.current = v;
    setIsFridayMode(v);
    setUndoSnapshot(null);
    setReflowedBlocksOverride(null);
    rebuildOfflineSchedule(effectiveDayMode, travelState, v, includeBiweeklyPcCleanup);
    void pushToTasksVaultImmediately({ isFridayMode: v });
  };

  const handleToggleBiweeklyPcCleanup = (v: boolean) => {
    includeBiweeklyPcCleanupRef.current = v;
    setIncludeBiweeklyPcCleanup(v);
    setUndoSnapshot(null);
    setReflowedBlocksOverride(null);
    rebuildOfflineSchedule(effectiveDayMode, travelState, isFridayMode, v);
    void pushToTasksVaultImmediately({ includeBiweeklyPcCleanup: v });
  };

  const handleToggleAdhanOverrideSilent = useCallback(() => {
    setAdhanOverrideSilent((prev) => {
      const next = !prev;
      adhanOverrideSilentRef.current = next;
      void pushToTasksVaultRef.current({ adhanOverrideSilent: next });
      return next;
    });
  }, []);

  const handleApplyTravel = (nextTravel: TravelState) => {
    const stamped: TravelState = {
      ...nextTravel,
      updatedAt: Date.now(),
    };
    localWriteLockUntilRef.current = Date.now() + 5000;
    travelStateRef.current = stamped;
    setTravelState(stamped);
    try {
      localStorage.setItem(TRAVEL_STATE_STORAGE_KEY, JSON.stringify(stamped));
    } catch {
      // ignore storage errors
    }
    setReflowedBlocksOverride(null);
    rebuildOfflineSchedule(effectiveDayMode, stamped, isFridayMode, includeBiweeklyPcCleanup);
    appendChangelog('Web/PC', `تفعيل وضع السفر (${stamped.location.nameAr})`, `Activated Travel Mode`);
    showToast('تم تفعيل وضع السفر وتحديث التنبيهات.');
    void saveCloudUserSettingsImmediately({ travelState: stamped });
  };

  const handleDisableTravel = () => {
    const resetTravel: TravelState = {
      ...travelState,
      active: false,
      location: profileLocation,
      distanceKm: 0,
      returnDate: undefined,
      deferredCategories: [],
      deferredMedIds: [],
      updatedAt: Date.now(),
    };
    localWriteLockUntilRef.current = Date.now() + 5000;
    travelStateRef.current = resetTravel;
    setTravelState(resetTravel);
    try {
      localStorage.setItem(TRAVEL_STATE_STORAGE_KEY, JSON.stringify(resetTravel));
    } catch {
      // ignore storage errors
    }
    setReflowedBlocksOverride(null);
    rebuildOfflineSchedule(effectiveDayMode, resetTravel, isFridayMode, includeBiweeklyPcCleanup);
    showToast('تم إنهاء وضع السفر واستعادة جميع التنبيهات ✓');
    void saveCloudUserSettingsImmediately({ travelState: resetTravel });
  };

  useEffect(() => {
    if (!travelState.active || !travelState.returnDate) return;
    if (todayCairoIso >= travelState.returnDate) {
      const expiredTravel: TravelState = {
        ...travelState,
        active: false,
        location: profileLocation,
        distanceKm: 0,
        returnDate: undefined,
        deferredCategories: [],
        deferredMedIds: [],
        updatedAt: Date.now(),
      };
      localWriteLockUntilRef.current = Date.now() + 5000;
      travelStateRef.current = expiredTravel;
      setTravelState(expiredTravel);
      try {
        localStorage.setItem(TRAVEL_STATE_STORAGE_KEY, JSON.stringify(expiredTravel));
      } catch {
        // ignore storage errors
      }
      void saveCloudUserSettingsImmediately({ travelState: expiredTravel });
    }
  }, [todayCairoIso, travelState, profileLocation, saveCloudUserSettingsImmediately]);

  const handleApplyOfflineActions = useCallback(
    (actions: CalendarActionProposal[]) => {
      setOfflineBlocks((prev) => {
        let next = [...prev];
        actions.forEach((act) => {
          const parseMin = (hhmm?: string): number => {
            if (!hhmm || !hhmm.includes(':')) return 9 * 60;
            const [hStr, mStr] = hhmm.split(':');
            return (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
          };

          if (act.operation === 'delete') {
            next = next.map((b) =>
              b.id === act.eventId || b.emojiPair === act.title || b.categoryAr.includes(act.title)
                ? { ...b, deleted: true }
                : b
            );
          } else if (act.operation === 'update' || act.operation === 'shift') {
            const newStart = parseMin(act.startTime24);
            next = next.map((b) =>
              b.id === act.eventId || b.emojiPair === act.title || b.categoryAr.includes(act.title)
                ? {
                    ...b,
                    startMin: newStart,
                    durationMin: act.durationMinutes ?? b.durationMin,
                    reflowStatus: 'shifted_evening',
                  }
                : b
            );
          } else {
            const startMin = parseMin(act.startTime24);
            next.push({
              id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              emojiPair: extractEmojiPair(act.title, '📅 ✨'),
              categoryAr: act.title,
              startMin,
              durationMin: act.durationMinutes ?? 30,
              minDurationMin: 15,
              isAnchor: false,
              travelGroup: 'B_WORK',
              canShiftEvening: true,
              completed: false,
              deleted: false,
              source: 'offline',
            });
          }
        });
        return next.sort((a, b) => a.startMin - b.startMin);
      });
    },
    []
  );

  const executeCalendarActionsNow = useCallback(
    async (
      actions: CalendarActionProposal[],
      options?: { isUndoRestore?: boolean; alreadyResolved?: boolean }
    ): Promise<{ googleSynced: boolean; results: CalendarExecutionResult[] }> => {
      if (actions.length === 0) return { googleSynced: false, results: [] };
      // Undo-restores re-create events that are no longer in the list, so only validate normal runs.
      if (!options?.isUndoRestore && !options?.alreadyResolved) {
        actions = resolveCalendarActionTargets(actions, calendarEvents);
      }
      const token = getCalendarAccessToken();
      let results: CalendarExecutionResult[] = [];
      let googleSynced = false;

      // Capture reversible undo snapshot & apply optimistic removal for delete operations
      const deleteAct = actions.find((a) => a.operation === 'delete' && a.eventId);
      let undoSnap: DeletedWorkspaceSnapshot | undefined;
      if (deleteAct) {
        const existingEv = calendarEvents.find((e) => e.id === deleteAct.eventId);
        const startInfo = existingEv?.start
          ? parseIsoToTimeZoneInfo(existingEv.start, activeTimeZone)
          : null;
        let durationMinutes = 0;
        if (existingEv?.start && existingEv?.end && !existingEv.isAllDay) {
          const diff = Math.round(
            (new Date(existingEv.end).getTime() - new Date(existingEv.start).getTime()) / 60_000
          );
          durationMinutes = diff <= 1 ? 0 : Math.min(720, Math.max(0, diff));
        }
        const h24 = startInfo ? Math.floor(startInfo.minutesSinceMidnight / 60) : 9;
        const m24 = startInfo ? startInfo.minutesSinceMidnight % 60 : 0;
        undoSnap = {
          opId: `del_ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          kind: 'event',
          title: existingEv?.summary || deleteAct.title,
          calendarId: existingEv?.calendarId || deleteAct.calendarId || 'primary',
          dateIso: startInfo?.dateIso || getDateIsoInTimeZone(activeTimeZone),
          startTime24: `${String(h24).padStart(2, '0')}:${String(m24).padStart(2, '0')}`,
          durationMinutes,
          description: existingEv?.description || '',
          deletedAtMs: Date.now(),
        };
        const deleteIds = new Set(
          actions.filter((a) => a.operation === 'delete' && a.eventId).map((a) => a.eventId!)
        );
        if (deleteIds.size > 0) {
          setCalendarEvents((prev) => prev.filter((ev) => !deleteIds.has(ev.id)));
        }
      }

      if (token) {
        let serverHandled = false;
        try {
          const { ok, status, data } = await apiFetchJson<{
            results?: CalendarExecutionResult[];
            error?: string;
          }>('/api/calendar/execute', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              ...(firebaseUser?.uid ? { 'x-user-uid': firebaseUser.uid } : {}),
              'x-client-id': clientIdRef.current,
            },
            body: JSON.stringify({ actions, undoSnapshot: undoSnap }),
          });
          if (!ok) {
            if (status === 401) {
              handleWorkspaceUnauthorized();
              showToast('انتهت جلسة مزامنة Google — اضغط «تجديد ربط Google الآن» في الأعلى بضغطة واحدة');
            }
            await fetchCalendarEvents(token);
            throw new Error(data.error || 'تعذر تنفيذ التعديلات على Google Calendar.');
          }
          results = Array.isArray(data.results) ? data.results : [];
          serverHandled = true;
        } catch (proxyErr: unknown) {
          // If running standalone APK/EXE without backend proxy, execute directly via Google Calendar API v3
          const directResults: CalendarExecutionResult[] = [];
          for (const act of actions) {
            const calId = encodeURIComponent(act.calendarId || 'primary');
            if (act.operation === 'delete' && act.eventId) {
              const r = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(act.eventId)}`,
                { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
              );
              if (r.status === 401) {
                handleWorkspaceUnauthorized();
                showToast('انتهت صلاحية رمز Google Calendar — اضغط «تجديد ربط Google الآن» بضغطة واحدة');
                throw new Error(GOOGLE_SESSION_EXPIRED_AR);
              }
              if (!r.ok && r.status !== 404 && r.status !== 410) {
                throw new Error('تعذر حذف الحدث من Google Calendar.');
              }
              directResults.push({
                operation: 'delete',
                title: act.title,
                status: 'deleted',
                id: act.eventId,
              });
            } else if (act.operation === 'create' && act.dateIso && act.startTime24) {
              const { startDateTime, endDateTime } = computeEventRangeInTimeZone(
                act.dateIso,
                act.startTime24,
                act.durationMinutes,
                activeTimeZone
              );
              const validByDays = Array.isArray(act.byDays)
                ? act.byDays.filter((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].includes(d))
                : [];
              const recurrence =
                act.recurrenceRule === 'DAILY'
                  ? ['RRULE:FREQ=DAILY']
                  : act.recurrenceRule === 'WEEKLY'
                    ? [
                        validByDays.length > 0
                          ? `RRULE:FREQ=WEEKLY;BYDAY=${validByDays.join(',')}`
                          : 'RRULE:FREQ=WEEKLY',
                      ]
                    : undefined;
              const r = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    summary: act.title,
                    description: act.description || '',
                    start: { dateTime: startDateTime, timeZone: activeTimeZone },
                    end: { dateTime: endDateTime, timeZone: activeTimeZone },
                    ...(recurrence ? { recurrence } : {}),
                  }),
                }
              );
              if (r.status === 401) {
                handleWorkspaceUnauthorized();
                showToast('انتهت صلاحية رمز Google Calendar — اضغط «تجديد ربط Google الآن» بضغطة واحدة');
                throw new Error(GOOGLE_SESSION_EXPIRED_AR);
              }
              if (!r.ok) throw new Error('تعذر إنشاء الحدث في Google Calendar.');
              const created = (await r.json()) as { id?: string; htmlLink?: string };
              directResults.push({
                operation: 'create',
                title: act.title,
                status: 'created',
                id: created.id,
                htmlLink: created.htmlLink,
              });
            } else if (act.operation === 'update' && act.eventId) {
              const body: Record<string, unknown> = { summary: act.title };
              if (act.description !== undefined) body.description = act.description;
              if (act.dateIso && act.startTime24) {
                const { startDateTime, endDateTime } = computeEventRangeInTimeZone(
                  act.dateIso,
                  act.startTime24,
                  act.durationMinutes,
                  activeTimeZone
                );
                body.start = { dateTime: startDateTime, timeZone: activeTimeZone };
                body.end = { dateTime: endDateTime, timeZone: activeTimeZone };
              }
              const r = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(act.eventId)}`,
                {
                  method: 'PATCH',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(body),
                }
              );
              if (r.status === 401) {
                handleWorkspaceUnauthorized();
                showToast('انتهت صلاحية رمز Google Calendar — اضغط «تجديد ربط Google الآن» بضغطة واحدة');
                throw new Error(GOOGLE_SESSION_EXPIRED_AR);
              }
              if (!r.ok) throw new Error('تعذر تحديث الحدث في Google Calendar.');
              const updated = (await r.json()) as { id?: string; htmlLink?: string };
              directResults.push({
                operation: 'update',
                title: act.title,
                status: 'updated',
                id: updated.id || act.eventId,
                htmlLink: updated.htmlLink,
              });
            }
          }
          results = directResults;
          serverHandled = true;
        }
        if (serverHandled) {
          googleSynced = true;
          setReflowedBlocksOverride(null);

          // Optimistically insert newly created events directly into local state so Mobile timeline
          // and exact alarms update instantly without waiting for Google Calendar eventual consistency
          const createdItems: GoogleCalendarEventItem[] = [];
          for (const act of actions) {
            if (act.operation === 'create' && act.dateIso && act.startTime24) {
              const resItem = results.find((r) => r.operation === 'create' && r.title === act.title);
              const { startDateTime, endDateTime } = computeEventRangeInTimeZone(
                act.dateIso,
                act.startTime24,
                act.durationMinutes,
                activeTimeZone
              );
              const createdId = resItem?.id || `created_${Date.now()}`;
              createdItems.push({
                id: createdId,
                calendarId: act.calendarId || 'primary',
                summary: act.title,
                description: act.description || '',
                start: startDateTime,
                end: endDateTime,
                isAllDay: false,
                htmlLink: resItem?.htmlLink,
              });
              recentlyCreatedEventIdsRef.current.add(createdId);
            }
          }
          if (createdItems.length > 0) {
            setCalendarEvents((prev) => {
              const newIds = new Set(createdItems.map((c) => c.id));
              const kept = prev.filter((e) => !newIds.has(e.id));
              return [...kept, ...createdItems].sort((a, b) => a.start.localeCompare(b.start));
            });
            setTimeout(() => {
              createdItems.forEach((c) => recentlyCreatedEventIdsRef.current.delete(c.id));
            }, 30_000);
          }

          for (const act of actions) {
            if (act.eventId) {
              const bId = `gcal_${act.calendarId || 'primary'}_${act.eventId}`;
              acknowledgedBlockIdsRef.current.delete(bId);
              setCompletedOverrides((prev) => {
                if (!prev[bId]) return prev;
                const next = { ...prev };
                delete next[bId];
                return next;
              });
            }
          }
          await fetchCalendarEvents(token);
        }

        if (undoSnap) {
          setLastDeletedWorkspaceItem(undoSnap);
        }
        emitCrossDeviceSync(
          'calendar',
          options?.isUndoRestore ? 'undo_restore' : deleteAct ? 'delete' : 'update',
          undoSnap
        );

        appendChangelog(
          'Gemini API',
          `تحديث ${results.length} حدثاً في Google Calendar الحقيقي`,
          `Updated ${results.length} events in Google Calendar`
        );
        showToast(
          options?.isUndoRestore
            ? '↩️ تم استرجاع الحدث ومزامنته على جميع أجهزتك ✓'
            : deleteAct
              ? 'تم حذف الحدث ومزامنته فوراً — يمكنك التراجع الآن ✓'
              : `تمت المزامنة مع Google Calendar (${results.length} عمليات) ✓`
        );
      } else {
        handleApplyOfflineActions(actions);
        showToast('تم التطبيق في وضع المعاينة (سجّل الدخول بحساب Google للتنفيذ في تقويمك).');
      }

      return { googleSynced, results };
    },
    [
      activeTimeZone,
      appendChangelog,
      calendarEvents,
      emitCrossDeviceSync,
      fetchCalendarEvents,
      firebaseUser?.uid,
      handleApplyOfflineActions,
      handleWorkspaceUnauthorized,
      showToast,
    ]
  );

  const executeTaskActionsNow = useCallback(
    async (
      taskActions: TaskActionProposal[],
      options?: { isUndoRestore?: boolean; alreadyResolved?: boolean }
    ): Promise<{ googleSynced: boolean; results: TaskExecutionResult[] }> => {
      if (taskActions.length === 0) return { googleSynced: false, results: [] };
      if (!options?.isUndoRestore && !options?.alreadyResolved) {
        taskActions = resolveTaskActionTargets(taskActions, googleTasks);
      }
      const token = getCalendarAccessToken();
      if (!token) {
        throw new Error('يرجى تسجيل الدخول بحساب Google لتنفيذ تعديلات Google Tasks.');
      }

      // Capture reversible undo snapshot & apply optimistic removal for delete operations
      const deleteAct = taskActions.find((a) => a.operation === 'delete' && a.taskId);
      let undoSnap: DeletedWorkspaceSnapshot | undefined;
      if (deleteAct) {
        const existingTk = googleTasks.find((tk) => tk.id === deleteAct.taskId);
        undoSnap = {
          opId: `del_tk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          kind: 'task',
          title: existingTk?.title || deleteAct.title,
          taskListId: existingTk?.taskListId || deleteAct.taskListId || '@default',
          notes: existingTk?.notes || '',
          dueDateIso: existingTk?.due ? existingTk.due.slice(0, 10) : undefined,
          deletedAtMs: Date.now(),
        };
        const deleteIds = new Set(
          taskActions.filter((a) => a.operation === 'delete' && a.taskId).map((a) => a.taskId!)
        );
        if (deleteIds.size > 0) {
          setGoogleTasks((prev) => prev.filter((tk) => !deleteIds.has(tk.id)));
        }
      }

      let results: TaskExecutionResult[] = [];
      try {
        const { ok, status, data } = await apiFetchJson<{
          results?: TaskExecutionResult[];
          error?: string;
        }>('/api/tasks/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(firebaseUser?.uid ? { 'x-user-uid': firebaseUser.uid } : {}),
            'x-client-id': clientIdRef.current,
          },
          body: JSON.stringify({ taskActions, undoSnapshot: undoSnap }),
        });
        if (!ok) {
          if (status === 401) {
            handleWorkspaceUnauthorized();
            showToast('انتهت جلسة مزامنة Google Tasks — اضغط «تجديد ربط Google الآن» في الأعلى');
          }
          await fetchGoogleTasks(token);
          throw new Error(data.error || 'تعذر تنفيذ التعديلات على Google Tasks.');
        }
        results = Array.isArray(data.results) ? data.results : [];
      } catch (proxyErr: unknown) {
        // Standalone APK/EXE fallback: execute directly via Google Tasks API v1
        const directResults: TaskExecutionResult[] = [];
        for (const act of taskActions) {
          const listId = encodeURIComponent(act.taskListId || '@default');
          if (act.operation === 'create') {
            const body: Record<string, unknown> = { title: act.title };
            if (act.notes) body.notes = act.notes;
            if (act.dueDateIso) body.due = `${act.dueDateIso}T00:00:00.000Z`;
            const r = await fetch(
              `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`,
              {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              }
            );
            if (r.status === 401) {
              handleWorkspaceUnauthorized();
              showToast('انتهت صلاحية رمز Google Tasks — اضغط «تجديد ربط Google الآن» في الأعلى');
              throw new Error(GOOGLE_SESSION_EXPIRED_AR);
            }
            if (!r.ok) throw new Error('تعذر إنشاء المهمة في Google Tasks.');
            const created = (await r.json()) as { id?: string };
            directResults.push({
              operation: 'create',
              title: act.title,
              status: 'created',
              id: created.id,
              taskListId: act.taskListId || '@default',
            });
          } else if (act.operation === 'delete' && act.taskId) {
            const r = await fetch(
              `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${encodeURIComponent(act.taskId)}`,
              { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
            );
            if (r.status === 401) {
              handleWorkspaceUnauthorized();
              showToast('انتهت صلاحية رمز Google Tasks — اضغط «تجديد ربط Google الآن» في الأعلى');
              throw new Error(GOOGLE_SESSION_EXPIRED_AR);
            }
            if (!r.ok && r.status !== 404) throw new Error('تعذر حذف المهمة من Google Tasks.');
            directResults.push({
              operation: 'delete',
              title: act.title,
              status: 'deleted',
              id: act.taskId,
              taskListId: act.taskListId || '@default',
            });
          } else if ((act.operation === 'complete' || act.operation === 'reopen' || act.operation === 'update') && act.taskId) {
            const body: Record<string, unknown> = {};
            if (act.operation === 'complete') body.status = 'completed';
            if (act.operation === 'reopen') {
              body.status = 'needsAction';
              body.completed = null;
            }
            if (act.operation === 'update') {
              body.title = act.title;
              if (act.notes !== undefined) body.notes = act.notes;
              if (act.dueDateIso) body.due = `${act.dueDateIso}T00:00:00.000Z`;
            }
            const r = await fetch(
              `https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks/${encodeURIComponent(act.taskId)}`,
              {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              }
            );
            if (r.status === 401) {
              handleWorkspaceUnauthorized();
              showToast('انتهت صلاحية رمز Google Tasks — اضغط «تجديد ربط Google الآن» في الأعلى');
              throw new Error(GOOGLE_SESSION_EXPIRED_AR);
            }
            if (!r.ok) throw new Error('تعذر تحديث المهمة في Google Tasks.');
            directResults.push({
              operation: act.operation,
              title: act.title,
              status: act.operation,
              id: act.taskId,
              taskListId: act.taskListId || '@default',
            });
          }
        }
        results = directResults;
      }

      // Optimistically insert newly created tasks directly into local state so Mobile tasks list
      // updates instantly without waiting for Google Tasks eventual consistency
      const createdItems: GoogleTaskItem[] = [];
      for (const act of taskActions) {
        if (act.operation === 'create') {
          const resItem = results.find((r) => r.operation === 'create' && r.title === act.title);
          const createdId = resItem?.id || `task_${Date.now()}`;
          createdItems.push({
            id: createdId,
            taskListId: act.taskListId || '@default',
            taskListTitle: googleTaskLists.find((l) => l.id === act.taskListId)?.title || 'المهام',
            title: act.title,
            notes: act.notes || '',
            status: 'needsAction',
            due: act.dueDateIso ? `${act.dueDateIso}T00:00:00.000Z` : undefined,
          });
          recentlyCreatedTaskIdsRef.current.add(createdId);
        }
      }
      if (createdItems.length > 0) {
        setGoogleTasks((prev) => {
          const newIds = new Set(createdItems.map((c) => c.id));
          const kept = prev.filter((t) => !newIds.has(t.id));
          return [...kept, ...createdItems];
        });
        setTimeout(() => {
          createdItems.forEach((c) => recentlyCreatedTaskIdsRef.current.delete(c.id));
        }, 30_000);
      }

      await fetchGoogleTasks(token);

      if (undoSnap) {
        setLastDeletedWorkspaceItem(undoSnap);
      }
      emitCrossDeviceSync(
        'tasks',
        options?.isUndoRestore ? 'undo_restore' : deleteAct ? 'delete' : 'update',
        undoSnap
      );

      appendChangelog(
        'Gemini API',
        `تحديث ${results.length} مهمة في Google Tasks الحقيقي`,
        `Updated ${results.length} tasks in Google Tasks`
      );
      showToast(
        options?.isUndoRestore
          ? '↩️ تم استرجاع المهمة ومزامنتها على جميع أجهزتك ✓'
          : deleteAct
            ? 'تم حذف المهمة ومزامنتها فوراً — يمكنك التراجع الآن ✓'
            : `تم تحديث Google Tasks بنجاح (${results.length} عمليات) ✓`
      );
      return { googleSynced: true, results };
    },
    [
      appendChangelog,
      emitCrossDeviceSync,
      fetchGoogleTasks,
      firebaseUser?.uid,
      googleTasks,
      handleWorkspaceUnauthorized,
      showToast,
    ]
  );

  // ── Offline queue for Google Calendar / Tasks edits ──────────────────────────────────
  // With no internet, an edit is validated, shown right away, saved, and sent to Google
  // automatically when the connection returns (also after an app restart).
  const [queuedGoogleOpsCount, setQueuedGoogleOpsCount] = useState<number>(
    () => readGoogleOfflineQueue().length
  );

  const queueGoogleOp = useCallback(
    (kind: QueuedGoogleOp['kind'], actions: QueuedGoogleOp['actions']) => {
      const next = [
        ...readGoogleOfflineQueue(),
        { id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, kind, actions, createdAtMs: Date.now() },
      ];
      writeGoogleOfflineQueue(next);
      setQueuedGoogleOpsCount(next.length);
      showToast('📴 مفيش إنترنت — التعديل اتحفظ وهيتنفذ في Google لوحده أول ما النت يرجع');
    },
    [showToast]
  );

  const handleExecuteCalendarActions = useCallback(
    async (
      actions: CalendarActionProposal[],
      options?: { isUndoRestore?: boolean }
    ): Promise<{ googleSynced: boolean; results: CalendarExecutionResult[]; queued?: boolean }> => {
      if (actions.length === 0) return { googleSynced: false, results: [] };
      const queueNow = (resolved: CalendarActionProposal[]) => {
        queueGoogleOp('calendar', resolved);
        // Show the change immediately.
        const deleteIds = new Set(resolved.filter((a) => a.operation === 'delete').map((a) => a.eventId));
        setCalendarEvents((prev) => {
          const kept = prev.filter((e) => !deleteIds.has(e.id));
          const created = resolved
            .filter((a) => a.operation === 'create' && a.dateIso && a.startTime24)
            .map((a, i) => {
              const { startDateTime, endDateTime } = computeEventRangeInTimeZone(
                a.dateIso,
                a.startTime24,
                a.durationMinutes,
                activeTimeZone
              );
              return {
                id: `queued-${Date.now()}-${i}`,
                calendarId: a.calendarId || 'primary',
                summary: a.title,
                description: a.description || '',
                start: startDateTime,
                end: endDateTime,
                isAllDay: false,
              } as GoogleCalendarEventItem;
            });
          return [...kept, ...created].sort((x, y) => x.start.localeCompare(y.start));
        });
        return { googleSynced: false, results: [], queued: true };
      };
      const resolved = options?.isUndoRestore
        ? actions
        : resolveCalendarActionTargets(resolveRelativeCalendarStarts(actions, activeTimeZone), calendarEvents);
      if (navigator.onLine === false) return queueNow(resolved);
      try {
        return await executeCalendarActionsNow(resolved, { ...options, alreadyResolved: true });
      } catch (err: unknown) {
        if (isNetworkFailure(err)) return queueNow(resolved);
        throw err;
      }
    },
    [activeTimeZone, calendarEvents, executeCalendarActionsNow, queueGoogleOp]
  );

  const handleExecuteTaskActions = useCallback(
    async (
      taskActions: TaskActionProposal[],
      options?: { isUndoRestore?: boolean }
    ): Promise<{ googleSynced: boolean; results: TaskExecutionResult[]; queued?: boolean }> => {
      if (taskActions.length === 0) return { googleSynced: false, results: [] };
      const queueNow = (resolved: TaskActionProposal[]) => {
        queueGoogleOp('tasks', resolved);
        setGoogleTasks((prev) =>
          prev
            .filter((t) => !resolved.some((a) => a.operation === 'delete' && a.taskId === t.id))
            .map((t) => {
              const act = resolved.find((a) => a.taskId === t.id);
              if (!act) return t;
              if (act.operation === 'complete') return { ...t, status: 'completed' as const };
              if (act.operation === 'reopen') return { ...t, status: 'needsAction' as const };
              if (act.operation === 'update') return { ...t, title: act.title || t.title };
              return t;
            })
        );
        return { googleSynced: false, results: [], queued: true };
      };
      const resolved = options?.isUndoRestore ? taskActions : resolveTaskActionTargets(taskActions, googleTasks);
      if (navigator.onLine === false) return queueNow(resolved);
      try {
        return await executeTaskActionsNow(resolved, { ...options, alreadyResolved: true });
      } catch (err: unknown) {
        if (isNetworkFailure(err)) return queueNow(resolved);
        throw err;
      }
    },
    [executeTaskActionsNow, googleTasks, queueGoogleOp]
  );

  // Flush the queue when the connection returns, on start-up, and when Google access is renewed.
  const flushingQueueRef = useRef(false);
  useEffect(() => {
    if (!authUser || needsAuth || workspaceTokenExpired) return;
    const flush = async () => {
      if (flushingQueueRef.current || navigator.onLine === false || !getCalendarAccessToken()) return;
      const queue = readGoogleOfflineQueue();
      if (queue.length === 0) return;
      flushingQueueRef.current = true;
      let done = 0;
      try {
        for (const op of queue) {
          try {
            if (op.kind === 'calendar') {
              await executeCalendarActionsNow(op.actions as CalendarActionProposal[], { alreadyResolved: true });
            } else {
              await executeTaskActionsNow(op.actions as TaskActionProposal[], { alreadyResolved: true });
            }
            done += 1;
          } catch (err: unknown) {
            if (isNetworkFailure(err)) break;
            // a permanent failure (e.g. event deleted elsewhere): drop it and tell the user
            showToast(`تعذر تنفيذ تعديل محفوظ: ${err instanceof Error ? err.message : ''}`);
          }
          const rest = readGoogleOfflineQueue().filter((q) => q.id !== op.id);
          writeGoogleOfflineQueue(rest);
          setQueuedGoogleOpsCount(rest.length);
        }
        if (done > 0) showToast(`✓ رجع النت — اتنفذ ${done} تعديل محفوظ في Google`);
      } finally {
        flushingQueueRef.current = false;
      }
    };
    void flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [authUser, needsAuth, workspaceTokenExpired, executeCalendarActionsNow, executeTaskActionsNow, showToast]);

  const handleUndoWorkspaceDelete = useCallback(async () => {
    const snap = lastDeletedWorkspaceItem;
    if (!snap) return;
    // Idempotency guard: prevent duplicate re-creation if Undo is clicked rapidly or across devices
    if (restoredOpIdsRef.current.has(snap.opId)) {
      setLastDeletedWorkspaceItem(null);
      return;
    }
    restoredOpIdsRef.current.add(snap.opId);
    setLastDeletedWorkspaceItem(null);

    try {
      if (snap.kind === 'task') {
        await handleExecuteTaskActions(
          [
            {
              operation: 'create',
              taskListId: snap.taskListId || '@default',
              title: snap.title,
              notes: snap.notes,
              dueDateIso: snap.dueDateIso,
            },
          ],
          { isUndoRestore: true }
        );
      } else {
        await handleExecuteCalendarActions(
          [
            {
              operation: 'create',
              calendarId: snap.calendarId || 'primary',
              title: snap.title,
              dateIso: snap.dateIso || getDateIsoInTimeZone(activeTimeZone),
              startTime24: snap.startTime24 || '09:00',
              durationMinutes: typeof snap.durationMinutes === 'number' ? snap.durationMinutes : 30,
              description: snap.description,
            },
          ],
          { isUndoRestore: true }
        );
      }
    } catch {
      restoredOpIdsRef.current.delete(snap.opId);
      showToast('تعذر الاسترجاع — تأكد من الاتصال بحساب Google');
    }
  }, [
    activeTimeZone,
    handleExecuteCalendarActions,
    handleExecuteTaskActions,
    lastDeletedWorkspaceItem,
    showToast,
  ]);

  const handleImportIcsBlocks = useCallback(
    (newBlocks: ScheduleBlock[]) => {
      setUseOfflineDemo(true);
      setOfflineBlocks((prev) => {
        const existingIds = new Set(prev.map((b) => b.id));
        const filtered = newBlocks.filter((nb) => !existingIds.has(nb.id));
        return [...prev, ...filtered].sort((a, b) => a.startMin - b.startMin);
      });
      appendChangelog(
        'Web/PC',
        `استيراد ${newBlocks.length} أحداث عبر خلاصة .ics (RRULE)`,
        `Imported ${newBlocks.length} ICS RRULE events`
      );
      showToast(`تم استيراد ${newBlocks.length} أحداث من خلاصة .ics ✓`);
    },
    [appendChangelog, showToast]
  );

  const handleCompletePeriodicRitual = useCallback(
    (id: PeriodicRitualStatus['id']) => {
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      setPeriodicRituals((prev) => {
        const next = prev.map((r) =>
          r.id === id ? { ...r, daysSinceLast: 0, lastCompletedIso: todayIso } : r
        );
        void pushToTasksVaultImmediately({ periodicRituals: next });
        return next;
      });
      appendChangelog('Web/PC', `تسجيل إتمام المهمة الدورية (${id})`, `Completed periodic ritual ${id}`);
      showToast('تم تسجيل إنجاز المهمة الدورية وتصفير العداد ✓');
    },
    [activeTimeZone, appendChangelog, showToast, pushToTasksVaultImmediately]
  );

  const handleToggleCreativeToday = useCallback(
    (activityId: string) => {
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      setCreativeActivities((prev) => {
        const next = prev.map((act) => {
          if (act.id !== activityId) return act;
          const exists = act.loggedDates.includes(todayIso);
          const nextDates = exists
            ? act.loggedDates.filter((d) => d !== todayIso)
            : [...act.loggedDates, todayIso].slice(-30);
          const updated: CreativeActivityItem = { ...act, loggedDates: nextDates };
          showToast(
            exists
              ? `تم إلغاء تسجيل جلسة «${act.name}» اليوم`
              : `${act.emoji} أحسنت! تم تسجيل جلسة «${act.name}» اليوم ✓`
          );
          return updated;
        });
        void pushToTasksVaultImmediately({ creativeActivities: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      triggerHapticWaveform('water_cup');
    },
    [activeTimeZone, showToast, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleToggleComplete = useCallback(
    (id: string) => {
      if (id.startsWith('creative_')) {
        handleToggleCreativeToday(id.slice('creative_'.length));
        return;
      }
      stopContinuousAlert();
      stopNativeAlerts();
      setActiveAudioAlert(null);
      setPersistentAlert(null);
      setAlarmRinging(false);
      emitCrossDeviceSync('alarm_dismiss', 'block_completed', undefined, { blockId: id, alertId: id });
      setCompletedOverrides((prev) => {
        const next = {
          ...prev,
          [id]: !prev[id],
        };
        void pushToTasksVaultImmediately({ completedOverrides: next });
        return next;
      });
    },
    [handleToggleCreativeToday, pushToTasksVaultImmediately]
  );

  const handleDeleteBlock = (id: string) => {
    const target = liveBlocks.find((b) => b.id === id) ?? null;
    setOfflineBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, deleted: true } : b))
    );
    if (target) {
      setLastDeletedBlock(target);
      setShakeUndoSecondsLeft(8);
      setTombstones((prev) => [
        {
          id: `tomb-${Date.now()}`,
          blockId: target.id,
          emojiPair: target.emojiPair,
          categoryAr: target.categoryAr,
          deletedAtIso: getDateIsoInTimeZone(activeTimeZone),
          ageDays: 0,
        },
        ...prev,
      ]);
    }
  };

  const handleRestoreBlock = (id: string) => {
    setOfflineBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, deleted: false } : b))
    );
  };

  const handleRestoreAllDeleted = () => {
    setOfflineBlocks((prev) => prev.map((b) => ({ ...b, deleted: false })));
  };

  const handleSweepOldTombstones = () => {
    const expired = tombstones.filter((t) => t.ageDays > 14).length;
    setTombstones((prev) => prev.filter((t) => t.ageDays <= 14));
    if (expired > 0) {
      appendChangelog('Web/PC', `تنظيف ${expired} سجل Tombstones > 14 يوماً`, `Purged ${expired} tombstones > 14d`);
    }
    return expired;
  };

  const handleCommitReflow = (reflowed: ScheduleBlock[]) => {
    if (!undoSnapshot) {
      setUndoSnapshot(liveBlocks);
    }
    setReflowedBlocksOverride(reflowed);
    appendChangelog('Web/PC', 'تطبيق زحزحة وتدارك اليوم الخالية من التصادم', 'Applied Collision-Free Reflow');

    // "خلي اللي بيتخطّى يبقى متعلَّم عليه، مش بس يروح كده وخلاص": a block picked "❌ تخطّي اليوم"
    // used to just vanish for the day with nothing remembered. Once the SAME item has been
    // skipped 3 times via تدارك اليوم, save one memory so Gemini notices the pattern and can
    // proactively offer to retime/simplify/remove it, instead of silently proposing it again.
    try {
      const skipped = reflowed.filter((b) => b.reflowStatus === 'skipped');
      if (skipped.length > 0) {
        const counts: Record<string, number> = JSON.parse(
          localStorage.getItem(SKIP_PATTERN_STORAGE_KEY) || '{}'
        );
        const flaggedTitles: string[] = [];
        skipped.forEach((b) => {
          const titleAr = cleanCalendarText(b.categoryAr) || b.emojiPair;
          const key = normalizeSkipPatternKey(titleAr);
          if (!key) return;
          counts[key] = (counts[key] ?? 0) + 1;
          const alreadyNoted = memories.some((m) => m.ruleText.includes(titleAr));
          if (counts[key] === 3 && !alreadyNoted) {
            flaggedTitles.push(titleAr);
          }
        });
        localStorage.setItem(SKIP_PATTERN_STORAGE_KEY, JSON.stringify(counts));
        flaggedTitles.forEach((titleAr) => {
          handleAddMemory({
            category: 'priority',
            ruleText: `لاحظ النظام أن المستخدم تخطّى «${titleAr}» ٣ أيام على الأقل عبر "تدارك اليوم" — هذا نمط متكرر، فاقترح بنفسك تعديل ميعاده أو تبسيطه أو حذفه بدل الاستمرار في جدولته كما هو دون تغيير.`,
            source: 'system_seed',
          });
        });
      }
    } catch {
      // ignore skip-pattern tracking errors
    }
  };

  const handleUndoReflow = () => {
    if (undoSnapshot) {
      setReflowedBlocksOverride(null);
      setUndoSnapshot(null);
    }
  };

  const handleTestAdhanChime = () => {
    if (quietMode === 'normal' || adhanOverrideSilent) {
      playSoftChime('alarm_pulse');
      triggerHapticWaveform('wake_fajr');
      showToast(
        quietMode !== 'normal'
          ? '🔊 نداء الصلاة يعمل بصوت نقي (تم تجاوز الصامت والاهتزاز)'
          : '🔊 نداء الصلاة نشط بصوت نقي'
      );
    } else {
      showToast('🔇 الهاتف صامت والتجاوز معطّل');
    }
  };

  const handleDismissTwoWay = useCallback(() => {
    stopContinuousAlert();
    stopSmartChargeCompleteAlert();
    stopNativeAlerts();
    setSmartChargeAudioActive(false);
    setActiveAudioAlert(null);
    setPersistentAlert(null);
    setAlarmRinging(false);
    emitCrossDeviceSync('alarm_dismiss', 'dismiss');
    showToast('🔕 تم الإيقاف المتزامن على الموبايل والكمبيوتر في نفس اللحظة ✓');
  }, [emitCrossDeviceSync, showToast, stopNativeAlerts]);

  const handleTriggerRing = useCallback(() => {
    setAlarmRinging(true);
    triggerTaskAlert('🔔', 'general', {
      privacyEmoji: '🔔',
      displayTitle: 'اختبار تنبيه متزامن (الموبايل ↔ الكمبيوتر)',
      description: 'عند الضغط على تم يتوقف التنبيه فوراً على جميع أجهزتك',
      sourceLabel: 'مزامنة فورية (Wi-Fi / بيانات الهاتف)',
      bypassSanctuary: true,
    });
  }, [triggerTaskAlert]);

  const handleSimulateCharge90 = () => {
    if (batteryGuard.bypassChargingLimitPct !== null) {
      showToast(
        `🎮 الشحن التجاوزي (${batteryGuard.bypassChargingLimitPct}%) نشط — تم منع تنبيه الامتلاء الوهمي`
      );
      return;
    }
    setBatteryGuard((prev) => ({
      ...prev,
      levelPct: 90,
      cableConnected: true,
      pcAlertActive: true,
      autoSilencedByDisconnect: false,
      bedtimeGuardTriggered: false,
    }));
    playSoftChime('focus_done');
    showToast('⚡ SUPERVOOC وصل 90%: تم إرسال التنبيه إلى الكمبيوتر');
  };

  const handleSimulatePowerDisconnect = () => {
    setBatteryGuard((prev) => ({
      ...prev,
      cableConnected: false,
      pcAlertActive: false,
      autoSilencedByDisconnect: true,
    }));
    showToast('🔌 ACTION_POWER_DISCONNECTED: تم كتم الصوت وإغلاق كارد التنبيه بالكمبيوتر تلقائياً');
  };

  const handleSimulateBedtimeLowBattery = () => {
    setBatteryGuard((prev) => ({
      ...prev,
      levelPct: 22,
      cableConnected: false,
      pcAlertActive: false,
      autoSilencedByDisconnect: false,
      bedtimeGuardTriggered: true,
      eveningTimeSimMin: 20 * 60 + 45,
    }));
    showToast('🔋 تنبيه وقائي قبل النوم (08:45 م · 22%): اشحن الهاتف قبل 09:15 م');
  };

  const handleToggleBypassCharging = (limit: number | null) => {
    const clamped = limit === null ? null : Math.max(60, Math.min(100, Math.round(limit)));
    const guardVal: 80 | 90 | null = clamped === null ? null : clamped <= 80 ? 80 : 90;
    setBatteryGuard((prev) => ({
      ...prev,
      bypassChargingLimitPct: guardVal,
      pcAlertActive: guardVal !== null ? false : prev.pcAlertActive,
    }));
    try {
      localStorage.setItem('dayrhythm_bypass_limit_v1', clamped === null ? 'off' : String(clamped));
    } catch {
      // ignore storage errors
    }
    if (clamped !== null) {
      updateAppSettings({ phoneChargeLimitPct: clamped });
    }
    showToast(
      clamped === null
        ? 'تم الرجوع لوضع الشحن العادي'
        : `🎮 تفعيل الشحن التجاوزي عند ${clamped}% (منع الإنذارات الوهمية)`
    );
  };

  const handleSimulateWindowsWake = () => {
    const ts = formatNow12hInTimeZone(activeTimeZone, 'ar');
    appendChangelog('Web/PC', `تعافي فوري من Sleep عبر WM_POWERBROADCAST (${ts})`, `Win32 Sleep/Wake recovery (${ts})`);
    showToast('💻 WM_POWERBROADCAST: تمت إعادة جدولة المنبهات والمزامنة فور استيقاظ ويندوز');
    return `PBT_APMRESUMEAUTOMATIC (${ts}) — تم تحديث المنبهات وجدول اليوم ✓`;
  };

  const hydrationToday = hydrationHistory[hydrationHistory.length - 1];

  // Stable (useCallback) so the effects that depend on handleLogWaterCup don't re-subscribe every render.
  //
  // ROOT CAUSE of "water cups revert on their own": this never armed localWriteLockUntilRef, so a
  // Firestore snapshot that arrived for any unrelated reason (even just the phone's battery ping)
  // while our own save was still in flight would re-derive hydrationHistory from the document as it
  // stood BEFORE this click — wiping out the cup you just logged. Same class of bug as the
  // lifeProfile toggles above; arming the lock here is the actual fix (every previous attempt only
  // patched symptoms around this).
  const updateTodayHydration = useCallback(
    (
      updater: (today: HydrationDayLog) => HydrationDayLog,
      dismissSignal?: { scope: 'alarm_dismiss'; action: string }
    ) => {
      const prev = hydrationHistoryRef.current;
      if (prev.length === 0) return;

      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      const rolled = rollOverHydrationHistoryIfNeeded(prev, targetCups, activeTimeZone);
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

      localWriteLockUntilRef.current = nowMs + 2500;
      hydrationHistoryRef.current = next;
      setHydrationHistory(next);

      const reachedTarget = updated.cupsLogged >= updated.targetCups;
      let nextTargetDone = streaks.waterTargetDoneToday;
      let nextTargetDays = streaks.waterTargetDays;

      if (reachedTarget && !streaks.waterTargetDoneToday) {
        nextTargetDone = true;
        nextTargetDays = streaks.waterTargetDays + 1;
      } else if (!reachedTarget && streaks.waterTargetDoneToday) {
        nextTargetDone = false;
        nextTargetDays = Math.max(0, streaks.waterTargetDays - 1);
      }

      setStreaks((s) => ({
        ...s,
        waterTargetDoneToday: nextTargetDone,
        waterTargetDays: nextTargetDays,
      }));

      const nextWeekly = next.map((d) => d.cupsLogged);

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...parsed, hydrationHistory: next, deviceSettings, lifeProfile })
        );
      } catch {
        // ignore storage quota
      }

      // Sync lastServerFieldsRef BEFORE pushing so reactive useEffect won't double-write the exact same change
      lastServerFieldsRef.current = {
        ...lastServerFieldsRef.current,
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

      void pushToTasksVaultImmediately({
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
                clientId: clientIdRef.current,
              },
            }
          : {}),
      });

      void pushFullCloudBackupImmediately();
    },
    [
      activeTimeZone,
      targetCups,
      streaks,
      deviceSettings,
      lifeProfile,
      pushToTasksVaultImmediately,
      pushFullCloudBackupImmediately,
    ]
  );

  const handleLogWaterCup = useCallback(
    (options?: { fromRemote?: boolean; waterOpId?: string; dateKey?: string }) => {
      stopContinuousAlert();
      stopNativeAlerts();
      setActiveAudioAlert(null);
      setPersistentAlert(null);
      setAlarmRinging(false);

      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      if (options?.dateKey && options.dateKey !== todayIso) return;

      const opId =
        options?.waterOpId ||
        `w_${Date.now().toString(36)}_${clientIdRef.current.slice(-4)}_${Math.random().toString(36).slice(2, 5)}`;

      if (!options?.fromRemote) {
        emitCrossDeviceSync('alarm_dismiss', 'water_confirmed', undefined, {
          alertId: 'water',
          waterOpId: opId,
          hydrationDateKey: todayIso,
        });
      }

      updateTodayHydration((today) => {
        const existingOpIds = today.slotOpIds || [];
        const removed = today.removedOpIds || [];
        if (existingOpIds.includes(opId) || removed.includes(opId)) {
          return today;
        }
        const nextIdx = today.slots.findIndex((filled) => !filled);
        if (nextIdx === -1) return today;
        const nextSlots = [...today.slots];
        nextSlots[nextIdx] = true;
        const nextSlotOpIds = Array.from({ length: today.targetCups }, (_, i) =>
          i === nextIdx ? opId : existingOpIds[i] || (nextSlots[i] ? `loc_s${i}` : '')
        );
        const nextLogged = nextSlots.filter(Boolean).length;
        return {
          ...today,
          slots: nextSlots,
          slotOpIds: nextSlotOpIds,
          cupsLogged: nextLogged,
        };
      }, options?.fromRemote ? undefined : { scope: 'alarm_dismiss', action: 'water_confirmed' });
    },
    [
      activeTimeZone,
      updateTodayHydration,
      stopContinuousAlert,
      stopNativeAlerts,
      emitCrossDeviceSync,
    ]
  );
  handleLogWaterCupRef.current = handleLogWaterCup;

  const handleToggleWaterSlot = (index: number) => {
    const todayIso = getDateIsoInTimeZone(activeTimeZone);
    const currentToday = hydrationHistoryRef.current[hydrationHistoryRef.current.length - 1];
    const becomingActive = currentToday ? !currentToday.slots[index] : true;
    const newOpId = becomingActive
      ? `w_${Date.now().toString(36)}_${clientIdRef.current.slice(-4)}_${index}`
      : '';

    if (becomingActive) {
      stopContinuousAlert();
      stopNativeAlerts();
      setActiveAudioAlert(null);
      setPersistentAlert(null);
      setAlarmRinging(false);
      emitCrossDeviceSync('alarm_dismiss', 'water_confirmed', undefined, {
        alertId: 'water',
        waterOpId: newOpId,
        hydrationDateKey: todayIso,
      });
    }

    updateTodayHydration(
      (today) => {
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
        const nextLogged = nextSlots.filter(Boolean).length;
        return {
          ...today,
          slots: nextSlots,
          slotOpIds: existingOpIds,
          removedOpIds: Array.from(removedSet).slice(-80),
          cupsLogged: nextLogged,
        };
      },
      becomingActive ? { scope: 'alarm_dismiss', action: 'water_confirmed' } : undefined
    );
  };

  // Handle PWA Home Screen App Shortcuts (/?action=water | meeting | voice)
  useEffect(() => {
    if (shortcutHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (!action) return;

    shortcutHandledRef.current = true;
    try {
      window.history.replaceState({}, '', window.location.pathname || '/');
    } catch {
      // ignore history errors
    }

    if (action === 'water') {
      setActiveTab('dashboard');
      setHydrationHistory((prev) => {
        const next = [...prev];
        const today = next[next.length - 1];
        if (!today) return prev;
        const nextIdx = today.slots.findIndex((filled) => !filled);
        if (nextIdx === -1) return prev;
        const nextSlots = [...today.slots];
        nextSlots[nextIdx] = true;
        const newCount = nextSlots.filter(Boolean).length;
        next[next.length - 1] = {
          ...today,
          slots: nextSlots,
          cupsLogged: newCount,
        };
        if (newCount >= today.targetCups) {
          setStreaks((s) =>
            s.waterTargetDoneToday
              ? s
              : {
                  ...s,
                  waterTargetDoneToday: true,
                  waterTargetDays: s.waterTargetDays + 1,
                }
          );
        }
        return next;
      });
      triggerHapticWaveform('water_cup');
      showToast('💧 اختصار سريع: تم تسجيل +1 كوب ماء بنجاح ✓');
    } else if (action === 'meeting') {
      setActiveTab('dashboard');
      handleSetQuietMode('vibrate_only', 30);
      triggerHapticWaveform('water_cup');
    } else if (action === 'voice') {
      setActiveTab('assistant');
      setAutoStartVoice(true);
      showToast('🎙️ اختصار سريع: فتح شات Gemini بالصوت');
    } else if (action === 'chat') {
      setActiveTab('assistant');
    }
  }, [showToast, handleSetQuietMode]);

  // Home-screen widget / native shortcuts while the app is already open.
  useEffect(() => {
    const onOpenAssistant = (ev: Event) => {
      const detail = (ev as CustomEvent<{ voice?: boolean }>).detail || {};
      setActiveTab('assistant');
      if (detail.voice) setAutoStartVoice(true);
    };
    window.addEventListener('dayrhythm:open-assistant', onOpenAssistant);
    return () => window.removeEventListener('dayrhythm:open-assistant', onOpenAssistant);
  }, []);

  // Active Water Cup & Multi-Dose Medication Reminder Engine (fires every 5s/30s tick, respects Fasting & Silence Sanctuaries)
  useEffect(() => {
    const todayIso = getDateIsoInTimeZone(activeTimeZone);
    const todayW = getWeekdayInTimeZone(activeTimeZone);

    // Android APK: these reminders are already exact native alarms (they ring even with the app
    // closed). Firing them here as well made the phone ring two or three times for one reminder.
    const nativeOwnsReminders = Boolean(
      (window as Window & { DayRhythmNative?: { scheduleExactAlarms?: unknown } }).DayRhythmNative
        ?.scheduleExactAlarms
    );
    if (!nativeOwnsReminders) {
    // 1. Water cup reminders (Emoji-only privacy notification — clicking confirms drinking)
    const deferWater = travelState.active && (travelState.deferredCategories?.includes('water') ?? false);
    if (waterRemindersEnabled && hydrationToday && !deferWater) {
      dailyRhythmPlan.hydrationSlots.forEach((slot, idx) => {
        if (hydrationToday.slots[idx]) return;
        if (lowEnergyActive && idx % 2 === 1) return;
        const diff = nowTickMin - slot.timeMinutes;
        if (diff >= 0 && diff <= 4) {
          const key = `${todayIso}:water:${slot.cupIndex}`;
          if (firedReminderKeysRef.current.has(key)) return;
          firedReminderKeysRef.current.add(key);
          triggerTaskAlert('💧', 'water', {
            privacyEmoji: '💧',
            displayTitle: `موعد شرب كوب ماء (${dailyRhythmPlan.cupSizeMl} مل)`,
            sourceLabel: 'ترطيب يومي',
          });
        }
      });
    }

    // 2. Medication & Supplement reminders (5-min high-visibility alert + sound + quick-confirm metadata)
    const deferredMedsSet = travelState.active ? new Set(travelState.deferredMedIds ?? []) : null;
    medications.forEach((med) => {
      if (deferredMedsSet?.has(med.id)) return;
      if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(todayW)) {
        return;
      }
      const times =
        med.times24 && med.times24.length > 0
          ? med.times24
          : med.time24
            ? [med.time24]
            : [];
      times.forEach((t24) => {
        const match = t24.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return;
        const medMin = Number(match[1]) * 60 + Number(match[2]);
        const diff = nowTickMin - medMin;
        if (diff < 0 || diff > 4) return;
        const takenDoses = med.takenDateKey === todayIso ? med.takenDosesToday ?? [] : [];
        const alreadyTaken =
          times.length > 1 ? takenDoses.includes(t24) : med.takenDateKey === todayIso;
        if (alreadyTaken) return;

        const key = `${todayIso}:med:${med.id}:${t24}`;
        if (firedReminderKeysRef.current.has(key)) return;
        firedReminderKeysRef.current.add(key);
        triggerTaskAlert('💊', 'medication', {
          privacyEmoji: '💊',
          displayTitle: `موعد الجرعة: ${med.name}`,
          sourceLabel: 'العلاجات والأدوية',
          medicationId: med.id,
          medicationDoseTime24: t24,
        });
      });
    });

    // 3. Live Google Calendar event reminders (5-min high-visibility alert on Secondary Screen / Side Dock / Mobile)
    const deferCalendar = travelState.active && (travelState.deferredCategories?.includes('calendar') ?? false);
    liveBlocks.forEach((block) => {
      if (
        block.deleted ||
        block.completed ||
        block.isAllDay ||
        block.source === 'prayer' ||
        block.reflowStatus === 'postponed_travel' ||
        (deferCalendar && block.source === 'google_calendar') ||
        (lowEnergyActive && !block.isAnchor && block.source !== 'google_calendar') ||
        acknowledgedBlockIdsRef.current.has(block.id)
      ) {
        return;
      }
      const diff = nowTickMin - block.startMin;
      if (diff >= 0 && diff <= 2) {
        const key = `${todayIso}:event:${block.id}:${block.startMin}`;
        if (firedReminderKeysRef.current.has(key)) return;
        firedReminderKeysRef.current.add(key);
        const emojiOnly = (block.emojiPair || '📅').trim();
        const cleanTitle = cleanCalendarText(block.categoryAr) || 'موعد في التقويم';
        const soundCat = classifyTaskSound(block.categoryAr, block.emojiPair, block.isAnchor);
        triggerTaskAlert(emojiOnly, soundCat, {
          privacyEmoji: emojiOnly,
          displayTitle: cleanTitle,
          sourceLabel: 'تقويم Google',
          description: block.description,
          blockId: block.id,
        });
      }
    });

    // 3B. Timed Google Tasks reminders (fires 5-minute persistent alert + sound when a timed task arrives!)
    const deferTasks = travelState.active && (travelState.deferredCategories?.includes('tasks') ?? false);
    if (!deferTasks && !lowEnergyActive) googleTasks.forEach((tk) => {
      if (tk.status === 'completed') return;
      const info = extractTaskTimeMinutesForToday(tk, todayIso, activeTimeZone);
      if (!info || !info.hasExplicitTime) return;
      const diff = nowTickMin - info.startMin;
      if (diff >= 0 && diff <= 2) {
        const key = `${todayIso}:gtask:${tk.id}:${info.startMin}`;
        if (firedReminderKeysRef.current.has(key)) return;
        firedReminderKeysRef.current.add(key);
        const cleanTitle = cleanCalendarText(tk.title) || 'مهمة مطلوبة الآن';
        const soundCat = classifyTaskSound(tk.title, '☑️', false);
        triggerTaskAlert('☑️', soundCat, {
          privacyEmoji: '☑️',
          displayTitle: cleanTitle,
          sourceLabel: tk.taskListTitle ? `مهام · ${tk.taskListTitle}` : 'مهام Google',
          taskId: tk.id,
          taskListId: tk.taskListId,
          description: tk.notes,
        });
      }
    });

    // 3C. Solar event alerts: Red Sun (Golden Hour, 6° above horizon) and Maghrib (Sunset)
    // Deduplication: firedReminderKeysRef prevents re-firing same event on same day.
    if (includePrayerAnchors && !lowEnergyActive) {
      const maghribItem = prayers.find((p) => p.id === 'maghrib');
      if (maghribItem) {
        // redSunMinutes is stored on the maghrib item by prayerEngine
        const redSunMin = (maghribItem as typeof maghribItem & { redSunMinutes?: number }).redSunMinutes;
        if (typeof redSunMin === 'number') {
          const diffRed = nowTickMin - redSunMin;
          if (diffRed >= 0 && diffRed <= 4) {
            const keyRed = `${todayIso}:redSun:${redSunMin}`;
            if (!firedReminderKeysRef.current.has(keyRed)) {
              firedReminderKeysRef.current.add(keyRed);
              triggerTaskAlert('🌇 ☀️', 'general', {
                privacyEmoji: '🌇',
                displayTitle: 'الشمس الحمراء · الساعة الذهبية',
                sourceLabel: 'مواقيت شمسية',
                description: `الشمس الحمراء · بداية الساعة الذهبية المسائية (${formatMinutes12h(redSunMin, 'ar')}) — الغروب بعد ~6 دقائق`,
              });
            }
          }
        }
        const diffMag = nowTickMin - maghribItem.adhanMinutes;
        if (diffMag >= 0 && diffMag <= 4) {
          const keyMag = `${todayIso}:maghrib_solar:${maghribItem.adhanMinutes}`;
          if (!firedReminderKeysRef.current.has(keyMag)) {
            firedReminderKeysRef.current.add(keyMag);
            triggerTaskAlert('🌆', 'general', {
              privacyEmoji: '🌆',
              displayTitle: 'غروب الشمس',
              sourceLabel: 'مواقيت شمسية',
              description: `غروب الشمس (${formatMinutes12h(maghribItem.adhanMinutes, 'ar')}) — وقت المغرب`,
            });
          }
        }
      }
    }
    } // end: reminders owned by native alarms on Android

    // 4. Proactive Medication Low-Stock Refill Reminder (default 3 days before running out)
    medications.forEach((med) => {
      if (typeof med.remainingDoses !== 'number' || med.remainingDoses < 0) return;
      const dosesPerDay = Math.max(
        1,
        med.times24 && med.times24.length > 0 ? med.times24.length : 1
      );
      const alertLeadDays = Math.max(1, Math.min(14, med.refillAlertDays ?? 3));
      const daysLeft = computeMedicationDaysLeft(
        med.remainingDoses,
        med.times24 && med.times24.length > 0 ? med.times24.length : 1,
        med.daysOfWeek
      );
      if (daysLeft <= alertLeadDays) {
        const refillKey = `${todayIso}:med_refill:${med.id}`;
        if (firedReminderKeysRef.current.has(refillKey)) return;
        firedReminderKeysRef.current.add(refillKey);
      }
    });
  }, [
    nowTickMin,
    waterRemindersEnabled,
    dailyRhythmPlan.hydrationSlots,
    dailyRhythmPlan.cupSizeMl,
    hydrationToday,
    medications,
    liveBlocks,
    googleTasks,
    activeTimeZone,
    activeSanctuary.type,
    quietMode,
    triggerTaskAlert,
    handleLogWaterCup,
    handleAcknowledgeAudioAlert,
    includePrayerAnchors,
    lowEnergyActive,
    prayers,
  ]);

  const handleSunlightSessionEnd = useCallback(
    (id: SunlightSessionId) => {
      const session = sunlightSessions.find((s) => s.id === id);
      if (!session || !session.enabled || session.isCloudBlocked) return;
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      const endKey = `${todayIso}:sunlight_end:${id}`;
      if (firedReminderKeysRef.current.has(endKey)) return;
      firedReminderKeysRef.current.add(endKey);
      if (activeSanctuary.type === 'none' && quietMode !== 'silent_all') {
        playSunlightChime('end');
      }
      triggerTaskAlert(session.emoji, 'general', {
        privacyEmoji: session.emoji,
        displayTitle: `انتهت جلسة ${session.labelAr}`,
        sourceLabel: 'الأشعة المفيدة',
        description: 'اكتملت مدة التعرّض للشمس اليوم',
      });
    },
    [sunlightSessions, activeTimeZone, activeSanctuary.type, quietMode, triggerTaskAlert]
  );

  // Daily Sunlight Exposure Chimes + Live/In-App Alerts (lead, start, end — deduplicated per session/day)
  useEffect(() => {
    if (!sunlightSettings.enabled || lowEnergyActive) return;
    if (travelState.active && (travelState.deferredCategories?.includes('sunlight') ?? false)) return;
    const todayIso = getDateIsoInTimeZone(activeTimeZone);
    const sanctuaryBlocked = activeSanctuary.type !== 'none' || quietMode === 'silent_all';
    for (const session of sunlightSessions) {
      if (!session.enabled || session.isCloudBlocked) continue;
      if (
        session.leadMinutes > 0 &&
        nowTickMin >= session.alertMinutes &&
        nowTickMin < session.startMinutes
      ) {
        const leadKey = `${todayIso}:sunlight_lead:${session.id}:${session.alertMinutes}`;
        if (!firedReminderKeysRef.current.has(leadKey)) {
          firedReminderKeysRef.current.add(leadKey);
          if (!sanctuaryBlocked) {
            playSunlightChime(session.id);
          }
          triggerTaskAlert(session.emoji, 'general', {
            privacyEmoji: session.emoji,
            displayTitle: `${session.labelAr} بعد ${session.leadMinutes} د`,
            sourceLabel: 'الأشعة المفيدة',
            description: session.descAr,
          });
        }
      }
      if (nowTickMin >= session.startMinutes && nowTickMin < session.endMinutes) {
        const startKey = `${todayIso}:sunlight_start:${session.id}:${session.startMinutes}`;
        if (!firedReminderKeysRef.current.has(startKey)) {
          firedReminderKeysRef.current.add(startKey);
          if (!sanctuaryBlocked) {
            playSunlightChime(session.id);
          }
          triggerTaskAlert(session.emoji, 'general', {
            privacyEmoji: session.emoji,
            displayTitle: `ابدأ ${session.labelAr} الآن (${session.durationMinutes} د)`,
            sourceLabel: 'الأشعة المفيدة',
            description: session.descAr,
          });
        }
      }
      if (nowTickMin >= session.endMinutes && nowTickMin <= session.endMinutes + 1) {
        const endKey = `${todayIso}:sunlight_end:${session.id}`;
        if (!firedReminderKeysRef.current.has(endKey)) {
          firedReminderKeysRef.current.add(endKey);
          if (!sanctuaryBlocked) {
            playSunlightChime('end');
          }
          triggerTaskAlert(session.emoji, 'general', {
            privacyEmoji: session.emoji,
            displayTitle: `انتهت جلسة ${session.labelAr}`,
            sourceLabel: 'الأشعة المفيدة',
            description: 'اكتملت مدة التعرّض للشمس اليوم',
          });
        }
      }
    }
  }, [
    sunlightSettings.enabled,
    sunlightSessions,
    nowTickMin,
    activeTimeZone,
    activeSanctuary.type,
    quietMode,
    triggerTaskAlert,
  ]);

  // Real-time Phone Battery Sync (Mobile publishes local battery; PC receives & displays)
  useEffect(() => {
    const isMobileClient = detectIsMobileDeviceClient();
    const nativeWindow = window as Window & {
      __dayRhythmNativeBattery?: {
        levelPct?: number;
        charging?: boolean;
        chargeTimeRemainingMin?: number;
        deviceLabel?: string;
        chargeLimitPct?: number;
        updatedAtMs?: number;
      };
      DayRhythmNative?: {
        getBatterySnapshotJson?: () => string;
      };
    };

    // 1. DESKTOP / PC RECEIVER:
    // We only listen for Phone battery telemetry forwarded from MainForm.cs via 'dayrhythm:native-battery'
    // NEVER poll navigator.getBattery() on PC, as that would read the PC's power state and overwrite the phone!
    if (!isMobileClient) {
      const onNativeBattery = (ev: Event) => {
        const detail = (
          ev as CustomEvent<{
            levelPct?: number;
            charging?: boolean;
            chargeTimeRemainingMin?: number;
            chargeLimitPct?: number;
            deviceLabel?: string;
            updatedAtMs?: number;
          }>
        ).detail;
        if (detail && typeof detail.levelPct === 'number') {
          const clampedLevel = Math.max(0, Math.min(100, Math.round(detail.levelPct)));
          const clampedEta =
            typeof detail.chargeTimeRemainingMin === 'number' && Number.isFinite(detail.chargeTimeRemainingMin)
              ? Math.max(-1, Math.min(1440, Math.round(detail.chargeTimeRemainingMin)))
              : -1;
          const limit =
            typeof detail.chargeLimitPct === 'number' && detail.chargeLimitPct > 0
              ? detail.chargeLimitPct
              : phoneChargeLimitRef.current;
          const incoming: PhoneBatteryTelemetry = {
            levelPct: clampedLevel,
            charging: Boolean(detail.charging),
            chargeLimitPct: limit,
            chargeTimeRemainingMin: detail.charging ? clampedEta : -1,
            updatedAtMs: typeof detail.updatedAtMs === 'number' ? detail.updatedAtMs : Date.now(),
            deviceLabel: detail.deviceLabel || 'OnePlus 12R',
          };
          setPhoneBattery(incoming);
          setBatteryGuard((prev) => ({
            ...prev,
            levelPct: incoming.levelPct,
            cableConnected: incoming.charging,
            pcAlertActive:
              incoming.charging &&
              incoming.levelPct >= incoming.chargeLimitPct &&
              prev.bypassChargingLimitPct === null,
            autoSilencedByDisconnect: !incoming.charging && prev.cableConnected,
          }));
        }
      };

      window.addEventListener('dayrhythm:native-battery', onNativeBattery);
      if (nativeWindow.__dayRhythmNativeBattery && typeof nativeWindow.__dayRhythmNativeBattery.levelPct === 'number') {
        const b = nativeWindow.__dayRhythmNativeBattery;
        setPhoneBattery({
          levelPct: Math.max(0, Math.min(100, Math.round(b.levelPct ?? 0))),
          charging: Boolean(b.charging),
          chargeLimitPct: b.chargeLimitPct || phoneChargeLimitRef.current,
          chargeTimeRemainingMin: b.charging ? (b.chargeTimeRemainingMin ?? -1) : -1,
          updatedAtMs: b.updatedAtMs || Date.now(),
          deviceLabel: b.deviceLabel || 'OnePlus 12R',
        });
      }

      return () => {
        window.removeEventListener('dayrhythm:native-battery', onNativeBattery);
      };
    }

    // 2. MOBILE PUBLISHER (Runs strictly on Phone: Android APK or mobile browser)
    let lastSentKey = '';
    let lastFirestorePushMs = 0;
    let pushedToFirestoreOnce = false;

    const pushPhoneBattery = (
      levelPct: number,
      charging: boolean,
      deviceLabel: string,
      chargeTimeRemainingMin = -1
    ) => {
      const clampedLevel = Math.max(0, Math.min(100, Math.round(levelPct)));
      const clampedEta =
        typeof chargeTimeRemainingMin === 'number' && Number.isFinite(chargeTimeRemainingMin)
          ? Math.max(-1, Math.min(1440, Math.round(chargeTimeRemainingMin)))
          : -1;
      const limit = phoneChargeLimitRef.current;
      const nowMs = Date.now();
      const snapshot: PhoneBatteryTelemetry = {
        levelPct: clampedLevel,
        charging,
        chargeLimitPct: limit,
        chargeTimeRemainingMin: charging ? clampedEta : -1,
        updatedAtMs: nowMs,
        deviceLabel: deviceLabel || 'OnePlus 12R',
      };
      const dedupeKey = `${clampedLevel}:${charging ? 1 : 0}:${limit}:${snapshot.chargeTimeRemainingMin}`;
      const changed = dedupeKey !== lastSentKey;
      if (changed) {
        lastSentKey = dedupeKey;
        setPhoneBattery(snapshot);
        // Push the same change over the Spirc WebSocket so the PC dashboard + floating capsule
        // update immediately instead of waiting for a Firestore round-trip. The native Android
        // shell already emits its own frame, so skip it there to avoid a duplicate broadcast.
        if (!nativeWindow.DayRhythmNative) {
          spircClusterRef.current?.sendJsonState(
            'phone_battery',
            SPIRC_ENTITY.STATE_V3,
            SPIRC_ACTION.BATTERY_TELEMETRY,
            snapshot
          );
        }
      }

      // On Android APK, native DayRhythmSyncService already publishes battery telemetry to Firestore.
      // Only publish from JS on mobile web browsers, and throttle unchanged charging updates to 3 minutes.
      if (
        !nativeWindow.DayRhythmNative &&
        firebaseUser?.uid &&
        firebaseUser.emailVerified &&
        firestoreSynced &&
        (!pushedToFirestoreOnce || changed || (charging && nowMs - lastFirestorePushMs > 180_000))
      ) {
        pushedToFirestoreOnce = true;
        lastFirestorePushMs = nowMs;
        void publishPhoneBatteryTelemetry(firebaseUser.uid, snapshot).catch(() => {});
      }
    };

    const onNativeBattery = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          levelPct?: number;
          charging?: boolean;
          chargeTimeRemainingMin?: number;
          deviceLabel?: string;
        }>
      ).detail;
      if (detail && typeof detail.levelPct === 'number') {
        pushPhoneBattery(
          detail.levelPct,
          Boolean(detail.charging),
          detail.deviceLabel || 'OnePlus 12R',
          typeof detail.chargeTimeRemainingMin === 'number' ? detail.chargeTimeRemainingMin : -1
        );
      }
    };
    window.addEventListener('dayrhythm:native-battery', onNativeBattery);

    // Pull immediate native battery snapshot (includes Android BatteryManager.computeChargeTimeRemaining)
    const pullNativeBatterySnapshot = () => {
      const snapshot = readNativeBatterySnapshot();
      if (!snapshot) return false;
      pushPhoneBattery(
        snapshot.levelPct,
        snapshot.charging,
        snapshot.deviceLabel,
        snapshot.chargeTimeRemainingMin
      );
      return true;
    };

    pullNativeBatterySnapshot();
    const nativePollTimer = nativeWindow.DayRhythmNative?.getBatterySnapshotJson
      ? window.setInterval(pullNativeBatterySnapshot, 30_000)
      : null;

    type BatteryManagerLike = {
      level: number;
      charging: boolean;
      chargingTime?: number;
      addEventListener: (type: string, listener: () => void) => void;
      removeEventListener: (type: string, listener: () => void) => void;
    };
    let batteryManager: BatteryManagerLike | null = null;
    let onWebBatteryChange: (() => void) | null = null;
    let pollTimer: number | null = null;

    const navWithBattery = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManagerLike>;
    };

    // Only query Web Battery API on mobile web browsers that lack the DayRhythmNative APK bridge
    if (!nativeWindow.DayRhythmNative && typeof navWithBattery.getBattery === 'function') {
      navWithBattery
        .getBattery()
        .then((bm) => {
          batteryManager = bm;
          const emitFromWeb = () => {
            const etaMin =
              bm.charging &&
              typeof bm.chargingTime === 'number' &&
              Number.isFinite(bm.chargingTime) &&
              bm.chargingTime > 0 &&
              bm.chargingTime < 86400
                ? Math.max(1, Math.round(bm.chargingTime / 60))
                : -1;
            pushPhoneBattery(Math.round(bm.level * 100), Boolean(bm.charging), 'الهاتف', etaMin);
          };
          onWebBatteryChange = emitFromWeb;
          emitFromWeb();
          bm.addEventListener('levelchange', emitFromWeb);
          bm.addEventListener('chargingchange', emitFromWeb);
          bm.addEventListener('chargingtimechange', emitFromWeb);
          pollTimer = window.setInterval(emitFromWeb, 25_000);
        })
        .catch(() => {
          // Battery Status API unavailable on this browser
        });
    }

    return () => {
      window.removeEventListener('dayrhythm:native-battery', onNativeBattery);
      if (nativePollTimer !== null) {
        window.clearInterval(nativePollTimer);
      }
      if (batteryManager && onWebBatteryChange) {
        batteryManager.removeEventListener('levelchange', onWebBatteryChange);
        batteryManager.removeEventListener('chargingchange', onWebBatteryChange);
        batteryManager.removeEventListener('chargingtimechange', onWebBatteryChange);
      }
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
    };
  }, [firebaseUser?.uid, firebaseUser?.emailVerified, firestoreSynced, wsConnected]);

  const handleStopSmartChargeAlert = useCallback(() => {
    stopSmartChargeCompleteAlert();
    stopNativeAlerts();
    setSmartChargeAudioActive(false);
    setPhoneChargeAlertDismissed(true);
    setPersistentAlert((prev) => (prev?.id.startsWith('charge_') ? null : prev));
    emitCrossDeviceSync('alarm_dismiss', 'charge_dismiss', undefined, { alertId: 'charge' });
    showToast('🔕 تم إسكات تنبيه الشحن على كل أجهزتك ✓ (هينبّه تاني في الشحنة الجاية)');
  }, [emitCrossDeviceSync, showToast, stopNativeAlerts]);

  const handleToggleSmartChargeKeepUntilUnplugged = useCallback(() => {
    const next = !appSettingsRef.current.smartChargeKeepUntilUnplugged;
    showToast(
      next
        ? '🔌 سيستمر منبّه الشحن بالرنين حتى فصل الموبايل من الشاحن (أو إيقافه يدوياً)'
        : '⏱️ سيتوقف منبّه الشحن تلقائياً بعد دقيقتين إذا لم يتم إيقافه'
    );
    updateAppSettings({ smartChargeKeepUntilUnplugged: next });
  }, [showToast, updateAppSettings]);

  const handleToggleSmartChargeAlertEnabled = useCallback(() => {
    const next = !appSettingsRef.current.smartChargeAlertEnabled;
    if (!next) {
      stopSmartChargeCompleteAlert();
      setSmartChargeAudioActive(false);
    }
    showToast(
      next
        ? `🔋 تم تفعيل التنبيه الذكي عند اكتمال الشحن (${appSettingsRef.current.phoneChargeLimitPct}%)`
        : '🔕 تم إيقاف التنبيه الصوتي التلقائي لاكتمال الشحن'
    );
    updateAppSettings({ smartChargeAlertEnabled: next });
    setPhoneBattery((prev) => {
      if (!prev) return prev;
      const updated: PhoneBatteryTelemetry = {
        ...prev,
        chargeLimitPct: appSettingsRef.current.phoneChargeLimitPct,
        updatedAtMs: Date.now(),
      };
      if (firebaseUser?.uid && firebaseUser.emailVerified) {
        void publishPhoneBatteryTelemetry(firebaseUser.uid, updated).catch(() => {});
      }
      return updated;
    });
  }, [firebaseUser?.uid, firebaseUser?.emailVerified, showToast, updateAppSettings, stopSmartChargeCompleteAlert]);

  // Settings changed from the Gemini chat (propose_app_settings). Each field is optional.
  const handleApplyAppSettings = useCallback(
    (patch: AppSettingsPatch) => {
      const appPatch: Partial<AppSyncSettings> = {};
      if (typeof patch.phoneChargeLimitPct === 'number') appPatch.phoneChargeLimitPct = patch.phoneChargeLimitPct;
      if (typeof patch.chargeAlertEnabled === 'boolean') {
        appPatch.smartChargeAlertEnabled = patch.chargeAlertEnabled;
        if (!patch.chargeAlertEnabled) {
          stopSmartChargeCompleteAlert();
          setSmartChargeAudioActive(false);
        }
      }
      if (typeof patch.chargeAlertKeepUntilUnplugged === 'boolean') appPatch.smartChargeKeepUntilUnplugged = patch.chargeAlertKeepUntilUnplugged;
      if (typeof patch.waterRemindersEnabled === 'boolean') appPatch.waterRemindersEnabled = patch.waterRemindersEnabled;
      if (typeof patch.sunMode === 'boolean') appPatch.sunMode = patch.sunMode;
      if (Object.keys(appPatch).length > 0) updateAppSettings(appPatch);

      if (patch.quietMode) {
        handleSetQuietMode(patch.quietMode, patch.quietMode === 'normal' ? 0 : Math.max(0, patch.quietModeMinutes ?? 0));
      }
      if (typeof patch.adhanSoundInSilent === 'boolean') handleToggleAdhanOverrideSilent();
      if (patch.language === 'ar' || patch.language === 'en') setLanguage(patch.language);
      if (patch.capsuleOrientation || patch.capsuleSize) {
        handleUpdateCapsulePrefs({
          orientation: patch.capsuleOrientation ?? capsulePrefs.orientation,
          size: patch.capsuleSize ?? capsulePrefs.size,
        });
      }
      const devicePatch: Partial<OnePlusDeviceSettings> = {};
      if (typeof patch.liveAlertsEnabled === 'boolean') devicePatch.liveAlertsEnabled = patch.liveAlertsEnabled;
      if (patch.liveAlertsLeadMinutes) devicePatch.liveAlertsLeadMinutes = patch.liveAlertsLeadMinutes;
      if (typeof patch.liveAlertsAlwaysOn === 'boolean') {
        devicePatch.liveAlertsAlwaysOn = patch.liveAlertsAlwaysOn;
      }
      if (typeof patch.liveAlertsShowCharging === 'boolean') {
        devicePatch.liveAlertsShowCharging = patch.liveAlertsShowCharging;
      }
      if (typeof patch.persistentCountdownNotif === 'boolean') {
        devicePatch.persistentCountdownNotif = patch.persistentCountdownNotif;
      }
      if (Object.keys(devicePatch).length > 0) handleUpdateDeviceSettings(devicePatch);
      if (patch.soundRepeats) {
        for (const [category, value] of Object.entries(patch.soundRepeats)) {
          if (value === undefined) continue;
          const setting: SoundRepeatSetting =
            value === 'continuous' ? 'continuous' : (Math.max(1, Math.min(10, Math.round(Number(value)))) as SoundRepeatSetting);
          handleUpdateSoundRepeat(category as TaskSoundCategory, setting);
        }
      }
      showToast('⚙️ تم تطبيق الإعدادات من Gemini ✓');
    },
    [
      capsulePrefs.orientation,
      capsulePrefs.size,
      handleSetQuietMode,
      handleToggleAdhanOverrideSilent,
      handleUpdateCapsulePrefs,
      handleUpdateDeviceSettings,
      handleUpdateSoundRepeat,
      showToast,
      stopSmartChargeCompleteAlert,
      updateAppSettings,
    ]
  );

  const handleTestSmartChargeAlert = useCallback(() => {
    if (smartChargeAudioActive) {
      handleStopSmartChargeAlert();
      return;
    }
    playBatteryFullSignature();
    showToast(`🔊 نغمة التنبيه الذكي عند وصول الموبايل إلى ${phoneChargeLimitRef.current}%`);
  }, [smartChargeAudioActive, handleStopSmartChargeAlert, showToast]);

  // Stop smart charge audio cleanly on unmount
  useEffect(() => {
    return () => {
      stopSmartChargeCompleteAlert();
    };
  }, []);

  // Charge-limit alert (default 90%) on BOTH the PC and the phone, so the phone gets unplugged
  // before 100% (keeping a Li-ion battery at 100% on the charger shortens its life).
  useEffect(() => {
    if (!phoneBattery) return;
    const isPhoneClient = detectIsMobileDeviceClient();

    if (!phoneBattery.charging || phoneBattery.levelPct < phoneBattery.chargeLimitPct - 2) {
      if (phoneChargeNotifiedCycleRef.current || smartChargeAudioActive) {
        stopSmartChargeCompleteAlert();
        setSmartChargeAudioActive(false);
        setPersistentAlert((prev) => (prev?.id.startsWith('charge_') ? null : prev));
      }
      phoneChargeNotifiedCycleRef.current = false;
      setPhoneChargeAlertDismissed(false);
      return;
    }

    if (
      smartChargeAlertEnabled &&
      phoneBattery.charging &&
      phoneBattery.levelPct >= phoneBattery.chargeLimitPct &&
      !phoneChargeNotifiedCycleRef.current
    ) {
      phoneChargeNotifiedCycleRef.current = true;
      setPhoneChargeAlertDismissed(false);

      const isAndroidNative = Boolean(
        (window as Window & { DayRhythmNative?: unknown }).DayRhythmNative
      );
      const showChargePopupAndNotify = () => {
        const currentTime12 = formatNow12hInTimeZone(activeTimeZone, 'ar');
        if (quietMode === 'silent_all' || activeSanctuary.type !== 'none') {
          showToast(
            `🔋 اكتمل شحن ${phoneBattery.deviceLabel || 'الموبايل'} (${phoneBattery.levelPct}%)`
          );
          return;
        }
        setPersistentAlert({
          id: `charge_${Date.now().toString(36)}`,
          emoji: `🔋 ${phoneBattery.levelPct}%`,
          title: `وصل شحن ${phoneBattery.deviceLabel || 'الموبايل'} إلى ${phoneBattery.levelPct}% — افصل الشاحن الآن`,
          sourceLabel: smartChargeKeepUntilUnplugged
            ? 'تنبيه الشحن · يرن دقيقة كل 5 دقائق حتى الفصل'
            : 'التنبيه الذكي لاكتمال الشحن',
          time12h: currentTime12,
          category: 'general',
          createdAtMs: Date.now(),
          durationMs: 60_000,
          isContinuous: true,
        });

        try {
          const wv = (
            window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } }
          ).chrome?.webview;
          if (wv?.postMessage) {
            wv.postMessage(
              JSON.stringify({
                type: 'native-alert',
                emoji: `🔋 ${phoneBattery.levelPct}%`,
                title: `وصل شحن ${phoneBattery.deviceLabel || 'الموبايل'} إلى ${phoneBattery.levelPct}% — افصل الشاحن`,
                sourceLabel: 'تنبيه الشحن · دقيقة كل 5 دقائق حتى الفصل',
                time12h: currentTime12,
                category: 'charge',
                isHydration: false,
                isContinuous: true,
                durationSeconds: 60,
              })
            );
          }
        } catch {
          // ignore WebView2 postMessage errors
        }
      };

      if (!isAndroidNative) {
        const audioResult = startSmartChargeCompleteAlert({
          sanctuary: activeSanctuary,
          keepRingingUntilUnplugged: smartChargeKeepUntilUnplugged,
          onCycleRestart: showChargePopupAndNotify,
          onAutoStop: () => setSmartChargeAudioActive(false),
        });
        if (audioResult.playedAudio) {
          setSmartChargeAudioActive(true);
        }
      }

      showChargePopupAndNotify();
      if (quietMode === 'silent_all' || activeSanctuary.type !== 'none') {
        return;
      }

      showToast(
        `🔋 التنبيه الذكي: وصل شحن ${phoneBattery.deviceLabel || 'الموبايل'} إلى ${phoneBattery.levelPct}% (الحد ${phoneBattery.chargeLimitPct}%)`
      );
    }
  }, [
    activeTimeZone,
    phoneBattery,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    smartChargeAudioActive,
    activeSanctuary,
    showToast,
  ]);

  const {
    handleToggleMedication,
    handleToggleMedicationDate,
    handleRefillMedication,
    handleAddMedication,
    handleDeleteMedication,
    handleExecuteMedicationActions,
  } = useMedicationActions({
    medications,
    setMedications,
    activeTimeZone,
    showToast,
    pushToTasksVaultImmediately,
    pushFullCloudBackupImmediately,
    getEffectiveUid: () =>
      firebaseUser?.uid ||
      authUser?.uid ||
      auth.currentUser?.uid ||
      localStorage.getItem(ACTIVE_UID_STORAGE_KEY) ||
      '',
    clientIdRef,
    onMedicationConfirmedAlertCleanup: (medicationId, doseTime24, fromRemote) => {
      stopContinuousAlert();
      stopNativeAlerts();
      setActiveAudioAlert(null);
      setPersistentAlert(null);
      setAlarmRinging(false);
      if (!fromRemote) {
        emitCrossDeviceSync('alarm_dismiss', 'medication_confirmed', undefined, {
          alertId: medicationId,
          medicationId,
          doseTime24,
        });
      }
    },
    onDeleteLinkedCalendarEvent: async (calendarEventId) => {
      try {
        const token = await getOrRefreshCalendarAccessToken();
        if (!token || !calendarEventId) return;
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(calendarEventId)}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
        );
      } catch {
        // non-blocking calendar cleanup
      }
    },
    triggerHapticWaveform,
  });
  handleToggleMedicationRef.current = handleToggleMedication;

  const handleAddCreativeActivity = useCallback(
    (input: {
      name: string;
      emoji?: string;
      cadence?: CreativeCadence;
      goalCount?: number;
      weeklyGoalSessions: number;
      sessionMinutes: number;
      expiresOnDate?: string;
    }) => {
      const cadence: CreativeCadence = input.cadence ?? 'weekly';
      const goalCount = input.goalCount ?? input.weeklyGoalSessions;
      const act = sanitizeCreativeActivityItem({
        id: sanitizeCreativeActivityId(
          `cr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        ),
        name: input.name,
        emoji: input.emoji || '🎨',
        cadence,
        goalCount,
        weeklyGoalSessions: Math.min(14, goalCount),
        sessionMinutes: input.sessionMinutes,
        loggedDates: [],
        scheduledTime24: '',
        calendarEventId: '',
        expiresOnDate: input.expiresOnDate ?? '',
      });
      setCreativeActivities((prev) => {
        const next = [...prev, act];
        void pushToTasksVaultImmediately({ creativeActivities: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
      showToast(`${act.emoji} تمت إضافة «${act.name}» وسيُوضع تلقائياً في أوقاتك الفاضية ✓`);
      return act;
    },
    [showToast, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleDeleteCreativeActivity = useCallback(
    (id: string) => {
      setCreativeActivities((prev) => {
        const next = prev.filter((a) => a.id !== id);
        void pushToTasksVaultImmediately({ creativeActivities: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
      showToast('تم حذف النشاط الإبداعي');
    },
    [showToast, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleScheduleCreativeInCalendar = useCallback(
    async (placement: CreativeActivityPlacement) => {
      if (!placement.suggestedSlot) {
        showToast('لا توجد فترة فراغ كافية متبقية اليوم — يمكنك جدولته عبر شات Gemini لغدٍ');
        return;
      }
      const action: CalendarActionProposal = {
        operation: 'create',
        calendarId: 'primary',
        title: `${placement.activity.emoji} ${placement.activity.name}`,
        dateIso: getDateIsoInTimeZone(activeTimeZone),
        startTime24: placement.suggestedSlot.time24,
        durationMinutes: placement.activity.sessionMinutes,
        description: `نشاط إبداعي مجدول في وقت فراغك · الهدف: ${placement.goalInPeriod} جلسات (${placement.periodLabelAr})`,
      };
      const res = await handleExecuteCalendarActions([action]);
      const createdId = res.results[0]?.id ?? '';
      setCreativeActivities((prev) => {
        const next = prev.map((a) => {
          if (a.id !== placement.activity.id) return a;
          const updated: CreativeActivityItem = {
            ...a,
            scheduledTime24: placement.suggestedSlot!.time24,
            calendarEventId: createdId || a.calendarEventId,
          };
          return updated;
        });
        void pushToTasksVaultImmediately({ creativeActivities: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
    },
    [
      activeTimeZone,
      handleExecuteCalendarActions,
      showToast,
      pushToTasksVaultImmediately,
      pushFullCloudBackupImmediately,
    ]
  );

  const handleExecuteCreativeActions = useCallback(
    async (
      creativeActions: CreativeActivityActionProposal[],
      linkedCalendarIds?: Record<string, string>
    ): Promise<CreativeExecutionResult[]> => {
      const todayIso = getDateIsoInTimeZone(activeTimeZone);
      const results: CreativeExecutionResult[] = [];

      setCreativeActivities((prev) => {
        let next = [...prev];
        for (const act of creativeActions) {
          const op = act.operation;
          if (op === 'remove') {
            const target = next.find(
              (a) =>
                (act.activityId && a.id === act.activityId) ||
                a.name.trim() === act.name.trim()
            );
            if (target) {
              next = next.filter((a) => a.id !== target.id);
              results.push({ name: target.name, operation: 'remove', status: 'removed', id: target.id });
            }
          } else if (op === 'log_session' || op === 'log_today') {
            const target = next.find(
              (a) =>
                (act.activityId && a.id === act.activityId) ||
                a.name.includes(act.name.trim())
            );
            if (target) {
              const nextDates = target.loggedDates.includes(todayIso)
                ? target.loggedDates
                : [...target.loggedDates, todayIso].slice(-30);
              const updated: CreativeActivityItem = { ...target, loggedDates: nextDates };
              next = next.map((a) => (a.id === target.id ? updated : a));
              results.push({ name: target.name, operation: 'log_session', status: 'logged', id: target.id });
            }
          } else {
            const existing = next.find(
              (a) =>
                (act.activityId && a.id === act.activityId) ||
                a.name.trim() === act.name.trim()
            );
            const calId = linkedCalendarIds?.[act.name] ?? '';
            if (existing) {
              const nextCadence = act.cadence ?? existing.cadence ?? 'weekly';
              const nextGoal =
                act.goalCount ?? act.weeklyGoalSessions ?? existing.goalCount ?? existing.weeklyGoalSessions;
              const updated = sanitizeCreativeActivityItem({
                ...existing,
                name: act.name || existing.name,
                emoji: act.emoji ?? existing.emoji,
                cadence: nextCadence,
                goalCount: nextGoal,
                weeklyGoalSessions: Math.min(14, nextGoal),
                sessionMinutes: act.sessionMinutes ?? existing.sessionMinutes,
                scheduledTime24: act.scheduledTime24 ?? existing.scheduledTime24,
                calendarEventId: calId || existing.calendarEventId,
                expiresOnDate: act.expiresOnDate ?? existing.expiresOnDate,
              });
              next = next.map((a) => (a.id === existing.id ? updated : a));
              results.push({ name: updated.name, operation: 'update', status: 'updated', id: updated.id });
            } else {
              const nextCadence: CreativeCadence = act.cadence ?? 'weekly';
              const nextGoal =
                act.goalCount ??
                act.weeklyGoalSessions ??
                (nextCadence === 'daily' ? 1 : nextCadence === 'monthly' ? 8 : 3);
              const created = sanitizeCreativeActivityItem({
                id: sanitizeCreativeActivityId(
                  act.activityId || `cr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
                ),
                name: act.name,
                emoji: act.emoji ?? '🎨',
                cadence: nextCadence,
                goalCount: nextGoal,
                weeklyGoalSessions: Math.min(14, nextGoal),
                sessionMinutes: act.sessionMinutes ?? 30,
                loggedDates: [],
                scheduledTime24: act.scheduledTime24 ?? '',
                calendarEventId: calId,
                expiresOnDate: act.expiresOnDate ?? '',
              });
              next = [...next, created];
              results.push({ name: created.name, operation: 'add', status: 'added', id: created.id });
            }
          }
        }
        void pushToTasksVaultImmediately({ creativeActivities: next });
        void pushFullCloudBackupImmediately();
        try {
          localStorage.setItem(CREATIVE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });

      return results;
    },
    [activeTimeZone, pushToTasksVaultImmediately, pushFullCloudBackupImmediately]
  );

  const handleToggleDailyCommitmentStreak = () => {
    localWriteLockUntilRef.current = Date.now() + 300;

    setStreaks((s) => {
      const nextDone = !s.dailyCommitmentDoneToday;
      const nextDays = nextDone
        ? s.dailyCommitmentDays + 1
        : Math.max(0, s.dailyCommitmentDays - 1);
      const nextStreaks = {
        ...s,
        dailyCommitmentDoneToday: nextDone,
        dailyCommitmentDays: nextDays,
      };

      void pushToTasksVaultImmediately({
        dailyCommitmentDays: nextDays,
        dailyCommitmentDoneToday: nextDone,
        waterTargetDays: s.waterTargetDays,
        waterTargetDoneToday: s.waterTargetDoneToday,
      });

      void pushFullCloudBackupImmediately();

      return nextStreaks;
    });
  };

  // Next untaken medication dose for today (used by Floating Capsule 1-tap Check-In & Windows Tray Capsule)
  const nextMedicationQuick = useMemo(() => {
    const todayW = getWeekdayInTimeZone(activeTimeZone);
    const candidates: Array<{
      id: string;
      name: string;
      doseTime24?: string;
      timeLabel?: string;
      sortMin: number;
    }> = [];
    for (const med of medications) {
      if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(todayW)) {
        continue;
      }
      const times =
        med.times24 && med.times24.length > 0 ? med.times24 : med.time24 ? [med.time24] : [];
      const takenDoses = med.takenDateKey === todayCairoIso ? med.takenDosesToday ?? [] : [];
      if (times.length === 0) {
        if (med.takenDateKey !== todayCairoIso) {
          candidates.push({ id: med.id, name: med.name, sortMin: 24 * 60 + 1 });
        }
        continue;
      }
      for (const t24 of times) {
        const alreadyTaken =
          times.length > 1 ? takenDoses.includes(t24) : med.takenDateKey === todayCairoIso;
        if (alreadyTaken) continue;
        const m = t24.match(/^(\d{1,2}):(\d{2})$/);
        const min = m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60;
        candidates.push({
          id: med.id,
          name: med.name,
          doseTime24: times.length > 1 ? t24 : undefined,
          timeLabel: m ? formatMinutes12h(min, 'ar') : undefined,
          sortMin: min,
        });
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.sortMin - b.sortMin);
    const upcoming = candidates.find((c) => c.sortMin >= nowTickMin - 15) ?? candidates[0];
    return {
      id: upcoming.id,
      name: upcoming.name,
      doseTime24: upcoming.doseTime24,
      timeLabel: upcoming.timeLabel,
    };
  }, [activeTimeZone, medications, nowTickMin, todayCairoIso]);

  // Feature #4: One-Click Full JSON Backup Export & Restore (zero OAuth tokens or secrets!)
  const { handleExportBackupJson, handleImportBackupJson } = useBackupActions({
    activeTimeZone,
    adhanOverrideSilent,
    capsulePrefs,
    creativeActivities,
    deviceSettings,
    firebaseUser,
    firestoreSynced,
    hydrationHistory,
    lifeProfile,
    localWriteLockUntilRef,
    medications,
    memories,
    pushFullCloudBackupImmediately,
    pushToTasksVaultImmediately,
    quietMode,
    selectedLogoId,
    setCapsulePrefs,
    setCreativeActivities,
    setDeviceSettings,
    setHydrationHistory,
    setLifeProfile,
    setMedications,
    setMemories,
    setSelectedLogoId,
    setStreaks,
    showToast,
    streaks,
    surfaceTheme,
    targetCups,
  });

  // Confirm hydration, medication, snooze & Android background quick actions (Windows Screen 2, Android Notifications, Desktop Capsule)
  useEffect(() => {
    const processAndroidQuickActions = (rawJson?: string | null) => {
      if (!rawJson || rawJson === '[]') return;
      try {
        const items = JSON.parse(rawJson) as Array<{
          kind?: string;
          medicationId?: string;
          doseTime24?: string;
        }>;
        if (!Array.isArray(items) || items.length === 0) return;
        for (const item of items) {
          if (item.kind === 'water') {
            handleLogWaterCup();
          } else if (item.kind === 'medication' && item.medicationId) {
            handleToggleMedication(item.medicationId, item.doseTime24 || undefined);
          }
        }
        stopContinuousAlert();
        setActiveAudioAlert(null);
        setPersistentAlert(null);
        setAlarmRinging(false);
        const effectiveUid =
          firebaseUser?.uid ||
          authUser?.uid ||
          auth.currentUser?.uid ||
          localStorage.getItem(ACTIVE_UID_STORAGE_KEY) ||
          '';
        if (effectiveUid) {
          void setCloudAlertSession(effectiveUid, {
            status: 'dismissed',
            alertId: 'all',
            dismissedBy: clientIdRef.current,
            dismissedAtMs: Date.now(),
          });
          void dismissActiveAlarmInCloud(effectiveUid, 'all', clientIdRef.current);
        }
        emitCrossDeviceSync('alarm_dismiss', 'native_action');
        showToast(`✓ تمت مزامنة ${items.length} إجراء وإيقاف التنبيه على أجهزتك`);
      } catch {
        // ignore malformed Android action queue
      }
    };

    const flushAndroidPendingActions = () => {
      const androidBridge = (
        window as Window & {
          DayRhythmNative?: { consumePendingNativeActions?: () => string };
        }
      ).DayRhythmNative;
      if (androidBridge?.consumePendingNativeActions) {
        try {
          processAndroidQuickActions(androidBridge.consumePendingNativeActions());
        } catch {
          // ignore Android bridge errors
        }
      }
    };

    flushAndroidPendingActions();

    const onWaterConfirmed = () => {
      handleLogWaterCup();
    };
    const onMedicationConfirmed = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{ medicationId?: string; doseTime24?: string }>
      ).detail;
      if (detail?.medicationId) {
        handleToggleMedication(detail.medicationId, detail.doseTime24 || undefined);
        return;
      }
      stopContinuousAlert();
      stopNativeAlerts();
      setActiveAudioAlert(null);
      setPersistentAlert(null);
      setAlarmRinging(false);
      emitCrossDeviceSync('alarm_dismiss', 'med_confirmed', undefined, { alertId: 'medication' });
    };
    const onQuickMedConfirm = () => {
      if (nextMedicationQuick) {
        handleToggleMedication(nextMedicationQuick.id, nextMedicationQuick.doseTime24);
      } else {
        showToast('✓ لا توجد جرعات علاج متبقية اليوم');
      }
    };
    const onAlertSnoozed = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          id?: string;
          emoji?: string;
          title?: string;
          sourceLabel?: string;
          category?: TaskSoundCategory;
          isHydration?: boolean;
          medicationId?: string;
          medicationDoseTime24?: string;
          minutes?: number;
          localOnly?: boolean;
        }>
      ).detail;
      const alertItem: PersistentAlertItem = {
        id: detail?.id || `snooze_${Date.now()}`,
        emoji: detail?.emoji || '🔔',
        title: detail?.title || 'تذكير مؤجّل',
        sourceLabel: detail?.sourceLabel || 'إيقاع اليوم',
        time12h: formatNow12hInTimeZone(activeTimeZone, 'ar'),
        category: detail?.category || 'general',
        createdAtMs: Date.now(),
        durationMs: 60_000,
        isHydration: Boolean(detail?.isHydration),
        medicationId: detail?.medicationId || undefined,
        medicationDoseTime24: detail?.medicationDoseTime24 || undefined,
      };
      handleSnoozeAlert(alertItem, detail?.minutes || 5, { localOnly: Boolean(detail?.localOnly) });
    };
    const onNativeQuickActions = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (typeof detail === 'string') {
        processAndroidQuickActions(detail);
      } else {
        flushAndroidPendingActions();
      }
    };
    const onAlertDismissed = (ev: Event) => {
      const detail = (ev as CustomEvent<{ remote?: boolean; snooze?: boolean }>).detail;
      if (detail?.remote) {
        stopContinuousAlert();
        stopSmartChargeCompleteAlert();
        setSmartChargeAudioActive(false);
        setActiveAudioAlert(null);
        setPersistentAlert(null);
        setAlarmRinging(false);
        return;
      }
      handleAcknowledgeAudioAlert();
    };
    const onCloudAlertTrigger = (ev: Event) => {
      const detail = (ev as CustomEvent<{
        title?: string;
        body?: string;
        kind?: TaskSoundCategory;
        emoji?: string;
        privacyEmoji?: string;
        sourceLabel?: string;
        blockId?: string;
        bypassSanctuary?: boolean;
        action?: string;
      }>).detail;
      setAlarmRinging(true);
      const badge = detail?.privacyEmoji || detail?.emoji || '🔔';
      triggerTaskAlert(badge, detail?.kind || 'general', {
        privacyEmoji: badge,
        displayTitle: detail?.title || 'تنبيه متزامن',
        description: detail?.body,
        sourceLabel: detail?.sourceLabel || 'مزامنة فورية بين أجهزتك',
        blockId: detail?.blockId,
        isRemoteSignal: true,
        bypassSanctuary: Boolean(detail?.bypassSanctuary || detail?.action === 'test_ring'),
      });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') flushAndroidPendingActions();
    };

    window.addEventListener('dayrhythm:water-confirmed', onWaterConfirmed);
    window.addEventListener('dayrhythm:medication-confirmed', onMedicationConfirmed);
    window.addEventListener('dayrhythm:quick-med-confirm', onQuickMedConfirm);
    window.addEventListener('dayrhythm:alert-snoozed', onAlertSnoozed);
    window.addEventListener('dayrhythm:native-quick-actions', onNativeQuickActions);
    window.addEventListener('dayrhythm:alert-dismissed', onAlertDismissed);
    window.addEventListener('dayrhythm:cloud-alert-trigger', onCloudAlertTrigger);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('dayrhythm:water-confirmed', onWaterConfirmed);
      window.removeEventListener('dayrhythm:medication-confirmed', onMedicationConfirmed);
      window.removeEventListener('dayrhythm:quick-med-confirm', onQuickMedConfirm);
      window.removeEventListener('dayrhythm:alert-snoozed', onAlertSnoozed);
      window.removeEventListener('dayrhythm:native-quick-actions', onNativeQuickActions);
      window.removeEventListener('dayrhythm:alert-dismissed', onAlertDismissed);
      window.removeEventListener('dayrhythm:cloud-alert-trigger', onCloudAlertTrigger);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [
    activeTimeZone,
    emitCrossDeviceSync,
    handleAcknowledgeAudioAlert,
    handleLogWaterCup,
    handleSnoozeAlert,
    handleToggleMedication,
    nextMedicationQuick,
    showToast,
    stopNativeAlerts,
  ]);

  const [capsuleNowMs, setCapsuleNowMs] = useState<number>(() => Date.now());

  // Show "الورد والالتزام اليومي" ONLY when signed in AND user actually has that habit in their account
  const hasDailyWirdHabit = useMemo(() => {
    if (needsAuth || !firebaseUser?.uid || firebaseUser.isAnonymous) return false;
    if (streaks.dailyCommitmentDays > 0 || streaks.dailyCommitmentDoneToday) return true;
    const wirdRe = /(ورد|الورد|قرآن|قران|أذكار|اذكار|تلاوة|الالتزام اليومي|🌱)/i;
    if (calendarEvents.some((e) => wirdRe.test(`${e.summary ?? ''} ${e.description ?? ''}`))) return true;
    if (googleTasks.some((tk) => wirdRe.test(`${tk.title ?? ''} ${tk.notes ?? ''}`))) return true;
    if (creativeActivities.some((a) => wirdRe.test(`${a.name} ${a.emoji}`))) return true;
    if (memories.some((m) => wirdRe.test(m.ruleText))) return true;
    return false;
  }, [
    needsAuth,
    firebaseUser?.uid,
    firebaseUser?.isAnonymous,
    streaks.dailyCommitmentDays,
    streaks.dailyCommitmentDoneToday,
    calendarEvents,
    googleTasks,
    creativeActivities,
    memories,
  ]);

  const nextActiveBlock = useMemo(() => {
    if (needsAuth && !useOfflineDemo) return null;
    const nowMin = getNowMinutesInTimeZone(activeTimeZone, new Date(capsuleNowMs));
    return (
      liveBlocks.find(
        (b) =>
          !b.completed &&
          !b.deleted &&
          (b.isAllDay || b.startMin + Math.max(1, b.durationMin) > nowMin)
      ) ?? null
    );
  }, [needsAuth, useOfflineDemo, liveBlocks, activeTimeZone, capsuleNowMs]);

  const capsuleTimerState = useMemo(() => {
    const display = resolveBlockDisplayInfo(nextActiveBlock);
    const fallbackEmoji = (nextActiveBlock?.emojiPair || '✅').split(' ')[0] || '📅';

    if (needsAuth && !useOfflineDemo) {
      return {
        emoji: '🔐',
        title: 'سجّل الدخول بحساب Google',
        statusLabel: 'بانتظار الربط السحابي',
        sourceKind: 'none' as const,
        countdownText: '00:00',
        isNow: false,
        isUrgent: false,
        progressRatio: 0,
        targetEpochMs: 0,
        durationSeconds: 0,
        calendarTrack: null as CapsuleTrackInfo | null,
        taskTrack: null as CapsuleTrackInfo | null,
        upcomingQueue: [] as CapsuleTrackInfo[],
      };
    }

    // Active user timezone wall-clock seconds since midnight for smooth countdown transitions
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: activeTimeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(capsuleNowMs));
    const hhRaw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const hh = hhRaw === 24 ? 0 : hhRaw;
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const ss = Number(parts.find((p) => p.type === 'second')?.value ?? '0');
    const nowSecOfDay = hh * 3600 + mm * 60 + ss;

    interface UnifiedCapsuleCandidate {
      sourceKind: 'calendar' | 'water' | 'medication' | 'task';
      emoji: string;
      title: string;
      clockLabel: string;
      startSec: number;
      endSec: number;
      targetSec: number;
      isNow: boolean;
      durationSec: number;
    }

    const candidates: UnifiedCapsuleCandidate[] = [];

    // 1. Remaining / active timed Google Calendar & Prayer blocks today
    const deferCalendarCapsule = travelState.active && (travelState.deferredCategories?.includes('calendar') ?? false);
    for (const block of liveBlocks) {
      if (
        block.completed ||
        block.deleted ||
        block.isAllDay ||
        block.reflowStatus === 'postponed_travel' ||
        (deferCalendarCapsule && block.source === 'google_calendar') ||
        acknowledgedBlockIdsRef.current.has(block.id)
      ) continue;
      if (block.id.startsWith('sunlight_')) {
        const matchedSun = sunlightSessions.find((s) => `sunlight_${s.id}` === block.id);
        if (matchedSun?.isCloudBlocked) continue;
      }
      const startSec = block.startMin * 60;
      const isZeroDuration = (block.durationMin ?? 0) === 0;
      const durationSec = isZeroDuration ? 0 : Math.max(60, block.durationMin * 60);
      const endSec = startSec + durationSec;
      if (isZeroDuration ? nowSecOfDay >= startSec : endSec <= nowSecOfDay) continue;
      const isNow = !isZeroDuration && nowSecOfDay >= startSec && nowSecOfDay < endSec;
      const bDisplay = resolveBlockDisplayInfo(block);
      const prayerEffectiveMin =
        block.source === 'prayer' ? block.startMin + lifeProfile.adhanLeadMinutes : block.startMin;
      candidates.push({
        sourceKind: 'calendar',
        emoji: (block.emojiPair || '📅').split(' ')[0] || '📅',
        title: bDisplay.title,
        clockLabel: formatMinutes12h(prayerEffectiveMin, 'ar'),
        startSec,
        endSec,
        targetSec: isZeroDuration ? startSec : (isNow ? endSec : startSec),
        isNow,
        durationSec,
      });
    }

    // 2. Next Upcoming Water Cup from today's scientific hydration schedule (always advance when due passes)
    const deferWaterCapsule = travelState.active && (travelState.deferredCategories?.includes('water') ?? false);
    const hydrationTodayEntry = hydrationHistory[hydrationHistory.length - 1];
    if (!deferWaterCapsule && hydrationTodayEntry && dailyRhythmPlan.hydrationSlots.length > 0) {
      const nextUpcomingCup = dailyRhythmPlan.hydrationSlots.find(
        (slot, idx) => !hydrationTodayEntry.slots[idx] && slot.timeMinutes * 60 > nowSecOfDay
      );
      if (nextUpcomingCup) {
        const startSec = nextUpcomingCup.timeMinutes * 60;
        const durationSec = 5 * 60;
        candidates.push({
          sourceKind: 'water',
          emoji: '💧',
          title: `كوب ماء ${nextUpcomingCup.cupIndex}`,
          clockLabel: formatMinutes12h(nextUpcomingCup.timeMinutes, 'ar'),
          startSec,
          endSec: startSec + durationSec,
          targetSec: startSec,
          isNow: false,
          durationSec,
        });
      }
    }

    // 3. Upcoming Medication & Supplement doses for today (not yet taken)
    const deferredMedsCapsule = travelState.active ? new Set(travelState.deferredMedIds ?? []) : null;
    const todayWeekday = getWeekdayInTimeZone(activeTimeZone);
    for (const med of medications) {
      if (deferredMedsCapsule?.has(med.id)) continue;
      if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(todayWeekday)) {
        continue;
      }
      const times =
        med.times24 && med.times24.length > 0
          ? med.times24
          : med.time24
            ? [med.time24]
            : [];
      const takenDoses = med.takenDateKey === todayCairoIso ? med.takenDosesToday ?? [] : [];
      for (const t24 of times) {
        const match = t24.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) continue;
        const alreadyTaken =
          times.length > 1 ? takenDoses.includes(t24) : med.takenDateKey === todayCairoIso;
        if (alreadyTaken) continue;
        const medMin = Number(match[1]) * 60 + Number(match[2]);
        const startSec = medMin * 60;
        const durationSec = 10 * 60;
        const endSec = startSec + durationSec;
        if (endSec <= nowSecOfDay) continue;
        const isNow = nowSecOfDay >= startSec && nowSecOfDay < endSec;
        candidates.push({
          sourceKind: 'medication',
          emoji: '💊',
          title: med.name,
          clockLabel: formatMinutes12h(medMin, 'ar'),
          startSec,
          endSec,
          targetSec: isNow ? endSec : startSec,
          isNow,
          durationSec,
        });
      }
    }

    // 4. Active / upcoming Google Tasks for today (with explicit time competing directly by nearest timestamp!)
    let untimedTaskFallback: GoogleTaskItem | null = null;
    const deferTasksCapsule = travelState.active && (travelState.deferredCategories?.includes('tasks') ?? false);
    if (!deferTasksCapsule) for (const tk of googleTasks) {
      const info = extractTaskTimeMinutesForToday(tk, todayCairoIso, activeTimeZone);
      if (!info) continue;
      if (!info.hasExplicitTime) {
        if (!untimedTaskFallback) untimedTaskFallback = tk;
        continue;
      }
      const startSec = info.startMin * 60;
      const durationSec = 15 * 60;
      const endSec = startSec + durationSec;
      if (endSec <= nowSecOfDay) continue;
      const isNow = nowSecOfDay >= startSec && nowSecOfDay < endSec;
      const cleanTitle = cleanCalendarText(tk.title) || 'مهمة';
      candidates.push({
        sourceKind: 'task',
        emoji: '☑️',
        title: cleanTitle,
        clockLabel: formatMinutes12h(info.startMin, 'ar'),
        startSec,
        endSec,
        targetSec: isNow ? endSec : startSec,
        isNow,
        durationSec,
      });
    }

    candidates.sort((a, b) => a.targetSec - b.targetSec);
    const activeCandidates = candidates.filter((c) => c.targetSec > nowSecOfDay);

    const buildTrack = (c: UnifiedCapsuleCandidate): CapsuleTrackInfo => {
      const remSec = Math.max(0, c.targetSec - nowSecOfDay);
      const countdownText = formatCountdown(remSec * 1000);
      const statusLabel =
        c.sourceKind === 'water'
          ? c.isNow
            ? 'موعد شرب الماء الآن'
            : `الكوب القادم · ${c.clockLabel}`
          : c.sourceKind === 'medication'
            ? c.isNow
              ? 'موعد الجرعة الآن'
              : `جرعة قادمة · ${c.clockLabel}`
            : c.sourceKind === 'task'
              ? c.isNow
                ? 'مهمة الآن'
                : `مهمة · ${c.clockLabel}`
              : c.isNow
                ? 'جارٍ الآن'
                : `موعد · ${c.clockLabel}`;
      return {
        emoji: c.emoji,
        title: c.title,
        statusLabel,
        clockLabel: c.clockLabel,
        countdownText,
        isNow: c.isNow,
        isUrgent: remSec > 0 && remSec <= 60,
        targetEpochMs:
          remSec > 0 ? capsuleNowMs - (capsuleNowMs % 1000) + remSec * 1000 : 0,
        durationSeconds: c.durationSec,
      };
    };

    const nearestCalendar = activeCandidates.find((c) => c.sourceKind === 'calendar') ?? null;
    // Secondary track highlights the nearest upcoming non-calendar rhythm item (Water Cup / Medication / Timed Task)
    const nearestRhythmOrTask =
      activeCandidates.find((c) => c.sourceKind !== 'calendar') ?? null;

    const calendarTrack: CapsuleTrackInfo | null = nearestCalendar
      ? buildTrack(nearestCalendar)
      : nextActiveBlock?.isAllDay
        ? {
            emoji: fallbackEmoji,
            title: display.title,
            statusLabel: 'طوال اليوم',
            countdownText: 'اليوم',
            isNow: true,
            isUrgent: false,
            targetEpochMs: 0,
            durationSeconds: 0,
          }
        : null;

    const taskTrack: CapsuleTrackInfo | null = nearestRhythmOrTask
      ? buildTrack(nearestRhythmOrTask)
      : untimedTaskFallback
        ? {
            emoji: '☑️',
            title: cleanCalendarText(untimedTaskFallback.title) || 'مهمة اليوم',
            statusLabel: 'مهام اليوم',
            countdownText: 'اليوم',
            isNow: false,
            isUrgent: false,
            targetEpochMs: 0,
            durationSeconds: 0,
          }
        : null;

    const upcomingQueue: CapsuleTrackInfo[] = activeCandidates.slice(0, 4).map(buildTrack);
    if (upcomingQueue.length < 4 && untimedTaskFallback) {
      upcomingQueue.push({
        emoji: '☑️',
        title: cleanCalendarText(untimedTaskFallback.title) || 'مهمة اليوم',
        statusLabel: 'مهام اليوم',
        countdownText: 'اليوم',
        isNow: false,
        isUrgent: false,
        targetEpochMs: 0,
        durationSeconds: 0,
      });
    }

    const winner = activeCandidates[0];

    if (winner) {
      const winnerTrack = buildTrack(winner);
      const remainingSec = Math.max(0, winner.targetSec - nowSecOfDay);
      const progressRatio = winner.isNow
        ? Math.min(1, Math.max(0, (nowSecOfDay - winner.startSec) / winner.durationSec))
        : 0;

      return {
        emoji: winnerTrack.emoji,
        title: winnerTrack.title,
        statusLabel: winnerTrack.statusLabel,
        sourceKind: winner.sourceKind,
        countdownText: winnerTrack.countdownText,
        isNow: winnerTrack.isNow,
        isUrgent: winnerTrack.isUrgent,
        progressRatio,
        targetEpochMs:
          winner.isNow && winner.durationSec === 0
            ? 0
            : remainingSec > 0 ? capsuleNowMs - (capsuleNowMs % 1000) + remainingSec * 1000 : 0,
        durationSeconds: winner.durationSec,
        calendarTrack,
        taskTrack,
        upcomingQueue,
      };
    }

    if (nextActiveBlock?.isAllDay) {
      return {
        emoji: fallbackEmoji,
        title: display.title,
        statusLabel: 'طوال اليوم',
        sourceKind: 'calendar' as const,
        countdownText: 'اليوم',
        isNow: true,
        isUrgent: false,
        progressRatio: 0,
        targetEpochMs: 0,
        durationSeconds: 0,
        calendarTrack,
        taskTrack,
        upcomingQueue,
      };
    }

    if (untimedTaskFallback) {
      return {
        emoji: '☑️',
        title: cleanCalendarText(untimedTaskFallback.title) || 'مهمة اليوم',
        statusLabel: 'مهمة اليوم',
        sourceKind: 'task' as const,
        countdownText: 'اليوم',
        isNow: false,
        isUrgent: false,
        progressRatio: 0,
        targetEpochMs: 0,
        durationSeconds: 0,
        calendarTrack,
        taskTrack,
        upcomingQueue,
      };
    }

    return {
      emoji: '✅',
      title: 'أنجزت مهام اليوم',
      statusLabel: 'يوم هادئ ومكتمل',
      sourceKind: 'none' as const,
      countdownText: '✓',
      isNow: false,
      isUrgent: false,
      progressRatio: 0,
      targetEpochMs: 0,
      durationSeconds: 0,
      calendarTrack: null as CapsuleTrackInfo | null,
      taskTrack: null as CapsuleTrackInfo | null,
      upcomingQueue: [] as CapsuleTrackInfo[],
    };
  }, [
    needsAuth,
    useOfflineDemo,
    activeTimeZone,
    liveBlocks,
    hydrationHistory,
    dailyRhythmPlan.hydrationSlots,
    medications,
    googleTasks,
    todayCairoIso,
    nextActiveBlock,
    capsuleNowMs,
  ]);

  // Wake capsule calculation right when the current/next event transition occurs (or on 60s minute ticks), avoiding per-second root re-renders.
  useEffect(() => {
    const syncNow = () => setCapsuleNowMs(Date.now());
    const now = Date.now();
    const targetMs = capsuleTimerState.targetEpochMs || 0;
    const msToTarget = targetMs > now ? targetMs - now + 150 : 60_000;
    const msToMinute = 60_000 - (now % 60_000) + 120;
    const delay = Math.max(250, Math.min(60_000, msToTarget, msToMinute));
    const timer = window.setTimeout(syncNow, delay);
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncNow();
    };
    window.addEventListener('focus', syncNow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', syncNow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [capsuleNowMs, capsuleTimerState.targetEpochMs]);

  const sanitizeEmojis = (text: string, maxCount: number): string => {
    if (!text) return '';
    const emojiRe = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;
    const groupOf = (norm: string): string => {
      if (norm === '☀' || norm === '🌞') return 'sun';
      if (norm === '🌅' || norm === '🌄') return 'sunrise';
      if (norm === '🌇' || norm === '🌆') return 'sunset';
      if (norm === '🕌' || norm === '🕋' || norm === '📿') return 'prayer';
      if (norm === '💧' || norm === '💦' || norm === '🥤') return 'water';
      if (norm === '💊' || norm === '💉') return 'med';
      if (norm === '📅' || norm === '📆' || norm === '🗓') return 'cal';
      if (norm === '☑' || norm === '✅' || norm === '✔') return 'check';
      if (norm === '⚡' || norm === '🔋') return 'charge';
      return norm;
    };
    const seen = new Set<string>();
    let lastGroup = '';
    let kept = 0;
    const cleaned = text.replace(emojiRe, (match) => {
      if (maxCount <= 0 || kept >= maxCount) return '';
      const norm = match.replace(/\uFE0F/g, '');
      const grp = groupOf(norm);
      if (seen.has(norm) || (lastGroup !== '' && grp === lastGroup)) return '';
      seen.add(norm);
      lastGroup = grp;
      kept += 1;
      return match;
    });
    return cleaned
      .replace(/[^\S\r\n]{2,}/g, ' ')
      .replace(/[^\S\r\n]*\n[^\S\r\n]*/g, '\n')
      .trim();
  };

  const formatCompactTimeRange = (startClock: string, durationSeconds?: number): string => {
    const trimmed = startClock.trim();
    if (!trimmed || !durationSeconds || durationSeconds <= 0) return trimmed;
    const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*([صم])$/);
    if (!match) return trimmed;
    const h12 = Number(match[1]);
    const mins = Number(match[2]);
    const startPeriod = match[3];
    const h24 = startPeriod === 'م' ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12);
    const endClock = formatMinutes12h(h24 * 60 + mins + Math.round(durationSeconds / 60), 'ar');
    const endMatch = endClock.match(/^(\d{1,2}):(\d{2})\s*([صم])$/);
    if (endMatch && endMatch[3] === startPeriod) {
      return `${match[1]}:${match[2]} ← ${endMatch[1]}:${endMatch[2]} ${endMatch[3]}`;
    }
    return `${trimmed} ← ${endClock}`;
  };

  const cleanCompactNote = (rawDesc: string, eventTitle: string, clockText: string): string => {
    let cleaned = rawDesc
      .replace(/متبقي\s+\d+\s*(?:دقيقة|دقائق|د)\b[^·\n]*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (eventTitle) {
      cleaned = cleaned.split(eventTitle).join('').trim();
    }
    if (clockText) {
      cleaned = cleaned.split(clockText).join('').trim();
    }
    cleaned = cleaned.replace(/^[\s·\-:—–|]+|[\s·\-:—–|]+$/g, '').trim();
    if (!cleaned || cleaned === eventTitle) return '';
    return sanitizeEmojis(cleaned.slice(0, 100), 2);
  };

  const lastPushedLiveStatusRef = useRef<string>('');
  useEffect(() => {
    const androidBridge = (
      window as Window & {
        DayRhythmNative?: {
          updateLiveStatus?: (payloadJson: string) => void;
          updateCapsule?: (emoji: string, title: string, countdown: string, sourceLabel: string) => void;
        };
      }
    ).DayRhythmNative;
    if (!androidBridge) return;

    const firstQueueItem = capsuleTimerState.upcomingQueue?.[0];
    const secondQueueItem = capsuleTimerState.upcomingQueue?.[1];
    const clockLabel = formatCompactTimeRange(
      firstQueueItem?.clockLabel || '',
      firstQueueItem?.durationSeconds
    );
    const nextUpSummary = secondQueueItem
      ? sanitizeEmojis(`${secondQueueItem.emoji} ${secondQueueItem.title} (${secondQueueItem.clockLabel || secondQueueItem.countdownText})`, 2)
      : '';

    const capsuleEmoji = sanitizeEmojis(capsuleTimerState.emoji, 1) || '📅';
    const cleanTitle = sanitizeEmojis(capsuleTimerState.title, 2);
    const cleanStatusLabel = sanitizeEmojis(capsuleTimerState.statusLabel, 2);

    let description = '';
    if (capsuleTimerState.sourceKind === 'water' && hydrationToday) {
      const nextCupNum = Math.min(targetCups, hydrationToday.cupsLogged + 1);
      description = `الكوب ${nextCupNum} من ${targetCups} · ${dailyRhythmPlan.cupSizeMl} مل`;
    } else if (capsuleTimerState.sourceKind === 'medication') {
      const matchedMed = medications.find((m) => capsuleTimerState.title.includes(m.name));
      if (matchedMed?.doseNote) description = cleanCompactNote(matchedMed.doseNote, cleanTitle, clockLabel);
    } else if (capsuleTimerState.sourceKind === 'calendar' && nextActiveBlock?.description) {
      description = cleanCompactNote(cleanCalendarText(nextActiveBlock.description), cleanTitle, clockLabel);
    }

    const nowParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: activeTimeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(capsuleNowMs));
    const nowHhRaw = Number(nowParts.find((p) => p.type === 'hour')?.value ?? '0');
    const nowHh = nowHhRaw === 24 ? 0 : nowHhRaw;
    const nowMm = Number(nowParts.find((p) => p.type === 'minute')?.value ?? '0');
    const nowSs = Number(nowParts.find((p) => p.type === 'second')?.value ?? '0');
    const nowSecOfDay = nowHh * 3600 + nowMm * 60 + nowSs;

    let nextUpcomingSchedBlock: ScheduleBlock | null = null;
    for (const block of liveBlocks) {
      if (block.completed || block.deleted || block.isAllDay || acknowledgedBlockIdsRef.current.has(block.id)) continue;
      if (block.id.startsWith('sunlight_')) {
        const matchedSun = sunlightSessions.find((s) => `sunlight_${s.id}` === block.id);
        if (matchedSun?.isCloudBlocked) continue;
      }
      if (block.startMin * 60 <= nowSecOfDay) continue;
      if (!nextUpcomingSchedBlock || block.startMin < nextUpcomingSchedBlock.startMin) {
        nextUpcomingSchedBlock = block;
      }
    }

    const resolveScheduleEmojiPair = (rawEmoji: string, title: string): string => {
      const lower = title.toLowerCase();
      if (title.includes('الفجر') || lower.includes('fajr')) return '🕌 🌅';
      if (title.includes('الظهر') || lower.includes('dhuhr')) return '🕌 ☀️';
      if (title.includes('العصر') || lower.includes('asr')) return '🕌 🌤️';
      if (title.includes('المغرب') || lower.includes('maghrib')) return '🕌 🌇';
      if (title.includes('العشاء') || lower.includes('isha')) return '🕌 🌙';
      return sanitizeEmojis(rawEmoji || '📅', 2) || '📅';
    };

    const upcomingSchedDisplay = nextUpcomingSchedBlock
      ? resolveBlockDisplayInfo(nextUpcomingSchedBlock)
      : null;
    const upcomingSchedStartMin = nextUpcomingSchedBlock
      ? (nextUpcomingSchedBlock.source === 'prayer'
          ? nextUpcomingSchedBlock.startMin + lifeProfile.adhanLeadMinutes
          : nextUpcomingSchedBlock.startMin)
      : 0;
    const upcomingSchedStartClock = nextUpcomingSchedBlock
      ? formatMinutes12h(upcomingSchedStartMin, 'ar')
      : '';
    const upcomingSchedDurationSec = nextUpcomingSchedBlock
      ? ((nextUpcomingSchedBlock.durationMin ?? 0) === 0
          ? 0
          : Math.max(60, nextUpcomingSchedBlock.durationMin * 60))
      : 0;
    const upcomingSchedRemSec = nextUpcomingSchedBlock
      ? Math.max(0, nextUpcomingSchedBlock.startMin * 60 - nowSecOfDay)
      : 0;

    const scheduleTitle = sanitizeEmojis(upcomingSchedDisplay?.title || '', 2);
    const scheduleEmoji = nextUpcomingSchedBlock
      ? resolveScheduleEmojiPair(
          nextUpcomingSchedBlock.emojiPair || upcomingSchedDisplay?.emojiOnly || '📅',
          scheduleTitle || nextUpcomingSchedBlock.categoryAr
        )
      : '📅';
    const scheduleStatusLabel = nextUpcomingSchedBlock
      ? sanitizeEmojis(`موعد · ${upcomingSchedStartClock}`, 2)
      : 'لا مواعيد مجدولة متبقية';
    const scheduleClockLabel = formatCompactTimeRange(
      upcomingSchedStartClock,
      upcomingSchedDurationSec
    );
    const scheduleTargetEpochMs =
      upcomingSchedRemSec > 0
        ? capsuleNowMs - (capsuleNowMs % 1000) + upcomingSchedRemSec * 1000
        : 0;
    const scheduleDescription = '';
    const scheduleNextUpSummary = '';

    const dedupKey = [
      capsuleEmoji,
      cleanTitle,
      cleanStatusLabel,
      capsuleTimerState.sourceKind,
      capsuleTimerState.targetEpochMs || 0,
      deviceSettings.liveAlertsEnabled,
      deviceSettings.liveAlertsLeadMinutes,
      deviceSettings.liveAlertsAlwaysOn ?? false,
      deviceSettings.liveAlertsShowCharging ?? true,
      deviceSettings.persistentCountdownNotif ?? true,
      clockLabel,
      nextUpSummary,
      description,
      scheduleEmoji,
      scheduleTitle,
      scheduleStatusLabel,
      scheduleClockLabel,
      scheduleTargetEpochMs,
      scheduleDescription,
      scheduleNextUpSummary,
    ].join('|');
    if (lastPushedLiveStatusRef.current === dedupKey) return;
    lastPushedLiveStatusRef.current = dedupKey;
    try {
      if (androidBridge.updateLiveStatus) {
        androidBridge.updateLiveStatus(
          JSON.stringify({
            emoji: capsuleEmoji,
            title: cleanTitle,
            countdown: capsuleTimerState.countdownText,
            statusLabel: cleanStatusLabel,
            kind: capsuleTimerState.sourceKind,
            targetEpochMs: capsuleTimerState.targetEpochMs || 0,
            liveAlertsEnabled: deviceSettings.liveAlertsEnabled,
            liveAlertsLeadMinutes: deviceSettings.liveAlertsLeadMinutes,
            liveAlertsAlwaysOn: deviceSettings.liveAlertsAlwaysOn ?? false,
            liveAlertsShowCharging: deviceSettings.liveAlertsShowCharging ?? true,
            persistentCountdownNotif: deviceSettings.persistentCountdownNotif ?? true,
            description,
            clockLabel,
            nextUpSummary,
            hydrationProgress: '',
            scheduleEmoji,
            scheduleTitle,
            scheduleStatusLabel,
            scheduleDescription,
            scheduleClockLabel,
            scheduleTargetEpochMs,
            scheduleNextUpSummary,
          })
        );
      } else if (androidBridge.updateCapsule) {
        androidBridge.updateCapsule(
          capsuleEmoji,
          cleanTitle,
          capsuleTimerState.countdownText,
          cleanStatusLabel
        );
      }
    } catch {
      // ignore Android bridge errors
    }
  }, [
    capsuleTimerState.emoji,
    capsuleTimerState.title,
    capsuleTimerState.statusLabel,
    capsuleTimerState.sourceKind,
    capsuleTimerState.targetEpochMs,
    capsuleTimerState.countdownText,
    capsuleTimerState.calendarTrack,
    capsuleTimerState.upcomingQueue,
    deviceSettings.liveAlertsEnabled,
    deviceSettings.liveAlertsLeadMinutes,
    deviceSettings.liveAlertsAlwaysOn,
    deviceSettings.liveAlertsShowCharging,
    deviceSettings.persistentCountdownNotif,
    hydrationToday?.cupsLogged,
    targetCups,
    dailyRhythmPlan.cupSizeMl,
    medications,
    nextActiveBlock?.description,
    nextActiveBlock?.emojiPair,
    nextActiveBlock?.deleted,
    nextActiveBlock?.completed,
  ]);

  const lastScheduledAlarmsJsonRef = useRef<string>('');
  const lastSyncedCloudAlarmsJsonRef = useRef<string>('');

  // Schedule Native Android Exact Alarms (AlarmManager) for Prayers, Water, Medications, Calendar Events & Timed Tasks
  useEffect(() => {
    const androidBridge = (
      window as Window & {
        DayRhythmNative?: {
          scheduleExactAlarms?: (alarmsJson: string) => void;
        };
      }
    ).DayRhythmNative;

    const timerId = window.setTimeout(() => {
      const nowMs = trueNowMs();
      const nowMinInTz = getNowMinutesInTimeZone(activeTimeZone, new Date(nowMs));
      // Anchor on the start of the current minute. `nowMs + (target - nowMin) * 60s` kept the
      // current seconds: scheduling at 10:04:45 made a 10:10 reminder ring at 10:10:45, so the phone
      // rang a random 0–59 s after the PC (which fires on the minute).
      const minuteStartMs = nowMs - (nowMs % 60_000);
      const msForMinuteToday = (targetMin: number) => minuteStartMs + (targetMin - nowMinInTz) * 60_000;
      const todayW = getWeekdayInTimeZone(activeTimeZone);

      const snoozeMinutes =
        lifeProfile.defaultSnoozeMinutes === 10 || lifeProfile.defaultSnoozeMinutes === 15
          ? lifeProfile.defaultSnoozeMinutes
          : 5;

      const alarms: Array<{
        id: string;
        kind: 'prayer' | 'water' | 'medication' | 'event' | 'task';
        title: string;
        body: string;
        triggerAtMs: number;
        snoozeMinutes: number;
        medicationId?: string;
        doseTime24?: string;
      }> = [];

      const sleepDurMin = (dailyRhythmPlan.wakeMin - dailyRhythmPlan.bedtimeMin + 1440) % 1440;
      const isFullMuteMode = quietMode === 'silent_all' || quietMode === 'mute_audio';
      const hasFiniteQuietUntil =
        typeof quietUntilTs === 'number' && Number.isFinite(quietUntilTs) && quietUntilTs > 0;
      const isMutedByQuietModeAt = (triggerAtMs: number) => {
        if (!isFullMuteMode) return false;
        if (hasFiniteQuietUntil) return triggerAtMs <= quietUntilTs;
        return true;
      };
      const isSilencedAt = (minOfDay: number, triggerAtMs: number) => {
        if (isMutedByQuietModeAt(triggerAtMs)) return true;
        if (sanctuaryOverrideUntilMs > triggerAtMs) return false;
        if (sleepDurMin > 0 && sleepDurMin < 900) {
          const m = ((minOfDay % 1440) + 1440) % 1440;
          if (((m - dailyRhythmPlan.bedtimeMin + 1440) % 1440) < sleepDurMin) return true;
        }
        return false;
      };

      // 1. Obligatory Prayers (-adhanLeadMinutes)
      if (includePrayerAnchors) {
        for (const p of prayers) {
          if (!p.isObligatory) continue;
          const triggerAtMs = msForMinuteToday(p.alarmMinutes);
          if (triggerAtMs > nowMs + 1_000 && (!isMutedByQuietModeAt(triggerAtMs) || adhanOverrideSilent)) {
            alarms.push({
              id: `prayer_${todayCairoIso}_${p.id}`,
              kind: 'prayer',
              title: `${p.emojiPair} ${p.nameAr}`,
              body:
                lifeProfile.adhanLeadMinutes > 0
                  ? `متبقي ${lifeProfile.adhanLeadMinutes} د على أذان ${p.nameAr} (${formatMinutes12h(p.adhanMinutes, 'ar')})`
                  : `حان الآن موعد أذان ${p.nameAr} (${formatMinutes12h(p.adhanMinutes, 'ar')})`,
              triggerAtMs,
              snoozeMinutes,
            });
          }
          // Red Sun (Golden Hour) alarm derived from maghrib.redSunMinutes (skip if evening sunlight session is active or lowEnergyActive)
          const hasActiveEveningSunlight =
            sunlightSettings.enabled && sunlightSessions.some((s) => s.id === 'evening' && s.enabled);
          if (p.id === 'maghrib' && !hasActiveEveningSunlight && !lowEnergyActive) {
            const redSunMin = (p as typeof p & { redSunMinutes?: number }).redSunMinutes;
            if (typeof redSunMin === 'number') {
              const rsTriggerAtMs = msForMinuteToday(redSunMin);
              if (rsTriggerAtMs > nowMs + 1_000 && !isMutedByQuietModeAt(rsTriggerAtMs)) {
                alarms.push({
                  id: `solar_redsun_${todayCairoIso}`,
                  kind: 'prayer',
                  title: '🌇 ☀️ الشمس الحمراء',
                  body: `الساعة الذهبية المسائية — الغروب بعد ~6 دقائق (${formatMinutes12h(redSunMin, 'ar')})`,
                  triggerAtMs: rsTriggerAtMs,
                  snoozeMinutes,
                });
              }
            }
            // Maghrib solar alert (distinct from obligatory prayer alert)
            const magTrigger = msForMinuteToday(p.adhanMinutes);
            if (magTrigger > nowMs + 1_000 && !isMutedByQuietModeAt(magTrigger)) {
              alarms.push({
                id: `solar_maghrib_${todayCairoIso}`,
                kind: 'prayer',
                title: '🌆 غروب الشمس',
                body: `وقت الغروب والمغرب (${formatMinutes12h(p.adhanMinutes, 'ar')})`,
                triggerAtMs: magTrigger,
                snoozeMinutes,
              });
            }
          }
        }
      }

      // 2. Remaining Water Cups today
      const deferWaterAlarm = travelState.active && (travelState.deferredCategories?.includes('water') ?? false);
      if (waterRemindersEnabled && hydrationToday && !deferWaterAlarm) {
        const totalCups = dailyRhythmPlan.hydrationSlots.length || targetCups;
        dailyRhythmPlan.hydrationSlots.forEach((slot, idx) => {
          if (hydrationToday.slots[idx]) return;
          if (lowEnergyActive && idx % 2 === 1) return;
          const triggerAtMs = msForMinuteToday(slot.timeMinutes);
          if (triggerAtMs > nowMs + 1_000 && !isSilencedAt(slot.timeMinutes, triggerAtMs)) {
            alarms.push({
              id: `water_${todayCairoIso}_${slot.cupIndex}`,
              kind: 'water',
              title: `💧 كوب ماء #${slot.cupIndex} من ${totalCups}`,
              body: `موعد شرب ${dailyRhythmPlan.cupSizeMl} مل (${formatMinutes12h(slot.timeMinutes, 'ar')})\nالهدف اليومي: ${hydrationToday.cupsLogged}/${totalCups} كوب منجز حتى الآن`,
              triggerAtMs,
              snoozeMinutes,
            });
          }
        });
      }

      // 3. Remaining Medication Doses today
      const deferredMedsAlarm = travelState.active ? new Set(travelState.deferredMedIds ?? []) : null;
      for (const med of medications) {
        if (deferredMedsAlarm?.has(med.id)) continue;
        if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(todayW)) {
          continue;
        }
        const times =
          med.times24 && med.times24.length > 0 ? med.times24 : med.time24 ? [med.time24] : [];
        const takenDoses = med.takenDateKey === todayCairoIso ? med.takenDosesToday ?? [] : [];
        for (const t24 of times) {
          const alreadyTaken =
            times.length > 1 ? takenDoses.includes(t24) : med.takenDateKey === todayCairoIso;
          if (alreadyTaken) continue;
          const m = t24.match(/^(\d{1,2}):(\d{2})$/);
          if (!m) continue;
          const medMin = Number(m[1]) * 60 + Number(m[2]);
          const triggerAtMs = msForMinuteToday(medMin);
          if (triggerAtMs > nowMs + 1_000 && !isSilencedAt(medMin, triggerAtMs)) {
            const stockLine =
              typeof med.remainingDoses === 'number' && med.remainingDoses >= 0
                ? `\n💊 الرصيد المتبقي: ${med.remainingDoses} جرعة`
                : '';
            alarms.push({
              id: `med_${todayCairoIso}_${med.id}_${t24}`,
              kind: 'medication',
              title: `💊 موعد الجرعة: ${med.name}`,
              body: `${med.doseNote ? `${med.doseNote} · ` : ''}${formatMinutes12h(medMin, 'ar')}${stockLine}`,
              triggerAtMs,
              snoozeMinutes,
              medicationId: med.id,
              doseTime24: times.length > 1 ? t24 : '',
            });
          }
        }
      }

      // 4. Upcoming Google Calendar Events today (exact simultaneous firing with PC)
      const deferCalendarAlarm = travelState.active && (travelState.deferredCategories?.includes('calendar') ?? false);
      for (const block of liveBlocks) {
        if (
          block.deleted ||
          block.completed ||
          block.isAllDay ||
          block.source === 'prayer' ||
          block.reflowStatus === 'postponed_travel' ||
          (deferCalendarAlarm && block.source === 'google_calendar') ||
          (lowEnergyActive && !block.isAnchor && block.source !== 'google_calendar')
        ) continue;
        const triggerAtMs = msForMinuteToday(block.startMin);
        if (triggerAtMs > nowMs + 1_000 && !isSilencedAt(block.startMin, triggerAtMs)) {
          const emoji = (block.emojiPair || '📅').trim();
          const titleText = cleanCalendarText(block.categoryAr) || 'موعد في التقويم';
          const desc = cleanCalendarText(block.description || '').slice(0, 220);
          const durMin = Math.max(5, block.durationMin || 30);
          alarms.push({
            id: `event_${todayCairoIso}_${block.id}_${block.startMin}`,
            kind: 'event',
            title: `${emoji} ${titleText}`,
            body: `${desc ? `${desc}\n` : ''}📅 تقويم Google · ${formatMinutes12h(block.startMin, 'ar')} (المدة ${durMin} د)`,
            triggerAtMs,
            snoozeMinutes,
          });
        }
      }

      // 5. Timed Google Tasks today
      const deferTasksAlarm = travelState.active && (travelState.deferredCategories?.includes('tasks') ?? false);
      if (!deferTasksAlarm && !lowEnergyActive) for (const tk of googleTasks) {
        if (tk.status === 'completed') continue;
        const info = extractTaskTimeMinutesForToday(tk, todayCairoIso, activeTimeZone);
        if (!info || !info.hasExplicitTime) continue;
        const triggerAtMs = msForMinuteToday(info.startMin);
        if (triggerAtMs > nowMs + 1_000 && !isSilencedAt(info.startMin, triggerAtMs)) {
          const titleText = cleanCalendarText(tk.title) || 'مهمة مطلوبة الآن';
          const notes = cleanCalendarText(tk.notes || '').slice(0, 220);
          alarms.push({
            id: `task_${todayCairoIso}_${tk.id}_${info.startMin}`,
            kind: 'task',
            title: `☑️ ${titleText}`,
            body: `${notes ? `${notes}\n` : ''}مهام Google · ${formatMinutes12h(info.startMin, 'ar')}`,
            triggerAtMs,
            snoozeMinutes,
          });
        }
      }

      // 6. Daily Sunlight Sessions (morning, noon, evening — start minus leadMinutes, and end)
      const deferSunlightAlarm = travelState.active && (travelState.deferredCategories?.includes('sunlight') ?? false);
      if (sunlightSettings.enabled && !deferSunlightAlarm && !lowEnergyActive) {
        for (const session of sunlightSessions) {
          if (!session.enabled || session.isCloudBlocked) continue;
          const startTriggerAtMs = msForMinuteToday(session.alertMinutes);
          if (startTriggerAtMs > nowMs + 1_000 && !isSilencedAt(session.alertMinutes, startTriggerAtMs)) {
            alarms.push({
              id: `sunlight_start_${todayCairoIso}_${session.id}`,
              kind: 'event',
              title:
                session.leadMinutes > 0
                  ? `${session.emoji} ${session.labelAr} بعد ${session.leadMinutes} د`
                  : `${session.emoji} ابدأ ${session.labelAr} الآن`,
              body: `${session.descAr} · ${formatMinutes12h(session.startMinutes, 'ar')} (${session.durationMinutes} د)`,
              triggerAtMs: startTriggerAtMs,
              snoozeMinutes,
            });
          }
          const endTriggerAtMs = msForMinuteToday(session.endMinutes);
          if (endTriggerAtMs > nowMs + 1_000 && !isSilencedAt(session.endMinutes, endTriggerAtMs)) {
            alarms.push({
              id: `sunlight_end_${todayCairoIso}_${session.id}`,
              kind: 'event',
              title: `${session.emoji} انتهت جلسة ${session.labelAr}`,
              body: `اكتملت مدة التعرّض للشمس (${formatMinutes12h(session.endMinutes, 'ar')})`,
              triggerAtMs: endTriggerAtMs,
              snoozeMinutes,
            });
          }
        }
      }

      alarms.sort((a, b) => a.triggerAtMs - b.triggerAtMs);

      const slicedAlarms = alarms.slice(0, 60).map((alarm) => ({
        ...alarm,
        title: sanitizeEmojis(alarm.title, 2),
        body: sanitizeEmojis(alarm.body, 2),
      }));
      const alarmsJson = JSON.stringify(slicedAlarms);
      const nativeBatchPayload = JSON.stringify({
        isFastingToday: Boolean(dailyRhythmPlan.isFastingToday),
        activeTargetCups: targetCups,
        alarms: slicedAlarms,
      });

      if (androidBridge?.scheduleExactAlarms && nativeBatchPayload !== lastScheduledAlarmsJsonRef.current) {
        lastScheduledAlarmsJsonRef.current = nativeBatchPayload;
        try {
          androidBridge.scheduleExactAlarms(nativeBatchPayload);
        } catch {
          // ignore Android bridge errors
        }
      }

      // Sync upcoming exact alarms to Firestore so Android background service arms hardware AlarmManager
      // even if the user created or updated events from PC!
      if (firebaseUser?.uid && !firebaseUser.isAnonymous && alarmsJson !== lastSyncedCloudAlarmsJsonRef.current) {
        lastSyncedCloudAlarmsJsonRef.current = alarmsJson;
        void syncScheduledAlarmsToCloud(firebaseUser.uid, alarmsJson, clientIdRef.current);
      }
    }, 800);

    return () => window.clearTimeout(timerId);
  }, [
    activeTimeZone,
    dailyRhythmPlan.bedtimeMin,
    dailyRhythmPlan.wakeMin,
    dailyRhythmPlan.cupSizeMl,
    dailyRhythmPlan.hydrationSlots,
    dailyRhythmPlan.isFastingToday,
    targetCups,
    quietMode,
    quietUntilTs,
    adhanOverrideSilent,
    sanctuaryOverrideUntilMs,
    lowEnergyActive,
    firebaseUser?.isAnonymous,
    firebaseUser?.uid,
    googleTasks,
    hydrationToday,
    includePrayerAnchors,
    lifeProfile.adhanLeadMinutes,
    lifeProfile.defaultSnoozeMinutes,
    liveBlocks,
    medications,
    needsAuth,
    prayers,
    sunlightSessions,
    sunlightSettings.enabled,
    todayCairoIso,
    travelState,
    waterRemindersEnabled,
  ]);

  const assistantContextSummary = useMemo(() => {
    const lifeConstitution = buildLifeProfileGeminiSummary(
      lifeProfile,
      dailyRhythmPlan,
      memories,
      weatherInfo,
      todayCalendarMeta,
      creativePlacements,
      freeSlotsToday,
      tomorrowAlert,
      todayCairoIso
    );
    const prayerLines = prayers
      .filter((p) => p.isObligatory)
      .map((p) => `${p.nameAr}: ${formatMinutes12h(p.adhanMinutes, 'ar')} (تنبيه ${formatMinutes12h(p.alarmMinutes, 'ar')})`)
      .join(' | ');

    return `
${lifeConstitution}
حالة حماية الصوت الآن: ${activeSanctuary.type === 'none' ? 'عادي' : activeSanctuary.labelAr}
مواقيت الصلاة اليوم (${activeLocation.nameAr}): ${prayerLines}
الترطيب المسجل اليوم: ${hydrationToday.cupsLogged}/${hydrationToday.targetCups} كوب (${hydrationToday.cupsLogged * lifeProfile.cupSizeMl} / ${dailyRhythmPlan.activeTargetMl} مل)
الحدث القادم: ${nextActiveBlock ? `${nextActiveBlock.emojiPair} ${nextActiveBlock.categoryAr} (${formatMinutes12h(nextActiveBlock.startMin, 'ar')})` : 'لا يوجد'}
`.trim();
  }, [
    activeLocation.nameAr,
    activeSanctuary,
    creativePlacements,
    dailyRhythmPlan,
    freeSlotsToday,
    hydrationToday.cupsLogged,
    hydrationToday.targetCups,
    lifeProfile,
    memories,
    nextActiveBlock,
    prayers,
    todayCairoIso,
    todayCalendarMeta,
    tomorrowAlert,
    weatherInfo,
  ]);

  return (
    <ErrorBoundary>
    <div
      className={`app-root min-h-[100dvh] overflow-x-clip transition-colors ${
        surfaceTheme === 'amoled' ? 'bg-black' : 'bg-[#070A0F]'
      } text-zinc-100 pb-16`}
    >
      {themeWaveDirection && (
        <div
          aria-hidden="true"
          className={`theme-wave-overlay ${
            themeWaveDirection === 'sun'
              ? 'theme-wave-overlay--sun'
              : 'theme-wave-overlay--night'
          }`}
        />
      )}
      <TopBar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onOpenCatchUp={() => setIsCatchUpModalOpen(true)}
        language={language}
        onToggleLanguage={() => setLanguage((l) => (l === 'ar' ? 'en' : 'ar'))}
        brandLogoSrc={activeBrandLogo?.src ?? null}
        onCheckAppUpdates={handleCheckAppUpdates}
        isCheckingUpdates={isCheckingUpdates}
        availableUpdate={availableUpdate}
        onDismissUpdate={() => setAvailableUpdate(null)}
        sunMode={sunMode}
        onToggleSunMode={handleToggleSunMode}
      />

      {toastMessage && (
        <div className="fixed top-[calc(env(safe-area-inset-top)+4rem)] inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:max-w-lg z-50 rounded-xl border border-[#7FFFD4]/50 bg-black/95 px-4 py-2.5 text-xs font-semibold text-[#7FFFD4] text-center shadow-2xl break-words">
          {toastMessage}
        </div>
      )}

      <main className={activeTab === 'assistant' ? 'md:pb-8' : 'pb-24 md:pb-8'}>
        {authUser && !needsAuth && (workspaceTokenExpired || (!permanentLinkActive && isPermanentLinkAvailable() && !permanentLinkHintDismissed)) && (
          <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-3">
            <div
              className={`rounded-xl border px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs ${
                workspaceTokenExpired
                  ? 'border-amber-400/35 bg-amber-400/[0.06]'
                  : 'border-[#7FFFD4]/25 bg-[#7FFFD4]/[0.04]'
              }`}
            >
              <span className={workspaceTokenExpired ? 'text-amber-200 font-semibold' : 'text-zinc-300'}>
                {workspaceTokenExpired
                  ? 'ربط Google انتهى — التقويم والمهام مش بيتحدّثوا دلوقتي.'
                  : 'فعّل الربط الدائم مع Google علشان الربط ميقعش كل ساعة.'}
              </span>
              <div className="flex items-center gap-2">
                {isPermanentLinkAvailable() && !permanentLinkActive && (
                  <button
                    type="button"
                    onClick={() => void handleStartPermanentLink()}
                    disabled={isStartingPermanentLink}
                    className="min-h-[34px] px-3 rounded-lg bg-[#7FFFD4] text-black font-bold hover:bg-[#7FFFD4]/90 disabled:opacity-60 cursor-pointer"
                  >
                    {isStartingPermanentLink ? 'جارٍ التحويل لـ Google…' : '🔗 ربط دائم'}
                  </button>
                )}
                {workspaceTokenExpired && (
                  <button
                    type="button"
                    onClick={() => void handleRefreshWorkspaceToken()}
                    disabled={isRefreshingWorkspaceToken}
                    className="min-h-[34px] px-3 rounded-lg border border-amber-400/40 text-amber-200 font-semibold hover:bg-amber-400/10 disabled:opacity-60 cursor-pointer"
                  >
                    {isRefreshingWorkspaceToken ? 'جارٍ التجديد…' : 'تجديد الربط'}
                  </button>
                )}
                {!workspaceTokenExpired && (
                  <button
                    type="button"
                    onClick={() => {
                      setPermanentLinkHintDismissed(true);
                      try {
                        localStorage.setItem('dayrhythm_permanent_link_hint_dismissed_v1', '1');
                      } catch {
                        // ignore
                      }
                    }}
                    aria-label="إخفاء"
                    className="min-h-[34px] px-2 rounded-lg text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {queuedGoogleOpsCount > 0 && (
          <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-zinc-300">
              ⏳ {queuedGoogleOpsCount} تعديل مستني النت — هيتنفذوا في Google لوحدهم أول ما الاتصال يرجع.
            </div>
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
        {activeTab === 'dashboard' && (
          <motion.div
            key="tab-dashboard"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
          <DashboardView
            language={language}
            isFridayMode={isFridayMode}
            onToggleFridayMode={handleToggleFridayMode}
            includeBiweeklyPcCleanup={includeBiweeklyPcCleanup}
            onToggleBiweeklyPcCleanup={handleToggleBiweeklyPcCleanup}
            adhanOverrideSilent={adhanOverrideSilent}
            onToggleAdhanOverrideSilent={handleToggleAdhanOverrideSilent}
            onTestAdhanChime={handleTestAdhanChime}
            surfaceTheme={surfaceTheme}
            onToggleSurfaceTheme={handleToggleSurfaceTheme}
            prayers={prayers}
            blocks={liveBlocks}
            includePrayerAnchors={includePrayerAnchors}
            onToggleIncludePrayerAnchors={handleToggleIncludePrayerAnchors}
            useOfflineDemo={useOfflineDemo}
            onToggleOfflineDemo={() => setUseOfflineDemo((v) => !v)}
            onToggleComplete={handleToggleComplete}
            onDeleteBlock={handleDeleteBlock}
            onRestoreBlock={handleRestoreBlock}
            onRestoreAllDeleted={handleRestoreAllDeleted}
            lastDeletedBlock={lastDeletedBlock}
            shakeUndoSecondsLeft={shakeUndoSecondsLeft}
            onTriggerShakeUndo={handleTriggerShakeUndo}
            tombstones={tombstones}
            onSweepOldTombstones={handleSweepOldTombstones}
            hydrationToday={hydrationToday}
            hydrationHistory={hydrationHistory}
            onLogWaterCup={handleLogWaterCup}
            onToggleWaterSlot={handleToggleWaterSlot}
            medications={medications}
            onToggleMedication={handleToggleMedication}
            onToggleMedicationDate={handleToggleMedicationDate}
            onRefillMedication={handleRefillMedication}
            onAddMedication={handleAddMedication}
            onUpdateMedication={(proposal) => void handleExecuteMedicationActions([proposal])}
            onDeleteMedication={handleDeleteMedication}
            streaks={streaks}
            onToggleDailyCommitmentStreak={handleToggleDailyCommitmentStreak}
            pomodoro={pomodoro}
            onOpenPomodoro={() => setIsPomodoroModalOpen(true)}
            travelState={travelState}
            onOpenTravel={() => setIsTravelModalOpen(true)}
            onOpenCatchUp={() => setIsCatchUpModalOpen(true)}
            hasUndoSnapshot={!!undoSnapshot}
            onUndoReflow={handleUndoReflow}
            quietMode={quietMode}
            quietRemainingSec={quietRemainingSec}
            onSetQuietMode={handleSetQuietMode}
            calendarConnected={!needsAuth}
            prayersReady={prayersReady}
            locationResolutionState={locationResolutionState}
            calendarUserEmail={authUser?.email ?? undefined}
            isLoggingIn={isLoggingIn}
            loadingCalendarEvents={loadingEvents}
            calendarList={calendarList}
            calendarEvents={calendarEvents}
            googleTaskLists={googleTaskLists}
            googleTasks={googleTasks}
            loadingTasks={loadingTasks}
            chatMessages={chatMessages}
            onGoogleSignIn={handleGoogleSignIn}
            onGoogleSignOut={handleGoogleSignOut}
            onRefreshWorkspace={() => refreshWorkspace()}
            onExecuteCalendarActions={handleExecuteCalendarActions}
            onExecuteTaskActions={handleExecuteTaskActions}
            onOpenAssistant={() => handleSelectTab('assistant')}
            syncTier={syncTier}
            onChangeSyncTier={setSyncTier}
            onImportIcsBlocks={handleImportIcsBlocks}
            periodicRituals={periodicRituals}
            onCompletePeriodicRitual={handleCompletePeriodicRitual}
            batteryGuard={batteryGuard}
            phoneBattery={phoneBattery}
            phoneChargeLimitPct={phoneChargeLimitPct}
            onUpdatePhoneChargeLimit={handleUpdatePhoneChargeLimit}
            phoneChargeAlertDismissed={phoneChargeAlertDismissed}
            onDismissPhoneChargeAlert={handleStopSmartChargeAlert}
            smartChargeAlertEnabled={smartChargeAlertEnabled}
            onToggleSmartChargeAlertEnabled={handleToggleSmartChargeAlertEnabled}
            smartChargeAudioActive={smartChargeAudioActive}
            onTestSmartChargeAlert={handleTestSmartChargeAlert}
            firestoreSynced={firestoreSynced || googleDriveSynced}
            aquaTouchMode={deviceSettings.aquaTouchMode}
            alertSliderLinked={deviceSettings.alertSliderLinked}
            lifeProfile={lifeProfile}
            dailyRhythmPlan={dailyRhythmPlan}
            fastingOverride={fastingOverride}
            onChangeFastingOverride={handleChangeFastingOverride}
            onOpenLifeProfile={() => setIsLifeProfileModalOpen(true)}
            onQuickUpdateWeight={handleQuickUpdateWeight}
            memoryCount={memories.length}
            onDetectGpsLocation={handleDetectGpsLocation}
            isDetectingGps={isDetectingGps}
            activeSanctuary={activeSanctuary}
            onCancelActiveSanctuaryEarly={handleCancelActiveSanctuaryEarly}
            silentNotifications={silentNotifications}
            onClearSilentNotifications={handleClearSilentNotifications}
            activeAudioAlert={activeAudioAlert}
            hasPersistentAlert={Boolean(persistentAlert)}
            onAcknowledgeAudioAlert={handleAcknowledgeAudioAlert}
            onTriggerTaskAlert={triggerTaskAlert}
            weatherInfo={weatherInfo}
            gmailDigest={gmailDigest}
            gmailScannedCount={gmailScannedCount}
            loadingGmail={loadingGmail}
            gmailNeedsReauth={gmailNeedsReauth}
            gmailError={gmailError}
            gmailLastSyncedIso={gmailLastSyncedIso}
            gmailNextRetryInSec={gmailNextRetryInSec}
            onFetchGmailDigest={() => fetchGmailDigest()}
            hasDailyWirdHabit={hasDailyWirdHabit}
            activeTimeZone={activeTimeZone}
            onLogSleepQuality={handleLogSleepQuality}
            onOpenAssistantWithPrompt={handleOpenAssistantWithPrompt}
            todayCalendarMeta={todayCalendarMeta}
            creativePlacements={creativePlacements}
            freeSlotsToday={freeSlotsToday}
            onAddCreativeActivity={handleAddCreativeActivity}
            onToggleCreativeToday={handleToggleCreativeToday}
            onDeleteCreativeActivity={handleDeleteCreativeActivity}
            onScheduleCreativeInCalendar={handleScheduleCreativeInCalendar}
            waterRemindersEnabled={waterRemindersEnabled}
            notificationPermission={notificationPermission}
            onToggleWaterReminders={handleToggleWaterReminders}
            onRequestNotificationPermission={handleRequestNotificationPermission}
            tomorrowAlert={tomorrowAlert}
            lowEnergyActive={lowEnergyActive}
            onToggleLowEnergyToday={handleToggleLowEnergyToday}
            soundRepeats={lifeProfile.soundRepeats ?? DEFAULT_SOUND_REPEATS}
            onUpdateSoundRepeat={handleUpdateSoundRepeat}
            lastDeletedWorkspaceItem={lastDeletedWorkspaceItem}
            onUndoWorkspaceDelete={handleUndoWorkspaceDelete}
            onDismissWorkspaceUndo={() => setLastDeletedWorkspaceItem(null)}
            wsConnected={wsConnected}
            activeOneTimeSilenceMinutes={activeOneTimeSilenceMinutes}
            sunlightSessions={sunlightSessions}
            sunlightEnabled={sunlightSettings.enabled}
            onSnoozeSunlight={handleSnoozeSunlight}
            onSunlightSessionEnd={handleSunlightSessionEnd}
          />
          </motion.div>
        )}

        {activeTab === 'mobile' && (
          <motion.div
            key="tab-mobile"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
          <Suspense fallback={null}><MobilePreviewView
            language={language}
            activeTimeZone={activeTimeZone}
            activeLocation={activeLocation}
            onRefreshGps={handleDetectGpsLocation}
            gpsSyncing={isDetectingGps}
            phoneBattery={phoneBattery}
            upcomingPreview={{
              emoji: capsuleTimerState.emoji,
              title: capsuleTimerState.title,
              countdownText: capsuleTimerState.countdownText,
              statusLabel: capsuleTimerState.statusLabel,
              clockLabel: capsuleTimerState.upcomingQueue?.[0]?.clockLabel || '',
              nextUpText: capsuleTimerState.upcomingQueue?.[1]
                ? `${capsuleTimerState.upcomingQueue[1].emoji} ${capsuleTimerState.upcomingQueue[1].title} (${capsuleTimerState.upcomingQueue[1].clockLabel || capsuleTimerState.upcomingQueue[1].countdownText})`
                : '',
            }}
            prayers={prayers}
            blocks={liveBlocks}
            hydrationToday={hydrationToday}
            onLogWaterCup={handleLogWaterCup}
            quietMode={quietMode}
            quietRemainingSec={quietRemainingSec}
            adhanOverrideSilent={adhanOverrideSilent}
            onTestAdhanChime={handleTestAdhanChime}
            travelState={travelState}
            batteryGuard={batteryGuard}
            onSimulateCharge90={handleSimulateCharge90}
            onSimulatePowerDisconnect={handleSimulatePowerDisconnect}
            onSimulateBedtimeLowBattery={handleSimulateBedtimeLowBattery}
            onToggleBypassCharging={handleToggleBypassCharging}
            hasShakeUndoActive={!!lastDeletedBlock && shakeUndoSecondsLeft > 0}
            onTriggerShakeUndo={handleTriggerShakeUndo}
            alarmRinging={alarmRinging}
            onTriggerRing={handleTriggerRing}
            onDismissTwoWay={handleDismissTwoWay}
            deviceSettings={deviceSettings}
            onUpdateDeviceSettings={handleUpdateDeviceSettings}
            phoneChargeLimitPct={phoneChargeLimitPct}
            onUpdatePhoneChargeLimit={handleUpdatePhoneChargeLimit}
            smartChargeAlertEnabled={smartChargeAlertEnabled}
            onToggleSmartChargeAlertEnabled={handleToggleSmartChargeAlertEnabled}
            firestoreSynced={firestoreSynced || googleDriveSynced}
          /></Suspense>
          </motion.div>
        )}

        {activeTab === 'overlay' && (
          <motion.div
            key="tab-overlay"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
          <Suspense fallback={null}><OverlaySimulatorView
            blocks={liveBlocks}
            batteryGuard={batteryGuard}
            quietMode={quietMode}
            stealthAudioOnly={stealthAudioOnly}
            onToggleStealthAudioOnly={() =>
              setStealthAudioOnly((v) => {
                const next = !v;
                try {
                  localStorage.setItem('dayrhythm_stealth_audio_only_v1', next ? '1' : '0');
                } catch {
                  // ignore
                }
                return next;
              })
            }
            alarmRinging={alarmRinging}
            onTriggerRing={handleTriggerRing}
            onDismissTwoWay={handleDismissTwoWay}
            onSimulateCharge90={handleSimulateCharge90}
            onSimulatePowerDisconnect={handleSimulatePowerDisconnect}
            onSimulateWindowsWake={handleSimulateWindowsWake}
            phoneBattery={phoneBattery}
            onChangeChargeLimit={handleUpdatePhoneChargeLimit}
            capsulePrefs={capsulePrefs}
            onChangeCapsulePrefs={handleUpdateCapsulePrefs}
            activeLocation={activeLocation}
            firestoreSynced={firestoreSynced || googleDriveSynced}
          /></Suspense>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Lazy-load GeminiAssistantView on first visit, then keep persistently mounted */}
        {hasOpenedAssistantRef.current && (
          <motion.div
            initial={false}
            animate={{ opacity: activeTab === 'assistant' ? 1 : 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={activeTab === 'assistant' ? '' : 'hidden'}
          >
            <ErrorBoundary sectionTitle="مساعد Gemini" compact>
            <Suspense fallback={null}><GeminiAssistantView
            isActive={activeTab === 'assistant'}
            language={language}
            activeLocation={activeLocation}
            contextSummary={assistantContextSummary}
            needsAuth={needsAuth}
            authUser={authUser}
            isLoggingIn={isLoggingIn}
            calendarEvents={calendarEvents}
            googleTasks={googleTasks}
            medications={medications}
            creativePlacements={creativePlacements}
            loadingEvents={loadingEvents}
            loadingTasks={loadingTasks}
            messages={chatMessages}
            onChangeMessages={setChatMessages}
            onResetChat={handleResetChatMode}
            onGoogleSignIn={handleGoogleSignIn}
            onGoogleSignOut={handleGoogleSignOut}
            onRefreshWorkspace={() => refreshWorkspace()}
            onExecuteCalendarActions={handleExecuteCalendarActions}
            onExecuteTaskActions={handleExecuteTaskActions}
            onExecuteMedicationActions={handleExecuteMedicationActions}
            onExecuteCreativeActions={handleExecuteCreativeActions}
            onApplyProfileUpdates={handleUpdateLifeProfile}
            onApplyAppSettings={handleApplyAppSettings}
            onExecuteMemoryActions={handleExecuteMemoryActions}
            onOpenLifeProfile={() => setIsLifeProfileModalOpen(true)}
            initialPrompt={pendingAssistantPrompt}
            onConsumeInitialPrompt={() => setPendingAssistantPrompt(null)}
            autoStartVoice={autoStartVoice}
            onConsumeAutoStartVoice={() => setAutoStartVoice(false)}
            memoryCount={memories.length}
            memories={memories}
            lifeProfile={lifeProfile}
            firestoreSynced={firestoreSynced || googleDriveSynced}
            onAddMemory={handleAddMemory}
            onUpdateMemory={handleUpdateMemory}
            onDeleteMemory={handleDeleteMemory}
            onSaveCloudApiUrl={handleSaveCloudApiUrl}
          /></Suspense></ErrorBoundary></motion.div>)}
      </main>

      <AppModals
        activeBrandLogo={activeBrandLogo}
        activeLocation={activeLocation}
        activeTimeZone={activeTimeZone}
        capsulePrefs={capsulePrefs}
        capsuleTimerState={capsuleTimerState}
        googleDriveSynced={googleDriveSynced}
        handleAcknowledgeAudioAlert={handleAcknowledgeAudioAlert}
        handleAddMemory={handleAddMemory}
        handleApplyTravel={handleApplyTravel}
        handleCheckAppUpdates={handleCheckAppUpdates}
        handleCommitReflow={handleCommitReflow}
        handleDeleteMemory={handleDeleteMemory}
        handleDetectGpsLocation={handleDetectGpsLocation}
        handleDisableTravel={handleDisableTravel}
        handleExecuteTaskActions={handleExecuteTaskActions}
        handleExportBackupJson={handleExportBackupJson}
        handleGoogleSignOut={handleGoogleSignOut}
        handleImportBackupJson={handleImportBackupJson}
        handleLogWaterCup={handleLogWaterCup}
        handleResetBrandLogo={handleResetBrandLogo}
        handleSelectBrandLogo={handleSelectBrandLogo}
        handleSelectTab={handleSelectTab}
        handleSetQuietMode={handleSetQuietMode}
        handleSnoozeAlert={handleSnoozeAlert}
        handleStopSmartChargeAlert={handleStopSmartChargeAlert}
        handleTestSmartChargeAlert={handleTestSmartChargeAlert}
        handleToggleBiweeklyPcCleanup={handleToggleBiweeklyPcCleanup}
        handleToggleFridayMode={handleToggleFridayMode}
        handleToggleIncludePrayerAnchors={handleToggleIncludePrayerAnchors}
        handleToggleMedication={handleToggleMedication}
        handleToggleSmartChargeAlertEnabled={handleToggleSmartChargeAlertEnabled}
        handleToggleSmartChargeKeepUntilUnplugged={handleToggleSmartChargeKeepUntilUnplugged}
        handleUndoReflow={handleUndoReflow}
        handleUpdateCapsulePrefs={handleUpdateCapsulePrefs}
        handleUpdateLifeProfile={handleUpdateLifeProfile}
        handleUpdateMemory={handleUpdateMemory}
        handleUpdatePhoneChargeLimit={handleUpdatePhoneChargeLimit}
        handleUpdateSoundRepeat={handleUpdateSoundRepeat}
        includeBiweeklyPcCleanup={includeBiweeklyPcCleanup}
        includePrayerAnchors={includePrayerAnchors}
        isCatchUpModalOpen={isCatchUpModalOpen}
        isDetectingGps={isDetectingGps}
        isFridayMode={isFridayMode}
        isLifeProfileModalOpen={isLifeProfileModalOpen}
        isLogoPickerOpen={isLogoPickerOpen}
        isPomodoroModalOpen={isPomodoroModalOpen}
        isSyncingGoogleDrive={isSyncingGoogleDrive}
        isTravelModalOpen={isTravelModalOpen}
        language={language}
        lifeProfile={lifeProfile}
        liveBlocks={liveBlocks}
        medications={medications}
        memories={memories}
        needsAuth={needsAuth}
        nextMedicationQuick={nextMedicationQuick}
        persistentAlert={persistentAlert}
        phoneBattery={phoneBattery}
        phoneChargeLimitPct={phoneChargeLimitPct}
        pomodoro={pomodoro}
        prayers={prayers}
        pushFullCloudBackupImmediately={pushFullCloudBackupImmediately}
        pushToTasksVaultImmediately={pushToTasksVaultImmediately}
        quietMode={quietMode}
        selectedLogoId={selectedLogoId}
        setIsCatchUpModalOpen={setIsCatchUpModalOpen}
        setIsLifeProfileModalOpen={setIsLifeProfileModalOpen}
        setIsLogoPickerOpen={setIsLogoPickerOpen}
        setIsPomodoroModalOpen={setIsPomodoroModalOpen}
        setIsTravelModalOpen={setIsTravelModalOpen}
        setPersistentAlert={setPersistentAlert}
        setPomodoro={setPomodoro}
        smartChargeAlertEnabled={smartChargeAlertEnabled}
        smartChargeAudioActive={smartChargeAudioActive}
        smartChargeKeepUntilUnplugged={smartChargeKeepUntilUnplugged}
        sunlightSettings={sunlightSettings}
        handleUpdateSunlightSettings={handleUpdateSunlightSettings}
        todayCairoIso={todayCairoIso}
        travelState={travelState}
        triggerTaskAlert={triggerTaskAlert}
        undoSnapshot={undoSnapshot}
      />
    </div>
    </ErrorBoundary>
  );
}
