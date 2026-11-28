import { MEMORY_CATEGORY_LABELS, formatDurationAr } from './constants';
import { computeAnnualSleepForecast } from './forecastAndAlerts';
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
import { DEFAULT_SOUND_REPEATS, TASK_SOUND_META } from '../audioEngine';
import { ARABIC_WEEKDAYS } from './constants';
import { computeFreeWindows } from './freeWindows';
import { DYNAMIC_HABIT_ANCHOR_LABELS } from './habitAnchors';

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
