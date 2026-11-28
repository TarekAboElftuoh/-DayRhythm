import React from 'react';
import { ConsumptionTooltip, type DayConsumptionPoint } from './chartHelpers';

export const ConsumptionSvgChart: React.FC<{
  series: DayConsumptionPoint[];
  hoveredIdx: number | null;
  setHoveredIdx: (idx: number | null) => void;
}> = ({ series, hoveredIdx, setHoveredIdx }) => {
  return (
    <>
      {/* Pure SVG 14-Day Consumption & Rolling Trend Chart */}
      
        <div className="h-[175px] w-full relative" dir="ltr" onMouseLeave={() => setHoveredIdx(null)}>
          {hoveredIdx !== null && series[hoveredIdx] && (
            <div className="absolute top-1 left-2 z-20 pointer-events-none">
              <ConsumptionTooltip point={series[hoveredIdx]} />
            </div>
          )}
          {(() => {
            const maxY = Math.max(
              2,
              ...series.map((s) => Math.max(s.taken, Math.ceil(s.trend7d)))
            );
            const plotLeft = 28;
            const plotRight = 408;
            const step = (plotRight - plotLeft) / Math.max(1, series.length);
            const barW = Math.min(18, step * 0.62);

            return (
              <svg viewBox="0 0 420 172" className="w-full h-full overflow-visible" preserveAspectRatio="xMidYMid meet">
                {[0, 0.5, 1].map((ratio, idx) => {
                  const y = 144 - ratio * 124;
                  const val = Math.round(ratio * maxY);
                  return (
                    <g key={idx}>
                      <line
                        x1={plotLeft}
                        x2={plotRight}
                        y1={y}
                        y2={y}
                        stroke={ratio === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}
                        strokeDasharray={ratio === 0 ? undefined : '3 3'}
                        strokeWidth={1}
                      />
                      <text x={22} y={y + 3} textAnchor="end" fill="#71717a" fontSize={10}>
                        {val}
                      </text>
                    </g>
                  );
                })}

                {series.map((entry, idx) => {
                  const cx = plotLeft + step * idx + step / 2;
                  const isActive = entry.taken > 0;
                  const barH = isActive ? Math.max(6, (entry.taken / maxY) * 124) : 4;
                  const fullHit = entry.scheduled > 0 && entry.taken >= entry.scheduled;
                  const fill = !isActive
                    ? 'rgba(255,255,255,0.10)'
                    : fullHit
                      ? '#4ADE80'
                      : '#7FFFD4';
                  const opacity = !isActive ? 1 : entry.isToday ? 1 : 0.78;
                  const showLabel = idx % 3 === 0 || idx === series.length - 1;
                  return (
                    <g
                      key={entry.dateIso}
                      className="cursor-pointer outline-none"
                      tabIndex={0}
                      role="button"
                      aria-label={`${entry.fullDateAr}: ${entry.taken} من ${entry.scheduled}`}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onFocus={() => setHoveredIdx(idx)}
                      onBlur={() => setHoveredIdx(null)}
                      onClick={() => setHoveredIdx(hoveredIdx === idx ? null : idx)}
                    >
                      {hoveredIdx === idx && (
                        <rect x={cx - step * 0.48} y={14} width={step * 0.96} height={130} fill="rgba(127, 255, 212, 0.07)" rx={4} />
                      )}
                      <rect
                        x={cx - barW / 2}
                        y={144 - barH}
                        width={barW}
                        height={barH}
                        rx={isActive ? 4 : 2}
                        fill={fill}
                        fillOpacity={opacity}
                      />
                      {entry.isToday && (
                        <circle cx={cx} cy={149} r={2} fill="#7FFFD4" />
                      )}
                      {showLabel && (
                        <text
                          x={cx}
                          y={163}
                          textAnchor="middle"
                          fill={entry.isToday ? '#7FFFD4' : '#a1a1aa'}
                          fontWeight={entry.isToday ? 700 : 400}
                          fontSize={10}
                        >
                          {entry.shortLabel}
                        </text>
                      )}
                    </g>
                  );
                })}

                {series.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#7FFFD4"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={series
                      .map((entry, idx) => {
                        const cx = plotLeft + step * idx + step / 2;
                        const cy = 144 - (entry.trend7d / maxY) * 124;
                        return `${cx.toFixed(1)},${cy.toFixed(1)}`;
                      })
                      .join(' ')}
                  />
                )}
                {hoveredIdx !== null && series[hoveredIdx] && (
                  <circle
                    cx={plotLeft + step * hoveredIdx + step / 2}
                    cy={144 - (series[hoveredIdx].trend7d / maxY) * 124}
                    r={3.5}
                    fill="#7FFFD4"
                    stroke="#000000"
                    strokeWidth={1.5}
                  />
                )}
              </svg>
            );
          })()}
        </div>
    </>
  );
};
