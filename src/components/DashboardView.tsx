import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Droplets,
  Trash2,
  RotateCcw,
  CheckCircle2,
  Circle,
  Timer,
  Zap,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  Calendar,
  RefreshCw,
  ExternalLink,
  Plus,
  X,
  Clock,
  Sunrise,
  Sunset,
  CheckSquare,
  MessageSquare,
  SlidersHorizontal,
  MicOff,
  MapPin,
  Mail,
  Bell,
  Palette,
  ChevronDown,
  ChevronUp,
  Leaf,
  AlertCircle,
  BatteryCharging,
  Smartphone,
  ShoppingBag,
  BellOff,
  BarChart3,
  Pill,
  Plane,
  Pencil,
} from 'lucide-react';
import { WeeklyReportCard } from './WeeklyReportCard';
import { SunlightCard } from './SunlightCard';
import { ErrorBoundary } from './ErrorBoundary';
import { DayTimelineView } from './DayTimelineView';
import type { ComputedSunlightSession } from '../engines/sunlightEngine';
// Charts (recharts) are only shown when expanded, so load them on demand to keep app start-up light.
const HydrationWeeklyChart = lazy(() =>
  import('./HydrationWeeklyChart').then((m) => ({ default: m.HydrationWeeklyChart }))
);
const MedicationConsumptionChart = lazy(() =>
  import('./MedicationConsumptionChart').then((m) => ({ default: m.MedicationConsumptionChart }))
);
const ChartLoadingFallback = () => (
  <div className="mt-3 h-40 rounded-xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
);
import {
  ActiveSanctuaryState,
  AppLanguage,
  BatteryGuardState,
  CalendarActionProposal,
  CalendarExecutionResult,
  CalendarTombstone,
  CreativeActivityPlacement,
  CreativeCadence,
  DeletedWorkspaceSnapshot,
  DualStreaks,
  DailyRhythmPlan,
  DynamicHabit,
  DynamicHabitAnchor,
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
  SurfaceTheme,
  SunlightSessionId,
  SyncTierMode,
  TaskActionProposal,
  TaskExecutionResult,
  TaskSoundCategory,
  TodayCalendarMeta,
  TomorrowAlertInfo,
  TravelState,
  WeatherHydrationInfo,
} from '../types/dayrhythm';
import { TASK_SOUND_META, classifyTaskSound } from '../engines/audioEngine';
import {
  formatIsoTo12h,
  formatMinutes12h,
  formatTime24To12h,
  getDateIsoInTimeZone,
  getNowMinutesInTimeZone,
} from '../engines/prayerEngine';
import {
  ARABIC_WEEKDAYS,
  DYNAMIC_HABIT_ANCHOR_LABELS,
  buildDayTimelineModel,
  checkSmartScheduleConflict,
  computeMedicationDaysLeft,
  formatDurationAr,
  resolveMedicationDosesForDay,
  type DayTimelinePlacedItem,
  type DayTimelineUnplacedItem,
} from '../engines/lifeRhythmEngine';

const MED_FASTING_POLICY_OPTIONS: ReadonlyArray<{
  value: MedicationFastingPolicy;
  labelAr: string;
}> = [
  { value: 'auto-nearest', labelAr: 'تلقائي للأقرب (سحور / إفطار)' },
  { value: 'before-fajr', labelAr: 'قبل الفجر بـ 15 د (السحور)' },
  { value: 'after-maghrib', labelAr: 'بعد المغرب بـ 15 د (الإفطار)' },
  { value: 'skip', labelAr: 'تخطي في أيام الصيام' },
  { value: 'unchanged', labelAr: 'تثبيت نفس الموعد' },
];
import { cleanCalendarText, resolveBlockDisplayInfo } from '../services/apiClient';
import { t } from '../engines/i18n';

const LiveSecClock: React.FC<{ initialSec?: number; fallback: string; resetKey: number }> = ({
  initialSec,
  fallback,
  resetKey,
}) => {
  const [sec, setSec] = useState<number | undefined>(initialSec);
  useEffect(() => {
    setSec(initialSec);
    if (typeof initialSec !== 'number') return;

    const endAtMs = Date.now() + Math.max(0, initialSec) * 1000;
    let intervalId: number | null = null;

    const syncFromClock = () => {
      setSec(Math.max(0, Math.round((endAtMs - Date.now()) / 1000)));
    };

    const startTicker = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(syncFromClock, 1000);
    };

    const stopTicker = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const onVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        stopTicker();
      } else {
        syncFromClock();
        startTicker();
      }
    };

    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
      startTicker();
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityOrFocus);
    }
    window.addEventListener('focus', onVisibilityOrFocus);

    return () => {
      stopTicker();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      }
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, [initialSec, resetKey]);
  if (typeof sec !== 'number') return <>{fallback}</>;
  const safe = Math.max(0, Math.floor(sec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return (
    <>
      {h > 0
        ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`}
    </>
  );
};

interface DashboardViewProps {
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
    }
  ) => void;
  onToggleHabitToday?: (habitId: string) => void;
  onDeleteHabit?: (habitId: string) => void;
  onToggleHabitStatus?: (habitId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  language,
  isFridayMode,
  onToggleFridayMode,
  includeBiweeklyPcCleanup,
  onToggleBiweeklyPcCleanup,
  adhanOverrideSilent,
  onToggleAdhanOverrideSilent,
  onTestAdhanChime,
  surfaceTheme,
  onToggleSurfaceTheme,
  prayers,
  blocks,
  includePrayerAnchors,
  onToggleIncludePrayerAnchors,
  useOfflineDemo,
  onToggleOfflineDemo,
  onToggleComplete,
  onDeleteBlock,
  onRestoreBlock,
  onRestoreAllDeleted,
  lastDeletedBlock,
  shakeUndoSecondsLeft,
  onTriggerShakeUndo,
  tombstones,
  onSweepOldTombstones,
  hydrationToday,
  hydrationHistory,
  onLogWaterCup,
  onToggleWaterSlot,
  medications,
  streaks,
  onToggleMedication,
  onToggleMedicationDate,
  onRefillMedication,
  onAddMedication,
  onUpdateMedication,
  onDeleteMedication,
  pomodoro,
  onOpenPomodoro,
  travelState,
  onOpenTravel,
  onOpenCatchUp,
  hasUndoSnapshot,
  onUndoReflow,
  quietMode,
  quietRemainingSec,
  onSetQuietMode,
  calendarConnected,
  prayersReady,
  locationResolutionState,
  calendarUserEmail,
  isLoggingIn,
  loadingCalendarEvents,
  calendarList,
  calendarEvents,
  googleTaskLists,
  googleTasks,
  loadingTasks,
  chatMessages,
  onGoogleSignIn,
  onGoogleSignOut,
  onRefreshWorkspace,
  onExecuteCalendarActions,
  onExecuteTaskActions,
  onOpenAssistant,
  syncTier,
  onChangeSyncTier,
  onImportIcsBlocks,
  batteryGuard,
  phoneBattery,
  phoneChargeLimitPct,
  onUpdatePhoneChargeLimit,
  phoneChargeAlertDismissed,
  onDismissPhoneChargeAlert,
  smartChargeAlertEnabled,
  onToggleSmartChargeAlertEnabled,
  smartChargeAudioActive,
  onTestSmartChargeAlert,
  firestoreSynced,
  aquaTouchMode,
  alertSliderLinked,
  lifeProfile,
  dailyRhythmPlan,
  onOpenLifeProfile,
  onQuickUpdateWeight,
  memoryCount,
  onDetectGpsLocation,
  isDetectingGps,
  activeSanctuary,
  onCancelActiveSanctuaryEarly,
  silentNotifications,
  onClearSilentNotifications,
  activeAudioAlert,
  hasPersistentAlert,
  onAcknowledgeAudioAlert,
  onTriggerTaskAlert,
  weatherInfo,
  gmailDigest,
  gmailScannedCount,
  loadingGmail,
  gmailNeedsReauth,
  gmailError,
  gmailLastSyncedIso,
  gmailNextRetryInSec = 0,
  onFetchGmailDigest,
  activeTimeZone = 'Africa/Cairo',
  onLogSleepQuality,
  onOpenAssistantWithPrompt,
  todayCalendarMeta,
  creativePlacements,
  freeSlotsToday,
  onAddCreativeActivity,
  onToggleCreativeToday,
  onDeleteCreativeActivity,
  onScheduleCreativeInCalendar,
  waterRemindersEnabled,
  notificationPermission,
  onToggleWaterReminders,
  onRequestNotificationPermission,
  tomorrowAlert,
  lowEnergyActive,
  onToggleLowEnergyToday,
  soundRepeats,
  onUpdateSoundRepeat,
  lastDeletedWorkspaceItem,
  onUndoWorkspaceDelete,
  onDismissWorkspaceUndo,
  wsConnected,
  activeOneTimeSilenceMinutes,
  sunlightSessions = [],
  sunlightEnabled = false,
  onSnoozeSunlight,
  onSunlightSessionEnd,
  habits = [],
  resolvedHabits = [],
  onAddHabit,
  onUpdateHabit,
  onToggleHabitToday,
  onDeleteHabit,
  onToggleHabitStatus,
}) => {
  const [showTrash, setShowTrash] = useState(false);
  const [autoPlacedBlockStarts, setAutoPlacedBlockStarts] = useState<Record<string, number>>({});
  const [isSyncingAutoPlace, setIsSyncingAutoPlace] = useState(false);
  const [showSilentInbox, setShowSilentInbox] = useState(false);
  const [confirmCancelSanctuary, setConfirmCancelSanctuary] = useState(false);
  const [showGmailDrawer, setShowGmailDrawer] = useState(false);
  const [showTaskScheduleRow, setShowTaskScheduleRow] = useState(false);
  const [creatingTaskNow, setCreatingTaskNow] = useState(false);
  const [showAllCreative, setShowAllCreative] = useState(false);
  const [showPlannedHabits, setShowPlannedHabits] = useState(false);
  const [habitModalOpen, setHabitModalOpen] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [habitTitle, setHabitTitle] = useState('');
  const [habitStatus, setHabitStatus] = useState<DynamicHabitStatus>('active');
  const [habitAnchor, setHabitAnchor] = useState<DynamicHabitAnchor>('sunrise-light');
  const [habitDurationMin, setHabitDurationMin] = useState<number>(30);
  const [habitDaysOfWeek, setHabitDaysOfWeek] = useState<number[]>([]);
  const [habitSkipOnFasting, setHabitSkipOnFasting] = useState<boolean>(false);
  const [showHydrationSchedule, setShowHydrationSchedule] = useState(false);
  // Timed meeting-mode picker: mode (mute vs vibrate) × duration, so it can't be forgotten-on.
  const [meetingPickerOpen, setMeetingPickerOpen] = useState(false);
  const [showWaterChart, setShowWaterChart] = useState(false);
  const [showMedChart, setShowMedChart] = useState(false);
  const [pendingDeleteMed, setPendingDeleteMed] = useState<MedicationItem | null>(null);
  const [deleteMedStep, setDeleteMedStep] = useState<1 | 2>(1);
  const [deleteMedConfirmed, setDeleteMedConfirmed] = useState(false);
  const [showSleepCheckinEdit, setShowSleepCheckinEdit] = useState(false);
  const [scheduleCardMode, setScheduleCardMode] = useState<'schedule' | 'tasks'>('schedule');
  const [confirmHeroCompleteId, setConfirmHeroCompleteId] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<'today' | 'tomorrow' | 'special' | 'done'>('today');
  const [selectedTaskListId, setSelectedTaskListId] = useState<string>('all');
  const [syncLoading, setSyncLoading] = useState(false);

  // Explicit confirmation states for Google Calendar, Tasks, Gmail & Creative Free-Slot Calendar Sync
  const [confirmDeleteGoogleEv, setConfirmDeleteGoogleEv] = useState<GoogleCalendarEventItem | null>(null);
  const [pendingTaskConfirmation, setPendingTaskConfirmation] = useState<TaskActionProposal | null>(null);
  const [pendingGmailEventConfirm, setPendingGmailEventConfirm] = useState<GmailDigestItem | null>(null);
  const [pendingCreativeCalendarConfirm, setPendingCreativeCalendarConfirm] =
    useState<CreativeActivityPlacement | null>(null);
  const [addedGmailIds, setAddedGmailIds] = useState<Record<string, boolean>>({});

  // Quick Add Google Calendar Event Modal (12h controls -> converts to 24h for API)
  const [newEventModalOpen, setNewEventModalOpen] = useState(false);
  const [newEvTitle, setNewEvTitle] = useState('');
  const [newEvDate, setNewEvDate] = useState(() => getDateIsoInTimeZone(activeTimeZone));
  const [newEvHour12, setNewEvHour12] = useState<number>(4);
  const [newEvMinute, setNewEvMinute] = useState<string>('');
  const [newEvPeriod, setNewEvPeriod] = useState<'AM' | 'PM'>('PM');
  const [newEvDuration, setNewEvDuration] = useState<number>(0);
  const [newEvConfirmStep, setNewEvConfirmStep] = useState(false);

  // Quick Add Google Task inline input -> confirmation dialog
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueIso, setNewTaskDueIso] = useState('');
  const [newTaskTime24, setNewTaskTime24] = useState('');

  // Quick Add Flexible Medication / Supplement inline form (supports multi-dose, weekdays, course end, refill count & lead days)
  const [showAddMedForm, setShowAddMedForm] = useState(false);
  const [showMedAdvanced, setShowMedAdvanced] = useState(false);
  const [showEditMedAdvanced, setShowEditMedAdvanced] = useState(false);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [editMedName, setEditMedName] = useState('');
  const [editMedHour12, setEditMedHour12] = useState<number>(8);
  const [editMedMinute, setEditMedMinute] = useState<string>('00');
  const [editMedPeriod, setEditMedPeriod] = useState<'AM' | 'PM'>('AM');
  const [editMedTimes24, setEditMedTimes24] = useState<string[]>([]);
  const [editMedDaysOfWeek, setEditMedDaysOfWeek] = useState<number[]>([]);
  const [editMedFastingPolicy, setEditMedFastingPolicy] = useState<MedicationFastingPolicy>('auto-nearest');
  const [editMedNote, setEditMedNote] = useState('');
  const [editMedCourseEnd, setEditMedCourseEnd] = useState('');
  const [editMedRemainingDoses, setEditMedRemainingDoses] = useState('');
  const [editMedRefillAlertDays, setEditMedRefillAlertDays] = useState<number>(3);
  const [newMedName, setNewMedName] = useState('');
  const [newMedHour12, setNewMedHour12] = useState<number>(8);
  const [newMedMinute, setNewMedMinute] = useState<string>('');
  const [newMedPeriod, setNewMedPeriod] = useState<'AM' | 'PM'>('AM');
  const [newMedTimes24, setNewMedTimes24] = useState<string[]>([]);
  const [newMedDaysOfWeek, setNewMedDaysOfWeek] = useState<number[]>([]);
  const [newMedFastingPolicy, setNewMedFastingPolicy] = useState<MedicationFastingPolicy>('auto-nearest');
  const [newMedNote, setNewMedNote] = useState('');
  const [newMedCourseEnd, setNewMedCourseEnd] = useState('');
  const [newMedRemainingDoses, setNewMedRemainingDoses] = useState('');
  const [newMedRefillAlertDays, setNewMedRefillAlertDays] = useState<number>(3);
  const [newMedSyncCalendar, setNewMedSyncCalendar] = useState(true);
  const [editingStockMedId, setEditingStockMedId] = useState<string | null>(null);
  const [editStockDosesInput, setEditStockDosesInput] = useState<string>('');
  const [editStockAlertDays, setEditStockAlertDays] = useState<number>(3);
  const [purchaseMedId, setPurchaseMedId] = useState<string | null>(null);
  const [purchaseAddDoses, setPurchaseAddDoses] = useState<string>('30');
  const [purchaseMode, setPurchaseMode] = useState<'add' | 'set'>('add');
  const [purchaseAlertDays, setPurchaseAlertDays] = useState<number>(3);

  const todayCairoIso = getDateIsoInTimeZone(activeTimeZone);

  // Last 7 local dates for Medication Adherence Tracker (follows activeTimeZone)
  const last7CairoDays = useMemo(() => {
    const weekdayShortAr: Record<string, string> = {
      Sun: 'ح',
      Mon: 'ن',
      Tue: 'ث',
      Wed: 'ر',
      Thu: 'خ',
      Fri: 'ج',
      Sat: 'س',
    };
    const weekdayNumMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() - (6 - i) * 86_400_000);
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: activeTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
      const mo = parts.find((p) => p.type === 'month')?.value ?? '01';
      const day = parts.find((p) => p.type === 'day')?.value ?? '01';
      const wdEn = new Intl.DateTimeFormat('en-US', {
        timeZone: activeTimeZone,
        weekday: 'short',
      }).format(d);
      return {
        dateIso: `${y}-${mo}-${day}`,
        shortAr: i === 6 ? 'اليوم' : weekdayShortAr[wdEn] ?? '•',
        weekdayNum: weekdayNumMap[wdEn] ?? 0,
        isToday: i === 6,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayCairoIso, activeTimeZone]);

  // Low-stock medications requiring proactive alert (default <= 3 days remaining)
  const lowStockMedications = useMemo(() => {
    return medications
      .filter((m) => typeof m.remainingDoses === 'number' && m.remainingDoses >= 0)
      .map((m) => {
        const dosesPerScheduledDay = Math.max(
          1,
          m.times24 && m.times24.length > 0 ? m.times24.length : 1
        );
        const daysPerWeek = m.daysOfWeek && m.daysOfWeek.length > 0 ? m.daysOfWeek.length : 7;
        const dailyRate = Math.max(0.14, (dosesPerScheduledDay * daysPerWeek) / 7);
        const alertDays = Math.max(1, Math.min(14, m.refillAlertDays ?? 3));
        const rem = m.remainingDoses ?? 0;
        const daysLeft = rem / dailyRate;
        const defaultPackSize = m.totalDoses && m.totalDoses > 0 ? m.totalDoses : 30;
        return {
          med: m,
          remainingDoses: rem,
          dailyRate,
          daysLeft,
          daysLeftRounded: Math.ceil(daysLeft),
          alertDays,
          defaultPackSize,
          isLow: daysLeft <= alertDays,
        };
      })
      .filter((item) => item.isLow)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [medications]);

  const openPurchaseRestockForm = (med: MedicationItem) => {
    if (purchaseMedId === med.id) {
      setPurchaseMedId(null);
      return;
    }
    const defaultPack = med.totalDoses && med.totalDoses > 0 ? med.totalDoses : 30;
    setPurchaseMedId(med.id);
    setPurchaseAddDoses(String(defaultPack));
    setPurchaseMode('add');
    setPurchaseAlertDays(med.refillAlertDays ?? 3);
  };

  // Medication adherence summary (Today + last 7 days)
  const medFajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const medMaghribMin = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;
  const medAdherenceSummary = useMemo(() => {
    const todayWeekday = last7CairoDays[last7CairoDays.length - 1]?.weekdayNum ?? 0;
    const dueTodayMeds = medications.filter((m) => {
      if (m.daysOfWeek && m.daysOfWeek.length > 0 && !m.daysOfWeek.includes(todayWeekday)) {
        return false;
      }
      const rawTimes = m.times24 && m.times24.length > 0 ? m.times24 : m.time24 ? [m.time24] : [];
      if (rawTimes.length > 0 && dailyRhythmPlan.isFastingToday) {
        const resolved = resolveMedicationDosesForDay(m, {
          isFastingToday: true,
          fajrMin: medFajrMin,
          maghribMin: medMaghribMin,
        });
        if (resolved.doses.length === 0 && resolved.skippedCount > 0) return false;
      }
      return true;
    });
    const takenTodayCount = dueTodayMeds.filter((m) => {
      const times = m.times24 && m.times24.length > 0 ? m.times24 : m.time24 ? [m.time24] : [];
      const takenDoses = m.takenDateKey === todayCairoIso ? m.takenDosesToday ?? [] : [];
      const isDateInHistory = (m.takenDates ?? []).includes(todayCairoIso);
      return (
        isDateInHistory ||
        (m.takenDateKey === todayCairoIso &&
          (times.length <= 1 || times.every((t) => takenDoses.includes(t))))
      );
    }).length;

    let totalSlots = 0;
    let takenSlots = 0;
    let missedPastSlots = 0;
    for (const med of medications) {
      const dateSet = new Set(med.takenDates ?? []);
      if (med.takenDateKey === todayCairoIso) dateSet.add(todayCairoIso);
      for (const d of last7CairoDays) {
        const scheduled =
          !med.daysOfWeek || med.daysOfWeek.length === 0 || med.daysOfWeek.includes(d.weekdayNum);
        if (!scheduled) continue;
        totalSlots += 1;
        if (dateSet.has(d.dateIso)) {
          takenSlots += 1;
        } else if (!d.isToday) {
          missedPastSlots += 1;
        }
      }
    }
    const adherencePct = totalSlots > 0 ? Math.round((takenSlots / totalSlots) * 100) : 0;
    return {
      dueTodayCount: dueTodayMeds.length,
      takenTodayCount,
      missedPastSlots,
      adherencePct,
    };
  }, [medications, last7CairoDays, todayCairoIso, dailyRhythmPlan.isFastingToday, medFajrMin, medMaghribMin]);

  const cardSurface =
    surfaceTheme === 'amoled'
      ? 'bg-[var(--bg-card)] border-[var(--border-subtle)] transition-colors duration-200 focus-within:border-[var(--border-active)]'
      : 'bg-[var(--bg-card)] border-[var(--border-subtle)] transition-colors duration-200 focus-within:border-[var(--border-active)]';

  const activeBlocks = useMemo(
    () => blocks.filter((b) => !b.deleted),
    [blocks]
  );
  const deletedBlocks = useMemo(
    () => blocks.filter((b) => b.deleted),
    [blocks]
  );

  // Live wall-clock ticker paused while tab/app is hidden; resyncs immediately on visible/focus.
  const [liveNowMs, setLiveNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const syncNow = () => setLiveNowMs(Date.now());
    let intervalId: number | null = null;

    const startTicker = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(syncNow, 15_000);
    };

    const stopTicker = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopTicker();
      } else {
        syncNow();
        startTicker();
      }
    };

    const onFocus = () => {
      syncNow();
      if (document.visibilityState !== 'hidden') {
        startTicker();
      }
    };

    if (document.visibilityState !== 'hidden') {
      startTicker();
    }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopTicker();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const liveClockParts = useMemo(() => {
    const nowDate = new Date(liveNowMs);
    const nowMin = getNowMinutesInTimeZone(activeTimeZone, nowDate);
    let secOfMin = nowDate.getSeconds();
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: activeTimeZone,
        second: '2-digit',
      }).formatToParts(nowDate);
      const sVal = Number(parts.find((p) => p.type === 'second')?.value);
      if (Number.isFinite(sVal)) secOfMin = sVal;
    } catch {
      // keep local seconds
    }
    return {
      nowMinutes: nowMin,
      nowSecOfDay: nowMin * 60 + secOfMin,
    };
  }, [liveNowMs, activeTimeZone]);

  const nowMinutes = liveClockParts.nowMinutes;

  const isBlockFinishedOrPassed = (b: ScheduleBlock): boolean => {
    if (b.completed) return true;
    if (b.isAllDay) return false;
    const effectiveDuration = Math.max(1, b.durationMin);
    return b.startMin + effectiveDuration <= nowMinutes;
  };

  const remainingTodayBlocks = useMemo(
    () => activeBlocks.filter((b) => !isBlockFinishedOrPassed(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeBlocks, nowMinutes]
  );

  const formatDurationLabel = (totalMin: number): string => {
    const safe = Math.max(0, Math.round(totalMin));
    if (safe === 0) return language === 'ar' ? 'بدون مدة' : '0m';
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    if (language !== 'ar') {
      if (h === 0) return `${m}m`;
      return m === 0 ? `${h}h` : `${h}h ${m}m`;
    }
    if (h === 0) return `${m} د`;
    return m === 0 ? `${h} س` : `${h} س ${m} د`;
  };

  const getEventCairoDateIso = (isoStr: string): string => {
    if (!isoStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr;
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr.slice(0, 10);
    return getDateIsoInTimeZone(activeTimeZone, d);
  };

  const formatCairoDayHeading = (dateIso: string): string => {
    const d = new Date(`${dateIso}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return dateIso;
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-US', {
      timeZone: activeTimeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    }).format(d);
  };

  const resolveCalendarEventText = (ev: GoogleCalendarEventItem): { title: string; detail: string } => {
    const rawSummary = (ev.summary || '').trim();
    const cleanedDesc = cleanCalendarText(ev.description);
    const descLines = cleanedDesc
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const strippedSummary = rawSummary
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/[\uFE0F\u200D\u20E3·\-–—|•]+/g, ' ')
      .trim();

    if (strippedSummary.length > 0) {
      const detail =
        descLines.length > 0 && descLines[0] !== rawSummary ? descLines.join(' · ') : '';
      return { title: rawSummary, detail };
    }
    if (descLines.length > 0) {
      return {
        title: `${rawSummary ? `${rawSummary} ` : ''}${descLines[0]}`.trim(),
        detail: descLines.slice(1).join(' · '),
      };
    }
    return { title: rawSummary || 'موعد', detail: '' };
  };

  const tomorrowCairoIso = useMemo(() => {
    const base = new Date(`${todayCairoIso}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + 1);
    return base.toISOString().slice(0, 10);
  }, [todayCairoIso]);

  const tomorrowEvents = useMemo(() => {
    return calendarEvents
      .filter((ev) => getEventCairoDateIso(ev.start) === tomorrowCairoIso)
      .sort((a, b) => a.start.localeCompare(b.start));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarEvents, tomorrowCairoIso]);

  const nonRoutineUpcomingEvents = useMemo(() => {
    const routineKeywords =
      /(نوم|استيقاظ|الصلوات|صلاة|صلاه|الفجر|الظهر|العصر|المغرب|العشاء|الوتر|وتر|الضحى|قيام|تراويح|الجمعة|سنن|أذكار|اذكار|قرآن|قران|ورد|شرب|ماء|ماية|مياه|ترطيب|فطار|إفطار|افطار|غداء|عشاء|سحور|وجبة|تنظيف|ترتيب|الأوضة|الاوضة|اوضة|أوضة|الغرفة|الغرفه|غرفة|غرفه|مذاكرة|مراجعة|جيم|تمرين|رياضة|مشي|روتين|قيلولة|استحمام|دش|مكمل|فيتامين|بذور اليقطين|دواء|علاج|قهوة|شاي)/i;

    const signatureDays = new Map<string, Set<string>>();
    const normalizeSig = (ev: GoogleCalendarEventItem): string => {
      const resolved = resolveCalendarEventText(ev).title.toLowerCase();
      const noDates = resolved
        .replace(/\d{1,2}:\d{2}\s*(ص|م|am|pm)?/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      return noDates || (ev.summary || '').trim().toLowerCase();
    };

    for (const ev of calendarEvents) {
      const dayIso = getEventCairoDateIso(ev.start);
      if (!dayIso) continue;
      const sig = normalizeSig(ev);
      if (!signatureDays.has(sig)) signatureDays.set(sig, new Set());
      signatureDays.get(sig)!.add(dayIso);
    }

    const nowMs = Date.now();
    return calendarEvents
      .filter((ev) => {
        const dayIso = getEventCairoDateIso(ev.start);
        if (!dayIso || dayIso < todayCairoIso) return false;
        if (!ev.isAllDay && ev.end) {
          const endMs = new Date(ev.end).getTime();
          if (!Number.isNaN(endMs) && endMs <= nowMs) return false;
        }
        // Authoritative Google Calendar recurring series check (daily/weekly routines)
        if (ev.isRecurring || ev.recurringEventId) return false;
        const sig = normalizeSig(ev);
        const uniqueDaysCount = signatureDays.get(sig)?.size ?? 1;
        // Filter out items appearing on 2+ days across the window or matching known routine habits/prayers/chores
        if (uniqueDaysCount >= 2) return false;
        if (routineKeywords.test(sig)) return false;
        return true;
      })
      .sort((a, b) => a.start.localeCompare(b.start));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarEvents, todayCairoIso]);

  const finishedTodayBlocks = useMemo(
    () => activeBlocks.filter((b) => isBlockFinishedOrPassed(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeBlocks, nowMinutes]
  );

  const filteredBlocks = useMemo(() => {
    if (timelineFilter === 'done') {
      return finishedTodayBlocks;
    }
    return remainingTodayBlocks;
  }, [finishedTodayBlocks, remainingTodayBlocks, timelineFilter]);

  const effectiveBlocksForTimeline = useMemo(
    () =>
      blocks.map((b) =>
        typeof autoPlacedBlockStarts[b.id] === 'number'
          ? { ...b, startMin: autoPlacedBlockStarts[b.id] }
          : b
      ),
    [blocks, autoPlacedBlockStarts]
  );

  const dayTimelineModel = useMemo(
    () =>
      buildDayTimelineModel({
        prayers,
        plan: dailyRhythmPlan,
        profile: lifeProfile,
        habits,
        blocks: effectiveBlocksForTimeline,
        googleTasks,
        calendarEvents,
        todayIso: todayCairoIso,
        weekday: last7CairoDays[last7CairoDays.length - 1]?.weekdayNum,
        timeZone: activeTimeZone,
      }),
    [
      prayers,
      dailyRhythmPlan,
      lifeProfile,
      habits,
      effectiveBlocksForTimeline,
      googleTasks,
      calendarEvents,
      todayCairoIso,
      last7CairoDays,
      activeTimeZone,
    ]
  );

  const handleConfirmAutoPlace = async (items: DayTimelineUnplacedItem[]) => {
    if (items.length === 0) return;
    setIsSyncingAutoPlace(true);
    try {
      const calendarUpdates: CalendarActionProposal[] = [];
      const taskUpdates: TaskActionProposal[] = [];
      const localBlockMoves: Record<string, number> = {};

      for (const item of items) {
        if (!item.suggestedSlot) continue;
        if (item.kind === 'habit' && item.habit && onUpdateHabit) {
          onUpdateHabit(item.habit.id, {
            title: item.habit.title,
            status: item.habit.status,
            anchor: item.suggestedSlot.suggestedAnchor ?? 'any-free-slot',
            durationMin: item.habit.durationMin,
            daysOfWeek: item.habit.daysOfWeek,
            skipOnFasting: item.habit.skipOnFasting,
          });
        } else if (item.kind === 'task' && item.googleTask) {
          const cleanedNotes = (item.googleTask.notes ?? '')
            .replace(/(?:⏰|@)\s*\d{1,2}:\d{2}/g, '')
            .trim();
          const nextNotes = `${cleanedNotes ? `${cleanedNotes}\n` : ''}⏰ ${item.suggestedSlot.time24}`;
          taskUpdates.push({
            operation: 'update',
            taskId: item.googleTask.id,
            taskListId: item.googleTask.taskListId,
            title: item.googleTask.title,
            notes: nextNotes,
            dueDateIso: todayCairoIso,
          });
        } else if (item.kind === 'event' && item.scheduleBlock) {
          if (item.scheduleBlock.googleEventId && calendarConnected) {
            calendarUpdates.push({
              operation: 'update',
              eventId: item.scheduleBlock.googleEventId,
              calendarId: item.scheduleBlock.googleCalendarId,
              title: item.title,
              dateIso: todayCairoIso,
              startTime24: item.suggestedSlot.time24,
              durationMinutes: item.durationMin,
            });
          } else {
            localBlockMoves[item.scheduleBlock.id] = item.suggestedSlot.startMin;
          }
        }
      }

      if (Object.keys(localBlockMoves).length > 0) {
        setAutoPlacedBlockStarts((prev) => ({ ...prev, ...localBlockMoves }));
      }
      if (calendarUpdates.length > 0) {
        await onExecuteCalendarActions(calendarUpdates);
      }
      if (taskUpdates.length > 0) {
        await onExecuteTaskActions(taskUpdates);
      }
    } finally {
      setIsSyncingAutoPlace(false);
    }
  };

  // Always pick the currently-active or next remaining task today (never loop back to passed 3 AM events!)
  const nextAlarmBlock = useMemo(() => {
    return remainingTodayBlocks[0] ?? null;
  }, [remainingTodayBlocks]);

  const nextObligatoryPrayerId = useMemo(() => {
    const obligatory = prayers.filter((p) => p.isObligatory);
    const upcoming = obligatory.find((p) => p.adhanMinutes >= nowMinutes);
    return upcoming?.id ?? obligatory[0]?.id ?? null;
  }, [prayers, nowMinutes]);

  const isNextBlockHappeningNow = Boolean(
    nextAlarmBlock &&
      !nextAlarmBlock.isAllDay &&
      nextAlarmBlock.startMin <= nowMinutes &&
      nextAlarmBlock.startMin + Math.max(1, nextAlarmBlock.durationMin) > nowMinutes
  );

  const nextAlarmDisplay = useMemo(
    () => resolveBlockDisplayInfo(nextAlarmBlock),
    [nextAlarmBlock]
  );

  // Signed-out users still get a live countdown to the next prayer (prayer times are computed offline).
  const guestNextPrayer = useMemo(() => {
    if (calendarConnected || !(prayersReady ?? false)) return null;
    const prayer = prayers.find((p) => p.id === nextObligatoryPrayerId);
    if (!prayer) return null;
    const isTomorrow = prayer.adhanMinutes < nowMinutes;
    return { prayer, targetSec: (prayer.adhanMinutes + (isTomorrow ? 1440 : 0)) * 60 };
  }, [calendarConnected, prayersReady, prayers, nextObligatoryPrayerId, nowMinutes]);

  const countdownMeta = useMemo(() => {
    const formatSecClock = (totalSec: number) => {
      const safe = Math.max(0, Math.floor(totalSec));
      const h = Math.floor(safe / 3600);
      const m = Math.floor((safe % 3600) / 60);
      const s = safe % 60;
      if (h > 0) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    if (!calendarConnected) {
      if (guestNextPrayer) {
        const rem = Math.max(0, guestNextPrayer.targetSec - liveClockParts.nowSecOfDay);
        return {
          clock: formatSecClock(rem),
          remainingSec: rem,
          caption:
            language === 'ar'
              ? `حتى أذان ${guestNextPrayer.prayer.nameAr}`
              : `Until ${guestNextPrayer.prayer.nameEn} adhan`,
        };
      }
      return {
        clock: '00:00',
        caption: language === 'ar' ? 'سجّل الدخول لعرض جدولك' : 'Sign in to sync schedule',
      };
    }
    if (!nextAlarmBlock) {
      return {
        clock: '✓',
        caption: language === 'ar' ? 'انتهى اليوم' : 'All done',
      };
    }

    if (isNextBlockHappeningNow) {
      const endSec = (nextAlarmBlock.startMin + Math.max(1, nextAlarmBlock.durationMin)) * 60;
      const remSec = Math.max(1, endSec - liveClockParts.nowSecOfDay);
      const remMin = Math.ceil(remSec / 60);
      const h = Math.floor(remMin / 60);
      const m = remMin % 60;
      return {
        clock: formatSecClock(remSec),
        remainingSec: remSec,
        caption:
          language === 'ar'
            ? h > 0
              ? `متبقي الآن (${h} س ${m} د)`
              : `متبقي الآن (${m} د)`
            : h > 0
              ? `Left now (${h}h ${m}m)`
              : `Left now (${m}m)`,
      };
    }
    const startSec = nextAlarmBlock.startMin * 60;
    const diffSec = Math.max(0, startSec - liveClockParts.nowSecOfDay);
    const diffMin = Math.ceil(diffSec / 60);
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return {
      clock: formatSecClock(diffSec),
      remainingSec: diffSec,
      caption:
        language === 'ar'
          ? h > 0
            ? `يبدأ بعد ${h} س و ${m} د`
            : `يبدأ بعد ${m} د`
          : h > 0
            ? `Starts in ${h}h ${m}m`
            : `Starts in ${m}m`,
    };
  }, [
    calendarConnected,
    guestNextPrayer,
    nextAlarmBlock,
    isNextBlockHappeningNow,
    liveClockParts.nowSecOfDay,
    language,
  ]);

  const heroProgressPct = useMemo(() => {
    const nowSec = liveClockParts.nowSecOfDay;
    if (!calendarConnected) {
      if (!guestNextPrayer) return 0;
      const obligatory = prayers.filter((p) => p.isObligatory);
      const nextIdx = obligatory.findIndex((p) => p.id === guestNextPrayer.prayer.id);
      const prevPrayer =
        nextIdx > 0 ? obligatory[nextIdx - 1] : obligatory[obligatory.length - 1];
      const startSec = prevPrayer
        ? (prevPrayer.adhanMinutes > guestNextPrayer.prayer.adhanMinutes
            ? prevPrayer.adhanMinutes - 1440
            : prevPrayer.adhanMinutes) * 60
        : 0;
      const endSec = guestNextPrayer.targetSec;
      const adjustedNow = nowSec < startSec ? nowSec + 1440 : nowSec;
      const span = Math.max(60, endSec - startSec);
      return Math.min(100, Math.max(4, Math.round(((adjustedNow - startSec) / span) * 100)));
    }
    if (!nextAlarmBlock) return 100;
    if (isNextBlockHappeningNow) {
      const startSec = nextAlarmBlock.startMin * 60;
      const span = Math.max(60, nextAlarmBlock.durationMin * 60);
      return Math.min(100, Math.max(2, Math.round(((nowSec - startSec) / span) * 100)));
    }
    const lastFinished = finishedTodayBlocks[finishedTodayBlocks.length - 1];
    const windowStartSec = lastFinished
      ? (lastFinished.startMin + Math.max(0, lastFinished.durationMin)) * 60
      : 0;
    const targetSec = nextAlarmBlock.startMin * 60;
    const span = Math.max(60, targetSec - windowStartSec);
    return Math.min(100, Math.max(4, Math.round(((nowSec - windowStartSec) / span) * 100)));
  }, [
    calendarConnected,
    guestNextPrayer,
    prayers,
    nextAlarmBlock,
    isNextBlockHappeningNow,
    finishedTodayBlocks,
    liveClockParts.nowSecOfDay,
  ]);

  const scheduledHydrationSlots = dailyRhythmPlan.hydrationSlots;
  const scheduledTargetCups = scheduledHydrationSlots.length;
  const displayedCupsLogged = scheduledHydrationSlots.filter((_, idx) =>
    Boolean(hydrationToday.slots[idx])
  ).length;
  const totalMl = displayedCupsLogged * dailyRhythmPlan.cupSizeMl;
  const targetMl = scheduledTargetCups * dailyRhythmPlan.cupSizeMl;
  const waterPct = Math.min(
    100,
    Math.round((displayedCupsLogged / Math.max(1, scheduledTargetCups)) * 100)
  );

  const nextWaterSlot = useMemo(() => {
    const upcoming = dailyRhythmPlan.hydrationSlots.find(
      (slot, idx) => !hydrationToday.slots[idx] && slot.timeMinutes >= nowMinutes
    );
    if (upcoming) return upcoming;
    return dailyRhythmPlan.hydrationSlots.find((_, idx) => !hydrationToday.slots[idx]) ?? null;
  }, [dailyRhythmPlan.hydrationSlots, hydrationToday.slots, nowMinutes]);

  const visibleTasks = useMemo(() => {
    const base =
      selectedTaskListId === 'all'
        ? googleTasks
        : googleTasks.filter((tk) => tk.taskListId === selectedTaskListId);
    return base
      .filter((tk) => tk.title !== 'sync_state' && tk.taskListTitle !== '[DayRhythm Sync Vault]')
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'needsAction' ? -1 : 1;
        return (a.due ?? '9999').localeCompare(b.due ?? '9999');
      });
  }, [googleTasks, selectedTaskListId]);

  const openTasksCount = useMemo(
    () =>
      googleTasks.filter(
        (tk) =>
          tk.status !== 'completed' &&
          tk.title !== 'sync_state' &&
          tk.taskListTitle !== '[DayRhythm Sync Vault]'
      ).length,
    [googleTasks]
  );

  const newEventTime24 = useMemo(() => {
    let h24 = newEvHour12 % 12;
    if (newEvPeriod === 'PM') h24 += 12;
    const clampedMin = Math.max(0, Math.min(59, Math.round(Number(newEvMinute) || 0)));
    return `${String(h24).padStart(2, '0')}:${String(clampedMin).padStart(2, '0')}`;
  }, [newEvHour12, newEvMinute, newEvPeriod]);

  const applyTime24To12hPicker = (
    time24: string,
    setHour12: React.Dispatch<React.SetStateAction<number>>,
    setMinute: React.Dispatch<React.SetStateAction<string>>,
    setPeriod: React.Dispatch<React.SetStateAction<'AM' | 'PM'>>
  ) => {
    const match = time24.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return;
    const h24 = Number(match[1]);
    const min = Number(match[2]);
    setPeriod(h24 >= 12 ? 'PM' : 'AM');
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    setHour12(h12);
    setMinute(min === 0 ? '' : String(min).padStart(2, '0'));
  };

  const newMedCurrentTime24 = useMemo(() => {
    let h24 = newMedHour12 % 12;
    if (newMedPeriod === 'PM') h24 += 12;
    const clampedMin = Math.max(0, Math.min(59, Math.round(Number(newMedMinute) || 0)));
    return `${String(h24).padStart(2, '0')}:${String(clampedMin).padStart(2, '0')}`;
  }, [newMedHour12, newMedMinute, newMedPeriod]);

  const newEventConflict = useMemo(() => {
    if (!newEventModalOpen) {
      return { hasConflict: false, warnings: [] as string[], suggestedTime24: null, suggestedTime12Ar: null };
    }
    return checkSmartScheduleConflict({
      time24: newEventTime24,
      durationMinutes: Math.max(0, Math.min(480, Math.round(newEvDuration ?? 0))),
      dateIso: newEvDate,
      prayers,
      plan: dailyRhythmPlan,
      profile: lifeProfile,
      occupiedBlocks: newEvDate === todayCairoIso ? activeBlocks : [],
    });
  }, [
    newEventModalOpen,
    newEventTime24,
    newEvDuration,
    newEvDate,
    prayers,
    dailyRhythmPlan,
    lifeProfile,
    todayCairoIso,
    activeBlocks,
  ]);

  const newMedConflict = useMemo(() => {
    if (!showAddMedForm) {
      return { hasConflict: false, warnings: [] as string[], suggestedTime24: null, suggestedTime12Ar: null };
    }
    const timesToCheck = newMedTimes24.length > 0 ? newMedTimes24 : [newMedCurrentTime24];
    const allWarnings: string[] = [];
    let firstSuggested24: string | null = null;
    let firstSuggested12: string | null = null;

    for (const t24 of timesToCheck) {
      const res = checkSmartScheduleConflict({
        time24: t24,
        durationMinutes: 15,
        daysOfWeek: newMedDaysOfWeek,
        isOralMedication: true,
        prayers,
        plan: dailyRhythmPlan,
        profile: lifeProfile,
        occupiedBlocks: activeBlocks,
      });
      if (res.hasConflict) {
        for (const w of res.warnings) {
          const prefixed = timesToCheck.length > 1 ? `(${formatTime24To12h(t24, language)}) ${w}` : w;
          if (!allWarnings.includes(prefixed)) allWarnings.push(prefixed);
        }
        if (!firstSuggested24 && res.suggestedTime24) {
          firstSuggested24 = res.suggestedTime24;
          firstSuggested12 = res.suggestedTime12Ar;
        }
      }
    }

    return {
      hasConflict: allWarnings.length > 0,
      warnings: allWarnings,
      suggestedTime24: firstSuggested24,
      suggestedTime12Ar: firstSuggested12,
    };
  }, [
    showAddMedForm,
    newMedTimes24,
    newMedCurrentTime24,
    newMedDaysOfWeek,
    prayers,
    dailyRhythmPlan,
    lifeProfile,
    activeBlocks,
    language,
  ]);

  const handleConfirmCreateGoogleEvent = async () => {
    if (!newEvTitle.trim()) return;
    setSyncLoading(true);
    try {
      await onExecuteCalendarActions([
        {
          operation: 'create',
          calendarId: 'primary',
          title: newEvTitle.trim(),
          dateIso: newEvDate,
          startTime24: newEventTime24,
          durationMinutes: newEvDuration,
          description: 'تم الإنشاء عبر لوحة إيقاع اليوم | DayRhythm',
        },
      ]);
      setNewEventModalOpen(false);
      setNewEvConfirmStep(false);
      setNewEvTitle('');
      setNewEvDuration(0);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleConfirmDeleteGoogleEvent = async () => {
    if (!confirmDeleteGoogleEv) return;
    setSyncLoading(true);
    try {
      await onExecuteCalendarActions([
        {
          operation: 'delete',
          eventId: confirmDeleteGoogleEv.id,
          calendarId: confirmDeleteGoogleEv.calendarId ?? 'primary',
          title: confirmDeleteGoogleEv.summary,
        },
      ]);
      setConfirmDeleteGoogleEv(null);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleConfirmTaskMutation = async () => {
    if (!pendingTaskConfirmation) return;
    setSyncLoading(true);
    try {
      await onExecuteTaskActions([pendingTaskConfirmation]);
      if (pendingTaskConfirmation.operation === 'create') {
        setNewTaskTitle('');
        setNewTaskDueIso('');
        setNewTaskTime24('');
      }
      setPendingTaskConfirmation(null);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleConfirmAddGmailEvent = async () => {
    if (!pendingGmailEventConfirm) return;
    setSyncLoading(true);
    try {
      await onExecuteCalendarActions([pendingGmailEventConfirm.suggestedAction]);
      setAddedGmailIds((prev) => ({ ...prev, [pendingGmailEventConfirm.id]: true }));
      setPendingGmailEventConfirm(null);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleConfirmScheduleCreative = async () => {
    if (!pendingCreativeCalendarConfirm) return;
    setSyncLoading(true);
    try {
      await onScheduleCreativeInCalendar(pendingCreativeCalendarConfirm);
      setPendingCreativeCalendarConfirm(null);
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1380px] px-3.5 sm:px-6 py-4 sm:py-6 pb-24 md:pb-8 space-y-4 overflow-x-hidden text-sm md:text-[15px]">
      {/* 1. QUIET UNBOXED CONTEXT BAR — Date · Location · Weather · Inline Battery · Quick Modes */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pb-1">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {language === 'ar' ? todayCalendarMeta.weekdayAr : todayCalendarMeta.weekdayEn}
            </h1>
            <span className="text-xs sm:text-sm text-zinc-400 font-medium">
              {language === 'ar' ? todayCalendarMeta.gregorianAr : todayCalendarMeta.gregorianEn}
            </span>
            {todayCalendarMeta.hijriFullAr && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <span className="text-xs sm:text-sm text-zinc-500">
                  {todayCalendarMeta.hijriFullAr}
                </span>
              </>
            )}
            {Boolean(lifeProfile.whiteDaysEnabled ?? lifeProfile.fastingWhiteDays) &&
              todayCalendarMeta.isFullMoonWhiteDay && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <span
                  className="text-xs font-semibold text-zinc-200 inline-flex items-center gap-1"
                  title="الأيام البيض"
                >
                  <span className="leading-none">🌕</span>
                  <span>{todayCalendarMeta.hijriDay} {todayCalendarMeta.hijriMonthAr}</span>
                </span>
              </>
            )}
            {(todayCalendarMeta.isRamadan || dailyRhythmPlan.isRamadan) && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <span
                  className="text-xs font-semibold text-[#7FFFD4] inline-flex items-center gap-1"
                  title="شهر رمضان"
                >
                  <span className="leading-none">🌙</span>
                  <span>رمضان</span>
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-400">
            <span
              title="الموقع الحالي"
              className="text-zinc-300 font-medium inline-flex items-center gap-1"
            >
              <MapPin className="w-3.5 h-3.5 text-[#7FFFD4]" />
              <span>
                {travelState.active
                  ? language === 'ar'
                    ? travelState.location.nameAr
                    : travelState.location.nameEn
                  : lifeProfile.currentCityName}
              </span>
            </span>

            {weatherInfo && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <span
                  className="font-mono-tabular text-zinc-300"
                  title={`العظمى ${weatherInfo.maxTempC}°C`}
                >
                  {weatherInfo.icon} {weatherInfo.currentTempC}°C{' '}
                  <span className="text-zinc-500 font-sans">{weatherInfo.conditionAr}</span>
                </span>
              </>
            )}

            {phoneBattery && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <span
                  className={`inline-flex items-center gap-1 font-mono-tabular ${
                    phoneBattery.charging && phoneBattery.levelPct >= phoneBattery.chargeLimitPct
                      ? 'text-[#4ADE80] font-semibold'
                      : phoneBattery.charging
                        ? 'text-[#7FFFD4]'
                        : 'text-zinc-400'
                  }`}
                  title={phoneBattery.deviceLabel || 'الهاتف'}
                >
                  {phoneBattery.charging ? (
                    <BatteryCharging className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{phoneBattery.levelPct}%</span>
                  {phoneBattery.charging &&
                    typeof phoneBattery.chargeTimeRemainingMin === 'number' &&
                    phoneBattery.chargeTimeRemainingMin > 0 && (
                      <span className="text-[11px] text-zinc-400">
                        ·{' '}
                        {phoneBattery.chargeTimeRemainingMin >= 60
                          ? `${Math.floor(phoneBattery.chargeTimeRemainingMin / 60)}س ${phoneBattery.chargeTimeRemainingMin % 60}د`
                          : `${phoneBattery.chargeTimeRemainingMin}د`}
                      </span>
                    )}
                </span>
              </>
            )}

            {silentNotifications.length > 0 && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setShowSilentInbox((v) => !v)}
                  className="text-zinc-300 hover:text-[#7FFFD4] font-medium cursor-pointer transition-colors"
                >
                  🔕 {silentNotifications.length} صامت
                </button>
              </>
            )}
          </div>
        </div>

        {/* Unified Quick Modes Segmented Strip + Compact Utilities */}
        <div className="flex flex-wrap items-center gap-2 max-w-full w-full sm:w-auto">
          <div className="flex items-center justify-between sm:justify-start gap-1.5 flex-nowrap sm:flex-wrap w-full sm:w-auto">
            <div
              role="group"
              aria-label={language === 'ar' ? 'أوضاع اليوم' : 'Daily modes'}
              className="inline-flex flex-nowrap items-center gap-1 p-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-w-full"
            >
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                aria-pressed={lowEnergyActive}
                aria-label={lowEnergyActive ? 'إلغاء وضع يوم هادئ' : 'يوم هادئ'}
                onClick={onToggleLowEnergyToday}
                className={`relative min-h-[44px] sm:min-h-[36px] min-w-[42px] sm:min-w-0 justify-center px-2.5 sm:px-3 py-1.5 rounded-xl text-xs md:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap select-none ${
                  lowEnergyActive
                    ? 'text-[#7FFFD4] font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
                title="يوم هادئ — تخفيف اليوم عند انخفاض الطاقة"
              >
                <AnimatePresence>
                  {lowEnergyActive && (
                    <motion.span
                      layoutId="mode-pill-calm"
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-[#7FFFD4]/15 border border-[#7FFFD4]/35"
                    />
                  )}
                </AnimatePresence>
                <Leaf className="relative z-10 w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span className="relative z-10 hidden sm:inline">{lowEnergyActive ? '✓ يوم هادئ' : 'يوم هادئ'}</span>
              </motion.button>

              <div className="relative">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  aria-pressed={quietMode !== 'normal'}
                  aria-label={quietMode !== 'normal' ? 'إنهاء الاجتماع' : 'وضع الاجتماع'}
                  onClick={() => {
                    // Timed quiet mode is the single source of truth here (it's the one that actually
                    // auto-expires on its own); if it's already running — from this button, from
                    // Gemini, or from another device — one tap ends it early, no picker needed.
                    if (quietMode !== 'normal') {
                      onSetQuietMode('normal', 0);
                      setMeetingPickerOpen(false);
                      return;
                    }
                    setMeetingPickerOpen((v) => !v);
                  }}
                  className={`relative min-h-[44px] sm:min-h-[36px] min-w-[42px] sm:min-w-0 justify-center px-2.5 sm:px-3 py-1.5 rounded-xl text-xs md:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap select-none ${
                    quietMode !== 'normal'
                      ? 'text-[#7FFFD4] font-semibold'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                  title="وضع الاجتماع وكتم الصوت مؤقتاً أو حتى الإلغاء"
                >
                  <AnimatePresence>
                    {quietMode !== 'normal' && (
                      <motion.span
                        layoutId="mode-pill-meeting"
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.94 }}
                        transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                        className="absolute inset-0 rounded-xl bg-[#7FFFD4]/15 border border-[#7FFFD4]/35"
                      />
                    )}
                  </AnimatePresence>
                  <MicOff className="relative z-10 w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span className="relative z-10 hidden sm:inline">
                    {quietMode !== 'normal' ? 'إنهاء الاجتماع' : 'وضع الاجتماع'}
                  </span>
                </motion.button>

                <AnimatePresence>
                  {meetingPickerOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.16 }}
                      className="absolute z-30 top-full mt-2 right-0 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 space-y-2.5 shadow-xl"
                    >
                      <div className="text-[11px] text-zinc-400">اختر المدة والطريقة، وهتخلص لوحدها تلقائياً</div>
                      {(
                        [
                          { mode: 'mute_audio' as const, label: '🔇 ميوت تام + إشعار' },
                          { mode: 'vibrate_only' as const, label: '📳 اهتزاز فقط + إشعار' },
                        ]
                      ).map((row) => (
                        <div key={row.mode} className="space-y-1">
                          <div className="text-[11px] font-medium text-zinc-300">{row.label}</div>
                          <div className="grid grid-cols-5 gap-1">
                            {[15, 30, 60, 120, 0].map((mins) => (
                              <button
                                key={mins}
                                type="button"
                                onClick={() => {
                                  onSetQuietMode(row.mode, mins);
                                  setMeetingPickerOpen(false);
                                }}
                                className="min-h-[34px] rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-[var(--border-subtle)] text-[11px] font-mono-tabular text-zinc-200 cursor-pointer transition-colors"
                              >
                                {mins === 0 ? 'مفتوح' : mins >= 60 ? `${mins / 60} س` : `${mins} د`}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setMeetingPickerOpen(false)}
                        className="w-full min-h-[34px] text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer pt-1"
                      >
                        إلغاء
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                aria-pressed={travelState.active}
                aria-label={travelState.active ? 'في السفر' : 'وضع السفر'}
                onClick={onOpenTravel}
                className={`relative min-h-[44px] sm:min-h-[36px] min-w-[42px] sm:min-w-0 justify-center px-2.5 sm:px-3 py-1.5 rounded-xl text-xs md:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap select-none ${
                  travelState.active
                    ? 'text-[#7FFFD4] font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
                title="وضع السفر وتأجيل التنبيهات مؤقتاً"
              >
                <AnimatePresence>
                  {travelState.active && (
                    <motion.span
                      layoutId="mode-pill-travel"
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-[#7FFFD4]/15 border border-[#7FFFD4]/35"
                    />
                  )}
                </AnimatePresence>
                <Plane className="relative z-10 w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span className="relative z-10 hidden sm:inline">{travelState.active ? 'في السفر' : 'السفر'}</span>
                {travelState.active &&
                  ((travelState.deferredCategories?.length ?? 0) +
                    (travelState.deferredMedIds?.length ?? 0)) > 0 && (
                    <span className="relative z-10 hidden sm:inline px-1.5 py-0.5 rounded-full bg-[#7FFFD4]/20 text-[10px] font-mono-tabular">
                      {(travelState.deferredCategories?.length ?? 0) +
                        (travelState.deferredMedIds?.length ?? 0)}
                    </span>
                  )}
              </motion.button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenLifeProfile}
                aria-label="الإعدادات والثوابت"
                className="min-h-[44px] sm:min-h-[38px] min-w-[44px] sm:min-w-0 justify-center px-2.5 sm:px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs md:text-sm font-medium text-zinc-300 hover:border-white/20 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                title="الإعدادات والثوابت"
              >
                <SlidersHorizontal className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-zinc-400 shrink-0" />
                <span className="hidden sm:inline">الإعدادات</span>
              </button>

              {calendarConnected && (
                <button
                  type="button"
                  onClick={() => onRefreshWorkspace()}
                  aria-label="تحديث التقويم والمهام"
                  className="min-h-[44px] sm:min-h-[38px] min-w-[44px] sm:min-w-0 justify-center px-2.5 sm:px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs md:text-sm text-zinc-300 hover:border-white/20 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                  title={calendarUserEmail ? `تحديث (${calendarUserEmail})` : 'تحديث'}
                >
                  <RefreshCw
                    className={`w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#7FFFD4] shrink-0 ${loadingCalendarEvents || loadingTasks ? 'animate-spin' : ''}`}
                  />
                  <span className="hidden sm:inline">تحديث</span>
                </button>
              )}
            </div>
          </div>

          {!calendarConnected && (
            <button
              type="button"
              onClick={() => {
                onGoogleSignIn().catch(() => {});
              }}
              disabled={isLoggingIn}
              className="min-h-[44px] sm:min-h-[38px] flex items-center gap-2 rounded-xl border border-[#747775] bg-white px-3 py-1.5 text-xs font-semibold text-[#1F1F1F] hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>{isLoggingIn ? 'جارٍ الاتصال...' : 'تسجيل الدخول بحساب Google'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Live Phone Charging Status Strip (Visible whenever OnePlus/Android phone is plugged in) */}
      {/* Stale reading (no update for 3 min: unplugged while offline, app killed) ≠ still charging. */}
      {phoneBattery?.charging &&
        phoneBattery.levelPct < phoneBattery.chargeLimitPct &&
        Date.now() - phoneBattery.updatedAtMs < 3 * 60_000 && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-active)] bg-[var(--bg-card)] px-4 py-2.5 text-xs">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#7FFFD4]/30 bg-[#7FFFD4]/10 text-[#7FFFD4] shrink-0">
              <BatteryCharging className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-zinc-100">
                  {phoneBattery.deviceLabel || 'الهاتف'} على الشاحن
                </span>
                <span className="font-mono-tabular font-bold text-[#7FFFD4]">
                  {phoneBattery.levelPct}%
                </span>
                {typeof phoneBattery.chargeTimeRemainingMin === 'number' &&
                  phoneBattery.chargeTimeRemainingMin > 0 && (
                    <span className="font-mono-tabular text-zinc-300">
                      · متبقي{' '}
                      {phoneBattery.chargeTimeRemainingMin >= 60
                        ? `~${Math.floor(phoneBattery.chargeTimeRemainingMin / 60)} س ${phoneBattery.chargeTimeRemainingMin % 60} د`
                        : `~${phoneBattery.chargeTimeRemainingMin} دقيقة`}
                    </span>
                  )}
                {phoneBattery.levelPct >= phoneBattery.chargeLimitPct && (
                  <span className="text-[#4ADE80] font-semibold">
                    · وصل حد الشحن ({phoneBattery.chargeLimitPct}%) ✓
                  </span>
                )}
              </div>
              <div className="mt-1.5 h-1.5 w-48 max-w-full rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    phoneBattery.levelPct >= phoneBattery.chargeLimitPct
                      ? 'bg-[#4ADE80]'
                      : 'bg-[#7FFFD4]'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, phoneBattery.levelPct))}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-[11px] text-zinc-400">
            <span className="font-mono-tabular">الحد: {phoneChargeLimitPct}%</span>
          </div>
        </div>
      )}

      {/* 2. PRIORITY ACTIONAL ALERTS ONLY (Rendered strictly when no floating persistent overlay is active to avoid duplicate cards) */}
      {activeAudioAlert && !hasPersistentAlert && (
        <div
          className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
            activeAudioAlert.isContinuous
              ? 'border-amber-400/50 bg-amber-400/12'
              : 'border-[#7FFFD4]/40 bg-[#7FFFD4]/10'
          }`}
        >
          <div className="flex items-center gap-2.5 text-sm">
            <span className="text-2xl leading-none">{activeAudioAlert.title || TASK_SOUND_META[activeAudioAlert.category].icon}</span>
            <span className="text-xs font-medium text-zinc-200">
              {activeAudioAlert.category === 'water'
                ? 'تأكيد شرب الكوب'
                : activeAudioAlert.isContinuous
                  ? 'رنين نشط'
                  : 'تنبيه'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {activeAudioAlert.category === 'water' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onLogWaterCup();
                    onAcknowledgeAudioAlert();
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] active:scale-95 transition-transform cursor-pointer"
                >
                  💧 شربت فعلاً ✓
                </button>
                <button
                  type="button"
                  onClick={onAcknowledgeAudioAlert}
                  className="px-3 py-1.5 rounded-lg border border-white/15 text-zinc-300 text-xs hover:text-white active:scale-95 transition-transform cursor-pointer"
                >
                  لاحقاً
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onAcknowledgeAudioAlert}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-transform cursor-pointer ${
                  activeAudioAlert.isContinuous
                    ? 'bg-amber-400 text-black hover:bg-amber-300'
                    : 'bg-[#7FFFD4] text-black hover:bg-[#66eec2]'
                }`}
              >
                {activeAudioAlert.isContinuous ? 'إيقاف ✓' : '✓ تم'}
              </button>
            )}
          </div>
        </div>
      )}

      {(smartChargeAudioActive ||
        (phoneBattery &&
          phoneBattery.charging &&
          phoneBattery.levelPct >= phoneBattery.chargeLimitPct &&
          !phoneChargeAlertDismissed)) && (
        <div className="rounded-xl border border-[#4ADE80]/45 bg-[#4ADE80]/10 px-4 py-2.5 text-xs text-emerald-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BatteryCharging className="w-4 h-4 text-[#4ADE80] shrink-0" />
            <span className="font-medium text-white">
              اكتمال الشحن ({phoneBattery?.levelPct ?? phoneChargeLimitPct}%) · افصل الشاحن عن{' '}
              {phoneBattery?.deviceLabel || 'الهاتف'}
            </span>
          </div>
          <button
            type="button"
            onClick={onDismissPhoneChargeAlert}
            className="px-3 py-1.5 rounded-lg bg-[#4ADE80] text-black font-bold text-xs hover:bg-emerald-300 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <BellOff className="w-3.5 h-3.5" />
            <span>إيقاف التنبيه</span>
          </button>
        </div>
      )}

      {batteryGuard.bedtimeGuardTriggered && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200 flex items-center justify-between gap-3">
          <span>
            🔋 بطارية الهاتف عند <strong className="font-mono-tabular">{batteryGuard.levelPct}%</strong> — اشحن الجهاز قبل النوم.
          </span>
        </div>
      )}

      {lastDeletedWorkspaceItem && (
        <div className="rounded-xl border border-[#7FFFD4]/35 bg-[#7FFFD4]/[0.07] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-zinc-100 min-w-0">
            <RotateCcw className="w-3.5 h-3.5 text-[#7FFFD4] shrink-0" />
            <span className="truncate">
              تم حذف «{lastDeletedWorkspaceItem.title}»
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void onUndoWorkspaceDelete()}
              className="px-3 py-1 rounded-lg bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2] cursor-pointer"
            >
              استعادة
            </button>
            <button
              type="button"
              onClick={onDismissWorkspaceUndo}
              className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              aria-label="إغلاق"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {lastDeletedBlock && shakeUndoSecondsLeft > 0 && (
        <div className="rounded-xl border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-3.5 h-3.5 text-[#7FFFD4]" />
            <span className="text-white font-semibold">
              تم حذف {lastDeletedBlock.emojiPair} ({shakeUndoSecondsLeft} ث)
            </span>
          </div>
          <button
            type="button"
            onClick={onTriggerShakeUndo}
            className="px-3 py-1 rounded-lg bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2] cursor-pointer"
          >
            تراجع
          </button>
        </div>
      )}

      {activeSanctuary.type !== 'none' && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-2.5 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <VolumeX className="w-4 h-4 text-amber-300 shrink-0" />
            <span>
              <strong>{activeSanctuary.labelAr}</strong>
              {activeSanctuary.endsAtMin !== undefined
                ? ` · حتى ${formatMinutes12h(activeSanctuary.endsAtMin, language)}`
                : ''}
            </span>
          </div>
          {activeSanctuary.type === 'meeting' && (
            <button
              type="button"
              onClick={() => onSetQuietMode('normal', 0)}
              className="px-3 py-1 rounded-lg bg-amber-400 text-black font-bold text-[11px] cursor-pointer"
            >
              إنهاء
            </button>
          )}
          {(activeSanctuary.type === 'prayer' || activeSanctuary.type === 'sleep') && (
            <div dir="rtl" className="flex flex-wrap items-center gap-2">
              {!confirmCancelSanctuary ? (
                <button
                  type="button"
                  onClick={() => setConfirmCancelSanctuary(true)}
                  className="px-3 py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-100 font-semibold text-[11px] cursor-pointer transition-colors"
                >
                  إنهاء الصمت مبكراً
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/40 bg-black/40 px-2.5 py-1.5">
                  <span className="text-[11px] text-amber-100">
                    هل أنت متأكد أنك تريد إلغاء الصمت المؤقت الآن؟
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmCancelSanctuary(false);
                      onCancelActiveSanctuaryEarly?.();
                    }}
                    className="px-2.5 py-1 rounded-md bg-amber-400 text-black font-bold text-[11px] cursor-pointer"
                  >
                    نعم، إلغاء الصمت
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancelSanctuary(false)}
                    className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 text-slate-200 text-[11px] cursor-pointer"
                  >
                    تراجع
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showSilentInbox && silentNotifications.length > 0 && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white">
              الإشعارات الصامتة ({silentNotifications.length})
            </span>
            <button
              type="button"
              onClick={() => {
                onClearSilentNotifications();
                setShowSilentInbox(false);
              }}
              className="text-[11px] text-[#7FFFD4] hover:underline cursor-pointer"
            >
              مسح الكل
            </button>
          </div>
          <div className="divide-y divide-white/[0.07] max-h-48 overflow-y-auto">
            {silentNotifications.map((sn) => {
              const meta = TASK_SOUND_META[sn.soundCategory];
              const cleanTitle = (sn.title || '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D\s]/gu, '').length > 0
                ? sn.title
                : meta?.labelAr ?? 'تنبيه مجدول';
              const shortDesc = sn.description || sn.reasonAr;
              return (
                <div key={sn.id} className="py-2 flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span className="text-base leading-none mt-0.5 shrink-0">{meta?.icon ?? '🔔'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-zinc-100 truncate">{cleanTitle}</div>
                      {shortDesc && (
                        <div className="text-[11px] md:text-xs text-zinc-400 line-clamp-1 mt-0.5">
                          {shortDesc}
                          {sn.description && sn.reasonAr ? ` · ${sn.reasonAr}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-zinc-500 shrink-0 whitespace-nowrap mt-0.5">
                    {sn.time12h}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Single Authoritative Low-Stock Medications Alert (No duplicate warning inside Meds card) */}
      {lowStockMedications.length > 0 && (
        <div className="rounded-xl border border-amber-400/35 bg-amber-400/[0.06] px-4 py-3 text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-200 font-semibold">
              <AlertCircle className="w-4 h-4 text-amber-300 shrink-0" />
              <span>مخزون قارب على النفاد ({lowStockMedications.length})</span>
            </div>
          </div>
          <div className="divide-y divide-amber-400/15">
            {lowStockMedications.map(({ med, remainingDoses, daysLeftRounded, dailyRate, defaultPackSize }) => {
              const isOpen = purchaseMedId === med.id;
              const enteredQty = Math.max(0, Math.min(500, Math.round(Number(purchaseAddDoses) || 0)));
              const previewTotal =
                purchaseMode === 'add'
                  ? Math.min(500, remainingDoses + enteredQty)
                  : enteredQty;
              const previewDays = Math.ceil(previewTotal / Math.max(0.14, dailyRate));
              return (
                <div key={`top-low-${med.id}`} className="py-2 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-white truncate">{med.name}</span>
                      <span
                        className={`font-mono-tabular text-[11px] shrink-0 ${
                          remainingDoses === 0 ? 'text-rose-300 font-bold' : 'text-amber-200/90'
                        }`}
                      >
                        ·{' '}
                        {remainingDoses === 0
                          ? 'نفد المخزون'
                          : `متبقٍ ${remainingDoses} (~${daysLeftRounded} ${daysLeftRounded === 1 ? 'يوم' : 'أيام'})`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onRefillMedication(med.id, defaultPackSize, med.refillAlertDays ?? 3);
                          if (purchaseMedId === med.id) setPurchaseMedId(null);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#4ADE80] text-[11px] font-semibold hover:bg-[#4ADE80]/20 cursor-pointer"
                        title={`تعبئة عبوة جديدة (${defaultPackSize} جرعة)`}
                      >
                        عبوة جديدة ({defaultPackSize})
                      </button>
                      <button
                        type="button"
                        onClick={() => openPurchaseRestockForm(med)}
                        className="px-2.5 py-1 rounded-lg bg-[#7FFFD4] text-black text-[11px] font-bold hover:bg-[#66eec2] flex items-center gap-1 cursor-pointer"
                      >
                        <ShoppingBag className="w-3 h-3" />
                        <span>شراء</span>
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="rounded-lg border border-[#7FFFD4]/30 bg-black/75 p-2.5 space-y-2 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-zinc-400">الكمية:</span>
                        {[14, 20, 30, 60].map((qty) => (
                          <button
                            key={qty}
                            type="button"
                            onClick={() => setPurchaseAddDoses(String(qty))}
                            className={`px-2 py-0.5 rounded-md border font-mono-tabular text-[11px] cursor-pointer ${
                              purchaseAddDoses === String(qty)
                                ? 'border-[#7FFFD4] bg-[#7FFFD4]/20 text-[#7FFFD4] font-bold'
                                : 'border-white/10 text-zinc-400 hover:text-white'
                            }`}
                          >
                            +{qty}
                          </button>
                        ))}
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={purchaseAddDoses}
                          onChange={(e) => setPurchaseAddDoses(e.target.value)}
                          className="w-18 rounded-lg border border-white/15 bg-black px-2 py-0.5 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                          aria-label="عدد الجرعات المشتراة"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPurchaseMode('add')}
                            className={`px-2 py-0.5 rounded-md border text-[11px] cursor-pointer ${
                              purchaseMode === 'add'
                                ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                                : 'border-white/10 text-zinc-400'
                            }`}
                          >
                            إضافة ({remainingDoses} + {enteredQty})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPurchaseMode('set')}
                            className={`px-2 py-0.5 rounded-md border text-[11px] cursor-pointer ${
                              purchaseMode === 'set'
                                ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                                : 'border-white/10 text-zinc-400'
                            }`}
                          >
                            تعيين إجمالي
                          </button>
                        </div>
                        <span className="font-mono-tabular text-[11px] text-[#4ADE80]">
                          الرصيد: {previewTotal} (~{previewDays} ي)
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/10">
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                          <span>تنبيه قبل:</span>
                          {[2, 3, 5].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setPurchaseAlertDays(d)}
                              className={`px-1.5 py-0.5 rounded border cursor-pointer ${
                                purchaseAlertDays === d
                                  ? 'border-[#7FFFD4] bg-[#7FFFD4]/20 text-[#7FFFD4] font-bold'
                                  : 'border-white/10 text-zinc-400'
                              }`}
                            >
                              {d} ي
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPurchaseMedId(null)}
                            className="px-2.5 py-1 rounded-lg text-zinc-400 hover:text-white cursor-pointer"
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            disabled={previewTotal <= 0}
                            onClick={() => {
                              onRefillMedication(med.id, previewTotal, purchaseAlertDays);
                              setPurchaseMedId(null);
                            }}
                            className="px-3 py-1 rounded-lg bg-[#4ADE80] text-black font-bold hover:bg-emerald-300 disabled:opacity-40 cursor-pointer"
                          >
                            حفظ ✓
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {lowEnergyActive && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-100/90">
          <div className="flex items-center gap-2">
            <Leaf className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>وضع اليوم الهادئ مفعّل — الأولوية للصلاة والنوم فقط.</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                onOpenAssistantWithPrompt(
                  'أنا في وضع اليوم الهادئ (طاقتي منخفضة النهاردة) — راجع جدولي ومهامي واقترح عليّ إيه يتأجل لبكرة بهدوء مع حماية الصلاة والنوم.'
                )
              }
              className="text-[#7FFFD4] hover:underline font-medium cursor-pointer"
            >
              تخفيف مع Gemini
            </button>
            <button
              type="button"
              onClick={onToggleLowEnergyToday}
              className="text-zinc-400 hover:text-white cursor-pointer"
            >
              إنهاء
            </button>
          </div>
        </div>
      )}

      {tomorrowAlert && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 text-cyan-300 shrink-0" />
            <div className="min-w-0 truncate">
              <span className="font-semibold text-white">{tomorrowAlert.headlineAr}</span>
              <span className="text-zinc-400"> · {tomorrowAlert.detailAr}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenAssistantWithPrompt(
                `غداً ${tomorrowAlert.weekdayAr} (${tomorrowAlert.tomorrowIso}) عندي: ${tomorrowAlert.detailAr} — ساعدني أرتّب جدول غداً مسبقاً بدون ما يضغط على الصلاة أو النوم.`
              )
            }
            className="text-[#7FFFD4] font-semibold hover:underline cursor-pointer shrink-0 whitespace-nowrap"
          >
            رتّب غداً ←
          </button>
        </div>
      )}

      {/* 3. FOCAL HERO COMMAND CENTER — Swiss-Watch Hero + Ultra-Thin Progress + 5 Prayers */}
      <ErrorBoundary sectionTitle="المتابعة اللحظية" compact>
      <section className={`rounded-2xl border p-5 sm:p-6 space-y-5 ${cardSurface}`}>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6 items-center">
          {/* Primary Focus: Current / Next Event + Oversized Tabular Countdown */}
          <div className="md:col-span-6 flex flex-col justify-between gap-4 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isNextBlockHappeningNow ? 'bg-[#7FFFD4] animate-pulse' : 'bg-[#7FFFD4]/80'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-[#7FFFD4] font-semibold">
                    {isNextBlockHappeningNow
                      ? 'الآن'
                      : language === 'ar'
                        ? 'القادم'
                        : 'Up Next'}
                  </span>
                  {nextAlarmBlock?.isAnchor && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span className="text-zinc-400">{t(language, 'adhanLeadTag')}</span>
                    </>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-2xl sm:text-3xl shrink-0 leading-none mt-0.5">
                    {nextAlarmBlock?.emojiPair ?? guestNextPrayer?.prayer.emojiPair ?? '✅'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg sm:text-xl font-bold text-white leading-snug break-words">
                      {nextAlarmBlock
                        ? nextAlarmDisplay.title
                        : calendarConnected
                          ? 'أنجزت مهام اليوم ✓'
                          : guestNextPrayer
                            ? language === 'ar'
                              ? `أذان ${guestNextPrayer.prayer.nameAr}`
                              : `${guestNextPrayer.prayer.nameEn} adhan`
                            : 'اربط حساب Google للبدء'}
                    </h2>
                    {nextAlarmBlock && nextAlarmDisplay.detail && (
                      <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed line-clamp-1">
                        {nextAlarmDisplay.detail}
                      </p>
                    )}
                    <div className="font-mono-tabular text-xs text-zinc-400 mt-1">
                      {nextAlarmBlock
                        ? nextAlarmBlock.isAllDay
                          ? 'طوال اليوم'
                          : nextAlarmBlock.durationMin === 0
                            ? `${formatMinutes12h(nextAlarmBlock.startMin, language)} · ${formatDurationLabel(0)}`
                            : `${formatMinutes12h(nextAlarmBlock.startMin, language)} – ${formatMinutes12h(nextAlarmBlock.startMin + nextAlarmBlock.durationMin, language)} · ${formatDurationLabel(nextAlarmBlock.durationMin)}`
                        : guestNextPrayer
                          ? `${formatMinutes12h(guestNextPrayer.prayer.adhanMinutes, language)} · ${
                              language === 'ar' ? 'التنبيه' : 'alarm'
                            } ${formatMinutes12h(guestNextPrayer.prayer.alarmMinutes, language)} · ${
                              language === 'ar' ? 'سجّل الدخول لعرض جدولك' : 'sign in for your schedule'
                            }`
                          : 'سجّل الدخول لعرض جدولك الفعلي'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-right sm:text-left shrink-0 flex flex-row sm:flex-col items-baseline sm:items-end justify-between sm:justify-center gap-2 pt-2 sm:pt-0 border-t border-[var(--border-subtle)] sm:border-t-0">
                <div
                  data-countdown=""
                  className="font-digits text-4xl sm:text-5xl font-semibold tracking-tight leading-none whitespace-nowrap text-[#7FFFD4]"
                >
                  <LiveSecClock
                    initialSec={countdownMeta.remainingSec}
                    fallback={countdownMeta.clock}
                    resetKey={liveNowMs}
                  />
                </div>
                <div className="text-[11px] font-medium text-zinc-400 whitespace-nowrap">
                  {countdownMeta.caption}
                </div>
              </div>
            </div>

            {/* Ultra-Thin Swiss-Watch Progress Bar */}
            <div
              className="h-[2px] w-full rounded-full bg-white/[0.06] overflow-hidden"
              role="progressbar"
              aria-valuenow={heroProgressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <motion.div
                className="h-full rounded-full bg-[#7FFFD4]"
                initial={false}
                animate={{ width: `${heroProgressPct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>

            {/* Single Primary Accent CTA + Quiet Secondary Controls */}
            <div
              className={`grid ${
                nextAlarmBlock ? 'grid-cols-3' : 'grid-cols-2'
              } sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2`}
            >
              {nextAlarmBlock && (
                <button
                  type="button"
                  onClick={() => setConfirmHeroCompleteId(nextAlarmBlock.id)}
                  className="min-h-[44px] sm:min-h-[38px] px-2 sm:px-4 py-1.5 rounded-xl bg-[#7FFFD4] text-black text-[11.5px] sm:text-xs md:text-sm font-bold hover:bg-[#66eec2] transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap flex items-center justify-center"
                >
                  ✓ تم الإنجاز
                </button>
              )}

              <button
                type="button"
                onClick={onOpenPomodoro}
                className="min-h-[44px] sm:min-h-[38px] px-2 sm:px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-white/[0.02] text-zinc-300 hover:border-white/20 hover:text-white text-[11.5px] sm:text-xs md:text-sm font-medium flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap font-mono-tabular transition-colors"
              >
                <Timer className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span>
                  {pomodoro.isRunning
                    ? `${Math.floor(pomodoro.remainingSeconds / 60)}:${String(pomodoro.remainingSeconds % 60).padStart(2, '0')}`
                    : 'بومودورو'}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenAssistant}
                className={`min-h-[44px] sm:min-h-[38px] px-2 sm:px-3.5 py-1.5 rounded-xl text-[11.5px] sm:text-xs md:text-sm flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                  nextAlarmBlock
                    ? 'border border-[var(--border-subtle)] bg-white/[0.02] text-zinc-300 hover:border-white/20 hover:text-white font-medium'
                    : 'bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2]'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="sm:hidden">Gemini</span>
                <span className="hidden sm:inline">شات Gemini</span>
              </button>
            </div>
          </div>

          {/* 5 Prayers Strip — Clean Horizontal Grid with Subtle Active Highlight */}
          <div className="md:col-span-6 md:border-r md:border-[var(--border-subtle)] md:pr-6 min-w-0">
            <div className="grid grid-cols-5 gap-1 sm:gap-2 text-center">
              {prayers
                .filter((p) => p.isObligatory)
                .map((p) => {
                  const showLivePrayer = prayersReady ?? calendarConnected;
                  const isNextPrayer = showLivePrayer && p.id === nextObligatoryPrayerId;
                  const isPassed = showLivePrayer && p.adhanMinutes < nowMinutes && !isNextPrayer;
                  return (
                    <div
                      key={p.id}
                      className={`rounded-xl border py-2.5 px-0.5 sm:px-2 min-w-0 transition-colors ${
                        isNextPrayer
                          ? 'border-[#7FFFD4]/40 bg-[#7FFFD4]/[0.07]'
                          : 'border-[var(--border-subtle)] bg-white/[0.02]'
                      } ${isPassed ? 'opacity-40' : ''}`}
                    >
                      <div className="text-xs sm:text-sm leading-none">{p.emojiPair.split(' ')[1]}</div>
                      <div
                        className={`text-[11px] md:text-xs mt-1.5 truncate ${
                          isNextPrayer ? 'font-bold text-white' : 'font-medium text-zinc-400'
                        }`}
                      >
                        {language === 'ar' ? p.nameAr : p.nameEn}
                      </div>
                      <div
                        className={`font-mono-tabular text-[11px] sm:text-sm font-semibold mt-0.5 whitespace-nowrap tracking-tight sm:tracking-normal ${
                          showLivePrayer
                            ? isNextPrayer
                              ? 'text-[#7FFFD4]'
                              : 'text-zinc-200'
                            : 'text-zinc-500'
                        }`}
                      >
                        {showLivePrayer ? formatMinutes12h(p.alarmMinutes, language) : '00:00'}
                      </div>
                      <div className="font-mono-tabular text-[10px] sm:text-xs text-zinc-500 mt-0.5 whitespace-nowrap">
                        {showLivePrayer ? formatMinutes12h(p.adhanMinutes, language) : '00:00'}
                      </div>
                    </div>
                  );
                })}
            </div>

            {!(prayersReady ?? calendarConnected) && (
              <div className="mt-2 text-[11px] text-zinc-500 text-center">
                {locationResolutionState === 'resolving_gps'
                  ? 'جارٍ تحديد الموقع لحساب المواقيت...'
                  : 'بانتظار تحديد الموقع'}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
              <button
                type="button"
                onClick={onToggleAdhanOverrideSilent}
                className={`min-h-[36px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                  adhanOverrideSilent ? 'text-[#7FFFD4]' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>
                  نداء الأذان · {adhanOverrideSilent ? 'مفعّل' : 'صامت'}
                </span>
              </button>
              <button
                type="button"
                onClick={onTestAdhanChime}
                className="min-h-[36px] text-zinc-400 hover:text-[#7FFFD4] transition-colors cursor-pointer"
              >
                تجربة الصوت
              </button>
            </div>
          </div>
        </div>
      </section>
      </ErrorBoundary>

      {onSnoozeSunlight && (
        <SunlightCard
          sessions={sunlightSessions}
          enabled={sunlightEnabled}
          activeTimeZone={activeTimeZone}
          cardSurface={cardSurface}
          onSnooze={onSnoozeSunlight}
          onSessionEnd={onSunlightSessionEnd}
        />
      )}

      {/* Main Bento Grid (`md:`+): Balanced 7/5 Split with generous whitespace (gap-4) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
        {/* Primary Column (7 cols): Schedule & Tasks -> Creative -> Gmail */}
        <div className="md:col-span-7 flex flex-col gap-4 min-w-0">
          {/* 1. Today's Schedule + Google Tasks (Segmented Switch) */}
          <ErrorBoundary sectionTitle="جدول اليوم والمهام" compact>
          <section className={`rounded-2xl border p-4 sm:p-5 flex-1 ${cardSurface}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[var(--border-subtle)]">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                  {scheduleCardMode === 'schedule' ? (
                    <Calendar className="w-4 h-4 text-[#7FFFD4]" />
                  ) : (
                    <CheckSquare className="w-4 h-4 text-[#7FFFD4]" />
                  )}
                  <span>{scheduleCardMode === 'schedule' ? 'جدول اليوم' : 'المهام'}</span>
                  {scheduleCardMode === 'schedule' && calendarConnected && calendarEvents.length > 0 && (
                    <span className="font-mono-tabular text-xs font-medium text-zinc-500">
                      · {calendarEvents.length}
                    </span>
                  )}
                  {scheduleCardMode === 'tasks' && (
                    <span className="font-mono-tabular text-xs font-medium text-zinc-500">
                      · {visibleTasks.length}
                    </span>
                  )}
                </h2>

                {/* Clean Segmented Switch: الجدول | المهام */}
                <div
                  role="tablist"
                  aria-label="عرض الجدول أو المهام"
                  className="inline-flex items-center p-0.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={scheduleCardMode === 'schedule'}
                    onClick={() => setScheduleCardMode('schedule')}
                    className={`relative min-h-[34px] sm:min-h-[30px] px-3 py-1 rounded-lg text-xs md:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap select-none ${
                      scheduleCardMode === 'schedule'
                        ? 'text-[#7FFFD4] font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {scheduleCardMode === 'schedule' && (
                      <motion.span
                        layoutId="schedule-tasks-switch-pill"
                        transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                        className="absolute inset-0 rounded-lg bg-[#7FFFD4]/12 border border-[#7FFFD4]/25"
                      />
                    )}
                    <span className="relative z-10">الجدول</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={scheduleCardMode === 'tasks'}
                    onClick={() => setScheduleCardMode('tasks')}
                    className={`relative min-h-[34px] sm:min-h-[30px] px-3 py-1 rounded-lg text-xs md:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap select-none ${
                      scheduleCardMode === 'tasks'
                        ? 'text-[#7FFFD4] font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {scheduleCardMode === 'tasks' && (
                      <motion.span
                        layoutId="schedule-tasks-switch-pill"
                        transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                        className="absolute inset-0 rounded-lg bg-[#7FFFD4]/12 border border-[#7FFFD4]/25"
                      />
                    )}
                    <span className="relative z-10">المهام</span>
                    {openTasksCount > 0 && (
                      <span
                        className={`relative z-10 px-1.5 py-0.2 rounded-full text-[10px] font-mono-tabular font-bold ${
                          scheduleCardMode === 'tasks'
                            ? 'bg-[#7FFFD4]/25 text-[#7FFFD4]'
                            : 'bg-white/[0.08] text-zinc-300'
                        }`}
                      >
                        {openTasksCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {scheduleCardMode === 'schedule' ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onOpenCatchUp}
                    className="min-h-[44px] sm:min-h-[34px] px-3 sm:px-2.5 py-1 rounded-xl border border-[var(--border-subtle)] text-zinc-300 hover:border-[#7FFFD4]/40 hover:text-[#7FFFD4] text-xs md:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5 text-[#7FFFD4]" />
                    <span>زحزحة</span>
                  </button>
                  {hasUndoSnapshot && (
                    <button
                      type="button"
                      onClick={onUndoReflow}
                      className="min-h-[44px] sm:min-h-[34px] px-3 sm:px-2.5 py-1 rounded-xl border border-amber-400/35 text-amber-300 text-xs font-medium hover:bg-amber-400/10 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>استعادة</span>
                    </button>
                  )}
                  {deletedBlocks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTrash((v) => !v)}
                      className="min-h-[44px] sm:min-h-[34px] px-3 sm:px-2.5 py-1 rounded-xl border border-[var(--border-subtle)] text-zinc-400 hover:text-white text-xs flex items-center gap-1 cursor-pointer"
                      title="المحذوفات"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="font-mono-tabular">{deletedBlocks.length}</span>
                    </button>
                  )}
                  {calendarConnected && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewEvConfirmStep(false);
                        setNewEvMinute('');
                        setNewEventModalOpen(true);
                      }}
                      className="min-h-[44px] sm:min-h-[34px] px-3.5 sm:px-3 py-1 rounded-xl bg-[#7FFFD4] text-black text-xs md:text-sm font-bold hover:bg-[#66eec2] flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>حدث</span>
                    </button>
                  )}
                </div>
              ) : (
                calendarConnected &&
                googleTaskLists.length > 1 && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedTaskListId('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-colors ${
                        selectedTaskListId === 'all'
                          ? 'bg-white/12 text-white font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      الكل
                    </button>
                    {googleTaskLists
                      .filter((list) => list.title !== '[DayRhythm Sync Vault]')
                      .map((list) => (
                        <button
                          key={list.id}
                          type="button"
                          onClick={() => setSelectedTaskListId(list.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-colors ${
                            selectedTaskListId === list.id
                              ? 'bg-white/12 text-white font-semibold'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {list.title}
                        </button>
                      ))}
                  </div>
                )
              )}
            </div>

            {scheduleCardMode === 'schedule' ? (
              <>
            {/* Clean Segmented Filter */}
            <div className="mt-3 flex items-center p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-x-auto max-w-full w-fit">
              {(
                [
                  { id: 'today', label: 'اليوم', count: dayTimelineModel.placedBlocks.length },
                  { id: 'tomorrow', label: 'غداً', count: tomorrowEvents.length },
                  { id: 'special', label: 'المميزة', count: nonRoutineUpcomingEvents.length },
                  { id: 'done', label: 'المنتهي', count: finishedTodayBlocks.length },
                ] as const
              ).map((tab) => {
                const active = timelineFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTimelineFilter(tab.id)}
                    className={`relative min-h-[40px] sm:min-h-[32px] px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1.5 select-none ${
                      active ? 'text-[#7FFFD4] font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="schedule-filter-pill"
                        transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                        className="absolute inset-0 rounded-lg bg-[#7FFFD4]/10 border border-[#7FFFD4]/20"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                    <span className="relative z-10 font-mono-tabular text-[11px] opacity-75">
                      {tab.count}
                    </span>
                    {tab.id === 'today' && dayTimelineModel.unplacedBlocks.length > 0 && (
                      <span
                        aria-label={`${dayTimelineModel.unplacedBlocks.length} عناصر تحتاج توظيف`}
                        className="relative z-10 px-1.5 py-0.2 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-mono-tabular font-bold"
                      >
                        {dayTimelineModel.unplacedBlocks.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Clean Trash Drawer */}
            {showTrash && deletedBlocks.length > 0 && (
              <div className="mt-3 rounded-xl border border-white/[0.08] bg-black/50 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-zinc-200">محذوفات اليوم</span>
                  <button
                    type="button"
                    onClick={onRestoreAllDeleted}
                    className="text-xs text-[#7FFFD4] hover:underline cursor-pointer"
                  >
                    استعادة الكل
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {deletedBlocks.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onRestoreBlock(b.id)}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-zinc-200 hover:border-[#7FFFD4]/50 cursor-pointer"
                    >
                      <span>{b.emojiPair}</span>
                      <span className="font-mono-tabular text-zinc-400">
                        {formatMinutes12h(b.startMin, language)}
                      </span>
                      <RotateCcw className="w-3 h-3 text-[#7FFFD4]" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Disconnected Empty Prompt */}
            {!calendarConnected && !useOfflineDemo && (
              <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-zinc-300">
                  سجّل الدخول بحساب Google لعرض جدولك ومهامك الفعلية.
                </div>
                <button
                  type="button"
                  onClick={onToggleOfflineDemo}
                  className="px-3 py-1.5 rounded-lg border border-white/15 text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                >
                  عرض نموذج مؤقت
                </button>
              </div>
            )}

            {/* Tomorrow Prep View */}
            {timelineFilter === 'tomorrow' ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.06]">
                  <div className="text-xs font-semibold text-zinc-200">
                    {formatCairoDayHeading(tomorrowCairoIso)}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenAssistantWithPrompt(
                        `راجع مواعيد الغد (${tomorrowCairoIso}) من تقويمي وساعدني في التجهيز المسبق وترتيب الأولويات بهدوء.`
                      )
                    }
                    className="text-xs text-[#7FFFD4] font-semibold hover:underline cursor-pointer whitespace-nowrap"
                  >
                    جهّز الغد مع Gemini ←
                  </button>
                </div>

                {!calendarConnected ? (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    سجّل الدخول بحساب Google لعرض مواعيد الغد.
                  </div>
                ) : tomorrowEvents.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    لا توجد مواعيد مسجلة للغد.
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {tomorrowEvents.map((ev) => {
                      const { title, detail } = resolveCalendarEventText(ev);
                      return (
                        <div
                          key={`tmr-${ev.calendarId ?? 'primary'}-${ev.id}`}
                          className="py-3 flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: ev.calendarColor || '#7FFFD4' }}
                              />
                              <span className="font-semibold text-white break-words">{title}</span>
                              {ev.calendarTitle && ev.calendarTitle !== calendarUserEmail && (
                                <span className="text-[11px] text-zinc-500">· {ev.calendarTitle}</span>
                              )}
                            </div>
                            {detail && (
                              <div className="text-[11px] text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                                {detail}
                              </div>
                            )}
                            <div className="font-mono-tabular text-[11px] text-[#7FFFD4] mt-1 whitespace-nowrap">
                              {ev.isAllDay
                                ? 'طوال اليوم'
                                : `${formatIsoTo12h(ev.start, language, { includeDate: false, timeZone: activeTimeZone })}${
                                    ev.end
                                      ? ` – ${formatIsoTo12h(ev.end, language, { includeDate: false, timeZone: activeTimeZone })}`
                                      : ''
                                  }`}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {ev.htmlLink && (
                              <a
                                href={ev.htmlLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-[#4ADE80] hover:bg-white/10"
                                title="فتح في Google Calendar"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteGoogleEv(ev)}
                              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : timelineFilter === 'special' ? (
              /* Non-Routine / Special Upcoming Events (14 days) */
              <div className="mt-4">
                {!calendarConnected ? (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    سجّل الدخول بحساب Google لعرض المواعيد المميزة.
                  </div>
                ) : nonRoutineUpcomingEvents.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    لا توجد مواعيد استثنائية خلال الأسبوعين القادمين.
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {nonRoutineUpcomingEvents.map((ev) => {
                      const { title, detail } = resolveCalendarEventText(ev);
                      const evDateIso = getEventCairoDateIso(ev.start);
                      const dayLabel =
                        evDateIso === todayCairoIso
                          ? 'اليوم'
                          : evDateIso === tomorrowCairoIso
                            ? 'غداً'
                            : formatCairoDayHeading(evDateIso);
                      return (
                        <div
                          key={`sp-${ev.calendarId ?? 'primary'}-${ev.id}`}
                          className="py-3 flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: ev.calendarColor || '#7FFFD4' }}
                              />
                              <span className="font-semibold text-white break-words">{title}</span>
                              <span className="text-[11px] font-medium text-amber-300">
                                · {dayLabel}
                              </span>
                              {ev.calendarTitle && ev.calendarTitle !== calendarUserEmail && (
                                <span className="text-[11px] text-zinc-500">· {ev.calendarTitle}</span>
                              )}
                            </div>
                            {detail && (
                              <div className="text-[11px] text-zinc-400 mt-1 leading-relaxed line-clamp-2">
                                {detail}
                              </div>
                            )}
                            <div className="font-mono-tabular text-[11px] text-[#7FFFD4] mt-1 whitespace-nowrap">
                              {ev.isAllDay
                                ? `${dayLabel} · طوال اليوم`
                                : `${formatIsoTo12h(ev.start, language, { timeZone: activeTimeZone })}${
                                    ev.end
                                      ? ` – ${formatIsoTo12h(ev.end, language, { includeDate: false, timeZone: activeTimeZone })}`
                                      : ''
                                  }`}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {ev.htmlLink && (
                              <a
                                href={ev.htmlLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-[#4ADE80] hover:bg-white/10"
                                title="فتح في Google Calendar"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteGoogleEv(ev)}
                              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : timelineFilter === 'today' ? (
              /* Structured + Things 3 Vertical 24h Day Timeline */
              <DayTimelineView
                model={dayTimelineModel}
                language={language}
                nowMinutes={nowMinutes}
                isSyncingAutoPlace={isSyncingAutoPlace}
                onToggleBlockComplete={onToggleComplete}
                onToggleHabitToday={onToggleHabitToday}
                onCompleteTask={(item: DayTimelinePlacedItem) => {
                  if (!item.googleTaskId) return;
                  setPendingTaskConfirmation({
                    operation: item.completed ? 'reopen' : 'complete',
                    taskId: item.googleTaskId,
                    taskListId: item.googleTaskListId,
                    title: item.title,
                  });
                }}
                onTriggerAlert={(title, emoji) => {
                  const cat = classifyTaskSound(title, emoji, false);
                  onTriggerTaskAlert(emoji, cat);
                }}
                onDeleteEventBlock={(item: DayTimelinePlacedItem) => {
                  if (item.googleEventId) {
                    const blk = blocks.find((b) => b.id === item.scheduleBlockId);
                    setConfirmDeleteGoogleEv({
                      id: item.googleEventId,
                      calendarId: item.googleCalendarId,
                      calendarTitle: blk?.calendarTitle,
                      summary: item.title,
                      start: blk?.startIso ?? '',
                      end: blk?.endIso ?? '',
                      description: blk?.description ?? '',
                    });
                  } else if (item.scheduleBlockId) {
                    onDeleteBlock(item.scheduleBlockId);
                  }
                }}
                onConfirmAutoPlace={handleConfirmAutoPlace}
              />
            ) : (
              /* Chronological Done Today List */
              <div className="divide-y divide-white/[0.06] mt-3">
                {filteredBlocks.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    لا توجد عناصر منتهية بعد.
                  </div>
                ) : (
                  filteredBlocks.map((block) => {
                    const isPostponed = block.reflowStatus === 'postponed_travel';
                    const isSkipped = block.reflowStatus === 'skipped';
                    const isGoogleEvent = block.source === 'google_calendar';
                    const isHappeningNow =
                      !block.completed &&
                      !block.isAllDay &&
                      block.startMin <= nowMinutes &&
                      block.startMin + Math.max(1, block.durationMin) > nowMinutes;
                    const display = resolveBlockDisplayInfo(block);
                    const showSecondaryCalendarLabel =
                      block.calendarTitle && block.calendarTitle !== calendarUserEmail;
                    // Everything under "المنتهي" is over — show it as done, not as an open circle.
                    const shownDone = block.completed || timelineFilter === 'done';

                    return (
                      <div
                        key={block.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 px-2 rounded-xl transition-colors hover:bg-white/[0.02] ${
                          isHappeningNow ? 'bg-[#7FFFD4]/[0.05] my-1 px-3 ring-1 ring-[#7FFFD4]/25' : ''
                        } ${
                          shownDone || isSkipped || isPostponed
                            ? 'opacity-50'
                            : lowEnergyActive && !block.isAnchor
                              ? 'opacity-75'
                              : ''
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => onToggleComplete(block.id)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-500 hover:text-[#7FFFD4] cursor-pointer shrink-0 -mt-0.5"
                            title={block.completed ? 'إعادة الفتح' : 'إنجاز'}
                          >
                            {shownDone ? (
                              <CheckCircle2 className="w-5 h-5 text-[#4ADE80]" />
                            ) : (
                              <Circle className="w-5 h-5" />
                            )}
                          </button>

                          <span className="text-xl shrink-0 leading-none mt-1">
                            {block.emojiPair}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-sm font-semibold leading-snug break-words ${
                                  block.isFridayRitual
                                    ? 'text-[#4ADE80]'
                                    : block.isAnchor
                                      ? 'text-[#7FFFD4]'
                                      : 'text-zinc-100'
                                }`}
                              >
                                {display.title}
                              </span>
                              {isHappeningNow && (
                                <span className="text-[11px] font-bold text-[#4ADE80]">
                                  · الآن
                                </span>
                              )}
                              {showSecondaryCalendarLabel && (
                                <span className="text-[11px] text-zinc-500">
                                  · {block.calendarTitle}
                                </span>
                              )}
                              {block.reflowStatus && (
                                <span className="text-[11px] text-amber-300">
                                  ·{' '}
                                  {block.reflowStatus === 'compressed'
                                    ? 'مضغوط'
                                    : block.reflowStatus === 'shifted_evening'
                                      ? 'للمساء'
                                      : block.reflowStatus === 'started_now'
                                        ? 'يبدأ الآن'
                                        : block.reflowStatus === 'postponed_travel'
                                          ? 'مؤجل للسفر'
                                          : 'تم تخطيه'}
                                </span>
                              )}
                            </div>

                            {display.detail && (
                              <div className="text-xs text-zinc-400 mt-0.5 leading-relaxed line-clamp-1 break-words">
                                {display.detail}
                              </div>
                            )}

                            <div className="font-mono-tabular text-xs text-zinc-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="whitespace-nowrap text-zinc-300">
                                {block.isAllDay
                                  ? 'طوال اليوم'
                                  : block.durationMin === 0
                                    ? formatMinutes12h(block.startMin, language)
                                    : `${formatMinutes12h(block.startMin, language)} – ${formatMinutes12h(block.startMin + block.durationMin, language)}`}
                              </span>
                              {!block.isAllDay && (
                                <span className="whitespace-nowrap">
                                  · {formatDurationLabel(block.durationMin)}
                                </span>
                              )}
                              {block.source === 'creative' && (
                                <span className="text-cyan-300/80">· وقت إبداعي</span>
                              )}
                              {block.id.startsWith('sunlight_') &&
                                block.description?.includes('غيوم كثيفة') && (
                                  <span className="text-zinc-400">· ☁️ غيوم كثيفة</span>
                                )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-1 shrink-0 pr-0">
                          {block.source === 'creative' && block.creativeActivityId && (
                            <button
                              type="button"
                              onClick={() => {
                                const placement = creativePlacements.find(
                                  (p) => p.activity.id === block.creativeActivityId
                                );
                                if (placement) setPendingCreativeCalendarConfirm(placement);
                              }}
                              className="min-h-[44px] sm:min-h-[32px] px-3 sm:px-2.5 py-1 rounded-lg border border-cyan-400/35 bg-cyan-400/10 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-400/20 cursor-pointer whitespace-nowrap"
                            >
                              تثبيت
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const cat = classifyTaskSound(
                                block.categoryAr,
                                block.emojiPair,
                                block.isAnchor
                              );
                              onTriggerTaskAlert(block.emojiPair, cat);
                            }}
                            className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-[#7FFFD4] hover:bg-white/[0.04] cursor-pointer"
                            title="تجربة التنبيه"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                          {block.googleHtmlLink && (
                            <a
                              href={block.googleHtmlLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-[#4ADE80] hover:bg-white/[0.04]"
                              title="فتح في Google Calendar"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          {isGoogleEvent && block.googleEventId ? (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDeleteGoogleEv({
                                  id: block.googleEventId!,
                                  calendarId: block.googleCalendarId,
                                  calendarTitle: block.calendarTitle,
                                  summary: display.title || block.categoryAr,
                                  start: block.startIso ?? '',
                                  end: block.endIso ?? '',
                                  description: block.description ?? '',
                                })
                              }
                              className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            !block.isAnchor &&
                            block.source !== 'creative' && (
                              <button
                                type="button"
                                onClick={() => onDeleteBlock(block.id)}
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                                title="حذف"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
              </>
            ) : (
              <div className="mt-3.5 space-y-3">
                {!calendarConnected ? (
              <div className="py-4 text-center text-xs text-zinc-500">
                سجّل الدخول بحساب Google لإدارة مهامك.
              </div>
            ) : (
              <>
                {(() => {
                  const getDateOffsetIso = (daysAhead: number): string => {
                    const d = new Date(Date.now() + daysAhead * 86_400_000);
                    return getDateIsoInTimeZone(activeTimeZone, d);
                  };
                  const formatMinTo24 = (totalMin: number): string => {
                    const wrapped = ((Math.round(totalMin) % 1440) + 1440) % 1440;
                    const hh = Math.floor(wrapped / 60);
                    const mm = wrapped % 60;
                    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                  };
                  const upcomingPrayer = prayers.find(
                    (p) => p.id !== 'sunrise' && p.adhanMinutes > nowMinutes + 5
                  );
                  const afterNextPrayerTime24 = upcomingPrayer
                    ? formatMinTo24(upcomingPrayer.adhanMinutes + 25)
                    : '20:00';
                  const afterNextPrayerLabel = upcomingPrayer
                    ? `بعد ${upcomingPrayer.nameAr}`
                    : '8 م';

                  const submitQuickTask = async (e: React.FormEvent) => {
                    e.preventDefault();
                    const cleanTitle = newTaskTitle.trim();
                    if (!cleanTitle || creatingTaskNow) return;
                    const resolvedDueIso = newTaskDueIso || (newTaskTime24 ? todayCairoIso : '');
                    const timeNote = newTaskTime24 ? `⏰ ${newTaskTime24}` : undefined;
                    setCreatingTaskNow(true);
                    try {
                      await onExecuteTaskActions([
                        {
                          operation: 'create',
                          taskListId:
                            selectedTaskListId !== 'all'
                              ? selectedTaskListId
                              : googleTaskLists[0]?.id ?? '@default',
                          title: cleanTitle,
                          notes: timeNote,
                          dueDateIso: resolvedDueIso || undefined,
                        },
                      ]);
                      setNewTaskTitle('');
                      setNewTaskDueIso('');
                      setNewTaskTime24('');
                      setShowTaskScheduleRow(false);
                    } finally {
                      setCreatingTaskNow(false);
                    }
                  };

                  return (
                    <form onSubmit={(e) => void submitQuickTask(e)} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          placeholder="أضف مهمة جديدة... (اضغط Enter فوراً)"
                          className="flex-1 min-w-0 min-h-[42px] rounded-xl border border-white/[0.1] bg-black/55 px-3.5 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowTaskScheduleRow((v) => !v)}
                          className={`min-h-[42px] px-2.5 rounded-xl border text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors ${
                            showTaskScheduleRow || newTaskDueIso || newTaskTime24
                              ? 'border-[#7FFFD4]/45 bg-[#7FFFD4]/12 text-[#7FFFD4]'
                              : 'border-white/[0.09] bg-black/40 text-zinc-400 hover:text-white'
                          }`}
                          title="تحديد موعد سريع (اختياري)"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span className="font-mono-tabular text-[11px] hidden sm:inline">
                            {newTaskTime24
                              ? formatTime24To12h(newTaskTime24, language)
                              : newTaskDueIso
                                ? newTaskDueIso === todayCairoIso
                                  ? 'اليوم'
                                  : newTaskDueIso === getDateOffsetIso(1)
                                    ? 'غداً'
                                    : newTaskDueIso.slice(5)
                                : 'موعد'}
                          </span>
                        </button>
                        <button
                          type="submit"
                          disabled={!newTaskTitle.trim() || creatingTaskNow}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] disabled:opacity-40 flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{creatingTaskNow ? '...' : 'إضافة'}</span>
                        </button>
                      </div>

                      {(showTaskScheduleRow || newTaskDueIso || newTaskTime24) && (
                        <div className="rounded-xl border border-white/[0.08] bg-black/35 p-2.5 space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {[
                              {
                                label: 'اليوم',
                                active: newTaskDueIso === todayCairoIso && !newTaskTime24,
                                onClick: () => {
                                  setNewTaskDueIso(todayCairoIso);
                                },
                              },
                              {
                                label: 'غداً',
                                active: newTaskDueIso === getDateOffsetIso(1),
                                onClick: () => {
                                  setNewTaskDueIso(getDateOffsetIso(1));
                                },
                              },
                              {
                                label: '+30 د',
                                active: false,
                                onClick: () => {
                                  setNewTaskDueIso(todayCairoIso);
                                  setNewTaskTime24(formatMinTo24(nowMinutes + 30));
                                },
                              },
                              {
                                label: '+1 س',
                                active: false,
                                onClick: () => {
                                  setNewTaskDueIso(todayCairoIso);
                                  setNewTaskTime24(formatMinTo24(nowMinutes + 60));
                                },
                              },
                              {
                                label: afterNextPrayerLabel,
                                active: newTaskTime24 === afterNextPrayerTime24,
                                onClick: () => {
                                  setNewTaskDueIso(todayCairoIso);
                                  setNewTaskTime24(afterNextPrayerTime24);
                                },
                              },
                              {
                                label: '8 م',
                                active: newTaskTime24 === '20:00',
                                onClick: () => {
                                  setNewTaskDueIso(todayCairoIso);
                                  setNewTaskTime24('20:00');
                                },
                              },
                            ].map((chip) => (
                              <button
                                key={chip.label}
                                type="button"
                                onClick={chip.onClick}
                                className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                                  chip.active
                                    ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/15 text-[#7FFFD4]'
                                    : 'border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:border-[#7FFFD4]/40 hover:text-white'
                                }`}
                              >
                                {chip.label}
                              </button>
                            ))}
                            {(newTaskDueIso || newTaskTime24) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNewTaskDueIso('');
                                  setNewTaskTime24('');
                                }}
                                className="px-2 py-1 rounded-lg text-[11px] text-zinc-500 hover:text-rose-300 cursor-pointer"
                              >
                                مسح
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={newTaskDueIso}
                              onChange={(e) => setNewTaskDueIso(e.target.value)}
                              className="flex-1 min-w-0 rounded-lg border border-white/[0.09] bg-black/55 px-2.5 py-1.5 text-[11px] font-mono-tabular text-zinc-300 focus:outline-none focus:border-[#7FFFD4]"
                              title="التاريخ"
                            />
                            <input
                              type="time"
                              value={newTaskTime24}
                              onChange={(e) => {
                                setNewTaskTime24(e.target.value);
                                if (e.target.value && !newTaskDueIso) {
                                  setNewTaskDueIso(todayCairoIso);
                                }
                              }}
                              className="w-28 rounded-lg border border-white/[0.09] bg-black/55 px-2.5 py-1.5 text-[11px] font-mono-tabular text-zinc-300 focus:outline-none focus:border-[#7FFFD4]"
                              title="الوقت"
                            />
                          </div>
                        </div>
                      )}
                    </form>
                  );
                })()}

                {visibleTasks.length === 0 ? (
                  <div className="py-5 text-center text-xs text-zinc-500">
                    لا توجد مهام حالياً.
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06] max-h-[300px] overflow-y-auto">
                    {visibleTasks.map((tk) => {
                      const done = tk.status === 'completed';
                      return (
                        <div
                          key={`${tk.taskListId}-${tk.id}`}
                          className={`py-2.5 px-1 flex items-center justify-between gap-3 ${
                            done ? 'opacity-45' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <button
                              type="button"
                              onClick={() =>
                                setPendingTaskConfirmation({
                                  operation: done ? 'reopen' : 'complete',
                                  taskId: tk.id,
                                  taskListId: tk.taskListId,
                                  title: tk.title,
                                })
                              }
                              className="min-h-[38px] min-w-[38px] flex items-center justify-center text-zinc-500 hover:text-[#4ADE80] cursor-pointer shrink-0"
                              title={done ? 'إعادة الفتح' : 'إتمام'}
                            >
                              {done ? (
                                <CheckCircle2 className="w-5 h-5 text-[#4ADE80]" />
                              ) : (
                                <Circle className="w-5 h-5" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <div className={`text-sm font-medium truncate ${done ? 'line-through text-zinc-400' : 'text-zinc-100'}`}>
                                {tk.title}
                              </div>
                              {(tk.due || googleTaskLists.length > 1) && (
                                <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-0.5">
                                  {googleTaskLists.length > 1 && <span>{tk.taskListTitle}</span>}
                                  {tk.due && (
                                    <span className="font-mono-tabular text-[#7FFFD4]">
                                      {googleTaskLists.length > 1 ? '· ' : ''}
                                      {tk.due.slice(0, 10)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setPendingTaskConfirmation({
                                operation: 'delete',
                                taskId: tk.id,
                                taskListId: tk.taskListId,
                                title: tk.title,
                              })
                            }
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
              </div>
            )}
          </section>
          </ErrorBoundary>

          {/* 2. Dynamic Daily Habits ("عادات اليوم") */}
          <ErrorBoundary sectionTitle="عادات اليوم" compact>
          <section className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${cardSurface}`}>
            {(() => {
              const plannedHabits = habits.filter((h) => h.status === 'planned');
              const completedHabitsCount = resolvedHabits.filter((r) => r.completedToday).length;
              const openNewHabitModal = () => {
                setEditingHabitId(null);
                setHabitTitle('');
                setHabitStatus('active');
                setHabitAnchor('sunrise-light');
                setHabitDurationMin(30);
                setHabitDaysOfWeek([]);
                setHabitSkipOnFasting(false);
                setHabitModalOpen(true);
              };
              const openEditHabitModal = (h: DynamicHabit) => {
                setEditingHabitId(h.id);
                setHabitTitle(h.title);
                setHabitStatus(h.status);
                setHabitAnchor(h.anchor);
                setHabitDurationMin(h.durationMin || 30);
                setHabitDaysOfWeek(Array.isArray(h.daysOfWeek) ? h.daysOfWeek : []);
                setHabitSkipOnFasting(Boolean(h.skipOnFasting));
                setHabitModalOpen(true);
              };
              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-subtle)]">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#7FFFD4]" />
                      <span>عادات اليوم</span>
                      {resolvedHabits.length > 0 && (
                        <span className="font-mono-tabular text-xs font-medium text-zinc-500">
                          · {completedHabitsCount}/{resolvedHabits.length}
                        </span>
                      )}
                    </h2>
                    <div className="flex items-center gap-2">
                      {plannedHabits.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowPlannedHabits((v) => !v)}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg border border-white/[0.08] bg-[var(--bg-surface)] text-[11px] font-medium text-zinc-300 hover:border-[#7FFFD4]/40 hover:text-[#7FFFD4] cursor-pointer transition-colors"
                        >
                          مستقبلية ({plannedHabits.length})
                        </button>
                      )}
                      {onAddHabit && (
                        <button
                          type="button"
                          onClick={openNewHabitModal}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[#7FFFD4]/30 bg-[#7FFFD4]/10 text-[#7FFFD4] text-xs font-semibold flex items-center gap-1 hover:bg-[#7FFFD4]/20 cursor-pointer transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {resolvedHabits.length === 0 ? (
                    <div className="text-xs text-zinc-500 py-1 flex items-center justify-between gap-2">
                      <span>لا توجد عادات حالية مفعّلة اليوم — أضف عادة لتتكيّف تلقائياً مع أوقاتك الفاضية.</span>
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border-subtle)]">
                      {resolvedHabits.map((item) => {
                        const { habit, dueToday, completedToday, skippedReasonAr, slot, isFallbackSlot, isFlexibleUnplaced } = item;
                        const anchorMeta = DYNAMIC_HABIT_ANCHOR_LABELS[habit.anchor];
                        return (
                          <div
                            key={habit.id}
                            className="py-2.5 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => onToggleHabitToday?.(habit.id)}
                                aria-label={completedToday ? `إلغاء إنجاز ${habit.title}` : `إنجاز ${habit.title}`}
                                className="min-h-[36px] min-w-[36px] -ms-1 flex items-center justify-center rounded-lg cursor-pointer shrink-0 transition-colors hover:bg-white/[0.04]"
                              >
                                {completedToday ? (
                                  <CheckCircle2 className="w-4 h-4 text-[#4ADE80]" />
                                ) : (
                                  <Circle className="w-4 h-4 text-zinc-500 hover:text-[#7FFFD4]" />
                                )}
                              </button>
                              <div className="min-w-0 flex-1">
                                <div
                                  className={`font-medium truncate ${
                                    completedToday ? 'line-through text-zinc-500' : 'text-white'
                                  }`}
                                >
                                  {habit.title}
                                </div>
                                <div className="text-[11px] text-zinc-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <span>{anchorMeta.emoji} {anchorMeta.labelAr}</span>
                                  <span>·</span>
                                  <span className="font-mono-tabular">{habit.durationMin} د</span>
                                  {!dueToday && skippedReasonAr ? (
                                    <span className="text-zinc-500">· {skippedReasonAr}</span>
                                  ) : slot ? (
                                    <span className="font-mono-tabular text-[#7FFFD4]">
                                      · {formatMinutes12h(slot.startMin, language)} – {formatMinutes12h(slot.endMin, language)}
                                      {isFallbackSlot ? ' (بديل متاح)' : ''}
                                    </span>
                                  ) : isFlexibleUnplaced ? (
                                    <span className="text-amber-300/90">· مرنة (حسب التفرغ)</span>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            {onUpdateHabit && (
                              <button
                                type="button"
                                onClick={() => openEditHabitModal(habit)}
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] cursor-pointer shrink-0"
                                title={`تعديل ${habit.title}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {showPlannedHabits && plannedHabits.length > 0 && (
                    <div className="pt-2.5 border-t border-[var(--border-subtle)] space-y-2">
                      <div className="text-[11px] font-semibold text-zinc-400">
                        عادات مستقبلية (مؤجلة حتى تفعيلها)
                      </div>
                      <div className="divide-y divide-[var(--border-subtle)]">
                        {plannedHabits.map((ph) => {
                          const anchorMeta = DYNAMIC_HABIT_ANCHOR_LABELS[ph.anchor];
                          return (
                            <div key={ph.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                              <div className="min-w-0">
                                <div className="text-zinc-300 font-medium truncate">{ph.title}</div>
                                <div className="text-[11px] text-zinc-500">
                                  {anchorMeta.emoji} {anchorMeta.labelAr} · {ph.durationMin} د
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {onToggleHabitStatus && (
                                  <button
                                    type="button"
                                    onClick={() => onToggleHabitStatus(ph.id)}
                                    className="px-2.5 py-1 rounded-lg border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 text-[#7FFFD4] text-[11px] font-semibold hover:bg-[#7FFFD4]/20 cursor-pointer"
                                  >
                                    تفعيل
                                  </button>
                                )}
                                {onUpdateHabit && (
                                  <button
                                    type="button"
                                    onClick={() => openEditHabitModal(ph)}
                                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 cursor-pointer"
                                    title={`تعديل ${ph.title}`}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </section>
          </ErrorBoundary>

          {/* 3. Creative Activities & Hobbies (Shown only when non-empty) */}
          {creativePlacements.length > 0 && (
            <section className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${cardSurface}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/[0.07]">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-[#7FFFD4]" />
                  <span>الأنشطة والهوايات</span>
                  <span className="font-mono-tabular text-xs font-medium text-zinc-500">
                    · {creativePlacements.length}
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    onOpenAssistantWithPrompt(
                      'عاوز أضيف أو أعدّل نشاط إبداعي / هواية جديدة في أوقاتي الفاضية — حدد معايا التكرار (يومي أو أسبوعي أو شهري) وهل هو مؤقت أم مستمر.'
                    )
                  }
                  className="text-xs text-[#7FFFD4] hover:underline font-medium cursor-pointer"
                >
                  تعديل بـ Gemini
                </button>
              </div>

              <div className="divide-y divide-white/[0.06]">
                {(showAllCreative ? creativePlacements : creativePlacements.slice(0, 4)).map(
                  (placement) => {
                    const {
                      activity,
                      sessionsInPeriod,
                      goalInPeriod,
                      periodLabelAr,
                      doneToday,
                      suggestedSlot,
                    } = placement;
                    const pct = Math.min(
                      100,
                      Math.round((sessionsInPeriod / Math.max(1, goalInPeriod)) * 100)
                    );
                    return (
                      <div key={activity.id} className="py-3 space-y-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-lg shrink-0">{activity.emoji}</span>
                            <div className="min-w-0">
                              <div className="font-semibold text-white truncate">
                                {activity.name}
                              </div>
                              <div className="text-[11px] text-zinc-500 font-mono-tabular">
                                {sessionsInPeriod}/{goalInPeriod} {periodLabelAr} · {activity.sessionMinutes} د
                                {activity.expiresOnDate ? ` · حتى ${activity.expiresOnDate}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onToggleCreativeToday(activity.id)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                                doneToday
                                  ? 'border border-[#4ADE80]/40 bg-[#4ADE80]/12 text-[#4ADE80]'
                                  : 'border border-white/10 text-zinc-200 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4]'
                              }`}
                            >
                              {doneToday ? 'تم ✓' : 'تسجيل'}
                            </button>
                            {suggestedSlot && !doneToday && (
                              <button
                                type="button"
                                onClick={() => setPendingCreativeCalendarConfirm(placement)}
                                className="px-2.5 py-1 rounded-lg border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 text-[#7FFFD4] text-[11px] font-semibold hover:bg-[#7FFFD4]/20 cursor-pointer"
                              >
                                تثبيت {formatMinutes12h(suggestedSlot.startMin, language)}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteCreativeActivity(activity.id)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 cursor-pointer"
                              title={`حذف ${activity.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              doneToday ? 'bg-[#4ADE80]' : 'bg-[#7FFFD4]/80'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  }
                )}
              </div>

              {creativePlacements.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllCreative((v) => !v)}
                  className="w-full pt-2 border-t border-white/[0.07] text-xs text-zinc-400 hover:text-[#7FFFD4] flex items-center justify-center gap-1 cursor-pointer"
                >
                  {showAllCreative ? (
                    <>
                      <span>أقل</span>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      <span>عرض الكل ({creativePlacements.length})</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              )}
            </section>
          )}

          {/* 4. Smart Gmail Digest (Quiet Collapsible Progressive-Disclosure Strip) */}
          <section className={`rounded-2xl border px-4 py-3 ${cardSurface}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                aria-expanded={showGmailDrawer || Boolean(gmailError)}
                onClick={() => setShowGmailDrawer((v) => !v)}
                className="min-h-[44px] sm:min-h-[34px] flex items-center gap-2 text-right cursor-pointer min-w-0 flex-1"
              >
                <Mail className="w-4 h-4 text-[#7FFFD4] shrink-0" />
                <span className="text-xs font-bold text-white">مواعيد Gmail</span>
                {gmailDigest.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#7FFFD4]/10 border border-[#7FFFD4]/20 text-[11px] text-[#7FFFD4] font-mono-tabular font-semibold">
                    {gmailDigest.length}
                  </span>
                )}
                {gmailLastSyncedIso && calendarConnected && !gmailNeedsReauth && (
                  <span className="hidden sm:inline text-[11px] text-zinc-500 font-mono-tabular">
                    · {formatIsoTo12h(gmailLastSyncedIso, language, { includeDate: false, timeZone: activeTimeZone })}
                  </span>
                )}
                {showGmailDrawer || Boolean(gmailError) ? (
                  <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                )}
              </button>

              {calendarConnected && !gmailNeedsReauth ? (
                <button
                  type="button"
                  disabled={loadingGmail}
                  onClick={() => {
                    setShowGmailDrawer(true);
                    void onFetchGmailDigest();
                  }}
                  className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-xl border border-[var(--border-subtle)] text-xs text-zinc-300 hover:border-white/20 hover:text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingGmail ? 'animate-spin' : ''}`} />
                  <span>{loadingGmail ? 'جارٍ الفحص...' : 'فحص'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isLoggingIn}
                  onClick={() => {
                    onGoogleSignIn().catch(() => {});
                  }}
                  className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-xl border border-[var(--border-subtle)] bg-white/[0.04] text-xs font-medium text-zinc-200 hover:border-[#7FFFD4]/40 hover:text-[#7FFFD4] cursor-pointer disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  {calendarConnected ? 'تفعيل Gmail' : 'تسجيل الدخول'}
                </button>
              )}
            </div>

            <AnimatePresence initial={false}>
              {(showGmailDrawer || Boolean(gmailError)) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
                    {gmailError && (
                      <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
                        <span>{gmailError}</span>
                        {gmailNextRetryInSec > 0 && (
                          <span className="font-mono-tabular text-[11px] text-amber-300">
                            {gmailNextRetryInSec} ث
                          </span>
                        )}
                      </div>
                    )}

                    {gmailDigest.length === 0 ? (
                      <div className="text-xs text-zinc-500">
                        {gmailScannedCount > 0
                          ? `تم فحص ${gmailScannedCount} رسالة — لا توجد مواعيد جديدة.`
                          : 'لا توجد مواعيد مستخرجة حالياً.'}
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--border-subtle)]">
                        {gmailDigest.map((item) => {
                          const alreadyAdded = Boolean(addedGmailIds[item.id]);
                          return (
                            <div
                              key={item.id}
                              className="py-2.5 flex flex-wrap items-start justify-between gap-3 text-xs"
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="font-semibold text-white">{item.titleAr}</div>
                                <div className="text-[11px] text-zinc-400 leading-relaxed">
                                  {item.summaryAr}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 font-mono-tabular">
                                  {item.dateIso && <span>{item.dateIso}</span>}
                                  {item.startTime24 && (
                                    <span className="text-[#7FFFD4]">
                                      · {formatTime24To12h(item.startTime24, language)}
                                    </span>
                                  )}
                                  {item.sender && <span className="truncate max-w-[200px]">· {item.sender}</span>}
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={alreadyAdded}
                                onClick={() => setPendingGmailEventConfirm(item)}
                                className={`min-h-[44px] sm:min-h-[34px] px-3.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0 cursor-pointer transition-colors ${
                                  alreadyAdded
                                    ? 'border border-[#4ADE80]/35 bg-[#4ADE80]/10 text-[#4ADE80] cursor-default'
                                    : 'bg-[#7FFFD4] text-black hover:bg-[#66eec2]'
                                }`}
                              >
                                {alreadyAdded ? 'أُضيف ✓' : 'إضافة للتقويم'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* Support Column (5 cols): High-Frequency Daily Care FIRST — Water -> Medications -> Sleep -> Streaks */}
        <div className="md:col-span-5 flex flex-col gap-4 min-w-0">
          {/* 1. Hydration Card (Promoted to #1 in Support Column — highest tap frequency) */}
          <ErrorBoundary sectionTitle="الماء والترطيب" compact>
          <section className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${cardSurface}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Droplets className="w-4 h-4 text-[#7FFFD4]" />
                <span>
                  {dailyRhythmPlan.isFastingToday
                    ? 'الماء · الصيام'
                    : t(language, 'hydrationTitle')}
                </span>
              </h2>
              <div className="font-mono-tabular text-xs flex items-center gap-2">
                <span className="font-bold text-[#7FFFD4]">
                  {displayedCupsLogged}/{scheduledTargetCups}
                </span>
                <span className="text-zinc-500">·</span>
                <span className="text-zinc-400">
                  {totalMl} / {targetMl} مل
                </span>
                <span className="text-zinc-500">·</span>
                <span className={waterPct >= 100 ? 'text-[#4ADE80] font-bold' : 'text-zinc-300'}>
                  {waterPct}%
                </span>
              </div>
            </div>

            {weatherInfo && weatherInfo.heatBonusMl > 0 && (
              <div className="text-[11px] font-mono-tabular text-amber-300">
                {weatherInfo.icon} +{weatherInfo.heatBonusMl} مل إضافية لحرارة اليوم ({weatherInfo.maxTempC}°C)
              </div>
            )}

            {/* Tactile Interactive Cup Progress Strip (Wraps comfortably on narrow phones, compact single-row on desktop) */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-1">
              {scheduledHydrationSlots.map((slotPlan, idx) => {
                const filled = Boolean(hydrationToday.slots[idx]);
                return (
                  <button
                    key={slotPlan.cupIndex}
                    type="button"
                    onClick={() => onToggleWaterSlot(idx)}
                    title={`كوب ${idx + 1} · ${formatMinutes12h(slotPlan.timeMinutes, language)}`}
                    className={`min-w-[44px] min-h-[44px] sm:min-w-0 sm:flex-1 sm:h-9 sm:min-h-[36px] rounded-xl sm:rounded-lg font-mono-tabular text-xs sm:text-[11px] font-bold flex items-center justify-center transition-all active:scale-95 cursor-pointer select-none ${
                      filled
                        ? 'bg-[#7FFFD4] text-black hover:bg-[#66eec2]'
                        : 'bg-white/[0.04] border border-[var(--border-subtle)] text-zinc-400 hover:bg-white/[0.1] hover:text-white'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Clean Next-Cup Reminder Line */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-white/[0.07] text-xs">
              <div className="flex items-center gap-1.5 text-zinc-300 min-w-0">
                <Bell
                  className={`w-3.5 h-3.5 shrink-0 ${
                    waterRemindersEnabled ? 'text-[#7FFFD4]' : 'text-zinc-500'
                  }`}
                />
                {nextWaterSlot ? (
                  <span className="truncate font-mono-tabular">
                    كوب #{nextWaterSlot.cupIndex} ·{' '}
                    <strong className="text-[#7FFFD4]">
                      {formatMinutes12h(nextWaterSlot.timeMinutes, language)}
                    </strong>
                  </span>
                ) : (
                  <span className="text-[#4ADE80] font-semibold">أتممت هدف اليوم ✓</span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onToggleWaterReminders}
                  className={`min-h-[40px] sm:min-h-0 px-3 sm:px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                    waterRemindersEnabled
                      ? 'border-[#4ADE80]/35 bg-[#4ADE80]/10 text-[#4ADE80]'
                      : 'border-white/10 text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  {waterRemindersEnabled ? 'التنبيه مفعّل' : 'متوقف'}
                </button>
                {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
                  <button
                    type="button"
                    onClick={() => void onRequestNotificationPermission()}
                    className="min-h-[40px] sm:min-h-0 px-3 sm:px-2 py-1 rounded-lg border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 text-[11px] font-medium text-[#7FFFD4] hover:bg-[#7FFFD4]/20 cursor-pointer"
                  >
                    الإشعارات
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onTriggerTaskAlert('💧', 'water', {
                      bypassSanctuary: true,
                      privacyEmoji: '💧',
                    })
                  }
                  className="min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg text-zinc-500 hover:text-[#7FFFD4] hover:bg-white/[0.04] flex items-center justify-center cursor-pointer"
                  title="تجربة تنبيه كوب الماء"
                  aria-label="تجربة تنبيه كوب الماء"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Rolling 7-Day Water Log (always visible, auto-drops day 8) */}
            {hydrationHistory.length > 0 && (
              <div className="pt-2.5 border-t border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>سجل آخر 7 أيام</span>
                  <span className="font-mono-tabular text-[#7FFFD4]">
                    {hydrationHistory.reduce((acc, d) => acc + d.cupsLogged, 0)} كوب ·{' '}
                    {hydrationHistory.filter((d) => d.cupsLogged >= Math.max(1, d.targetCups)).length}/7 هدف
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1 min-w-0">
                  {hydrationHistory.slice(-7).map((day, idx, arr) => {
                    const isTodayCell = idx === arr.length - 1;
                    const ratio = Math.min(1, day.cupsLogged / Math.max(1, day.targetCups));
                    const hitGoal = day.cupsLogged >= Math.max(1, day.targetCups);
                    return (
                      <div
                        key={day.dateKey || `${day.labelAr}-${idx}`}
                        title={`${day.labelAr}: ${day.cupsLogged} من ${day.targetCups} كوب`}
                        className={`min-w-0 rounded-lg border px-0.5 sm:px-1 py-1.5 text-center transition-colors ${
                          hitGoal
                            ? 'border-[#4ADE80]/35 bg-[#4ADE80]/10'
                            : isTodayCell
                              ? 'border-[#7FFFD4]/35 bg-[#7FFFD4]/[0.07]'
                              : 'border-white/[0.06] bg-white/[0.02]'
                        }`}
                      >
                        <div
                          className={`text-[10px] truncate ${
                            isTodayCell ? 'text-[#7FFFD4] font-bold' : 'text-zinc-500'
                          }`}
                        >
                          {isTodayCell ? 'اليوم' : day.labelAr}
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden my-1">
                          <div
                            className={`h-full rounded-full transition-all ${
                              hitGoal ? 'bg-[#4ADE80]' : 'bg-[#7FFFD4]'
                            }`}
                            style={{ width: `${Math.round(ratio * 100)}%` }}
                          />
                        </div>
                        <div
                          className={`font-mono-tabular text-[11px] font-bold ${
                            hitGoal
                              ? 'text-[#4ADE80]'
                              : day.cupsLogged > 0
                                ? 'text-zinc-200'
                                : 'text-zinc-500'
                          }`}
                        >
                          {day.cupsLogged}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* On-Demand Expanders: Cup Schedule & 7-Day Detailed Chart */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06] text-[11px]">
              <button
                type="button"
                onClick={() => setShowHydrationSchedule((v) => !v)}
                className="text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>مواعيد الأكواب</span>
                {showHydrationSchedule ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowWaterChart((v) => !v)}
                className="text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>تفاصيل 7 أيام</span>
                {showWaterChart ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {showHydrationSchedule && (
              <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pt-1">
                {dailyRhythmPlan.hydrationSlots.map((slot, idx) => {
                  const done = hydrationToday.slots[idx];
                  return (
                    <button
                      key={slot.cupIndex}
                      type="button"
                      onClick={() => onToggleWaterSlot(idx)}
                      className={`rounded-lg border px-2.5 py-2 text-right text-[11px] transition-colors cursor-pointer ${
                        done
                          ? 'border-[#4ADE80]/35 bg-[#4ADE80]/10 text-[#4ADE80]'
                          : 'border-white/[0.07] bg-white/[0.02] text-zinc-300 hover:border-[#7FFFD4]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 font-mono-tabular">
                        <span className="font-bold">
                          {done ? '✓ ' : ''}كوب {slot.cupIndex}
                        </span>
                        <span>{formatMinutes12h(slot.timeMinutes, language)}</span>
                      </div>
                      {slot.windowAr ? (
                        <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                          {slot.windowAr}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            {showWaterChart && (
              <Suspense fallback={<ChartLoadingFallback />}>
                <HydrationWeeklyChart
                  hydrationHistory={hydrationHistory}
                  weatherInfo={weatherInfo}
                  cupSizeMl={lifeProfile.cupSizeMl}
                />
              </Suspense>
            )}
          </section>
          </ErrorBoundary>

          {/* 2. Medications & Supplements (Clean Dedicated Card right below Water) */}
          <ErrorBoundary sectionTitle="العلاجات والمكملات" compact>
          <section className={`rounded-2xl border p-4 space-y-3 ${cardSurface}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.07]">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Pill className="w-4 h-4 text-[#7FFFD4]" />
                  <span>العلاجات والمكملات</span>
                </h2>
                {medications.length > 0 && (
                  <span className="font-mono-tabular text-xs text-zinc-400">
                    <span
                      className={
                        medAdherenceSummary.takenTodayCount >= medAdherenceSummary.dueTodayCount &&
                        medAdherenceSummary.dueTodayCount > 0
                          ? 'text-[#4ADE80] font-bold'
                          : 'text-amber-300 font-semibold'
                      }
                    >
                      {medAdherenceSummary.takenTodayCount}/{medAdherenceSummary.dueTodayCount}
                    </span>
                    <span> · التزام {medAdherenceSummary.adherencePct}%</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMedForm((v) => !v);
                    setShowMedAdvanced(false);
                  }}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-white/[0.1] bg-white/[0.02] text-xs font-medium text-zinc-200 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة</span>
                </button>
              </div>
            </div>

            {showAddMedForm && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newMedName.trim()) return;
                  const trimmedName = newMedName.trim();
                  const trimmedNote = newMedNote.trim();
                  const finalTimes =
                    newMedTimes24.length > 0 ? newMedTimes24 : [newMedCurrentTime24];
                  const parsedRem = newMedRemainingDoses.trim()
                    ? Math.max(0, Math.min(500, Math.round(Number(newMedRemainingDoses))))
                    : -1;
                  onAddMedication({
                    name: trimmedName,
                    time24: finalTimes[0],
                    times24: finalTimes,
                    daysOfWeek: newMedDaysOfWeek,
                    fastingPolicy: newMedFastingPolicy,
                    doseNote: trimmedNote || '',
                    courseEndDate: newMedCourseEnd.trim() || '',
                    remainingDoses: Number.isFinite(parsedRem) ? parsedRem : -1,
                    totalDoses: Number.isFinite(parsedRem) ? parsedRem : -1,
                    refillAlertDays: newMedRefillAlertDays,
                  });

                  if (calendarConnected && newMedSyncCalendar) {
                    const DAY_CODE_MAP = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
                    const byDays =
                      newMedDaysOfWeek.length > 0
                        ? newMedDaysOfWeek.map((d) => DAY_CODE_MAP[d]).filter(Boolean)
                        : undefined;
                    const calendarActions: CalendarActionProposal[] = finalTimes.map((t24) => ({
                      operation: 'create',
                      calendarId: 'primary',
                      title: `💊 ⏰ ${trimmedName}`,
                      dateIso: todayCairoIso,
                      startTime24: t24,
                      durationMinutes: 15,
                      recurrenceRule: byDays && byDays.length > 0 ? 'WEEKLY' : 'DAILY',
                      byDays,
                      description: trimmedNote
                        ? `موعد علاج/مكمل: ${trimmedName} · ${trimmedNote}`
                        : `موعد علاج/مكمل مجدول عبر إيقاع اليوم | DayRhythm`,
                    }));
                    void onExecuteCalendarActions(calendarActions);
                  }

                  setNewMedName('');
                  setNewMedNote('');
                  setNewMedTimes24([]);
                  setNewMedDaysOfWeek([]);
                  setNewMedFastingPolicy('auto-nearest');
                  setNewMedCourseEnd('');
                  setNewMedRemainingDoses('');
                  setNewMedRefillAlertDays(3);
                  setShowMedAdvanced(false);
                  setShowAddMedForm(false);
                }}
                className="rounded-xl border border-white/[0.1] bg-black/55 p-3 space-y-2.5 text-xs"
              >
                <input
                  type="text"
                  value={newMedName}
                  onChange={(e) => setNewMedName(e.target.value)}
                  placeholder="اسم العلاج أو المكمل"
                  className="w-full rounded-lg border border-white/12 bg-black px-2.5 py-2 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
                />

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-zinc-400">الميعاد:</span>
                    <select
                      value={newMedHour12}
                      onChange={(e) => setNewMedHour12(Number(e.target.value))}
                      className="rounded-lg border border-white/12 bg-black px-2 py-1 text-white font-mono-tabular"
                      aria-label="الساعة"
                    >
                      {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                    <span className="text-zinc-500 font-mono-tabular">:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      value={newMedMinute}
                      placeholder="mm"
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (val === '') {
                          setNewMedMinute('');
                          return;
                        }
                        const v = Number(val);
                        setNewMedMinute(Number.isFinite(v) ? (v > 59 ? '59' : val.slice(0, 2)) : '');
                      }}
                      className="w-14 rounded-lg border border-white/12 bg-black px-2 py-1 text-center text-white placeholder:text-zinc-500 placeholder:font-normal font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                      aria-label="الدقائق"
                    />
                    <button
                      type="button"
                      onClick={() => setNewMedPeriod((p) => (p === 'AM' ? 'PM' : 'AM'))}
                      className="px-2.5 py-1 rounded-lg border border-white/12 bg-black text-[#7FFFD4] font-bold cursor-pointer"
                    >
                      {newMedPeriod === 'AM' ? 'ص' : 'م'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMedTimes24((prev) =>
                          prev.includes(newMedCurrentTime24)
                            ? prev
                            : [...prev, newMedCurrentTime24].slice(0, 6)
                        );
                      }}
                      className="px-2 py-1 rounded-lg border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[11px] text-[#7FFFD4] font-semibold cursor-pointer"
                    >
                      + جرعة
                    </button>
                  </div>
                  {newMedTimes24.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {newMedTimes24.map((t24) => (
                        <span
                          key={t24}
                          className="inline-flex items-center gap-1 rounded-md border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 px-2 py-0.5 text-[11px] font-mono-tabular text-[#7FFFD4]"
                        >
                          {formatTime24To12h(t24, language)}
                          <button
                            type="button"
                            onClick={() =>
                              setNewMedTimes24((prev) => prev.filter((x) => x !== t24))
                            }
                            className="text-zinc-400 hover:text-white cursor-pointer"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {newMedConflict.hasConflict && (
                  <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-2.5 space-y-2 text-[11px] text-amber-100">
                    <div className="flex items-start gap-1.5 font-semibold text-amber-200">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-300" />
                      <span>تعارض محتمل مع جدولك:</span>
                    </div>
                    <ul className="space-y-0.5 pr-4 list-disc text-[11px] text-amber-100/90">
                      {newMedConflict.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {newMedConflict.suggestedTime24 && newMedConflict.suggestedTime12Ar && (
                        <button
                          type="button"
                          onClick={() => {
                            applyTime24To12hPicker(
                              newMedConflict.suggestedTime24!,
                              setNewMedHour12,
                              setNewMedMinute,
                              setNewMedPeriod
                            );
                            if (newMedTimes24.length > 0) {
                              setNewMedTimes24([newMedConflict.suggestedTime24!]);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#7FFFD4] text-black text-[11px] font-bold hover:bg-[#66eec2] cursor-pointer"
                        >
                          تطبيق {newMedConflict.suggestedTime12Ar}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const medLabel = newMedName.trim() || 'علاج جديد';
                          const pickedLabel = formatTime24To12h(newMedCurrentTime24, 'ar');
                          const conflictList = newMedConflict.warnings.join('، ');
                          onOpenAssistantWithPrompt(
                            `عاوز أضيف «${medLabel}»${newMedNote.trim() ? ` (${newMedNote.trim()})` : ''} الساعة ${pickedLabel}، بس النظام نبّهني إن فيه تعارض: ${conflictList}. ناقشني واقترح أنسب ميعاد علمي متوافق مع الصلاة والنوم والصيام والتقويم، ولما أوافق احجزه في التقويم.`
                          );
                        }}
                        className="px-2.5 py-1 rounded-lg border border-amber-300/45 bg-black/50 text-amber-200 hover:text-white text-[11px] font-semibold cursor-pointer"
                      >
                        ناقش مع Gemini
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowMedAdvanced((v) => !v)}
                  aria-expanded={showMedAdvanced}
                  className="text-[11px] text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>خيارات إضافية {showMedAdvanced ? '▴' : '▾'}</span>
                </button>

                {showMedAdvanced && (
                  <div className="space-y-2.5 pt-1 border-t border-white/[0.06]">
                    <input
                      type="text"
                      value={newMedNote}
                      onChange={(e) => setNewMedNote(e.target.value)}
                      placeholder="ملاحظة (مثال: مع وجبة)"
                      className="w-full rounded-lg border border-white/12 bg-black px-2.5 py-1.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex items-center justify-between gap-2 rounded-lg border border-white/12 bg-black px-2.5 py-1 text-[11px] text-zinc-400">
                        <span>نهاية الكورس:</span>
                        <input
                          type="date"
                          value={newMedCourseEnd}
                          onChange={(e) => setNewMedCourseEnd(e.target.value)}
                          className="bg-black text-zinc-200 focus:outline-none font-mono-tabular"
                        />
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={500}
                        value={newMedRemainingDoses}
                        onChange={(e) => setNewMedRemainingDoses(e.target.value)}
                        placeholder="عدد الجرعات بالعبوة (اختياري)"
                        className="rounded-lg border border-white/12 bg-black px-2.5 py-1.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4] font-mono-tabular"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                      <span>تنبيه قبل النفاد:</span>
                      <div className="flex items-center gap-1">
                        {[2, 3, 5, 7].map((days) => (
                          <button
                            key={days}
                            type="button"
                            onClick={() => setNewMedRefillAlertDays(days)}
                            className={`px-2 py-0.5 rounded-lg border text-[11px] cursor-pointer ${
                              newMedRefillAlertDays === days
                                ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                                : 'border-white/10 text-zinc-400 hover:text-white'
                            }`}
                          >
                            {days} ي
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span>الأيام (فارغ = يومياً):</span>
                        {newMedDaysOfWeek.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setNewMedDaysOfWeek([])}
                            className="text-[#7FFFD4] hover:underline cursor-pointer"
                          >
                            كل يوم
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {ARABIC_WEEKDAYS.map((day) => {
                          const selected = newMedDaysOfWeek.includes(day.id);
                          return (
                            <button
                              key={day.id}
                              type="button"
                              onClick={() =>
                                setNewMedDaysOfWeek((prev) =>
                                  prev.includes(day.id)
                                    ? prev.filter((d) => d !== day.id)
                                    : [...prev, day.id].sort((a, b) => a - b)
                                )
                              }
                              className={`px-2 py-1 rounded-lg border text-[11px] cursor-pointer ${
                                selected
                                  ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                                  : 'border-white/10 text-zinc-400 hover:text-white'
                              }`}
                            >
                              {day.shortAr}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400 block">
                        سياسة الصيام (الجرعات بين الفجر والمغرب):
                      </label>
                      <select
                        value={newMedFastingPolicy}
                        onChange={(e) =>
                          setNewMedFastingPolicy(e.target.value as MedicationFastingPolicy)
                        }
                        className="w-full rounded-lg border border-white/12 bg-black px-2.5 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-[#7FFFD4]"
                      >
                        {MED_FASTING_POLICY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.labelAr}
                          </option>
                        ))}
                      </select>
                    </div>

                    {calendarConnected && (
                      <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer select-none pt-0.5">
                        <input
                          type="checkbox"
                          checked={newMedSyncCalendar}
                          onChange={(e) => setNewMedSyncCalendar(e.target.checked)}
                          className="accent-[#7FFFD4] rounded"
                        />
                        <span>إضافة تلقائية للتقويم</span>
                      </label>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => {
                      const medLabel = newMedName.trim() || 'علاج أو مكمل جديد';
                      const pickedLabel = formatTime24To12h(newMedCurrentTime24, 'ar');
                      onOpenAssistantWithPrompt(
                        `هل ميعاد الساعة ${pickedLabel} مناسب لـ «${medLabel}»${newMedNote.trim() ? ` (${newMedNote.trim()})` : ''}؟ راجع توافقه مع الصلوات والنوم والصيام وجدولي في التقويم وأخبرني علمياً قبل تثبيته.`
                      );
                    }}
                    className="text-[11px] text-[#7FFFD4] hover:underline cursor-pointer"
                  >
                    اسأل Gemini
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddMedForm(false);
                        setShowMedAdvanced(false);
                      }}
                      className="px-2.5 py-1 rounded-lg text-zinc-400 hover:text-white cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={!newMedName.trim()}
                      className="px-3 py-1 rounded-lg bg-[#7FFFD4] text-black font-bold disabled:opacity-40 cursor-pointer"
                    >
                      حفظ
                    </button>
                  </div>
                </div>
              </form>
            )}

            {medications.length === 0 ? (
              <div className="py-4 text-center text-xs text-zinc-500">
                لا توجد علاجات أو مكملات مضافة بعد.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {medications.map((med) => {
                  const doseTimes =
                    med.times24 && med.times24.length > 0
                      ? med.times24
                      : med.time24
                        ? [med.time24]
                        : [];
                  const resolvedMed = resolveMedicationDosesForDay(med, {
                    isFastingToday: Boolean(dailyRhythmPlan.isFastingToday),
                    fajrMin: medFajrMin,
                    maghribMin: medMaghribMin,
                  });
                  const takenDoses =
                    med.takenDateKey === todayCairoIso ? med.takenDosesToday ?? [] : [];
                  const takenToday =
                    med.takenDateKey === todayCairoIso &&
                    (doseTimes.length <= 1 || doseTimes.every((t) => takenDoses.includes(t)));
                  const daysLabel =
                    med.daysOfWeek && med.daysOfWeek.length > 0
                      ? med.daysOfWeek
                          .map((d) => ARABIC_WEEKDAYS.find((w) => w.id === d)?.shortAr ?? '')
                          .filter(Boolean)
                          .join('، ')
                      : '';

                  return (
                    <div
                      key={med.id}
                      className={`py-3 first:pt-0 last:pb-0 text-xs transition-opacity ${
                        takenToday ? 'opacity-85' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleMedication(med.id)}
                          className="flex items-center gap-2 cursor-pointer text-right min-w-0 flex-1"
                          title={med.doseNote || undefined}
                        >
                          <span className={`font-semibold truncate ${takenToday ? 'text-[#4ADE80]' : 'text-zinc-100'}`}>
                            {med.name}
                          </span>
                          {doseTimes.length === 1 && resolvedMed.doses.length === 0 && resolvedMed.skippedCount > 0 && (
                            <span className="text-[11px] text-amber-300/80 shrink-0">
                              · متخطى (صيام)
                            </span>
                          )}
                          {doseTimes.length === 1 && resolvedMed.doses[0] && (
                            <span
                              className={`font-mono-tabular text-[11px] shrink-0 ${
                                resolvedMed.doses[0].wasShifted ? 'text-[#7FFFD4]' : 'text-zinc-400'
                              }`}
                              title={
                                resolvedMed.doses[0].wasShifted
                                  ? `الموعد الأصلي: ${formatTime24To12h(resolvedMed.doses[0].originalTime24, language)}`
                                  : undefined
                              }
                            >
                              · {formatTime24To12h(resolvedMed.doses[0].effectiveTime24, language)}
                              {resolvedMed.doses[0].wasShifted ? ' (صيام)' : ''}
                            </span>
                          )}
                          {daysLabel && (
                            <span className="text-[11px] text-zinc-500 shrink-0">
                              ({daysLabel})
                            </span>
                          )}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onToggleMedication(med.id)}
                            aria-pressed={takenToday}
                            className={`min-h-[44px] sm:min-h-[34px] px-3 sm:px-2.5 py-1 rounded-xl border text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer select-none ${
                              takenToday
                                ? 'border-[#4ADE80] bg-[#4ADE80] text-black'
                                : 'border-[#7FFFD4]/35 bg-[#7FFFD4]/10 text-[#7FFFD4] hover:bg-[#7FFFD4] hover:text-black'
                            }`}
                          >
                            {takenToday ? (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <Circle className="w-3 h-3 shrink-0" />
                            )}
                            <span>
                              {takenToday
                                ? 'تم'
                                : doseTimes.length > 1 && takenDoses.length > 0
                                  ? `${takenDoses.length}/${doseTimes.length}`
                                  : 'تم اليوم'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (editingMedId === med.id) {
                                setEditingMedId(null);
                                return;
                              }
                              setEditingMedId(med.id);
                              setEditMedName(med.name);
                              const firstT = doseTimes[0] || '08:00';
                              applyTime24To12hPicker(
                                firstT,
                                setEditMedHour12,
                                setEditMedMinute,
                                setEditMedPeriod
                              );
                              setEditMedTimes24(doseTimes);
                              setEditMedDaysOfWeek(med.daysOfWeek ?? []);
                              setEditMedFastingPolicy(med.fastingPolicy ?? 'auto-nearest');
                              setShowEditMedAdvanced(false);
                              setEditMedNote(med.doseNote ?? '');
                              setEditMedCourseEnd(med.courseEndDate ?? '');
                              setEditMedRemainingDoses(
                                typeof med.remainingDoses === 'number' && med.remainingDoses >= 0
                                  ? String(med.remainingDoses)
                                  : ''
                              );
                              setEditMedRefillAlertDays(med.refillAlertDays ?? 3);
                            }}
                            className={`min-w-[42px] min-h-[42px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg flex items-center justify-center cursor-pointer shrink-0 transition-colors ${
                              editingMedId === med.id
                                ? 'text-[#7FFFD4] bg-[#7FFFD4]/15'
                                : 'text-zinc-500 hover:text-[#7FFFD4] hover:bg-[#7FFFD4]/10'
                            }`}
                            title={`تعديل ${med.name}`}
                            aria-label={`تعديل ${med.name}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingDeleteMed(med);
                              setDeleteMedStep(1);
                              setDeleteMedConfirmed(false);
                            }}
                            className="min-w-[42px] min-h-[42px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                            title={`حذف ${med.name}`}
                            aria-label={`حذف ${med.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {editingMedId === med.id && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!editMedName.trim()) return;
                            let h24 = editMedHour12 % 12;
                            if (editMedPeriod === 'PM') h24 += 12;
                            const mClamped = Math.max(0, Math.min(59, Math.round(Number(editMedMinute) || 0)));
                            const currentPicked24 = `${String(h24).padStart(2, '0')}:${String(mClamped).padStart(2, '0')}`;
                            const finalTimes = editMedTimes24.length > 0 ? editMedTimes24 : [currentPicked24];
                            const parsedRem = editMedRemainingDoses.trim()
                              ? Math.max(0, Math.min(500, Math.round(Number(editMedRemainingDoses))))
                              : -1;
                            onUpdateMedication?.({
                              operation: 'update',
                              medicationId: med.id,
                              name: editMedName.trim(),
                              time24: finalTimes[0],
                              times24: finalTimes,
                              daysOfWeek: editMedDaysOfWeek,
                              fastingPolicy: editMedFastingPolicy,
                              doseNote: editMedNote.trim(),
                              courseEndDate: editMedCourseEnd.trim(),
                              remainingDoses: Number.isFinite(parsedRem) ? parsedRem : -1,
                              refillAlertDays: editMedRefillAlertDays,
                            });
                            if (calendarConnected && med.calendarEventId) {
                              const DAY_CODE_MAP = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
                              const byDays =
                                editMedDaysOfWeek.length > 0
                                  ? editMedDaysOfWeek.map((d) => DAY_CODE_MAP[d]).filter(Boolean)
                                  : undefined;
                              void onExecuteCalendarActions([
                                {
                                  operation: 'update',
                                  eventId: med.calendarEventId,
                                  calendarId: 'primary',
                                  title: `💊 ⏰ ${editMedName.trim()}`,
                                  dateIso: todayCairoIso,
                                  startTime24: finalTimes[0],
                                  durationMinutes: 15,
                                  recurrenceRule: byDays && byDays.length > 0 ? 'WEEKLY' : 'DAILY',
                                  byDays,
                                  description: editMedNote.trim()
                                    ? `موعد علاج/مكمل: ${editMedName.trim()} · ${editMedNote.trim()}`
                                    : `موعد علاج/مكمل مجدول عبر إيقاع اليوم | DayRhythm`,
                                },
                              ]);
                            }
                            setEditingMedId(null);
                          }}
                          className="mt-2.5 rounded-xl border border-[#7FFFD4]/30 bg-black/70 p-3 space-y-2.5 text-xs"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={editMedName}
                              onChange={(e) => setEditMedName(e.target.value)}
                              placeholder="اسم العلاج أو المكمل"
                              className="rounded-lg border border-white/15 bg-black px-2.5 py-1.5 text-white focus:outline-none focus:border-[#7FFFD4]"
                            />
                            <input
                              type="text"
                              value={editMedNote}
                              onChange={(e) => setEditMedNote(e.target.value)}
                              placeholder="ملاحظة (مثال: مع وجبة)"
                              className="rounded-lg border border-white/15 bg-black px-2.5 py-1.5 text-white focus:outline-none focus:border-[#7FFFD4]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-zinc-400">الميعاد:</span>
                              <select
                                value={editMedHour12}
                                onChange={(e) => setEditMedHour12(Number(e.target.value))}
                                className="rounded-lg border border-white/15 bg-black px-2 py-1 text-white font-mono-tabular"
                                aria-label="الساعة"
                              >
                                {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                                  <option key={h} value={h}>
                                    {String(h).padStart(2, '0')}
                                  </option>
                                ))}
                              </select>
                              <span className="text-zinc-500 font-mono-tabular">:</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={2}
                                value={editMedMinute}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/\D/g, '');
                                  if (val === '') {
                                    setEditMedMinute('');
                                    return;
                                  }
                                  const v = Number(val);
                                  setEditMedMinute(Number.isFinite(v) ? (v > 59 ? '59' : val.slice(0, 2)) : '');
                                }}
                                className="w-14 rounded-lg border border-white/15 bg-black px-2 py-1 text-center text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                                aria-label="الدقائق"
                              />
                              <button
                                type="button"
                                onClick={() => setEditMedPeriod((p) => (p === 'AM' ? 'PM' : 'AM'))}
                                className="px-2.5 py-1 rounded-lg border border-white/15 bg-black text-[#7FFFD4] font-bold cursor-pointer"
                              >
                                {editMedPeriod === 'AM' ? 'ص' : 'م'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  let h24 = editMedHour12 % 12;
                                  if (editMedPeriod === 'PM') h24 += 12;
                                  const mClamped = Math.max(0, Math.min(59, Math.round(Number(editMedMinute) || 0)));
                                  const picked = `${String(h24).padStart(2, '0')}:${String(mClamped).padStart(2, '0')}`;
                                  setEditMedTimes24((prev) =>
                                    prev.includes(picked) ? prev : [...prev, picked].slice(0, 6)
                                  );
                                }}
                                className="px-2 py-1 rounded-lg border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[11px] text-[#7FFFD4] font-semibold cursor-pointer"
                              >
                                + جرعة
                              </button>
                            </div>
                            {editMedTimes24.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {editMedTimes24.map((t24) => (
                                  <span
                                    key={t24}
                                    className="inline-flex items-center gap-1 rounded-md border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 px-2 py-0.5 text-[11px] font-mono-tabular text-[#7FFFD4]"
                                  >
                                    {formatTime24To12h(t24, language)}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditMedTimes24((prev) => prev.filter((x) => x !== t24))
                                      }
                                      className="text-zinc-400 hover:text-white cursor-pointer"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="flex items-center justify-between gap-2 rounded-lg border border-white/12 bg-black px-2.5 py-1 text-[11px] text-zinc-400">
                              <span>نهاية الكورس:</span>
                              <input
                                type="date"
                                value={editMedCourseEnd}
                                onChange={(e) => setEditMedCourseEnd(e.target.value)}
                                className="bg-black text-zinc-200 focus:outline-none font-mono-tabular"
                              />
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={500}
                              value={editMedRemainingDoses}
                              onChange={(e) => setEditMedRemainingDoses(e.target.value)}
                              placeholder="عدد الجرعات المتبقية"
                              className="rounded-lg border border-white/12 bg-black px-2.5 py-1.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4] font-mono-tabular"
                            />
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {ARABIC_WEEKDAYS.map((day) => {
                              const selected = editMedDaysOfWeek.includes(day.id);
                              return (
                                <button
                                  key={day.id}
                                  type="button"
                                  onClick={() =>
                                    setEditMedDaysOfWeek((prev) =>
                                      prev.includes(day.id)
                                        ? prev.filter((d) => d !== day.id)
                                        : [...prev, day.id].sort((a, b) => a - b)
                                    )
                                  }
                                  className={`px-2 py-0.5 rounded-lg border text-[11px] cursor-pointer ${
                                    selected
                                      ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                                      : 'border-white/10 text-zinc-400 hover:text-white'
                                  }`}
                                >
                                  {day.shortAr}
                                </button>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={() => setShowEditMedAdvanced((v) => !v)}
                            aria-expanded={showEditMedAdvanced}
                            className="text-[11px] text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <span>خيارات إضافية {showEditMedAdvanced ? '▴' : '▾'}</span>
                          </button>

                          {showEditMedAdvanced && (
                            <div className="space-y-1 pt-1 border-t border-white/[0.06]">
                              <label className="text-[11px] text-zinc-400 block">
                                سياسة الصيام (الجرعات بين الفجر والمغرب):
                              </label>
                              <select
                                value={editMedFastingPolicy}
                                onChange={(e) =>
                                  setEditMedFastingPolicy(e.target.value as MedicationFastingPolicy)
                                }
                                className="w-full rounded-lg border border-white/15 bg-black px-2.5 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-[#7FFFD4]"
                              >
                                {MED_FASTING_POLICY_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.labelAr}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-white/[0.08]">
                            <button
                              type="button"
                              onClick={() => setEditingMedId(null)}
                              className="px-2.5 py-1 rounded-lg text-zinc-400 hover:text-white cursor-pointer"
                            >
                              إلغاء
                            </button>
                            <button
                              type="submit"
                              disabled={!editMedName.trim()}
                              className="px-3 py-1 rounded-lg bg-[#7FFFD4] text-black font-bold disabled:opacity-40 cursor-pointer"
                            >
                              حفظ التعديل
                            </button>
                          </div>
                        </form>
                      )}

                      {doseTimes.length > 1 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {resolvedMed.doses.map((dose) => {
                            const doseDone =
                              takenDoses.includes(dose.originalTime24) ||
                              takenDoses.includes(dose.effectiveTime24);
                            return (
                              <button
                                key={dose.originalTime24}
                                type="button"
                                onClick={() => onToggleMedication(med.id, dose.originalTime24)}
                                title={
                                  dose.wasShifted
                                    ? `الموعد الأصلي: ${formatTime24To12h(dose.originalTime24, language)}`
                                    : undefined
                                }
                                className={`px-2 py-0.5 rounded-md border font-mono-tabular text-[11px] cursor-pointer transition-colors ${
                                  doseDone
                                    ? 'border-[#4ADE80]/45 bg-[#4ADE80]/15 text-[#4ADE80] font-bold'
                                    : dose.wasShifted
                                      ? 'border-[#7FFFD4]/35 bg-[#7FFFD4]/10 text-[#7FFFD4] hover:border-[#7FFFD4]/60'
                                      : 'border-white/10 bg-white/[0.02] text-zinc-300 hover:border-[#7FFFD4]/45'
                                }`}
                              >
                                {formatTime24To12h(dose.effectiveTime24, language)}{' '}
                                {dose.wasShifted ? '(صيام) ' : ''}
                                {doseDone ? '✓' : '○'}
                              </button>
                            );
                          })}
                          {resolvedMed.skippedCount > 0 && (
                            <span className="text-[10px] text-amber-300/80">
                              (تخطي {resolvedMed.skippedCount} للصيام)
                            </span>
                          )}
                        </div>
                      )}

                      {doseTimes.length === 0 && (
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                          <span>بدون ميعاد محدد</span>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenAssistantWithPrompt(
                                `عاوز أحدد أنسب ميعاد علمي لـ «${med.name}» — راجع تقويمي والذاكرة ولو مش متسجل ابحث علمياً واقترح عليّ التوقيت الأفضل قبل التثبيت`
                              )
                            }
                            className="text-[#7FFFD4] hover:underline font-medium cursor-pointer"
                          >
                            اسأل Gemini ←
                          </button>
                        </div>
                      )}

                      {/* Compact 7-Day Adherence Strip + Stock Action */}
                      <div className="mt-2 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          {last7CairoDays.map((day) => {
                            const scheduled =
                              !med.daysOfWeek ||
                              med.daysOfWeek.length === 0 ||
                              med.daysOfWeek.includes(day.weekdayNum);
                            const wasTaken =
                              (med.takenDates ?? []).includes(day.dateIso) ||
                              (day.isToday && takenToday);
                            if (!scheduled) {
                              return (
                                <span
                                  key={day.dateIso}
                                  className="w-6 h-5 rounded border border-white/[0.05] text-[10px] text-zinc-500 flex items-center justify-center"
                                  title={`${day.dateIso} — راحة`}
                                >
                                  –
                                </span>
                              );
                            }
                            return (
                              <button
                                key={day.dateIso}
                                type="button"
                                onClick={() => onToggleMedicationDate(med.id, day.dateIso)}
                                className={`h-5 min-w-[22px] px-1 rounded border text-[10px] font-bold flex items-center justify-center cursor-pointer transition-colors ${
                                  wasTaken
                                    ? 'border-[#4ADE80]/40 bg-[#4ADE80]/15 text-[#4ADE80]'
                                    : day.isToday
                                      ? 'border-amber-400/40 bg-amber-400/12 text-amber-200'
                                      : 'border-rose-500/30 bg-rose-500/[0.08] text-rose-300/85 hover:border-rose-400'
                                }`}
                                title={
                                  wasTaken
                                    ? `${day.dateIso}: تم ✓`
                                    : day.isToday
                                      ? 'اليوم: لم يؤخذ بعد'
                                      : `${day.dateIso}: فائت`
                                }
                              >
                                {day.isToday
                                  ? wasTaken
                                    ? '✓'
                                    : '○'
                                  : wasTaken
                                    ? `${day.shortAr}✓`
                                    : `${day.shortAr}×`}
                              </button>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (editingStockMedId === med.id) {
                              setEditingStockMedId(null);
                            } else {
                              setEditingStockMedId(med.id);
                              setEditStockDosesInput(
                                typeof med.remainingDoses === 'number' && med.remainingDoses >= 0
                                  ? String(med.remainingDoses)
                                  : '30'
                              );
                              setEditStockAlertDays(med.refillAlertDays ?? 3);
                            }
                          }}
                          className="text-[11px] text-zinc-500 hover:text-[#7FFFD4] cursor-pointer shrink-0 transition-colors"
                        >
                          {typeof med.remainingDoses === 'number' && med.remainingDoses >= 0
                            ? 'المخزون'
                            : '+ مخزون'}
                        </button>
                      </div>

                      {((typeof med.remainingDoses === 'number' && med.remainingDoses >= 0) ||
                        Boolean(med.courseEndDate)) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono-tabular text-zinc-500">
                          {typeof med.remainingDoses === 'number' && med.remainingDoses >= 0 && (() => {
                            const daysLeft = computeMedicationDaysLeft(
                              med.remainingDoses,
                              doseTimes.length || 1,
                              med.daysOfWeek
                            );
                            const alertDays = med.refillAlertDays ?? 3;
                            const isLowStock = daysLeft <= alertDays;
                            return (
                              <span
                                className={
                                  med.remainingDoses === 0
                                    ? 'text-rose-400 font-semibold'
                                    : isLowStock
                                      ? 'text-amber-300 font-semibold'
                                      : 'text-zinc-500'
                                }
                              >
                                {med.remainingDoses === 0
                                  ? 'نفدت العبوة'
                                  : `متبقٍ ${med.remainingDoses} جرعة (~${Math.ceil(daysLeft)} ي)`}
                              </span>
                            );
                          })()}
                          {med.courseEndDate && (
                            <span
                              className={
                                med.courseEndDate < todayCairoIso ? 'text-amber-300' : 'text-zinc-500'
                              }
                            >
                              {typeof med.remainingDoses === 'number' && med.remainingDoses >= 0
                                ? '· '
                                : ''}
                              {med.courseEndDate < todayCairoIso
                                ? `انتهى ${med.courseEndDate}`
                                : `حتى ${med.courseEndDate}`}
                            </span>
                          )}
                        </div>
                      )}

                      {editingStockMedId === med.id && (
                        <div className="mt-2 rounded-lg border border-[#7FFFD4]/25 bg-black/75 p-2.5 space-y-2 text-[11px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="text-zinc-400">المتبقي:</label>
                            <input
                              type="number"
                              min={0}
                              max={500}
                              value={editStockDosesInput}
                              onChange={(e) => setEditStockDosesInput(e.target.value)}
                              className="w-18 rounded-lg border border-white/15 bg-black px-2 py-1 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                            />
                            <span className="text-zinc-400">تنبيه:</span>
                            {[2, 3, 5].map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setEditStockAlertDays(d)}
                                className={`px-1.5 py-0.5 rounded border text-[11px] cursor-pointer ${
                                  editStockAlertDays === d
                                    ? 'border-[#7FFFD4] bg-[#7FFFD4]/20 text-[#7FFFD4] font-bold'
                                    : 'border-white/10 text-zinc-400'
                                }`}
                              >
                                {d} ي
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingStockMedId(null)}
                              className="px-2 py-0.5 text-zinc-400 hover:text-white cursor-pointer"
                            >
                              إلغاء
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const parsed = Math.max(
                                  0,
                                  Math.min(500, Math.round(Number(editStockDosesInput) || 0))
                                );
                                onRefillMedication(med.id, parsed, editStockAlertDays);
                                setEditingStockMedId(null);
                              }}
                              className="px-2.5 py-0.5 rounded-lg bg-[#7FFFD4] text-black font-bold cursor-pointer"
                            >
                              حفظ ✓
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* On-Demand 14-Day Consumption & Refill Forecast Analytics */}
            {medications.length > 0 && (
              <div className="pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowMedChart((v) => !v)}
                  className="text-[11px] text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>تحليل 14 يوم وتوقع الشراء</span>
                  {showMedChart ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
                {showMedChart && (
                  <Suspense fallback={<ChartLoadingFallback />}>
                    <MedicationConsumptionChart
                      medications={medications}
                      todayCairoIso={todayCairoIso}
                    />
                  </Suspense>
                )}
              </div>
            )}
          </section>
          </ErrorBoundary>

          {/* 3. Sleep & Sun Rhythm (Checked morning/night — positioned cleanly below Water & Meds) */}
          <section className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${cardSurface}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
                <Moon className="w-4 h-4 text-[#7FFFD4]" />
                <span>إيقاع النوم والشمس</span>
              </h2>
              <button
                type="button"
                onClick={onOpenLifeProfile}
                className="min-h-[44px] sm:min-h-[32px] px-2 text-xs md:text-sm text-zinc-400 hover:text-[#7FFFD4] cursor-pointer transition-colors"
              >
                الثوابت
              </button>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 text-center">
              <div
                className={`rounded-xl border p-2.5 min-w-0 ${
                  dailyRhythmPlan.nightlyRecoveryMin > 0
                    ? 'border-[#7FFFD4]/35 bg-[#7FFFD4]/[0.06]'
                    : 'border-[var(--border-subtle)] bg-white/[0.02]'
                }`}
              >
                <div className="text-[11px] md:text-xs text-zinc-400">النوم</div>
                <div className="font-mono-tabular text-xs md:text-sm font-bold text-white mt-0.5 whitespace-nowrap">
                  {formatMinutes12h(dailyRhythmPlan.bedtimeMin, language)}
                </div>
                <div
                  className={`text-[11px] md:text-xs mt-0.5 whitespace-nowrap ${
                    dailyRhythmPlan.nightlyRecoveryMin > 0 ? 'text-[#7FFFD4]' : 'text-zinc-500'
                  }`}
                >
                  {dailyRhythmPlan.nightlyRecoveryMin > 0
                    ? `-${dailyRhythmPlan.nightlyRecoveryMin} د تعويض`
                    : formatDurationAr(dailyRhythmPlan.coreNightSleepMin)}
                </div>
              </div>

              <div
                className={`rounded-xl border p-2.5 min-w-0 ${
                  dailyRhythmPlan.suhoorStartMin !== null
                    ? 'border-[#7FFFD4]/35 bg-[#7FFFD4]/[0.06]'
                    : 'border-[var(--border-subtle)] bg-white/[0.02]'
                }`}
              >
                <div className="text-[11px] md:text-xs text-zinc-400">
                  {dailyRhythmPlan.suhoorStartMin !== null ? 'سحور غداً' : 'الاستيقاظ'}
                </div>
                <div
                  className={`font-mono-tabular text-xs md:text-sm font-bold mt-0.5 whitespace-nowrap ${
                    dailyRhythmPlan.suhoorStartMin !== null ? 'text-[#7FFFD4]' : 'text-white'
                  }`}
                >
                  {formatMinutes12h(dailyRhythmPlan.wakeMin, language)}
                </div>
                <div className="text-[11px] md:text-xs text-zinc-500 mt-0.5 whitespace-nowrap">
                  {dailyRhythmPlan.suhoorStartMin !== null
                    ? 'قبل الفجر بـ 45 د'
                    : 'قبل الفجر بـ 15 د'}
                </div>
              </div>

              <div className="col-span-2 xl:col-span-1 rounded-xl border border-[var(--border-subtle)] bg-white/[0.02] p-2.5 min-w-0">
                {dailyRhythmPlan.qailulahStartMin !== null ? (
                  <>
                    <div className="text-[11px] md:text-xs text-zinc-400">القيلولة</div>
                    <div className="font-mono-tabular text-xs md:text-sm font-bold text-[#4ADE80] mt-0.5 whitespace-nowrap">
                      {formatMinutes12h(dailyRhythmPlan.qailulahStartMin, language)}
                    </div>
                    <div className="text-[11px] md:text-xs text-zinc-500 mt-0.5 whitespace-nowrap">
                      {dailyRhythmPlan.qailulahDurationMin} د
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 xl:grid-cols-1 gap-2 xl:gap-1 items-center">
                    <div className="flex items-center justify-between gap-1.5 text-[11px] md:text-xs min-w-0">
                      <span className="inline-flex items-center gap-1 text-[#FBBF24] shrink-0">
                        <Sunrise className="w-3 h-3 shrink-0" />
                        <span>الشروق</span>
                      </span>
                      <span className="font-mono-tabular font-bold text-[#FDE68A] whitespace-nowrap shrink-0">
                        {formatMinutes12h(dailyRhythmPlan.sunriseMin, language)}
                      </span>
                    </div>
                    <div className="hidden xl:block h-px bg-white/[0.06]" />
                    <div className="flex items-center justify-between gap-1.5 text-[11px] md:text-xs min-w-0">
                      <span className="inline-flex items-center gap-1 text-[#FB7185] shrink-0">
                        <Sunset className="w-3 h-3 shrink-0" />
                        <span>الغروب</span>
                      </span>
                      <span className="font-mono-tabular font-bold text-[#FDA4AF] whitespace-nowrap shrink-0">
                        {formatMinutes12h(dailyRhythmPlan.maghribMin, language)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {typeof dailyRhythmPlan.postFajrStartMin === 'number' &&
              typeof dailyRhythmPlan.postFajrEndMin === 'number' &&
              typeof dailyRhythmPlan.postFajrDurationMin === 'number' &&
              dailyRhythmPlan.postFajrDurationMin > 0 && (
                <div className="rounded-lg border border-[#7FFFD4]/25 bg-[#7FFFD4]/[0.05] px-3 py-1.5 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-zinc-300">تعويض بعد الفجر (حتى الشروق)</span>
                  <span className="font-mono-tabular font-semibold text-[#7FFFD4] whitespace-nowrap">
                    {formatMinutes12h(dailyRhythmPlan.postFajrStartMin, language)} –{' '}
                    {formatMinutes12h(dailyRhythmPlan.postFajrEndMin, language)} ({dailyRhythmPlan.postFajrDurationMin} د)
                  </span>
                </div>
              )}

            {dailyRhythmPlan.qailulahStartMin !== null && (
              <div className="flex items-center justify-between gap-3 px-1 text-[11px] text-zinc-400">
                <span className="inline-flex items-center gap-1 text-[#FBBF24]">
                  <Sunrise className="w-3 h-3 shrink-0" />
                  <span>الشروق</span>
                  <span className="font-mono-tabular font-bold text-[#FDE68A]">
                    {formatMinutes12h(dailyRhythmPlan.sunriseMin, language)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-[#FB7185]">
                  <Sunset className="w-3 h-3 shrink-0" />
                  <span>الغروب</span>
                  <span className="font-mono-tabular font-bold text-[#FDA4AF]">
                    {formatMinutes12h(dailyRhythmPlan.maghribMin, language)}
                  </span>
                </span>
              </div>
            )}

            {dailyRhythmPlan.conflictWarningAr && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.08] px-3 py-2 text-[11px] text-amber-200">
                ⚠️ {dailyRhythmPlan.conflictWarningAr}
              </div>
            )}

            {/* Sleep Debt Recovery or Clean 1-Line Morning Check-In */}
            {dailyRhythmPlan.sleepDebtMinutes > 0 ? (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 space-y-2 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-amber-200">
                    عجز نوم: {formatDurationAr(dailyRhythmPlan.sleepDebtMinutes)}
                  </span>
                  {dailyRhythmPlan.nightlyRecoveryMin > 0 && (
                    <span className="font-mono-tabular text-[11px] text-[#7FFFD4]">
                      تبكير الليلة -{dailyRhythmPlan.nightlyRecoveryMin} د
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onLogSleepQuality('good')}
                    className="min-h-[40px] sm:min-h-0 px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-lg bg-[#7FFFD4] text-black font-bold text-[11px] hover:bg-[#66eec2] cursor-pointer"
                  >
                    نمت كويس (-{Math.max(dailyRhythmPlan.nightlyRecoveryMin, 30)}د)
                  </button>
                  <button
                    type="button"
                    onClick={() => onLogSleepQuality('reset')}
                    className="min-h-[40px] sm:min-h-0 px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-lg border border-[#4ADE80]/35 bg-[#4ADE80]/10 text-[#4ADE80] font-semibold text-[11px] hover:bg-[#4ADE80]/20 cursor-pointer"
                  >
                    تصفير ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => onLogSleepQuality('short_30')}
                    className="min-h-[40px] sm:min-h-0 px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-lg border border-white/10 text-zinc-300 text-[11px] hover:text-white cursor-pointer"
                  >
                    +30 د نقص
                  </button>
                  {dailyRhythmPlan.sleepDebtMinutes >= 60 && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenAssistantWithPrompt(
                          `عندي رصيد نوم ناقص ${dailyRhythmPlan.sleepDebtMinutes} دقيقة — فضّي لي مكان لقيلولة تعويضية 30 دقيقة النهاردة في التقويم بدون المساس بالصلاة`
                        )
                      }
                      className="min-h-[40px] sm:min-h-0 px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-lg border border-indigo-400/35 bg-indigo-400/12 text-indigo-200 font-semibold text-[11px] hover:bg-indigo-400/20 cursor-pointer"
                    >
                      قيلولة بـ Gemini
                    </button>
                  )}
                </div>
              </div>
            ) : lifeProfile.sleepDebtLogDateKey === todayCairoIso && !showSleepCheckinEdit ? (
              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[#4ADE80]">✓ نومك متوازن اليوم</span>
                <button
                  type="button"
                  onClick={() => setShowSleepCheckinEdit(true)}
                  className="text-zinc-500 hover:text-zinc-300 text-[11px] cursor-pointer"
                >
                  تعديل
                </button>
              </div>
            ) : (
              <div className="pt-2 border-t border-white/[0.06] space-y-2 text-[11px]">
                <div className="text-zinc-400 font-medium">كيف كان نومك الليلة الماضية؟</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onLogSleepQuality('good');
                      setShowSleepCheckinEdit(false);
                    }}
                    className="min-h-[42px] sm:min-h-0 py-1.5 px-2 rounded-lg border border-[#4ADE80]/30 bg-[#4ADE80]/[0.07] text-[#4ADE80] font-semibold text-[11px] hover:bg-[#4ADE80]/15 cursor-pointer"
                  >
                    ممتاز ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onLogSleepQuality('short_30');
                      setShowSleepCheckinEdit(false);
                    }}
                    className="min-h-[42px] sm:min-h-0 py-1.5 px-2 rounded-lg border border-white/10 text-zinc-300 text-[11px] hover:border-amber-400/40 hover:text-amber-200 cursor-pointer"
                  >
                    أقل (-30د)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onLogSleepQuality('short_60');
                      setShowSleepCheckinEdit(false);
                    }}
                    className="min-h-[42px] sm:min-h-0 py-1.5 px-2 rounded-lg border border-white/10 text-zinc-300 text-[11px] hover:border-amber-400/40 hover:text-amber-200 cursor-pointer"
                  >
                    سهر (-60د)
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 4. Compact weekly report (last 7 days) */}
          <WeeklyReportCard
            hydrationHistory={hydrationHistory}
            medications={medications}
            streaks={streaks}
            lifeProfile={lifeProfile}
            todayIso={todayCairoIso}
            cardSurface={cardSurface}
          />
        </div>
      </div>

      {/* Quick Create Google Calendar Event Modal (Streamlined 1-Tap Presets + Smart Conflict Check) */}
      {newEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#7FFFD4]" />
                <span>إضافة موعد سريع</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setNewEventModalOpen(false);
                  setNewEvConfirmStep(false);
                }}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const getOffsetDate = (daysAhead: number) =>
                getDateIsoInTimeZone(activeTimeZone, new Date(Date.now() + daysAhead * 86_400_000));
              const shiftEvMinutes = (deltaMin: number) => {
                let h24 = newEvHour12 % 12;
                if (newEvPeriod === 'PM') h24 += 12;
                const total = (((h24 * 60 + (Number(newEvMinute) || 0) + deltaMin) % 1440) + 1440) % 1440;
                const nh = Math.floor(total / 60);
                const nm = total % 60;
                applyTime24To12hPicker(
                  `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`,
                  setNewEvHour12,
                  setNewEvMinute,
                  setNewEvPeriod
                );
              };
              const setEvMinutesOfDay = (totalMin: number) => {
                const wrapped = ((Math.round(totalMin) % 1440) + 1440) % 1440;
                applyTime24To12hPicker(
                  `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`,
                  setNewEvHour12,
                  setNewEvMinute,
                  setNewEvPeriod
                );
              };
              const upcomingPrayer = prayers.find(
                (p) => p.id !== 'sunrise' && p.adhanMinutes > nowMinutes + 5
              );

              if (!newEvConfirmStep) {
                return (
                  <div className="space-y-3.5 text-xs">
                    <div>
                      <input
                        type="text"
                        value={newEvTitle}
                        onChange={(e) => setNewEvTitle(e.target.value)}
                        placeholder="عنوان الموعد (مثال: 🩺 دكتور أو 💼 اجتماع)"
                        autoFocus
                        className="w-full min-h-[44px] rounded-xl border border-white/15 bg-black/70 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
                      />
                    </div>

                    {/* 1-Tap Date Presets + Optional Date Picker */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {[
                            { label: 'اليوم', iso: todayCairoIso },
                            { label: 'غداً', iso: getOffsetDate(1) },
                            { label: 'بعد غد', iso: getOffsetDate(2) },
                          ].map((dPreset) => (
                            <button
                              key={dPreset.label}
                              type="button"
                              onClick={() => setNewEvDate(dPreset.iso)}
                              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                                newEvDate === dPreset.iso
                                  ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                                  : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white'
                              }`}
                            >
                              {dPreset.label}
                            </button>
                          ))}
                        </div>
                        <input
                          type="date"
                          value={newEvDate}
                          onChange={(e) => setNewEvDate(e.target.value)}
                          className="w-32 rounded-lg border border-white/12 bg-black/65 px-2 py-1.5 text-[11px] text-zinc-200 font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                        />
                      </div>
                    </div>

                    {/* Quick Time Presets + Stepper + Compact 12h Picker */}
                    <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/40 p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setNewEvDate(todayCairoIso);
                            setEvMinutesOfDay(nowMinutes + 30);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-zinc-300 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4] cursor-pointer"
                        >
                          +30 د
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNewEvDate(todayCairoIso);
                            setEvMinutesOfDay(nowMinutes + 60);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-zinc-300 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4] cursor-pointer"
                        >
                          +1 س
                        </button>
                        {upcomingPrayer && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewEvDate(todayCairoIso);
                              setEvMinutesOfDay(upcomingPrayer.adhanMinutes + 25);
                            }}
                            className="px-2.5 py-1 rounded-lg border border-[#7FFFD4]/30 bg-[#7FFFD4]/[0.08] text-[11px] text-[#7FFFD4] hover:bg-[#7FFFD4]/15 cursor-pointer"
                          >
                            بعد {upcomingPrayer.nameAr}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEvMinutesOfDay(20 * 60)}
                          className="px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-zinc-300 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4] cursor-pointer"
                        >
                          8 م
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => shiftEvMinutes(-15)}
                          className="px-2.5 py-2 rounded-lg border border-white/12 bg-white/[0.03] text-zinc-200 hover:border-[#7FFFD4]/45 font-mono-tabular text-xs font-bold cursor-pointer"
                        >
                          -15د
                        </button>
                        <div className="flex-1 grid grid-cols-3 gap-1.5">
                          <select
                            value={newEvHour12}
                            onChange={(e) => setNewEvHour12(Number(e.target.value))}
                            className="rounded-lg border border-white/15 bg-black/75 px-2 py-2 text-center text-white font-mono-tabular text-sm font-bold"
                            aria-label="الساعة"
                          >
                            {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                              <option key={h} value={h}>
                                {String(h).padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={2}
                            value={newEvMinute}
                            placeholder="mm"
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              if (val === '') {
                                setNewEvMinute('');
                                return;
                              }
                              const v = Number(val);
                              setNewEvMinute(Number.isFinite(v) ? (v > 59 ? '59' : val.slice(0, 2)) : '');
                            }}
                            className="rounded-lg border border-white/15 bg-black/75 px-2 py-2 text-center text-white placeholder:text-zinc-500 placeholder:font-normal font-mono-tabular text-sm font-bold focus:outline-none focus:border-[#7FFFD4]"
                            aria-label="الدقائق"
                          />
                          <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-lg border border-white/15 bg-black/75">
                            <button
                              type="button"
                              onClick={() => setNewEvPeriod('AM')}
                              className={`rounded-md text-xs font-bold cursor-pointer ${
                                newEvPeriod === 'AM' ? 'bg-[#7FFFD4] text-black' : 'text-zinc-400'
                              }`}
                            >
                              ص
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewEvPeriod('PM')}
                              className={`rounded-md text-xs font-bold cursor-pointer ${
                                newEvPeriod === 'PM' ? 'bg-[#7FFFD4] text-black' : 'text-zinc-400'
                              }`}
                            >
                              م
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => shiftEvMinutes(15)}
                          className="px-2.5 py-2 rounded-lg border border-white/12 bg-white/[0.03] text-zinc-200 hover:border-[#7FFFD4]/45 font-mono-tabular text-xs font-bold cursor-pointer"
                        >
                          +15د
                        </button>
                      </div>

                      {/* Clean Duration Pills */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-zinc-400">المدة</span>
                        <div className="flex items-center gap-1">
                          {[0, 15, 30, 45, 60, 90].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setNewEvDuration(preset)}
                              className={`px-2 py-1 rounded-lg border text-[11px] font-mono-tabular cursor-pointer ${
                                newEvDuration === preset
                                  ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                                  : 'border-white/10 text-zinc-400 hover:text-white'
                              }`}
                            >
                              {preset === 0 ? 'بدون مدة' : `${preset}د`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Live Smart Conflict Detection */}
                    {newEventConflict.hasConflict && (
                      <div className="rounded-xl border border-amber-400/45 bg-amber-400/10 p-3 space-y-2 text-[11px] text-amber-100">
                        <div className="flex items-start gap-1.5 font-semibold text-amber-200">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-300" />
                          <span>تعارض مع جدولك:</span>
                        </div>
                        <ul className="space-y-0.5 pr-4 list-disc text-[11px] text-amber-100/90">
                          {newEventConflict.warnings.map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {newEventConflict.suggestedTime24 && newEventConflict.suggestedTime12Ar && (
                            <button
                              type="button"
                              onClick={() =>
                                applyTime24To12hPicker(
                                  newEventConflict.suggestedTime24!,
                                  setNewEvHour12,
                                  setNewEvMinute,
                                  setNewEvPeriod
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-[#7FFFD4] text-black text-[11px] font-bold hover:bg-[#66eec2] cursor-pointer"
                            >
                              تطبيق {newEventConflict.suggestedTime12Ar}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const titleLabel = newEvTitle.trim() || 'حدث جديد';
                              const pickedLabel = formatTime24To12h(newEventTime24, 'ar');
                              const conflictList = newEventConflict.warnings.join('، ');
                              setNewEventModalOpen(false);
                              onOpenAssistantWithPrompt(
                                `عاوز أضيف حدث «${titleLabel}» يوم ${newEvDate} الساعة ${pickedLabel}${newEvDuration === 0 ? ' بدون مدة' : ` لمدة ${newEvDuration} دقيقة`}، بس النظام نبّهني إن فيه تعارض: ${conflictList}. اقترح عليّ أنسب وقت فاضي بدون تضارب مع الصلاة والنوم وأحداثي.`
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg border border-white/15 bg-black/50 text-zinc-200 hover:text-white text-[11px] font-semibold cursor-pointer"
                          >
                            💬 رتّبه بـ Gemini
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={!newEvTitle.trim() || syncLoading}
                        onClick={() => {
                          if (newEventConflict.hasConflict) {
                            setNewEvConfirmStep(true);
                          } else {
                            void handleConfirmCreateGoogleEvent();
                          }
                        }}
                        className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2] disabled:opacity-40 cursor-pointer"
                      >
                        {syncLoading
                          ? 'جارٍ الإضافة...'
                          : newEventConflict.hasConflict
                            ? 'تجاوز التعارض ومراجعة'
                            : `إضافة (${formatTime24To12h(newEventTime24, language)})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewEventModalOpen(false)}
                        className="min-h-[44px] py-2.5 px-4 rounded-xl border border-white/15 text-zinc-300 cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-4 text-xs">
                  <div className="rounded-xl border border-white/10 bg-black/60 p-3.5 space-y-1.5">
                    <div className="font-bold text-white">{newEvTitle}</div>
                    <div className="font-mono-tabular text-[#7FFFD4]">
                      {newEvDate} · {formatTime24To12h(newEventTime24, language)} ({newEvDuration === 0 ? 'بدون مدة' : `${newEvDuration} دقيقة`})
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={syncLoading}
                      onClick={handleConfirmCreateGoogleEvent}
                      className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2] disabled:opacity-50 cursor-pointer"
                    >
                      {syncLoading ? 'جارٍ الإضافة...' : 'تأكيد الإضافة'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewEvConfirmStep(false)}
                      className="min-h-[44px] py-2.5 px-4 rounded-xl border border-white/15 text-zinc-300 cursor-pointer"
                    >
                      تعديل
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal: Complete Current Hero Task */}
      {confirmHeroCompleteId && nextAlarmBlock && confirmHeroCompleteId === nextAlarmBlock.id && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد إنجاز المهمة الحالية"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmHeroCompleteId(null);
          }}
        >
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[#7FFFD4]/40 bg-[var(--bg-card)] p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 space-y-4 shadow-2xl">
            <h3 className="text-sm md:text-base font-bold text-[#7FFFD4] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>تأكيد إنجاز المهمة الحالية؟</span>
            </h3>
            <div className="rounded-xl border border-white/10 bg-black/50 p-3.5 text-xs md:text-sm space-y-1">
              <div className="font-bold text-white flex items-center gap-2">
                <span>{nextAlarmBlock.emojiPair}</span>
                <span>{nextAlarmDisplay.title}</span>
              </div>
              <div className="font-mono-tabular text-[11px] md:text-xs text-zinc-400">
                {nextAlarmBlock.isAllDay
                  ? 'طوال اليوم'
                  : nextAlarmBlock.durationMin === 0
                    ? formatMinutes12h(nextAlarmBlock.startMin, language)
                    : `${formatMinutes12h(nextAlarmBlock.startMin, language)} – ${formatMinutes12h(nextAlarmBlock.startMin + nextAlarmBlock.durationMin, language)}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = confirmHeroCompleteId;
                  setConfirmHeroCompleteId(null);
                  onToggleComplete(id);
                }}
                className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-[#7FFFD4] text-black text-xs md:text-sm font-bold hover:bg-[#66eec2] cursor-pointer transition-colors"
              >
                نعم، تم الإنجاز ✓
              </button>
              <button
                type="button"
                onClick={() => setConfirmHeroCompleteId(null)}
                className="min-h-[44px] py-2.5 px-4 rounded-xl border border-white/15 text-xs md:text-sm text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal: Delete Event from Google Calendar */}
      {confirmDeleteGoogleEv && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-rose-500/40 bg-[var(--bg-card)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 space-y-3 shadow-2xl">
            <h3 className="text-sm font-bold text-rose-300">
              تأكيد حذف الحدث من Google Calendar
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              هل أنت متأكد من حذف «{confirmDeleteGoogleEv.summary}» نهائياً من Google Calendar؟
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={syncLoading}
                onClick={handleConfirmDeleteGoogleEvent}
                className="flex-1 py-2 px-4 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 cursor-pointer disabled:opacity-50"
              >
                {syncLoading ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteGoogleEv(null)}
                className="py-2 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal: Mutate Google Task */}
      {pendingTaskConfirmation && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-active)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[#7FFFD4]">
              تأكيد تعديل مهمة في Google Tasks
            </h3>
            <div className="rounded-xl border border-white/10 bg-black/60 p-3 text-xs space-y-1">
              <div className="font-bold text-white">{pendingTaskConfirmation.title}</div>
              <div className="text-zinc-400">
                الإجراء:{' '}
                {pendingTaskConfirmation.operation === 'create'
                  ? 'إضافة مهمة جديدة'
                  : pendingTaskConfirmation.operation === 'complete'
                    ? 'تحديد المهمة كمكتملة ✓'
                    : pendingTaskConfirmation.operation === 'reopen'
                      ? 'إعادة فتح المهمة'
                      : 'حذف المهمة نهائياً'}
                {pendingTaskConfirmation.dueDateIso
                  ? ` · الاستحقاق: ${pendingTaskConfirmation.dueDateIso}`
                  : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={syncLoading}
                onClick={handleConfirmTaskMutation}
                className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 ${
                  pendingTaskConfirmation.operation === 'delete'
                    ? 'bg-rose-500 text-white hover:bg-rose-600'
                    : 'bg-[#7FFFD4] text-black hover:bg-[#66eec2]'
                }`}
              >
                {syncLoading ? 'جارٍ التنفيذ...' : 'تأكيد وتنفيذ في Google Tasks'}
              </button>
              <button
                type="button"
                onClick={() => setPendingTaskConfirmation(null)}
                className="py-2 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal: Add Gmail-Extracted Event to Google Calendar */}
      {pendingGmailEventConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-active)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[#7FFFD4] flex items-center gap-2">
              <Mail className="w-4 h-4" />
              <span>تأكيد إضافة موعد من Gmail إلى Google Calendar</span>
            </h3>
            <div className="rounded-xl border border-white/10 bg-black/60 p-3.5 text-xs space-y-1.5">
              <div className="font-bold text-white">
                {pendingGmailEventConfirm.suggestedAction.title}
              </div>
              <div className="font-mono-tabular text-[#7FFFD4]">
                {pendingGmailEventConfirm.dateIso} ·{' '}
                {formatTime24To12h(pendingGmailEventConfirm.startTime24, language)} (
                {pendingGmailEventConfirm.durationMinutes ?? 45} دقيقة)
              </div>
              <div className="text-zinc-400 leading-relaxed">
                {pendingGmailEventConfirm.summaryAr}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={syncLoading}
                onClick={handleConfirmAddGmailEvent}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] cursor-pointer disabled:opacity-50"
              >
                {syncLoading ? 'جارٍ الإضافة...' : 'تأكيد الإضافة إلى التقويم'}
              </button>
              <button
                type="button"
                onClick={() => setPendingGmailEventConfirm(null)}
                className="py-2.5 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal: Schedule Creative Activity in Free Slot on Google Calendar */}
      {pendingCreativeCalendarConfirm && pendingCreativeCalendarConfirm.suggestedSlot && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-active)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[#7FFFD4] flex items-center gap-2">
              <Palette className="w-4 h-4" />
              <span>تأكيد تثبيت النشاط الإبداعي في Google Calendar</span>
            </h3>
            <div className="rounded-xl border border-white/10 bg-black/60 p-3.5 text-xs space-y-1.5">
              <div className="font-bold text-white">
                {pendingCreativeCalendarConfirm.activity.emoji}{' '}
                {pendingCreativeCalendarConfirm.activity.name}
              </div>
              <div className="font-mono-tabular text-[#7FFFD4]">
                اليوم ({todayCairoIso}) ·{' '}
                {formatMinutes12h(pendingCreativeCalendarConfirm.suggestedSlot.startMin, language)} –{' '}
                {formatMinutes12h(pendingCreativeCalendarConfirm.suggestedSlot.endMin, language)} (
                {pendingCreativeCalendarConfirm.activity.sessionMinutes} دقيقة)
              </div>
              <div className="text-zinc-400 leading-relaxed">
                تم اختيار هذه الفترة تلقائياً من أوقاتك الفاضية بعيداً عن الصلوات والنوم وأحداث التقويم المسجلة.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={syncLoading}
                onClick={() => void handleConfirmScheduleCreative()}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] cursor-pointer disabled:opacity-50"
              >
                {syncLoading ? 'جارٍ التثبيت...' : 'تأكيد التثبيت في التقويم'}
              </button>
              <button
                type="button"
                onClick={() => setPendingCreativeCalendarConfirm(null)}
                className="py-2.5 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2-Stage Safe Confirmation Modal: Prevent Accidental Medication Deletion */}
      {pendingDeleteMed && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد حذف العلاج على مرحلتين"
        >
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-rose-500/40 bg-[#0A0C10] p-4 sm:p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>
                    {deleteMedStep === 1
                      ? 'تأكيد حذف العلاج — المرحلة 1 من 2'
                      : 'التأكيد النهائي — المرحلة 2 من 2'}
                  </span>
                </h3>
                <p className="mt-1 text-[11px] text-zinc-400">
                  حماية ضد الحذف بالخطأ من قائمتك اليومية والسحابة.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingDeleteMed(null);
                  setDeleteMedStep(1);
                  setDeleteMedConfirmed(false);
                }}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/60 p-3.5 text-xs space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>💊</span>
                <span>{pendingDeleteMed.name}</span>
              </div>
              {(() => {
                const times =
                  pendingDeleteMed.times24 && pendingDeleteMed.times24.length > 0
                    ? pendingDeleteMed.times24
                    : pendingDeleteMed.time24
                      ? [pendingDeleteMed.time24]
                      : [];
                return times.length > 0 ? (
                  <div className="font-mono-tabular text-[11px] text-zinc-300">
                    المواعيد: {times.map((t24) => formatTime24To12h(t24, language)).join(' · ')}
                  </div>
                ) : null;
              })()}
              {typeof pendingDeleteMed.remainingDoses === 'number' &&
                pendingDeleteMed.remainingDoses >= 0 && (
                  <div className="font-mono-tabular text-[11px] text-zinc-400">
                    الجرعات المتبقية المسجلة: {pendingDeleteMed.remainingDoses}
                  </div>
                )}
            </div>

            {deleteMedStep === 1 ? (
              <div className="space-y-2.5">
                <p className="text-xs text-zinc-300 leading-relaxed">
                  هل تريد حذف هذا العلاج نهائياً وإيقاف جميع تنبيهاته اليومية؟ يمكنك أيضاً ترك شات Gemini يراجع الحذف ويزيل حدثه من التقويم معك.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteMedStep(2);
                      setDeleteMedConfirmed(false);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-300 text-xs font-bold hover:bg-rose-500/30 cursor-pointer transition-colors"
                  >
                    متابعة للحذف (المرحلة 1 من 2) ←
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const medName = pendingDeleteMed.name;
                      setPendingDeleteMed(null);
                      setDeleteMedStep(1);
                      setDeleteMedConfirmed(false);
                      onOpenAssistantWithPrompt(
                        `احذف علاج «${medName}» من قائمة العلاجات والمكملات نهائياً واحذف حدثه المرتبط في Google Calendar لو موجود`
                      );
                    }}
                    className="w-full py-2.5 px-4 rounded-xl border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[#7FFFD4] text-xs font-semibold hover:bg-[#7FFFD4]/20 cursor-pointer transition-colors"
                  >
                    اطلب من شات Gemini الحذف والمراجعة
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingDeleteMed(null);
                      setDeleteMedStep(1);
                      setDeleteMedConfirmed(false);
                    }}
                    className="w-full py-2 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer"
                  >
                    إلغاء — الاحتفاظ بالعلاج
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteMedConfirmed}
                    onChange={(e) => setDeleteMedConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-rose-500 cursor-pointer shrink-0"
                  />
                  <span className="text-xs text-zinc-200 leading-relaxed">
                    نعم، أؤكد حذف <strong className="text-white">«{pendingDeleteMed.name}»</strong> نهائياً من قائمتي والسحابة ولن يتم التذكير به مجدداً.
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!deleteMedConfirmed}
                    onClick={() => {
                      const targetId = pendingDeleteMed.id;
                      setPendingDeleteMed(null);
                      setDeleteMedStep(1);
                      setDeleteMedConfirmed(false);
                      onDeleteMedication(targetId);
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    تأكيد الحذف النهائي
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteMedStep(1);
                      setDeleteMedConfirmed(false);
                    }}
                    className="py-2.5 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer"
                  >
                    رجوع
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Add / Edit Dynamic Habit Modal / Bottom Sheet */}
      {habitModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingHabitId ? 'تعديل العادة' : 'إضافة عادة ديناميكية'}
        >
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[var(--border-active)] bg-[var(--bg-card)] p-4 sm:p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#7FFFD4] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{editingHabitId ? 'تعديل العادة' : 'إضافة عادة جديدة'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setHabitModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1.5">اسم العادة</label>
                <input
                  type="text"
                  value={habitTitle}
                  onChange={(e) => setHabitTitle(e.target.value)}
                  placeholder="مثال: مشي صباحي أو قراءة 20 صفحة"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#7FFFD4]/50"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5">الحالة</label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl border border-white/10 bg-black/50">
                  <button
                    type="button"
                    onClick={() => setHabitStatus('active')}
                    className={`py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      habitStatus === 'active'
                        ? 'bg-[#7FFFD4]/15 text-[#7FFFD4] border border-[#7FFFD4]/35'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    حالية (نشطة اليوم)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHabitStatus('planned')}
                    className={`py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      habitStatus === 'planned'
                        ? 'bg-[#7FFFD4]/15 text-[#7FFFD4] border border-[#7FFFD4]/35'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    مستقبلية (مؤجلة)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5">المرتكز الزمني الديناميكي</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(DYNAMIC_HABIT_ANCHOR_LABELS) as DynamicHabitAnchor[]).map((key) => {
                    const meta = DYNAMIC_HABIT_ANCHOR_LABELS[key];
                    const selected = habitAnchor === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setHabitAnchor(key)}
                        className={`px-2 py-2 rounded-xl border text-[11px] font-medium cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                          selected
                            ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/12 text-[#7FFFD4]'
                            : 'border-white/10 bg-black/40 text-zinc-300 hover:border-white/25'
                        }`}
                      >
                        <span>{meta.emoji}</span>
                        <span className="truncate">{meta.labelAr}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5">المدة (بالدقائق)</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[15, 30, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setHabitDurationMin(mins)}
                      className={`py-2 rounded-xl border font-mono-tabular text-xs font-semibold cursor-pointer transition-colors ${
                        habitDurationMin === mins
                          ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/12 text-[#7FFFD4]'
                          : 'border-white/10 bg-black/40 text-zinc-300 hover:border-white/25'
                      }`}
                    >
                      {mins} د
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5">أيام التكرار (فارغ = يومياً)</label>
                <div className="flex flex-wrap gap-1.5">
                  {ARABIC_WEEKDAYS.map((wd) => {
                    const active = habitDaysOfWeek.includes(wd.id);
                    return (
                      <button
                        key={wd.id}
                        type="button"
                        onClick={() =>
                          setHabitDaysOfWeek((prev) =>
                            prev.includes(wd.id) ? prev.filter((d) => d !== wd.id) : [...prev, wd.id]
                          )
                        }
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer transition-colors ${
                          active
                            ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/12 text-[#7FFFD4] font-semibold'
                            : 'border-white/10 bg-black/40 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {wd.shortAr}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={habitSkipOnFasting}
                  onChange={(e) => setHabitSkipOnFasting(e.target.checked)}
                  className="h-4 w-4 accent-[#7FFFD4] cursor-pointer"
                />
                <span className="text-zinc-200">تخطي تلقائياً في أيام الصيام</span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={!habitTitle.trim()}
                onClick={() => {
                  const cleanTitle = habitTitle.trim();
                  if (!cleanTitle) return;
                  const payload = {
                    title: cleanTitle,
                    status: habitStatus,
                    anchor: habitAnchor,
                    durationMin: habitDurationMin,
                    daysOfWeek: habitDaysOfWeek.length > 0 ? habitDaysOfWeek : undefined,
                    skipOnFasting: habitSkipOnFasting || undefined,
                  };
                  if (editingHabitId && onUpdateHabit) {
                    onUpdateHabit(editingHabitId, payload);
                  } else if (onAddHabit) {
                    onAddHabit(payload);
                  }
                  setHabitModalOpen(false);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] disabled:opacity-40 cursor-pointer"
              >
                {editingHabitId ? 'حفظ التعديل' : 'حفظ العادة'}
              </button>
              {editingHabitId && onDeleteHabit && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteHabit(editingHabitId);
                    setHabitModalOpen(false);
                  }}
                  className="py-2.5 px-3 rounded-xl border border-rose-500/35 text-xs text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                >
                  حذف
                </button>
              )}
              <button
                type="button"
                onClick={() => setHabitModalOpen(false)}
                className="py-2.5 px-4 rounded-xl border border-white/15 text-xs text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
