import { useCallback, useState } from 'react';
import { getOrRefreshCalendarAccessToken } from '../services/googleCalendarAuth';
import { auth } from '../firebase';
import { useAppMiscHandlers } from './useAppMiscHandlers';
import { useMedicationActions } from '../hooks/useMedications';
import { stopContinuousAlert } from '../engines/audioEngine';
import { triggerHapticWaveform } from '../engines/hapticsEngine';
import { stopNativeAlerts } from '../utils/deviceHelpers';
import { useWorkspaceActions } from './useWorkspaceActions';
import { useHydrationHandlers } from './useHydrationHandlers';
import { useSettingsPatchHandler } from './useSettingsPatchHandler';
import { useRemindersEffect } from './useRemindersEffect';
import { useBatteryTelemetryEffect } from './useBatteryTelemetryEffect';
import { useSmartChargeAlertEffect } from './useSmartChargeAlertEffect';
import { useSunlightEffects } from './useSunlightEffects';
import { useBatteryGuardHandlers } from './useBatteryGuardHandlers';
import { ACTIVE_UID_STORAGE_KEY } from '../utils/appHelpers';
import type { AppBaseState } from './useAppBaseState';
import type { AppSyncWorkspace } from './useAppSyncWorkspace';
import type { AppSyncCloud } from './useAppSyncCloud';
import type { AppScheduleAndWorkspaceActions } from './useAppScheduleAndWorkspaceActions';

export function useAppHealthActions(b: AppBaseState, p0: AppSyncWorkspace, p1: AppSyncCloud, p2: AppScheduleAndWorkspaceActions) {
  const {
    language, setLanguage, quietMode, adhanOverrideSilent, setAdhanOverrideSilent, setAlarmRinging, 
    travelState, needsAuth, authUser, firebaseUser, firestoreSynced, deviceSettings, lifeProfile, 
    setLifeProfile, lifeProfileRef, fastingOverride, workspaceTokenExpired, nowTickMin, 
    setActiveAudioAlert, setPersistentAlert, clientIdRef, wsConnected, restoredOpIdsRef, 
    lastDeletedWorkspaceItem, setLastDeletedWorkspaceItem, localWriteLockUntilRef, 
    lastServerFieldsRef, spircClusterRef, lastScheduledAlarmsJsonRef, lastSyncedCloudAlarmsJsonRef, 
    handleToggleMedicationRef, handleLogWaterCupRef, calendarEvents, setCalendarEvents, 
    googleTasks, setGoogleTasks, includePrayerAnchors, activeTimeZone, prayers, dailyRhythmPlan, 
    lowEnergyActive, sanctuaryOverrideUntilMs, setSanctuaryOverrideUntilMs, 
    sanctuaryOverrideUntilMsRef, activeSanctuary, handleCancelActiveSanctuaryEarly, batteryGuard, 
    setBatteryGuard, phoneChargeLimitPct, phoneBattery, setPhoneBattery, 
    setPhoneChargeAlertDismissed, smartChargeAudioActive, setSmartChargeAudioActive, 
    smartChargeAlertEnabled, smartChargeKeepUntilUnplugged, phoneChargeNotifiedCycleRef, 
    phoneChargeLimitRef, targetCups, hydrationHistory, setHydrationHistory, hydrationHistoryRef, 
    medications, setMedications, waterRemindersEnabled, sunMode, appSettingsRef, updateAppSettings, 
    sunlightSettings, sunlightSessions, firedReminderKeysRef, acknowledgedBlockIdsRef, streaks, 
    setStreaks, capsulePrefs, adhanOverrideSilentRef, travelStateRef, showToast, appendChangelog,
  } = b;
  const {
    emitCrossDeviceSync, handleAcknowledgeAudioAlert, triggerTaskAlert, handleSetQuietMode, 
    pushFullCloudBackupImmediately,
  } = p0;
  const {
    saveCloudUserSettingsImmediately, pushToTasksVaultImmediately,
  } = p1;
  const {
    handleUpdateCapsulePrefs, handleChangeFastingOverride, handleUpdateDeviceSettings, 
    handleUpdateSoundRepeat, freeSlotsToday, liveBlocks, handleToggleAdhanOverrideSilent, 
    handleApplyTravel, handleDisableTravel, executeCalendarActionsNow, executeTaskActionsNow,
  } = p2;

  const {
    queuedGoogleOpsCount,
    handleExecuteCalendarActions,
    handleExecuteTaskActions,
    handleUndoWorkspaceDelete,
  } = useWorkspaceActions({
    activeTimeZone,
    authUser,
    needsAuth,
    workspaceTokenExpired,
    calendarEvents,
    googleTasks,
    lastDeletedWorkspaceItem,
    restoredOpIdsRef,
    setCalendarEvents,
    setGoogleTasks,
    setLastDeletedWorkspaceItem,
    executeCalendarActionsNow,
    executeTaskActionsNow,
    showToast,
  });

  // adhan chime & dismissTwoWay moved to useAppMiscHandlers

  const hydrationToday = hydrationHistory[hydrationHistory.length - 1];

  // Stable (useCallback) so the effects that depend on handleLogWaterCup don't re-subscribe every render.
  //
  // ROOT CAUSE of "water cups revert on their own": this never armed localWriteLockUntilRef, so a
  // Firestore snapshot that arrived for any unrelated reason (even just the phone's battery ping)
  // while our own save was still in flight would re-derive hydrationHistory from the document as it
  // stood BEFORE this click — wiping out the cup you just logged. Same class of bug as the
  // lifeProfile toggles above; arming the lock here is the actual fix (every previous attempt only
  // patched symptoms around this).
  const { updateTodayHydration, handleLogWaterCup, handleToggleWaterSlot } = useHydrationHandlers({
    activeTimeZone,
    targetCups,
    streaks,
    deviceSettings,
    lifeProfile,
    hydrationHistoryRef,
    localWriteLockUntilRef,
    lastServerFieldsRef,
    clientIdRef,
    handleLogWaterCupRef,
    setHydrationHistory,
    setStreaks,
    setActiveAudioAlert,
    setPersistentAlert,
    setAlarmRinging,
    pushToTasksVaultImmediately,
    pushFullCloudBackupImmediately,
    emitCrossDeviceSync,
  });

  // Handle PWA Home Screen App Shortcuts (/?action=water | meeting | voice)
  // URL shortcut & open-assistant effects moved to useAppMiscHandlers

  // Active Water Cup & Multi-Dose Medication Reminder Engine (fires every 5s/30s tick, respects Fasting & Silence Sanctuaries)
  useRemindersEffect({
    activeTimeZone,
    nowTickMin,
    waterRemindersEnabled,
    dailyRhythmPlan,
    hydrationToday,
    travelState,
    lowEnergyActive,
    prayers,
    medications,
    liveBlocks,
    googleTasks,
    includePrayerAnchors,
    activeSanctuary,
    quietMode,
    firedReminderKeysRef,
    acknowledgedBlockIdsRef,
    triggerTaskAlert,
    handleLogWaterCup,
    handleAcknowledgeAudioAlert,
  });

  const { handleSunlightSessionEnd } = useSunlightEffects({
    activeTimeZone,
    nowTickMin,
    sunlightSettings,
    sunlightSessions,
    lowEnergyActive,
    travelState,
    activeSanctuary,
    quietMode,
    firedReminderKeysRef,
    triggerTaskAlert,
  });

  // Real-time Phone Battery Sync (Mobile publishes local battery; PC receives & displays)
  useBatteryTelemetryEffect({
    firebaseUser,
    firestoreSynced,
    wsConnected,
    phoneChargeLimitRef,
    spircClusterRef,
    setPhoneBattery,
    setBatteryGuard,
  });

  // Smart charge handlers extracted to useBatteryGuardHandlers above

  useSmartChargeAlertEffect({
    activeTimeZone,
    phoneBattery,
    smartChargeAlertEnabled,
    smartChargeKeepUntilUnplugged,
    smartChargeAudioActive,
    quietMode,
    activeSanctuary,
    phoneChargeNotifiedCycleRef,
    setSmartChargeAudioActive,
    setPersistentAlert,
    setPhoneChargeAlertDismissed,
    showToast,
  });

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

  const [settingsAlarmEpoch, setSettingsAlarmEpoch] = useState(0);

  const { handleApplyAppSettings, currentSettingsSnapshot, handleApplySettingsPatch } =
    useSettingsPatchHandler({
      lifeProfile,
      lifeProfileRef,
      appSettingsRef,
      localWriteLockUntilRef,
      adhanOverrideSilentRef,
      sanctuaryOverrideUntilMsRef,
      travelStateRef,
      lastScheduledAlarmsJsonRef,
      lastSyncedCloudAlarmsJsonRef,
      phoneChargeLimitPct,
      smartChargeAlertEnabled,
      smartChargeKeepUntilUnplugged,
      waterRemindersEnabled,
      quietMode,
      adhanOverrideSilent,
      sunMode,
      language,
      capsulePrefs,
      deviceSettings,
      includePrayerAnchors,
      fastingOverride,
      travelState,
      sanctuaryOverrideUntilMs,
      freeSlotsToday,
      dailyRhythmPlan,
      medications,
      setLifeProfile,
      setSmartChargeAudioActive,
      setAdhanOverrideSilent,
      setLanguage,
      setSanctuaryOverrideUntilMs,
      setSettingsAlarmEpoch,
      updateAppSettings,
      handleSetQuietMode,
      handleToggleAdhanOverrideSilent,
      handleUpdateCapsulePrefs,
      handleUpdateDeviceSettings,
      handleUpdateSoundRepeat,
      handleChangeFastingOverride,
      handleCancelActiveSanctuaryEarly,
      handleDisableTravel,
      handleApplyTravel,
      handleExecuteMedicationActions,
      saveCloudUserSettingsImmediately,
      pushFullCloudBackupImmediately,
      showToast,
    });


  return {
    queuedGoogleOpsCount, handleExecuteCalendarActions, handleExecuteTaskActions, 
    handleUndoWorkspaceDelete, handleLogWaterCup, handleToggleWaterSlot, handleSunlightSessionEnd, 
    handleToggleMedication, handleToggleMedicationDate, handleRefillMedication, 
    handleAddMedication, handleDeleteMedication, handleExecuteMedicationActions, 
    handleApplyAppSettings, currentSettingsSnapshot, handleApplySettingsPatch, hydrationToday, 
    settingsAlarmEpoch,
  };
}

export type AppHealthActions = ReturnType<typeof useAppHealthActions>;
