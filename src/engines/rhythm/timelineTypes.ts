import {
  CreativeActivityItem, CreativeActivityPlacement, CreativeCadence, DailyRhythmPlan,
  DynamicHabit, DynamicHabitAnchor, FreeTimeSlot, FreeWindow, GeoLocation,
  GoogleCalendarEventItem, GoogleTaskItem, HydrationScheduleSlot, LifeProfile,
  MedicationFastingPolicy, MedicationItem, MemoryCategory, MemoryItem, PrayerTimeItem,
  ResolvedHabitPlacement, ScheduleBlock, SeasonalSleepGuidance, SeasonalSleepMode,
  SeasonalSleepPhase, SeasonalSleepPlan, TodayCalendarMeta, TomorrowAlertInfo, WeatherHydrationInfo,
} from '../../types/dayrhythm';

export type ScientificEnergyCategory = 'deep_focus' | 'exercise' | 'light';

export function classifyScientificTaskEnergy(title: string): ScientificEnergyCategory {
  const normalized = (title || '').trim();
  if (
    /(\bdevops\b|\bcode\b|\bcoding\b|\bfocus\b|\bdeep\b|\bstudy\b|برمجة|كود|تطوير|مذاكرة|مراجعة|مشروع|عمل عميق|تركيز|تحليل|كتابة|تصميم|سيرفر|خادم)/i.test(
      normalized
    )
  ) {
    return 'deep_focus';
  }
  if (
    /(\bgym\b|\bworkout\b|\bexercise\b|\brun\b|\bwalk\b|جيم|تمرين|رياضة|مشي|جري|تمدد|كارديو)/i.test(
      normalized
    )
  ) {
    return 'exercise';
  }
  return 'light';
}

export type DayTimelineLockedKind =
  | 'prayer'
  | 'suhoor'
  | 'sleep'
  | 'nap'
  | 'post_fajr_sleep';

export interface DayTimelineLockedBlock {
  id: string;
  kind: DayTimelineLockedKind;
  titleAr: string;
  emoji: string;
  startMin: number;
  endMin: number;
  durationMin: number;
  isLocked: true;
  subtitleAr?: string;
}

export interface DayTimelinePlacedItem {
  id: string;
  kind: 'habit' | 'task' | 'event';
  sourceId: string;
  title: string;
  emoji: string;
  startMin: number;
  endMin: number;
  durationMin: number;
  completed: boolean;
  energyCategory: ScientificEnergyCategory;
  subtitleAr?: string;
  googleEventId?: string;
  googleCalendarId?: string;
  googleHtmlLink?: string;
  googleTaskId?: string;
  googleTaskListId?: string;
  habitId?: string;
  scheduleBlockId?: string;
  anchor?: DynamicHabitAnchor;
  isTodayOverride?: boolean;
  habit?: DynamicHabit;
  scheduleBlock?: ScheduleBlock;
  googleTask?: GoogleTaskItem;
}

export type DayTimelineConflictKind =
  | 'sleep'
  | 'prayer'
  | 'suhoor'
  | 'nap'
  | 'anchor_unavailable'
  | 'calendar';

export interface DayTimelineSuggestedSlot {
  startMin: number;
  endMin: number;
  time24: string;
  windowLabel: string;
  suggestedAnchor?: DynamicHabitAnchor;
  scientificNoteAr: string;
}

export interface DayTimelineUnplacedItem {
  id: string;
  kind: 'habit' | 'task' | 'event';
  sourceId: string;
  title: string;
  emoji: string;
  durationMin: number;
  requestedStartMin: number | null;
  conflictKind: DayTimelineConflictKind;
  conflictReasonAr: string;
  suggestedSlot: DayTimelineSuggestedSlot | null;
  googleEventId?: string;
  googleCalendarId?: string;
  googleTaskId?: string;
  googleTaskListId?: string;
  habit?: DynamicHabit;
  scheduleBlock?: ScheduleBlock;
  googleTask?: GoogleTaskItem;
}

export interface DayTimelineModel {
  wakeMin: number;
  bedtimeMin: number;
  windDownStartMin: number;
  lockedBlocks: DayTimelineLockedBlock[];
  placedBlocks: DayTimelinePlacedItem[];
  unplacedBlocks: DayTimelineUnplacedItem[];
  freeWindows: FreeWindow[];
}

export interface BuildDayTimelineInput {
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile: LifeProfile;
  habits?: DynamicHabit[];
  blocks?: ScheduleBlock[];
  googleTasks?: GoogleTaskItem[];
  calendarEvents?: GoogleCalendarEventItem[];
  todayIso: string;
  weekday?: number;
  timeZone?: string;
}

export interface LockedInterval {
  kind: DayTimelineConflictKind;
  startMin: number;
  endMin: number;
  reasonAr: string;
}

