import { useMemo } from 'react';
import type { DailyRhythmPlan, MedicationItem, PrayerTimeItem } from '../../types/dayrhythm';
import { resolveMedicationDosesForDay } from '../../engines/lifeRhythmEngine';

export function useMedicationsSummary({
  medications,
  prayers,
  dailyRhythmPlan,
  todayCairoIso,
  activeTimeZone,
}: {
  medications: MedicationItem[];
  prayers: PrayerTimeItem[];
  dailyRhythmPlan: DailyRhythmPlan;
  todayCairoIso: string;
  activeTimeZone: string;
}) {
  const last7CairoDays = useMemo(() => {
    const weekdayShortAr: Record<string, string> = {
      Sun: 'ح', Mon: 'ن', Tue: 'ث', Wed: 'ر', Thu: 'خ', Fri: 'ج', Sat: 'س',
    };
    const weekdayNumMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() - (6 - i) * 86_400_000);
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: activeTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(d);
      const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
      const mo = parts.find((p) => p.type === 'month')?.value ?? '01';
      const day = parts.find((p) => p.type === 'day')?.value ?? '01';
      const wdEn = new Intl.DateTimeFormat('en-US', { timeZone: activeTimeZone, weekday: 'short' }).format(d);
      return {
        dateIso: `${y}-${mo}-${day}`,
        shortAr: i === 6 ? 'اليوم' : weekdayShortAr[wdEn] ?? '•',
        weekdayNum: weekdayNumMap[wdEn] ?? 0,
        isToday: i === 6,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayCairoIso, activeTimeZone]);

  const lowStockMedications = useMemo(() => {
    return medications
      .filter((m) => typeof m.remainingDoses === 'number' && m.remainingDoses >= 0)
      .map((m) => {
        const dosesPerScheduledDay = Math.max(1, m.times24 && m.times24.length > 0 ? m.times24.length : 1);
        const daysPerWeek = m.daysOfWeek && m.daysOfWeek.length > 0 ? m.daysOfWeek.length : 7;
        const dailyRate = Math.max(0.14, (dosesPerScheduledDay * daysPerWeek) / 7);
        const alertDays = Math.max(1, Math.min(14, m.refillAlertDays ?? 3));
        const rem = m.remainingDoses ?? 0;
        const daysLeft = rem / dailyRate;
        const defaultPackSize = m.totalDoses && m.totalDoses > 0 ? m.totalDoses : 30;
        return {
          med: m, remainingDoses: rem, dailyRate, daysLeft,
          daysLeftRounded: Math.ceil(daysLeft), alertDays, defaultPackSize, isLow: daysLeft <= alertDays,
        };
      })
      .filter((item) => item.isLow)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [medications]);

  const medFajrMin = prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const medMaghribMin = prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;

  const medAdherenceSummary = useMemo(() => {
    const todayWeekday = last7CairoDays[last7CairoDays.length - 1]?.weekdayNum ?? 0;
    const dueTodayMeds = medications.filter((m) => {
      if (m.daysOfWeek && m.daysOfWeek.length > 0 && !m.daysOfWeek.includes(todayWeekday)) return false;
      const rawTimes = m.times24 && m.times24.length > 0 ? m.times24 : m.time24 ? [m.time24] : [];
      if (rawTimes.length > 0 && dailyRhythmPlan.isFastingToday) {
        const resolved = resolveMedicationDosesForDay(m, { isFastingToday: true, fajrMin: medFajrMin, maghribMin: medMaghribMin });
        if (resolved.doses.length === 0 && resolved.skippedCount > 0) return false;
      }
      return true;
    });
    const takenTodayCount = dueTodayMeds.filter((m) => {
      const times = m.times24 && m.times24.length > 0 ? m.times24 : m.time24 ? [m.time24] : [];
      const takenDoses = m.takenDateKey === todayCairoIso ? m.takenDosesToday ?? [] : [];
      const isDateInHistory = (m.takenDates ?? []).includes(todayCairoIso);
      return isDateInHistory || (m.takenDateKey === todayCairoIso && (times.length <= 1 || times.every((t) => takenDoses.includes(t))));
    }).length;

    let totalSlots = 0;
    let takenSlots = 0;
    let missedPastSlots = 0;
    for (const med of medications) {
      const dateSet = new Set(med.takenDates ?? []);
      if (med.takenDateKey === todayCairoIso) dateSet.add(todayCairoIso);
      for (const d of last7CairoDays) {
        const scheduled = !med.daysOfWeek || med.daysOfWeek.length === 0 || med.daysOfWeek.includes(d.weekdayNum);
        if (!scheduled) continue;
        totalSlots += 1;
        if (dateSet.has(d.dateIso)) takenSlots += 1;
        else if (!d.isToday) missedPastSlots += 1;
      }
    }
    const adherencePct = totalSlots > 0 ? Math.round((takenSlots / totalSlots) * 100) : 0;
    return { dueTodayCount: dueTodayMeds.length, takenTodayCount, missedPastSlots, adherencePct };
  }, [medications, last7CairoDays, todayCairoIso, dailyRhythmPlan.isFastingToday, medFajrMin, medMaghribMin]);

  return { last7CairoDays, lowStockMedications, medFajrMin, medMaghribMin, medAdherenceSummary };
}
