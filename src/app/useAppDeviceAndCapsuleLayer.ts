import { useRef } from 'react';
import { useAppCapsuleAndContext } from './useAppCapsuleAndContext';
import { useAppMiscHandlers } from './useAppMiscHandlers';
import { useBackupActions } from '../hooks/useBackupActions';
import { useAlarmSchedulerEffect } from './useAlarmSchedulerEffect';
import { useNativeLiveStatusEffect } from './useNativeLiveStatusEffect';
import { useAndroidQuickActionsEffect } from './useAndroidQuickActionsEffect';
import { useCreativeHandlers } from './useCreativeHandlers';
import { useHabitHandlers } from './useHabitHandlers';
import type { AppBaseState } from './useAppBaseState';
import type { AppSyncWorkspace } from './useAppSyncWorkspace';
import type { AppSyncCloud } from './useAppSyncCloud';
import type { AppScheduleAndWorkspaceActions } from './useAppScheduleAndWorkspaceActions';
import type { AppHealthActions } from './useAppHealthActions';

export function useAppDeviceAndCapsuleLayer(b: AppBaseState, p0: AppSyncWorkspace, p1: AppSyncCloud, p2: AppScheduleAndWorkspaceActions, p3: AppHealthActions) {
  const {
    setActiveTab, surfaceTheme, quietMode, quietUntilTs, adhanOverrideSilent, setAlarmRinging, 
    travelState, needsAuth, authUser, firebaseUser, firestoreSynced, deviceSettings, 
    setDeviceSettings, lifeProfile, setLifeProfile, nowTickMin, setActiveAudioAlert, 
    setPersistentAlert, clientIdRef, localWriteLockUntilRef, lastScheduledAlarmsJsonRef, 
    lastSyncedCloudAlarmsJsonRef, calendarEvents, googleTasks, weatherInfo, includePrayerAnchors, 
    useOfflineDemo, activeLocation, activeTimeZone, todayCairoIso, prayers, todayCalendarMeta, 
    dailyRhythmPlan, tomorrowAlert, lowEnergyActive, sanctuaryOverrideUntilMs, activeSanctuary, 
    setSmartChargeAudioActive, targetCups, hydrationHistory, setHydrationHistory, medications, 
    setMedications, creativeActivities, setCreativeActivities, habits, setHabits, 
    waterRemindersEnabled, setWaterRemindersEnabled, appSettingsRef, updateAppSettings, 
    sunlightSettings, sunlightSessions, setNotificationPermission, acknowledgedBlockIdsRef, 
    memories, setMemories, setAutoStartVoice, shortcutHandledRef, streaks, setStreaks, 
    selectedLogoId, setSelectedLogoId, capsulePrefs, setCapsulePrefs, showToast,
  } = b;
  const {
    emitCrossDeviceSync, handleAcknowledgeAudioAlert, triggerTaskAlert, handleSnoozeAlert, 
    handleSetQuietMode, pushFullCloudBackupImmediately,
  } = p0;
  const {
    pushToTasksVaultImmediately,
  } = p1;
  const {
    freeSlotsToday, creativePlacements, liveBlocks,
  } = p2;
  const {
    handleExecuteCalendarActions, handleLogWaterCup, handleToggleMedication, hydrationToday, 
    settingsAlarmEpoch,
  } = p3;

  const {
    handleAddCreativeActivity,
    handleDeleteCreativeActivity,
    handleScheduleCreativeInCalendar,
    handleExecuteCreativeActions,
  } = useCreativeHandlers({
    activeTimeZone,
    setCreativeActivities,
    pushToTasksVaultImmediately,
    pushFullCloudBackupImmediately,
    handleExecuteCalendarActions,
    showToast,
  });

  const {
    handleAddHabit,
    handleUpdateHabit,
    handleToggleHabitToday,
    handleDeleteHabit,
    handleToggleHabitStatus,
    handleExecuteHabitActions,
  } = useHabitHandlers({
    activeTimeZone,
    setHabits,
    pushToTasksVaultImmediately,
    pushFullCloudBackupImmediately,
    showToast,
  });

  const {
    isStartingPermanentLink,
    permanentLinkHintDismissed,
    setPermanentLinkHintDismissed,
    handleStartPermanentLink,
    handleToggleWaterReminders,
    handleRequestNotificationPermission,
    handleTestAdhanChime,
    handleDismissTwoWay,
    handleToggleDailyCommitmentStreak,
  } = useAppMiscHandlers({
    authUser,
    appSettingsRef,
    updateAppSettings,
    showToast,
    setNotificationPermission,
    setWaterRemindersEnabled,
    quietMode,
    adhanOverrideSilent,
    setSmartChargeAudioActive,
    setActiveAudioAlert,
    setPersistentAlert,
    setAlarmRinging,
    emitCrossDeviceSync,
    shortcutHandledRef,
    setActiveTab,
    setHydrationHistory,
    setStreaks,
    handleSetQuietMode,
    setAutoStartVoice,
    localWriteLockUntilRef,
    pushToTasksVaultImmediately,
    pushFullCloudBackupImmediately,
  });

  const {
    nextMedicationQuick,
    capsuleNowMs,
    hasDailyWirdHabit,
    nextActiveBlock,
    capsuleTimerState,
    assistantContextSummary,
  } = useAppCapsuleAndContext({
    activeTimeZone,
    prayers,
    medications,
    todayCairoIso,
    dailyRhythmPlan,
    nowTickMin,
    needsAuth,
    useOfflineDemo,
    firebaseUser,
    streaks,
    calendarEvents,
    googleTasks,
    creativeActivities,
    memories,
    liveBlocks,
    acknowledgedBlockIdsRef,
    sunlightSessions,
    lifeProfile,
    hydrationHistory,
    hydrationToday,
    travelState,
    weatherInfo,
    todayCalendarMeta,
    creativePlacements,
    freeSlotsToday,
    tomorrowAlert,
    activeSanctuary,
    activeLocation,
  });

  // Feature #4: One-Click Full JSON Backup Export & Restore (zero OAuth tokens or secrets!)
  const { handleExportBackupJson, handleImportBackupJson } = useBackupActions({
    activeTimeZone,
    adhanOverrideSilent,
    capsulePrefs,
    creativeActivities,
    habits,
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
    setHabits,
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
  useAndroidQuickActionsEffect({
    activeTimeZone,
    firebaseUser,
    authUser,
    nextMedicationQuick,
    clientIdRef,
    handleLogWaterCup,
    handleToggleMedication,
    handleSnoozeAlert,
    handleAcknowledgeAudioAlert,
    triggerTaskAlert,
    emitCrossDeviceSync,
    setActiveAudioAlert,
    setPersistentAlert,
    setAlarmRinging,
    setSmartChargeAudioActive,
    showToast,
  });

  // capsuleNowMs, hasDailyWirdHabit, nextActiveBlock, capsuleTimerState moved to useAppCapsuleAndContext

  const lastPushedLiveStatusRef = useRef<string>('');
  useNativeLiveStatusEffect({
    capsuleTimerState,
    deviceSettings,
    hydrationToday,
    targetCups,
    dailyRhythmPlan,
    medications,
    nextActiveBlock,
    activeTimeZone,
    capsuleNowMs,
    liveBlocks,
    sunlightSessions,
    lifeProfile,
    acknowledgedBlockIdsRef,
    lastPushedLiveStatusRef,
  });

  useAlarmSchedulerEffect({
    activeTimeZone,
    todayCairoIso,
    lifeProfile,
    dailyRhythmPlan,
    quietMode,
    quietUntilTs,
    adhanOverrideSilent,
    sanctuaryOverrideUntilMs,
    lowEnergyActive,
    includePrayerAnchors,
    prayers,
    sunlightSettings,
    sunlightSessions,
    waterRemindersEnabled,
    hydrationToday,
    targetCups,
    travelState,
    medications,
    liveBlocks,
    googleTasks,
    firebaseUser,
    needsAuth,
    settingsAlarmEpoch,
    clientIdRef,
    lastScheduledAlarmsJsonRef,
    lastSyncedCloudAlarmsJsonRef,
  });

  // assistantContextSummary moved to useAppCapsuleAndContext


  return {
    handleAddCreativeActivity, handleDeleteCreativeActivity, handleScheduleCreativeInCalendar, 
    handleExecuteCreativeActions, handleAddHabit, handleUpdateHabit, handleToggleHabitToday, 
    handleDeleteHabit, handleToggleHabitStatus, handleExecuteHabitActions, isStartingPermanentLink, 
    permanentLinkHintDismissed, setPermanentLinkHintDismissed, handleStartPermanentLink, 
    handleToggleWaterReminders, handleRequestNotificationPermission, handleTestAdhanChime, 
    handleDismissTwoWay, handleToggleDailyCommitmentStreak, nextMedicationQuick, hasDailyWirdHabit, 
    capsuleTimerState, assistantContextSummary, handleExportBackupJson, handleImportBackupJson,
  };
}

export type AppDeviceAndCapsuleLayer = ReturnType<typeof useAppDeviceAndCapsuleLayer>;
