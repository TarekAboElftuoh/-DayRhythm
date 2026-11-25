import { lazy, Suspense, type ComponentProps } from 'react';
import {
  ActiveTab,
  AppLanguage,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  PhoneBatteryTelemetry,
  PomodoroState,
  QuietModeType,
  ScheduleBlock,
  SoundRepeatSetting,
  TaskActionProposal,
  TaskExecutionResult,
  TaskSoundCategory,
  TravelState,
} from '../types/dayrhythm';
import type { CapsulePrefs } from './FloatingPiPCapsule';
import { OfflineIndicator } from './OfflineIndicator';
import { PersistentAlertOverlay } from './PersistentAlertOverlay';
import { DEFAULT_LOGO_ID } from './logoRegistry';
import { DEFAULT_SOUND_REPEATS } from '../engines/audioEngine';
import { isAndroidNativeApp } from '../services/platform';
import type { SyncedRhythmPayload } from '../firebase';

const FloatingPiPCapsule = lazy(() =>
  import('./FloatingPiPCapsule').then((m) => ({ default: m.FloatingPiPCapsule }))
);
const LifeProfileModal = lazy(() =>
  import('./LifeProfileModal').then((m) => ({ default: m.LifeProfileModal }))
);
const TravelModeModal = lazy(() =>
  import('./TravelModeModal').then((m) => ({ default: m.TravelModeModal }))
);
const SmartCatchUpModal = lazy(() =>
  import('./SmartCatchUpModal').then((m) => ({ default: m.SmartCatchUpModal }))
);
const PomodoroModal = lazy(() =>
  import('./PomodoroModal').then((m) => ({ default: m.PomodoroModal }))
);
const LogoPickerModal = lazy(() =>
  import('./LogoPickerModal').then((m) => ({ default: m.LogoPickerModal }))
);

type FloatingPiPProps = ComponentProps<typeof FloatingPiPCapsule>;
type LifeProfileProps = ComponentProps<typeof LifeProfileModal>;
type PersistentAlertProps = ComponentProps<typeof PersistentAlertOverlay>;

export interface AppModalsProps {
  activeBrandLogo: { id: string; titleAr: string; src: string };
  activeLocation: LifeProfileProps['activeLocation'];
  activeTimeZone: string;
  capsulePrefs: CapsulePrefs;
  capsuleTimerState: {
    emoji: string;
    title: string;
    statusLabel: string;
    sourceKind: FloatingPiPProps['sourceKind'];
    countdownText: string;
    isNow: boolean;
    isUrgent: boolean;
    progressRatio: number;
    targetEpochMs: number;
    durationSeconds: number;
    calendarTrack: FloatingPiPProps['calendarTrack'];
    taskTrack: FloatingPiPProps['taskTrack'];
    upcomingQueue: FloatingPiPProps['upcomingQueue'];
  };
  googleDriveSynced: boolean;
  handleAcknowledgeAudioAlert: () => void;
  handleAddMemory: LifeProfileProps['onAddMemory'];
  handleApplyTravel: (nextTravel: TravelState) => void;
  handleCheckAppUpdates: () => void;
  handleCommitReflow: (reflowed: ScheduleBlock[]) => void;
  handleDeleteMemory: LifeProfileProps['onDeleteMemory'];
  handleDetectGpsLocation: () => Promise<void>;
  handleDisableTravel: () => void;
  handleExecuteTaskActions: (actions: TaskActionProposal[]) => Promise<unknown>;
  handleExportBackupJson: () => void;
  handleGoogleSignOut: () => Promise<void>;
  handleImportBackupJson: (rawText: string) => Promise<{ ok: boolean; summaryAr: string }>;
  handleLogWaterCup: () => void;
  handleResetBrandLogo: () => void;
  handleSelectBrandLogo: (id: string) => void;
  handleSelectTab: (tab: ActiveTab) => void;
  handleSetQuietMode: (mode: QuietModeType, durationMinutes: number) => void;
  handleSnoozeAlert: (alertItem: NonNullable<PersistentAlertProps['alert']>, minutes: number, options?: { localOnly?: boolean }) => void;
  handleStopSmartChargeAlert: () => void;
  handleTestSmartChargeAlert: () => void;
  handleToggleBiweeklyPcCleanup: (v: boolean) => void;
  handleToggleFridayMode: (v: boolean) => void;
  handleToggleIncludePrayerAnchors: () => void;
  handleToggleMedication: (id: string, doseTime24?: string) => void;
  handleToggleSmartChargeAlertEnabled: () => void;
  handleToggleSmartChargeKeepUntilUnplugged: () => void;
  handleUndoReflow: () => void;
  handleUpdateCapsulePrefs: (next: CapsulePrefs) => void;
  handleUpdateLifeProfile: LifeProfileProps['onSaveProfile'];
  handleUpdateMemory: LifeProfileProps['onUpdateMemory'];
  handleUpdatePhoneChargeLimit: (limit: number) => void;
  handleUpdateSoundRepeat: (cat: TaskSoundCategory, val: SoundRepeatSetting) => void;
  includeBiweeklyPcCleanup: boolean;
  includePrayerAnchors: boolean;
  isCatchUpModalOpen: boolean;
  isDetectingGps: boolean;
  isFridayMode: boolean;
  isLifeProfileModalOpen: boolean;
  isLogoPickerOpen: boolean;
  isPomodoroModalOpen: boolean;
  isSyncingGoogleDrive: boolean;
  isTravelModalOpen: boolean;
  language: AppLanguage;
  lifeProfile: LifeProfile;
  liveBlocks: ScheduleBlock[];
  memories: MemoryItem[];
  needsAuth: boolean;
  nextMedicationQuick: FloatingPiPProps['nextMedicationQuick'];
  persistentAlert: PersistentAlertProps['alert'];
  phoneBattery: PhoneBatteryTelemetry | null;
  phoneChargeLimitPct: number | undefined;
  pomodoro: PomodoroState;
  prayers: LifeProfileProps['prayers'];
  pushFullCloudBackupImmediately: () => Promise<boolean>;
  pushToTasksVaultImmediately: (overrides?: Partial<SyncedRhythmPayload>) => Promise<void>;
  quietMode: QuietModeType;
  selectedLogoId: string;
  setIsCatchUpModalOpen: (open: boolean) => void;
  setIsLifeProfileModalOpen: (open: boolean) => void;
  setIsLogoPickerOpen: (open: boolean) => void;
  setIsPomodoroModalOpen: (open: boolean) => void;
  setIsTravelModalOpen: (open: boolean) => void;
  setPersistentAlert: (alert: PersistentAlertProps['alert']) => void;
  setPomodoro: React.Dispatch<React.SetStateAction<PomodoroState>>;
  smartChargeAlertEnabled: boolean;
  smartChargeAudioActive: boolean;
  smartChargeKeepUntilUnplugged: boolean;
  travelState: TravelState;
  triggerTaskAlert: LifeProfileProps['onTriggerTaskAlert'];
  undoSnapshot: ScheduleBlock[] | null;
}

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
            setPersistentAlert(null);
          }
        }}
        onAutoSnooze={(alertItem, mins) => {
          handleSnoozeAlert(alertItem, mins, { localOnly: true });
        }}
        onConfirmWater={() => {
          handleLogWaterCup();
          handleAcknowledgeAudioAlert();
          setPersistentAlert(null);
        }}
        onConfirmMedication={(medId, doseTime24) => {
          handleToggleMedication(medId, doseTime24);
          handleAcknowledgeAudioAlert();
          setPersistentAlert(null);
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
          setPersistentAlert(null);
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
          />
        </Suspense>
      )}

      {isTravelModalOpen && (
        <Suspense fallback={null}>
          <TravelModeModal
            isOpen={isTravelModalOpen}
            onClose={() => setIsTravelModalOpen(false)}
            travelState={travelState}
            scheduleBlocks={liveBlocks}
            onApplyTravel={handleApplyTravel}
            onDisableTravel={handleDisableTravel}
          />
        </Suspense>
      )}

      {isCatchUpModalOpen && (
        <Suspense fallback={null}>
          <SmartCatchUpModal
            isOpen={isCatchUpModalOpen}
            onClose={() => setIsCatchUpModalOpen(false)}
            blocks={liveBlocks}
            activeTimeZone={activeTimeZone}
            hasUndoSnapshot={!!undoSnapshot}
            onCommitReflow={handleCommitReflow}
            onUndoToOriginal={handleUndoReflow}
          />
        </Suspense>
      )}

      {isPomodoroModalOpen && (
        <Suspense fallback={null}>
          <PomodoroModal
            isOpen={isPomodoroModalOpen}
            onClose={() => setIsPomodoroModalOpen(false)}
            state={pomodoro}
            onToggleRun={() =>
              setPomodoro((p) => {
                const next = { ...p, isRunning: !p.isRunning };
                void pushToTasksVaultImmediately({ pomodoro: next });
                return next;
              })
            }
            onReset={() =>
              setPomodoro((p) => {
                const next: PomodoroState = {
                  ...p,
                  phase: 'focus',
                  remainingSeconds: p.presetMinutes * 60,
                  totalSeconds: p.presetMinutes * 60,
                  isRunning: false,
                };
                void pushToTasksVaultImmediately({ pomodoro: next });
                return next;
              })
            }
            onSelectPreset={(minutes) =>
              setPomodoro((p) => {
                const next: PomodoroState = {
                  ...p,
                  phase: minutes === 5 ? 'break' : 'focus',
                  presetMinutes: minutes,
                  remainingSeconds: minutes * 60,
                  totalSeconds: minutes * 60,
                  isRunning: false,
                };
                void pushToTasksVaultImmediately({ pomodoro: next });
                return next;
              })
            }
            onFastForwardTest={() =>
              setPomodoro((p) => ({
                ...p,
                phase: 'focus',
                remainingSeconds: 3,
                totalSeconds: p.presetMinutes * 60,
                isRunning: true,
              }))
            }
          />
        </Suspense>
      )}

      {isLogoPickerOpen && (
        <Suspense fallback={null}>
          <LogoPickerModal
            isOpen={isLogoPickerOpen}
            selectedLogoId={selectedLogoId}
            onSelectLogo={handleSelectBrandLogo}
            onResetDefault={handleResetBrandLogo}
            onClose={() => setIsLogoPickerOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
