import { DayMode, PrayerTimeItem, ScheduleBlock } from '../types/dayrhythm';
import { extractAlarmTimes, ScheduleBuildOptions } from './schedule/types';
import { buildNormalMorningBlocks } from './schedule/normalMorning';
import { buildNormalAfternoonBlocks } from './schedule/normalAfternoon';
import { buildFastingMorningBlocks } from './schedule/fastingMorning';
import { buildFastingAfternoonBlocks } from './schedule/fastingAfternoon';

export type { ScheduleBuildOptions } from './schedule/types';
export { applyTravelMatrix, computeCollisionFreeReflow } from './schedule/travelAndReflow';

export function buildBaseSchedule(
  mode: DayMode,
  prayers: PrayerTimeItem[],
  options: ScheduleBuildOptions = {}
): ScheduleBlock[] {
  const t = extractAlarmTimes(prayers, options);
  const blocks =
    mode === 'normal'
      ? [...buildNormalMorningBlocks(t), ...buildNormalAfternoonBlocks(t)]
      : [...buildFastingMorningBlocks(t), ...buildFastingAfternoonBlocks(t)];
  return blocks.sort((a, b) => a.startMin - b.startMin);
}
