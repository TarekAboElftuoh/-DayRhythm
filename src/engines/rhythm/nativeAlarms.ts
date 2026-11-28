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
import { wrap1440 } from './constants';
import { resolveMedicationDosesForDay } from './medicationSchedule';

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
  /** When false the real wake-up alarm is not scheduled at all (nothing left to cancel). */
  enableWakeAlarm?: boolean;
}): NativeSleepAlarmEntry[] {
  const { plan, todayIso, nowMs, snoozeMinutes, msForMinuteToday, enableWakeAlarm = true } = params;
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

  if (enableWakeAlarm) {
    pushIfFuture(
      `sleep_wake_${todayIso}`,
      'sleep_wake',
      plan.suhoorStartMin !== null ? '🌙 استيقاظ السحور' : '⏰ استيقاظ الفجر',
      plan.suhoorStartMin !== null
        ? `وقت السحور (${formatMinutes12h(plan.wakeMin, 'ar')})`
        : `موعد الاستيقاظ قبل الفجر (${formatMinutes12h(plan.wakeMin, 'ar')})`,
      plan.wakeMin
    );
  }

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

