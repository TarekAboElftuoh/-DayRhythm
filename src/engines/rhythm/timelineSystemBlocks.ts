import type {
  DailyRhythmPlan,
  MedicationItem,
  PrayerTimeItem,
  ScheduleBlock,
} from '../../types/dayrhythm';
import { formatMinutes12h } from '../prayerEngine';
import { resolveMedicationDosesForDay } from './medicationSchedule';
import type { DayTimelineLockedBlock } from './timelineTypes';

export function buildSystemBackgroundBlocks(
  prayers: PrayerTimeItem[],
  plan: DailyRhythmPlan,
  blocks: ScheduleBlock[],
  medications: MedicationItem[],
  weekday: number | null
): DayTimelineLockedBlock[] {
  const items: DayTimelineLockedBlock[] = [];
  const sunrise = prayers.find((p) => p.id === 'sunrise');
  if (sunrise) {
    items.push({
      id: 'sunrise_daily',
      kind: 'system',
      titleAr: sunrise.nameAr || 'الشروق',
      emoji: sunrise.emojiPair || '🌅',
      startMin: sunrise.adhanMinutes,
      endMin: sunrise.adhanMinutes + 15,
      durationMin: 15,
      isLocked: true,
      subtitleAr: formatMinutes12h(sunrise.adhanMinutes, 'ar'),
    });
  }
  for (const blk of blocks) {
    if (blk.deleted || !blk.id.startsWith('sunlight_')) continue;
    const dur = Math.max(10, Math.round(blk.durationMin || 15));
    items.push({
      id: blk.id,
      kind: 'system',
      titleAr: blk.categoryAr,
      emoji: blk.emojiPair || '☀️',
      startMin: blk.startMin,
      endMin: blk.startMin + dur,
      durationMin: dur,
      isLocked: true,
      subtitleAr: blk.description,
    });
  }
  for (const slot of plan.hydrationSlots ?? []) {
    items.push({
      id: `water_cup_${slot.cupIndex}`,
      kind: 'system',
      titleAr: `كوب ماء ${slot.cupIndex}`,
      emoji: '💧',
      startMin: slot.timeMinutes,
      endMin: slot.timeMinutes + 10,
      durationMin: 10,
      isLocked: true,
      subtitleAr: slot.windowAr || slot.noteAr,
    });
  }
  const fajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const maghribMin = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;
  for (const med of medications) {
    if (weekday !== null && med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(weekday)) continue;
    const resolved = resolveMedicationDosesForDay(med, {
      isFastingToday: Boolean(plan.isFastingToday),
      fajrMin,
      maghribMin,
    });
    for (const dose of resolved.doses) {
      items.push({
        id: `med_${med.id}_${dose.effectiveMin}`,
        kind: 'system',
        titleAr: med.name,
        emoji: '💊',
        startMin: dose.effectiveMin,
        endMin: dose.effectiveMin + 10,
        durationMin: 10,
        isLocked: true,
        subtitleAr: med.doseNote || undefined,
      });
    }
  }
  return items;
}
