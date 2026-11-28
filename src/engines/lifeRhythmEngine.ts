import {
  CreativeActivityItem,
  CreativeActivityPlacement,
  CreativeCadence,
  DailyRhythmPlan,
  DynamicHabit,
  DynamicHabitAnchor,
  FreeTimeSlot,
  FreeWindow,
  GeoLocation,
  GoogleCalendarEventItem,
  HydrationScheduleSlot,
  LifeProfile,
  MedicationFastingPolicy,
  MedicationItem,
  MemoryCategory,
  MemoryItem,
  PrayerTimeItem,
  ResolvedHabitPlacement,
  ScheduleBlock,
  SeasonalSleepGuidance,
  SeasonalSleepMode,
  SeasonalSleepPhase,
  SeasonalSleepPlan,
  TodayCalendarMeta,
  TomorrowAlertInfo,
  WeatherHydrationInfo,
} from '../types/dayrhythm';
import {
  calculateEgyptianPrayerTimes,
  formatMinutes12h,
  formatMinutes24h,
  formatTime24To12h,
  getSpecialFastDay,
  parseIsoToTimeZoneInfo,
} from './prayerEngine';
import { DEFAULT_SOUND_REPEATS, TASK_SOUND_META } from './audioEngine';

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

function wrap1440(min: number): number {
  return ((Math.round(min) % 1440) + 1440) % 1440;
}

function durationForward(startMin: number, endMin: number): number {
  const s = wrap1440(startMin);
  const e = wrap1440(endMin);
  return e >= s ? e - s : 1440 - s + e;
}

function clamp(val: number, min: number, max: number): number {
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

export const SEASONAL_SLEEP_CONSTANTS = {
  NORMAL_WAKE_BEFORE_FAJR_MIN: 15,
  FASTING_WAKE_BEFORE_FAJR_MIN: 45,
  NORMAL_BED_AFTER_ISHA_MIN: 30,
  RAMADAN_BED_AFTER_ISHA_MIN: 90,
  SHORT_NIGHT_THRESHOLD_MIN: 330,
  MEDIUM_DEFICIT_LIGHT_NAP_THRESHOLD_MIN: 45,
  LIGHT_NAP_MIN: 25,
  FULL_CYCLE_NAP_MIN: 90,
  DEFAULT_TARGET_SLEEP_MIN: 450,
  POST_FAJR_DELAY_MIN: 25,
  POST_DHUHR_DELAY_MIN: 35,
  PRE_ASR_BUFFER_MIN: 15,
  PRE_MAGHRIB_LIGHT_BUFFER_MIN: 45,
} as const;

export interface SeasonalSleepSolverInput {
  fajrMin: number;
  sunriseMin: number;
  dhuhrMin: number;
  asrMin: number;
  maghribMin: number;
  ishaMin: number;
  isFasting: boolean;
  isRamadan: boolean;
  targetSleepMin?: number;
}

function schedulePostDhuhrNapStart(
  dhuhrMin: number,
  asrMin: number,
  maghribMin: number,
  sunriseMin: number,
  napDurationMin: number
): number {
  const earliestAfterDhuhrAndSun = Math.max(
    dhuhrMin + SEASONAL_SLEEP_CONSTANTS.POST_DHUHR_DELAY_MIN,
    sunriseMin + 90
  );
  const latestEndBeforeAsrAndMaghrib = Math.min(
    asrMin - SEASONAL_SLEEP_CONSTANTS.PRE_ASR_BUFFER_MIN,
    maghribMin - SEASONAL_SLEEP_CONSTANTS.PRE_MAGHRIB_LIGHT_BUFFER_MIN
  );
  if (latestEndBeforeAsrAndMaghrib - earliestAfterDhuhrAndSun >= napDurationMin) {
    return wrap1440(earliestAfterDhuhrAndSun);
  }
  const minFallbackStart = dhuhrMin + 20;
  if (latestEndBeforeAsrAndMaghrib - minFallbackStart >= napDurationMin) {
    return wrap1440(latestEndBeforeAsrAndMaghrib - napDurationMin);
  }
  return wrap1440(Math.max(minFallbackStart, dhuhrMin + 25));
}

/**
 * Unified Dynamic Sleep Solver using fixed physiological & circadian constants:
 * - wakeTime: Fajr - 15m (normal) or Fajr - 45m (fasting Suhoor prep)
 * - earliestBedtime: Isha + 30m (normal) or Isha + 90m (Ramadan Taraweeh)
 * - Selects Long Night (single block), Medium Night (+ 25m/90m Post-Dhuhr nap),
 *   or Short Night (+ Post-Fajr recovery capped at Sunrise + 25m Post-Dhuhr nap).
 */
export function computeSeasonalSleepPlan(input: SeasonalSleepSolverInput): SeasonalSleepPlan {
  const targetSleepMin = clamp(
    Math.round(input.targetSleepMin ?? SEASONAL_SLEEP_CONSTANTS.DEFAULT_TARGET_SLEEP_MIN),
    180,
    720
  );
  const wakeLead = input.isFasting
    ? SEASONAL_SLEEP_CONSTANTS.FASTING_WAKE_BEFORE_FAJR_MIN
    : SEASONAL_SLEEP_CONSTANTS.NORMAL_WAKE_BEFORE_FAJR_MIN;
  const wakeTimeMin = wrap1440(input.fajrMin - wakeLead);

  const bedDelay = input.isRamadan
    ? SEASONAL_SLEEP_CONSTANTS.RAMADAN_BED_AFTER_ISHA_MIN
    : SEASONAL_SLEEP_CONSTANTS.NORMAL_BED_AFTER_ISHA_MIN;
  const earliestBedtimeMin = wrap1440(input.ishaMin + bedDelay);
  const availableNightMin = durationForward(earliestBedtimeMin, wakeTimeMin);

  let mode: SeasonalSleepMode;
  let bedtimeMin: number;
  let nightSleepMin: number;
  let deficitMin: number;
  let postFajrStartMin: number | null = null;
  let postFajrEndMin: number | null = null;
  let postFajrDurationMin = 0;
  let postDhuhrNapStartMin: number | null = null;
  let postDhuhrNapDurationMin = 0;

  if (availableNightMin >= targetSleepMin) {
    mode = 'long_night';
    bedtimeMin = wrap1440(wakeTimeMin - targetSleepMin);
    nightSleepMin = targetSleepMin;
    deficitMin = 0;
  } else if (availableNightMin >= SEASONAL_SLEEP_CONSTANTS.SHORT_NIGHT_THRESHOLD_MIN) {
    mode = 'medium_night';
    bedtimeMin = earliestBedtimeMin;
    nightSleepMin = availableNightMin;
    deficitMin = targetSleepMin - availableNightMin;
    postDhuhrNapDurationMin =
      deficitMin <= SEASONAL_SLEEP_CONSTANTS.MEDIUM_DEFICIT_LIGHT_NAP_THRESHOLD_MIN
        ? SEASONAL_SLEEP_CONSTANTS.LIGHT_NAP_MIN
        : SEASONAL_SLEEP_CONSTANTS.FULL_CYCLE_NAP_MIN;
    postDhuhrNapStartMin = schedulePostDhuhrNapStart(
      input.dhuhrMin,
      input.asrMin,
      input.maghribMin,
      input.sunriseMin,
      postDhuhrNapDurationMin
    );
  } else {
    mode = 'short_night';
    bedtimeMin = earliestBedtimeMin;
    nightSleepMin = availableNightMin;
    deficitMin = targetSleepMin - availableNightMin;
    postDhuhrNapDurationMin = SEASONAL_SLEEP_CONSTANTS.LIGHT_NAP_MIN;
    postDhuhrNapStartMin = schedulePostDhuhrNapStart(
      input.dhuhrMin,
      input.asrMin,
      input.maghribMin,
      input.sunriseMin,
      postDhuhrNapDurationMin
    );

    const rawPostFajrStart = wrap1440(input.fajrMin + SEASONAL_SLEEP_CONSTANTS.POST_FAJR_DELAY_MIN);
    const gapToSunrise = durationForward(rawPostFajrStart, input.sunriseMin);
    const usableSunriseGap = gapToSunrise > 0 && gapToSunrise <= 180 ? gapToSunrise : 0;
    const neededPostFajr = Math.max(0, deficitMin - postDhuhrNapDurationMin);
    const rawPostFajrDur = Math.min(usableSunriseGap, neededPostFajr);
    if (rawPostFajrDur >= 15) {
      postFajrStartMin = rawPostFajrStart;
      postFajrDurationMin = rawPostFajrDur;
      postFajrEndMin = wrap1440(rawPostFajrStart + rawPostFajrDur);
    }
  }

  return {
    mode,
    isFasting: input.isFasting,
    isRamadan: input.isRamadan,
    targetSleepMin,
    wakeTimeMin,
    earliestBedtimeMin,
    bedtimeMin,
    availableNightMin,
    nightSleepMin,
    deficitMin,
    postFajrStartMin,
    postFajrEndMin,
    postFajrDurationMin,
    postDhuhrNapStartMin,
    postDhuhrNapDurationMin,
    totalSleepMin: nightSleepMin + postFajrDurationMin + postDhuhrNapDurationMin,
  };
}

export interface FastingDayInput {
  weekday: number; // 0=Sun..6=Sat
  fastingDays: number[]; // Custom selected weekdays (e.g., Mon/Thu [1, 4], Sat [6])
  dateIso?: string;
  timeZone?: string;
  fastingOverride?: 'auto' | 'fasting' | 'normal';
  /** Optional precomputed special fast label (Ramadan, White Days, Arafah, Ashura). */
  specialFastAr?: string | null;
  isWhiteDay?: boolean;
  isRamadan?: boolean;
  whiteDaysEnabled?: boolean;
}

/**
 * Single authoritative fasting detector shared across hydration, medications, Suhoor, and conflict checks.
 * Honors custom selected weekdays (Mon/Thu default), Ramadan (Hijri month 9), Arafah/Ashura,
 * opt-in White Days, and one-off toggles.
 */
export function isFastingDay(input: FastingDayInput): boolean {
  if (input.fastingOverride === 'fasting') return true;
  if (input.fastingOverride === 'normal') return false;
  if (Array.isArray(input.fastingDays) && input.fastingDays.includes(input.weekday)) {
    return true;
  }
  if (input.isRamadan) return true;
  if (input.isWhiteDay && input.whiteDaysEnabled !== false) return true;
  if (input.specialFastAr !== undefined) {
    if (input.specialFastAr === 'الأيام البيض' && !input.whiteDaysEnabled) {
      return false;
    }
    return Boolean(input.specialFastAr);
  }
  if (input.dateIso) {
    return Boolean(
      getSpecialFastDay(input.dateIso, input.timeZone, {
        whiteDaysEnabled: Boolean(input.whiteDaysEnabled),
      })
    );
  }
  return false;
}

export function computeDailyRhythmPlan(
  profile: LifeProfile,
  prayers: PrayerTimeItem[],
  options: {
    todayWeekday: number; // 0=Sun..6=Sat
    tomorrowWeekday: number;
    todayIso?: string;
    tomorrowIso?: string;
    timeZone?: string;
    fastingOverride?: 'auto' | 'fasting' | 'normal';
    heatBonusMl?: number;
    /** Arabic name of a special fast today/tomorrow (Ramadan / White Days / Arafah / Ashura), if any. */
    specialFastTodayAr?: string | null;
    specialFastTomorrowAr?: string | null;
    isWhiteDayToday?: boolean;
    isWhiteDayTomorrow?: boolean;
    isRamadanToday?: boolean;
    isRamadanTomorrow?: boolean;
  }
): DailyRhythmPlan {
  const fajr = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const sunrise = prayers.find((p) => p.id === 'sunrise')?.adhanMinutes ?? 6 * 60 + 15;

  const dhuhr = prayers.find((p) => p.id === 'dhuhr')?.adhanMinutes ?? 12 * 60;
  const asr = prayers.find((p) => p.id === 'asr')?.adhanMinutes ?? 15 * 60;
  const maghrib = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;
  const redSun = prayers.find((p) => p.id === 'maghrib')?.redSunMinutes ?? null;
  const safeRedSun = redSun ?? (maghrib - 35);
  const isha = prayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 19 * 60;

  const tz = options.timeZone ?? profile.currentTimeZone;
  const whiteDaysEnabled = Boolean(profile.whiteDaysEnabled ?? profile.fastingWhiteDays ?? false);

  const rawSpecialToday =
    options.specialFastTodayAr !== undefined
      ? options.specialFastTodayAr
      : options.todayIso
        ? getSpecialFastDay(options.todayIso, tz, { whiteDaysEnabled })?.nameAr ?? null
        : null;
  const rawSpecialTomorrow =
    options.specialFastTomorrowAr !== undefined
      ? options.specialFastTomorrowAr
      : options.tomorrowIso
        ? getSpecialFastDay(options.tomorrowIso, tz, { whiteDaysEnabled })?.nameAr ?? null
        : null;

  const resolvedSpecialToday =
    !whiteDaysEnabled && rawSpecialToday === 'الأيام البيض' ? null : rawSpecialToday;
  const resolvedSpecialTomorrow =
    !whiteDaysEnabled && rawSpecialTomorrow === 'الأيام البيض' ? null : rawSpecialTomorrow;

  const isRamadanToday = Boolean(
    options.isRamadanToday ??
      (resolvedSpecialToday === 'شهر رمضان' ||
        (options.todayIso ? getSpecialFastDay(options.todayIso, tz)?.id === 'ramadan' : false))
  );
  const isRamadanTomorrow = Boolean(
    options.isRamadanTomorrow ??
      (resolvedSpecialTomorrow === 'شهر رمضان' ||
        (options.tomorrowIso ? getSpecialFastDay(options.tomorrowIso, tz)?.id === 'ramadan' : false))
  );

  const autoFastToday = isFastingDay({
    weekday: options.todayWeekday,
    fastingDays: profile.fastingDays,
    dateIso: options.todayIso,
    timeZone: tz,
    specialFastAr: resolvedSpecialToday,
    isWhiteDay: options.isWhiteDayToday,
    isRamadan: isRamadanToday,
    whiteDaysEnabled,
  });
  const isFastingToday = isFastingDay({
    weekday: options.todayWeekday,
    fastingDays: profile.fastingDays,
    dateIso: options.todayIso,
    timeZone: tz,
    fastingOverride: options.fastingOverride,
    specialFastAr: resolvedSpecialToday,
    isWhiteDay: options.isWhiteDayToday,
    isRamadan: isRamadanToday,
    whiteDaysEnabled,
  });

  const isFastingTomorrow = isFastingDay({
    weekday: options.tomorrowWeekday,
    fastingDays: profile.fastingDays,
    dateIso: options.tomorrowIso,
    timeZone: tz,
    specialFastAr: resolvedSpecialTomorrow,
    isWhiteDay: options.isWhiteDayTomorrow,
    isRamadan: isRamadanTomorrow,
    whiteDaysEnabled,
  });

  const dayNameMap: Record<number, string> = {
    0: 'الأحد',
    1: 'الإثنين',
    2: 'الثلاثاء',
    3: 'الأربعاء',
    4: 'الخميس',
    5: 'الجمعة',
    6: 'السبت',
  };

  const fastingReasonAr = isFastingToday
    ? options.fastingOverride === 'fasting' && !autoFastToday
      ? 'صيام إضافي مفعّل لليوم'
      : isRamadanToday
        ? 'صيام شهر رمضان'
        : options.isWhiteDayToday && whiteDaysEnabled
          ? 'صيام الأيام البيض'
          : resolvedSpecialToday
            ? `صيام ${resolvedSpecialToday}`
            : `صيام تلقائي (${dayNameMap[options.todayWeekday] ?? 'اليوم'})`
    : options.fastingOverride === 'normal' && autoFastToday
      ? 'إفطار مستثنى لليوم'
      : 'يوم عادي';

  const appliedHeatBonusMl = Math.max(0, Math.round(options.heatBonusMl ?? 0));
  const hydration = computeScientificHydration(profile, isFastingToday, appliedHeatBonusMl);

  // --- Unified Dynamic Sleep Solver (fixed seasonal & circadian rules) ---
  const solvedSleep = computeSeasonalSleepPlan({
    fajrMin: fajr,
    sunriseMin: sunrise,
    dhuhrMin: dhuhr,
    asrMin: asr,
    maghribMin: maghrib,
    ishaMin: isha,
    isFasting: isFastingTomorrow,
    isRamadan: isRamadanToday,
    targetSleepMin: profile.sleepTargetMinutes || SEASONAL_SLEEP_CONSTANTS.DEFAULT_TARGET_SLEEP_MIN,
  });

  let bedtimeMin = solvedSleep.bedtimeMin;
  const wakeMin = solvedSleep.wakeTimeMin;
  const suhoorStartMin = isFastingTomorrow ? wakeMin : null;
  const qailulahStartMin = solvedSleep.postDhuhrNapStartMin;
  const qailulahDurationMin = solvedSleep.postDhuhrNapDurationMin;
  const postFajrStartMin = solvedSleep.postFajrStartMin;
  const postFajrEndMin = solvedSleep.postFajrEndMin;
  const postFajrDurationMin = solvedSleep.postFajrDurationMin;

  let eveningStudyTrimMin = 0;
  let conflictWarningAr: string | null = null;
  let autoAdaptationProposalAr: string | null = null;
  let sleepAdviceAr = '';

  const normalWakeMin = wrap1440(fajr - SEASONAL_SLEEP_CONSTANTS.NORMAL_WAKE_BEFORE_FAJR_MIN);
  const idealNormalBed = wrap1440(normalWakeMin - solvedSleep.targetSleepMin);

  if (solvedSleep.mode === 'long_night') {
    if (isFastingTomorrow && suhoorStartMin !== null) {
      const shiftEarlier = durationForward(bedtimeMin, idealNormalBed);
      eveningStudyTrimMin =
        shiftEarlier > 0 && shiftEarlier < 180
          ? shiftEarlier
          : SEASONAL_SLEEP_CONSTANTS.FASTING_WAKE_BEFORE_FAJR_MIN -
            SEASONAL_SLEEP_CONSTANTS.NORMAL_WAKE_BEFORE_FAJR_MIN;
      autoAdaptationProposalAr = `ليلة سحور غداً: تقديم النوم الليلي إلى ${formatMinutes12h(bedtimeMin)} وتقليل المذاكرة المسائية تلقائياً بـ ${eveningStudyTrimMin} د حتى تستيقظ للسحور (${formatMinutes12h(suhoorStartMin)}) بـ ${formatDurationAr(solvedSleep.targetSleepMin)} نوم ليلي كامل.`;
      sleepAdviceAr = `نوم ليلي متكامل (${formatDurationAr(solvedSleep.targetSleepMin)}) قبل سحور غداً بـ ${SEASONAL_SLEEP_CONSTANTS.FASTING_WAKE_BEFORE_FAJR_MIN} د — بدون قيلولة.`;
    } else {
      sleepAdviceAr = `نوم ليلي متكامل (${formatDurationAr(solvedSleep.targetSleepMin)}) يحفظ حضور الفجر والشروق (${formatMinutes12h(sunrise)}) والغروب (${formatMinutes12h(maghrib)}).`;
    }
  } else if (solvedSleep.mode === 'medium_night') {
    eveningStudyTrimMin = Math.min(180, Math.max(45, solvedSleep.deficitMin + 30));
    conflictWarningAr = `الليل الفلكي بين العشاء و${suhoorStartMin !== null ? 'السحور' : 'الفجر'} هو ${formatDurationAr(solvedSleep.availableNightMin)} (أقل من هدف ${formatDurationAr(solvedSleep.targetSleepMin)} بـ ${formatDurationAr(solvedSleep.deficitMin)}). تم تثبيت النوم عند ${formatMinutes12h(bedtimeMin)} مع قيلولة تعويضية بعد الظهر (${qailulahDurationMin} د).`;
    autoAdaptationProposalAr = `تمت جدولة قيلولة تعويضية بعد الظهر (${formatMinutes12h(qailulahStartMin!)} · ${qailulahDurationMin} د) دون المساس بضوء الشروق أو الغروب.`;
    sleepAdviceAr = `نوم ليلي (${formatDurationAr(solvedSleep.availableNightMin)}) + قيلولة بعد الظهر (${qailulahDurationMin} د الساعة ${formatMinutes12h(qailulahStartMin!)}).`;
  } else {
    eveningStudyTrimMin = Math.min(180, Math.max(60, solvedSleep.deficitMin + 30));
    conflictWarningAr = `الليل القصير (${formatDurationAr(solvedSleep.availableNightMin)}) — تم تفعيل تعويض بعد الفجر${postFajrDurationMin > 0 ? ` (${postFajrDurationMin} د حتى الشروق)` : ''} + قيلولة خفيفة بعد الظهر (${qailulahDurationMin} د).`;
    autoAdaptationProposalAr = `بروتوكول الليل القصير: نوم ليلي (${formatMinutes12h(bedtimeMin)} – ${formatMinutes12h(wakeMin)})${postFajrStartMin !== null ? ` + تعويض بعد الفجر (${formatMinutes12h(postFajrStartMin)} – ${formatMinutes12h(postFajrEndMin!)})` : ''} + قيلولة ${qailulahDurationMin} د بعد الظهر.`;
    sleepAdviceAr = `نوم ليلي (${formatDurationAr(solvedSleep.availableNightMin)})${postFajrDurationMin > 0 ? ` + تعويض الفجر (${postFajrDurationMin} د)` : ''} + قيلولة ${qailulahDurationMin} د بعد الظهر.`;
  }

  // --- Smooth Sleep Debt Recovery (only when Long Night has earlier slack before bedtime) ---
  const sleepDebtMinutes = Math.max(0, Math.min(480, Math.round(profile.sleepDebtMinutes ?? 0)));
  let nightlyRecoveryMin = 0;
  let sleepDebtPlanAr: string | null = null;

  if (sleepDebtMinutes > 0) {
    const desiredRecovery =
      sleepDebtMinutes <= 30
        ? sleepDebtMinutes
        : Math.min(45, Math.max(15, Math.ceil(sleepDebtMinutes / 2 / 15) * 15));
    const availableEarlierSlack = durationForward(solvedSleep.earliestBedtimeMin, bedtimeMin);
    const maxPull = availableEarlierSlack <= 360 ? availableEarlierSlack : 0;
    nightlyRecoveryMin = Math.min(desiredRecovery, maxPull);

    if (nightlyRecoveryMin >= 10) {
      bedtimeMin = wrap1440(bedtimeMin - nightlyRecoveryMin);
      eveningStudyTrimMin += nightlyRecoveryMin;
      const remainingAfterTonight = Math.max(0, sleepDebtMinutes - nightlyRecoveryMin);
      sleepDebtPlanAr =
        remainingAfterTonight > 0
          ? `تم تقديم نوم الليلة تلقائياً بـ ${nightlyRecoveryMin} د (إلى ${formatMinutes12h(bedtimeMin)}) لتعويض جزء من العجز، وسيتبقى ${formatDurationAr(remainingAfterTonight)} لليلة التالية.`
          : `تم تقديم نوم الليلة تلقائياً بـ ${nightlyRecoveryMin} د (إلى ${formatMinutes12h(bedtimeMin)}) لتسديد كامل العجز والعودة لتوازنك غداً.`;
    } else {
      sleepDebtPlanAr = `موعد النوم بالفعل عند الحد الأبكر (${formatMinutes12h(bedtimeMin)}) — راقب القيلولة التعويضية بعد الظهر.`;
    }
  }

  const coreNightSleepMin = Math.max(0, durationForward(bedtimeMin, wakeMin));
  const totalSleepMin = coreNightSleepMin + postFajrDurationMin + qailulahDurationMin;

  // --- Year-Round Seasonal Sleep Intelligence (Circadian Cycles + Diurnal Sunrise/Sunset Protection) ---
  const completedCycles = Math.max(2, Math.floor(coreNightSleepMin / 90));
  const caffeineCutoffMin = wrap1440(bedtimeMin - 8 * 60);
  const maxNightWindowMin = solvedSleep.availableNightMin;
  const seasonalPhase: SeasonalSleepPhase =
    maxNightWindowMin < 360
      ? 'short_summer_night'
      : maxNightWindowMin < solvedSleep.targetSleepMin
        ? 'transitional_tight'
        : maxNightWindowMin >= solvedSleep.targetSleepMin + 90
          ? 'abundant_winter'
          : 'balanced_equinox';

  const phaseLabelMap: Record<SeasonalSleepPhase, string> = {
    abundant_winter: 'ليل شتوي طويل ومريح',
    balanced_equinox: 'توازن فصلي مثالي',
    transitional_tight: 'ليل انتقالي + قيلولة تعويضية',
    short_summer_night: 'بروتوكول الليل القصير',
  };

  const windDownStartMin =
    seasonalPhase === 'short_summer_night' || seasonalPhase === 'transitional_tight'
      ? Math.max(wrap1440(maghrib + 15), wrap1440(bedtimeMin - 45))
      : wrap1440(bedtimeMin - 35);

  const nsdrWindowAr =
    qailulahStartMin !== null
      ? `قيلولة تعويضية ${qailulahDurationMin} د الساعة ${formatMinutes12h(qailulahStartMin)} (بعد الظهر وبعيداً عن الشروق والغروب)`
      : 'صفر نوم نهاري — نوم ليلي كامل مع ضوء الشروق الصباحي';

  const protocolSummaryAr =
    solvedSleep.mode === 'short_night'
      ? `نوم ليلي (${formatMinutes12h(bedtimeMin)} – ${formatMinutes12h(wakeMin)})${postFajrDurationMin > 0 ? ` + تعويض بعد الفجر (${postFajrDurationMin} د حتى الشروق)` : ''} + قيلولة ${qailulahDurationMin} د بعد الظهر.`
      : solvedSleep.mode === 'medium_night'
        ? `نوم ليلي (${formatMinutes12h(bedtimeMin)} – ${formatMinutes12h(wakeMin)} · ${formatDurationAr(coreNightSleepMin)}) + قيلولة ${qailulahDurationMin} د الساعة ${formatMinutes12h(qailulahStartMin!)}.`
        : seasonalPhase === 'abundant_winter'
          ? `متّسع ليلي مريح (${formatDurationAr(maxNightWindowMin)} متاح) يكفي ${completedCycles} دورات نوم كاملة (${formatDurationAr(coreNightSleepMin)}) بدون قيلولة.`
          : `إيقاع متوازن (${completedCycles} دورات · ${formatDurationAr(coreNightSleepMin)}) من ${formatMinutes12h(bedtimeMin)} حتى ${formatMinutes12h(wakeMin)} بدون قيلولة.`;

  const seasonalSleep: SeasonalSleepGuidance = {
    phase: seasonalPhase,
    mode: solvedSleep.mode,
    phaseLabelAr: phaseLabelMap[seasonalPhase],
    astronomicalNightMin: maxNightWindowMin,
    completedCycles,
    windDownStartMin,
    caffeineCutoffMin,
    nsdrWindowAr,
    protocolSummaryAr,
    postFajrStartMin,
    postFajrEndMin,
    postFajrDurationMin,
  };

  // --- Scientific Hydration Distribution (12-Hour Aware, Zero Water During Fast) ---
  const hydrationSlots: HydrationScheduleSlot[] = [];

  if (isFastingToday) {
    const suhoorCups = Math.min(2, Math.max(1, Math.floor(hydration.activeTargetCups / 4)));
    const eveningCups = Math.max(1, hydration.activeTargetCups - suhoorCups);

    // Suhoor happens strictly before Fajr; place it first to match sequential slot logging.
    const suhoorLead = SEASONAL_SLEEP_CONSTANTS.FASTING_WAKE_BEFORE_FAJR_MIN;
    const suhoorBegin = wrap1440(fajr - suhoorLead);
    const maxSuhoorSpan = Math.max(0, suhoorLead - 5);
    const suhoorSpan = Math.min(maxSuhoorSpan, Math.max(5, suhoorLead - 10));
    for (let s = 0; s < suhoorCups; s++) {
      const offset =
        suhoorCups === 1
          ? Math.min(10, Math.floor(suhoorLead / 2))
          : Math.round((s * suhoorSpan) / (suhoorCups - 1));
      hydrationSlots.push({
        cupIndex: s + 1,
        timeMinutes: wrap1440(suhoorBegin + offset),
        windowAr: 'السحور',
        noteAr: '',
      });
    }

    // Evening window strictly inside Maghrib -> Fajr (never spills into Fajr -> Maghrib daytime).
    const eveningStart = maghrib;
    const maxAllowedEveningSpan = Math.max(10, durationForward(eveningStart, fajr) - 10);
    const rawEveningEnd = wrap1440(bedtimeMin - 45);
    const rawEveningSpan = durationForward(eveningStart, rawEveningEnd);
    const eveningSpan =
      rawEveningSpan < maxAllowedEveningSpan
        ? Math.min(maxAllowedEveningSpan, Math.max(45, rawEveningSpan))
        : Math.min(
            maxAllowedEveningSpan,
            Math.max(15, Math.min(durationForward(eveningStart, bedtimeMin), maxAllowedEveningSpan))
          );
    const step = eveningCups > 1 ? Math.floor(eveningSpan / (eveningCups - 1)) : 0;

    for (let i = 0; i < eveningCups; i++) {
      const tMin = wrap1440(eveningStart + i * step);
      let windowAr = '';
      if (i === 0) windowAr = 'عند الإفطار';
      else if (i === eveningCups - 1) windowAr = 'قبل النوم';
      hydrationSlots.push({
        cupIndex: suhoorCups + i + 1,
        timeMinutes: tMin,
        windowAr,
        noteAr: '',
      });
    }
  } else {
    const startMin = wrap1440(fajr + 20);
    const stopMin = wrap1440(bedtimeMin - 75);
    const awakeSpan = Math.max(360, durationForward(startMin, stopMin));
    const total = hydration.activeTargetCups;
    const step = total > 1 ? awakeSpan / (total - 1) : 0;

    for (let i = 0; i < total; i++) {
      const tMin = wrap1440(startMin + Math.round(i * step));
      hydrationSlots.push({
        cupIndex: i + 1,
        timeMinutes: tMin,
        windowAr: '',
        noteAr: '',
      });
    }
  }

  const isWorkDayToday = profile.workEnabled && profile.workDays.includes(options.todayWeekday);

  return {
    isFastingToday,
    isFastingTomorrow,
    isRamadan: isRamadanToday,
    fastingReasonAr,
    heatBonusMl: appliedHeatBonusMl,
    normalTargetMl: hydration.normalTargetMl,
    fastingMinTargetMl: hydration.fastingMinTargetMl,
    activeTargetMl: hydration.activeTargetMl,
    normalTargetCups: hydration.normalTargetCups,
    fastingTargetCups: hydration.fastingTargetCups,
    activeTargetCups: hydration.activeTargetCups,
    cupSizeMl: hydration.cupMl,
    hydrationSlots,
    bedtimeMin,
    wakeMin,
    sunriseMin: sunrise,
    maghribMin: maghrib,
    suhoorStartMin,
    coreNightSleepMin,
    sleepMode: solvedSleep.mode,
    postFajrStartMin,
    postFajrEndMin,
    postFajrDurationMin,
    qailulahStartMin,
    qailulahDurationMin,
    totalSleepMin,
    eveningStudyTrimMin,
    sleepDebtMinutes,
    nightlyRecoveryMin,
    sleepDebtPlanAr,
    sleepAdviceAr,
    conflictWarningAr,
    autoAdaptationProposalAr,
    seasonalSleep,
    isWorkDayToday,
  };
}

/**
 * Computes annual summer shortest vs winter longest night (Isha+20m → Fajr-15m) at the user's coordinates
 * so AI & sleep UI can guide year-round diurnal sleep adaptation.
 */
export function computeAnnualSleepForecast(location: GeoLocation): {
  summerMinNightMin: number;
  winterMaxNightMin: number;
  summerFajrMin: number;
  summerIshaMin: number;
  winterFajrMin: number;
  winterIshaMin: number;
} {
  const year = new Date().getFullYear();
  const summerSolstice = new Date(Date.UTC(year, 5, 21, 12, 0, 0));
  const winterSolstice = new Date(Date.UTC(year, 11, 21, 12, 0, 0));
  const sPrayers = calculateEgyptianPrayerTimes(location, summerSolstice);
  const wPrayers = calculateEgyptianPrayerTimes(location, winterSolstice);

  const sFajr = sPrayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 240;
  const sIsha = sPrayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 1230;
  const wFajr = wPrayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 310;
  const wIsha = wPrayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 1090;

  const sNight = Math.max(
    0,
    durationForward(
      wrap1440(sIsha + SEASONAL_SLEEP_CONSTANTS.NORMAL_BED_AFTER_ISHA_MIN),
      wrap1440(sFajr - SEASONAL_SLEEP_CONSTANTS.NORMAL_WAKE_BEFORE_FAJR_MIN)
    )
  );
  const wNight = Math.max(
    0,
    durationForward(
      wrap1440(wIsha + SEASONAL_SLEEP_CONSTANTS.NORMAL_BED_AFTER_ISHA_MIN),
      wrap1440(wFajr - SEASONAL_SLEEP_CONSTANTS.NORMAL_WAKE_BEFORE_FAJR_MIN)
    )
  );

  return {
    summerMinNightMin: sNight,
    winterMaxNightMin: wNight,
    summerFajrMin: sFajr,
    summerIshaMin: sIsha,
    winterFajrMin: wFajr,
    winterIshaMin: wIsha,
  };
}

/**
 * Autonomous Future Season Simulator (e.g. +5 months ahead):
 * Shows exactly how prayers, night-only sleep, suhoor, and flexible study automatically adapt
 * when seasons shift without any manual reconfiguration.
 */
export function simulateFutureSeasonPlan(
  profile: LifeProfile,
  location: GeoLocation,
  monthsAhead: number
): {
  dateLabelAr: string;
  fajrMin: number;
  ishaMin: number;
  normalNightPlan: DailyRhythmPlan;
  fastingEvePlan: DailyRhythmPlan;
} {
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + monthsAhead);
  const futurePrayers = calculateEgyptianPrayerTimes(location, futureDate);
  const fajrMin = futurePrayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 15;
  const ishaMin = futurePrayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 21 * 60;

  // Normal weekday (e.g., Tue -> Wed)
  const normalNightPlan = computeDailyRhythmPlan(profile, futurePrayers, {
    todayWeekday: 2,
    tomorrowWeekday: 3,
    fastingOverride: 'normal',
  });

  // Fasting eve (Sun -> Mon)
  const fastingEvePlan = computeDailyRhythmPlan(profile, futurePrayers, {
    todayWeekday: 0,
    tomorrowWeekday: 1,
    fastingOverride: 'auto',
  });

  const dateLabelAr = new Intl.DateTimeFormat('ar-EG', {
    month: 'long',
    year: 'numeric',
  }).format(futureDate);

  return {
    dateLabelAr,
    fajrMin,
    ishaMin,
    normalNightPlan,
    fastingEvePlan,
  };
}

export function countCreativeSessionsThisWeek(
  loggedDates: string[],
  todayIso: string
): number {
  if (!Array.isArray(loggedDates) || loggedDates.length === 0) return 0;
  const todayDate = new Date(`${todayIso}T12:00:00Z`);
  if (Number.isNaN(todayDate.getTime())) return 0;
  // Week starts on Saturday (day 6) in Egypt/Arab calendar: offset 0 for Sat, 1 for Sun ... 6 for Fri
  const dow = todayDate.getUTCDay(); // 0=Sun .. 6=Sat
  const daysSinceSaturday = (dow + 1) % 7;
  const weekStartMs = todayDate.getTime() - daysSinceSaturday * 86_400_000;
  const weekEndMs = todayDate.getTime() + 86_400_000;

  const unique = new Set<string>();
  for (const iso of loggedDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    const ms = new Date(`${iso}T12:00:00Z`).getTime();
    if (ms >= weekStartMs && ms < weekEndMs) {
      unique.add(iso);
    }
  }
  return unique.size;
}

export function countCreativeSessionsInPeriod(
  loggedDates: string[],
  todayIso: string,
  cadence: CreativeCadence = 'weekly'
): number {
  if (!Array.isArray(loggedDates) || loggedDates.length === 0) return 0;
  if (cadence === 'daily') {
    return loggedDates.includes(todayIso) ? 1 : 0;
  }
  if (cadence === 'monthly') {
    const monthPrefix = todayIso.slice(0, 7);
    const unique = new Set<string>();
    for (const iso of loggedDates) {
      if (iso.startsWith(monthPrefix)) unique.add(iso);
    }
    return unique.size;
  }
  return countCreativeSessionsThisWeek(loggedDates, todayIso);
}

export function analyzeTomorrowAlert(
  calendarEvents: GoogleCalendarEventItem[],
  tomorrowIso: string,
  tomorrowWeekday: number
): TomorrowAlertInfo | null {
  if (!tomorrowIso || !Array.isArray(calendarEvents) || calendarEvents.length === 0) {
    return null;
  }

  const dayNameMap: Record<number, string> = {
    0: 'الأحد',
    1: 'الإثنين',
    2: 'الثلاثاء',
    3: 'الأربعاء',
    4: 'الخميس',
    5: 'الجمعة',
    6: 'السبت',
  };
  const weekdayAr = dayNameMap[tomorrowWeekday] ?? 'غداً';

  const tomorrowEvents = calendarEvents.filter((ev) => {
    const startDate = String(ev.start ?? '').slice(0, 10);
    if (startDate !== tomorrowIso) return false;
    const summary = String(ev.summary ?? '').toLowerCase();
    // Skip automated routine water/prayer mirrors so only real commitments trigger alerts
    if (/💧|كوب ماء|water cup|أذان|صلاة الفجر|صلاة الظهر|صلاة العصر|صلاة المغرب|صلاة العشاء/.test(summary)) {
      return false;
    }
    return true;
  });

  if (tomorrowEvents.length === 0) return null;

  const SPECIAL_PATTERNS: Array<{ re: RegExp; reasonAr: string }> = [
    { re: /سفر|رحلة|طيران|مطار|قطار|أتوبيس|باص|flight|airport|train|travel|trip/i, reasonAr: 'سفر / تنقّل' },
    { re: /دكتور|طبيب|عيادة|مستشفى|تحليل|أشعة|علاج|doctor|clinic|hospital|medical|dentist/i, reasonAr: 'موعد طبي' },
    { re: /مقابلة|إنترفيو|انترفيو|امتحان|اختبار|تسليم|deadline|interview|exam/i, reasonAr: 'موعد هام' },
    { re: /اجتماع|لقاء|مكالمة|مؤتمر|meeting|call|sync/i, reasonAr: 'اجتماع مجدول' },
    { re: /موعد|زيارة|مناسبة|فرح|خطوبة|حجز|appointment|visit|booking/i, reasonAr: 'موعد خاص' },
  ];

  let totalMinutes = 0;
  let timedCount = 0;
  const specialEvents: Array<{ title: string; timeLabel: string; reasonAr: string }> = [];

  for (const ev of tomorrowEvents) {
    const title = String(ev.summary ?? 'حدث').trim();
    const text = `${title} ${ev.description ?? ''} ${ev.location ?? ''}`;
    let timeLabel = 'طوال اليوم';

    if (!ev.isAllDay && ev.start && ev.end) {
      timedCount += 1;
      const startDt = new Date(ev.start);
      const endDt = new Date(ev.end);
      if (!Number.isNaN(startDt.getTime()) && !Number.isNaN(endDt.getTime())) {
        const mins = Math.max(15, Math.min(720, Math.round((endDt.getTime() - startDt.getTime()) / 60_000)));
        totalMinutes += mins;
        const startMin = startDt.getHours() * 60 + startDt.getMinutes();
        timeLabel = formatMinutes12h(startMin);
      }
    }

    for (const pat of SPECIAL_PATTERNS) {
      if (pat.re.test(text)) {
        specialEvents.push({ title, timeLabel, reasonAr: pat.reasonAr });
        break;
      }
    }
  }

  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const isBusy = timedCount >= 4 || totalMinutes >= 270;
  const hasSpecialEvent = specialEvents.length > 0;

  if (!isBusy && !hasSpecialEvent) return null;

  const firstSpecial = specialEvents[0];
  let headlineAr = '';
  let detailAr = '';

  if (hasSpecialEvent && isBusy) {
    headlineAr = `غداً ${weekdayAr} مزدحم وفيه ${firstSpecial.reasonAr}`;
    detailAr = `${firstSpecial.title} (${firstSpecial.timeLabel}) ضمن ${tomorrowEvents.length} أحداث (${totalHours} س) — يمكنك التنسيق المسبق مع Gemini الآن.`;
  } else if (hasSpecialEvent) {
    headlineAr = `تذكير مبكر لغد ${weekdayAr} · ${firstSpecial.reasonAr}`;
    detailAr =
      specialEvents.length === 1
        ? `${firstSpecial.title} الساعة ${firstSpecial.timeLabel} — جهّز له من اليوم حتى لا تتفاجأ.`
        : `${firstSpecial.title} (${firstSpecial.timeLabel}) و${specialEvents.length - 1} موعد آخر غداً.`;
  } else {
    headlineAr = `غداً ${weekdayAr} جدولك مزدحم نسبياً`;
    detailAr = `${tomorrowEvents.length} أحداث مجدولة (${totalHours} س) — يمكنك مراجعة وترتيب يومك مسبقاً مع Gemini.`;
  }

  return {
    tomorrowIso,
    weekdayAr,
    isBusy,
    hasSpecialEvent,
    eventCount: tomorrowEvents.length,
    totalHours,
    specialEvents,
    headlineAr,
    detailAr,
  };
}

export interface ComputeFreeWindowsInput {
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile?: LifeProfile;
  occupiedBlocks?: ScheduleBlock[];
  calendarEvents?: GoogleCalendarEventItem[];
  todayIso?: string;
  timeZone?: string;
  minGapMinutes?: number;
}

function getFreeWindowPeriodLabelAr(
  startMin: number,
  prayers: PrayerTimeItem[],
  plan: DailyRhythmPlan
): string {
  const fajr = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const sunrise = prayers.find((p) => p.id === 'sunrise')?.adhanMinutes ?? plan.sunriseMin;
  const dhuhr = prayers.find((p) => p.id === 'dhuhr')?.adhanMinutes ?? 12 * 60;
  const asr = prayers.find((p) => p.id === 'asr')?.adhanMinutes ?? 15 * 60 + 15;
  const maghrib = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? plan.maghribMin;
  const isha = prayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 19 * 60 + 30;

  if (startMin < fajr) return 'قبل الفجر';
  if (startMin < sunrise) return 'بعد الفجر';
  if (startMin < dhuhr) return 'الصباح';
  if (startMin < asr) return 'بعد الظهر';
  if (startMin < maghrib) return 'بعد العصر';
  if (startMin < isha) return 'بعد المغرب';
  return 'بعد العشاء';
}

function parseTime24Minutes(hhmm: string, fallback: number): number {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  return clamp(Number(m[1]) * 60 + Number(m[2]), 0, 1439);
}

/**
 * Computes all genuine free windows between wake time and bedtime by merging:
 * 1) The 5 daily obligatory prayers (-5m to +20m buffer, or configured lead/silence if larger)
 * 2) Resolved seasonal night sleep, Suhoor window (fasting days), post-Fajr recovery & post-Dhuhr nap
 * 3) Active fixed work hours (if enabled today)
 * 4) Fixed Google Calendar / scheduled events for the day
 * Micro-gaps shorter than minGapMinutes (default 20) are filtered out.
 */
export function computeFreeWindows(input: ComputeFreeWindowsInput): FreeWindow[] {
  const { prayers, plan, profile, occupiedBlocks = [], calendarEvents = [] } = input;
  const minGap = Math.max(1, Math.round(input.minGapMinutes ?? 20));

  const dayStart = clamp(plan.wakeMin, 0, 1439);
  const dayEnd = plan.bedtimeMin > dayStart ? clamp(plan.bedtimeMin, 0, 1440) : 1440;
  if (dayEnd <= dayStart + minGap) return [];

  const busy: Array<[number, number]> = [];

  // 1. Night sleep bounds (if bedtime wraps past midnight, [bedtime, wake] precedes dayStart)
  if (dayStart > 0) busy.push([0, dayStart]);
  if (dayEnd < 1440) busy.push([dayEnd, 1440]);

  // 2. Suhoor window on fasting days / fasting eve
  const fajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  if (plan.isFastingToday || plan.suhoorStartMin !== null) {
    const suhoorLead =
      profile?.suhoorLeadMinutes ?? SEASONAL_SLEEP_CONSTANTS.FASTING_WAKE_BEFORE_FAJR_MIN;
    const suhoorStart =
      plan.suhoorStartMin !== null ? plan.suhoorStartMin : Math.max(0, fajrMin - suhoorLead);
    if (fajrMin > suhoorStart) {
      busy.push([suhoorStart, fajrMin]);
    }
  }

  // 3. The 5 daily prayers with clean buffer (-5m to +20m)
  const preBuffer = Math.max(5, profile?.adhanLeadMinutes ?? 0);
  const postBuffer = Math.max(20, profile?.prayerSilenceMinutes ?? 20);
  for (const p of prayers) {
    if (!p.isObligatory) continue;
    busy.push([p.adhanMinutes - preBuffer, p.adhanMinutes + postBuffer]);
  }

  // 4. Automatic seasonal recovery sleep (post-Fajr block & post-Dhuhr nap)
  if (
    typeof plan.postFajrStartMin === 'number' &&
    typeof plan.postFajrDurationMin === 'number' &&
    plan.postFajrDurationMin > 0
  ) {
    busy.push([plan.postFajrStartMin, plan.postFajrStartMin + plan.postFajrDurationMin]);
  }
  if (plan.qailulahStartMin !== null && plan.qailulahDurationMin > 0) {
    busy.push([plan.qailulahStartMin, plan.qailulahStartMin + plan.qailulahDurationMin]);
  }

  // 5. Active fixed work hours if enabled today
  if (plan.isWorkDayToday && profile?.workEnabled && profile.workStart24 && profile.workEnd24) {
    const ws = parseTime24Minutes(profile.workStart24, 9 * 60);
    const we = parseTime24Minutes(profile.workEnd24, 17 * 60);
    if (we > ws) {
      busy.push([ws, we]);
    }
  }

  // 6. Fixed scheduled blocks (excluding auto-placed creative blocks, prayer anchors, deleted & all-day)
  for (const blk of occupiedBlocks) {
    if (blk.deleted || blk.isAllDay || blk.source === 'creative' || blk.source === 'prayer') {
      continue;
    }
    const dur = blk.durationMin > 0 ? blk.durationMin : 15;
    busy.push([blk.startMin, blk.startMin + dur]);
  }

  // 7. Fixed Google Calendar events (when passed directly)
  if (calendarEvents.length > 0) {
    const tz = input.timeZone ?? profile?.currentTimeZone ?? 'Africa/Cairo';
    for (const ev of calendarEvents) {
      if (ev.isAllDay || !ev.start) continue;
      const startInfo = parseIsoToTimeZoneInfo(ev.start, tz);
      if (startInfo.isAllDay) continue;
      if (input.todayIso && startInfo.dateIso !== input.todayIso) continue;
      const endInfo = ev.end ? parseIsoToTimeZoneInfo(ev.end, tz) : null;
      let endMin = startInfo.minutesSinceMidnight + 15;
      if (endInfo && !endInfo.isAllDay) {
        endMin =
          endInfo.dateIso === startInfo.dateIso
            ? endInfo.minutesSinceMidnight
            : 1440;
      }
      if (endMin > startInfo.minutesSinceMidnight) {
        busy.push([startInfo.minutesSinceMidnight, endMin]);
      }
    }
  }

  // Clamp to awake day [dayStart, dayEnd] and merge overlapping/adjacent intervals
  const clamped: Array<[number, number]> = [];
  for (const [s, e] of busy) {
    const cs = Math.max(dayStart, s);
    const ce = Math.min(dayEnd, e);
    if (ce > cs) clamped.push([cs, ce]);
  }

  clamped.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of clamped) {
    if (merged.length === 0 || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }

  const free: FreeWindow[] = [];
  let cursor = dayStart;
  for (const [bs, be] of merged) {
    if (bs - cursor >= minGap) {
      free.push({
        startMin: cursor,
        endMin: bs,
        durationMin: bs - cursor,
        label: getFreeWindowPeriodLabelAr(cursor, prayers, plan),
      });
    }
    cursor = Math.max(cursor, be);
  }
  if (dayEnd - cursor >= minGap) {
    free.push({
      startMin: cursor,
      endMin: dayEnd,
      durationMin: dayEnd - cursor,
      label: getFreeWindowPeriodLabelAr(cursor, prayers, plan),
    });
  }
  return free;
}

/**
 * Finds genuinely free time windows today away from:
 * 1) Night sleep & wake windows
 * 2) All 5 obligatory prayers + silence buffers
 * 3) Active fixed work hours (if enabled today)
 * 4) All existing scheduled / Google Calendar blocks
 */
export function findFreeTimeSlotsForToday(
  prayers: PrayerTimeItem[],
  plan: DailyRhythmPlan,
  profile: LifeProfile,
  occupiedBlocks: ScheduleBlock[],
  minGapMinutes = 25
): FreeTimeSlot[] {
  return computeFreeWindows({
    prayers,
    plan,
    profile,
    occupiedBlocks,
    minGapMinutes,
  });
}

export const DYNAMIC_HABIT_ANCHOR_LABELS: Record<
  DynamicHabitAnchor,
  { labelAr: string; labelEn: string; emoji: string }
> = {
  'after-fajr': { labelAr: 'بعد الفجر', labelEn: 'After Fajr', emoji: '🌌' },
  'sunrise-light': { labelAr: 'ضوء الشروق', labelEn: 'Sunrise Light', emoji: '🌅' },
  'duha': { labelAr: 'الضحى', labelEn: 'Duha', emoji: '☀️' },
  'after-dhuhr': { labelAr: 'بعد الظهر', labelEn: 'After Dhuhr', emoji: '🕌' },
  'after-asr': { labelAr: 'بعد العصر', labelEn: 'After Asr', emoji: '🌤️' },
  'pre-maghrib': { labelAr: 'قبل المغرب', labelEn: 'Pre-Maghrib', emoji: '🌇' },
  'after-maghrib': { labelAr: 'بعد المغرب', labelEn: 'After Maghrib', emoji: '🌆' },
  'after-isha': { labelAr: 'بعد العشاء', labelEn: 'After Isha', emoji: '🌙' },
  'any-free-slot': { labelAr: 'أي وقت فاضي', labelEn: 'Any Free Slot', emoji: '✨' },
};

export interface ResolveHabitsForDayInput {
  habits: DynamicHabit[];
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  freeWindows?: FreeWindow[];
  profile?: LifeProfile;
  occupiedBlocks?: ScheduleBlock[];
  calendarEvents?: GoogleCalendarEventItem[];
  todayIso: string;
  weekday?: number;
  timeZone?: string;
}

function resolveWeekdayFromIso(todayIso: string): number | null {
  const m = todayIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d.getUTCDay();
}

function getHabitAnchorWindow(
  anchor: DynamicHabitAnchor,
  prayers: PrayerTimeItem[],
  plan: DailyRhythmPlan,
  profile?: LifeProfile
): { start: number; end: number; ideal: number; preferEnd: boolean } | null {
  if (anchor === 'any-free-slot') return null;

  const fajr = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const sunrise = prayers.find((p) => p.id === 'sunrise')?.adhanMinutes ?? plan.sunriseMin;
  const dhuhr = prayers.find((p) => p.id === 'dhuhr')?.adhanMinutes ?? 12 * 60;
  const asr = prayers.find((p) => p.id === 'asr')?.adhanMinutes ?? 15 * 60 + 15;
  const maghrib = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? plan.maghribMin;
  const isha = prayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 19 * 60 + 30;
  const preBuffer = Math.max(5, profile?.adhanLeadMinutes ?? 0);
  const postBuffer = Math.max(20, profile?.prayerSilenceMinutes ?? 20);
  const bedtime = plan.bedtimeMin > plan.wakeMin ? plan.bedtimeMin : 1440;

  switch (anchor) {
    case 'after-fajr':
      return { start: fajr + postBuffer, end: sunrise, ideal: fajr + postBuffer, preferEnd: false };
    case 'sunrise-light':
      return {
        start: sunrise + 15,
        end: Math.min(dhuhr - preBuffer, sunrise + 75),
        ideal: sunrise + 15,
        preferEnd: false,
      };
    case 'duha':
      return {
        start: sunrise + 30,
        end: dhuhr - preBuffer,
        ideal: Math.min(dhuhr - 45, sunrise + 75),
        preferEnd: false,
      };
    case 'after-dhuhr':
      return {
        start: dhuhr + postBuffer,
        end: asr - preBuffer,
        ideal: dhuhr + postBuffer,
        preferEnd: false,
      };
    case 'after-asr':
      return {
        start: asr + postBuffer,
        end: maghrib - preBuffer,
        ideal: asr + postBuffer,
        preferEnd: false,
      };
    case 'pre-maghrib':
      return {
        start: Math.max(asr + postBuffer, maghrib - 75),
        end: maghrib - preBuffer,
        ideal: maghrib - preBuffer,
        preferEnd: true,
      };
    case 'after-maghrib':
      return {
        start: maghrib + postBuffer,
        end: isha - preBuffer,
        ideal: maghrib + postBuffer,
        preferEnd: false,
      };
    case 'after-isha':
      return {
        start: isha + postBuffer,
        end: bedtime,
        ideal: isha + postBuffer,
        preferEnd: false,
      };
  }
}

/**
 * Dynamically places `'active'` habits for today into genuine non-overlapping slots
 * inside `computeFreeWindows` according to each habit's prayer/sun anchor, falling back
 * to the nearest available free window (or marking flexible if none fits).
 * `'planned'` habits are strictly excluded until activated.
 */
export function resolveHabitsForDay(input: ResolveHabitsForDayInput): ResolvedHabitPlacement[] {
  const { habits, prayers, plan, profile, occupiedBlocks, calendarEvents, todayIso, timeZone } =
    input;
  const activeHabits = habits.filter((h) => h.status === 'active');
  if (activeHabits.length === 0) return [];

  const weekday = input.weekday ?? resolveWeekdayFromIso(todayIso);
  const minHabitDur = activeHabits.reduce(
    (min, h) => Math.min(min, Math.max(5, Math.round(h.durationMin || 30))),
    20
  );
  const baseWindows = input.freeWindows
    ? input.freeWindows.map((w) => ({ ...w }))
    : computeFreeWindows({
        prayers,
        plan,
        profile,
        occupiedBlocks,
        calendarEvents,
        todayIso,
        timeZone,
        minGapMinutes: Math.min(20, minHabitDur),
      });

  const remaining: FreeWindow[] = baseWindows.map((w) => ({ ...w }));
  const results = new Array<ResolvedHabitPlacement>(activeHabits.length);

  const dueIndices: number[] = [];
  for (let i = 0; i < activeHabits.length; i++) {
    const habit = activeHabits[i];
    const completedToday = Boolean(todayIso && habit.completedDates.includes(todayIso));
    const scheduledToday =
      !habit.daysOfWeek ||
      habit.daysOfWeek.length === 0 ||
      (weekday !== null && habit.daysOfWeek.includes(weekday));
    if (!scheduledToday) {
      results[i] = {
        habit,
        dueToday: false,
        completedToday,
        skippedReasonAr: 'غير مجدولة اليوم',
        slot: null,
        isFallbackSlot: false,
        isFlexibleUnplaced: false,
      };
      continue;
    }
    if (habit.skipOnFasting && plan.isFastingToday) {
      results[i] = {
        habit,
        dueToday: false,
        completedToday,
        skippedReasonAr: 'مؤجلة في يوم الصيام',
        slot: null,
        isFallbackSlot: false,
        isFlexibleUnplaced: false,
      };
      continue;
    }
    dueIndices.push(i);
  }

  // Place anchor-specific habits before `'any-free-slot'` so anchors are preserved first
  dueIndices.sort((a, b) => {
    const aAny = activeHabits[a].anchor === 'any-free-slot' ? 1 : 0;
    const bAny = activeHabits[b].anchor === 'any-free-slot' ? 1 : 0;
    return aAny - bAny || a - b;
  });

  const claimFromInterval = (winIdx: number, startMin: number, durationMin: number) => {
    const win = remaining[winIdx];
    const endMin = startMin + durationMin;
    const replacements: FreeWindow[] = [];
    if (startMin - win.startMin >= 5) {
      replacements.push({
        startMin: win.startMin,
        endMin: startMin,
        durationMin: startMin - win.startMin,
        label: win.label,
      });
    }
    if (win.endMin - endMin >= 5) {
      replacements.push({
        startMin: endMin,
        endMin: win.endMin,
        durationMin: win.endMin - endMin,
        label: getFreeWindowPeriodLabelAr(endMin, prayers, plan),
      });
    }
    remaining.splice(winIdx, 1, ...replacements);
    return {
      startMin,
      endMin,
      time24: formatMinutes24h(startMin),
      windowLabel: getFreeWindowPeriodLabelAr(startMin, prayers, plan),
    };
  };

  for (const idx of dueIndices) {
    const habit = activeHabits[idx];
    const completedToday = Boolean(todayIso && habit.completedDates.includes(todayIso));
    const dur = clamp(Math.round(habit.durationMin || 30), 5, 240);
    const pref = getHabitAnchorWindow(habit.anchor, prayers, plan, profile);

    let chosenWinIdx = -1;
    let chosenStart = 0;
    let isFallbackSlot = false;

    if (pref && pref.end > pref.start) {
      if (pref.preferEnd) {
        for (let w = remaining.length - 1; w >= 0; w--) {
          const win = remaining[w];
          const ovS = Math.max(win.startMin, pref.start);
          const ovE = Math.min(win.endMin, pref.end);
          if (ovE - ovS >= dur) {
            chosenWinIdx = w;
            chosenStart = ovE - dur;
            break;
          }
        }
      } else {
        for (let w = 0; w < remaining.length; w++) {
          const win = remaining[w];
          const ovS = Math.max(win.startMin, pref.start);
          const ovE = Math.min(win.endMin, pref.end);
          if (ovE - ovS >= dur) {
            chosenWinIdx = w;
            chosenStart = ovS;
            break;
          }
        }
      }
    }

    if (chosenWinIdx === -1) {
      if (!pref) {
        for (let w = 0; w < remaining.length; w++) {
          if (remaining[w].durationMin >= dur) {
            chosenWinIdx = w;
            chosenStart = remaining[w].startMin;
            break;
          }
        }
      } else {
        let bestDist = Infinity;
        for (let w = 0; w < remaining.length; w++) {
          const win = remaining[w];
          if (win.endMin - win.startMin < dur) continue;
          const targetAnchor = pref.preferEnd ? pref.ideal - dur : pref.ideal;
          const candStart = clamp(targetAnchor, win.startMin, win.endMin - dur);
          const dist = Math.abs(candStart - targetAnchor);
          if (dist < bestDist) {
            bestDist = dist;
            chosenWinIdx = w;
            chosenStart = candStart;
          }
        }
        if (chosenWinIdx !== -1) {
          isFallbackSlot = true;
        }
      }
    }

    if (chosenWinIdx !== -1) {
      results[idx] = {
        habit,
        dueToday: true,
        completedToday,
        slot: claimFromInterval(chosenWinIdx, chosenStart, dur),
        isFallbackSlot,
        isFlexibleUnplaced: false,
      };
    } else {
      results[idx] = {
        habit,
        dueToday: true,
        completedToday,
        slot: null,
        isFallbackSlot: false,
        isFlexibleUnplaced: true,
      };
    }
  }

  return results;
}

export interface SmartScheduleConflictResult {
  hasConflict: boolean;
  warnings: string[];
  suggestedTime24: string | null;
  suggestedTime12Ar: string | null;
}

/**
 * Checks whether a proposed event or medication time conflicts with:
 * 1) Any of the 5 obligatory prayers (lead + silence buffer)
 * 2) Night sleep window (bedtime -> wake)
 * 3) Fasting hours (Fajr -> Maghrib) when scheduling oral medications/supplements on fasting days
 * 4) Existing Google Calendar / Schedule blocks on the target date
 * Also suggests the nearest conflict-free time slot automatically.
 */
export function checkSmartScheduleConflict(params: {
  time24: string;
  durationMinutes?: number;
  dateIso?: string;
  daysOfWeek?: number[];
  isOralMedication?: boolean;
  prayers: PrayerTimeItem[];
  plan: DailyRhythmPlan;
  profile: LifeProfile;
  occupiedBlocks: ScheduleBlock[];
}): SmartScheduleConflictResult {
  const m = params.time24.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    return { hasConflict: false, warnings: [], suggestedTime24: null, suggestedTime12Ar: null };
  }
  const startMin = Math.min(1439, Math.max(0, Number(m[1]) * 60 + Number(m[2])));
  const isZeroDuration = params.durationMinutes === 0;
  const dur = isZeroDuration ? 0 : Math.max(10, Math.min(480, Math.round(params.durationMinutes ?? 15)));
  const endMin = startMin + dur;
  const warnings: string[] = [];

  const { prayers, plan, profile, occupiedBlocks } = params;

  // 1. Obligatory Prayer conflict
  for (const p of prayers) {
    if (!p.isObligatory) continue;
    const silenceLen = p.id === 'fajr' ? profile.fajrSilenceMinutes : profile.prayerSilenceMinutes;
    const pStart = Math.max(0, p.adhanMinutes - profile.adhanLeadMinutes);
    const pEnd = p.adhanMinutes + silenceLen;
    const hasOverlap = isZeroDuration
      ? startMin >= pStart && startMin < pEnd
      : startMin < pEnd && endMin > pStart;
    if (hasOverlap) {
      warnings.push(
        `يتعارض مع وقت صلاة ${p.nameAr} (${formatMinutes12h(p.adhanMinutes)} – ${formatMinutes12h(pEnd)})`
      );
      break;
    }
  }

  // 2. Night Sleep conflict (handles bedtime before midnight -> wake after midnight)
  const bed = plan.bedtimeMin;
  const wake = plan.wakeMin;
  const inSleep = (min: number): boolean => {
    const w = wrap1440(min);
    if (bed > wake) {
      return w >= bed || w < wake;
    }
    return w >= bed && w < wake;
  };
  if (inSleep(startMin) || (!isZeroDuration && inSleep(endMin - 1))) {
    warnings.push(
      `يقع داخل وقت النوم الليلي (${formatMinutes12h(bed)} – ${formatMinutes12h(wake)})`
    );
  }
  if (plan.qailulahStartMin !== null && plan.qailulahDurationMin > 0) {
    const qStart = plan.qailulahStartMin;
    const qEnd = qStart + plan.qailulahDurationMin;
    const hitsNap = isZeroDuration
      ? startMin >= qStart && startMin < qEnd
      : startMin < qEnd && endMin > qStart;
    if (hitsNap) {
      warnings.push(
        `يتداخل مع القيلولة التعويضية (${formatMinutes12h(qStart)} – ${formatMinutes12h(qEnd)})`
      );
    }
  }

  // 3. Fasting window conflict for oral medications/supplements
  let hitsFastingDay = false;
  if (params.isOralMedication) {
    const fajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
    const maghribMin = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;
    const targetDays =
      Array.isArray(params.daysOfWeek) && params.daysOfWeek.length > 0
        ? params.daysOfWeek
        : [0, 1, 2, 3, 4, 5, 6];
    const targetDateWeekday = params.dateIso
      ? new Date(`${params.dateIso}T12:00:00Z`).getUTCDay()
      : -1;
    hitsFastingDay =
      targetDays.some((d) =>
        isFastingDay({
          weekday: d,
          fastingDays: profile.fastingDays,
        })
      ) ||
      (Boolean(params.dateIso) &&
        isFastingDay({
          weekday: targetDateWeekday,
          fastingDays: profile.fastingDays,
          dateIso: params.dateIso,
          timeZone: profile.currentTimeZone,
        })) ||
      plan.isFastingToday;
    if (hitsFastingDay && startMin >= fajrMin && startMin < maghribMin) {
      warnings.push(
        `يتعارض مع ساعات الصيام (الفجر ${formatMinutes12h(fajrMin)} – المغرب ${formatMinutes12h(maghribMin)}) في أيام صيامك`
      );
    }
  }

  // 4. Existing schedule / Calendar event overlap (checked for today or recurring daily items)
  for (const blk of occupiedBlocks) {
    if (blk.deleted || blk.isAllDay || blk.isAnchor || blk.source === 'creative') continue;
    const bStart = blk.startMin;
    const bEnd = blk.startMin + Math.max(15, blk.durationMin);
    const hasOverlap = isZeroDuration
      ? startMin >= bStart && startMin < bEnd
      : startMin < bEnd && endMin > bStart;
    if (hasOverlap) {
      const blkLabel = (blk.categoryAr || blk.emojiPair || 'موعد آخر').trim().slice(0, 42);
      warnings.push(
        `يتداخل مع «${blkLabel}» (${formatMinutes12h(bStart)} – ${formatMinutes12h(bEnd)})`
      );
      break;
    }
  }

  if (warnings.length === 0) {
    return { hasConflict: false, warnings: [], suggestedTime24: null, suggestedTime12Ar: null };
  }

  // Suggest nearest conflict-free slot from today's genuine free windows
  const freeSlots = findFreeTimeSlotsForToday(prayers, plan, profile, occupiedBlocks, Math.min(dur, 20));
  const fajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const maghribMin = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;

  let bestStart: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const slot of freeSlots) {
    if (slot.durationMin < dur) continue;
    let candidate = Math.max(slot.startMin, Math.min(startMin, slot.endMin - dur));
    if (params.isOralMedication && hitsFastingDay) {
      if (candidate >= fajrMin && candidate < maghribMin) {
        // Prefer after Maghrib if fasting conflict exists
        if (slot.endMin - dur >= maghribMin + 15) {
          candidate = Math.max(slot.startMin, maghribMin + 15);
        } else {
          continue;
        }
      }
    }
    const dist = Math.abs(candidate - startMin);
    if (dist < bestDist) {
      bestDist = dist;
      bestStart = candidate;
    }
  }

  // Fallback suggestion right after Maghrib for oral meds during fasting if no slot matched
  if (bestStart === null && params.isOralMedication) {
    bestStart = wrap1440(maghribMin + 25);
  }

  const suggestedTime24 = bestStart !== null ? formatMinutes24h(bestStart) : null;
  const suggestedTime12Ar = bestStart !== null ? formatMinutes12h(bestStart, 'ar') : null;

  return {
    hasConflict: true,
    warnings,
    suggestedTime24,
    suggestedTime12Ar,
  };
}

/**
 * Auto-places active (non-expired) creative activities into genuinely free non-overlapping slots today,
 * supporting daily / weekly / monthly cadences and scaling gracefully to many activities.
 */
export function computeCreativePlacements(
  activities: CreativeActivityItem[],
  freeSlots: FreeTimeSlot[],
  todayIso: string,
  nowMin: number
): CreativeActivityPlacement[] {
  const remaining: FreeTimeSlot[] = freeSlots.map((s) => ({ ...s }));

  const claimSlot = (durationMin: number): { startMin: number; endMin: number; time24: string } | null => {
    const needed = Math.max(15, durationMin);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < remaining.length; i++) {
        const slot = remaining[i];
        const candidateStart =
          pass === 0 ? Math.max(slot.startMin, Math.ceil(nowMin / 5) * 5) : slot.startMin;
        if (slot.endMin - candidateStart >= needed) {
          const endMin = candidateStart + needed;
          const beforeEnd = candidateStart - 10;
          const afterStart = endMin + 10;
          const replacements: FreeTimeSlot[] = [];
          if (beforeEnd - slot.startMin >= 20) {
            replacements.push({
              startMin: slot.startMin,
              endMin: beforeEnd,
              durationMin: beforeEnd - slot.startMin,
            });
          }
          if (slot.endMin - afterStart >= 20) {
            replacements.push({
              startMin: afterStart,
              endMin: slot.endMin,
              durationMin: slot.endMin - afterStart,
            });
          }
          remaining.splice(i, 1, ...replacements);
          return {
            startMin: candidateStart,
            endMin,
            time24: formatMinutes24h(candidateStart),
          };
        }
      }
    }
    return null;
  };

  // Hide temporary activities that have already passed their expiry date
  const activeActivities = activities.filter(
    (act) => !act.expiresOnDate || act.expiresOnDate >= todayIso
  );

  return activeActivities.map((activity) => {
    const cadence: CreativeCadence = activity.cadence ?? 'weekly';
    const goalInPeriod = Math.max(1, activity.goalCount ?? activity.weeklyGoalSessions ?? 3);
    const sessionsThisWeek = countCreativeSessionsThisWeek(activity.loggedDates, todayIso);
    const sessionsInPeriod = countCreativeSessionsInPeriod(activity.loggedDates, todayIso, cadence);
    const periodLabelAr =
      cadence === 'daily' ? 'اليوم' : cadence === 'monthly' ? 'هذا الشهر' : 'هذا الأسبوع';
    const doneToday = activity.loggedDates.includes(todayIso);
    const goalAlreadyMet = sessionsInPeriod >= goalInPeriod;
    const suggestedSlot = doneToday || goalAlreadyMet ? null : claimSlot(activity.sessionMinutes);
    return {
      activity,
      cadence,
      sessionsInPeriod,
      goalInPeriod,
      periodLabelAr,
      sessionsThisWeek,
      doneToday,
      suggestedSlot,
    };
  });
}

export function buildLifeProfileGeminiSummary(
  profile: LifeProfile,
  plan: DailyRhythmPlan,
  memories: MemoryItem[] = [],
  weather: WeatherHydrationInfo | null = null,
  calendarMeta: TodayCalendarMeta | null = null,
  creativePlacements: CreativeActivityPlacement[] = [],
  freeSlotsToday: FreeTimeSlot[] = [],
  tomorrowAlert: TomorrowAlertInfo | null = null,
  todayIso = ''
): string {
  const fastingDaysText =
    profile.fastingDays.length > 0
      ? profile.fastingDays
          .map((d) => ARABIC_WEEKDAYS.find((w) => w.id === d)?.fullAr ?? '')
          .filter(Boolean)
          .join(' و ')
      : 'لا يوجد';

  const workDaysText =
    profile.workDays.length > 0
      ? profile.workDays
          .map((d) => ARABIC_WEEKDAYS.find((w) => w.id === d)?.shortAr ?? '')
          .filter(Boolean)
          .join('، ')
      : 'غير محدد';

  const workLine = profile.workEnabled
    ? `دوام عمل ثابت مفعّل: من ${formatTime24To12h(profile.workStart24)} إلى ${formatTime24To12h(profile.workEnd24)} (أيام: ${workDaysText})`
    : `حالياً بدون دوام ثابت — التفرغ لمسار (${profile.careerTrack}) ويُعامل كله كوقت تركيز/عمل موحّد.`;

  const sleepPolicyText =
    profile.sleepStrategy === 'night_only_strict'
      ? 'النوم الليلي فقط (ممنوع النوم النهاري/القيلولة · حضور الشروق والغروب إلزامي)'
      : profile.sleepStrategy === 'anchor_early_bed'
        ? 'نوم ليلي مبكر متواصل'
        : 'نوم مرتكز + قيلولة';

  const annualSleep = computeAnnualSleepForecast({
    id: 'active',
    nameAr: profile.currentCityName,
    nameEn: profile.currentCityName,
    lat: profile.currentLat,
    lng: profile.currentLng,
    tzOffsetHours: 2,
    timeZone: profile.currentTimeZone,
  });

  const seasonalModeTag = (plan.sleepMode ?? plan.seasonalSleep?.mode ?? 'long_night').replace(
    /_/g,
    '-'
  );
  const seasonalLine = plan.seasonalSleep
    ? ` | الفصل النومي اليوم (${seasonalModeTag}): ${plan.seasonalSleep.phaseLabelAr} (${plan.seasonalSleep.completedCycles} دورات × 90د · قطع الكافيين ${formatMinutes12h(plan.seasonalSleep.caffeineCutoffMin)} · بدء التهدئة ${formatMinutes12h(plan.seasonalSleep.windDownStartMin)}) | المدى السنوي بين العشاء والفجر بموقعك: أقصر ليل صيفي ${formatDurationAr(annualSleep.summerMinNightMin)} – أطول ليل شتوي ${formatDurationAr(annualSleep.winterMaxNightMin)} | إرشاد النهار: ${plan.seasonalSleep.nsdrWindowAr}`
    : ` | وضع النوم الموسمي: ${seasonalModeTag}`;

  const sleepLine = `سياسة النوم: ${sleepPolicyText} | النوم الليلة: ${formatMinutes12h(plan.bedtimeMin)} ← الاستيقاظ: ${formatMinutes12h(plan.wakeMin)} (${formatDurationAr(plan.coreNightSleepMin)}) | الشروق: ${formatMinutes12h(plan.sunriseMin)} · الغروب: ${formatMinutes12h(plan.maghribMin)}${
    plan.suhoorStartMin !== null
      ? ` · سحور غداً الساعة ${formatMinutes12h(plan.suhoorStartMin)} (قبل الفجر بـ ${profile.suhoorLeadMinutes} د)`
      : ''
  }${
    plan.sleepDebtMinutes > 0
      ? ` · رصيد النوم الناقص المتراكم: ${formatDurationAr(plan.sleepDebtMinutes)} (تعويض الليلة: ${plan.nightlyRecoveryMin} د)`
      : ' · رصيد النوم: متوازن (صفر عجز)'
  }${
    plan.eveningStudyTrimMin > 0
      ? ` · تقليص مقترح من المذاكرة المرنة المسائية: ${plan.eveningStudyTrimMin} د لحماية النوم الليلي`
      : ''
  }${seasonalLine}`;

  const whiteDaysEnabled = Boolean(profile.whiteDaysEnabled ?? profile.fastingWhiteDays ?? false);
  const dateLine = calendarMeta
    ? `اليوم والتاريخ: ${calendarMeta.weekdayAr}، ${calendarMeta.gregorianAr}${
        calendarMeta.hijriFullAr ? ` · الهجري: ${calendarMeta.hijriFullAr}` : ''
      }${whiteDaysEnabled && calendarMeta.isFullMoonWhiteDay ? ' · 🌕 (أيام البدر المكتمل / الأيام البيض)' : ''}`
    : '';

  const weatherLine = weather
    ? `الطقس الحالي (${weather.conditionAr} ${weather.currentTempC}°C · العظمى ${weather.maxTempC}°C): ${weather.heatNoteAr}`
    : '';

  const waterLine = `القياسات: الوزن (متغير) ${profile.weightKg} كجم / الطول (ثابت) ${profile.heightCm} سم / حجم الكوب ${profile.cupSizeMl} مل. هدف اليوم (${plan.fastingReasonAr}): ${plan.activeTargetCups} كوب (${plan.activeTargetMl} مل)${plan.heatBonusMl > 0 ? ` [شامل +${plan.heatBonusMl} مل زيادة حر تلقائية]` : ''} [العادي: ${plan.normalTargetCups} كوب | الصيام الحد الأدنى: ${plan.fastingTargetCups} كوب].`;

  const lowEnergyActive = Boolean(todayIso && profile.lowEnergyDateKey === todayIso);
  const lowEnergyLine = lowEnergyActive
    ? 'حالة الطاقة اليوم: وضع اليوم الهادئ / طاقة منخفضة مفعّل (احمِ الصلاة والنوم فقط، وخفّف أو أجّل المهام غير العاجلة بلطف).'
    : '';

  const oneTimeSilenceActive =
    Boolean(
      profile.oneTimeSilenceMinutes &&
        profile.oneTimeSilenceMinutes >= 5 &&
        (!profile.oneTimeSilenceDateKey || !todayIso || profile.oneTimeSilenceDateKey === todayIso)
    );

  const repeats = { ...DEFAULT_SOUND_REPEATS, ...(profile.soundRepeats ?? {}) };
  const repeatSummary = (Object.keys(TASK_SOUND_META) as Array<keyof typeof TASK_SOUND_META>)
    .map(
      (k) =>
        `${TASK_SOUND_META[k].labelAr}: ${repeats[k] === 'continuous' ? 'رنين مستمر حتى الإيقاف' : `${repeats[k]}×`}`
    )
    .join(' | ');

  const tomorrowLine = tomorrowAlert
    ? `تنبيه مبكر لغداً (${tomorrowAlert.weekdayAr}): ${tomorrowAlert.headlineAr} — ${tomorrowAlert.detailAr}`
    : '';

  const freeSlotsLine =
    freeSlotsToday.length > 0
      ? `نوافذ الفراغ المتاحة اليوم (freeWindows): ${freeSlotsToday
          .map(
            (s) =>
              `${s.label ? `[${s.label}] ` : ''}${formatMinutes12h(s.startMin)}–${formatMinutes12h(s.endMin)} (${s.durationMin} د)`
          )
          .join(' | ')}`
      : '';

  const creativeLines =
    creativePlacements.length > 0
      ? `\n--- الأنشطة الإبداعية والهوايات النشطة ---\n${creativePlacements
          .map(
            (p) =>
              `- [activityId=${p.activity.id}] ${p.activity.emoji} ${p.activity.name} | التكرار: ${p.periodLabelAr} (${p.sessionsInPeriod}/${p.goalInPeriod} جلسات · ${p.activity.sessionMinutes} د/جلسة)${
                p.activity.expiresOnDate ? ` | مؤقت حتى ${p.activity.expiresOnDate}` : ''
              }${
                p.doneToday
                  ? ' | أُنجز اليوم ✓'
                  : p.suggestedSlot
                    ? ` | وقت فاضي مقترح اليوم: ${formatMinutes12h(p.suggestedSlot.startMin)}`
                    : ''
              }`
          )
          .join('\n')}`
      : '';

  const memoryLines =
    memories.length > 0
      ? `\n--- ذاكرة Gemini الدائمة (القواعد والمبادئ التي علّمها لك المستخدم — محفوظة في Firestore) ---\n${memories
          .map((m) => `- [memoryId=${m.id} | ${MEMORY_CATEGORY_LABELS[m.category]}] ${m.ruleText}`)
          .join('\n')}`
      : '';

  return [
    '--- الدستور الشخصي الثابت للمستخدم (محفوظ في Firestore) ---',
    dateLine,
    `ترتيب الأولويات وحل التضارب الصارم: ${profile.priorityOrderAr}`,
    `الموقع والمنطقة الزمنية: ${profile.currentCityName} (${profile.currentTimeZone}) | مزامنة الموقع التلقائية: ${profile.autoLocationSync ? 'مفعّلة' : 'يدوية'}`,
    weatherLine,
    lowEnergyLine,
    tomorrowLine,
    `المسار المهني: ${profile.careerTrack} | ${workLine}`,
    `أيام الصيام: ${fastingDaysText} | حالة اليوم: ${plan.isFastingToday ? 'صائم اليوم (ممنوع الماء بين الفجر والمغرب)' : 'يوم عادي'} | غداً: ${plan.isFastingTomorrow ? 'يوم صيام (يحتاج سحور)' : 'يوم عادي'}`,
    `حماية الصوت التلقائية: تنبيه قبل الأذان بـ ${profile.adhanLeadMinutes} د | كتم تلقائي بعد الأذان: ${profile.prayerSilenceMinutes} د للصلوات (و50 د تلقائياً لصلاة الجمعة) و ${profile.fajrSilenceMinutes} د للفجر${
      oneTimeSilenceActive ? ` | [تعديل مؤقت لمرة واحدة نشط الآن: ${profile.oneTimeSilenceMinutes} د]` : ''
    } | كتم تام وقت النوم مع حفظ الإشعارات.`,
    `تكرار رنين التنبيهات: ${repeatSummary}`,
    sleepLine,
    waterLine,
    freeSlotsLine,
    plan.conflictWarningAr ? `تحذير تعارض موسمي/وقتي حالياً: ${plan.conflictWarningAr}` : '',
    profile.personalNotes ? `ملاحظات شخصية إضافية: ${profile.personalNotes}` : '',
    creativeLines,
    memoryLines,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Shared medication stock runway helper accounting for scheduled daysOfWeek. */
export function computeMedicationDaysLeft(
  remainingDoses: number,
  dosesPerDay: number,
  daysOfWeek?: number[]
): number {
  const safeDosesPerDay = Math.max(1, dosesPerDay);
  const daysPerWeek = daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek.length : 7;
  const dailyRate = Math.max(0.14, (safeDosesPerDay * daysPerWeek) / 7);
  return remainingDoses / dailyRate;
}

export interface ResolveMedicationDosesOptions {
  isFastingToday: boolean;
  fajrMin: number;
  maghribMin: number;
}

export interface ResolvedMedicationDose {
  originalTime24: string;
  effectiveTime24: string;
  effectiveMin: number;
  wasShifted: boolean;
  shiftTarget: 'before-fajr' | 'after-maghrib' | null;
}

export interface ResolvedMedicationDaySchedule {
  med: MedicationItem;
  policy: MedicationFastingPolicy;
  doses: ResolvedMedicationDose[];
  skippedCount: number;
}

/**
 * Resolves today's effective medication doses without mutating the saved MedicationItem.
 * On fasting days, doses strictly inside [fajrMin, maghribMin) follow med.fastingPolicy (default 'auto-nearest').
 */
export function resolveMedicationDosesForDay(
  med: MedicationItem,
  options: ResolveMedicationDosesOptions
): ResolvedMedicationDaySchedule {
  const rawTimes =
    med.times24 && med.times24.length > 0
      ? med.times24
      : med.time24
        ? [med.time24]
        : [];
  const policy: MedicationFastingPolicy = med.fastingPolicy ?? 'auto-nearest';
  const suhoorShiftMin = wrap1440(options.fajrMin - 15);
  const iftarShiftMin = wrap1440(options.maghribMin + 15);

  const doses: ResolvedMedicationDose[] = [];
  let skippedCount = 0;

  for (const t24 of rawTimes) {
    const m = t24.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const origMin = Number(m[1]) * 60 + Number(m[2]);
    const inFastingWindow =
      options.isFastingToday && origMin >= options.fajrMin && origMin < options.maghribMin;

    if (!inFastingWindow || policy === 'unchanged') {
      doses.push({
        originalTime24: t24,
        effectiveTime24: t24,
        effectiveMin: origMin,
        wasShifted: false,
        shiftTarget: null,
      });
      continue;
    }

    if (policy === 'skip') {
      skippedCount += 1;
      continue;
    }

    let targetMin: number;
    let shiftTarget: 'before-fajr' | 'after-maghrib';
    if (policy === 'before-fajr') {
      targetMin = suhoorShiftMin;
      shiftTarget = 'before-fajr';
    } else if (policy === 'after-maghrib') {
      targetMin = iftarShiftMin;
      shiftTarget = 'after-maghrib';
    } else {
      // 'auto-nearest'
      const distFajr = origMin - options.fajrMin;
      const distMaghrib = options.maghribMin - origMin;
      if (distFajr < distMaghrib) {
        targetMin = suhoorShiftMin;
        shiftTarget = 'before-fajr';
      } else {
        targetMin = iftarShiftMin;
        shiftTarget = 'after-maghrib';
      }
    }

    doses.push({
      originalTime24: t24,
      effectiveTime24: formatMinutes24h(targetMin),
      effectiveMin: targetMin,
      wasShifted: true,
      shiftTarget,
    });
  }

  return { med, policy, doses, skippedCount };
}

export interface NativeMedicationAlarmEntry {
  id: string;
  kind: 'medication';
  title: string;
  body: string;
  triggerAtMs: number;
  snoozeMinutes: number;
  medicationId: string;
  doseTime24: string;
}

/**
 * Builds today's Android AlarmManager medication payloads using shifted fasting-day times
 * while keeping original recurring times untouched.
 */
export function buildMedicationAlarmEntries(params: {
  medications: MedicationItem[];
  todayIso: string;
  todayWeekday: number;
  isFastingToday: boolean;
  fajrMin: number;
  maghribMin: number;
  nowMs: number;
  snoozeMinutes: number;
  deferredMedIds?: Iterable<string> | null;
  msForMinuteToday: (targetMin: number) => number;
  isSilencedAt: (minOfDay: number, triggerAtMs: number) => boolean;
}): NativeMedicationAlarmEntry[] {
  const deferredSet = params.deferredMedIds ? new Set(params.deferredMedIds) : null;
  const alarms: NativeMedicationAlarmEntry[] = [];

  for (const med of params.medications) {
    if (deferredSet?.has(med.id)) continue;
    if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(params.todayWeekday)) {
      continue;
    }

    const rawTimesCount =
      med.times24 && med.times24.length > 0 ? med.times24.length : med.time24 ? 1 : 0;
    const takenDoses = med.takenDateKey === params.todayIso ? med.takenDosesToday ?? [] : [];
    const resolved = resolveMedicationDosesForDay(med, {
      isFastingToday: params.isFastingToday,
      fajrMin: params.fajrMin,
      maghribMin: params.maghribMin,
    });

    for (const dose of resolved.doses) {
      const alreadyTaken =
        rawTimesCount > 1
          ? takenDoses.includes(dose.originalTime24) || takenDoses.includes(dose.effectiveTime24)
          : med.takenDateKey === params.todayIso;
      if (alreadyTaken) continue;

      const triggerAtMs = params.msForMinuteToday(dose.effectiveMin);
      if (triggerAtMs > params.nowMs + 1_000 && !params.isSilencedAt(dose.effectiveMin, triggerAtMs)) {
        const stockLine =
          typeof med.remainingDoses === 'number' && med.remainingDoses >= 0
            ? `\n💊 الرصيد المتبقي: ${med.remainingDoses} جرعة`
            : '';
        const fastingSuffix = dose.wasShifted ? ' · (معدّل للصيام)' : '';
        alarms.push({
          id: `med_${params.todayIso}_${med.id}_${dose.effectiveTime24}`,
          kind: 'medication',
          title: `💊 موعد الجرعة: ${med.name}`,
          body: `${med.doseNote ? `${med.doseNote} · ` : ''}${formatMinutes12h(dose.effectiveMin, 'ar')}${fastingSuffix}${stockLine}`,
          triggerAtMs,
          snoozeMinutes: params.snoozeMinutes,
          medicationId: med.id,
          doseTime24: rawTimesCount > 1 ? dose.originalTime24 : '',
        });
      }
    }
  }

  return alarms;
}

export interface NativeSleepAlarmEntry {
  id: string;
  kind: 'sleep_bedtime' | 'sleep_wake' | 'sleep_post_fajr_wake' | 'sleep_nap_wake';
  title: string;
  body: string;
  triggerAtMs: number;
  snoozeMinutes: number;
}

/**
 * Builds Android AlarmManager payloads from the resolved DailyRhythmPlan
 * (bedtime wind-down, wake/Suhoor alarm, optional Post-Fajr recovery wake, and optional Post-Dhuhr nap wake).
 */
export function buildSleepAlarmEntries(params: {
  plan: DailyRhythmPlan;
  todayIso: string;
  nowMs: number;
  snoozeMinutes: number;
  msForMinuteToday: (targetMin: number) => number;
}): NativeSleepAlarmEntry[] {
  const { plan, todayIso, nowMs, snoozeMinutes, msForMinuteToday } = params;
  const alarms: NativeSleepAlarmEntry[] = [];

  const pushIfFuture = (
    id: string,
    kind: NativeSleepAlarmEntry['kind'],
    title: string,
    body: string,
    minuteOfDay: number
  ) => {
    const triggerAtMs = msForMinuteToday(minuteOfDay);
    if (triggerAtMs > nowMs + 1_000) {
      alarms.push({ id, kind, title, body, triggerAtMs, snoozeMinutes });
    }
  };

  pushIfFuture(
    `sleep_wake_${todayIso}`,
    'sleep_wake',
    plan.suhoorStartMin !== null ? '🌙 استيقاظ السحور' : '⏰ استيقاظ الفجر',
    plan.suhoorStartMin !== null
      ? `وقت السحور (${formatMinutes12h(plan.wakeMin, 'ar')})`
      : `موعد الاستيقاظ قبل الفجر (${formatMinutes12h(plan.wakeMin, 'ar')})`,
    plan.wakeMin
  );

  pushIfFuture(
    `sleep_bed_${todayIso}`,
    'sleep_bedtime',
    '😴 موعد النوم',
    `بداية النوم الليلي (${formatMinutes12h(plan.bedtimeMin, 'ar')})`,
    plan.bedtimeMin
  );

  if (
    typeof plan.postFajrStartMin === 'number' &&
    typeof plan.postFajrEndMin === 'number' &&
    typeof plan.postFajrDurationMin === 'number' &&
    plan.postFajrDurationMin > 0
  ) {
    pushIfFuture(
      `sleep_post_fajr_wake_${todayIso}`,
      'sleep_post_fajr_wake',
      '🌅 نهاية تعويض الفجر',
      `انتهاء تعويض ما بعد الفجر قبل الشروق (${formatMinutes12h(plan.postFajrEndMin, 'ar')})`,
      plan.postFajrEndMin
    );
  }

  if (plan.qailulahStartMin !== null && plan.qailulahDurationMin > 0) {
    const napEndMin = wrap1440(plan.qailulahStartMin + plan.qailulahDurationMin);
    pushIfFuture(
      `sleep_nap_wake_${todayIso}`,
      'sleep_nap_wake',
      '🔋 نهاية القيلولة',
      `انتهاء قيلولة الظهر (${plan.qailulahDurationMin} د · ${formatMinutes12h(napEndMin, 'ar')})`,
      napEndMin
    );
  }

  return alarms;
}
