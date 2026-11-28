import React from 'react';
import { TopBar } from '../components/TopBar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AppModals } from '../components/AppModals';
import { isPermanentLinkAvailable } from '../services/googleOfflineAccess';
import { AppMainTabs } from './AppMainTabs';
import type { AppControllerModel } from './useAppController';

export const AppShell: React.FC<{ a: AppControllerModel }> = ({ a }) => {
  const {
    surfaceTheme, themeWaveDirection, activeTab, handleSelectTab, setIsCatchUpModalOpen,
    language, setLanguage, activeBrandLogo, handleCheckAppUpdates, isCheckingUpdates,
    availableUpdate, setAvailableUpdate, sunMode, handleToggleSunMode, toastMessage,
    authUser, needsAuth, workspaceTokenExpired, permanentLinkActive, permanentLinkHintDismissed,
    isStartingPermanentLink, handleStartPermanentLink, handleRefreshWorkspaceToken,
    isRefreshingWorkspaceToken, setPermanentLinkHintDismissed, queuedGoogleOpsCount,
    activeLocation, activeTimeZone, capsulePrefs, capsuleTimerState, googleDriveSynced,
    handleAcknowledgeAudioAlert, handleAddMemory, handleApplyTravel, handleCommitReflow,
    handleDeleteMemory, handleDetectGpsLocation, handleDisableTravel, handleExecuteTaskActions,
    handleExportBackupJson, handleGoogleSignOut, handleImportBackupJson, handleLogWaterCup,
    handleResetBrandLogo, handleSelectBrandLogo, handleSetQuietMode, handleSnoozeAlert,
    handleStopSmartChargeAlert, handleTestSmartChargeAlert, handleToggleBiweeklyPcCleanup,
    handleToggleFridayMode, handleToggleIncludePrayerAnchors, handleToggleMedication,
    handleToggleSmartChargeAlertEnabled, handleToggleSmartChargeKeepUntilUnplugged,
    handleUndoReflow, handleUpdateCapsulePrefs, handleUpdateLifeProfile, handleUpdateMemory,
    handleUpdatePhoneChargeLimit, handleUpdateSoundRepeat, handleUpdateSunlightSettings,
    includeBiweeklyPcCleanup, includePrayerAnchors, isCatchUpModalOpen, isDetectingGps,
    isFridayMode, isLifeProfileModalOpen, isLogoPickerOpen, isPomodoroModalOpen,
    isSyncingGoogleDrive, isTravelModalOpen, lifeProfile, liveBlocks, medications,
    memories, nextMedicationQuick, persistentAlert, phoneBattery, phoneChargeLimitPct,
    pomodoro, prayers, pushFullCloudBackupImmediately, pushToTasksVaultImmediately,
    quietMode, selectedLogoId, setIsLifeProfileModalOpen, setIsLogoPickerOpen,
    setIsPomodoroModalOpen, setIsTravelModalOpen, setPersistentAlert, setPomodoro,
    smartChargeAlertEnabled, smartChargeAudioActive, smartChargeKeepUntilUnplugged,
    sunlightSettings, todayCairoIso, travelState, triggerTaskAlert, undoSnapshot,
  } = a;

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
        onToggleLanguage={() => setLanguage((l: 'ar' | 'en') => (l === 'ar' ? 'en' : 'ar'))}
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

        <AppMainTabs a={a} />
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
};
