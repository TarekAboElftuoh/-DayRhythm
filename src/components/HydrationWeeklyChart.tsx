import React, { useMemo, useState } from 'react';
import { Flame, Droplets, CheckCircle2, ThermometerSun } from 'lucide-react';
import { HydrationDayLog, WeatherHydrationInfo } from '../types/dayrhythm';
import { HEAT_EXCEEDANCE_TEMP_C } from '../engines/weatherEngine';

import { WeeklyHydrationTooltip, type ChartPoint, type HydrationWeeklyChartProps } from './hydration/WeeklyHydrationTooltip';
import { WeeklyHydrationSvg } from './hydration/WeeklyHydrationSvg';
void WeeklyHydrationTooltip;

export const HydrationWeeklyChart: React.FC<HydrationWeeklyChartProps> = ({
  hydrationHistory,
  weatherInfo,
  cupSizeMl = 250,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const { data, avgCups, avgCommitmentPct, daysMetTarget, heatComparison, peakTempC, hasTempData } =
    useMemo(() => {
      const dailyTemps = weatherInfo?.dailyMaxTemps ?? [];
      const tempByDate = new Map(dailyTemps.map((t) => [t.dateIso, t]));
      const totalDays = hydrationHistory.length;

      const points: ChartPoint[] = hydrationHistory.map((d, idx) => {
        const isToday = idx === totalDays - 1;
        // Align temperature by exact ISO date first, then positional last-7 index, then today's maxTempC
        const alignedTemp =
          tempByDate.get(d.dateKey) ??
          (dailyTemps.length >= totalDays
            ? dailyTemps[dailyTemps.length - totalDays + idx]
            : undefined);

        const maxTempC =
          alignedTemp?.maxTempC ?? (isToday && typeof weatherInfo?.maxTempC === 'number' ? weatherInfo.maxTempC : null);
        const heatExceeded =
          alignedTemp?.heatExceeded ??
          (maxTempC !== null ? maxTempC >= HEAT_EXCEEDANCE_TEMP_C : false);
        const heatBonusMl =
          alignedTemp?.heatBonusMl ?? (isToday ? weatherInfo?.heatBonusMl ?? 0 : 0);

        const target = Math.max(1, d.targetCups);
        const pct = Math.min(100, Math.round((d.cupsLogged / target) * 100));

        return {
          labelAr: d.labelAr,
          dateKey: d.dateKey,
          cups: d.cupsLogged,
          target,
          ml: Math.round(d.cupsLogged * cupSizeMl),
          pct,
          metTarget: d.cupsLogged >= target,
          maxTempC,
          heatExceeded,
          heatBonusMl,
          isToday,
        };
      });

      const sumCups = points.reduce((acc, p) => acc + p.cups, 0);
      const sumPct = points.reduce((acc, p) => acc + p.pct, 0);
      const metCount = points.filter((p) => p.metTarget).length;

      const hotDays = points.filter((p) => p.heatExceeded);
      const normalDays = points.filter((p) => p.maxTempC !== null && !p.heatExceeded);
      const tempsAvailable = points
        .map((p) => p.maxTempC)
        .filter((t): t is number => typeof t === 'number');

      const hotAvgCups =
        hotDays.length > 0
          ? hotDays.reduce((acc, p) => acc + p.cups, 0) / hotDays.length
          : 0;
      const hotAvgPct =
        hotDays.length > 0
          ? Math.round(hotDays.reduce((acc, p) => acc + p.pct, 0) / hotDays.length)
          : 0;
      const normalAvgCups =
        normalDays.length > 0
          ? normalDays.reduce((acc, p) => acc + p.cups, 0) / normalDays.length
          : 0;
      const normalAvgPct =
        normalDays.length > 0
          ? Math.round(normalDays.reduce((acc, p) => acc + p.pct, 0) / normalDays.length)
          : 0;

      return {
        data: points,
        avgCups: (sumCups / Math.max(1, points.length)).toFixed(1),
        avgCommitmentPct: Math.round(sumPct / Math.max(1, points.length)),
        daysMetTarget: metCount,
        hasTempData: tempsAvailable.length > 0,
        peakTempC: tempsAvailable.length > 0 ? Math.max(...tempsAvailable) : null,
        heatComparison: {
          hotCount: hotDays.length,
          hotAvgCups: hotAvgCups.toFixed(1),
          hotAvgPct,
          normalCount: normalDays.length,
          normalAvgCups: normalAvgCups.toFixed(1),
          normalAvgPct,
        },
      };
    }, [hydrationHistory, weatherInfo, cupSizeMl]);

  const maxCupsAxis = useMemo(() => {
    const highest = Math.max(12, ...data.map((d) => Math.max(d.cups, d.target)));
    return Math.ceil(highest / 3) * 3;
  }, [data]);

  return (
    <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
      {/* Header & Weekly Commitment KPIs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Droplets className="w-3.5 h-3.5 text-[#7FFFD4]" />
          <h3 className="text-xs font-bold text-white">
            تطور استهلاك الماء الأسبوعي ومقارنة الحرارة
          </h3>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono-tabular">
          <span className="text-[#7FFFD4] font-semibold">المتوسط: {avgCups} كوب</span>
          <span className="text-zinc-600">·</span>
          <span className={daysMetTarget >= 5 ? 'text-[#4ADE80] font-bold' : 'text-zinc-300'}>
            الالتزام: {daysMetTarget}/{data.length} ({avgCommitmentPct}%)
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-black/45 p-2.5 relative">
      <WeeklyHydrationSvg
        data={data}
        maxCupsAxis={maxCupsAxis}
        hasTempData={hasTempData}
        hoveredIdx={hoveredIdx}
        setHoveredIdx={setHoveredIdx}
      />
        {/* Compact Chart Legend */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-xs bg-[#4ADE80]" />
              تحقق الهدف
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-xs bg-[#7FFFD4]" />
              أقل من الهدف
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 border-t border-dashed border-amber-400" />
              الهدف اليومي
            </span>
            {hasTempData && (
              <span className="flex items-center gap-1 text-orange-300">
                <span className="inline-block w-2 h-2 rounded-full bg-orange-400" />
                الحرارة (تجاوز ≥ {HEAT_EXCEEDANCE_TEMP_C}°C)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Daily Commitment & Temperature Exceedance Comparison Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-xl border border-white/[0.08] bg-black/45 px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-zinc-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />
            <span>الالتزام بالأهداف اليومية</span>
          </div>
          <span className="font-mono-tabular font-bold text-[#4ADE80]">
            {daysMetTarget} من {data.length} أيام ({avgCommitmentPct}%)
          </span>
        </div>

        <div
          className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${
            heatComparison.hotCount > 0
              ? 'border-orange-400/35 bg-orange-500/[0.08]'
              : 'border-white/[0.08] bg-black/45'
          }`}
        >
          {heatComparison.hotCount > 0 ? (
            <>
              <div className="flex items-center gap-1.5 text-orange-200 min-w-0">
                <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span className="truncate">
                  أيام تجاوز الحرارة ({heatComparison.hotCount} ي ≥ {HEAT_EXCEEDANCE_TEMP_C}°C)
                </span>
              </div>
              <span className="font-mono-tabular text-[10px] text-orange-200 font-bold shrink-0">
                {heatComparison.hotAvgCups} كوب ({heatComparison.hotAvgPct}%)
                {heatComparison.normalCount > 0
                  ? ` vs معتدل ${heatComparison.normalAvgCups}`
                  : ''}
              </span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-zinc-300 min-w-0">
                <ThermometerSun className="w-3.5 h-3.5 text-orange-300 shrink-0" />
                <span className="truncate">مقارنة درجات الحرارة (حد {HEAT_EXCEEDANCE_TEMP_C}°C)</span>
              </div>
              <span className="font-mono-tabular text-[10px] text-zinc-400 shrink-0">
                {peakTempC !== null
                  ? `أعلى حرارة ${peakTempC}°C (لا تجاوزات)`
                  : 'بانتظار بيانات الطقس'}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

