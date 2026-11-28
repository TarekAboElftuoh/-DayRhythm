import { useEffect, useRef } from 'react';
import { useApplyRemoteAndLanSync } from './useApplyRemoteAndLanSync';
import { useAppMiscHandlers } from './useAppMiscHandlers';
import { SELECTED_LOGO_STORAGE_KEY } from '../components/logoRegistry';
import { useCloudSyncHandlers } from './useCloudSettingsWriter';
import { useSpircAndAlarmsListener } from './useSpircAndAlarmsListener';
import { useFirestoreListeners } from './useFirestoreListeners';
import { SURFACE_THEME_STORAGE_KEY, TRAVEL_STATE_STORAGE_KEY } from './useCoreStates';
import { useAutoBackupEffects } from './useAutoBackupEffects';
import { LAST_FIRESTORE_UPDATED_AT_KEY } from './useSunlightAndUiRefs';
import { STORAGE_KEY, CREATIVE_STORAGE_KEY, HABITS_STORAGE_KEY, MEMORIES_STORAGE_KEY, WATER_REMINDER_STORAGE_KEY, SMART_CHARGE_KEEP_KEY, CAPSULE_PREFS_STORAGE_KEY } from '../utils/appHelpers';
import type { AppBaseState } from './useAppBaseState';
import type { AppSyncWorkspace } from './useAppSyncWorkspace';

export function useAppSyncCloud(b: AppBaseState, p0: AppSyncWorkspace) {
  const {
    isFridayMode, setIsFridayMode, includeBiweeklyPcCleanup, setIncludeBiweeklyPcCleanup, 
    surfaceTheme, setSurfaceTheme, quietMode, setQuietMode, quietUntilTs, setQuietUntilTs, 
    setQuietRemainingSec, adhanOverrideSilent, setAdhanOverrideSilent, setAlarmRinging, 
    periodicRituals, setPeriodicRituals, travelState, setTravelState, authUser, firebaseUser, 
    firestoreReady, setFirestoreReady, setFirestoreSynced, setGoogleDriveSynced, 
    hasHydratedGoogleDriveRef, isSavingGoogleDriveRef, deviceSettings, setDeviceSettings, 
    lifeProfile, setLifeProfile, lifeProfileRef, fastingOverride, setFastingOverride, 
    setActiveAudioAlert, setPersistentAlert, persistentAlertRef, handledDismissedAlarmIdsRef, 
    clientIdRef, seenSyncOpIdsRef, setLastDeletedWorkspaceItem, setIsLoadingSettings, 
    isLoadingSettingsRef, hasHydratedRemoteRef, localWriteLockUntilRef, lastServerFieldsRef, 
    pendingRemoteRef, cloudPausedUntil, pendingRemoteTimerRef, pushToTasksVaultRef, 
    spircClusterRef, lastScheduledAlarmsJsonRef, lastSyncedCloudAlarmsJsonRef, 
    recentCloudWriteTimestampsRef, pendingBurstFlushTimerRef, pendingBurstPatchRef, 
    saveCloudUserSettingsRef, lastSpircFullStateRef, pendingPatchesBeforeHydrationRef, 
    handleToggleMedicationRef, handleLogWaterCupRef, chatMessages, includePrayerAnchors, 
    setIncludePrayerAnchors, completedOverrides, setCompletedOverrides, activeTimeZone, 
    sanctuaryOverrideUntilMs, setSanctuaryOverrideUntilMs, sanctuaryOverrideUntilMsRef, 
    setBatteryGuard, phoneChargeLimitPct, setPhoneChargeLimitPct, setPhoneBattery, 
    setSmartChargeAudioActive, smartChargeAlertEnabled, setSmartChargeAlertEnabled, 
    smartChargeKeepUntilUnplugged, setSmartChargeKeepUntilUnplugged, phoneChargeLimitRef, 
    hydrationHistory, setHydrationHistory, hydrationHistoryRef, medications, setMedications, 
    creativeActivities, setCreativeActivities, habits, setHabits, waterRemindersEnabled, 
    setWaterRemindersEnabled, sunMode, setSunMode, appSettingsRef, acknowledgedBlockIdsRef, 
    memories, setMemories, streaks, setStreaks, pomodoro, setPomodoro, selectedLogoId, 
    setSelectedLogoId, capsulePrefs, setCapsulePrefs, surfaceThemeRef, quietModeRef, 
    adhanOverrideSilentRef, deviceSettingsRef, medicationsRef, creativeActivitiesRef, habitsRef, 
    memoriesRef, selectedLogoIdRef, capsulePrefsRef, completedOverridesRef, fastingOverrideRef, 
    isFridayModeRef, includeBiweeklyPcCleanupRef, travelStateRef, pomodoroRef, periodicRitualsRef, 
    lastFirestoreUpdatedAtRef, showToast,
  } = b;
  const {
    triggerTaskAlert, refreshWorkspace, lastSyncedCreativeSigRef, lastSyncedHabitsSigRef, 
    lastSyncedMemoriesSigRef, lastSyncedStreaksSigRef, lastSyncedQuietSigRef, fetchCalendarEvents, 
    fetchGoogleTasks,
  } = p0;

  const {
    handleIncomingRemoteSync,
    handleIncomingRemoteSyncRef,
    saveCloudUserSettingsImmediately,
    pushToTasksVaultImmediately,
  } = useCloudSyncHandlers({
    firebaseUser,
    clientIdRef,
    seenSyncOpIdsRef,
    acknowledgedBlockIdsRef,
    lifeProfileRef,
    appSettingsRef,
    recentCloudWriteTimestampsRef,
    pendingBurstPatchRef,
    pendingBurstFlushTimerRef,
    lastSpircFullStateRef,
    spircClusterRef,
    isLoadingSettingsRef,
    hasHydratedRemoteRef,
    pendingPatchesBeforeHydrationRef,
    lastServerFieldsRef,
    saveCloudUserSettingsRef,
    hydrationHistory,
    lifeProfile,
    streaks,
    quietMode,
    quietUntilTs,
    adhanOverrideSilent,
    sanctuaryOverrideUntilMs,
    surfaceTheme,
    deviceSettings,
    medications,
    creativeActivities,
    habits,
    memories,
    completedOverrides,
    fastingOverride,
    isFridayMode,
    includeBiweeklyPcCleanup,
    travelState,
    pomodoro,
    periodicRituals,
    selectedLogoId,
    capsulePrefs,
    phoneChargeLimitPct,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    waterRemindersEnabled,
    sunMode,
    setSmartChargeAudioActive,
    setActiveAudioAlert,
    setPersistentAlert,
    setAlarmRinging,
    setCompletedOverrides,
    setLastDeletedWorkspaceItem,
    setFirestoreSynced,
    fetchCalendarEvents,
    fetchGoogleTasks,
    refreshWorkspace,
    triggerTaskAlert,
    showToast,
  });
  saveCloudUserSettingsRef.current = saveCloudUserSettingsImmediately;
  const {
    applyRemote,
    applyRemoteRef,
    applyOrDefer,
    applyOrDeferRef,
    lastAppliedTasksSyncMsRef,
    callRemoteSync,
  } = useApplyRemoteAndLanSync({
    refreshWorkspace,
    handleIncomingRemoteSyncRef,
    clientIdRef,
    localWriteLockUntilRef,
    pendingRemoteRef,
    pendingRemoteTimerRef,
    isLoadingSettingsRef,
    activeTimeZone,
    applyCtx: {
      clientIdRef, persistentAlertRef, seenSyncOpIdsRef, localWriteLockUntilRef,
      appSettingsRef, phoneChargeLimitRef, quietModeRef, adhanOverrideSilentRef,
      lastSyncedQuietSigRef, sanctuaryOverrideUntilMsRef, lastScheduledAlarmsJsonRef,
      lastSyncedCloudAlarmsJsonRef, surfaceThemeRef, deviceSettingsRef, lifeProfileRef,
      setActiveAudioAlert, setPersistentAlert, setAlarmRinging, setPhoneChargeLimitPct,
      setBatteryGuard, setSmartChargeAlertEnabled, setSmartChargeKeepUntilUnplugged,
      setWaterRemindersEnabled, setSunMode, setIncludePrayerAnchors, setQuietMode,
      setQuietUntilTs, setQuietRemainingSec, setAdhanOverrideSilent, setSanctuaryOverrideUntilMs,
      setSurfaceTheme, setDeviceSettings, setLifeProfile,
      STORAGE_KEY, SMART_CHARGE_KEEP_KEY, WATER_REMINDER_STORAGE_KEY, SURFACE_THEME_STORAGE_KEY,
      activeTimeZone, medicationsRef, memoriesRef, lastSyncedMemoriesSigRef,
      creativeActivitiesRef, lastSyncedCreativeSigRef, habitsRef, lastSyncedHabitsSigRef,
      selectedLogoIdRef, capsulePrefsRef, lastSyncedStreaksSigRef, hydrationHistoryRef,
      setMedications, setMemories, setCreativeActivities, setHabits, setSelectedLogoId,
      setCapsulePrefs, setStreaks, setHydrationHistory,
      MEMORIES_STORAGE_KEY, CREATIVE_STORAGE_KEY, HABITS_STORAGE_KEY,
      SELECTED_LOGO_STORAGE_KEY, CAPSULE_PREFS_STORAGE_KEY,
      lastFirestoreUpdatedAtRef, LAST_FIRESTORE_UPDATED_AT_KEY, TRAVEL_STATE_STORAGE_KEY,
      completedOverridesRef, fastingOverrideRef, isFridayModeRef, includeBiweeklyPcCleanupRef,
      travelStateRef, pomodoroRef, periodicRitualsRef, lastServerFieldsRef, lastSpircFullStateRef,
      setCompletedOverrides, setFastingOverride, setIsFridayMode, setIncludeBiweeklyPcCleanup,
      setTravelState, setPomodoro, setPeriodicRituals, setPhoneBattery,
    },
  });

  useEffect(() => {
    pushToTasksVaultRef.current = saveCloudUserSettingsImmediately;
  }, [saveCloudUserSettingsImmediately]);

  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useSpircAndAlarmsListener({
    firebaseUser,
    authUser,
    clientIdRef,
    persistentAlertRef,
    spircClusterRef,
    seenSyncOpIdsRef,
    handledDismissedAlarmIdsRef,
    isLoadingSettingsRef,
    applyOrDeferRef,
    handleLogWaterCupRef,
    handleToggleMedicationRef,
    showToastRef,
    setPhoneBattery,
    setSmartChargeAudioActive,
    setActiveAudioAlert,
    setPersistentAlert,
    setAlarmRinging,
  });

  useFirestoreListeners({
    firebaseUser,
    authUser,
    clientIdRef,
    persistentAlertRef,
    seenSyncOpIdsRef,
    acknowledgedBlockIdsRef,
    isLoadingSettingsRef,
    hasHydratedRemoteRef,
    lastServerFieldsRef,
    pendingPatchesBeforeHydrationRef,
    applyOrDeferRef,
    applyOrDefer,
    handleIncomingRemoteSyncRef,
    handleLogWaterCupRef,
    handleToggleMedicationRef,
    showToastRef,
    saveCloudUserSettingsImmediately,
    setSmartChargeAudioActive,
    setActiveAudioAlert,
    setPersistentAlert,
    setAlarmRinging,
    setCompletedOverrides,
    setIsLoadingSettings,
    setFirestoreReady,
    setFirestoreSynced,
  });

  useAutoBackupEffects({
    activeTimeZone,
    firebaseUser,
    firestoreReady,
    cloudPausedUntil,
    medications,
    creativeActivities,
    habits,
    memories,
    waterRemindersEnabled,
    hydrationHistory,
    streaks,
    lifeProfile,
    deviceSettings,
    quietMode,
    quietUntilTs,
    adhanOverrideSilent,
    sanctuaryOverrideUntilMs,
    surfaceTheme,
    phoneChargeLimitPct,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    sunMode,
    includePrayerAnchors,
    capsulePrefs,
    selectedLogoId,
    travelState,
    chatMessages,
    hasHydratedGoogleDriveRef,
    isSavingGoogleDriveRef,
    isLoadingSettingsRef,
    hasHydratedRemoteRef,
    clientIdRef,
    appSettingsRef,
    lastServerFieldsRef,
    setGoogleDriveSynced,
    setFirestoreSynced,
    pushToTasksVaultImmediately,
  });

  // water/notification permission handlers moved to useAppMiscHandlers


  return {
    saveCloudUserSettingsImmediately, pushToTasksVaultImmediately,
  };
}

export type AppSyncCloud = ReturnType<typeof useAppSyncCloud>;
