import type {
  DailyRhythmPlan,
  DynamicHabitAnchor,
  FreeWindow,
  LifeProfile,
  PrayerTimeItem,
} from '../../types/dayrhythm';
import {
  snapToValidFreeWindow,
  type DayTimelineModel,
  type DayTimelineUnplacedItem,
} from '../../engines/lifeRhythmEngine';
import type { PlacementTarget } from './types';

export interface GapPlacementSlot {
  startMin: number;
  endMin: number;
  time24: string;
  windowLabel: string;
  suggestedAnchor: DynamicHabitAnchor;
}

/** Pick the item to place: an explicitly selected target first, else the first placeable unplaced item. */
export function resolveGapTarget(
  placementTarget: PlacementTarget | null,
  unplacedBlocks: DayTimelineUnplacedItem[]
): DayTimelineUnplacedItem | PlacementTarget | null {
  if (placementTarget) return placementTarget;
  return unplacedBlocks.find((item) => item.suggestedSlot !== null) ?? null;
}

export function resolveGapPlacement(params: {
  target: PlacementTarget;
  startMin: number;
  freeWindows: FreeWindow[];
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile: LifeProfile;
}): GapPlacementSlot | null {
  const snapped = snapToValidFreeWindow({
    targetStartMin: params.startMin,
    durationMin: params.target.durationMin,
    freeWindows: params.freeWindows,
    prayers: params.prayers,
    plan: params.plan,
    profile: params.profile,
    excludeRange: params.target.currentRange,
  });
  if (!snapped.snapped) return null;
  return {
    startMin: snapped.startMin,
    endMin: snapped.endMin,
    time24: snapped.time24,
    windowLabel: snapped.windowLabel,
    suggestedAnchor: snapped.suggestedAnchor,
  };
}

export type GapTargetModel = Pick<DayTimelineModel, 'unplacedBlocks' | 'freeWindows'>;
