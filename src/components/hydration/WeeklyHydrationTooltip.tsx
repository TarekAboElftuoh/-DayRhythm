import React from 'react';
import { Flame } from 'lucide-react';
import { HydrationDayLog, WeatherHydrationInfo } from '../../types/dayrhythm';


export interface HydrationWeeklyChartProps {
  hydrationHistory: HydrationDayLog[];
  weatherInfo?: WeatherHydrationInfo | null;
  cupSizeMl?: number;
}

export interface ChartPoint {
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

export const WeeklyHydrationTooltip: React.FC<{ pt: ChartPoint | null }> = ({ pt }) => {
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

