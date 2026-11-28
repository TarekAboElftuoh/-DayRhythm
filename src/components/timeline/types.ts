import type {
  AppLanguage,
  DailyRhythmPlan,
  DynamicHabit,
  DynamicHabitAnchor,
  GoogleTaskItem,
  LifeProfile,
  PrayerTimeItem,
  ScheduleBlock,
} from '../../types/dayrhythm';
import type {
  DayTimelineGhostSlot,
  DayTimelineLockedBlock,
  DayTimelineModel,
  DayTimelinePlacedItem,
  DayTimelineUnplacedItem,
} from '../../engines/lifeRhythmEngine';

export interface DayTimelineViewProps {
  model: DayTimelineModel;
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile: LifeProfile;
  todayIso: string;
  language: AppLanguage;
  nowMinutes: number;
  isSyncingAutoPlace?: boolean;
  onToggleBlockComplete: (blockId: string) => void;
  onToggleHabitToday?: (habitId: string) => void;
  onCompleteTask?: (item: DayTimelinePlacedItem) => void;
  onDeleteEventBlock?: (item: DayTimelinePlacedItem) => void;
  onTriggerAlert?: (title: string, emoji: string) => void;
  onConfirmAutoPlace: (items: DayTimelineUnplacedItem[]) => Promise<void> | void;
  onCommitHabitMove?: (
    habit: DynamicHabit,
    scope: 'today' | 'permanent',
    slot: { startMin: number; durationMin: number; suggestedAnchor: DynamicHabitAnchor }
  ) => Promise<void> | void;
  onCommitItemMove?: (
    item: {
      kind: 'task' | 'event';
      title: string;
      durationMin: number;
      googleTask?: GoogleTaskItem;
      scheduleBlock?: ScheduleBlock;
    },
    slot: { startMin: number; time24: string }
  ) => Promise<void> | void;
  onMoveToUnplaced?: (item: DayTimelinePlacedItem) => Promise<void> | void;
}

export type PlacementTarget = {
  id: string;
  kind: 'habit' | 'task' | 'event';
  title: string;
  emoji: string;
  durationMin: number;
  currentRange: [number, number] | null;
  habit?: DynamicHabit;
  googleTask?: GoogleTaskItem;
  scheduleBlock?: ScheduleBlock;
};

export interface PendingMoveConfirmation {
  target: PlacementTarget;
  startMin: number;
  endMin: number;
  time24: string;
  windowLabel: string;
  suggestedAnchor: DynamicHabitAnchor;
  sourceGesture: 'tap' | 'drag' | 'swipe';
}

export type TimelineRenderNode =
  | { kind: 'locked'; sortMin: number; data: DayTimelineLockedBlock }
  | { kind: 'placed'; sortMin: number; data: DayTimelinePlacedItem }
  | { kind: 'ghost'; sortMin: number; data: DayTimelineGhostSlot };

export const SPRING_SNAPPY = { type: 'spring', stiffness: 460, damping: 34 } as const;

export function toPlacementTargetFromPlaced(item: DayTimelinePlacedItem): PlacementTarget {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    emoji: item.emoji,
    durationMin: item.durationMin,
    currentRange: [item.startMin, item.endMin],
    habit: item.habit,
    googleTask: item.googleTask,
    scheduleBlock: item.scheduleBlock,
  };
}

export function toPlacementTargetFromUnplaced(item: DayTimelineUnplacedItem): PlacementTarget {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    emoji: item.emoji,
    durationMin: item.durationMin,
    currentRange: null,
    habit: item.habit,
    googleTask: item.googleTask,
    scheduleBlock: item.scheduleBlock,
  };
}

export interface PositionedSlice<T> {
  key: string;
  data: T;
  topPx: number;
  heightPx: number;
  startMin: number;
  endMin: number;
}

export function formatHourRulerLabel(hour24: number, language: AppLanguage): string {
  const period = language === 'en' ? (hour24 >= 12 ? 'PM' : 'AM') : hour24 >= 12 ? 'م' : 'ص';
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${h12} ${period}`;
}

export function clampToDaySlices<T>(
  rawStart: number,
  rawEnd: number,
  id: string,
  data: T,
  minPx: number,
  pxPerMin: number
): PositionedSlice<T>[] {
  const MINUTES_PER_DAY = 1440;
  const GRID_HEIGHT_PX = MINUTES_PER_DAY * pxPerMin;
  const duration = Math.max(1, rawEnd - rawStart);
  const start = ((rawStart % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const end = start + duration;

  if (end <= MINUTES_PER_DAY) {
    const heightPx = Math.max(minPx, Math.min(GRID_HEIGHT_PX - start * pxPerMin, duration * pxPerMin));
    return [{ key: id, data, topPx: start * pxPerMin, heightPx, startMin: start, endMin: end }];
  }

  const firstDur = MINUTES_PER_DAY - start;
  const secondDur = Math.min(MINUTES_PER_DAY, end - MINUTES_PER_DAY);
  const slices: PositionedSlice<T>[] = [
    { key: `${id}-p1`, data, topPx: start * pxPerMin, heightPx: Math.max(minPx, firstDur * pxPerMin), startMin: start, endMin: MINUTES_PER_DAY },
  ];
  if (secondDur > 0) {
    slices.push({ key: `${id}-p2`, data, topPx: 0, heightPx: Math.max(minPx, secondDur * pxPerMin), startMin: 0, endMin: secondDur });
  }
  return slices;
}

export const EDITOR_DURATION_CHIPS = [
  { min: 15, label: '15د' },
  { min: 30, label: '30د' },
  { min: 45, label: '45د' },
  { min: 60, label: '1س' },
  { min: 90, label: '1.5س' },
  { min: 120, label: '2س' },
] as const;

export const EDITOR_NUDGE_STEPS = [
  { delta: -15, label: '-15د' },
  { delta: -5, label: '-5د' },
  { delta: 5, label: '+5د' },
  { delta: 15, label: '+15د' },
] as const;

export function splitStartMin12h(startMin: number) {
  const clamped = ((Math.round(startMin) % 1440) + 1440) % 1440;
  const h24 = Math.floor(clamped / 60);
  return {
    hour12: h24 % 12 === 0 ? 12 : h24 % 12,
    minute: clamped % 60,
    period: (h24 >= 12 ? 'PM' : 'AM') as 'AM' | 'PM',
  };
}

export function combine12hToStartMin(hour12: number, minute: number, period: 'AM' | 'PM'): number {
  let h24 = hour12 % 12;
  if (period === 'PM') h24 += 12;
  return h24 * 60 + Math.max(0, Math.min(59, minute));
}

export function toOccupiedScheduleBlocks(
  placed: DayTimelinePlacedItem[],
  excludeId: string
): ScheduleBlock[] {
  return placed
    .filter((p) => p.id !== excludeId)
    .map((p) => ({
      id: p.id,
      title: p.title,
      emoji: p.emoji,
      emojiPair: p.emoji,
      categoryAr: p.kind,
      startMin: p.startMin,
      durationMin: p.durationMin,
      minDurationMin: 5,
      isAnchor: false,
      isBreak: false,
      fixed: false,
      priority: 1,
      completed: p.completed,
      source: 'offline',
      travelGroup: 'A_FIXED',
      canShiftEvening: true,
      deleted: false,
    }));
}

const BG_ID_PREFIXES = ['sunlight_', 'water_', 'hydration_', 'med_', 'medication_', 'vitamin_', 'reminder_', 'system_'];
const BG_TITLE_RE = /(كوب\s*ماء|شرب\s*(ال)?ماء|تذكير\s*المياه|ترطيب|hydration|water\s*cup|دواء|جرعة|فيتامين|مكمل|علاج|medication|vitamin|supplement|أشعة\s*الشمس|جلسة\s*شمس|sunlight|\buv\b|تذكير\s*النظام|system\s*reminder)/i;

export function isBackgroundTimelineItem(item: DayTimelinePlacedItem): boolean {
  const sid = item.sourceId || item.scheduleBlockId || '';
  if (BG_ID_PREFIXES.some((p) => sid.startsWith(p))) return true;
  if (item.emoji === '💧' || item.emoji === '🥤' || item.emoji === '💊') return true;
  return BG_TITLE_RE.test(item.title || '');
}
