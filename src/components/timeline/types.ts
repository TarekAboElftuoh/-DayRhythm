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
