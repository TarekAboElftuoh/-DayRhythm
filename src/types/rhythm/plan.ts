import type { GeoLocation } from './core';
import type { HabitActionProposal } from './habits';
import type { AppSettingsPatch, SettingsPatchProposal } from './settingsPatch';
import type { DayMode, FastingExemption, PrayerTimeItem, QuietModeType, ScheduleBlock, SyncTierMode, TravelDeferrableCategory, TravelDurationMode } from './core';
import type { CreativeActivityPlacement, DynamicHabit, FreeTimeSlot, FreeWindow, ResolvedHabitPlacement, TodayCalendarMeta, TomorrowAlertInfo } from './habits';
import type { CreativeActivityActionProposal, CreativeActivityItem, GoogleCalendarEventItem, GoogleTaskItem, MedicationActionProposal, MedicationItem, TaskActionProposal, CalendarActionProposal } from './integrations';
import type { ActiveSanctuaryState, GmailDigestItem, HydrationScheduleSlot, LifeProfile, MemoryActionProposal, MemoryItem, SilentNotificationItem, WeatherHydrationInfo } from './profile';

export type SeasonalSleepMode = 'long_night' | 'medium_night' | 'short_night';

export interface SeasonalSleepPlan {
  mode: SeasonalSleepMode;
  isFasting: boolean;
  isRamadan: boolean;
  targetSleepMin: number;
  wakeTimeMin: number;
  earliestBedtimeMin: number;
  bedtimeMin: number;
  availableNightMin: number;
  nightSleepMin: number;
  deficitMin: number;
  postFajrStartMin: number | null;
  postFajrEndMin: number | null;
  postFajrDurationMin: number;
  postDhuhrNapStartMin: number | null;
  postDhuhrNapDurationMin: number;
  totalSleepMin: number;
}

export type SeasonalSleepPhase =
  | 'abundant_winter'
  | 'balanced_equinox'
  | 'transitional_tight'
  | 'short_summer_night';

export interface SeasonalSleepGuidance {
  phase: SeasonalSleepPhase;
  mode?: SeasonalSleepMode;
  phaseLabelAr: string;
  astronomicalNightMin: number;
  completedCycles: number;
  windDownStartMin: number;
  caffeineCutoffMin: number;
  nsdrWindowAr: string;
  protocolSummaryAr: string;
  postFajrStartMin?: number | null;
  postFajrEndMin?: number | null;
  postFajrDurationMin?: number;
  summerMinNightMin?: number;
  winterMaxNightMin?: number;
}

export interface DailyRhythmPlan {
  isFastingToday: boolean;
  isFastingTomorrow: boolean;
  isRamadan: boolean;
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
  sleepMode?: SeasonalSleepMode;
  postFajrStartMin?: number | null;
  postFajrEndMin?: number | null;
  postFajrDurationMin?: number;
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
  habitActions?: HabitActionProposal[];
  profileUpdates?: Partial<LifeProfile>;
  memoryActions?: MemoryActionProposal[];
  appSettings?: AppSettingsPatch;
  settingsPatchProposal?: SettingsPatchProposal;
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
  returnDate?: string;
  deferredCategories?: TravelDeferrableCategory[];
  deferredMedIds?: string[];
  updatedAt?: number;
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
