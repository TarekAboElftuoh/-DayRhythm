import { useCoreStates } from './useCoreStates';
import { useRhythmDerivedState } from './useRhythmDerivedState';
import { useHydrationAndBatteryStates } from './useHydrationAndBatteryStates';
import { useSunlightAndUiRefs } from './useSunlightAndUiRefs';
import { useClockAndNativeAuthEffects } from './useClockAndNativeAuthEffects';

export function useAppBaseState() {
  const core = useCoreStates();
  const rhythm = useRhythmDerivedState({
    lifeProfile: core.lifeProfile,
    travelState: core.travelState,
    needsAuth: core.needsAuth,
    nowTickMin: core.nowTickMin,
    fastingOverride: core.fastingOverride,
    quietMode: core.quietMode,
    isFridayMode: core.isFridayMode,
    dayMode: core.dayMode,
    wasInPrayerSanctuaryRef: core.wasInPrayerSanctuaryRef,
    localWriteLockUntilRef: core.localWriteLockUntilRef,
    lastScheduledAlarmsJsonRef: core.lastScheduledAlarmsJsonRef,
    lastSyncedCloudAlarmsJsonRef: core.lastSyncedCloudAlarmsJsonRef,
    saveCloudUserSettingsRef: core.saveCloudUserSettingsRef,
    pushToTasksVaultRef: core.pushToTasksVaultRef,
    updateLifeProfileLocal: core.updateLifeProfileLocal,
  });

  const hydrationBattery = useHydrationAndBatteryStates({
    lifeProfile: core.lifeProfile,
    dailyRhythmPlan: rhythm.dailyRhythmPlan,
    includePrayerAnchors: rhythm.includePrayerAnchors,
    localWriteLockUntilRef: core.localWriteLockUntilRef,
    saveCloudUserSettingsRef: core.saveCloudUserSettingsRef,
    pushToTasksVaultRef: core.pushToTasksVaultRef,
    setActiveTab: core.setActiveTab,
    setIncludePrayerAnchors: rhythm.setIncludePrayerAnchors,
  });

  const sunlightUi = useSunlightAndUiRefs({
    todayCairoIso: rhythm.todayCairoIso,
    prayers: rhythm.prayers,
    weatherInfo: rhythm.weatherInfo,
    nowTickMin: core.nowTickMin,
    surfaceTheme: core.surfaceTheme,
    quietMode: core.quietMode,
    adhanOverrideSilent: core.adhanOverrideSilent,
    deviceSettings: core.deviceSettings,
    medications: hydrationBattery.medications,
    creativeActivities: hydrationBattery.creativeActivities,
    habits: hydrationBattery.habits,
    completedOverrides: rhythm.completedOverrides,
    fastingOverride: core.fastingOverride,
    isFridayMode: core.isFridayMode,
    includeBiweeklyPcCleanup: core.includeBiweeklyPcCleanup,
    travelState: core.travelState,
    periodicRituals: core.periodicRituals,
    lifeProfile: core.lifeProfile,
  });

  const clock = useClockAndNativeAuthEffects({
    activeBrandLogo: sunlightUi.activeBrandLogo,
    setToastMessage: hydrationBattery.setToastMessage,
    phoneChargeNotifiedCycleRef: hydrationBattery.phoneChargeNotifiedCycleRef,
    setPhoneChargeAlertDismissed: hydrationBattery.setPhoneChargeAlertDismissed,
    updateAppSettings: hydrationBattery.updateAppSettings,
    setBatteryGuard: hydrationBattery.setBatteryGuard,
    setPhoneBattery: hydrationBattery.setPhoneBattery,
    firebaseUser: core.firebaseUser,
    authUser: core.authUser,
    activeTimeZone: rhythm.activeTimeZone,
    setChangelog: core.setChangelog,
    language: core.language,
    chatMessages: rhythm.chatMessages,
    setChatMessages: rhythm.setChatMessages,
    silentNotifications: core.silentNotifications,
    setSilentNotifications: core.setSilentNotifications,
    setNowTickMin: core.setNowTickMin,
    phoneChargeLimitPct: hydrationBattery.phoneChargeLimitPct,
    smartChargeAlertEnabled: hydrationBattery.smartChargeAlertEnabled,
  });

  return {
    ...core,
    ...rhythm,
    ...hydrationBattery,
    ...sunlightUi,
    ...clock,
  };
}

export type AppBaseState = ReturnType<typeof useAppBaseState>;
