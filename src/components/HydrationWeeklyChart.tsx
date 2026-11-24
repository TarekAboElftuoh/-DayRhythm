import React, { useMemo, useState } from 'react';
import { Flame, Droplets, CheckCircle2, ThermometerSun } from 'lucide-react';
import { HydrationDayLog, WeatherHydrationInfo } from '../types/dayrhythm';
import { HEAT_EXCEEDANCE_TEMP_C } from '../engines/weatherEngine';

interface HydrationWeeklyChartProps {
  hydrationHistory: HydrationDayLog[];
  weatherInfo?: WeatherHydrationInfo | null;
  cupSizeMl?: number;
}

interface ChartPoint {
  labelAr: string;
  dateKey: string;
  cups: number;
  target: number;
  ml: number;
  pct: number;
  metTarget: boolean;
  maxTempC: number | null;
  heatExceeded: boolean;
  heatBonusMl: number;
  isToday: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ChartPoint }>;
}

const WeeklyHydrationTooltip: React.FC<{ pt: ChartPoint | null }> = ({ pt }) => {
  if (!pt) return null;

  return (
    <div
      dir="rtl"
      className="rounded-xl border border-white/15 bg-[#0A0A0A] px-3 py-2 text-xs shadow-xl space-y-1 min-w-[175px]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold text-white">
          {pt.labelAr}
          {pt.isToday ? ' (اليوم)' : ''}
        </span>
        {pt.heatExceeded && (
          <span className="text-[10px] font-bold text-orange-300 flex items-center gap-0.5">
            <Flame className="w-3 h-3 text-orange-400" />
            تجاوز حراري
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 font-mono-tabular">
        <span className="text-zinc-400">الاستهلاك:</span>
        <span className={pt.metTarget ? 'text-[#4ADE80] font-bold' : 'text-[#7FFFD4] font-semibold'}>
          {pt.cups} / {pt.target} كوب ({pt.ml} مل)
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 font-mono-tabular">
        <span className="text-zinc-400">الالتزام بالهدف:</span>
        <span className={pt.metTarget ? 'text-[#4ADE80] font-bold' : 'text-zinc-200'}>
          {pt.pct}% {pt.metTarget ? '✓' : ''}
        </span>
      </div>

      {pt.maxTempC !== null && (
        <div className="flex items-center justify-between gap-3 font-mono-tabular pt-1 border-t border-white/10">
          <span className="text-zinc-400">العظمى:</span>
          <span className={pt.heatExceeded ? 'text-orange-300 font-bold' : 'text-zinc-300'}>
            {pt.maxTempC}°C
            {pt.heatBonusMl > 0 ? ` (+${pt.heatBonusMl} مل)` : ' · معتدل'}
          </span>
        </div>
      )}
    </div>
  );
};

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

      {/* Dual-Axis Pure SVG Visualization (Water Consumption vs Daily Target + Daily Max Temperature) */}
      <div className="rounded-xl border border-white/[0.08] bg-black/45 p-2.5 relative">
        <div className="h-[195px] w-full relative" dir="ltr" onMouseLeave={() => setHoveredIdx(null)}>
          {hoveredIdx !== null && data[hoveredIdx] && (
            <div className="absolute top-1 left-2 z-20 pointer-events-none">
              <WeeklyHydrationTooltip pt={data[hoveredIdx]} />
            </div>
          )}
          <svg viewBox="0 0 420 190" className="w-full h-full overflow-visible" preserveAspectRatio="none">
            {/* Horizontal grid lines & left Y-axis labels */}
            {[0, 0.33, 0.67, 1].map((ratio, idx) => {
              const y = 160 - ratio * 142;
              const val = Math.round(ratio * maxCupsAxis);
              return (
                <g key={idx}>
                  <line x1={28} x2={hasTempData ? 388 : 408} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                  <text x={22} y={y + 3} textAnchor="end" fill="#71717a" fontSize={10}>
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Right temperature axis labels & heat exceedance reference line */}
            {hasTempData && (
              <>
                {[10, 25, 38, 48].map((t) => {
                  const ty = 160 - ((t - 10) / 38) * 142;
                  return (
                    <text key={t} x={394} y={ty + 3} textAnchor="start" fill="#fb923c" fontSize={9}>
                      {t}°
                    </text>
                  );
                })}
                <line
                  x1={28}
                  x2={388}
                  y1={160 - ((HEAT_EXCEEDANCE_TEMP_C - 10) / 38) * 142}
                  y2={160 - ((HEAT_EXCEEDANCE_TEMP_C - 10) / 38) * 142}
                  stroke="rgba(249, 115, 22, 0.45)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
              </>
            )}

            {/* Bars + Hover zones */}
            {data.map((entry, idx) => {
              const plotLeft = 32;
              const plotRight = hasTempData ? 384 : 404;
              const step = (plotRight - plotLeft) / Math.max(1, data.length);
              const cx = plotLeft + step * idx + step / 2;
              const barW = Math.min(26, step * 0.54);
              const barH = Math.max(2, (entry.cups / Math.max(1, maxCupsAxis)) * 142);
              const fill = entry.metTarget ? '#4ADE80' : entry.heatExceeded ? '#FB923C' : '#7FFFD4';
              const opacity = entry.isToday ? 1 : 0.78;
              return (
                <g
                  key={entry.dateKey}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onClick={() => setHoveredIdx(hoveredIdx === idx ? null : idx)}
                >
                  {hoveredIdx === idx && (
                    <rect x={cx - step * 0.45} y={14} width={step * 0.9} height={146} fill="rgba(127, 255, 212, 0.06)" rx={4} />
                  )}
                  <rect
                    x={cx - barW / 2}
                    y={160 - barH}
                    width={barW}
                    height={barH}
                    rx={4}
                    fill={fill}
                    fillOpacity={opacity}
                    stroke={entry.heatExceeded ? '#F97316' : 'none'}
                    strokeWidth={entry.heatExceeded ? 1.2 : 0}
                  />
                  <text x={cx} y={176} textAnchor="middle" fill="#a1a1aa" fontSize={10}>
                    {entry.labelAr}
                  </text>
                </g>
              );
            })}

            {/* Daily Target Dashed Line */}
            {data.length > 1 && (
              <polyline
                fill="none"
                stroke="#FBBF24"
                strokeWidth={1.75}
                strokeDasharray="4 3"
                points={data
                  .map((entry, idx) => {
                    const plotLeft = 32;
                    const plotRight = hasTempData ? 384 : 404;
                    const step = (plotRight - plotLeft) / Math.max(1, data.length);
                    const cx = plotLeft + step * idx + step / 2;
                    const cy = 160 - (entry.target / Math.max(1, maxCupsAxis)) * 142;
                    return `${cx.toFixed(1)},${cy.toFixed(1)}`;
                  })
                  .join(' ')}
              />
            )}
            {data.map((entry, idx) => {
              const plotLeft = 32;
              const plotRight = hasTempData ? 384 : 404;
              const step = (plotRight - plotLeft) / Math.max(1, data.length);
              const cx = plotLeft + step * idx + step / 2;
              const cy = 160 - (entry.target / Math.max(1, maxCupsAxis)) * 142;
              return <circle key={`tgt-${entry.dateKey}`} cx={cx} cy={cy} r={2.4} fill="#FBBF24" />;
            })}

            {/* Daily Max Temperature Curve */}
            {hasTempData && (() => {
              const plotLeft = 32;
              const plotRight = 384;
              const step = (plotRight - plotLeft) / Math.max(1, data.length);
              const tempPts = data
                .map((entry, idx) => {
                  if (entry.maxTempC === null) return null;
                  const cx = plotLeft + step * idx + step / 2;
                  const cy = 160 - ((Math.min(48, Math.max(10, entry.maxTempC)) - 10) / 38) * 142;
                  return { cx, cy, entry };
                })
                .filter((v): v is { cx: number; cy: number; entry: ChartPoint } => v !== null);
              return (
                <>
                  {tempPts.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#FB923C"
                      strokeWidth={2}
                      points={tempPts.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ')}
                    />
                  )}
                  {tempPts.map(({ cx, cy, entry }) => (
                    <circle
                      key={`temp-${entry.dateKey}`}
                      cx={cx}
                      cy={cy}
                      r={entry.heatExceeded ? 4.2 : 2.8}
                      fill={entry.heatExceeded ? '#EF4444' : '#FB923C'}
                      stroke={entry.heatExceeded ? '#FEF08A' : '#000000'}
                      strokeWidth={entry.heatExceeded ? 1.5 : 1}
                    />
                  ))}
                </>
              );
            })()}
          </svg>
        </div>

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
