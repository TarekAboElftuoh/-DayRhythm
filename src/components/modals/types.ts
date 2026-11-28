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
  SunlightSettings,
  TaskActionProposal,
  TaskExecutionResult,
  TaskSoundCategory,
  TravelState,
} from '../../types/dayrhythm';
import type { CapsulePrefs } from '../FloatingPiPCapsule';
import { PersistentAlertOverlay } from '../PersistentAlertOverlay';
import type { SyncedRhythmPayload } from '../../firebase';

export const FloatingPiPCapsule = lazy(() =>
  import('../FloatingPiPCapsule').then((m) => ({ default: m.FloatingPiPCapsule }))
);
export const LifeProfileModal = lazy(() =>
  import('../LifeProfileModal').then((m) => ({ default: m.LifeProfileModal }))
);
export const TravelModeModal = lazy(() =>
  import('../TravelModeModal').then((m) => ({ default: m.TravelModeModal }))
);
export const SmartCatchUpModal = lazy(() =>
  import('../SmartCatchUpModal').then((m) => ({ default: m.SmartCatchUpModal }))
);
export const PomodoroModal = lazy(() =>
  import('../PomodoroModal').then((m) => ({ default: m.PomodoroModal }))
);
export const LogoPickerModal = lazy(() =>
  import('../LogoPickerModal').then((m) => ({ default: m.LogoPickerModal }))
);

export type FloatingPiPProps = ComponentProps<typeof FloatingPiPCapsule>;
export type LifeProfileProps = ComponentProps<typeof LifeProfileModal>;
export type PersistentAlertProps = ComponentProps<typeof PersistentAlertOverlay>;

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
  medications: MedicationItem[];
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
  sunlightSettings: SunlightSettings;
  handleUpdateSunlightSettings: (next: SunlightSettings) => void;
  todayCairoIso: string;
  travelState: TravelState;
  triggerTaskAlert: LifeProfileProps['onTriggerTaskAlert'];
  undoSnapshot: ScheduleBlock[] | null;
}

