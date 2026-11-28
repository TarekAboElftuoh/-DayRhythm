import React from 'react';
import { motion } from 'framer-motion';
import { DashboardView } from '../components/DashboardView';
import { DEFAULT_SOUND_REPEATS } from '../engines/audioEngine';
import type { AppControllerModel } from './useAppController';

export const AppDashboardTab: React.FC<{ a: AppControllerModel }> = ({ a }) => {
  const {
    activeTab, language, isFridayMode, handleToggleFridayMode, includeBiweeklyPcCleanup, handleToggleBiweeklyPcCleanup, adhanOverrideSilent, handleToggleAdhanOverrideSilent, handleTestAdhanChime, surfaceTheme, handleToggleSurfaceTheme, prayers, includePrayerAnchors, handleToggleIncludePrayerAnchors, useOfflineDemo, setUseOfflineDemo, handleToggleComplete, handleDeleteBlock, handleRestoreBlock, handleRestoreAllDeleted, lastDeletedBlock, shakeUndoSecondsLeft, handleTriggerShakeUndo, tombstones, handleSweepOldTombstones, hydrationToday, hydrationHistory, handleLogWaterCup, handleToggleWaterSlot, medications, handleToggleMedication, handleToggleMedicationDate, handleRefillMedication, handleAddMedication, handleDeleteMedication, streaks, handleToggleDailyCommitmentStreak, pomodoro, setIsPomodoroModalOpen, travelState, setIsTravelModalOpen, setIsCatchUpModalOpen, undoSnapshot, handleUndoReflow, quietMode, quietRemainingSec, handleSetQuietMode, needsAuth, prayersReady, locationResolutionState, authUser, isLoggingIn, loadingEvents, calendarList, calendarEvents, googleTaskLists, googleTasks, loadingTasks, chatMessages, handleGoogleSignIn, handleGoogleSignOut, refreshWorkspace, handleExecuteCalendarActions, handleExecuteTaskActions, handleSelectTab, syncTier, setSyncTier, handleImportIcsBlocks, periodicRituals, handleCompletePeriodicRitual, batteryGuard, phoneBattery, phoneChargeLimitPct, handleUpdatePhoneChargeLimit, phoneChargeAlertDismissed, handleStopSmartChargeAlert, smartChargeAlertEnabled, handleToggleSmartChargeAlertEnabled, smartChargeAudioActive, handleTestSmartChargeAlert, firestoreSynced, googleDriveSynced, lifeProfile, dailyRhythmPlan, fastingOverride, handleChangeFastingOverride, setIsLifeProfileModalOpen, handleQuickUpdateWeight, memories, handleDetectGpsLocation, isDetectingGps, activeSanctuary, handleCancelActiveSanctuaryEarly, silentNotifications, handleClearSilentNotifications, activeAudioAlert, persistentAlert, handleAcknowledgeAudioAlert, triggerTaskAlert, weatherInfo, gmailDigest, gmailScannedCount, loadingGmail, gmailNeedsReauth, gmailError, gmailLastSyncedIso, gmailNextRetryInSec, fetchGmailDigest, hasDailyWirdHabit, activeTimeZone, handleLogSleepQuality, handleOpenAssistantWithPrompt, todayCalendarMeta, creativePlacements, freeSlotsToday, handleAddCreativeActivity, handleToggleCreativeToday, handleDeleteCreativeActivity, handleScheduleCreativeInCalendar, waterRemindersEnabled, notificationPermission, handleToggleWaterReminders, handleRequestNotificationPermission, tomorrowAlert, lowEnergyActive, handleToggleLowEnergyToday, handleUpdateSoundRepeat, lastDeletedWorkspaceItem, handleUndoWorkspaceDelete, setLastDeletedWorkspaceItem, wsConnected, activeOneTimeSilenceMinutes, sunlightSessions, sunlightSettings, handleSnoozeSunlight, handleSunlightSessionEnd, habits, resolvedHabits, handleAddHabit, handleUpdateHabit, handleToggleHabitToday, handleDeleteHabit, handleToggleHabitStatus, liveBlocks, deviceSettings, handleExecuteMedicationActions,
  } = a;

  return (
    <>
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
            onToggleOfflineDemo={() => setUseOfflineDemo((v: boolean) => !v)}
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
            habits={habits}
            resolvedHabits={resolvedHabits}
            onAddHabit={handleAddHabit}
            onUpdateHabit={handleUpdateHabit}
            onToggleHabitToday={handleToggleHabitToday}
            onDeleteHabit={handleDeleteHabit}
            onToggleHabitStatus={handleToggleHabitStatus}
          />
          </motion.div>
        )}
    </>
  );
};
