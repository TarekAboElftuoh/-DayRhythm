import React, { useMemo, useState } from 'react';
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

const Y_TICKS = [0, 5, 10, 15];
const MAX_Y = 15;

export const HydrationWeeklyChart: React.FC<HydrationWeeklyChartProps> = ({
  hydrationHistory,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

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

  // SVG layout coordinate space (responsive via viewBox)
  const vbWidth = 420;
  const vbHeight = 170;
  const padLeft = 28;
  const padRight = 10;
  const padTop = 12;
  const padBottom = 26;
  const plotW = vbWidth - padLeft - padRight;
  const plotH = vbHeight - padTop - padBottom;

  const count = Math.max(1, data.length);
  const slotW = plotW / count;
  const barW = Math.min(26, Math.max(12, slotW * 0.48));

  const yForValue = (val: number) => {
    const clamped = Math.max(0, Math.min(MAX_Y, val));
    return padTop + plotH - (clamped / MAX_Y) * plotH;
  };

  const targetLinePoints = data
    .map((p, idx) => {
      const cx = padLeft + idx * slotW + slotW / 2;
      const cy = yForValue(p.target);
      return `${cx.toFixed(1)},${cy.toFixed(1)}`;
    })
    .join(' ');

  const hoveredPoint = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-white">الأسبوع (آخر 7 أيام)</h3>
        <span className="font-mono-tabular text-xs text-[#7FFFD4]">
          المتوسط: {avgCups} كوب/يوم
        </span>
      </div>

      <div
        className="relative h-[170px] w-full select-none"
        dir="ltr"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        <svg
          viewBox={`0 0 ${vbWidth} ${vbHeight}`}
          className="h-full w-full overflow-visible"
          role="img"
          aria-label="رسم بياني للترطيب الأسبوعي"
        >
          {/* Horizontal grid lines & Y axis ticks */}
          {Y_TICKS.map((tick) => {
            const y = yForValue(tick);
            return (
              <g key={`y-${tick}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={vbWidth - padRight}
                  y2={y}
                  stroke={tick === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)'}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="#71717a"
                  fontSize="10"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Hover band + Bars + X labels */}
          {data.map((entry, idx) => {
            const slotX = padLeft + idx * slotW;
            const cx = slotX + slotW / 2;
            const barTop = yForValue(entry.cups);
            const barBottom = yForValue(0);
            const barH = Math.max(2, barBottom - barTop);
            const fill = entry.cups >= entry.target ? '#4ADE80' : '#7FFFD4';
            const fillOpacity = idx === data.length - 1 ? 1 : 0.72;
            const isHovered = hoveredIdx === idx;
            const r = Math.min(6, barH / 2);
            const bx = cx - barW / 2;

            // Rounded top-corners bar path
            const barPath = `M ${bx} ${barBottom} L ${bx} ${barTop + r} Q ${bx} ${barTop} ${bx + r} ${barTop} L ${bx + barW - r} ${barTop} Q ${bx + barW} ${barTop} ${bx + barW} ${barTop + r} L ${bx + barW} ${barBottom} Z`;

            return (
              <g
                key={`slot-${idx}`}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onClick={() => setHoveredIdx(isHovered ? null : idx)}
              >
                {isHovered && (
                  <rect
                    x={slotX + 2}
                    y={padTop}
                    width={Math.max(4, slotW - 4)}
                    height={plotH}
                    rx="6"
                    fill="rgba(127,255,212,0.06)"
                  />
                )}
                {/* Invisible full-slot hit area */}
                <rect
                  x={slotX}
                  y={padTop}
                  width={slotW}
                  height={plotH + padBottom}
                  fill="transparent"
                />
                <path
                  d={barPath}
                  fill={fill}
                  fillOpacity={isHovered ? 1 : fillOpacity}
                />
                <text
                  x={cx}
                  y={vbHeight - 8}
                  textAnchor="middle"
                  fill={isHovered ? '#ffffff' : '#a1a1aa'}
                  fontSize="11"
                >
                  {entry.labelAr}
                </text>
              </g>
            );
          })}

          {/* Target dashed line */}
          {data.length > 1 && (
            <polyline
              fill="none"
              stroke="#fbbf24"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              points={targetLinePoints}
              className="pointer-events-none"
            />
          )}

          {/* Target dots */}
          {data.map((entry, idx) => {
            const cx = padLeft + idx * slotW + slotW / 2;
            const cy = yForValue(entry.target);
            return (
              <circle
                key={`dot-${idx}`}
                cx={cx}
                cy={cy}
                r="2.6"
                fill="#fbbf24"
                className="pointer-events-none"
              />
            );
          })}
        </svg>

        {/* Interactive tooltip matching original design */}
        {hoveredPoint && hoveredIdx !== null && (
          <div
            dir="rtl"
            className="pointer-events-none absolute top-1 z-20 rounded-xl border border-white/15 bg-black/95 px-3 py-2 text-xs shadow-xl"
            style={{
              left: `${Math.min(72, Math.max(4, ((hoveredIdx + 0.5) / count) * 100 - 14))}%`,
            }}
          >
            <div className="font-bold text-white mb-1">{hoveredPoint.labelAr}</div>
            <div className="font-mono-tabular text-[#7FFFD4]">
              {hoveredPoint.cups} / {hoveredPoint.target} كوب ({hoveredPoint.ml} مل)
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              الإنجاز: {hoveredPoint.pct}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
