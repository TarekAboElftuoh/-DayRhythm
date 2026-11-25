export type DayMode = 'normal' | 'fasting';

export type FastingExemption = 'none' | 'travel' | 'health';

export type SurfaceTheme = 'amoled' | 'obsidian';

export type CapsuleOrientation = 'horizontal' | 'vertical';

export type CapsuleSize = 'sm' | 'md' | 'lg';

export interface UiPrefs {
  selectedLogoId: string;
  capsuleOrientation: CapsuleOrientation;
  capsuleSize: CapsuleSize;
  cloudApiUrl?: string;
}

export type AppLanguage = 'ar' | 'en';

export type ActiveTab = 'dashboard' | 'mobile' | 'overlay' | 'assistant';

export type TravelGroup = 'A_FIXED' | 'B_WORK' | 'C_PORTABLE' | 'ANCHOR';

export type TravelDurationMode = 'today' | 'tomorrow' | 'manual';

export type CatchUpDecision = 'start_now' | 'shift_evening' | 'skip_today';

export type QuietModeType = 'normal' | 'mute_audio' | 'vibrate_only' | 'silent_all';

export type SyncTierMode =
  | 'google_calendar_api'
  | 'android_calendar_contract'
  | 'apps_script_bridge'
  | 'ics_rrule_feed'
  | 'offline_rules';

export interface GeoLocation {
  id: string;
  nameAr: string;
  nameEn: string;
  lat: number;
  lng: number;
  tzOffsetHours: number;
  timeZone?: string;
}

export interface PrayerTimeItem {
  id: 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
  nameAr: string;
  nameEn: string;
  emojiPair: string;
  adhanMinutes: number;
  alarmMinutes: number; // adhanMinutes - 3 (except sunrise)
  isObligatory: boolean;
}

export interface ScheduleBlock {
  id: string;
  emojiPair: string;
  categoryAr: string;
  categoryEn?: string;
  startMin: number;
  durationMin: number;
  minDurationMin: number;
  isAnchor: boolean;
  isFridayRitual?: boolean;
  travelGroup: TravelGroup;
  canShiftEvening: boolean;
  completed: boolean;
  deleted: boolean;
  reflowStatus?: 'compressed' | 'shifted_evening' | 'started_now' | 'skipped' | 'postponed_travel';
  originalStartMin?: number;
  originalDurationMin?: number;
  googleEventId?: string;
  googleCalendarId?: string;
  calendarTitle?: string;
  calendarColor?: string;
  googleHtmlLink?: string;
  dateIso?: string;
  startIso?: string;
  endIso?: string;
  isAllDay?: boolean;
  description?: string;
  source?: 'google_calendar' | 'prayer' | 'ics' | 'offline' | 'creative';
  creativeActivityId?: string;
}

export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary?: boolean;
}

export interface GoogleCalendarEventItem {
  id: string;
  calendarId?: string;
  calendarTitle?: string;
  calendarColor?: string;
  summary: string;
  start: string;
  end: string;
  isAllDay?: boolean;
  description: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  isRecurring?: boolean;
  recurringEventId?: string;
}

export interface CalendarActionProposal {
  operation: 'create' | 'update' | 'delete' | 'shift';
  eventId?: string;
  calendarId?: string;
  title: string;
  dateIso?: string;
  startTime24?: string;
  /** Relative start ("in 5 minutes"): the app turns it into dateIso/startTime24 from its own clock. */
  startInMinutes?: number;
  durationMinutes?: number;
  description?: string;
  recurrenceRule?: 'DAILY' | 'WEEKLY';
  byDays?: string[]; // e.g., ['SU', 'TU', 'TH'] for WEEKLY recurrence
  /** Apply change/deletion across all upcoming days of a recurring series (targets master recurring event) */
  applyToAllDays?: boolean;
}

export interface CalendarExecutionResult {
  title: string;
  operation: string;
  status: string;
  id?: string;
  htmlLink?: string;
  start?: string;
  end?: string;
}

export interface GoogleTaskList {
  id: string;
  title: string;
}

export interface GoogleTaskItem {
  id: string;
  taskListId: string;
  taskListTitle: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
  completed?: string;
  updated?: string;
}

export interface TaskActionProposal {
  operation: 'create' | 'update' | 'complete' | 'reopen' | 'delete';
  taskId?: string;
  taskListId?: string;
  title: string;
  notes?: string;
  dueDateIso?: string;
}

export interface TaskExecutionResult {
  title: string;
  operation: string;
  status: string;
  id?: string;
  taskListId?: string;
}

export interface MedicationItem {
  id: string;
  name: string;
  time24: string;
  times24?: string[]; // Multiple daily doses e.g. ['08:00', '20:00']; empty = flexible / awaiting time
  daysOfWeek?: number[]; // Empty = every day; otherwise 0=Sun..6=Sat (e.g. gym days)
  takenDosesToday?: string[]; // Dose keys logged on takenDateKey
  doseNote: string;
  takenDateKey: string;
  calendarEventId: string;
  courseEndDate?: string; // Optional YYYY-MM-DD end of medication/supplement course
  remainingDoses?: number; // -1 = untracked, 0..500 = doses left before refill
  totalDoses?: number; // -1 = untracked, 0..500 = initial package/course doses
  refillAlertDays?: number; // 1..14 lead days before running out (default 3)
  takenDates?: string[]; // Up to 31 recent YYYY-MM-DD Cairo date keys when taken (adherence history)
}

export interface MedicationActionProposal {
  operation: 'add' | 'update' | 'remove' | 'mark_taken';
  medicationId?: string;
  name: string;
  time24?: string;
  times24?: string[];
  daysOfWeek?: number[];
  doseNote?: string;
  courseEndDate?: string;
  remainingDoses?: number;
  totalDoses?: number;
  refillAlertDays?: number;
}

export interface MedicationExecutionResult {
  name: string;
  operation: string;
  status: string;
  id: string;
}

export type CreativeCadence = 'daily' | 'weekly' | 'monthly';

export interface CreativeActivityItem {
  id: string;
  name: string;
  emoji: string;
  cadence?: CreativeCadence; // daily | weekly | monthly (defaults to weekly)
  goalCount?: number; // 1..31 target sessions per cadence period
  weeklyGoalSessions: number; // 1..14 legacy weekly alias
  sessionMinutes: number; // 15..240
  loggedDates: string[]; // YYYY-MM-DD
  scheduledTime24: string; // Optional pinned or last scheduled HH:MM
  calendarEventId: string;
  expiresOnDate?: string; // Optional YYYY-MM-DD for temporary projects/hobbies
}

export interface CreativeActivityActionProposal {
  operation: 'add' | 'update' | 'remove' | 'log_today' | 'log_session';
  activityId?: string;
  name: string;
  emoji?: string;
  cadence?: CreativeCadence;
  goalCount?: number;
  weeklyGoalSessions?: number;
  sessionMinutes?: number;
  scheduledTime24?: string;
  expiresOnDate?: string;
}

export interface CreativeExecutionResult {
  name: string;
  operation: string;
  status: string;
  id: string;
}

export interface FreeTimeSlot {
  startMin: number;
  endMin: number;
  durationMin: number;
}

export interface CreativeActivityPlacement {
  activity: CreativeActivityItem;
  cadence: CreativeCadence;
  sessionsInPeriod: number;
  goalInPeriod: number;
  periodLabelAr: string;
  sessionsThisWeek: number;
  doneToday: boolean;
  suggestedSlot: { startMin: number; endMin: number; time24: string } | null;
}

export interface TomorrowAlertInfo {
  tomorrowIso: string;
  weekdayAr: string;
  isBusy: boolean;
  hasSpecialEvent: boolean;
  eventCount: number;
  totalHours: number;
  specialEvents: Array<{ title: string; timeLabel: string; reasonAr: string }>;
  headlineAr: string;
  detailAr: string;
}

export interface DeletedWorkspaceSnapshot {
  opId: string;
  kind: 'task' | 'event';
  title: string;
  taskListId?: string;
  notes?: string;
  dueDateIso?: string;
  calendarId?: string;
  dateIso?: string;
  startTime24?: string;
  durationMinutes?: number;
  description?: string;
  deletedAtMs: number;
}

export interface WorkspaceSyncSignal {
  opId: string;
  clientId: string;
  scope:
    | 'calendar'
    | 'tasks'
    | 'all'
    | 'alarm_dismiss'
    | 'alarm_trigger'
    | 'schedule_blocks'
    | 'clear_notifications'
    | 'settings_patch';
  action: string;
  timestampMs: number;
  extra?: Record<string, unknown>;
}

export interface TodayCalendarMeta {
  weekdayAr: string;
  weekdayEn: string;
  gregorianAr: string;
  gregorianEn: string;
  hijriDay: number;
  hijriMonthAr: string;
  hijriYear: number;
  hijriFullAr: string;
  isFullMoonWhiteDay: boolean; // 13, 14, 15 Hijri
}

export type SleepStrategy = 'night_only_strict' | 'biphasic_qailulah' | 'anchor_early_bed';

export type MemoryCategory =
  | 'priority'
  | 'sleep'
  | 'fasting'
  | 'hydration'
  | 'work_devops'
  | 'travel'
  | 'general';

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  ruleText: string;
  source: 'user' | 'gemini' | 'system_seed';
}

export interface MemoryActionProposal {
  operation: 'add' | 'update' | 'remove';
  memoryId?: string;
  category: MemoryCategory;
  ruleText: string;
}

export type TaskSoundCategory =
  | 'prayer'
  | 'water'
  | 'medication'
  | 'focus_work'
  | 'walk_health'
  | 'sleep_suhoor'
  | 'meeting_event'
  | 'general';

export type SoundRepeatSetting = 1 | 2 | 3 | 4 | 'continuous';

export type SoundRepeatMap = Record<TaskSoundCategory, SoundRepeatSetting>;

export type SanctuaryType = 'none' | 'prayer' | 'sleep' | 'meeting';

export interface ActiveSanctuaryState {
  type: SanctuaryType;
  labelAr: string;
  endsAtMin?: number;
  vibrateOnly: boolean;
}

export interface SilentNotificationItem {
  id: string;
  title: string;
  reasonAr: string;
  time12h: string;
  soundCategory: TaskSoundCategory;
  createdAtIso: string;
}

export interface LifeProfile {
  weightKg: number;
  heightCm: number;
  cupSizeMl: number;
  fastingDays: number[]; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  suhoorLeadMinutes: number;
  sleepTargetMinutes: number; // e.g., 450 = 7.5 hours (5 x 90m cycles)
  sleepStrategy: SleepStrategy;
  sleepDebtMinutes: number; // 0..480 accumulated sleep deficit for gentle automatic recovery
  sleepDebtLogDateKey: string; // YYYY-MM-DD when user last checked in morning sleep quality
  adhanLeadMinutes: number; // default 3 min before Adhan
  prayerSilenceMinutes: number; // default 20 min from Adhan for Dhuhr/Asr/Maghrib/Isha
  fajrSilenceMinutes: number; // default 30 min from Adhan for Fajr
  oneTimeSilenceMinutes?: number; // 0 = inactive, 5..120 = one-time silence override via chat
  oneTimeSilenceDateKey?: string; // YYYY-MM-DD when one-time override applies
  lowEnergyDateKey?: string; // YYYY-MM-DD when soft/low-energy day mode is active
  defaultSnoozeMinutes?: number; // 5 | 10 | 15 minutes for alert snooze button (default 5)
  soundRepeats?: SoundRepeatMap; // Ring repeats per category (1..4 or 'continuous')
  careerTrack: string;
  workEnabled: boolean;
  workStart24: string;
  workEnd24: string;
  workDays: number[];
  autoLocationSync: boolean;
  currentCityName: string;
  currentTimeZone: string;
  currentLat: number;
  currentLng: number;
  priorityOrderAr: string;
  personalNotes: string;
}

export interface HydrationScheduleSlot {
  cupIndex: number;
  timeMinutes: number;
  windowAr: string;
  noteAr: string;
}

export interface DailyWeatherPoint {
  dateIso: string;
  maxTempC: number;
  heatExceeded: boolean;
  heatBonusMl: number;
}

export interface WeatherHydrationInfo {
  currentTempC: number;
  maxTempC: number;
  weatherCode: number;
  conditionAr: string;
  icon: string;
  heatBonusMl: number;
  heatNoteAr: string;
  fetchedAtIso: string;
  dailyMaxTemps?: DailyWeatherPoint[];
}

export interface GmailDigestItem {
  id: string;
  messageId: string;
  category: 'meeting' | 'travel' | 'medical' | 'deadline' | 'delivery' | 'other';
  titleAr: string;
  sender: string;
  summaryAr: string;
  dateIso?: string;
  startTime24?: string;
  durationMinutes?: number;
  suggestedAction: CalendarActionProposal;
}

export type SeasonalSleepPhase =
  | 'abundant_winter'
  | 'balanced_equinox'
  | 'transitional_tight'
  | 'short_summer_night';

export interface SeasonalSleepGuidance {
  phase: SeasonalSleepPhase;
  phaseLabelAr: string;
  astronomicalNightMin: number;
  completedCycles: number;
  windDownStartMin: number;
  caffeineCutoffMin: number;
  nsdrWindowAr: string;
  protocolSummaryAr: string;
  summerMinNightMin?: number;
  winterMaxNightMin?: number;
}

export interface DailyRhythmPlan {
  isFastingToday: boolean;
  isFastingTomorrow: boolean;
  fastingReasonAr: string;
  heatBonusMl: number;
  normalTargetMl: number;
  fastingMinTargetMl: number;
  activeTargetMl: number;
  normalTargetCups: number;
  fastingTargetCups: number;
  activeTargetCups: number;
  cupSizeMl: number;
  hydrationSlots: HydrationScheduleSlot[];
  bedtimeMin: number;
  wakeMin: number;
  sunriseMin: number;
  maghribMin: number;
  suhoorStartMin: number | null;
  coreNightSleepMin: number;
  qailulahStartMin: number | null;
  qailulahDurationMin: number;
  totalSleepMin: number;
  eveningStudyTrimMin: number;
  sleepDebtMinutes: number;
  nightlyRecoveryMin: number;
  sleepDebtPlanAr: string | null;
  sleepAdviceAr: string;
  conflictWarningAr: string | null;
  autoAdaptationProposalAr: string | null;
  seasonalSleep?: SeasonalSleepGuidance;
  isWorkDayToday: boolean;
}

export interface GroundingPlace {
  title: string;
  uri: string;
  snippets?: string[];
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface PendingProposal {
  summaryAr: string;
  actions: CalendarActionProposal[];
  taskActions?: TaskActionProposal[];
  medicationActions?: MedicationActionProposal[];
  creativeActions?: CreativeActivityActionProposal[];
  profileUpdates?: Partial<LifeProfile>;
  memoryActions?: MemoryActionProposal[];
  appSettings?: AppSettingsPatch;
  status: 'pending' | 'confirmed' | 'cancelled';
  fromTextFallback?: boolean;
}

export interface PersistedChatMessage {
  id: string;
  role: 'user' | 'model';
  mode: 'chat' | 'maps' | 'search';
  text: string;
  createdAtIso?: string;
  places?: GroundingPlace[];
  sources?: GroundingSource[];
  executionLinks?: Array<{ title: string; htmlLink: string }>;
  pendingProposal?: PendingProposal;
  error?: boolean;
  latencyMs?: number;
  memoriesAppliedCount?: number;
  cached?: boolean;
  retryPrompt?: string;
}

export interface HydrationDayLog {
  dateKey: string;
  labelAr: string;
  cupsLogged: number;
  targetCups: number;
  slots: boolean[];
  slotOpIds?: string[];
  removedOpIds?: string[];
  hydrationUpdatedAtMs?: number;
}

export interface DualStreaks {
  dailyCommitmentDays: number;
  dailyCommitmentDoneToday: boolean;
  waterTargetDays: number;
  waterTargetDoneToday: boolean;
}

export interface TravelState {
  active: boolean;
  location: GeoLocation;
  distanceKm: number;
  durationMode: TravelDurationMode;
  postponedTaskIds: string[];
  enabledWorkTaskIds: string[];
}

export interface PomodoroState {
  phase: 'focus' | 'break';
  presetMinutes: 25 | 50 | 5;
  remainingSeconds: number;
  totalSeconds: number;
  isRunning: boolean;
  completedCycles: number;
}

export interface ReflowResult {
  reflowedBlocks: ScheduleBlock[];
  compressedCount: number;
  shiftedCount: number;
  skippedCount: number;
  availableBudgetMin: number;
  requiredWorkMin: number;
  collisionFree: boolean;
  notesAr: string[];
}

export interface CalendarTombstone {
  id: string;
  blockId: string;
  emojiPair: string;
  categoryAr: string;
  deletedAtIso: string;
  ageDays: number;
}

export interface BatteryGuardState {
  levelPct: number;
  cableConnected: boolean;
  bypassChargingLimitPct: 80 | 90 | null;
  eveningTimeSimMin: number; // e.g., 20:45 = 1245
  pcAlertActive: boolean;
  autoSilencedByDisconnect: boolean;
  bedtimeGuardTriggered: boolean;
}

export interface PhoneBatteryTelemetry {
  levelPct: number; // 0..100
  charging: boolean;
  chargeLimitPct: number; // 60..100 (default 90)
  chargeTimeRemainingMin?: number; // -1 = unknown, 0..1440 = minutes remaining to full/limit
  updatedAtMs: number;
  deviceLabel: string;
}

export interface SharedChangelogEntry {
  id: string;
  version: number;
  timestampStr: string;
  device: 'Web/PC' | 'OnePlus 12R' | 'Gemini API';
  noteAr: string;
  noteEn: string;
}

export interface PeriodicRitualStatus {
  id: 'room_weekly' | 'pc_biweekly' | 'personal_monthly';
  emojiPair: string;
  titleAr: string;
  titleEn: string;
  intervalDays: number;
  timeLabelAr: string;
  daysSinceLast: number;
  lastCompletedIso: string;
}

/**
 * App settings Gemini can change from the chat (everything outside the life profile).
 * Every field is optional; only the ones present are applied.
 */
export interface AppSettingsPatch {
  phoneChargeLimitPct?: number; // 60..100
  chargeAlertEnabled?: boolean;
  chargeAlertKeepUntilUnplugged?: boolean;
  waterRemindersEnabled?: boolean;
  quietMode?: 'normal' | 'mute_audio' | 'vibrate_only' | 'silent_all';
  quietModeMinutes?: number; // 0 = until turned off
  adhanSoundInSilent?: boolean;
  sunMode?: boolean;
  language?: 'ar' | 'en';
  capsuleOrientation?: 'horizontal' | 'vertical';
  capsuleSize?: 'sm' | 'md' | 'lg';
  liveAlertsEnabled?: boolean;
  liveAlertsLeadMinutes?: 5 | 10 | 15 | 20 | 30;
  liveAlertsAlwaysOn?: boolean;
  liveAlertsShowCharging?: boolean;
  persistentCountdownNotif?: boolean;
  // NOTE: deliberately no "autoExecuteChat" here — manual-confirm vs instant-execute is a trust
  // setting only a direct tap on the toggle may change, never Gemini on the user's behalf.
  soundRepeats?: Partial<Record<
    'prayer' | 'water' | 'medication' | 'focus_work' | 'walk_health' | 'sleep_suhoor' | 'meeting_event' | 'general',
    number | 'continuous'
  >>;
}

/**
 * Global application version tag displayed across desktop and mobile clients.
 * Automatically injected by CI/CD (VITE_APP_VERSION) or falls back to current release.
 */
export const APP_VERSION =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APP_VERSION)
    ? String(import.meta.env.VITE_APP_VERSION)
    : 'v2.0.126';


