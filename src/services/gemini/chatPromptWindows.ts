import { calculateEgyptianPrayerTimes, formatMinutes12h } from '../../engines/prayerEngine';
import { computeDailyRhythmPlan, formatDurationAr } from '../../engines/lifeRhythmEngine';
import type { ChatRequestPayload } from './config';

export function buildProtectedAndFreeWindowsBlock(payload: ChatRequestPayload, todayCairo: string): string {
  const resolvedSeasonalMode = payload.seasonalSleepMode ?? payload.settingsSnapshot?.seasonalSleepMode;
  const seasonalModeTag = resolvedSeasonalMode ? resolvedSeasonalMode.replace(/_/g, '-') : null;
  const resolvedFreeWindows =
    Array.isArray(payload.freeWindows) && payload.freeWindows.length > 0
      ? payload.freeWindows
      : Array.isArray(payload.settingsSnapshot?.freeWindows)
        ? payload.settingsSnapshot.freeWindows
        : [];
  const freeWindowsLines =
    resolvedFreeWindows.length > 0
      ? resolvedFreeWindows
          .map(
            (w) =>
              `- [${w.label}] ${formatMinutes12h(w.startMin, 'ar')} – ${formatMinutes12h(w.endMin, 'ar')} (${formatDurationAr(w.durationMin)} / ${w.durationMin} د)`
          )
          .join('\n')
      : '';

  let protectedWindowsLines = '';
  if (payload.settingsSnapshot?.lifeProfile) {
    const lp = payload.settingsSnapshot.lifeProfile;
    const tz = lp.currentTimeZone || 'Africa/Cairo';
    const prayersToday = calculateEgyptianPrayerTimes(
      {
        id: 'active',
        nameAr: lp.currentCityName,
        nameEn: lp.currentCityName,
        lat: lp.currentLat,
        lng: lp.currentLng,
        tzOffsetHours: 2,
        timeZone: tz,
      },
      new Date(),
      lp.adhanLeadMinutes
    );
    const wdParsed = new Date(`${todayCairo}T12:00:00Z`).getUTCDay();
    const todayWeekday = Number.isNaN(wdParsed) ? new Date().getDay() : wdParsed;
    const planToday = computeDailyRhythmPlan(lp, prayersToday, {
      todayWeekday,
      tomorrowWeekday: (todayWeekday + 1) % 7,
      todayIso: todayCairo,
      timeZone: tz,
    });
    const windDownStart =
      planToday.seasonalSleep?.windDownStartMin ?? Math.max(planToday.wakeMin, planToday.bedtimeMin - 55);
    const protectedParts = [
      `- النوم الليلي المحمي: ${formatMinutes12h(planToday.bedtimeMin, 'ar')} – ${formatMinutes12h(planToday.wakeMin, 'ar')}`,
      `- نطاق التهدئة (Wind-Down Zone — ممنوع العمل العميق والرياضة): ${formatMinutes12h(windDownStart, 'ar')} – ${formatMinutes12h(planToday.bedtimeMin, 'ar')}`,
    ];
    if (planToday.suhoorStartMin !== null) {
      const fajrMin = prayersToday.find((p) => p.id === 'fajr')?.adhanMinutes ?? planToday.wakeMin;
      protectedParts.push(
        `- السحور المحمي: ${formatMinutes12h(planToday.suhoorStartMin, 'ar')} – ${formatMinutes12h(fajrMin, 'ar')}`
      );
    }
    if (planToday.qailulahStartMin !== null && planToday.qailulahDurationMin > 0) {
      protectedParts.push(
        `- القيلولة التعويضية المحمية: ${formatMinutes12h(planToday.qailulahStartMin, 'ar')} – ${formatMinutes12h(planToday.qailulahStartMin + planToday.qailulahDurationMin, 'ar')}`
      );
    }
    protectedWindowsLines = `\nالأوقات المحمية (ممنوع الجدولة فيها قطعياً):\n${protectedParts.join('\n')}`;
  }

  return seasonalModeTag || freeWindowsLines || protectedWindowsLines
    ? `\n\n=== نوافذ الفراغ اليوم ووضع النوم الموسمي ===${
        seasonalModeTag ? `\nوضع النوم الموسمي النشط: ${seasonalModeTag}` : ''
      }${protectedWindowsLines}${
        freeWindowsLines
          ? `\nfreeWindows (نوافذ الفراغ المتاحة بين الاستيقاظ والنوم — خالية من الصلوات والنوم والسحور والقيلولة وأحداث التقويم):\n${freeWindowsLines}`
          : ''
      }`
    : '';
}
