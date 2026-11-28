import { useRef } from 'react';
import { useAppScheduleDerived } from './useAppScheduleDerived';
import { useCalendarTaskExecutors } from './useCalendarTaskExecutors';
import { useGpsLocationSync } from './useGpsLocationSync';
import { SURFACE_THEME_STORAGE_KEY, TRAVEL_STATE_STORAGE_KEY } from './useCoreStates';
import { useMemoryAndSleepHandlers } from './useMemoryAndSleepHandlers';
import { useUpdatesAndSignOut } from './useUpdatesAndSignOut';
import { usePomodoroAndUndoEffects } from './usePomodoroAndUndoEffects';
import { useScheduleAndTravelHandlers } from './useScheduleAndTravelHandlers';
import { useUiAndProfileHandlers } from './useUiAndProfileHandlers';
import type { AppBaseState } from './useAppBaseState';
import type { AppSyncWorkspace } from './useAppSyncWorkspace';
import type { AppSyncCloud } from './useAppSyncCloud';

export function useAppScheduleAndWorkspaceActions(b: AppBaseState, p0: AppSyncWorkspace, p1: AppSyncCloud) {
  const {
    isFridayMode, setIsFridayMode, includeBiweeklyPcCleanup, setIncludeBiweeklyPcCleanup, 
    setSurfaceTheme, quietMode, setAdhanOverrideSilent, setAlarmRinging, setPeriodicRituals, 
    setChangelog, travelState, setTravelState, needsAuth, setNeedsAuth, setAuthUser, firebaseUser, 
    setIsLoggingIn, setDeviceSettings, lifeProfile, setLifeProfile, lifeProfileRef, 
    setFastingOverride, setIsDetectingGps, locationResolutionState, setLocationResolutionState, 
    setWorkspaceTokenExpired, setIsCheckingUpdates, setAvailableUpdate, nowTickMin, 
    setSilentNotifications, setActiveAudioAlert, setPersistentAlert, clientIdRef, 
    setLastDeletedWorkspaceItem, hasHydratedRemoteRef, localWriteLockUntilRef, pushToTasksVaultRef, 
    updateLifeProfileLocal, setCalendarList, calendarEvents, setCalendarEvents, 
    recentlyCreatedEventIdsRef, googleTaskLists, setGoogleTaskLists, googleTasks, setGoogleTasks, 
    recentlyCreatedTaskIdsRef, setGmailDigest, setGmailScannedCount, setGmailNeedsReauth, 
    setGmailError, setChatMessages, includePrayerAnchors, useOfflineDemo, setUseOfflineDemo, 
    completedOverrides, setCompletedOverrides, reflowedBlocksOverride, setReflowedBlocksOverride, 
    undoSnapshot, setUndoSnapshot, profileLocation, activeTimeZone, todayCairoIso, prayers, 
    dailyRhythmPlan, lowEnergyActive, activeSanctuary, effectiveDayMode, offlineBlocks, 
    setOfflineBlocks, lastDeletedBlock, setLastDeletedBlock, shakeUndoSecondsLeft, 
    setShakeUndoSecondsLeft, tombstones, setTombstones, setPhoneBattery, handleSelectTab, 
    setHydrationHistory, setMedications, creativeActivities, setCreativeActivities, habits, 
    setHabits, sunlightSettings, sunlightSessions, acknowledgedBlockIdsRef, memories, setMemories, 
    setPendingAssistantPrompt, setStreaks, pomodoro, setPomodoro, setSelectedLogoId, 
    setCapsulePrefs, surfaceThemeRef, adhanOverrideSilentRef, deviceSettingsRef, selectedLogoIdRef, 
    capsulePrefsRef, isFridayModeRef, includeBiweeklyPcCleanupRef, travelStateRef, showToast, 
    appendChangelog,
  } = b;
  const {
    emitCrossDeviceSync, lastGmailAutoScanMsRef, gmailRetryAttemptRef, setGmailLastSyncedIso, 
    clearGmailRetryTimers, refreshWorkspace, pushFullCloudBackupImmediately, 
    handleWorkspaceUnauthorized, fetchCalendarEvents, fetchGoogleTasks, syncedChatTextByIdRef, 
    cloudChatIdsRef, hasHydratedCloudChatRef,
  } = p0;
  const {
    saveCloudUserSettingsImmediately, pushToTasksVaultImmediately,
  } = p1;

  const {
    syncUiPrefsCloud,
    handleSaveCloudApiUrl,
    handleUpdateCapsulePrefs,
    handleSelectBrandLogo,
    handleResetBrandLogo,
    handleChangeFastingOverride,
    handleToggleSurfaceTheme,
    handleUpdateDeviceSettings,
    handleUpdateLifeProfile,
    handleQuickUpdateWeight,
    handleToggleLowEnergyToday,
  } = useUiAndProfileHandlers({
    activeTimeZone,
    lifeProfile,
    SURFACE_THEME_STORAGE_KEY,
    selectedLogoIdRef,
    capsulePrefsRef,
    surfaceThemeRef,
    deviceSettingsRef,
    lifeProfileRef,
    localWriteLockUntilRef,
    setCapsulePrefs,
    setSelectedLogoId,
    setFastingOverride,
    setSurfaceTheme,
    setDeviceSettings,
    setLifeProfile,
    updateLifeProfileLocal,
    pushToTasksVaultImmediately,
    pushFullCloudBackupImmediately,
    saveCloudUserSettingsImmediately,
    showToast,
  });

  const {
    handleUpdateSoundRepeat,
    handleLogSleepQuality,
    handleOpenAssistantWithPrompt,
    handleAddMemory,
    handleDeleteMemory,
    handleUpdateMemory,
    handleResetChatMode,
    handleExecuteMemoryActions,
  } = useMemoryAndSleepHandlers({
    activeTimeZone,
    lifeProfile,
    dailyRhythmPlan,
    memories,
    updateLifeProfileLocal,
    setPendingAssistantPrompt,
    handleSelectTab,
    setMemories,
    setChatMessages,
    pushToTasksVaultImmediately,
    pushFullCloudBackupImmediately,
    showToast,
  });

  const { lastCoordsRef, handleDetectGpsLocation, gpsFirstAttemptedRef } = useGpsLocationSync({
    lifeProfile,
    needsAuth,
    setIsDetectingGps,
    setLocationResolutionState,
    updateLifeProfileLocal,
    showToast,
  });

  const prayersReady =
    locationResolutionState === 'gps_locked' || locationResolutionState === 'timezone_fallback';

  const {
    rebuildOfflineSchedule,
    baseLiveBlocks,
    freeSlotsToday,
    creativePlacements,
    resolvedHabits,
    liveBlocks,
  } = useAppScheduleDerived({
    lifeProfile,
    setOfflineBlocks,
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
    activeTimeZone,
    sunlightSettings,
    sunlightSessions,
    travelState,
    dailyRhythmPlan,
    lowEnergyActive,
    creativeActivities,
    nowTickMin,
    habits,
  });


  const { handleTriggerShakeUndo } = usePomodoroAndUndoEffects({
    shakeUndoSecondsLeft,
    lastDeletedBlock,
    pomodoro,
    quietMode,
    activeSanctuary,
    setShakeUndoSecondsLeft,
    setOfflineBlocks,
    setLastDeletedBlock,
    setPomodoro,
    triggerTaskAlert: p0.triggerTaskAlert,
    showToast,
  });

  const executeCalendarRef = useRef<((actions: import('../types/dayrhythm').CalendarActionProposal[]) => Promise<unknown>) | null>(null);

  const {
    handleToggleFridayMode,
    handleToggleBiweeklyPcCleanup,
    handleToggleAdhanOverrideSilent,
    handleApplyTravel,
    handleDisableTravel,
    handleImportIcsBlocks,
    handleCompletePeriodicRitual,
    handleToggleCreativeToday,
    handleToggleComplete,
    handleDeleteBlock,
    handleRestoreBlock,
    handleRestoreAllDeleted,
    handleSweepOldTombstones,
    handleCommitReflow,
    handleUndoReflow,
  } = useScheduleAndTravelHandlers({
    activeTimeZone,
    todayCairoIso,
    effectiveDayMode,
    travelState,
    profileLocation,
    isFridayMode,
    includeBiweeklyPcCleanup,
    liveBlocks,
    undoSnapshot,
    tombstones,
    memories,
    TRAVEL_STATE_STORAGE_KEY,
    isFridayModeRef,
    includeBiweeklyPcCleanupRef,
    adhanOverrideSilentRef,
    localWriteLockUntilRef,
    travelStateRef,
    setIsFridayMode,
    setIncludeBiweeklyPcCleanup,
    setAdhanOverrideSilent,
    setTravelState,
    setUndoSnapshot,
    setReflowedBlocksOverride,
    setUseOfflineDemo,
    setOfflineBlocks,
    setPeriodicRituals,
    setCreativeActivities,
    setActiveAudioAlert,
    setPersistentAlert,
    setAlarmRinging,
    setCompletedOverrides,
    setLastDeletedBlock,
    setShakeUndoSecondsLeft,
    setTombstones,
    acknowledgedBlockIdsRef: b.acknowledgedBlockIdsRef,
    onDeleteLinkedCalendarEvent: (eventId, calendarId, title) => {
      void executeCalendarRef.current?.([{ operation: 'delete', eventId, calendarId: calendarId || 'primary', title: title || 'حدث' }]);
    },
    rebuildOfflineSchedule,
    pushToTasksVaultImmediately,
    pushToTasksVaultRef,
    saveCloudUserSettingsImmediately,
    pushFullCloudBackupImmediately,
    emitCrossDeviceSync,
    handleAddMemory,
    appendChangelog,
    showToast,
  });

  const { handleApplyOfflineActions, executeCalendarActionsNow, executeTaskActionsNow } =
    useCalendarTaskExecutors({
      activeTimeZone,
      calendarEvents,
      googleTasks,
      googleTaskLists,
      firebaseUser,
      clientIdRef,
      recentlyCreatedEventIdsRef,
      recentlyCreatedTaskIdsRef,
      acknowledgedBlockIdsRef,
      setOfflineBlocks,
      setCalendarEvents,
      setGoogleTasks,
      setReflowedBlocksOverride,
      setCompletedOverrides,
      setLastDeletedWorkspaceItem,
      handleWorkspaceUnauthorized,
      fetchCalendarEvents,
      fetchGoogleTasks,
      emitCrossDeviceSync,
      appendChangelog,
      showToast,
    });
  executeCalendarRef.current = executeCalendarActionsNow;


  return {
    handleSaveCloudApiUrl, handleUpdateCapsulePrefs, handleSelectBrandLogo, handleResetBrandLogo, 
    handleChangeFastingOverride, handleToggleSurfaceTheme, handleUpdateDeviceSettings, 
    handleUpdateLifeProfile, handleQuickUpdateWeight, handleToggleLowEnergyToday, 
    handleUpdateSoundRepeat, handleLogSleepQuality, handleOpenAssistantWithPrompt, handleAddMemory, 
    handleDeleteMemory, handleUpdateMemory, handleResetChatMode, handleExecuteMemoryActions, 
    handleDetectGpsLocation, gpsFirstAttemptedRef,
    freeSlotsToday, creativePlacements, resolvedHabits, liveBlocks, handleTriggerShakeUndo, 
    handleToggleFridayMode, handleToggleBiweeklyPcCleanup, handleToggleAdhanOverrideSilent, 
    handleApplyTravel, handleDisableTravel, handleImportIcsBlocks, handleCompletePeriodicRitual, 
    handleToggleCreativeToday, handleToggleComplete, handleDeleteBlock, handleRestoreBlock, 
    handleRestoreAllDeleted, handleSweepOldTombstones, handleCommitReflow, handleUndoReflow, 
    executeCalendarActionsNow, executeTaskActionsNow, prayersReady,
  };
}

export type AppScheduleAndWorkspaceActions = ReturnType<typeof useAppScheduleAndWorkspaceActions>;
