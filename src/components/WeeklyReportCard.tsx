import React, { useMemo } from 'react';
import { CalendarCheck } from 'lucide-react';
import { DualStreaks, HydrationDayLog, LifeProfile, MedicationItem } from '../types/dayrhythm';

interface WeeklyReportCardProps {
  hydrationHistory: HydrationDayLog[];
  medications: MedicationItem[];
  streaks: DualStreaks;
  lifeProfile: LifeProfile;
  todayIso: string;
  cardSurface: string;
}

function lastNDates(todayIso: string, n: number): string[] {
  const base = new Date(`${todayIso}T12:00:00Z`).getTime();
  if (Number.isNaN(base)) return [];
  return Array.from({ length: n }, (_, i) =>
    new Date(base - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10)
  );
}

/** A one-glance summary of the last 7 days. Deliberately small: four numbers and a 7-dot water strip. */
export const WeeklyReportCard: React.FC<WeeklyReportCardProps> = ({
  hydrationHistory,
  medications,
  streaks,
  lifeProfile,
  todayIso,
  cardSurface,
}) => {
  const report = useMemo(() => {
    const days = hydrationHistory.slice(-7);
    const cups = days.reduce((sum, d) => sum + d.cupsLogged, 0);
    const target = days.reduce((sum, d) => sum + d.targetCups, 0);
    const waterPct = target > 0 ? Math.round((cups / target) * 100) : 0;
    const waterDaysHit = days.filter((d) => d.targetCups > 0 && d.cupsLogged >= d.targetCups).length;

    // Medication adherence: scheduled days in the last 7 vs. days actually marked taken.
    const week = lastNDates(todayIso, 7);
    let scheduled = 0;
    let taken = 0;
    for (const med of medications) {
      const takenSet = new Set(med.takenDates ?? []);
      for (const iso of week) {
        const weekday = new Date(`${iso}T12:00:00Z`).getUTCDay();
        if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(weekday)) continue;
        if (med.courseEndDate && iso > med.courseEndDate) continue;
        scheduled += 1;
        if (takenSet.has(iso)) taken += 1;
      }
    }
    const medsPct = scheduled > 0 ? Math.round((taken / scheduled) * 100) : null;

    return {
      days,
      waterPct,
      waterDaysHit,
      medsPct,
      commitmentDays: streaks.dailyCommitmentDays,
      sleepDebtMin: lifeProfile.sleepDebtMinutes ?? 0,
    };
  }, [hydrationHistory, medications, streaks.dailyCommitmentDays, lifeProfile.sleepDebtMinutes, todayIso]);

  const stat = (label: string, value: string, good: boolean) => (
    <div className="min-w-0 rounded-lg bg-white/[0.03] px-2 py-1.5 text-center">
      <div className={`font-mono-tabular text-sm font-bold ${good ? 'text-[#7FFFD4]' : 'text-zinc-100'}`}>{value}</div>
      <div className="text-[11px] text-zinc-400 truncate">{label}</div>
    </div>
  );

  return (
    <section className={`rounded-2xl border p-4 space-y-2.5 ${cardSurface}`} aria-label="تقرير الأسبوع">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-[#7FFFD4]" />
          <span>آخر 7 أيام</span>
        </h2>
        <div className="flex items-center gap-1" aria-label="أيام تحقيق هدف المية">
          {report.days.map((d) => {
            const ratio = d.targetCups > 0 ? d.cupsLogged / d.targetCups : 0;
            return (
              <span
                key={d.dateKey}
                title={`${d.labelAr}: ${d.cupsLogged}/${d.targetCups}`}
                className={`w-2.5 h-2.5 rounded-full ${
                  ratio >= 1 ? 'bg-[#7FFFD4]' : ratio >= 0.6 ? 'bg-[#7FFFD4]/45' : 'bg-white/10'
                }`}
              />
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {stat('💧 المية', `${report.waterPct}%`, report.waterPct >= 90)}
        {stat('🎯 أيام الهدف', `${report.waterDaysHit}/7`, report.waterDaysHit >= 6)}
        {stat('💊 العلاجات', report.medsPct === null ? '—' : `${report.medsPct}%`, (report.medsPct ?? 0) >= 90)}
        {stat(
          '😴 رصيد النوم',
          report.sleepDebtMin > 0 ? `-${report.sleepDebtMin}د` : '✓',
          report.sleepDebtMin === 0
        )}
      </div>
      <div className="text-[11px] text-zinc-400">
        📖🌱 سلسلة الالتزام: <span className="font-mono-tabular text-zinc-200">{report.commitmentDays}</span> يوم
      </div>
    </section>
  );
};
