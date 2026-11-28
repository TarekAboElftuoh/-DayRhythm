import { useCallback, useRef, useState } from 'react';
import { markCalendarTokenExpired } from '../services/googleCalendarAuth';
import { hasPermanentLink } from '../services/googleOfflineAccess';
import { useThemeAndReactiveSync } from './useThemeAndReactiveSync';
import { useAppMiscHandlers } from './useAppMiscHandlers';
import { useDeviceSync } from '../hooks/useDeviceSync';
import { useAudioAlerts } from './useAudioAlerts';
import { useQuietSanctuary } from './useQuietSanctuary';
import { useCalendarFetcher } from './useCalendarFetcher';
import { useTasksFetcher } from './useTasksFetcher';
import { useGmailAndWorkspace } from './useGmailFetcher';
import { useDriveSync } from './useDriveSync';
import { TRAVEL_STATE_STORAGE_KEY } from './useCoreStates';
import { useAuthAndWorkspaceInit } from './useAuthAndWorkspaceInit';
import { LAST_FIRESTORE_UPDATED_AT_KEY } from './useSunlightAndUiRefs';
import type { AppBaseState } from './useAppBaseState';

export function useAppSyncWorkspace(b: AppBaseState) {
  const {
    quietMode, setQuietMode, quietUntilTs, setQuietUntilTs, quietRemainingSec, 
    setQuietRemainingSec, adhanOverrideSilent, setAdhanOverrideSilent, alarmRinging, 
    setAlarmRinging, travelState, setTravelState, needsAuth, setNeedsAuth, authUser, setAuthUser, 
    firebaseUser, setFirebaseUser, setFirestoreReady, firestoreSynced, setFirestoreSynced, 
    setGoogleDriveSynced, setIsSyncingGoogleDrive, hasHydratedGoogleDriveRef, deviceSettings, 
    setDeviceSettings, lifeProfile, setLifeProfile, lifeProfileRef, workspaceTokenExpired, 
    setWorkspaceTokenExpired, setIsRefreshingWorkspaceToken, snoozeTimersRef, 
    setSilentNotifications, activeAudioAlert, setActiveAudioAlert, persistentAlert, 
    setPersistentAlert, clientIdRef, seenSyncOpIdsRef, isLoadingSettingsRef, hasHydratedRemoteRef, 
    localWriteLockUntilRef, lastServerAppSettingsRef, cloudPausedUntil, setCloudPausedUntil, 
    pushToTasksVaultRef, spircClusterRef, lastScheduledAlarmsJsonRef, saveCloudUserSettingsRef, 
    setCalendarList, setCalendarEvents, recentlyCreatedEventIdsRef, setLoadingEvents, 
    setGoogleTaskLists, setGoogleTasks, recentlyCreatedTaskIdsRef, setLoadingTasks, setGmailDigest, 
    setGmailScannedCount, setLoadingGmail, gmailNeedsReauth, setGmailNeedsReauth, setGmailError, 
    chatMessages, setChatMessages, includePrayerAnchors, setUseOfflineDemo, setCompletedOverrides, 
    activeTimeZone, sanctuaryOverrideUntilMs, setSanctuaryOverrideUntilMs, 
    sanctuaryOverrideUntilMsRef, activeSanctuary, phoneChargeLimitPct, smartChargeAlertEnabled, 
    smartChargeKeepUntilUnplugged, hydrationHistory, setHydrationHistory, medications, 
    setMedications, creativeActivities, setCreativeActivities, habits, setHabits, 
    waterRemindersEnabled, sunMode, setThemeWaveDirection, themeWaveTimerRef, appSettingsRef, 
    updateAppSettings, acknowledgedBlockIdsRef, memories, setMemories, streaks, selectedLogoId, 
    setSelectedLogoId, capsulePrefs, setCapsulePrefs, quietModeRef, adhanOverrideSilentRef, 
    medicationsRef, travelStateRef, lastFirestoreUpdatedAtRef, showToast, appendChangelog,
  } = b;

  const { emitCrossDeviceSync } = useDeviceSync({
    authUser,
    clientIdRef,
    firebaseUser,
    firestoreSynced,
    pushToTasksVaultRef,
    seenSyncOpIdsRef,
    spircClusterRef,
  });

  const { handleAcknowledgeAudioAlert, triggerTaskAlert, handleSnoozeAlert } = useAudioAlerts({
    activeAudioAlert,
    persistentAlert,
    alarmRinging,
    activeSanctuary,
    activeTimeZone,
    lifeProfile,
    firebaseUser,
    authUser,
    clientIdRef,
    acknowledgedBlockIdsRef,
    snoozeTimersRef,
    setActiveAudioAlert,
    setPersistentAlert,
    setAlarmRinging,
    setCompletedOverrides,
    setSilentNotifications,
    emitCrossDeviceSync,
    showToast,
  });

  const { handleSetQuietMode, handleCycleQuietMode } = useQuietSanctuary({
    quietMode,
    quietRemainingSec,
    quietUntilTs,
    quietModeRef,
    localWriteLockUntilRef,
    adhanOverrideSilentRef,
    saveCloudUserSettingsRef,
    pushToTasksVaultRef,
    setQuietMode,
    setQuietUntilTs,
    setQuietRemainingSec,
    appendChangelog,
    showToast,
  });

  const handleWorkspaceUnauthorized = useCallback(() => {
    markCalendarTokenExpired();
    setWorkspaceTokenExpired(true);
  }, []);

  const fetchCalendarEvents = useCalendarFetcher({
    recentlyCreatedEventIdsRef,
    setLoadingEvents,
    setWorkspaceTokenExpired,
    setCalendarList,
    setCalendarEvents,
    handleWorkspaceUnauthorized,
  });

  const fetchGoogleTasks = useTasksFetcher({
    recentlyCreatedTaskIdsRef,
    setLoadingTasks,
    setWorkspaceTokenExpired,
    setGoogleTaskLists,
    setGoogleTasks,
    handleWorkspaceUnauthorized,
  });

  const syncedChatTextByIdRef = useRef<Map<string, string>>(new Map());
  // Message ids that definitely exist in the cloud (seen in a snapshot or written OK) — lets a
  // write skip its read-before-write. Never cleared on a failed write.
  const cloudChatIdsRef = useRef<Set<string>>(new Set());
  const hasHydratedCloudChatRef = useRef<boolean>(false);

  const {
    lastGmailAutoScanMsRef,
    gmailRetryAttemptRef,
    gmailLastSyncedIso,
    setGmailLastSyncedIso,
    gmailNextRetryInSec,
    clearGmailRetryTimers,
    fetchGmailDigest,
    refreshWorkspace,
    handleRefreshWorkspaceToken,
  } = useGmailAndWorkspace({
    activeTimeZone,
    gmailNeedsReauth,
    authUser,
    needsAuth,
    setLoadingGmail,
    setGmailError,
    setGmailNeedsReauth,
    setGmailScannedCount,
    setGmailDigest,
    setAuthUser,
    setNeedsAuth,
    setWorkspaceTokenExpired,
    setIsRefreshingWorkspaceToken,
    handleWorkspaceUnauthorized,
    fetchCalendarEvents,
    fetchGoogleTasks,
    showToast,
  });

  // Give the Android service what it needs to send/receive "alarm dismissed" by itself when the
  // app's WebView isn't running (phone ↔ PC: stopping on one stops the other).
  const {
    handleToggleSunMode,
    lastSyncedCreativeSigRef,
    lastSyncedHabitsSigRef,
    lastSyncedMemoriesSigRef,
    lastSyncedStreaksSigRef,
    lastSyncedQuietSigRef,
  } = useThemeAndReactiveSync({
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
  });

  const [permanentLinkActive, setPermanentLinkActive] = useState<boolean>(() => hasPermanentLink());

  const { hydrateGoogleDriveOnce, pushFullCloudBackupImmediately } = useDriveSync({
    LAST_FIRESTORE_UPDATED_AT_KEY,
    TRAVEL_STATE_STORAGE_KEY,
    hasHydratedGoogleDriveRef,
    lastFirestoreUpdatedAtRef,
    localWriteLockUntilRef,
    lifeProfileRef,
    medicationsRef,
    quietModeRef,
    sanctuaryOverrideUntilMsRef,
    lastScheduledAlarmsJsonRef,
    travelStateRef,
    setIsSyncingGoogleDrive,
    setGoogleDriveSynced,
    setLifeProfile,
    setMedications,
    setHydrationHistory,
    setCreativeActivities,
    setHabits,
    setMemories,
    setDeviceSettings,
    setCapsulePrefs,
    setSelectedLogoId,
    setQuietMode,
    setQuietUntilTs,
    setQuietRemainingSec,
    setAdhanOverrideSilent,
    setSanctuaryOverrideUntilMs,
    setTravelState,
    setChatMessages,
    lifeProfile,
    medications,
    hydrationHistory,
    creativeActivities,
    habits,
    memories,
    deviceSettings,
    quietMode,
    quietUntilTs,
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
    showToast,
  });

  // handleStartPermanentLink moved to useAppMiscHandlers

  useAuthAndWorkspaceInit({
    authUser,
    needsAuth,
    workspaceTokenExpired,
    gmailNeedsReauth,
    hasHydratedGoogleDriveRef,
    gmailRetryAttemptRef,
    lastGmailAutoScanMsRef,
    hasHydratedRemoteRef,
    hasHydratedCloudChatRef,
    syncedChatTextByIdRef,
    cloudChatIdsRef,
    setPermanentLinkActive,
    setWorkspaceTokenExpired,
    setGmailNeedsReauth,
    setAuthUser,
    setNeedsAuth,
    setUseOfflineDemo,
    setCalendarList,
    setCalendarEvents,
    setGoogleTaskLists,
    setGoogleTasks,
    setGmailDigest,
    setGmailScannedCount,
    setGmailLastSyncedIso,
    setFirebaseUser,
    setFirestoreReady,
    setFirestoreSynced,
    setMedications,
    setCreativeActivities,
    setHabits,
    setMemories,
    setLifeProfile,
    setDeviceSettings,
    setChatMessages,
    hydrateGoogleDriveOnce,
    refreshWorkspace,
    fetchGmailDigest,
    clearGmailRetryTimers,
    showToast,
  });


  return {
    emitCrossDeviceSync, handleAcknowledgeAudioAlert, triggerTaskAlert, handleSnoozeAlert, 
    handleSetQuietMode, lastGmailAutoScanMsRef, gmailRetryAttemptRef, gmailLastSyncedIso, 
    setGmailLastSyncedIso, gmailNextRetryInSec, clearGmailRetryTimers, fetchGmailDigest, 
    refreshWorkspace, handleRefreshWorkspaceToken, handleToggleSunMode, lastSyncedCreativeSigRef, 
    lastSyncedHabitsSigRef, lastSyncedMemoriesSigRef, lastSyncedStreaksSigRef, 
    lastSyncedQuietSigRef, pushFullCloudBackupImmediately, handleWorkspaceUnauthorized, 
    fetchCalendarEvents, fetchGoogleTasks, syncedChatTextByIdRef, cloudChatIdsRef, 
    hasHydratedCloudChatRef, permanentLinkActive,
  };
}

export type AppSyncWorkspace = ReturnType<typeof useAppSyncWorkspace>;
