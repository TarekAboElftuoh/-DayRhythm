import React, { useMemo, useState } from 'react';
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
  Sparkles,
  Volume2,
  VolumeX,
  Calendar,
  RefreshCw,
  ExternalLink,
  Plus,
  X,
  BellOff,
  CalendarClock,
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
} from 'lucide-react';
import { HydrationWeeklyChart } from './HydrationWeeklyChart';
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
  FreeTimeSlot,
  GmailDigestItem,
  GoogleCalendarEventItem,
  GoogleCalendarInfo,
  GoogleTaskItem,
  GoogleTaskList,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  PeriodicRitualStatus,
  PersistedChatMessage,
  PomodoroState,
  PrayerTimeItem,
  QuietModeType,
  ScheduleBlock,
  SilentNotificationItem,
  SoundRepeatMap,
  SoundRepeatSetting,
  SurfaceTheme,
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
  getCairoNowMinutes,
  getCairoTodayIso,
} from '../engines/prayerEngine';
import { ARABIC_WEEKDAYS, formatDurationAr } from '../engines/lifeRhythmEngine';
import { cleanCalendarText, resolveBlockDisplayInfo } from '../services/apiClient';
import { QUIET_MODE_LABELS, t } from '../engines/i18n';

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
  onAddMedication: (input: {
    name: string;
    time24?: string;
    times24?: string[];
    daysOfWeek?: number[];
    doseNote?: string;
    courseEndDate?: string;
    remainingDoses?: number;
    totalDoses?: number;
  }) => void;
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
  liveCountdownSec: number;
  simulateUnder60s: boolean;
  onToggleSimulateUnder60s: () => void;
  calendarConnected: boolean;
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
  meetingModeActive: boolean;
  onToggleMeetingMode: () => void;
  silentNotifications: SilentNotificationItem[];
  onClearSilentNotifications: () => void;
  activeAudioAlert: {
    id: string;
    title: string;
    category: TaskSoundCategory;
    isContinuous?: boolean;
  } | null;
  onAcknowledgeAudioAlert: () => void;
  onTriggerTaskAlert: (
    title: string,
    category: TaskSoundCategory,
    options?: { bypassSanctuary?: boolean }
  ) => void;
  weatherInfo: WeatherHydrationInfo | null;
  gmailDigest: GmailDigestItem[];
  gmailScannedCount: number;
  loadingGmail: boolean;
  gmailNeedsReauth: boolean;
  gmailError: string;
  onFetchGmailDigest: () => Promise<void>;
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
  onToggleMedication,
  onAddMedication,
  onDeleteMedication,
  streaks,
  onToggleDailyCommitmentStreak,
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
  liveCountdownSec,
  simulateUnder60s,
  onToggleSimulateUnder60s,
  calendarConnected,
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
  periodicRituals,
  onCompletePeriodicRitual,
  batteryGuard,
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
  meetingModeActive,
  onToggleMeetingMode,
  silentNotifications,
  onClearSilentNotifications,
  activeAudioAlert,
  onAcknowledgeAudioAlert,
  onTriggerTaskAlert,
  weatherInfo,
  gmailDigest,
  gmailScannedCount,
  loadingGmail,
  gmailNeedsReauth,
  gmailError,
  onFetchGmailDigest,
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
}) => {
  const [showTrash, setShowTrash] = useState(false);
  const [showSilentInbox, setShowSilentInbox] = useState(false);
  const [showQuietAndSounds, setShowQuietAndSounds] = useState(false);
  const [showGmailDrawer, setShowGmailDrawer] = useState(false);
  const [showPeriodicRituals, setShowPeriodicRituals] = useState(false);
  const [showAllCreative, setShowAllCreative] = useState(false);
  const [editingWeight, setEditingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState<string>(String(lifeProfile.weightKg));
  const [showScheduleControls, setShowScheduleControls] = useState(false);
  const [showHydrationSchedule, setShowHydrationSchedule] = useState(false);
  const [showSleepCheckinEdit, setShowSleepCheckinEdit] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<'today' | 'tomorrow' | 'special' | 'done' | 'anchors'>('today');
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
  const [newEvDate, setNewEvDate] = useState(() => getCairoTodayIso());
  const [newEvHour12, setNewEvHour12] = useState<number>(4);
  const [newEvMinute, setNewEvMinute] = useState<number>(0);
  const [newEvPeriod, setNewEvPeriod] = useState<'AM' | 'PM'>('PM');
  const [newEvDuration, setNewEvDuration] = useState<number>(30);
  const [newEvConfirmStep, setNewEvConfirmStep] = useState(false);

  // Quick Add Google Task inline input -> confirmation dialog
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueIso, setNewTaskDueIso] = useState('');

  // Quick Add Flexible Medication / Supplement inline form (supports multi-dose, weekdays, course end & refill count)
  const [showAddMedForm, setShowAddMedForm] = useState(false);
  const [newMedName, setNewMedName] = useState('');
  const [newMedHour12, setNewMedHour12] = useState<number>(8);
  const [newMedMinute, setNewMedMinute] = useState<number>(0);
  const [newMedPeriod, setNewMedPeriod] = useState<'AM' | 'PM'>('AM');
  const [newMedTimes24, setNewMedTimes24] = useState<string[]>([]);
  const [newMedDaysOfWeek, setNewMedDaysOfWeek] = useState<number[]>([]);
  const [newMedNote, setNewMedNote] = useState('');
  const [newMedCourseEnd, setNewMedCourseEnd] = useState('');
  const [newMedRemainingDoses, setNewMedRemainingDoses] = useState('');

  const todayCairoIso = getCairoTodayIso();

  const cardSurface =
    surfaceTheme === 'amoled'
      ? 'bg-[#070708] border-white/10'
      : 'bg-[#0F141B] border-slate-800';

  const activeBlocks = useMemo(
    () => blocks.filter((b) => !b.deleted),
    [blocks]
  );
  const deletedBlocks = useMemo(
    () => blocks.filter((b) => b.deleted),
    [blocks]
  );

  const nowMinutes = getCairoNowMinutes();

  const isBlockFinishedOrPassed = (b: ScheduleBlock): boolean => {
    if (b.completed) return true;
    if (b.isAllDay) return false;
    return b.startMin + b.durationMin <= nowMinutes;
  };

  const remainingTodayBlocks = useMemo(
    () => activeBlocks.filter((b) => !isBlockFinishedOrPassed(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeBlocks, nowMinutes]
  );

  const formatDurationLabel = (totalMin: number): string => {
    const safe = Math.max(0, Math.round(totalMin));
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
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const mo = parts.find((p) => p.type === 'month')?.value ?? '01';
    const day = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${y}-${mo}-${day}`;
  };

  const formatCairoDayHeading = (dateIso: string): string => {
    const d = new Date(`${dateIso}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return dateIso;
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-US', {
      timeZone: 'Africa/Cairo',
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
    if (timelineFilter === 'anchors') {
      return activeBlocks.filter((b) => b.isAnchor);
    }
    return remainingTodayBlocks;
  }, [activeBlocks, finishedTodayBlocks, remainingTodayBlocks, timelineFilter]);

  // Always pick the currently-active or next remaining task today (never loop back to passed 3 AM events!)
  const nextAlarmBlock = useMemo(() => {
    return remainingTodayBlocks[0] ?? null;
  }, [remainingTodayBlocks]);

  const isNextBlockHappeningNow = Boolean(
    nextAlarmBlock &&
      !nextAlarmBlock.isAllDay &&
      nextAlarmBlock.startMin <= nowMinutes &&
      nextAlarmBlock.startMin + nextAlarmBlock.durationMin > nowMinutes
  );

  const nextAlarmDisplay = useMemo(
    () => resolveBlockDisplayInfo(nextAlarmBlock),
    [nextAlarmBlock]
  );

  const countdownMeta = useMemo(() => {
    if (simulateUnder60s) {
      return {
        clock: `00:${String(liveCountdownSec).padStart(2, '0')}`,
        caption: language === 'ar' ? 'أقل من دقيقة' : 'Under 1 min',
      };
    }
    if (!nextAlarmBlock) {
      return {
        clock: '✓',
        caption: language === 'ar' ? 'انتهى اليوم' : 'All done',
      };
    }
    if (isNextBlockHappeningNow) {
      const rem = Math.max(1, nextAlarmBlock.startMin + nextAlarmBlock.durationMin - nowMinutes);
      const h = Math.floor(rem / 60);
      const m = rem % 60;
      return {
        clock: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
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
    const diffMin = Math.max(0, nextAlarmBlock.startMin - nowMinutes);
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return {
      clock: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      caption:
        language === 'ar'
          ? h > 0
            ? `يبدأ بعد ${h} س و ${m} د`
            : `يبدأ بعد ${m} د`
          : h > 0
            ? `Starts in ${h}h ${m}m`
            : `Starts in ${m}m`,
    };
  }, [nextAlarmBlock, isNextBlockHappeningNow, nowMinutes, simulateUnder60s, liveCountdownSec, language]);

  const totalMl = hydrationToday.cupsLogged * dailyRhythmPlan.cupSizeMl;
  const targetMl = hydrationToday.targetCups * dailyRhythmPlan.cupSizeMl;
  const waterPct = Math.min(
    100,
    Math.round((hydrationToday.cupsLogged / Math.max(1, hydrationToday.targetCups)) * 100)
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
    return [...base].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'needsAction' ? -1 : 1;
      return (a.due ?? '9999').localeCompare(b.due ?? '9999');
    });
  }, [googleTasks, selectedTaskListId]);

  const newEventTime24 = useMemo(() => {
    let h24 = newEvHour12 % 12;
    if (newEvPeriod === 'PM') h24 += 12;
    return `${String(h24).padStart(2, '0')}:${String(newEvMinute).padStart(2, '0')}`;
  }, [newEvHour12, newEvMinute, newEvPeriod]);

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

  const quietCountdownText = useMemo(() => {
    if (quietRemainingSec <= 0) return '';
    const m = Math.floor(quietRemainingSec / 60);
    const s = quietRemainingSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [quietRemainingSec]);

  return (
    <div className="mx-auto max-w-[1380px] px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* DEDICATED TOP ENVIRONMENT CARD: Day + Gregorian + Hijri + Live Weather + Conditional Full Moon (13-15 Hijri ONLY) */}
      <section className={`rounded-2xl border p-3.5 sm:p-5 ${cardSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                {language === 'ar' ? todayCalendarMeta.weekdayAr : todayCalendarMeta.weekdayEn}
              </h2>
              <span className="text-xs sm:text-sm text-zinc-300 font-medium">
                {language === 'ar' ? todayCalendarMeta.gregorianAr : todayCalendarMeta.gregorianEn}
              </span>
              {todayCalendarMeta.hijriFullAr && (
                <>
                  <span className="text-zinc-600" aria-hidden="true">·</span>
                  <span className="text-xs sm:text-sm text-zinc-400">
                    {todayCalendarMeta.hijriFullAr}
                  </span>
                </>
              )}
              {todayCalendarMeta.isFullMoonWhiteDay && (
                <>
                  <span className="text-zinc-600" aria-hidden="true">·</span>
                  <span
                    className="text-xs sm:text-sm font-semibold text-amber-200 inline-flex items-center gap-1"
                    title="الأيام البيض (13 و14 و15 هجري) — القمر بدر مكتمل"
                  >
                    <span className="text-base leading-none">🌕</span>
                    <span>ليالي البدر ({todayCalendarMeta.hijriDay} {todayCalendarMeta.hijriMonthAr})</span>
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-400">
              <button
                type="button"
                onClick={() => void onDetectGpsLocation()}
                disabled={isDetectingGps}
                title="الموقع يتحدث تلقائياً بالـ GPS بدون إنترنت — اضغط لإعادة التحقق فوراً"
                className="text-zinc-200 hover:text-[#7FFFD4] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60"
              >
                <MapPin className="w-3.5 h-3.5 text-[#7FFFD4]" />
                <span>
                  {isDetectingGps
                    ? 'جارٍ التحقق...'
                    : travelState.active
                      ? language === 'ar'
                        ? travelState.location.nameAr
                        : travelState.location.nameEn
                      : lifeProfile.currentCityName}
                </span>
              </button>

              {weatherInfo && (
                <>
                  <span className="text-zinc-600" aria-hidden="true">·</span>
                  <span
                    className="font-mono-tabular text-zinc-200"
                    title={`العظمى ${weatherInfo.maxTempC}°C · ${weatherInfo.heatNoteAr}`}
                  >
                    {weatherInfo.icon} {weatherInfo.currentTempC}°C{' '}
                    <span className="text-zinc-400 font-sans">({weatherInfo.conditionAr})</span>
                  </span>
                </>
              )}

              {(wsConnected || firestoreSynced) && (
                <>
                  <span className="text-zinc-600" aria-hidden="true">·</span>
                  <span className="text-[#4ADE80]">
                    {wsConnected ? 'متزامن لحظياً' : 'متزامن سحابياً'}
                  </span>
                </>
              )}

              {silentNotifications.length > 0 && (
                <>
                  <span className="text-zinc-600" aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setShowSilentInbox((v) => !v)}
                    className="text-amber-300 hover:underline font-medium cursor-pointer"
                  >
                    🔕 {silentNotifications.length} إشعار صامت
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Subtle, understated Low Energy / Soft Day Toggle */}
            <button
              type="button"
              onClick={onToggleLowEnergyToday}
              className={`min-h-[34px] px-2.5 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                lowEnergyActive
                  ? 'border-emerald-400/45 bg-emerald-400/12 text-emerald-200'
                  : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-zinc-200 hover:border-white/20'
              }`}
              title="تخفيف هادئ لليوم عند انخفاض الطاقة — يحمي الصلاة والنوم ويمكن التنسيق مع Gemini"
            >
              <Leaf className="w-3.5 h-3.5" />
              <span>{lowEnergyActive ? 'يوم هادئ نشط' : 'يوم هادئ'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleMeetingMode}
              className={`min-h-[34px] px-2.5 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                meetingModeActive
                  ? 'border-amber-400/60 bg-amber-400/15 text-amber-200'
                  : 'border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/20'
              }`}
              title="بضغطة واحدة: كتم الصوت مع اهتزاز وحفظ الإشعارات طوال الاجتماع"
            >
              <MicOff className="w-3.5 h-3.5" />
              <span>{meetingModeActive ? 'إنهاء الاجتماع' : 'اجتماع'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenLifeProfile}
              className="min-h-[34px] px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/[0.02] text-xs font-medium text-zinc-300 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>الثوابت ({memoryCount})</span>
            </button>

            {calendarConnected ? (
              <button
                type="button"
                onClick={() => onRefreshWorkspace()}
                className="min-h-[34px] px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/[0.02] text-xs text-zinc-300 hover:border-[#7FFFD4]/45 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                title={calendarUserEmail}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-[#4ADE80] ${loadingCalendarEvents || loadingTasks ? 'animate-spin' : ''}`}
                />
                <span>تحديث</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onGoogleSignIn().catch(() => {});
                }}
                disabled={isLoggingIn}
                className="min-h-[34px] flex items-center gap-2 rounded-xl border border-[#747775] bg-white px-3 py-1.5 text-xs font-semibold text-[#1F1F1F] hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span>{isLoggingIn ? 'جارٍ الاتصال...' : 'Sign in with Google'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                onToggleSurfaceTheme(surfaceTheme === 'amoled' ? 'obsidian' : 'amoled')
              }
              className="min-h-[34px] w-[34px] rounded-xl border border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/25 flex items-center justify-center cursor-pointer"
              title={surfaceTheme === 'amoled' ? 'تبديل إلى Obsidian' : 'تبديل إلى AMOLED'}
              aria-label="تبديل المظهر"
            >
              {surfaceTheme === 'amoled' ? (
                <Moon className="w-3.5 h-3.5 text-[#7FFFD4]" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-[#7FFFD4]" />
              )}
            </button>
          </div>
        </div>
      </section>

      {/* PROACTIVE TOMORROW ALERT (Only shown automatically when tomorrow is busy or has a special event) */}
      {tomorrowAlert && (
        <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.05] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-semibold text-white">{tomorrowAlert.headlineAr}</div>
              <div className="text-zinc-400 mt-0.5 leading-relaxed">{tomorrowAlert.detailAr}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenAssistantWithPrompt(
                `غداً ${tomorrowAlert.weekdayAr} (${tomorrowAlert.tomorrowIso}) عندي: ${tomorrowAlert.detailAr} — ساعدني أرتّب جدول غداً مسبقاً بدون ما يضغط على الصلاة أو النوم.`
              )
            }
            className="px-3 py-1.5 rounded-xl border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[#7FFFD4] font-semibold hover:bg-[#7FFFD4]/20 cursor-pointer shrink-0 whitespace-nowrap"
          >
            نسّق غداً مع Gemini
          </button>
        </div>
      )}

      {/* SUBTLE LOW-ENERGY / SOFT DAY NOTICE (Only visible when activated — calm & non-intrusive) */}
      {lowEnergyActive && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-100/90">
          <div className="flex items-center gap-2">
            <Leaf className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>
              وضع اليوم الهادئ مفعّل — الصلاة والنوم في أمان، وبقية المهام اختيارية اليوم.
            </span>
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
              تخفيف الجدول مع Gemini
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

      {/* CROSS-DEVICE INSTANT UNDO BAR (Real Google Calendar / Tasks Delete Undo synced across PC <-> Mobile) */}
      {lastDeletedWorkspaceItem && (
        <div className="rounded-2xl border border-[#7FFFD4]/35 bg-[#7FFFD4]/[0.07] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-zinc-100 min-w-0">
            <RotateCcw className="w-3.5 h-3.5 text-[#7FFFD4] shrink-0" />
            <span className="truncate">
              تم حذف {lastDeletedWorkspaceItem.kind === 'task' ? 'المهمة' : 'الحدث'} «{lastDeletedWorkspaceItem.title}» ومزامنته على أجهزتك
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void onUndoWorkspaceDelete()}
              className="px-3 py-1 rounded-lg bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2] cursor-pointer"
            >
              ↩️ تراجع واستعادة
            </button>
            <button
              type="button"
              onClick={onDismissWorkspaceUndo}
              className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              aria-label="إغلاق شريط التراجع"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Automatic Audio Silence Sanctuary Banner (only visible when Prayer, Sleep, or Meeting silence is active) */}
      {activeSanctuary.type !== 'none' && (
        <div className="rounded-2xl border border-amber-400/35 bg-amber-400/[0.08] px-4 py-3 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-3">
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
              onClick={onToggleMeetingMode}
              className="px-3 py-1 rounded-lg bg-amber-400 text-black font-bold text-[11px] cursor-pointer"
            >
              إنهاء وضع الاجتماع
            </button>
          )}
        </div>
      )}

      {/* Preserved Silent Notifications Tray */}
      {showSilentInbox && silentNotifications.length > 0 && (
        <div className="rounded-2xl border border-white/15 bg-[#090C11] p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">
              🔕 الإشعارات المحفوظة صامتاً ({silentNotifications.length})
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
          <div className="divide-y divide-white/10 max-h-44 overflow-y-auto">
            {silentNotifications.map((sn) => (
              <div key={sn.id} className="py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span>{TASK_SOUND_META[sn.soundCategory].icon}</span>
                  <span className="text-zinc-200 truncate">{sn.title}</span>
                  <span className="text-[10px] text-amber-300/80 shrink-0">· {sn.reasonAr}</span>
                </div>
                <span className="font-mono-tabular text-[10px] text-zinc-500 shrink-0">
                  {sn.time12h}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Privacy Alert Banner (Emoji-Only · Direct "شربت فعلاً ✓" confirmation for water alerts) */}
      {activeAudioAlert && (
        <div
          className={`rounded-2xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
            activeAudioAlert.isContinuous
              ? 'border-amber-400/60 bg-amber-400/15'
              : 'border-[#7FFFD4]/45 bg-[#7FFFD4]/12'
          }`}
        >
          <div className="flex items-center gap-2.5 text-sm">
            <span className="text-2xl">{activeAudioAlert.title || TASK_SOUND_META[activeAudioAlert.category].icon}</span>
            <span className="font-mono-tabular text-xs text-zinc-300">
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
                  className="px-3.5 py-1.5 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] cursor-pointer"
                >
                  💧 شربت فعلاً ✓
                </button>
                <button
                  type="button"
                  onClick={onAcknowledgeAudioAlert}
                  className="px-3 py-1.5 rounded-xl border border-white/15 text-zinc-300 text-xs hover:text-white cursor-pointer"
                >
                  لاحقاً
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onAcknowledgeAudioAlert}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  activeAudioAlert.isContinuous
                    ? 'bg-amber-400 text-black hover:bg-amber-300'
                    : 'bg-[#7FFFD4] text-black hover:bg-[#66eec2]'
                }`}
              >
                {activeAudioAlert.isContinuous ? '🔕 إيقاف ✓' : '✓ تم'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bedtime Battery Guard Alert Banner (08:35 PM - 09:10 PM <= 25%) */}
      {batteryGuard.bedtimeGuardTriggered && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3">
          <span>
            🔋 <strong>تنبيه ما قبل النوم (08:35 م – 09:10 م):</strong> بطارية الهاتف عند{' '}
            {batteryGuard.levelPct}% — اشحن الجهاز قبل موعد النوم!
          </span>
        </div>
      )}

      {/* 8-Second Quick Undo Banner */}
      {lastDeletedBlock && shakeUndoSecondsLeft > 0 && (
        <div className="rounded-2xl border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <RotateCcw className="w-4 h-4 text-[#7FFFD4]" />
            <span className="text-white font-semibold">
              تم حذف {lastDeletedBlock.emojiPair} ({shakeUndoSecondsLeft} ث)
            </span>
          </div>
          <button
            type="button"
            onClick={onTriggerShakeUndo}
            className="px-3.5 py-1.5 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] cursor-pointer"
          >
            ↩️ تراجع واسترجاع
          </button>
        </div>
      )}

      {/* FOCAL HERO COMMAND STRIP: Current / Next Task (Full Calendar Info) + Quick Actions + 5 Prayers */}
      <section className={`rounded-2xl border p-3.5 sm:p-5 ${cardSurface}`}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-center">
          {/* Next Task + Full Details + Countdown + Quick 1-Tap Actions */}
          <div className="lg:col-span-6 flex flex-col justify-between gap-3.5 sm:gap-4 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5 sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className={isNextBlockHappeningNow ? 'text-[#4ADE80] font-bold' : 'text-[#7FFFD4] font-semibold'}>
                    {isNextBlockHappeningNow
                      ? 'جارٍ الآن'
                      : language === 'ar'
                        ? 'المهمة الجاية'
                        : 'Up Next'}
                  </span>
                  <span>·</span>
                  <span>
                    {nextAlarmBlock?.isAnchor
                      ? t(language, 'adhanLeadTag')
                      : nextAlarmBlock?.source === 'google_calendar'
                        ? 'Google Calendar'
                        : t(language, 'rhythmTag')}
                  </span>
                </div>
                <div className="mt-2 flex items-start gap-2.5 sm:gap-3">
                  <span className="text-2xl sm:text-3xl shrink-0 leading-none mt-0.5">
                    {nextAlarmBlock?.emojiPair ?? '✅'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-base sm:text-lg font-bold text-white leading-snug break-words">
                      {nextAlarmBlock
                        ? nextAlarmDisplay.title
                        : calendarConnected
                          ? 'أنجزت مهام اليوم المتبقية ✓'
                          : 'بانتظار ربط حساب Google'}
                    </h1>
                    {nextAlarmBlock && nextAlarmDisplay.detail && (
                      <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed line-clamp-2">
                        {nextAlarmDisplay.detail}
                      </p>
                    )}
                    <div className="font-mono-tabular text-xs text-zinc-400 mt-1.5 flex flex-wrap items-center gap-2">
                      <span>
                        {nextAlarmBlock
                          ? nextAlarmBlock.isAllDay
                            ? 'طوال اليوم'
                            : `${formatMinutes12h(nextAlarmBlock.startMin, language)} – ${formatMinutes12h(nextAlarmBlock.startMin + nextAlarmBlock.durationMin, language)} (${formatDurationLabel(nextAlarmBlock.durationMin)})`
                          : 'سجّل الدخول لعرض جدولك الفعلي بنظام 12 ساعة'}
                      </span>
                      {nextAlarmBlock && (
                        <button
                          type="button"
                          onClick={() => onToggleComplete(nextAlarmBlock.id)}
                          className="px-2.5 py-0.5 rounded-lg border border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#4ADE80] text-[11px] font-semibold hover:bg-[#4ADE80]/20 cursor-pointer"
                        >
                          ✓ تم الإنجاز
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-right sm:text-left shrink-0 flex flex-col items-start sm:items-end justify-center">
                <div
                  className={`font-digits text-3xl sm:text-4xl font-bold tracking-tight leading-none whitespace-nowrap ${
                    simulateUnder60s
                      ? 'text-[#FF6B6B]'
                      : isNextBlockHappeningNow
                        ? 'text-[#4ADE80]'
                        : 'text-[#7FFFD4]'
                  }`}
                >
                  {countdownMeta.clock}
                </div>
                <div className="text-[11px] font-medium text-zinc-400 mt-1 whitespace-nowrap">
                  {countdownMeta.caption}
                </div>
              </div>
            </div>

            {/* Instant 1-Tap Actions Bar (Clean: Pomodoro + Gemini Chat · Water logs strictly via alert confirmation) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onOpenPomodoro}
                className={`${
                  aquaTouchMode ? 'min-h-[48px] md:min-h-[40px]' : 'min-h-[40px]'
                } px-3.5 py-2 rounded-xl border border-white/15 bg-black/50 text-zinc-200 hover:border-[#7FFFD4]/50 hover:text-[#7FFFD4] text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap font-mono-tabular`}
              >
                <Timer className="w-3.5 h-3.5 text-[#7FFFD4]" />
                <span>
                  {pomodoro.isRunning
                    ? `${Math.floor(pomodoro.remainingSeconds / 60)}:${String(pomodoro.remainingSeconds % 60).padStart(2, '0')}`
                    : 'بومودورو 25د'}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenAssistant}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[#7FFFD4] hover:bg-[#7FFFD4]/20 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>شات Gemini</span>
              </button>
            </div>
          </div>

          {/* 5 Prayers Strip (Strict 12-Hour · Calibrated for OnePlus 12R 360-412px) */}
          <div className="lg:col-span-6 lg:border-r lg:border-white/10 lg:pr-5 min-w-0">
            <div className="grid grid-cols-5 gap-1 sm:gap-2 text-center">
              {prayers
                .filter((p) => p.isObligatory)
                .map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-white/10 bg-black/45 py-2 px-0.5 sm:px-1.5 min-w-0"
                  >
                    <div className="text-xs sm:text-sm leading-none">{p.emojiPair.split(' ')[1]}</div>
                    <div className="text-[10px] sm:text-[11px] font-medium text-zinc-300 mt-1 truncate">
                      {language === 'ar' ? p.nameAr : p.nameEn}
                    </div>
                    <div className="font-mono-tabular text-[10px] sm:text-[11px] font-semibold text-[#7FFFD4] mt-0.5 whitespace-nowrap">
                      {formatMinutes12h(p.alarmMinutes, language)}
                    </div>
                    <div className="font-mono-tabular text-[8.5px] sm:text-[9px] text-zinc-500 mt-0.5 whitespace-nowrap truncate">
                      <span className="hidden sm:inline">{language === 'ar' ? 'أذان ' : 'Adhan '}</span>
                      {formatMinutes12h(p.adhanMinutes, language)}
                    </div>
                  </div>
                ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <button
                type="button"
                onClick={onToggleAdhanOverrideSilent}
                className={`flex items-center gap-1.5 cursor-pointer ${
                  adhanOverrideSilent ? 'text-[#4ADE80]' : 'text-zinc-400'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>
                  نداء الصلوات الخمس ({adhanOverrideSilent ? 'يتجاوز الصامت والاهتزاز ✓' : 'معطّل'})
                </span>
              </button>
              <button
                type="button"
                onClick={onTestAdhanChime}
                className="text-[#7FFFD4] hover:underline cursor-pointer"
              >
                اختبار نداء الأذان
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Split Grid: Primary Calendar + Tasks FIRST in DOM (optimal on OnePlus 12R & Desktop RTL) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Primary Column (7 cols): REAL Google Calendar + REAL Google Tasks + Saved Gemini Chat Activity */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. Real Google Calendar Timeline Card */}
          <section className={`rounded-2xl border p-5 ${cardSurface}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#7FFFD4]" />
                  <span>
                    {calendarConnected
                      ? 'تقويم Google Calendar الفعلي'
                      : 'التقويم والجدول الشخصي'}
                  </span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {calendarConnected
                    ? `${calendarEvents.length} حدثاً عبر ${calendarList.length || 1} تقويم · نظام 12 ساعة`
                    : 'سجّل الدخول بحساب Google لعرض أحداثك ومهامك الحقيقية'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {calendarConnected && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewEvConfirmStep(false);
                      setNewEventModalOpen(true);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>حدث جديد</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowScheduleControls((v) => !v)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    showScheduleControls
                      ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                      : 'border-white/10 text-zinc-300 hover:border-white/25'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>إعدادات الجدول</span>
                </button>
              </div>
            </div>

            {/* Collapsible Schedule Settings Drawer (clean, user-facing only) */}
            {showScheduleControls && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onToggleIncludePrayerAnchors}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                        includePrayerAnchors
                          ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                          : 'border-white/10 text-zinc-400 hover:text-white'
                      }`}
                    >
                      🕌 مراسي الصلاة (-3 د)
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleFridayMode(!isFridayMode)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                        isFridayMode
                          ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                          : 'border-white/10 text-zinc-400 hover:text-white'
                      }`}
                    >
                      🕌 طقوس الجمعة
                    </button>

                    {isFridayMode && (
                      <button
                        type="button"
                        onClick={() => onToggleBiweeklyPcCleanup(!includeBiweeklyPcCleanup)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer ${
                          includeBiweeklyPcCleanup
                            ? 'border-indigo-400/50 bg-indigo-400/15 text-indigo-200'
                            : 'border-white/10 text-zinc-400'
                        }`}
                      >
                        💻 كل جمعتين 04:15 م
                      </button>
                    )}
                  </div>

                  {calendarConnected && (
                    <button
                      type="button"
                      onClick={() => onGoogleSignOut()}
                      className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] text-zinc-400 hover:text-rose-400 cursor-pointer"
                    >
                      فصل حساب Google
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Single Clean Filter & Quick-Action Toolbar */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/10 overflow-x-auto max-w-full">
                {(
                  [
                    { id: 'today', label: `المتبقي اليوم (${remainingTodayBlocks.length})` },
                    { id: 'tomorrow', label: `غداً (${tomorrowEvents.length})` },
                    { id: 'special', label: `غير الروتيني (${nonRoutineUpcomingEvents.length})` },
                    { id: 'done', label: `المنتهي (${finishedTodayBlocks.length})` },
                    { id: 'anchors', label: 'المراسي' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTimelineFilter(tab.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors whitespace-nowrap ${
                      timelineFilter === tab.id
                        ? 'bg-white/15 text-white font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenCatchUp}
                  className="px-3 py-1.5 rounded-xl border border-[#7FFFD4]/40 text-[#7FFFD4] text-xs font-medium hover:bg-[#7FFFD4]/10 flex items-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" /> زحزحة
                </button>
                {hasUndoSnapshot && (
                  <button
                    type="button"
                    onClick={onUndoReflow}
                    className="px-3 py-1.5 rounded-xl border border-amber-400/40 text-amber-300 text-xs font-medium hover:bg-amber-400/10 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> استعادة
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowTrash((v) => !v)}
                  className="px-3 py-1.5 rounded-xl border border-white/10 text-zinc-300 text-xs hover:border-white/25 flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>المحذوفات ({deletedBlocks.length})</span>
                </button>
              </div>
            </div>

            {/* Clean Trash Drawer (Zero developer Tombstone telemetry) */}
            {showTrash && (
              <div className="my-4 rounded-xl border border-white/15 bg-black/70 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-zinc-200">
                    محذوفات اليوم
                  </span>
                  {deletedBlocks.length > 0 && (
                    <button
                      type="button"
                      onClick={onRestoreAllDeleted}
                      className="text-xs text-[#7FFFD4] hover:underline cursor-pointer"
                    >
                      استعادة الكل بضغطة واحدة
                    </button>
                  )}
                </div>
                {deletedBlocks.length === 0 ? (
                  <p className="text-xs text-zinc-500">لا توجد مهام محذوفة اليوم.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {deletedBlocks.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onRestoreBlock(b.id)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 text-xs text-zinc-200 hover:border-[#7FFFD4] cursor-pointer"
                      >
                        <span>{b.emojiPair}</span>
                        <span className="text-zinc-400">{formatMinutes12h(b.startMin, language)}</span>
                        <RotateCcw className="w-3 h-3 text-[#7FFFD4]" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Disconnected Empty Prompt when not using Offline Demo */}
            {!calendarConnected && !useOfflineDemo && (
              <div className="mt-4 rounded-xl border border-dashed border-[#7FFFD4]/35 bg-[#7FFFD4]/[0.04] p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-zinc-300 space-y-1">
                  <div className="font-bold text-white">
                    التطبيق يعتمد على تقويمك الحقيقي ومهامك وشات Gemini
                  </div>
                  <div className="text-zinc-400">
                    سجّل الدخول بحساب Google بالأعلى لعرض جدولك الفعلي، وتظهر أدناه مراسي الصلوات الخمس فقط.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onToggleOfflineDemo}
                  className="px-3 py-1.5 rounded-lg border border-white/15 text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                >
                  عرض نموذج أوفلاين مؤقت
                </button>
              </div>
            )}

            {/* Tomorrow Prep View (Single Clean Card for Preparing Tomorrow) */}
            {timelineFilter === 'tomorrow' ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">
                      تجهيز الغد · {formatCairoDayHeading(tomorrowCairoIso)}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      {tomorrowEvents.length > 0
                        ? `لديك ${tomorrowEvents.length} موعداً مسجلاً للغد — راجعها لتجهّز يومك مسبقاً.`
                        : 'يوم الغد هادئ ولا توجد مواعيد مسجلة بعد في Google Calendar.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenAssistantWithPrompt(
                        `راجع مواعيد الغد (${tomorrowCairoIso}) من تقويمي وساعدني في التجهيز المسبق وترتيب الأولويات بهدوء.`
                      )
                    }
                    className="px-3 py-1.5 rounded-lg border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[#7FFFD4] text-xs font-semibold hover:bg-[#7FFFD4]/20 cursor-pointer whitespace-nowrap"
                  >
                    جهّز الغد مع Gemini
                  </button>
                </div>

                {/* Tomorrow Hydration Reminder Plan (Always visible in Tomorrow prep tab) */}
                <div className="rounded-xl border border-[#7FFFD4]/20 bg-[#7FFFD4]/[0.04] px-3.5 py-2.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 font-semibold text-[#7FFFD4]">
                      <Droplets className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        تذكيرات المياه لغداً ({dailyRhythmPlan.hydrationSlots.length} تنبيه ·{' '}
                        {dailyRhythmPlan.activeTargetMl} مل)
                      </span>
                    </div>
                    <span className="font-mono-tabular text-[11px] text-zinc-400">
                      {dailyRhythmPlan.hydrationSlots.length > 0
                        ? `من ${formatMinutes12h(dailyRhythmPlan.hydrationSlots[0].timeMinutes, language)} إلى ${formatMinutes12h(
                            dailyRhythmPlan.hydrationSlots[dailyRhythmPlan.hydrationSlots.length - 1].timeMinutes,
                            language
                          )}`
                        : 'مجدول تلقائياً'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {dailyRhythmPlan.hydrationSlots.map((slot) => (
                      <span
                        key={`tmr-water-${slot.cupIndex}`}
                        className="font-mono-tabular text-[10px] px-2 py-0.5 rounded-md border border-white/10 bg-black/45 text-zinc-300"
                        title={`كوب ${slot.cupIndex} (${dailyRhythmPlan.cupSizeMl} مل) · ${slot.windowAr}`}
                      >
                        💧 {formatMinutes12h(slot.timeMinutes, language)}
                      </span>
                    ))}
                  </div>
                </div>

                {!calendarConnected ? (
                  <div className="rounded-xl border border-white/10 bg-black/40 p-6 text-center text-xs text-zinc-400">
                    سجّل الدخول بحساب Google لعرض مواعيد الغد من Google Calendar.
                  </div>
                ) : tomorrowEvents.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/40 p-6 text-center text-xs text-zinc-400">
                    لا توجد أحداث مسجلة لغداً حتى الآن — يمكنك إضافة حدث جديد للغد من الزر بالأعلى.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tomorrowEvents.map((ev) => {
                      const { title, detail } = resolveCalendarEventText(ev);
                      return (
                        <div
                          key={`tmr-${ev.calendarId ?? 'primary'}-${ev.id}`}
                          className="rounded-xl border border-white/10 bg-black/50 px-3.5 py-2.5 flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: ev.calendarColor || '#7FFFD4' }}
                              />
                              <span className="font-semibold text-white break-words">{title}</span>
                              {ev.calendarTitle && ev.calendarTitle !== calendarUserEmail && (
                                <span className="text-[11px] text-zinc-500">
                                  · {ev.calendarTitle}
                                </span>
                              )}
                            </div>
                            {detail && (
                              <div className="text-[11px] text-zinc-300 mt-1 leading-relaxed line-clamp-2">
                                {detail}
                              </div>
                            )}
                            <div className="font-mono-tabular text-[11px] text-[#7FFFD4] mt-1 whitespace-nowrap">
                              {ev.isAllDay
                                ? 'طوال اليوم'
                                : `${formatIsoTo12h(ev.start, language, { includeDate: false })}${
                                    ev.end
                                      ? ` – ${formatIsoTo12h(ev.end, language, { includeDate: false })}`
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
                              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                              title="حذف من Google Calendar"
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
              /* Non-Routine / Special Upcoming Events (Filters out daily repeating routine items over next 14 days) */
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#7FFFD4]" />
                      <span>المواعيد المميزة وغير الروتينية (خلال 14 يوماً)</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      تظهر هنا فقط المواعيد الاستثنائية وغير المتكررة يومياً حتى لا تنساها وسط الروتين.
                    </div>
                  </div>
                </div>

                {!calendarConnected ? (
                  <div className="rounded-xl border border-white/10 bg-black/40 p-6 text-center text-xs text-zinc-400">
                    سجّل الدخول بحساب Google لعرض المواعيد غير الروتينية القادمة من تقويمك.
                  </div>
                ) : nonRoutineUpcomingEvents.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/40 p-6 text-center text-xs text-zinc-400">
                    لا توجد مواعيد غير روتينية مسجلة خلال الأسبوعين القادمين — أيامك تسير على إيقاعك المعتاد.
                  </div>
                ) : (
                  <div className="space-y-2">
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
                          className="rounded-xl border border-white/10 bg-black/50 px-3.5 py-2.5 flex items-start justify-between gap-3 text-xs"
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
                                <span className="text-[11px] text-zinc-500">
                                  · {ev.calendarTitle}
                                </span>
                              )}
                            </div>
                            {detail && (
                              <div className="text-[11px] text-zinc-300 mt-1 leading-relaxed line-clamp-2">
                                {detail}
                              </div>
                            )}
                            <div className="font-mono-tabular text-[11px] text-[#7FFFD4] mt-1 whitespace-nowrap">
                              {ev.isAllDay
                                ? `${dayLabel} · طوال اليوم`
                                : `${formatIsoTo12h(ev.start, language)}${
                                    ev.end
                                      ? ` – ${formatIsoTo12h(ev.end, language, { includeDate: false })}`
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
                              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-md text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                              title="حذف من Google Calendar"
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
            ) : (
              /* Chronological Remaining Today List (Auto-hides passed/completed items + full Calendar details + crisp mobile layout) */
              <div className="divide-y divide-white/[0.06] mt-3">
                {filteredBlocks.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-400">
                    {timelineFilter === 'today'
                      ? 'أنجزت كل مهام اليوم المتبقية ✓ — يمكنك مراجعة المنتهي من التبويب بالأعلى.'
                      : timelineFilter === 'done'
                        ? 'لا توجد مهام منتهية بعد اليوم.'
                        : 'لا توجد أحداث في هذا العرض لليوم.'}
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
                      block.startMin + block.durationMin > nowMinutes;
                    const display = resolveBlockDisplayInfo(block);
                    const showSecondaryCalendarLabel =
                      block.calendarTitle && block.calendarTitle !== calendarUserEmail;

                    return (
                      <div
                        key={block.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-3 px-2 rounded-xl transition-colors hover:bg-white/[0.02] ${
                          isHappeningNow ? 'bg-[#7FFFD4]/[0.05] border border-[#7FFFD4]/25 my-1 px-3' : ''
                        } ${
                          block.completed || isSkipped || isPostponed
                            ? 'opacity-55'
                            : lowEnergyActive && !block.isAnchor
                              ? 'opacity-75'
                              : ''
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => onToggleComplete(block.id)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-[#7FFFD4] cursor-pointer shrink-0 -mt-0.5"
                            title={block.completed ? 'إعادة الفتح' : 'تحديد كمكتمل'}
                          >
                            {block.completed ? (
                              <CheckCircle2 className="w-5 h-5 text-[#4ADE80]" />
                            ) : (
                              <Circle className="w-5 h-5" />
                            )}
                          </button>

                          <span className="text-xl sm:text-2xl shrink-0 leading-none mt-1">
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
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#4ADE80]/20 text-[#4ADE80]">
                                  الآن
                                </span>
                              )}
                              {showSecondaryCalendarLabel && (
                                <span className="text-[11px] text-zinc-400">
                                  · {block.calendarTitle}
                                </span>
                              )}
                              {block.reflowStatus && (
                                <span className="text-[11px] text-amber-300">
                                  ·{' '}
                                  {block.reflowStatus === 'compressed'
                                    ? 'مضغوط'
                                    : block.reflowStatus === 'shifted_evening'
                                      ? 'مرحل للمساء 🌙'
                                      : block.reflowStatus === 'started_now'
                                        ? 'يبدأ الآن ⏩'
                                        : block.reflowStatus === 'postponed_travel'
                                          ? 'مؤجل للسفر 🧳'
                                          : 'تم تخطيه اليوم'}
                                </span>
                              )}
                            </div>

                            {display.detail && (
                              <div className="text-xs text-zinc-400 mt-0.5 leading-relaxed line-clamp-2 break-words">
                                {display.detail}
                              </div>
                            )}

                            <div className="font-mono-tabular text-xs text-zinc-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="whitespace-nowrap text-[#7FFFD4]/90">
                                {block.isAllDay
                                  ? 'طوال اليوم'
                                  : `${formatMinutes12h(block.startMin, language)} – ${formatMinutes12h(block.startMin + block.durationMin, language)}`}
                              </span>
                              {!block.isAllDay && (
                                <span className="whitespace-nowrap text-zinc-500">
                                  ({formatDurationLabel(block.durationMin)})
                                </span>
                              )}
                              {block.isFridayRitual && (
                                <span className="text-zinc-500">· طقوس الجمعة</span>
                              )}
                              {block.source === 'creative' && (
                                <span className="text-cyan-300/80">· وقت إبداعي</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-1 shrink-0 pr-9 sm:pr-0">
                          {block.source === 'creative' && block.creativeActivityId && (
                            <button
                              type="button"
                              onClick={() => {
                                const placement = creativePlacements.find(
                                  (p) => p.activity.id === block.creativeActivityId
                                );
                                if (placement) setPendingCreativeCalendarConfirm(placement);
                              }}
                              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-cyan-400/40 bg-cyan-400/10 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-400/20 cursor-pointer whitespace-nowrap"
                              title="تثبيت هذه الجلسة في وقت فراغك داخل Google Calendar"
                            >
                              📅 تثبيت
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
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-[#7FFFD4] hover:bg-[#7FFFD4]/10 cursor-pointer"
                            title="تجربة تنبيه الخصوصية (إيموجي فقط)"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                          {block.googleHtmlLink && (
                            <a
                              href={block.googleHtmlLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-[#4ADE80] hover:bg-[#4ADE80]/10"
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
                              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                              title="حذف الحدث من Google Calendar"
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
          </section>

          {/* 1b. Creative Activities & Hobbies (HIDDEN when empty — appears automatically once added via Gemini Chat, scales cleanly to daily/weekly/monthly & many items) */}
          {creativePlacements.length > 0 && (
            <section className={`rounded-2xl border p-5 space-y-3.5 ${cardSurface}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Palette className="w-4 h-4 text-[#7FFFD4]" />
                    <span>الأنشطة الإبداعية والهوايات ({creativePlacements.length})</span>
                  </h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    تندمج في أوقاتك الفاضية ({freeSlotsToday.length} فترات متاحة اليوم) · أضف أو عدّل أي نشاط مؤقت أو دائم عبر شات Gemini
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onOpenAssistantWithPrompt(
                      'عاوز أضيف أو أعدّل نشاط إبداعي / هواية جديدة في أوقاتي الفاضية — حدد معايا التكرار (يومي أو أسبوعي أو شهري) وهل هو مؤقت أم مستمر.'
                    )
                  }
                  className="text-[11px] text-[#7FFFD4] hover:underline font-medium cursor-pointer"
                >
                  تنسيق عبر Gemini ←
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
                              <div className="text-[11px] text-zinc-400 font-mono-tabular">
                                {sessionsInPeriod}/{goalInPeriod} {periodLabelAr} ·{' '}
                                {activity.sessionMinutes} د
                                {activity.expiresOnDate ? ` · مؤقت حتى ${activity.expiresOnDate}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onToggleCreativeToday(activity.id)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                                doneToday
                                  ? 'border border-[#4ADE80]/45 bg-[#4ADE80]/12 text-[#4ADE80]'
                                  : 'border border-white/15 bg-black/50 text-zinc-200 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4]'
                              }`}
                            >
                              {doneToday ? 'أُنجز اليوم ✓' : '✓ تسجيل'}
                            </button>
                            {suggestedSlot && !doneToday && (
                              <button
                                type="button"
                                onClick={() => setPendingCreativeCalendarConfirm(placement)}
                                className="px-2.5 py-1 rounded-lg border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[#7FFFD4] text-[11px] font-semibold hover:bg-[#7FFFD4]/20 cursor-pointer"
                              >
                                📅 تثبيت {formatMinutes12h(suggestedSlot.startMin, language)}
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
                  className="w-full pt-2 border-t border-white/10 text-[11px] text-[#7FFFD4] hover:underline flex items-center justify-center gap-1 cursor-pointer"
                >
                  {showAllCreative ? (
                    <>
                      <span>عرض عدد أقل</span>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      <span>عرض كل الأنشطة ({creativePlacements.length})</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              )}
            </section>
          )}

          {/* 2. Real Google Tasks Card */}
          <section className={`rounded-2xl border p-5 space-y-4 ${cardSurface}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-[#7FFFD4]" />
                  <span>مهام Google Tasks الفعلية ({visibleTasks.length})</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  متزامنة مباشرة مع Google Tasks — أي إضافة أو إتمام يمر بتأكيد صريح
                </p>
              </div>

              {calendarConnected && googleTaskLists.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedTaskListId('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer ${
                      selectedTaskListId === 'all'
                        ? 'bg-[#7FFFD4] text-black font-bold'
                        : 'border border-white/10 text-zinc-400'
                    }`}
                  >
                    كل القوائم
                  </button>
                  {googleTaskLists.map((list) => (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => setSelectedTaskListId(list.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer ${
                        selectedTaskListId === list.id
                          ? 'bg-[#7FFFD4] text-black font-bold'
                          : 'border border-white/10 text-zinc-400'
                      }`}
                    >
                      {list.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!calendarConnected ? (
              <div className="rounded-xl border border-white/10 bg-black/50 p-5 text-center space-y-2 text-xs text-zinc-400">
                <div>سجّل الدخول بحساب Google لعرض مهامك من Google Tasks والتحكم فيها مباشرة.</div>
              </div>
            ) : (
              <>
                {/* Quick Add Task Bar -> triggers explicit confirmation modal */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newTaskTitle.trim()) return;
                    setPendingTaskConfirmation({
                      operation: 'create',
                      taskListId:
                        selectedTaskListId !== 'all'
                          ? selectedTaskListId
                          : googleTaskLists[0]?.id ?? '@default',
                      title: newTaskTitle.trim(),
                      dueDateIso: newTaskDueIso || undefined,
                    });
                  }}
                  className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2"
                >
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="اكتب مهمة جديدة لإضافتها إلى Google Tasks..."
                    className="w-full sm:w-auto sm:flex-1 min-w-0 rounded-xl border border-white/10 bg-black/60 px-3.5 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={newTaskDueIso}
                      onChange={(e) => setNewTaskDueIso(e.target.value)}
                      className="flex-1 sm:flex-none min-w-0 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-[#7FFFD4]"
                    />
                    <button
                      type="submit"
                      disabled={!newTaskTitle.trim()}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] disabled:opacity-40 flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة مهمة</span>
                    </button>
                  </div>
                </form>

                {visibleTasks.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/40 p-5 text-center text-xs text-zinc-500">
                    لا توجد مهام مسجلة في هذه القائمة حالياً.
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06] max-h-[300px] overflow-y-auto pr-1">
                    {visibleTasks.map((tk) => {
                      const done = tk.status === 'completed';
                      return (
                        <div
                          key={`${tk.taskListId}-${tk.id}`}
                          className={`py-2.5 px-2 flex items-center justify-between gap-3 ${
                            done ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
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
                              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-zinc-400 hover:text-[#4ADE80] cursor-pointer shrink-0"
                              title={done ? 'إعادة فتح المهمة' : 'تحديد كمكتملة في Google Tasks'}
                            >
                              {done ? (
                                <CheckCircle2 className="w-5 h-5 text-[#4ADE80]" />
                              ) : (
                                <Circle className="w-5 h-5" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <div className={`text-xs font-semibold truncate ${done ? 'line-through text-zinc-400' : 'text-white'}`}>
                                {tk.title}
                              </div>
                              <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-0.5">
                                <span>{tk.taskListTitle}</span>
                                {tk.due && (
                                  <span className="font-mono-tabular text-[#7FFFD4]">
                                    · الاستحقاق: {tk.due.slice(0, 10)}
                                  </span>
                                )}
                              </div>
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
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                            title="حذف المهمة من Google Tasks"
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
          </section>

          {/* Duplicate Gemini chat preview card removed — dedicated Gemini tab + Hero button keep Dashboard crisp */}

          {/* 4. Smart Gmail Digest (Calm Collapsible Strip — expands on click or when appointments are found) */}
          <section className={`rounded-2xl border p-4 ${cardSurface}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowGmailDrawer((v) => !v)}
                className="flex items-center gap-2 text-right cursor-pointer min-w-0"
              >
                <Mail className="w-4 h-4 text-[#7FFFD4] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>ملخص Gmail الذكي</span>
                    {gmailDigest.length > 0 && (
                      <span className="text-[#7FFFD4] font-mono-tabular">({gmailDigest.length})</span>
                    )}
                    {showGmailDrawer || gmailDigest.length > 0 ? (
                      <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    للقراءة فقط · استخراج المواعيد والرحلات بعد تأكيدك
                  </div>
                </div>
              </button>

              {calendarConnected && !gmailNeedsReauth ? (
                <button
                  type="button"
                  disabled={loadingGmail}
                  onClick={() => {
                    setShowGmailDrawer(true);
                    void onFetchGmailDigest();
                  }}
                  className="min-h-[32px] px-3 py-1 rounded-xl border border-white/15 bg-white/[0.03] text-xs font-medium text-zinc-200 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4] flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingGmail ? 'animate-spin' : ''}`} />
                  <span>{loadingGmail ? 'جارٍ الفحص...' : 'فحص البريد'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isLoggingIn}
                  onClick={() => {
                    onGoogleSignIn().catch(() => {});
                  }}
                  className="min-h-[32px] px-3 py-1 rounded-xl border border-amber-400/40 bg-amber-400/10 text-xs font-medium text-amber-200 hover:bg-amber-400/20 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {calendarConnected ? 'تفعيل Gmail' : 'تسجيل الدخول'}
                </button>
              )}
            </div>

            {(showGmailDrawer || gmailDigest.length > 0 || Boolean(gmailError)) && (
              <div className="mt-3 pt-3 border-t border-white/10 space-y-2.5">
                {gmailError && (
                  <div className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                    {gmailError}
                  </div>
                )}

                {gmailDigest.length === 0 ? (
                  <div className="text-xs text-zinc-400">
                    {gmailScannedCount > 0
                      ? `تم فحص ${gmailScannedCount} رسالة حديثة — لا توجد مواعيد أو رحلات جديدة.`
                      : 'اضغط «فحص البريد» ليستخرج Gemini أي موعد أو مقابلة أو رحلة ويقترح إضافتها لتقويمك.'}
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
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
                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500 font-mono-tabular">
                              {item.dateIso && <span>📅 {item.dateIso}</span>}
                              {item.startTime24 && (
                                <span className="text-[#7FFFD4]">
                                  ⏰ {formatTime24To12h(item.startTime24, language)}
                                </span>
                              )}
                              {item.sender && <span className="truncate max-w-[200px]">· {item.sender}</span>}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => setPendingGmailEventConfirm(item)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer transition-colors ${
                              alreadyAdded
                                ? 'border border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#4ADE80] cursor-default'
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
            )}
          </section>
        </div>

        {/* Support Column (5 cols): Dynamic Sleep & Suhoor Architecture, Scientific Hydration & Meds, Quiet Modes */}
        <div className="lg:col-span-5 space-y-5">
          {/* Dynamic Sleep & Suhoor Card (Silently auto-adapted to Prayer Times) */}
          <section className={`rounded-2xl border p-5 space-y-3.5 ${cardSurface}`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Moon className="w-4 h-4 text-[#7FFFD4]" />
                  <span>النوم والسحور وإيقاع اليوم</span>
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  يتكيّف تلقائياً مع مواقيت الصلاة وفصول السنة بدون تدخل يدوي
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenLifeProfile}
                className="px-2.5 py-1.5 rounded-lg border border-white/15 bg-black/50 text-[11px] text-zinc-300 hover:border-[#7FFFD4]/50 hover:text-[#7FFFD4] cursor-pointer shrink-0"
              >
                الثوابت
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div
                className={`rounded-xl border p-2.5 ${
                  dailyRhythmPlan.nightlyRecoveryMin > 0
                    ? 'border-[#7FFFD4]/45 bg-[#7FFFD4]/[0.07]'
                    : 'border-white/10 bg-black/50'
                }`}
              >
                <div className="text-[10px] text-zinc-400">النوم الليلة</div>
                <div className="font-mono-tabular text-xs font-bold text-white mt-0.5">
                  {formatMinutes12h(dailyRhythmPlan.bedtimeMin, language)}
                </div>
                <div
                  className={`text-[10px] mt-0.5 ${
                    dailyRhythmPlan.nightlyRecoveryMin > 0 ? 'text-[#7FFFD4]' : 'text-zinc-500'
                  }`}
                >
                  {dailyRhythmPlan.nightlyRecoveryMin > 0
                    ? `مُبكّر ${dailyRhythmPlan.nightlyRecoveryMin} د للتعويض`
                    : formatDurationAr(dailyRhythmPlan.coreNightSleepMin)}
                </div>
              </div>
              <div
                className={`rounded-xl border p-2.5 ${
                  dailyRhythmPlan.suhoorStartMin !== null
                    ? 'border-amber-400/40 bg-amber-400/[0.08]'
                    : 'border-white/10 bg-black/50'
                }`}
              >
                <div className="text-[10px] text-zinc-400">
                  {dailyRhythmPlan.suhoorStartMin !== null ? '🌙 سحور غداً' : 'الاستيقاظ'}
                </div>
                <div
                  className={`font-mono-tabular text-xs font-bold mt-0.5 ${
                    dailyRhythmPlan.suhoorStartMin !== null ? 'text-amber-300' : 'text-[#7FFFD4]'
                  }`}
                >
                  {formatMinutes12h(dailyRhythmPlan.wakeMin, language)}
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {dailyRhythmPlan.suhoorStartMin !== null
                    ? `قبل الفجر بـ ${lifeProfile.suhoorLeadMinutes} د`
                    : 'قبل الفجر بـ 15 د'}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/50 p-2.5">
                {dailyRhythmPlan.qailulahStartMin !== null ? (
                  <>
                    <div className="text-[10px] text-zinc-400">القيلولة</div>
                    <div className="font-mono-tabular text-xs font-bold text-[#4ADE80] mt-0.5">
                      {formatMinutes12h(dailyRhythmPlan.qailulahStartMin, language)}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {dailyRhythmPlan.qailulahDurationMin} د تعويضية
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[10px] text-zinc-400">الشروق · الغروب</div>
                    <div className="font-mono-tabular text-[11px] font-bold text-[#4ADE80] mt-0.5">
                      {formatMinutes12h(dailyRhythmPlan.sunriseMin, language)}
                    </div>
                    <div className="font-mono-tabular text-[10px] text-zinc-400 mt-0.5">
                      {formatMinutes12h(dailyRhythmPlan.maghribMin, language)} · بلا نوم نهاري
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="text-[11px] text-zinc-300 leading-relaxed">
              {dailyRhythmPlan.sleepAdviceAr}
            </div>

            {dailyRhythmPlan.conflictWarningAr && (
              <div className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
                ⚠️ {dailyRhythmPlan.conflictWarningAr}
              </div>
            )}

            {/* Smooth, Zero-Clutter Sleep Debt Check-In & Gradual Recovery */}
            {dailyRhythmPlan.sleepDebtMinutes > 0 ? (
              <div className="rounded-xl border border-amber-400/35 bg-amber-400/[0.07] p-3 space-y-2 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-amber-200">
                    😴 رصيد نوم ناقص: {formatDurationAr(dailyRhythmPlan.sleepDebtMinutes)}
                  </span>
                  {dailyRhythmPlan.nightlyRecoveryMin > 0 && (
                    <span className="font-mono-tabular text-[10px] text-[#7FFFD4]">
                      تبكير الليلة -{dailyRhythmPlan.nightlyRecoveryMin} د تلقائياً
                    </span>
                  )}
                </div>
                {dailyRhythmPlan.sleepDebtPlanAr && (
                  <p className="text-zinc-300 leading-relaxed">{dailyRhythmPlan.sleepDebtPlanAr}</p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => onLogSleepQuality('good')}
                    className="px-2.5 py-1.5 rounded-lg bg-[#7FFFD4] text-black font-bold text-[10px] hover:bg-[#66eec2] cursor-pointer"
                  >
                    نمت كويس (-{Math.max(dailyRhythmPlan.nightlyRecoveryMin, 30)}د)
                  </button>
                  <button
                    type="button"
                    onClick={() => onLogSleepQuality('reset')}
                    className="px-2.5 py-1.5 rounded-lg border border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#4ADE80] font-semibold text-[10px] hover:bg-[#4ADE80]/20 cursor-pointer"
                  >
                    عوّضت / تصفير ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => onLogSleepQuality('short_30')}
                    className="px-2.5 py-1.5 rounded-lg border border-white/15 bg-black/50 text-zinc-300 text-[10px] hover:text-white cursor-pointer"
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
                      className="px-2.5 py-1.5 rounded-lg border border-indigo-400/40 bg-indigo-400/12 text-indigo-200 font-semibold text-[10px] hover:bg-indigo-400/20 cursor-pointer"
                    >
                      قيلولة 30 د مع Gemini
                    </button>
                  )}
                </div>
              </div>
            ) : lifeProfile.sleepDebtLogDateKey === getCairoTodayIso() && !showSleepCheckinEdit ? (
              <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[#4ADE80]">✓ نومك متوازن اليوم (صفر عجز)</span>
                <button
                  type="button"
                  onClick={() => setShowSleepCheckinEdit(true)}
                  className="text-zinc-500 hover:text-zinc-300 text-[10px] cursor-pointer"
                >
                  تعديل
                </button>
              </div>
            ) : (
              <div className="pt-2 border-t border-white/10 space-y-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-300 font-medium">كيف كان نومك الليلة الماضية؟</span>
                  <span className="text-[10px] text-zinc-500">يُبكّر نوم الليلة تلقائياً لو سهرت</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onLogSleepQuality('good');
                      setShowSleepCheckinEdit(false);
                    }}
                    className="py-1.5 px-2 rounded-lg border border-[#4ADE80]/35 bg-[#4ADE80]/[0.08] text-[#4ADE80] font-semibold text-[10px] hover:bg-[#4ADE80]/15 cursor-pointer"
                  >
                    ممتاز ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onLogSleepQuality('short_30');
                      setShowSleepCheckinEdit(false);
                    }}
                    className="py-1.5 px-2 rounded-lg border border-white/15 bg-black/50 text-zinc-200 text-[10px] hover:border-amber-400/45 hover:text-amber-200 cursor-pointer"
                  >
                    أقل قليلاً (-30د)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onLogSleepQuality('short_60');
                      setShowSleepCheckinEdit(false);
                    }}
                    className="py-1.5 px-2 rounded-lg border border-white/15 bg-black/50 text-zinc-200 text-[10px] hover:border-amber-400/45 hover:text-amber-200 cursor-pointer"
                  >
                    سهر / أرق (-60د)
                  </button>
                </div>
              </div>
            )}

          </section>

          {/* Scientific Hydration Engine (Alert-Confirmed Only · Read-only Weight Reference) */}
          <section className={`rounded-2xl border p-5 ${cardSurface}`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-[#7FFFD4]" />
                  <span>
                    {dailyRhythmPlan.isFastingToday
                      ? 'الماء · حد الصيام الآمن (الإفطار والسحور)'
                      : t(language, 'hydrationTitle')}
                  </span>
                </h2>
                <div className="font-mono-tabular text-xs text-zinc-400 mt-0.5">
                  {totalMl} / {targetMl} ml · {hydrationToday.cupsLogged} / {hydrationToday.targetCups} ({waterPct}%)
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500 mt-1">
                  <span>
                    يُسجَّل الكوب تلقائياً عند تأكيدك من الإشعار · كوب {dailyRhythmPlan.cupSizeMl} مل
                    {dailyRhythmPlan.isFastingToday
                      ? ' · لا ماء بين الفجر والمغرب'
                      : ' · يتوقف قبل النوم بـ 75 د'}
                  </span>
                  <span
                    className="text-zinc-500 font-mono-tabular"
                    title="لتحديث الوزن أخبر شات Gemini مباشرة أو من قائمة الثوابت"
                  >
                    · المرجع {lifeProfile.weightKg} كجم
                  </span>
                  {weatherInfo && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono-tabular ${
                        weatherInfo.heatBonusMl > 0
                          ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                          : 'border-white/10 bg-black/40 text-zinc-400'
                      }`}
                      title={weatherInfo.heatNoteAr}
                    >
                      <span>
                        {weatherInfo.icon} العظمى {weatherInfo.maxTempC}°C
                      </span>
                      {weatherInfo.heatBonusMl > 0 && (
                        <span className="font-bold">+{weatherInfo.heatBonusMl} مل</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Clean Read-Only Cup Progress Segments (Filled strictly when confirmed via water alert) */}
            <div className="mt-4 flex items-center gap-1">
              {hydrationToday.slots.map((filled, idx) => {
                const slotPlan = dailyRhythmPlan.hydrationSlots[idx];
                return (
                  <div
                    key={idx}
                    title={
                      slotPlan
                        ? `كوب ${idx + 1} (${formatMinutes12h(slotPlan.timeMinutes, language)} · ${slotPlan.windowAr})`
                        : `كوب ${idx + 1} (${(idx + 1) * dailyRhythmPlan.cupSizeMl} مل)`
                    }
                    className={`flex-1 h-7 rounded-md font-mono-tabular text-[10px] font-bold flex items-center justify-center transition-colors ${
                      filled
                        ? 'bg-[#7FFFD4] text-black'
                        : 'bg-white/[0.06] text-zinc-500'
                    }`}
                  >
                    {idx + 1}
                  </div>
                );
              })}
            </div>

            {/* Active Water Cup Reminder Bar (Fires sound + Secondary-Monitor alert with "شربت فعلاً ✓") */}
            <div className="mt-3 rounded-xl border border-white/10 bg-black/50 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-zinc-200 min-w-0">
                <Bell
                  className={`w-3.5 h-3.5 shrink-0 ${
                    waterRemindersEnabled ? 'text-[#7FFFD4]' : 'text-zinc-500'
                  }`}
                />
                {nextWaterSlot ? (
                  <span className="truncate font-mono-tabular">
                    التنبيه القادم (كوب #{nextWaterSlot.cupIndex}):{' '}
                    <strong className="text-[#7FFFD4]">
                      {formatMinutes12h(nextWaterSlot.timeMinutes, language)}
                    </strong>
                    <span className="text-zinc-400"> · {nextWaterSlot.windowAr}</span>
                  </span>
                ) : (
                  <span className="text-[#4ADE80] font-semibold">
                    أتممت كل أكواب اليوم ✓
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onToggleWaterReminders}
                  className={`px-2 py-1 rounded-lg border text-[10px] font-semibold cursor-pointer ${
                    waterRemindersEnabled
                      ? 'border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#4ADE80]'
                      : 'border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  {waterRemindersEnabled ? 'تنبيه كل كوب مفعّل' : 'التنبيه متوقف'}
                </button>
                {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
                  <button
                    type="button"
                    onClick={() => void onRequestNotificationPermission()}
                    className="px-2 py-1 rounded-lg border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[10px] font-semibold text-[#7FFFD4] hover:bg-[#7FFFD4]/20 cursor-pointer"
                  >
                    تفعيل إشعارات الجهاز
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
                  className="px-2 py-1 rounded-lg border border-white/10 text-[10px] text-zinc-400 hover:text-[#7FFFD4] cursor-pointer"
                  title="تجربة تنبيه كوب الماء والتأكيد منه الآن"
                >
                  تجربة التنبيه 🔊
                </button>
              </div>
            </div>

            {/* Collapsible Scientific Water Timing Distribution */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowHydrationSchedule((v) => !v)}
                className="text-[11px] text-[#7FFFD4] hover:underline cursor-pointer"
              >
                {showHydrationSchedule
                  ? 'إخفاء توزيع مواعيد الأكواب العلمية ▲'
                  : `عرض التوزيع العلمي لـ ${dailyRhythmPlan.activeTargetCups} كوب اليوم (12 ساعة) ▼`}
              </button>

              {showHydrationSchedule && (
                <div className="mt-2 grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {dailyRhythmPlan.hydrationSlots.map((slot, idx) => {
                    const done = hydrationToday.slots[idx];
                    return (
                      <div
                        key={slot.cupIndex}
                        className={`rounded-lg border px-2.5 py-1.5 text-right text-[11px] ${
                          done
                            ? 'border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#4ADE80]'
                            : 'border-white/10 bg-black/40 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 font-mono-tabular">
                          <span className="font-bold">
                            {done ? '✓ ' : ''}كوب {slot.cupIndex}
                          </span>
                          <span>{formatMinutes12h(slot.timeMinutes, language)}</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                          {slot.windowAr}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Universal Flexible Medications & Supplements (Supports Multi-Dose, Specific Weekdays & Scientific Gemini Advice) */}
            <div className="mt-4 pt-3.5 border-t border-white/10 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-white">
                  💊 العلاجات والمكملات الغذائية
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenAssistantWithPrompt(
                        'عاوز أضيف علاج أو مكمل غذائي جديد — شوف جدولي في التقويم وأيامي وابحث علمياً عن أنسب ميعاد بدون تضارب قبل ما نثبته'
                      )
                    }
                    className="text-[11px] text-[#7FFFD4] hover:underline cursor-pointer"
                    title="استشر Gemini علمياً قبل تثبيت أي مكمل أو دواء جديد"
                  >
                    استشارة علمية بـ Gemini
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddMedForm((v) => !v)}
                    className="px-2 py-1 rounded-lg border border-white/15 bg-black/50 text-[11px] text-zinc-200 hover:border-[#7FFFD4]/50 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>إضافة</span>
                  </button>
                </div>
              </div>

              {showAddMedForm && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newMedName.trim()) return;
                    let h24 = newMedHour12 % 12;
                    if (newMedPeriod === 'PM') h24 += 12;
                    const currentPicked = `${String(h24).padStart(2, '0')}:${String(newMedMinute).padStart(2, '0')}`;
                    const finalTimes =
                      newMedTimes24.length > 0 ? newMedTimes24 : [currentPicked];
                    const parsedRem = newMedRemainingDoses.trim()
                      ? Math.max(0, Math.min(500, Math.round(Number(newMedRemainingDoses))))
                      : -1;
                    onAddMedication({
                      name: newMedName.trim(),
                      time24: finalTimes[0],
                      times24: finalTimes,
                      daysOfWeek: newMedDaysOfWeek,
                      doseNote: newMedNote.trim() || '',
                      courseEndDate: newMedCourseEnd.trim() || '',
                      remainingDoses: Number.isFinite(parsedRem) ? parsedRem : -1,
                      totalDoses: Number.isFinite(parsedRem) ? parsedRem : -1,
                    });
                    setNewMedName('');
                    setNewMedNote('');
                    setNewMedTimes24([]);
                    setNewMedDaysOfWeek([]);
                    setNewMedCourseEnd('');
                    setNewMedRemainingDoses('');
                    setShowAddMedForm(false);
                  }}
                  className="rounded-xl border border-white/15 bg-black/70 p-3 space-y-2.5 text-xs"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newMedName}
                      onChange={(e) => setNewMedName(e.target.value)}
                      placeholder="اسم المكمل أو العلاج (مثال: كرياتين / فيتامين د)"
                      className="rounded-lg border border-white/15 bg-black px-2.5 py-1.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
                    />
                    <input
                      type="text"
                      value={newMedNote}
                      onChange={(e) => setNewMedNote(e.target.value)}
                      placeholder="ملاحظة (مثال: بعد التمرين أو مع وجبة)"
                      className="rounded-lg border border-white/15 bg-black px-2.5 py-1.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
                    />
                  </div>

                  {/* Optional Course End Date & Refill Dose Counter */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-black px-2.5 py-1 text-[11px] text-zinc-400">
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
                      placeholder="عدد الجرعات بالعبوة (اختياري، مثل 30)"
                      className="rounded-lg border border-white/15 bg-black px-2.5 py-1.5 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4] font-mono-tabular"
                    />
                  </div>

                  {/* Multi-dose time builder */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-zinc-400">ميعاد الجرعة:</span>
                      <select
                        value={newMedHour12}
                        onChange={(e) => setNewMedHour12(Number(e.target.value))}
                        className="rounded-lg border border-white/15 bg-black px-2 py-1 text-white font-mono-tabular"
                      >
                        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                          <option key={h} value={h}>
                            {String(h).padStart(2, '0')}
                          </option>
                        ))}
                      </select>
                      <select
                        value={newMedMinute}
                        onChange={(e) => setNewMedMinute(Number(e.target.value))}
                        className="rounded-lg border border-white/15 bg-black px-2 py-1 text-white font-mono-tabular"
                      >
                        {[0, 15, 30, 45].map((m) => (
                          <option key={m} value={m}>
                            {String(m).padStart(2, '0')}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setNewMedPeriod((p) => (p === 'AM' ? 'PM' : 'AM'))}
                        className="px-2.5 py-1 rounded-lg border border-white/15 bg-black text-[#7FFFD4] font-bold cursor-pointer"
                      >
                        {newMedPeriod === 'AM' ? 'ص' : 'م'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          let h24 = newMedHour12 % 12;
                          if (newMedPeriod === 'PM') h24 += 12;
                          const t24 = `${String(h24).padStart(2, '0')}:${String(newMedMinute).padStart(2, '0')}`;
                          setNewMedTimes24((prev) =>
                            prev.includes(t24) ? prev : [...prev, t24].slice(0, 6)
                          );
                        }}
                        className="px-2 py-1 rounded-lg border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[10px] text-[#7FFFD4] font-semibold cursor-pointer"
                      >
                        + إضافة جرعة
                      </button>
                    </div>
                    {newMedTimes24.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {newMedTimes24.map((t24) => (
                          <span
                            key={t24}
                            className="inline-flex items-center gap-1 rounded-md border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 px-2 py-0.5 text-[10px] font-mono-tabular text-[#7FFFD4]"
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

                  {/* Specific days selector (empty = every day) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>الأيام (اتركها فارغة لكل يوم، أو اختر أياماً محددة مثل الجيم):</span>
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
                            className={`px-2 py-1 rounded-lg border text-[10px] cursor-pointer ${
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

                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddMedForm(false)}
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
                </form>
              )}

              <div className="space-y-2">
                {medications.map((med) => {
                  const doseTimes =
                    med.times24 && med.times24.length > 0
                      ? med.times24
                      : med.time24
                        ? [med.time24]
                        : [];
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
                      className={`rounded-xl border p-2.5 text-xs transition-colors ${
                        takenToday
                          ? 'border-[#4ADE80]/45 bg-[#4ADE80]/10 text-[#4ADE80]'
                          : 'border-white/10 bg-black/45 text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleMedication(med.id)}
                          className="flex items-center gap-1.5 cursor-pointer text-right min-w-0 flex-1"
                          title={med.doseNote || undefined}
                        >
                          <span>💊</span>
                          <span className="font-semibold truncate">{med.name}</span>
                          {doseTimes.length === 1 && (
                            <span className="font-mono-tabular text-[10px] opacity-80 shrink-0">
                              · {formatTime24To12h(doseTimes[0], language)}
                            </span>
                          )}
                          {daysLabel && (
                            <span className="text-[10px] text-zinc-400 shrink-0">
                              ({daysLabel})
                            </span>
                          )}
                          {takenToday && <span className="font-bold shrink-0">✓</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteMedication(med.id)}
                          className="p-1 text-zinc-500 hover:text-rose-400 cursor-pointer shrink-0"
                          title={`حذف ${med.name}`}
                          aria-label={`حذف ${med.name}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {doseTimes.length > 1 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {doseTimes.map((t24) => {
                            const doseDone = takenDoses.includes(t24);
                            return (
                              <button
                                key={t24}
                                type="button"
                                onClick={() => onToggleMedication(med.id, t24)}
                                className={`px-2 py-1 rounded-lg border font-mono-tabular text-[10px] cursor-pointer transition-colors ${
                                  doseDone
                                    ? 'border-[#4ADE80]/50 bg-[#4ADE80]/20 text-[#4ADE80] font-bold'
                                    : 'border-white/15 bg-black/60 text-zinc-300 hover:border-[#7FFFD4]/50'
                                }`}
                              >
                                {formatTime24To12h(t24, language)} {doseDone ? '✓' : '○'}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {doseTimes.length === 0 && (
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                          <span>بدون ميعاد ثابت بعد</span>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenAssistantWithPrompt(
                                `عاوز أحدد أنسب ميعاد علمي لـ «${med.name}» — راجع تقويمي والذاكرة ولو مش متسجل ابحث علمياً واقترح عليّ التوقيت الأفضل قبل التثبيت`
                              )
                            }
                            className="text-[#7FFFD4] hover:underline font-semibold cursor-pointer"
                          >
                            اسأل Gemini عن الميعاد العلمي ←
                          </button>
                        </div>
                      )}

                      {((typeof med.remainingDoses === 'number' && med.remainingDoses >= 0) ||
                        Boolean(med.courseEndDate)) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono-tabular text-zinc-400">
                          {typeof med.remainingDoses === 'number' && med.remainingDoses >= 0 && (
                            <span
                              className={
                                med.remainingDoses === 0
                                  ? 'text-rose-400 font-semibold'
                                  : med.remainingDoses <= 3
                                    ? 'text-amber-300 font-semibold'
                                    : 'text-zinc-400'
                              }
                            >
                              {med.remainingDoses === 0
                                ? 'نفدت العبوة (0 جرعة)'
                                : `متبقٍ ${med.remainingDoses}${med.totalDoses && med.totalDoses > 0 ? `/${med.totalDoses}` : ''} جرعة`}
                            </span>
                          )}
                          {med.courseEndDate && (
                            <span
                              className={
                                med.courseEndDate < todayCairoIso
                                  ? 'text-amber-300'
                                  : 'text-zinc-500'
                              }
                            >
                              {typeof med.remainingDoses === 'number' && med.remainingDoses >= 0
                                ? '· '
                                : ''}
                              {med.courseEndDate < todayCairoIso
                                ? `انتهى الكورس (${med.courseEndDate})`
                                : `نهاية الكورس ${med.courseEndDate}`}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <HydrationWeeklyChart hydrationHistory={hydrationHistory} />
          </section>

          {/* Calm Collapsible Audio, Quiet Modes & Configurable Alert Ring Repeats (No Auto-Revert Timer Clutter) */}
          <section className={`rounded-2xl border p-4 ${cardSurface}`}>
            <button
              type="button"
              onClick={() => setShowQuietAndSounds((v) => !v)}
              className="w-full flex items-center justify-between gap-2 text-right cursor-pointer"
            >
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <BellOff className="w-4 h-4 text-[#7FFFD4]" />
                  <span>الأصوات وتكرار الرنين والهدوء</span>
                </h2>
                <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                  كتم تلقائي: الصلاة {lifeProfile.prayerSilenceMinutes} د (الجمعة 50 د) · الفجر{' '}
                  {lifeProfile.fajrSilenceMinutes} د · وقت النوم كاملاً
                </div>
                {activeOneTimeSilenceMinutes >= 5 && (
                  <div className="text-[10px] text-amber-300 mt-0.5">
                    تعديل مؤقت لمرة واحدة: {activeOneTimeSilenceMinutes} د (يعود للوضع الطبيعي تلقائياً)
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 text-xs text-zinc-400">
                {quietMode !== 'normal' && quietCountdownText && (
                  <span className="font-mono-tabular text-amber-300">{quietCountdownText}</span>
                )}
                {showQuietAndSounds ? (
                  <ChevronUp className="w-4 h-4 text-[#7FFFD4]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-500" />
                )}
              </div>
            </button>

            {showQuietAndSounds && (
              <div className="mt-4 pt-3.5 border-t border-white/10 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>وضع الهدوء السريع</span>
                    <span className="text-zinc-500">
                      {alertSliderLinked ? 'Alert Slider مربوط' : 'Alert Slider مستقل'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['normal', 'mute_audio', 'vibrate_only', 'silent_all'] as const).map(
                      (qm) => {
                        const active = quietMode === qm;
                        return (
                          <button
                            key={qm}
                            type="button"
                            onClick={() => onSetQuietMode(qm, 0)}
                            className={`rounded-xl border p-2.5 text-right transition-colors cursor-pointer ${
                              active
                                ? 'border-[#7FFFD4] bg-[#7FFFD4]/10'
                                : 'border-white/10 bg-black/40 hover:border-white/25'
                            }`}
                          >
                            <div className="text-xs font-semibold text-white">
                              {QUIET_MODE_LABELS[qm][language]}
                            </div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              {language === 'ar'
                                ? QUIET_MODE_LABELS[qm].descAr
                                : QUIET_MODE_LABELS[qm].descEn}
                            </div>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* Configurable Alert Ring Repeats (1x, 2x, 3x, 4x, or ∞ Continuous until Stopped) */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-zinc-200">
                      تكرار رنين التنبيهات (أو مستمر حتى الإيقاف)
                    </span>
                    <span className="text-[10px] text-zinc-500">∞ = رنين مستمر</span>
                  </div>
                  <div className="divide-y divide-white/[0.06]">
                    {(
                      [
                        'sleep_suhoor',
                        'prayer',
                        'water',
                        'medication',
                        'meeting_event',
                        'focus_work',
                        'walk_health',
                      ] as const
                    ).map((cat) => {
                      const meta = TASK_SOUND_META[cat];
                      const currentRepeat = soundRepeats[cat] ?? 1;
                      const repeatOptions: SoundRepeatSetting[] = [1, 2, 3, 4, 'continuous'];
                      return (
                        <div
                          key={cat}
                          className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onTriggerTaskAlert(meta.labelAr, cat, { bypassSanctuary: true })
                            }
                            className="flex items-center gap-1.5 text-zinc-200 hover:text-[#7FFFD4] cursor-pointer"
                            title="تشغيل وتجربة النغمة الآن"
                          >
                            <span>{meta.icon}</span>
                            <span className="font-medium">{meta.labelAr}</span>
                            <Volume2 className="w-3 h-3 text-zinc-500" />
                          </button>

                          <div className="flex items-center gap-1 font-mono-tabular">
                            {repeatOptions.map((opt) => {
                              const selected = currentRepeat === opt;
                              return (
                                <button
                                  key={String(opt)}
                                  type="button"
                                  onClick={() => onUpdateSoundRepeat(cat, opt)}
                                  className={`px-2 py-0.5 rounded-md border text-[10px] cursor-pointer transition-colors ${
                                    selected
                                      ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                                      : 'border-white/10 text-zinc-400 hover:text-zinc-200'
                                  }`}
                                  title={
                                    opt === 'continuous'
                                      ? 'رنين مستمر حتى تضغط إيقاف أو تهز الهاتف'
                                      : `تكرار ${opt} مرة`
                                  }
                                >
                                  {opt === 'continuous' ? '∞' : `${opt}×`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Compact Habits & Collapsible Periodic Maintenance Card */}
          <section className={`rounded-2xl border p-4 space-y-3 ${cardSurface}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#7FFFD4]" />
                <span>{t(language, 'dualStreaksTitle')}</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowPeriodicRituals((v) => !v)}
                className="text-[11px] text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer"
              >
                <span>المهام الدورية ({periodicRituals.length})</span>
                {showPeriodicRituals ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onToggleDailyCommitmentStreak}
                className={`rounded-xl border p-3 text-right transition-colors cursor-pointer ${
                  streaks.dailyCommitmentDoneToday
                    ? 'border-[#7FFFD4]/45 bg-[#7FFFD4]/[0.08]'
                    : 'border-white/10 bg-black/40 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base">📖 🌱</span>
                  <span className="font-mono-tabular text-base font-bold text-[#7FFFD4]">
                    {streaks.dailyCommitmentDays}
                  </span>
                </div>
                <div className="text-xs font-semibold text-white mt-1">
                  الورد والالتزام اليومي
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  {streaks.dailyCommitmentDoneToday ? 'مكتمل اليوم ✓' : 'تأكيد الإنجاز'}
                </div>
              </button>

              <div
                className={`rounded-xl border p-3 text-right ${
                  streaks.waterTargetDoneToday
                    ? 'border-[#4ADE80]/45 bg-[#4ADE80]/[0.08]'
                    : 'border-white/10 bg-black/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base">💧 🥤</span>
                  <span className="font-mono-tabular text-base font-bold text-[#4ADE80]">
                    {streaks.waterTargetDays}
                  </span>
                </div>
                <div className="text-xs font-semibold text-white mt-1">
                  سلسلة الترطيب
                </div>
                <div className="font-mono-tabular text-[10px] text-zinc-400 mt-0.5">
                  {hydrationToday.cupsLogged}/{hydrationToday.targetCups} ({waterPct}%)
                </div>
              </div>
            </div>

            {(showPeriodicRituals ||
              periodicRituals.some((r) => r.daysSinceLast >= r.intervalDays)) && (
              <div className="divide-y divide-white/[0.06] pt-1 border-t border-white/10">
                {periodicRituals.map((rit) => {
                  const dueSoon = rit.daysSinceLast >= rit.intervalDays;
                  return (
                    <div
                      key={rit.id}
                      className="py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base">{rit.emojiPair}</span>
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            {language === 'ar' ? rit.titleAr : rit.titleEn}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono-tabular">
                            {rit.timeLabelAr} · منذ {rit.daysSinceLast} / {rit.intervalDays} يوم
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onCompletePeriodicRitual(rit.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer shrink-0 ${
                          dueSoon
                            ? 'bg-[#7FFFD4] text-black'
                            : 'border border-white/15 text-zinc-300 hover:border-[#4ADE80]/50'
                        }`}
                      >
                        تم الآن ✓
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Quick Create Google Calendar Event Modal (Strict 12-hour input + Explicit Confirmation) */}
      {newEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[#7FFFD4]/40 bg-[#090C11] p-4 sm:p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#7FFFD4]" />
                <span>إضافة حدث إلى Google Calendar (نظام 12 ساعة)</span>
              </h3>
              <button
                type="button"
                onClick={() => setNewEventModalOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!newEvConfirmStep ? (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-zinc-400 mb-1">عنوان الحدث (يفضل زوج إيموجي)</label>
                  <input
                    type="text"
                    value={newEvTitle}
                    onChange={(e) => setNewEvTitle(e.target.value)}
                    placeholder="مثال: 💼 🔥 جلسة عمل أو 🩺 💊 موعد دكتور"
                    className="w-full rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-zinc-400 mb-1">التاريخ</label>
                    <input
                      type="date"
                      value={newEvDate}
                      onChange={(e) => setNewEvDate(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">المدة (دقائق)</label>
                    <select
                      value={newEvDuration}
                      onChange={(e) => setNewEvDuration(Number(e.target.value))}
                      className="w-full rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-white"
                    >
                      {[15, 30, 45, 60, 90, 120].map((d) => (
                        <option key={d} value={d}>
                          {d} دقيقة
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">وقت البداية (نظام 12 ساعة ص / م)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={newEvHour12}
                      onChange={(e) => setNewEvHour12(Number(e.target.value))}
                      className="rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-white font-mono-tabular"
                    >
                      {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newEvMinute}
                      onChange={(e) => setNewEvMinute(Number(e.target.value))}
                      className="rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-white font-mono-tabular"
                    >
                      {[0, 15, 30, 45].map((m) => (
                        <option key={m} value={m}>
                          {String(m).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl border border-white/15 bg-black/70">
                      <button
                        type="button"
                        onClick={() => setNewEvPeriod('AM')}
                        className={`rounded-lg text-xs font-bold cursor-pointer ${
                          newEvPeriod === 'AM' ? 'bg-[#7FFFD4] text-black' : 'text-zinc-400'
                        }`}
                      >
                        ص
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewEvPeriod('PM')}
                        className={`rounded-lg text-xs font-bold cursor-pointer ${
                          newEvPeriod === 'PM' ? 'bg-[#7FFFD4] text-black' : 'text-zinc-400'
                        }`}
                      >
                        م
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    disabled={!newEvTitle.trim()}
                    onClick={() => setNewEvConfirmStep(true)}
                    className="flex-1 py-2.5 rounded-xl bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2] disabled:opacity-40 cursor-pointer"
                  >
                    مراجعة وتأكيد الإضافة
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewEventModalOpen(false)}
                    className="py-2.5 px-4 rounded-xl border border-white/15 text-zinc-300 cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="rounded-xl border border-white/10 bg-black/60 p-3.5 space-y-1.5">
                  <div className="font-bold text-white">{newEvTitle}</div>
                  <div className="font-mono-tabular text-[#7FFFD4]">
                    {newEvDate} · {formatTime24To12h(newEventTime24, language)} ({newEvDuration} دقيقة)
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={syncLoading}
                    onClick={handleConfirmCreateGoogleEvent}
                    className="flex-1 py-2.5 rounded-xl bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2] disabled:opacity-50 cursor-pointer"
                  >
                    {syncLoading ? 'جارٍ الإضافة...' : 'تأكيد الإنشاء في Google Calendar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewEvConfirmStep(false)}
                    className="py-2.5 px-4 rounded-xl border border-white/15 text-zinc-300 cursor-pointer"
                  >
                    تعديل
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal: Delete Event from Google Calendar */}
      {confirmDeleteGoogleEv && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-rose-500/40 bg-[#090C11] p-4 sm:p-5 space-y-4 shadow-2xl">
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[#7FFFD4]/40 bg-[#090C11] p-4 sm:p-5 space-y-4 shadow-2xl">
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[#7FFFD4]/40 bg-[#090C11] p-4 sm:p-5 space-y-4 shadow-2xl">
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
          <div className="w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-[#7FFFD4]/40 bg-[#090C11] p-4 sm:p-5 space-y-4 shadow-2xl">
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
    </div>
  );
};
