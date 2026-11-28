import { DEFAULT_SOUND_REPEATS } from '../audioEngine';
import {
  CreativeActivityItem, CreativeActivityPlacement, CreativeCadence, DailyRhythmPlan,
  DynamicHabit, DynamicHabitAnchor, FreeTimeSlot, FreeWindow, GeoLocation,
  GoogleCalendarEventItem, GoogleTaskItem, HydrationScheduleSlot, LifeProfile,
  MedicationFastingPolicy, MedicationItem, MemoryCategory, MemoryItem, PrayerTimeItem,
  ResolvedHabitPlacement, ScheduleBlock, SeasonalSleepGuidance, SeasonalSleepMode,
  SeasonalSleepPhase, SeasonalSleepPlan, TodayCalendarMeta, TomorrowAlertInfo, WeatherHydrationInfo,
} from '../../types/dayrhythm';

export const ARABIC_WEEKDAYS = [
  { id: 6, shortAr: 'سبت', fullAr: 'السبت' },
  { id: 0, shortAr: 'أحد', fullAr: 'الأحد' },
  { id: 1, shortAr: 'إثنين', fullAr: 'الإثنين' },
  { id: 2, shortAr: 'ثلاثاء', fullAr: 'الثلاثاء' },
  { id: 3, shortAr: 'أربعاء', fullAr: 'الأربعاء' },
  { id: 4, shortAr: 'خميس', fullAr: 'الخميس' },
  { id: 5, shortAr: 'جمعة', fullAr: 'الجمعة' },
] as const;

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  priority: 'الأولويات وحل التعارض',
  sleep: 'النوم الليلي والشروق',
  fasting: 'الصيام والسحور',
  hydration: 'الماء والقياسات',
  work_devops: 'العمل والدراسة',
  travel: 'السفر والفصول',
  general: 'قواعد عامة',
};

export const DEFAULT_LIFE_PROFILE: LifeProfile = {
  weightKg: 70,
  heightCm: 177,
  cupSizeMl: 250,
  fastingDays: [1, 4], // Monday & Thursday default
  suhoorLeadMinutes: 45,
  sleepTargetMinutes: 450, // 7.5 hours (5 full 90-min circadian cycles)
  sleepStrategy: 'night_only_strict',
  sleepDebtMinutes: 0,
  sleepDebtLogDateKey: '',
  whiteDaysEnabled: false,
  fastingWhiteDays: false,
  adhanLeadMinutes: 0, // 0 min = exact Adhan time
  prayerSilenceMinutes: 20, // 20 min silent window from actual Adhan
  fajrSilenceMinutes: 40, // 40 min silent window from actual Fajr Adhan (time for wudu + walking to the mosque + prayer)
  oneTimeSilenceMinutes: 0,
  oneTimeSilenceDateKey: '',
  lowEnergyDateKey: '',
  defaultSnoozeMinutes: 5,
  enableWakeAlarm: true,
  soundRepeats: { ...DEFAULT_SOUND_REPEATS },
  careerTrack: '',
  workEnabled: false,
  workStart24: '09:00',
  workEnd24: '17:00',
  workDays: [0, 1, 2, 3, 4], // Sun-Thu
  autoLocationSync: true,
  currentCityName: 'الضهرية · شربين (الدقهلية)',
  currentTimeZone: 'Africa/Cairo',
  currentLat: 31.227,
  currentLng: 31.6148,
  priorityOrderAr:
    '1. الصلاة ← 2. النوم الليلي ← 3. العمل الثابت ← 4. المهام المرنة والماء والعلاجات',
  personalNotes: '',
};

export const DEFAULT_MEMORIES: MemoryItem[] = [];

export function wrap1440(min: number): number {
  return ((Math.round(min) % 1440) + 1440) % 1440;
}

export function durationForward(startMin: number, endMin: number): number {
  const s = wrap1440(startMin);
  const e = wrap1440(endMin);
  return e >= s ? e - s : 1440 - s + e;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function formatDurationAr(totalMinutes: number): string {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h === 0) return `${m} د`;
  if (m === 0) return `${h} س`;
  return `${h} س ${m} د`;
}

export function computeScientificHydration(
  profile: LifeProfile,
  isFastingToday: boolean,
  heatBonusMl = 0
): {
  normalTargetMl: number;
  fastingMinTargetMl: number;
  activeTargetMl: number;
  normalTargetCups: number;
  fastingTargetCups: number;
  activeTargetCups: number;
  cupMl: number;
} {
  const safeHeatBonus = Math.max(0, Math.min(800, Math.round(heatBonusMl)));
  // Drinking water target (excluding ~20% fluid from food):
  // ~31 ml/kg + fixed-height BSA adjustment (+6 ml per cm above baseline 177cm) + weather heat bonus
  const rawNormalMl = Math.round(
    profile.weightKg * 31 + (profile.heightCm - 177) * 6 + safeHeatBonus
  );
  const normalTargetMl = clamp(rawNormalMl, 1800, 4800);

  // Fasting day minimum physiological floor (~72% of base normal target + modest 35% heat buffer)
  const baseNoHeatMl = clamp(
    Math.round(profile.weightKg * 31 + (profile.heightCm - 177) * 6),
    1800,
    4500
  );
  const fastingHeatBuffer = safeHeatBonus >= 400 ? Math.min(200, Math.round(safeHeatBonus * 0.35)) : 0;
  const fastingMinTargetMl = clamp(
    Math.round(baseNoHeatMl * 0.72) + fastingHeatBuffer,
    1400,
    3300
  );

  const cupMl = clamp(Math.round(profile.cupSizeMl), 100, 1000);
  const normalTargetCups = clamp(Math.round(normalTargetMl / cupMl), 4, 24);
  const fastingTargetCups = clamp(
    Math.round(fastingMinTargetMl / cupMl),
    3,
    Math.max(3, normalTargetCups - 1)
  );

  const activeTargetCups = isFastingToday ? fastingTargetCups : normalTargetCups;
  const activeTargetMl = activeTargetCups * cupMl;

  return {
    normalTargetMl: normalTargetCups * cupMl,
    fastingMinTargetMl: fastingTargetCups * cupMl,
    activeTargetMl,
    normalTargetCups,
    fastingTargetCups,
    activeTargetCups,
    cupMl,
  };
}

