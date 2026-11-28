import React from 'react';
import { HEAT_EXCEEDANCE_TEMP_C } from '../../engines/weatherEngine';
import { WeeklyHydrationTooltip, type ChartPoint } from './WeeklyHydrationTooltip';

export const WeeklyHydrationSvg: React.FC<{
  data: ChartPoint[];
  maxCupsAxis: number;
  hasTempData: boolean;
  hoveredIdx: number | null;
  setHoveredIdx: (idx: number | null) => void;
}> = ({ data, maxCupsAxis, hasTempData, hoveredIdx, setHoveredIdx }) => {
  return (
    <>
      {/* Dual-Axis Pure SVG Visualization (Water Consumption vs Daily Target + Daily Max Temperature) */}
      
        <div className="h-[195px] w-full relative" dir="ltr" onMouseLeave={() => setHoveredIdx(null)}>
          {hoveredIdx !== null && data[hoveredIdx] && (
            <div className="absolute top-1 left-2 z-20 pointer-events-none">
              <WeeklyHydrationTooltip pt={data[hoveredIdx]} />
            </div>
          )}
          <svg viewBox="0 0 420 190" className="w-full h-full overflow-visible" preserveAspectRatio="xMidYMid meet">
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
    </>
  );
};
