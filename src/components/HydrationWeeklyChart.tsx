import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { HydrationDayLog } from '../types/dayrhythm';

interface HydrationWeeklyChartProps {
  hydrationHistory: HydrationDayLog[];
}

interface ChartPoint {
  labelAr: string;
  cups: number;
  target: number;
  ml: number;
  pct: number;
}

export const HydrationWeeklyChart: React.FC<HydrationWeeklyChartProps> = ({
  hydrationHistory,
}) => {
  const data: ChartPoint[] = useMemo(
    () =>
      hydrationHistory.map((d) => ({
        labelAr: d.labelAr,
        cups: d.cupsLogged,
        target: d.targetCups,
        ml: d.cupsLogged * 177,
        pct: Math.min(100, Math.round((d.cupsLogged / Math.max(1, d.targetCups)) * 100)),
      })),
    [hydrationHistory]
  );

  const avgCups = useMemo(() => {
    const sum = data.reduce((acc, p) => acc + p.cups, 0);
    return (sum / Math.max(1, data.length)).toFixed(1);
  }, [data]);

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-white">الأسبوع (آخر 7 أيام)</h3>
        <span className="font-mono-tabular text-xs text-[#7FFFD4]">
          المتوسط: {avgCups} كوب/يوم
        </span>
      </div>

      <div className="h-[170px] w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
          >
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="labelAr"
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 15]}
              tick={{ fill: '#71717a', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(127,255,212,0.06)' }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const p = payload[0].payload as ChartPoint;
                return (
                  <div
                    dir="rtl"
                    className="rounded-xl border border-white/15 bg-black/95 px-3 py-2 text-xs shadow-xl"
                  >
                    <div className="font-bold text-white mb-1">{p.labelAr}</div>
                    <div className="font-mono-tabular text-[#7FFFD4]">
                      {p.cups} / {p.target} كوب ({p.ml} مل)
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      الإنجاز: {p.pct}%
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="cups" radius={[6, 6, 0, 0]} maxBarSize={26}>
              {data.map((entry, idx) => (
                <Cell
                  key={`bar-${idx}`}
                  fill={entry.cups >= entry.target ? '#4ADE80' : '#7FFFD4'}
                  fillOpacity={idx === data.length - 1 ? 1 : 0.72}
                />
              ))}
            </Bar>
            <Line
              type="monotone"
              dataKey="target"
              stroke="#fbbf24"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={{ r: 2.5, fill: '#fbbf24' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
