import {
  CreativeActivityItem,
  CreativeActivityPlacement,
  CreativeCadence,
  DailyRhythmPlan,
  FreeTimeSlot,
  GeoLocation,
  GoogleCalendarEventItem,
  HydrationScheduleSlot,
  LifeProfile,
  MemoryCategory,
  MemoryItem,
  PrayerTimeItem,
  ScheduleBlock,
  TodayCalendarMeta,
  TomorrowAlertInfo,
  WeatherHydrationInfo,
} from '../types/dayrhythm';
import {
  calculateEgyptianPrayerTimes,
  formatMinutes12h,
  formatMinutes24h,
  formatTime24To12h,
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
  fastingDays: [],
  suhoorLeadMinutes: 45,
  sleepTargetMinutes: 450, // 7.5 hours (5 full 90-min circadian cycles)
  sleepStrategy: 'night_only_strict',
  sleepDebtMinutes: 0,
  sleepDebtLogDateKey: '',
  adhanLeadMinutes: 3, // -3 min before Adhan
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
  };
}

export function computeDailyRhythmPlan(
  profile: LifeProfile,
  prayers: PrayerTimeItem[],
  options: {
    todayWeekday: number; // 0=Sun..6=Sat
    tomorrowWeekday: number;
    fastingOverride?: 'auto' | 'fasting' | 'normal';
    heatBonusMl?: number;
    /** Arabic name of a special Sunnah fast today/tomorrow (يوم عرفة / يوم عاشوراء), if any. */
    specialFastTodayAr?: string | null;
    specialFastTomorrowAr?: string | null;
  }
): DailyRhythmPlan {
  const fajr = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const sunrise = prayers.find((p) => p.id === 'sunrise')?.adhanMinutes ?? 6 * 60 + 15;
  const dhuhr = prayers.find((p) => p.id === 'dhuhr')?.adhanMinutes ?? 12 * 60;
  const asr = prayers.find((p) => p.id === 'asr')?.adhanMinutes ?? 15 * 60;
  const maghrib = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;
  const isha = prayers.find((p) => p.id === 'isha')?.adhanMinutes ?? 19 * 60;

  const autoFastToday =
    profile.fastingDays.includes(options.todayWeekday) || Boolean(options.specialFastTodayAr);
  const isFastingToday =
    options.fastingOverride === 'fasting'
      ? true
      : options.fastingOverride === 'normal'
        ? false
        : autoFastToday;

  const isFastingTomorrow =
    profile.fastingDays.includes(options.tomorrowWeekday) || Boolean(options.specialFastTomorrowAr);

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
      : options.specialFastTodayAr
        ? `صيام ${options.specialFastTodayAr}`
        : `صيام تلقائي (${dayNameMap[options.todayWeekday] ?? 'اليوم'})`
    : options.fastingOverride === 'normal' && autoFastToday
      ? 'إفطار مستثنى لليوم'
      : 'يوم عادي';

  const appliedHeatBonusMl = Math.max(0, Math.round(options.heatBonusMl ?? 0));
  const hydration = computeScientificHydration(profile, isFastingToday, appliedHeatBonusMl);

  // --- Priority #1 (Prayers) -> Priority #2 (Night-Only Circadian Sleep) -> Trim Flexible Study ---
  const sleepLatencyMin = 15;
  const normalWakeMin = wrap1440(fajr - 15);
  const suhoorStartMin = isFastingTomorrow
    ? wrap1440(fajr - profile.suhoorLeadMinutes)
    : null;
  const wakeMin = suhoorStartMin ?? normalWakeMin;

  // Earliest realistic bedtime after Isha (25m buffer for Isha prayer + wind-down)
  const earliestBedAfterIsha = wrap1440(isha + 25);
  const maxNightWindowMin = Math.max(
    0,
    durationForward(earliestBedAfterIsha, wakeMin) - sleepLatencyMin
  );

  // Ideal bedtime for full sleep target before wakeMin
  const idealBedForTarget = wrap1440(wakeMin - profile.sleepTargetMinutes - sleepLatencyMin);
  const idealNormalBed = wrap1440(normalWakeMin - profile.sleepTargetMinutes - sleepLatencyMin);

  let bedtimeMin = idealBedForTarget;
  let qailulahStartMin: number | null = null;
  let qailulahDurationMin = 0;
  let eveningStudyTrimMin = 0;
  let conflictWarningAr: string | null = null;
  let autoAdaptationProposalAr: string | null = null;
  let sleepAdviceAr = '';

  if (profile.sleepStrategy === 'night_only_strict') {
    // STRICT NIGHT-ONLY SLEEP: Zero daytime sleep; protect Sunrise & Sunset attendance.
    // On conflict (fasting suhoor or short summer night), pull bedtime earlier right after Isha
    // and trim flexible evening study/work time instead of touching Prayer or Sleep.
    if (maxNightWindowMin < profile.sleepTargetMinutes) {
      bedtimeMin = earliestBedAfterIsha;
      const deficit = profile.sleepTargetMinutes - maxNightWindowMin;
      eveningStudyTrimMin = Math.min(180, Math.max(45, deficit + 30));
      conflictWarningAr = `الليل الفلكي بين العشاء و${suhoorStartMin !== null ? 'السحور' : 'الفجر'} هو ${formatDurationAr(maxNightWindowMin)} فقط (أقل من هدف ${formatDurationAr(profile.sleepTargetMinutes)} بـ ${formatDurationAr(deficit)}). تم تثبيت النوم مباشرة بعد العشاء (${formatMinutes12h(bedtimeMin)}) وتقليص الجلسات المسائية باكراً.`;
      autoAdaptationProposalAr = `اقتراح التكيّف الذاتي: نقل جلسات العمل أو الدراسة المسائية للصباح بعد الشروق (${formatMinutes12h(sunrise + 20)}) وتقليل وقت المهام المرنة بـ ${eveningStudyTrimMin} د لحماية نومك الليلي دون أي نوم نهاري.`;
      sleepAdviceAr = `نوم ليلي حصري بعد العشاء مباشرة (${formatDurationAr(maxNightWindowMin)}) مع حضور الشروق (${formatMinutes12h(sunrise)}) والغروب (${formatMinutes12h(maghrib)}).`;
    } else {
      bedtimeMin = idealBedForTarget;
      // On fasting eve, bedtime shifts earlier by (suhoorLead - 15) minutes -> trim flexible evening study automatically
      if (isFastingTomorrow && suhoorStartMin !== null) {
        const shiftEarlier = durationForward(bedtimeMin, idealNormalBed);
        eveningStudyTrimMin = shiftEarlier > 0 && shiftEarlier < 180 ? shiftEarlier : profile.suhoorLeadMinutes - 15;
        autoAdaptationProposalAr = `ليلة سحور غداً: تقديم النوم الليلي إلى ${formatMinutes12h(bedtimeMin)} وتقليل المذاكرة المسائية تلقائياً بـ ${eveningStudyTrimMin} د حتى تستيقظ للسحور (${formatMinutes12h(suhoorStartMin)}) بـ ${formatDurationAr(profile.sleepTargetMinutes)} نوم ليلي كامل.`;
        sleepAdviceAr = `نوم ليلي متكامل (${formatDurationAr(profile.sleepTargetMinutes)}) قبل سحور غداً بـ ${profile.suhoorLeadMinutes} د — صفر نوم نهاري.`;
      } else {
        sleepAdviceAr = `نوم ليلي متكامل (${formatDurationAr(profile.sleepTargetMinutes)}) يحفظ حضور الفجر والشروق (${formatMinutes12h(sunrise)}) والغروب (${formatMinutes12h(maghrib)}).`;
      }
    }
  } else if (profile.sleepStrategy === 'biphasic_qailulah') {
    // Optional legacy mode if user explicitly enables it
    const idealNormalTight =
      durationForward(earliestBedAfterIsha, normalWakeMin) <
      profile.sleepTargetMinutes + sleepLatencyMin;
    const baseNormalBed = idealNormalTight ? earliestBedAfterIsha : idealNormalBed;

    if (isFastingTomorrow && suhoorStartMin !== null) {
      const gentleEarlyBed = wrap1440(baseNormalBed - 30);
      const canShift30 =
        durationForward(earliestBedAfterIsha, suhoorStartMin) >=
        durationForward(gentleEarlyBed, suhoorStartMin);
      bedtimeMin = canShift30 ? gentleEarlyBed : earliestBedAfterIsha;
      const coreSleep = Math.max(0, durationForward(bedtimeMin, suhoorStartMin) - sleepLatencyMin);
      const deficit = Math.max(0, profile.sleepTargetMinutes - coreSleep);
      if (deficit >= 20) {
        qailulahDurationMin = deficit >= 70 ? 90 : 30;
        qailulahStartMin = Math.min(dhuhr + 45, Math.max(dhuhr + 30, asr - qailulahDurationMin - 15));
      }
      sleepAdviceAr = `نوم مرتكز مع قيلولة تعويضية (${qailulahDurationMin} د) بعد الظهر.`;
    } else {
      bedtimeMin = baseNormalBed;
      const coreSleep = Math.max(0, durationForward(bedtimeMin, normalWakeMin) - sleepLatencyMin);
      const deficit = Math.max(0, profile.sleepTargetMinutes - coreSleep);
      if (deficit >= 25) {
        qailulahDurationMin = deficit >= 70 ? 90 : 30;
        qailulahStartMin = Math.min(dhuhr + 45, Math.max(dhuhr + 30, asr - qailulahDurationMin - 15));
      }
      sleepAdviceAr = `نوم متوازن مرتبط بموعد الفجر.`;
    }
  } else {
    // anchor_early_bed
    bedtimeMin = maxNightWindowMin < profile.sleepTargetMinutes ? earliestBedAfterIsha : idealBedForTarget;
    if (maxNightWindowMin < profile.sleepTargetMinutes) {
      eveningStudyTrimMin = 60;
      conflictWarningAr = `الليل أقصر من هدف النوم (${formatDurationAr(maxNightWindowMin)}) — تم تثبيت النوم بعد العشاء مباشرة.`;
    }
    sleepAdviceAr = 'نوم ليلي مبكر متواصل قبل الفجر/السحور.';
  }

  // --- Smooth Sleep Debt Recovery (gentle 15–45m/night shift, bounded by Isha + 25m) ---
  const sleepDebtMinutes = Math.max(0, Math.min(480, Math.round(profile.sleepDebtMinutes ?? 0)));
  let nightlyRecoveryMin = 0;
  let sleepDebtPlanAr: string | null = null;

  if (sleepDebtMinutes > 0) {
    // Spread larger debt over 2+ nights (max 45m/night) so evening schedule stays calm & realistic
    const desiredRecovery =
      sleepDebtMinutes <= 30
        ? sleepDebtMinutes
        : Math.min(45, Math.max(15, Math.ceil(sleepDebtMinutes / 2 / 15) * 15));
    const availableEarlierSlack = durationForward(earliestBedAfterIsha, bedtimeMin);
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
      sleepDebtPlanAr = `موعد النوم بالفعل مباشرة بعد العشاء (${formatMinutes12h(bedtimeMin)}) — إذا كنت متعباً أخبر Gemini ليفرّغ لك قيلولة تعويضية 30 د اليوم.`;
    }
  }

  const coreNightSleepMin = Math.max(0, durationForward(bedtimeMin, wakeMin) - sleepLatencyMin);
  const totalSleepMin = coreNightSleepMin + qailulahDurationMin;

  // --- Scientific Hydration Distribution (12-Hour Aware, Zero Water During Fast) ---
  const hydrationSlots: HydrationScheduleSlot[] = [];

  if (isFastingToday) {
    const suhoorCups = Math.min(2, Math.max(1, Math.floor(hydration.activeTargetCups / 4)));
    const eveningCups = Math.max(1, hydration.activeTargetCups - suhoorCups);

    const eveningStart = maghrib;
    const eveningEnd = wrap1440(bedtimeMin - 45);
    const eveningSpan = Math.max(45, durationForward(eveningStart, eveningEnd));
    const step = eveningCups > 1 ? Math.floor(eveningSpan / (eveningCups - 1)) : 0;

    for (let i = 0; i < eveningCups; i++) {
      const tMin = wrap1440(eveningStart + i * step);
      let windowAr = '';
      if (i === 0) windowAr = 'عند الإفطار';
      else if (i === eveningCups - 1) windowAr = 'قبل النوم';
      hydrationSlots.push({
        cupIndex: i + 1,
        timeMinutes: tMin,
        windowAr,
        noteAr: '',
      });
    }

    const suhoorBegin = wrap1440(fajr - profile.suhoorLeadMinutes);
    const suhoorSpan = Math.max(15, profile.suhoorLeadMinutes - 10);
    for (let s = 0; s < suhoorCups; s++) {
      const offset = suhoorCups === 1 ? 10 : Math.round((s * suhoorSpan) / (suhoorCups - 1));
      hydrationSlots.push({
        cupIndex: eveningCups + s + 1,
        timeMinutes: wrap1440(suhoorBegin + offset),
        windowAr: 'السحور',
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
    fastingReasonAr,
    heatBonusMl: appliedHeatBonusMl,
    normalTargetMl: hydration.normalTargetMl,
    fastingMinTargetMl: hydration.fastingMinTargetMl,
    activeTargetMl: hydration.activeTargetMl,
    normalTargetCups: hydration.normalTargetCups,
    fastingTargetCups: hydration.fastingTargetCups,
    activeTargetCups: hydration.activeTargetCups,
    cupSizeMl: profile.cupSizeMl,
    hydrationSlots,
    bedtimeMin,
    wakeMin,
    sunriseMin: sunrise,
    maghribMin: maghrib,
    suhoorStartMin,
    coreNightSleepMin,
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
    isWorkDayToday,
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
  const dayStart = Math.max(plan.wakeMin + 25, plan.sunriseMin - 15);
  // If bedtime is after midnight (e.g., 00:30 = 30), cap awake day at 23:45 (1425)
  const dayEnd = plan.bedtimeMin > 12 * 60 ? Math.min(plan.bedtimeMin - 15, 23 * 60 + 45) : 23 * 60 + 30;
  if (dayEnd <= dayStart + minGapMinutes) return [];

  const busy: Array<[number, number]> = [];

  // 1. Obligatory prayers + lead + silence window
  for (const p of prayers) {
    if (!p.isObligatory) continue;
    const silenceLen = p.id === 'fajr' ? profile.fajrSilenceMinutes : profile.prayerSilenceMinutes;
    const s = Math.max(dayStart, p.adhanMinutes - profile.adhanLeadMinutes - 5);
    const e = Math.min(dayEnd, p.adhanMinutes + silenceLen + 5);
    if (e > s) busy.push([s, e]);
  }

  const parseTime24 = (hhmm: string, fallback: number): number => {
    const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return fallback;
    return Math.min(1439, Math.max(0, Number(m[1]) * 60 + Number(m[2])));
  };

  // 2. Active work hours if enabled today
  if (plan.isWorkDayToday && profile.workStart24 && profile.workEnd24) {
    const ws = parseTime24(profile.workStart24, 9 * 60);
    const we = parseTime24(profile.workEnd24, 17 * 60);
    if (we > ws) {
      busy.push([Math.max(dayStart, ws), Math.min(dayEnd, we)]);
    }
  }

  // 3. Existing real Calendar / Schedule blocks (excluding auto-placed creative blocks & deleted/all-day)
  for (const blk of occupiedBlocks) {
    if (blk.deleted || blk.isAllDay || blk.source === 'creative') continue;
    const s = Math.max(dayStart, blk.startMin - 5);
    const e = Math.min(dayEnd, blk.startMin + Math.max(15, blk.durationMin) + 5);
    if (e > s) busy.push([s, e]);
  }

  // Merge overlapping busy intervals
  busy.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of busy) {
    if (merged.length === 0 || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }

  const free: FreeTimeSlot[] = [];
  let cursor = dayStart;
  for (const [bs, be] of merged) {
    if (bs - cursor >= minGapMinutes) {
      free.push({ startMin: cursor, endMin: bs, durationMin: bs - cursor });
    }
    cursor = Math.max(cursor, be);
  }
  if (dayEnd - cursor >= minGapMinutes) {
    free.push({ startMin: cursor, endMin: dayEnd, durationMin: dayEnd - cursor });
  }
  return free;
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

  // 3. Fasting window conflict for oral medications/supplements
  if (params.isOralMedication) {
    const fajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
    const maghribMin = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;
    const targetDays =
      Array.isArray(params.daysOfWeek) && params.daysOfWeek.length > 0
        ? params.daysOfWeek
        : [0, 1, 2, 3, 4, 5, 6];
    const hitsFastingDay =
      profile.fastingDays.some((fd) => targetDays.includes(fd)) || plan.isFastingToday;
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
    if (params.isOralMedication && profile.fastingDays.length > 0) {
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
  }`;

  const dateLine = calendarMeta
    ? `اليوم والتاريخ: ${calendarMeta.weekdayAr}، ${calendarMeta.gregorianAr}${
        calendarMeta.hijriFullAr ? ` · الهجري: ${calendarMeta.hijriFullAr}` : ''
      }${calendarMeta.isFullMoonWhiteDay ? ' · 🌕 (أيام البدر المكتمل / الأيام البيض)' : ''}`
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
      ? `الأوقات الفاضية الحقيقية اليوم (بعيداً عن الصلاة والنوم وأحداث التقويم): ${freeSlotsToday
          .slice(0, 6)
          .map((s) => `${formatMinutes12h(s.startMin)}–${formatMinutes12h(s.endMin)} (${s.durationMin} د)`)
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
