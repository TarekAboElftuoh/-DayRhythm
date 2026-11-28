import type { CreativeCadence } from './integrations';
import type { CreativeActivityItem } from './integrations';

export type DynamicHabitStatus = 'active' | 'planned';

export type DynamicHabitAnchor =
  | 'after-fajr'
  | 'sunrise-light'
  | 'duha'
  | 'after-dhuhr'
  | 'after-asr'
  | 'pre-maghrib'
  | 'after-maghrib'
  | 'after-isha'
  | 'any-free-slot';

export interface DynamicHabitDailyOverride {
  startMin?: number;
  durationMin?: number;
  unplaced?: boolean;
  updatedAtMs?: number;
}

export interface DynamicHabit {
  id: string;
  title: string;
  status: DynamicHabitStatus;
  anchor: DynamicHabitAnchor;
  durationMin: number;
  daysOfWeek?: number[];
  skipOnFasting?: boolean;
  completedDates: string[];
  /** Date-keyed (YYYY-MM-DD) today-only overrides; preserves permanent dynamic anchor */
  dailyOverrides?: Record<string, DynamicHabitDailyOverride>;
}

export interface ResolvedHabitPlacement {
  habit: DynamicHabit;
  dueToday: boolean;
  completedToday: boolean;
  skippedReasonAr?: string;
  slot: {
    startMin: number;
    endMin: number;
    time24: string;
    windowLabel: string;
  } | null;
  isFallbackSlot: boolean;
  isFlexibleUnplaced: boolean;
}

export interface HabitActionProposal {
  operation: 'add' | 'update' | 'pause' | 'activate' | 'remove' | 'toggle_today';
  habitId?: string;
  title: string;
  status?: DynamicHabitStatus;
  anchor?: DynamicHabitAnchor;
  durationMin?: number;
  daysOfWeek?: number[];
  skipOnFasting?: boolean;
}

export interface HabitExecutionResult {
  id: string;
  title: string;
  operation: string;
  status: string;
}

export interface FreeTimeSlot {
  startMin: number;
  endMin: number;
  durationMin: number;
  label?: string;
}

export interface FreeWindow {
  startMin: number;
  endMin: number;
  durationMin: number;
  label: string;
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
  hijriMonth: number; // 1..12 (9 = Ramadan), 0 if unavailable
  hijriMonthAr: string;
  hijriYear: number;
  hijriFullAr: string;
  isRamadan: boolean; // True strictly when Hijri month === 9
  isFullMoonWhiteDay: boolean; // 13, 14, 15 Hijri
}

