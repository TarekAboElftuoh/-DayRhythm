import { db, AppSyncSettings, OnePlusDeviceSettings } from '../../firebase';
import {
  CreativeActivityItem,
  DualStreaks,
  DynamicHabit,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  MemoryItem,
  PeriodicRitualStatus,
  PomodoroState,
  QuietModeType,
  SurfaceTheme,
  TaskSoundCategory,
  TravelState,
  UiPrefs,
  WorkspaceSyncSignal,
} from '../../types/dayrhythm';


export type SanctuarySilenceMode =
  | 'silent_inbox'
  | 'silent_notif'
  | 'vibrate_notif'
  | 'hide_all';

declare module '../../types/dayrhythm' {
  interface LifeProfile {
    sanctuarySilenceMode?: SanctuarySilenceMode;
  }
  interface SilentNotificationItem {
    description?: string;
  }
}

export interface ActiveAlarmItem {
  id: string;
  uid: string;
  title: string;
  body?: string;
  category: TaskSoundCategory;
  status: 'ringing' | 'dismissed' | 'snoozed';
  originClientId: string;
  dismissedByClientId?: string;
  firedAtMs: number;
  dismissedAtMs?: number;
  medicationId?: string;
  doseTime24?: string;
  taskId?: string;
  taskListId?: string;
}

export interface UserSettingsPayload {
  lifeProfile?: LifeProfile;
  deviceSettings?: OnePlusDeviceSettings;
  appSettings?: AppSyncSettings;
  quietMode?: QuietModeType;
  adhanOverrideSilent?: boolean;
  sanctuaryOverrideUntilMs?: number;
  surfaceTheme?: SurfaceTheme;
  hydrationHistory?: HydrationDayLog[];
  streaks?: DualStreaks;
  uiPrefs?: UiPrefs;
  medications?: MedicationItem[];
  creativeActivities?: CreativeActivityItem[];
  habits?: DynamicHabit[];
  memories?: MemoryItem[];
  hydrationDateKey?: string;
  cupsLogged?: number;
  targetCups?: number;
  hydrationWeeklyCounts?: number[];
  hydrationSlotOpIds?: string[];
  hydrationRemovedOpIds?: string[];
  hydrationUpdatedAtMs?: number;
  dailyCommitmentDays?: number;
  dailyCommitmentDoneToday?: boolean;
  waterTargetDays?: number;
  waterTargetDoneToday?: boolean;
  completedOverrides?: Record<string, boolean>;
  fastingOverride?: 'auto' | 'fasting' | 'normal';
  isFridayMode?: boolean;
  includeBiweeklyPcCleanup?: boolean;
  periodicRituals?: PeriodicRitualStatus[];
  travelState?: TravelState;
  pomodoro?: PomodoroState;
  dismissedKeys?: string[];
  syncSignal?: WorkspaceSyncSignal;
  originClientId?: string;
  lastDismissSignal?: {
    timestampMs: number;
    scope: string;
    action: string;
    clientId: string;
  };
  updatedAtMs?: number;
}

export interface HydrationMergeInput {
  dateKey: string;
  targetCups: number;
  cupsLogged: number;
  slotOpIds?: string[];
  removedOpIds?: string[];
  updatedAtMs?: number;
}

export interface HydrationMergeResult {
  dateKey: string;
  targetCups: number;
  cupsLogged: number;
  slots: boolean[];
  slotOpIds: string[];
  removedOpIds: string[];
  updatedAtMs: number;
}

