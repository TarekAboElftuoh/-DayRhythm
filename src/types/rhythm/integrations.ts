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

export type MedicationFastingPolicy =
  | 'auto-nearest'
  | 'before-fajr'
  | 'after-maghrib'
  | 'skip'
  | 'unchanged';

export interface MedicationItem {
  id: string;
  name: string;
  time24: string;
  times24?: string[]; // Multiple daily doses e.g. ['08:00', '20:00']; empty = flexible / awaiting time
  daysOfWeek?: number[]; // Empty = every day; otherwise 0=Sun..6=Sat (e.g. gym days)
  fastingPolicy?: MedicationFastingPolicy; // How daytime (Fajr-Maghrib) doses behave on fasting days
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
  fastingPolicy?: MedicationFastingPolicy;
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

