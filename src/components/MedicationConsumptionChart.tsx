import React, { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { MedicationItem } from '../types/dayrhythm';
import { MedicationRefillForecast } from './MedicationRefillForecast';

import {
  AR_WEEKDAYS, addDaysUtc, formatArabicFullDate, formatArabicShortDate,
  getDoseTimes, getDosesTakenOnDate, isMedScheduledOnWeekday, parseIsoUtc, toIsoDateUtc,
  type DayConsumptionPoint, type MedicationConsumptionChartProps, type RefillForecast,
} from './medications/chartHelpers';
import { ConsumptionSvgChart } from './medications/ConsumptionSvgChart';

export const MedicationConsumptionChart: React.FC<MedicationConsumptionChartProps> = ({
  medications,
  todayCairoIso,
}) => {
  const [selectedMedId, setSelectedMedId] = useState<string>('all');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const effectiveMedId = useMemo(() => {
    if (selectedMedId === 'all') return 'all';
    return medications.some((m) => m.id === selectedMedId) ? selectedMedId : 'all';
  }, [medications, selectedMedId]);

  const activeMeds = useMemo(
    () =>
      effectiveMedId === 'all'
        ? medications
        : medications.filter((m) => m.id === effectiveMedId),
    [effectiveMedId, medications]
  );

  const { series, totalTaken14d, totalScheduled14d, avgDailyTaken, adherencePct, forecasts } =
    useMemo(() => {
      const todayUtc = parseIsoUtc(todayCairoIso);
      const rawPoints: Array<Omit<DayConsumptionPoint, 'trend7d'>> = [];

      for (let offset = 13; offset >= 0; offset -= 1) {
        const dt = addDaysUtc(todayUtc, -offset);
        const dateIso = toIsoDateUtc(dt);
        const weekdayNum = dt.getUTCDay();

        let taken = 0;
        let scheduled = 0;

        for (const med of activeMeds) {
          const doseTimes = getDoseTimes(med);
          const perDay = Math.max(1, doseTimes.length);
          if (isMedScheduledOnWeekday(med, weekdayNum)) {
            scheduled += perDay;
          }
          taken += getDosesTakenOnDate(med, dateIso, todayCairoIso);
        }

        rawPoints.push({
          dateIso,
          shortLabel: offset === 0 ? 'اليوم' : `${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`,
          fullDateAr: formatArabicFullDate(dt),
          taken,
          scheduled,
          isToday: offset === 0,
        });
      }

      // 7-day rolling average for consumption trend line
      const chartSeries: DayConsumptionPoint[] = rawPoints.map((pt, idx) => {
        const start = Math.max(0, idx - 6);
        let sum = 0;
        for (let j = start; j <= idx; j += 1) {
          sum += rawPoints[j].taken;
        }
        const windowSize = idx - start + 1;
        return {
          ...pt,
          trend7d: Number((sum / windowSize).toFixed(2)),
        };
      });

      const totalTaken = chartSeries.reduce((acc, p) => acc + p.taken, 0);
      const totalScheduled = chartSeries.reduce((acc, p) => acc + p.scheduled, 0);

      // Determine active window span (from first recorded dose in last 14 days)
      const firstActiveIdx = chartSeries.findIndex((p) => p.taken > 0);
      const activeSpanDays = firstActiveIdx >= 0 ? Math.max(1, 14 - firstActiveIdx) : 14;
      const avgDaily = totalTaken > 0 ? totalTaken / activeSpanDays : 0;

      const scheduledInActiveSpan =
        firstActiveIdx >= 0
          ? chartSeries.slice(firstActiveIdx).reduce((acc, p) => acc + p.scheduled, 0)
          : totalScheduled;
      const adherence =
        scheduledInActiveSpan > 0
          ? Math.min(100, Math.round((totalTaken / scheduledInActiveSpan) * 100))
          : 0;

      // Compute per-medication refill forecasts for tracked stock items
      const computedForecasts: RefillForecast[] = [];
      for (const med of activeMeds) {
        if (typeof med.remainingDoses !== 'number' || med.remainingDoses < 0) continue;

        const doseTimes = getDoseTimes(med);
        const dosesPerScheduledDay = Math.max(1, doseTimes.length);
        const daysPerWeek =
          med.daysOfWeek && med.daysOfWeek.length > 0 ? med.daysOfWeek.length : 7;
        const scheduledDailyRate = (dosesPerScheduledDay * daysPerWeek) / 7;

        let medTaken14d = 0;
        let firstLoggedOffset = -1;
        let loggedDaysCount = 0;

        for (let i = 0; i < rawPoints.length; i += 1) {
          const t = getDosesTakenOnDate(med, rawPoints[i].dateIso, todayCairoIso);
          if (t > 0) {
            medTaken14d += t;
            loggedDaysCount += 1;
            if (firstLoggedOffset === -1) firstLoggedOffset = i;
          }
        }

        const spanDays = firstLoggedOffset >= 0 ? 14 - firstLoggedOffset : 0;
        const useActualRate = loggedDaysCount >= 3 && spanDays >= 4;
        const rawRate = useActualRate ? medTaken14d / spanDays : scheduledDailyRate;
        const dailyRate = Math.max(0.14, rawRate);

        const alertLeadDays = Math.max(1, Math.min(14, med.refillAlertDays ?? 3));
        const daysUntilEmpty =
          med.remainingDoses <= 0 ? 0 : Math.ceil(med.remainingDoses / dailyRate);
        const runOutDt = addDaysUtc(todayUtc, daysUntilEmpty);
        const buyByDt = addDaysUtc(todayUtc, Math.max(0, daysUntilEmpty - alertLeadDays));

        const urgency: RefillForecast['urgency'] =
          med.remainingDoses === 0
            ? 'empty'
            : daysUntilEmpty <= alertLeadDays
              ? 'soon'
              : 'ok';

        computedForecasts.push({
          id: med.id,
          name: med.name,
          remainingDoses: med.remainingDoses,
          dailyRate,
          rateSource: useActualRate ? 'actual' : 'scheduled',
          daysUntilEmpty,
          runOutDateAr: formatArabicShortDate(runOutDt),
          buyByDateAr:
            daysUntilEmpty <= alertLeadDays ? 'الآن' : formatArabicShortDate(buyByDt),
          alertLeadDays,
          urgency,
        });
      }

      computedForecasts.sort((a, b) => a.daysUntilEmpty - b.daysUntilEmpty);

      return {
        series: chartSeries,
        totalTaken14d: totalTaken,
        totalScheduled14d: totalScheduled,
        avgDailyTaken: avgDaily,
        adherencePct: adherence,
        forecasts: computedForecasts,
      };
    }, [activeMeds, todayCairoIso]);

  if (medications.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
      {/* Header & 14-Day KPI Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-[#7FFFD4]" />
          <h4 className="text-xs font-bold text-white">استهلاك الجرعات (آخر 14 يوماً)</h4>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-tabular">
          <span className="rounded-md bg-[#4ADE80]/10 px-1.5 py-0.5 text-[#4ADE80] font-semibold">
            {totalTaken14d} جرعة
          </span>
          <span className="text-[#7FFFD4]">
            {avgDailyTaken > 0 ? `${avgDailyTaken.toFixed(1)}/يوم` : '0/يوم'}
          </span>
          {totalScheduled14d > 0 && totalTaken14d > 0 && (
            <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-zinc-300">
              التزام {adherencePct}%
            </span>
          )}
        </div>
      </div>

      {/* Per-Medication Filter Row (when multiple medications exist) */}
      {medications.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedMedId('all')}
            className={`px-2 py-0.5 rounded-lg border text-[10px] transition-colors cursor-pointer ${
              effectiveMedId === 'all'
                ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                : 'border-white/10 bg-black/40 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            كل العلاجات ({medications.length})
          </button>
          {medications.map((med) => (
            <button
              key={med.id}
              type="button"
              onClick={() => setSelectedMedId(med.id)}
              className={`px-2 py-0.5 rounded-lg border text-[10px] truncate max-w-[140px] transition-colors cursor-pointer ${
                effectiveMedId === med.id
                  ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                  : 'border-white/10 bg-black/40 text-zinc-400 hover:text-zinc-200'
              }`}
              title={med.name}
            >
              {med.name}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-white/[0.08] bg-black/45 p-2.5 relative">
      <ConsumptionSvgChart
        series={series}
        hoveredIdx={hoveredIdx}
        setHoveredIdx={setHoveredIdx}
      />
        {/* Compact Chart Legend */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-xs bg-[#4ADE80]" />
              جرعات مأخوذة
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-xs bg-white/15" />
              غير مسجّل
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 bg-[#7FFFD4]" />
              اتجاه 7 أيام
            </span>
          </div>
          {totalTaken14d === 0 && (
            <span className="text-zinc-500">اضغط «تم اليوم» لبدء رسم الاتجاه</span>
          )}
        </div>
      </div>

      <MedicationRefillForecast forecasts={forecasts} />
    </div>
  );
};

