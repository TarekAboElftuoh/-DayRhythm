import {
  CreativeActivityItem, CreativeActivityPlacement, CreativeCadence, DailyRhythmPlan,
  DynamicHabit, DynamicHabitAnchor, FreeTimeSlot, FreeWindow, GeoLocation,
  GoogleCalendarEventItem, GoogleTaskItem, HydrationScheduleSlot, LifeProfile,
  MedicationFastingPolicy, MedicationItem, MemoryCategory, MemoryItem, PrayerTimeItem,
  ResolvedHabitPlacement, ScheduleBlock, SeasonalSleepGuidance, SeasonalSleepMode,
  SeasonalSleepPhase, SeasonalSleepPlan, TodayCalendarMeta, TomorrowAlertInfo, WeatherHydrationInfo,
} from '../../types/dayrhythm';
import {
  calculateEgyptianPrayerTimes, formatMinutes12h, formatMinutes24h,
  formatTime24To12h, getSpecialFastDay, parseIsoToTimeZoneInfo,
} from '../prayerEngine';
import { clamp, computeScientificHydration, durationForward, formatDurationAr, wrap1440 } from './constants';
import { computeSeasonalSleepPlan, isFastingDay, SEASONAL_SLEEP_CONSTANTS } from './seasonalSleep';
import { buildPrayerAwareHydrationSlots } from '../hydration/prayerAwareScheduler';
import { buildSeasonalSleepGuidance } from './seasonalGuidanceBuilder';

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
  const maxNightWindowMin = solvedSleep.availableNightMin;
  const seasonalSleep = buildSeasonalSleepGuidance({
    coreNightSleepMin,
    bedtimeMin,
    wakeMin,
    maghrib,
    targetSleepMin: solvedSleep.targetSleepMin,
    availableNightMin: maxNightWindowMin,
    solvedMode: solvedSleep.mode,
    qailulahStartMin,
    qailulahDurationMin,
    postFajrStartMin,
    postFajrEndMin,
    postFajrDurationMin,
  });
  const { completedCycles, caffeineCutoffMin, phase: seasonalPhase } = seasonalSleep;


  // Prayer-aware hydration: no cup may land inside [Adhan - 3m, Adhan + configured silence]
  // (Friday Dhuhr always 50m), cups shift around the prayer instead of being muted.
  const hydrationSlots = buildPrayerAwareHydrationSlots({
    isFastingToday,
    activeTargetCups: hydration.activeTargetCups,
    fajr,
    maghrib,
    bedtimeMin,
    prayers,
    prayerSilenceMinutes: profile.prayerSilenceMinutes,
    fajrSilenceMinutes: profile.fajrSilenceMinutes,
    isFridayToday: options.todayWeekday === 5,
  });

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
