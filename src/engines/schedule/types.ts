import { PrayerTimeItem } from '../../types/dayrhythm';

export const hm = (h: number, m: number) => h * 60 + m;

export interface ScheduleBuildOptions {
  isFriday?: boolean;
  includeBiweeklyPcCleanup?: boolean;
}

export interface AlarmTimes {
  fajrAlarm: number;
  dhuhrAlarm: number;
  asrAlarm: number;
  maghribAlarm: number;
  ishaAlarm: number;
  isFriday: boolean;
  includeBiweeklyPcCleanup: boolean;
}

export function extractAlarmTimes(
  prayers: PrayerTimeItem[],
  options: ScheduleBuildOptions = {}
): AlarmTimes {
  const byId = Object.fromEntries(prayers.map((p) => [p.id, p])) as Record<
    PrayerTimeItem['id'],
    PrayerTimeItem
  >;
  return {
    fajrAlarm: byId.fajr.alarmMinutes,
    dhuhrAlarm: byId.dhuhr.alarmMinutes,
    asrAlarm: byId.asr.alarmMinutes,
    maghribAlarm: byId.maghrib.alarmMinutes,
    ishaAlarm: byId.isha.alarmMinutes,
    isFriday: options.isFriday ?? new Date().getDay() === 5,
    includeBiweeklyPcCleanup: options.includeBiweeklyPcCleanup ?? true,
  };
}
