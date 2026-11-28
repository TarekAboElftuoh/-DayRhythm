import React, { Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { isMobileDevice } from '../services/platform';
import { AppDashboardTab } from './AppDashboardTab';
import type { AppControllerModel } from './useAppController';

const MobilePreviewView = lazy(() => import('../components/MobilePreviewView').then((m) => ({ default: m.MobilePreviewView })));
const OverlaySimulatorView = lazy(() => import('../components/OverlaySimulatorView').then((m) => ({ default: m.OverlaySimulatorView })));
const GeminiAssistantView = lazy(() => import('../components/GeminiAssistantView').then((m) => ({ default: m.GeminiAssistantView })));

export const AppMainTabs: React.FC<{ a: AppControllerModel }> = ({ a }) => {
  const {
    activeTab, language, adhanOverrideSilent, handleTestAdhanChime, prayers, lastDeletedBlock, shakeUndoSecondsLeft, handleTriggerShakeUndo, hydrationToday, handleLogWaterCup, medications, travelState, quietMode, quietRemainingSec, needsAuth, authUser, isLoggingIn, calendarEvents, googleTasks, loadingEvents, loadingTasks, chatMessages, setChatMessages, handleGoogleSignIn, handleGoogleSignOut, refreshWorkspace, handleExecuteCalendarActions, handleExecuteTaskActions, batteryGuard, phoneBattery, phoneChargeLimitPct, handleUpdatePhoneChargeLimit, smartChargeAlertEnabled, handleToggleSmartChargeAlertEnabled, firestoreSynced, googleDriveSynced, lifeProfile, setIsLifeProfileModalOpen, memories, handleDetectGpsLocation, isDetectingGps, creativePlacements, habits, resolvedHabits, liveBlocks, activeTimeZone, alarmRinging, handleToggleBypassCharging, handleDismissTwoWay, handleTriggerRing, handleSimulateCharge90, handleSimulatePowerDisconnect, handleSimulateBedtimeLowBattery, deviceSettings, handleUpdateDeviceSettings, activeLocation, capsuleTimerState, stealthAudioOnly, setStealthAudioOnly, handleSimulateWindowsWake, capsulePrefs, handleUpdateCapsulePrefs, hasOpenedAssistantRef, assistantContextSummary, handleResetChatMode, handleExecuteMedicationActions, handleExecuteCreativeActions, handleExecuteHabitActions, handleUpdateLifeProfile, handleApplyAppSettings, handleApplySettingsPatch, currentSettingsSnapshot, handleExecuteMemoryActions, pendingAssistantPrompt, setPendingAssistantPrompt, autoStartVoice, setAutoStartVoice, handleAddMemory, handleUpdateMemory, handleDeleteMemory, handleSaveCloudApiUrl,
  } = a;

  return (
    <>
        <AnimatePresence mode="wait" initial={false}>
        <AppDashboardTab a={a} />
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
              setStealthAudioOnly((v: boolean) => {
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
            habits={habits}
            resolvedHabits={resolvedHabits}
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
            onExecuteHabitActions={handleExecuteHabitActions}
            onApplyProfileUpdates={handleUpdateLifeProfile}
            onApplyAppSettings={handleApplyAppSettings}
            onApplySettingsPatch={handleApplySettingsPatch}
            currentSettingsSnapshot={currentSettingsSnapshot}
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
    </>
  );
};
