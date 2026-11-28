import React, { Suspense } from 'react';
import { PersistentAlertOverlay } from './PersistentAlertOverlay';
import { OfflineIndicator } from './OfflineIndicator';
import { DEFAULT_LOGO_ID } from './logoRegistry';
import { DEFAULT_SOUND_REPEATS } from '../engines/audioEngine';
import { isAndroidNativeApp } from '../services/platform';
import { FloatingPiPCapsule, LifeProfileModal, type AppModalsProps } from './modals/types';
import { SecondaryModals } from './modals/SecondaryModals';
export type { AppModalsProps };

export function AppModals(props: AppModalsProps) {
  const {
    activeBrandLogo,
    activeLocation,
    activeTimeZone,
    capsulePrefs,
    capsuleTimerState,
    googleDriveSynced,
    handleAcknowledgeAudioAlert,
    handleAddMemory,
    handleApplyTravel,
    handleCheckAppUpdates,
    handleCommitReflow,
    handleDeleteMemory,
    handleDetectGpsLocation,
    handleDisableTravel,
    handleExecuteTaskActions,
    handleExportBackupJson,
    handleGoogleSignOut,
    handleImportBackupJson,
    handleLogWaterCup,
    handleResetBrandLogo,
    handleSelectBrandLogo,
    handleSelectTab,
    handleSetQuietMode,
    handleSnoozeAlert,
    handleStopSmartChargeAlert,
    handleTestSmartChargeAlert,
    handleToggleBiweeklyPcCleanup,
    handleToggleFridayMode,
    handleToggleIncludePrayerAnchors,
    handleToggleMedication,
    handleToggleSmartChargeAlertEnabled,
    handleToggleSmartChargeKeepUntilUnplugged,
    handleUndoReflow,
    handleUpdateCapsulePrefs,
    handleUpdateLifeProfile,
    handleUpdateMemory,
    handleUpdatePhoneChargeLimit,
    handleUpdateSoundRepeat,
    handleUpdateSunlightSettings,
    includeBiweeklyPcCleanup,
    includePrayerAnchors,
    isCatchUpModalOpen,
    isDetectingGps,
    isFridayMode,
    isLifeProfileModalOpen,
    isLogoPickerOpen,
    isPomodoroModalOpen,
    isSyncingGoogleDrive,
    isTravelModalOpen,
    language,
    lifeProfile,
    liveBlocks,
    medications,
    memories,
    needsAuth,
    nextMedicationQuick,
    persistentAlert,
    phoneBattery,
    phoneChargeLimitPct,
    pomodoro,
    prayers,
    pushFullCloudBackupImmediately,
    pushToTasksVaultImmediately,
    quietMode,
    selectedLogoId,
    setIsCatchUpModalOpen,
    setIsLifeProfileModalOpen,
    setIsLogoPickerOpen,
    setIsPomodoroModalOpen,
    setIsTravelModalOpen,
    setPersistentAlert,
    setPomodoro,
    smartChargeAlertEnabled,
    smartChargeAudioActive,
    smartChargeKeepUntilUnplugged,
    sunlightSettings,
    todayCairoIso,
    travelState,
    triggerTaskAlert,
    undoSnapshot,
  } = props;

  return (
    <>
      {!isAndroidNativeApp() && (
        <Suspense fallback={null}>
          <FloatingPiPCapsule
            nextEmoji={capsuleTimerState.emoji}
            nextTitle={capsuleTimerState.title}
            statusLabel={capsuleTimerState.statusLabel}
            sourceKind={capsuleTimerState.sourceKind}
            countdownText={capsuleTimerState.countdownText}
            isNow={capsuleTimerState.isNow}
            isUrgent={capsuleTimerState.isUrgent}
            progressRatio={capsuleTimerState.progressRatio}
            targetEpochMs={capsuleTimerState.targetEpochMs}
            durationSeconds={capsuleTimerState.durationSeconds}
            calendarTrack={capsuleTimerState.calendarTrack}
            taskTrack={capsuleTimerState.taskTrack}
            upcomingQueue={capsuleTimerState.upcomingQueue}
            phoneBattery={phoneBattery}
            capsulePrefs={capsulePrefs}
            onChangeCapsulePrefs={handleUpdateCapsulePrefs}
            onQuickLogWater={handleLogWaterCup}
            nextMedicationQuick={nextMedicationQuick}
            onQuickTakeMedication={handleToggleMedication}
            onOpenDashboard={() => handleSelectTab('dashboard')}
          />
        </Suspense>
      )}

      <PersistentAlertOverlay
        alert={
          typeof window !== 'undefined' &&
          Boolean(
            (window as Window & { chrome?: { webview?: { postMessage?: unknown } } }).chrome
              ?.webview?.postMessage
          )
            ? null
            : persistentAlert
        }
        defaultSnoozeMinutes={lifeProfile.defaultSnoozeMinutes ?? 5}
        allowVibration={quietMode !== 'silent_all'}
        onDismiss={() => {
          if (persistentAlert?.id.startsWith('charge_')) {
            handleStopSmartChargeAlert();
          } else {
            handleAcknowledgeAudioAlert();
          }
        }}
        onAutoSnooze={(alertItem, mins) => {
          handleSnoozeAlert(alertItem, mins, { localOnly: true });
        }}
        onConfirmWater={() => {
          handleLogWaterCup();
          handleAcknowledgeAudioAlert();
        }}
        onConfirmMedication={(medId, doseTime24) => {
          handleToggleMedication(medId, doseTime24);
          handleAcknowledgeAudioAlert();
        }}
        onCompleteTask={(taskId, taskListId) => {
          void handleExecuteTaskActions([
            {
              operation: 'complete',
              title: persistentAlert?.title || 'مهمة',
              taskId,
              taskListId,
            },
          ]).catch(() => {});
          handleAcknowledgeAudioAlert();
        }}
        onSnoozeAlert={handleSnoozeAlert}
      />

      <OfflineIndicator language={language} />

      {isLifeProfileModalOpen && (
        <Suspense fallback={null}>
          <LifeProfileModal
            isOpen={isLifeProfileModalOpen}
            onClose={() => setIsLifeProfileModalOpen(false)}
            profile={lifeProfile}
            prayers={prayers}
            activeLocation={activeLocation}
            memories={memories}
            onAddMemory={handleAddMemory}
            onUpdateMemory={handleUpdateMemory}
            onDeleteMemory={handleDeleteMemory}
            onSaveProfile={handleUpdateLifeProfile}
            onDetectGpsLocation={handleDetectGpsLocation}
            isDetectingGps={isDetectingGps}
            includePrayerAnchors={includePrayerAnchors}
            onToggleIncludePrayerAnchors={handleToggleIncludePrayerAnchors}
            isFridayMode={isFridayMode}
            onToggleFridayMode={handleToggleFridayMode}
            includeBiweeklyPcCleanup={includeBiweeklyPcCleanup}
            onToggleBiweeklyPcCleanup={handleToggleBiweeklyPcCleanup}
            calendarConnected={!needsAuth}
            onGoogleSignOut={handleGoogleSignOut}
            quietMode={quietMode}
            onSetQuietMode={handleSetQuietMode}
            soundRepeats={lifeProfile.soundRepeats ?? DEFAULT_SOUND_REPEATS}
            onUpdateSoundRepeat={handleUpdateSoundRepeat}
            onTriggerTaskAlert={triggerTaskAlert}
            phoneBattery={phoneBattery}
            phoneChargeLimitPct={phoneChargeLimitPct}
            onUpdatePhoneChargeLimit={handleUpdatePhoneChargeLimit}
            smartChargeAlertEnabled={smartChargeAlertEnabled}
            onToggleSmartChargeAlertEnabled={handleToggleSmartChargeAlertEnabled}
            smartChargeKeepUntilUnplugged={smartChargeKeepUntilUnplugged}
            onToggleSmartChargeKeepUntilUnplugged={handleToggleSmartChargeKeepUntilUnplugged}
            smartChargeAudioActive={smartChargeAudioActive}
            onTestSmartChargeAlert={handleTestSmartChargeAlert}
            onCheckAppUpdates={handleCheckAppUpdates}
            activeBrandLogo={{
              titleAr: activeBrandLogo.titleAr,
              src: activeBrandLogo.src,
              isDefault: activeBrandLogo.id === DEFAULT_LOGO_ID,
            }}
            onOpenLogoPicker={() => setIsLogoPickerOpen(true)}
            capsulePrefs={capsulePrefs}
            onChangeCapsulePrefs={handleUpdateCapsulePrefs}
            googleDriveSynced={googleDriveSynced}
            onSyncGoogleDriveNow={pushFullCloudBackupImmediately}
            isSyncingGoogleDrive={isSyncingGoogleDrive}
            onExportBackupJson={handleExportBackupJson}
            onImportBackupJson={handleImportBackupJson}
            sunlightSettings={sunlightSettings}
            onUpdateSunlightSettings={handleUpdateSunlightSettings}
          />
        </Suspense>
      )}

      <SecondaryModals p={props} />
    </>
  );
}
