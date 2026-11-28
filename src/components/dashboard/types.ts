import type {
  ActiveSanctuaryState,
  AppLanguage,
  BatteryGuardState,
  CalendarActionProposal,
  CalendarExecutionResult,
  CalendarTombstone,
  CreativeActivityPlacement,
  CreativeCadence,
  DailyRhythmPlan,
  DeletedWorkspaceSnapshot,
  DualStreaks,
  DynamicHabit,
  DynamicHabitAnchor,
  DynamicHabitDailyOverride,
  DynamicHabitStatus,
  FreeTimeSlot,
  GmailDigestItem,
  GoogleCalendarEventItem,
  GoogleCalendarInfo,
  GoogleTaskItem,
  GoogleTaskList,
  HydrationDayLog,
  LifeProfile,
  MedicationActionProposal,
  MedicationFastingPolicy,
  MedicationItem,
  PeriodicRitualStatus,
  PersistedChatMessage,
  PhoneBatteryTelemetry,
  PomodoroState,
  PrayerTimeItem,
  QuietModeType,
  ResolvedHabitPlacement,
  ScheduleBlock,
  SilentNotificationItem,
  SoundRepeatMap,
  SoundRepeatSetting,
  SunlightSessionId,
  SurfaceTheme,
  SyncTierMode,
  TaskActionProposal,
  TaskExecutionResult,
  TaskSoundCategory,
  TodayCalendarMeta,
  TomorrowAlertInfo,
  TravelState,
  WeatherHydrationInfo,
} from '../../types/dayrhythm';
import type { ComputedSunlightSession } from '../../engines/sunlightEngine';

export const MED_FASTING_POLICY_OPTIONS: ReadonlyArray<{
  value: MedicationFastingPolicy;
  labelAr: string;
}> = [
  { value: 'auto-nearest', labelAr: 'تلقائي للأقرب (سحور / إفطار)' },
  { value: 'before-fajr', labelAr: 'قبل الفجر بـ 15 د (السحور)' },
  { value: 'after-maghrib', labelAr: 'بعد المغرب بـ 15 د (الإفطار)' },
  { value: 'skip', labelAr: 'تخطي في أيام الصيام' },
  { value: 'unchanged', labelAr: 'تثبيت نفس الموعد' },
];

export interface DashboardViewProps {
  language: AppLanguage;
  isFridayMode: boolean;
  onToggleFridayMode: (v: boolean) => void;
  includeBiweeklyPcCleanup: boolean;
  onToggleBiweeklyPcCleanup: (v: boolean) => void;
  adhanOverrideSilent: boolean;
  onToggleAdhanOverrideSilent: () => void;
  onTestAdhanChime: () => void;
  surfaceTheme: SurfaceTheme;
  onToggleSurfaceTheme: (theme: SurfaceTheme) => void;
  prayers: PrayerTimeItem[];
  blocks: ScheduleBlock[];
  includePrayerAnchors: boolean;
  onToggleIncludePrayerAnchors: () => void;
  useOfflineDemo: boolean;
  onToggleOfflineDemo: () => void;
  onToggleComplete: (id: string) => void;
  onDeleteBlock: (id: string) => void;
  onRestoreBlock: (id: string) => void;
  onRestoreAllDeleted: () => void;
  lastDeletedBlock: ScheduleBlock | null;
  shakeUndoSecondsLeft: number;
  onTriggerShakeUndo: () => void;
  tombstones: CalendarTombstone[];
  onSweepOldTombstones: () => number;
  hydrationToday: HydrationDayLog;
  hydrationHistory: HydrationDayLog[];
  onLogWaterCup: () => void;
  onToggleWaterSlot: (index: number) => void;
  medications: MedicationItem[];
  onToggleMedication: (id: string, doseTime24?: string) => void;
  onToggleMedicationDate: (id: string, dateIso: string) => void;
  onRefillMedication: (id: string, newDoses: number, refillAlertDays?: number) => void;
  onAddMedication: (input: {
    name: string;
    time24?: string;
    times24?: string[];
    daysOfWeek?: number[];
    fastingPolicy?: MedicationFastingPolicy;
    doseNote?: string;
    courseEndDate?: string;
    remainingDoses?: number;
    totalDoses?: number;
    refillAlertDays?: number;
  }) => void;
  onUpdateMedication?: (input: MedicationActionProposal) => void;
  onDeleteMedication: (id: string) => void;
  streaks: DualStreaks;
  onToggleDailyCommitmentStreak: () => void;
  pomodoro: PomodoroState;
  onOpenPomodoro: () => void;
  travelState: TravelState;
  onOpenTravel: () => void;
  onOpenCatchUp: () => void;
  hasUndoSnapshot: boolean;
  onUndoReflow: () => void;
  quietMode: QuietModeType;
  quietRemainingSec: number;
  onSetQuietMode: (mode: QuietModeType, durationMinutes: number) => void;
  calendarConnected: boolean;
  prayersReady?: boolean;
  locationResolutionState?: 'idle' | 'resolving_gps' | 'gps_locked' | 'timezone_fallback';
  calendarUserEmail?: string;
  isLoggingIn: boolean;
  loadingCalendarEvents: boolean;
  calendarList: GoogleCalendarInfo[];
  calendarEvents: GoogleCalendarEventItem[];
  googleTaskLists: GoogleTaskList[];
  googleTasks: GoogleTaskItem[];
  loadingTasks: boolean;
  chatMessages: PersistedChatMessage[];
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onRefreshWorkspace: () => Promise<void>;
  onExecuteCalendarActions: (
    actions: CalendarActionProposal[]
  ) => Promise<{ googleSynced: boolean; results: CalendarExecutionResult[] }>;
  onExecuteTaskActions: (
    taskActions: TaskActionProposal[]
  ) => Promise<{ googleSynced: boolean; results: TaskExecutionResult[] }>;
  onOpenAssistant: () => void;
  syncTier: SyncTierMode;
  onChangeSyncTier: (tier: SyncTierMode) => void;
  onImportIcsBlocks: (newBlocks: ScheduleBlock[]) => void;
  periodicRituals: PeriodicRitualStatus[];
  onCompletePeriodicRitual: (id: PeriodicRitualStatus['id']) => void;
  batteryGuard: BatteryGuardState;
  phoneBattery: PhoneBatteryTelemetry | null;
  phoneChargeLimitPct: number;
  onUpdatePhoneChargeLimit: (limitPct: number) => void;
  phoneChargeAlertDismissed: boolean;
  onDismissPhoneChargeAlert: () => void;
  smartChargeAlertEnabled: boolean;
  onToggleSmartChargeAlertEnabled: () => void;
  smartChargeAudioActive: boolean;
  onTestSmartChargeAlert: () => void;
  firestoreSynced: boolean;
  aquaTouchMode: boolean;
  alertSliderLinked: boolean;
  lifeProfile: LifeProfile;
  dailyRhythmPlan: DailyRhythmPlan;
  fastingOverride: 'auto' | 'fasting' | 'normal';
  onChangeFastingOverride: (mode: 'auto' | 'fasting' | 'normal') => void;
  onOpenLifeProfile: () => void;
  onQuickUpdateWeight: (nextWeightKg: number) => void;
  memoryCount: number;
  onDetectGpsLocation: () => Promise<void>;
  isDetectingGps: boolean;
  activeSanctuary: ActiveSanctuaryState;
  onCancelActiveSanctuaryEarly?: () => void;
  silentNotifications: SilentNotificationItem[];
  onClearSilentNotifications: () => void;
  activeAudioAlert: {
    id: string;
    title: string;
    category: TaskSoundCategory;
    isContinuous?: boolean;
  } | null;
  hasPersistentAlert?: boolean;
  onAcknowledgeAudioAlert: () => void;
  onTriggerTaskAlert: (
    title: string,
    category: TaskSoundCategory,
    options?: { bypassSanctuary?: boolean; privacyEmoji?: string }
  ) => void;
  weatherInfo: WeatherHydrationInfo | null;
  gmailDigest: GmailDigestItem[];
  gmailScannedCount: number;
  loadingGmail: boolean;
  gmailNeedsReauth: boolean;
  gmailError: string;
  gmailLastSyncedIso?: string;
  gmailNextRetryInSec?: number;
  onFetchGmailDigest: () => Promise<void>;
  hasDailyWirdHabit?: boolean;
  activeTimeZone?: string;
  onLogSleepQuality: (mode: 'good' | 'short_30' | 'short_60' | 'reset') => void;
  onOpenAssistantWithPrompt: (prompt: string) => void;
  todayCalendarMeta: TodayCalendarMeta;
  creativePlacements: CreativeActivityPlacement[];
  freeSlotsToday: FreeTimeSlot[];
  onAddCreativeActivity: (input: {
    name: string;
    emoji?: string;
    cadence?: CreativeCadence;
    goalCount?: number;
    weeklyGoalSessions: number;
    sessionMinutes: number;
    expiresOnDate?: string;
  }) => void;
  onToggleCreativeToday: (activityId: string) => void;
  onDeleteCreativeActivity: (id: string) => void;
  onScheduleCreativeInCalendar: (placement: CreativeActivityPlacement) => Promise<void>;
  waterRemindersEnabled: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  onToggleWaterReminders: () => void;
  onRequestNotificationPermission: () => Promise<void>;
  tomorrowAlert: TomorrowAlertInfo | null;
  lowEnergyActive: boolean;
  onToggleLowEnergyToday: () => void;
  soundRepeats: SoundRepeatMap;
  onUpdateSoundRepeat: (category: TaskSoundCategory, setting: SoundRepeatSetting) => void;
  lastDeletedWorkspaceItem: DeletedWorkspaceSnapshot | null;
  onUndoWorkspaceDelete: () => Promise<void>;
  onDismissWorkspaceUndo: () => void;
  wsConnected: boolean;
  activeOneTimeSilenceMinutes: number;
  sunlightSessions?: ComputedSunlightSession[];
  sunlightEnabled?: boolean;
  onSnoozeSunlight?: (id: SunlightSessionId) => void;
  onSunlightSessionEnd?: (id: SunlightSessionId) => void;
  habits?: DynamicHabit[];
  resolvedHabits?: ResolvedHabitPlacement[];
  onAddHabit?: (input: {
    title: string;
    status: DynamicHabitStatus;
    anchor: DynamicHabitAnchor;
    durationMin: number;
    daysOfWeek?: number[];
    skipOnFasting?: boolean;
  }) => void;
  onUpdateHabit?: (
    id: string,
    patch: {
      title: string;
      status: DynamicHabitStatus;
      anchor: DynamicHabitAnchor;
      durationMin: number;
      daysOfWeek?: number[];
      skipOnFasting?: boolean;
      dailyOverrides?: Record<string, DynamicHabitDailyOverride>;
    }
  ) => void;
  onToggleHabitToday?: (habitId: string) => void;
  onDeleteHabit?: (habitId: string) => void;
  onToggleHabitStatus?: (habitId: string) => void;
}
