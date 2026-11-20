import React, { useMemo, useState } from 'react';
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
import { TrendingUp, ShoppingBag, CalendarClock } from 'lucide-react';
import { MedicationItem } from '../types/dayrhythm';

interface MedicationConsumptionChartProps {
  medications: MedicationItem[];
  todayCairoIso: string;
}

interface DayConsumptionPoint {
  dateIso: string;
  shortLabel: string;
  fullDateAr: string;
  taken: number;
  scheduled: number;
  trend7d: number;
  isToday: boolean;
}

interface RefillForecast {
  id: string;
  name: string;
  remainingDoses: number;
  dailyRate: number;
  rateSource: 'actual' | 'scheduled';
  daysUntilEmpty: number;
  runOutDateAr: string;
  buyByDateAr: string;
  alertLeadDays: number;
  urgency: 'empty' | 'soon' | 'ok';
}

const AR_SHORT_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const AR_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function parseIsoUtc(dateIso: string): Date {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1, 12, 0, 0));
}

function addDaysUtc(baseDate: Date, offsetDays: number): Date {
  const dt = new Date(baseDate.getTime());
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return dt;
}

function toIsoDateUtc(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatArabicShortDate(dt: Date): string {
  return `${dt.getUTCDate()} ${AR_SHORT_MONTHS[dt.getUTCMonth()] ?? ''}`;
}

function formatArabicFullDate(dt: Date): string {
  const dayName = AR_WEEKDAYS[dt.getUTCDay()] ?? '';
  return `${dayName} ${dt.getUTCDate()} ${AR_SHORT_MONTHS[dt.getUTCMonth()] ?? ''}`;
}

function getDoseTimes(med: MedicationItem): string[] {
  if (med.times24 && med.times24.length > 0) return med.times24;
  if (med.time24) return [med.time24];
  return [];
}

function isMedScheduledOnWeekday(med: MedicationItem, weekdayNum: number): boolean {
  if (!med.daysOfWeek || med.daysOfWeek.length === 0) return true;
  return med.daysOfWeek.includes(weekdayNum);
}

function getDosesTakenOnDate(med: MedicationItem, dateIso: string, todayCairoIso: string): number {
  const doseTimes = getDoseTimes(med);
  const fullDayDoses = Math.max(1, doseTimes.length);

  if (dateIso === todayCairoIso) {
    if (med.takenDateKey === todayCairoIso) {
      if (doseTimes.length > 1) {
        return Math.min(doseTimes.length, (med.takenDosesToday ?? []).length);
      }
      return 1;
    }
    if ((med.takenDates ?? []).includes(todayCairoIso)) {
      return fullDayDoses;
    }
    return 0;
  }

  return (med.takenDates ?? []).includes(dateIso) ? fullDayDoses : 0;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: DayConsumptionPoint }>;
}

const ConsumptionTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div
      dir="rtl"
      className="rounded-xl border border-white/15 bg-black/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md"
    >
      <div className="font-bold text-white mb-1">
        {point.fullDateAr}
        {point.isToday ? ' · اليوم' : ''}
      </div>
      <div className="flex items-center justify-between gap-4 font-mono-tabular">
        <span className="text-zinc-400">الجرعات المأخوذة:</span>
        <span className={point.taken > 0 ? 'text-[#4ADE80] font-bold' : 'text-zinc-400'}>
          {point.taken}
          {point.scheduled > 0 ? ` / ${point.scheduled}` : ''}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 font-mono-tabular mt-0.5">
        <span className="text-zinc-400">اتجاه 7 أيام:</span>
        <span className="text-[#7FFFD4] font-semibold">{point.trend7d.toFixed(1)} جرعة/يوم</span>
      </div>
    </div>
  );
};

export const MedicationConsumptionChart: React.FC<MedicationConsumptionChartProps> = ({
  medications,
  todayCairoIso,
}) => {
  const [selectedMedId, setSelectedMedId] = useState<string>('all');

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

  const { series, totalTaken30d, totalScheduled30d, avgDailyTaken, adherencePct, forecasts } =
    useMemo(() => {
      const todayUtc = parseIsoUtc(todayCairoIso);
      const rawPoints: Array<Omit<DayConsumptionPoint, 'trend7d'>> = [];

      for (let offset = 29; offset >= 0; offset -= 1) {
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

      // Determine active window span (from first recorded dose in last 30 days, minimum 7 days for smooth avg)
      const firstActiveIdx = chartSeries.findIndex((p) => p.taken > 0);
      const activeSpanDays = firstActiveIdx >= 0 ? Math.max(1, 30 - firstActiveIdx) : 30;
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

        let medTaken30d = 0;
        let firstLoggedOffset = -1;
        let loggedDaysCount = 0;

        for (let i = 0; i < rawPoints.length; i += 1) {
          const t = getDosesTakenOnDate(med, rawPoints[i].dateIso, todayCairoIso);
          if (t > 0) {
            medTaken30d += t;
            loggedDaysCount += 1;
            if (firstLoggedOffset === -1) firstLoggedOffset = i;
          }
        }

        const spanDays = firstLoggedOffset >= 0 ? 30 - firstLoggedOffset : 0;
        const useActualRate = loggedDaysCount >= 3 && spanDays >= 4;
        const rawRate = useActualRate ? medTaken30d / spanDays : scheduledDailyRate;
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
        totalTaken30d: totalTaken,
        totalScheduled30d: totalScheduled,
        avgDailyTaken: avgDaily,
        adherencePct: adherence,
        forecasts: computedForecasts,
      };
    }, [activeMeds, todayCairoIso]);

  if (medications.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-white/10 space-y-2.5">
      {/* Header & Monthly KPI Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-[#7FFFD4]" />
          <h4 className="text-xs font-bold text-white">استهلاك الجرعات (آخر 30 يوماً)</h4>
        </div>
        <div className="flex items-center gap-2.5 text-[11px] font-mono-tabular">
          <span className="text-[#4ADE80] font-semibold">{totalTaken30d} جرعة</span>
          <span className="text-zinc-600">·</span>
          <span className="text-[#7FFFD4]">
            {avgDailyTaken > 0 ? `${avgDailyTaken.toFixed(1)}/يوم` : '0/يوم'}
          </span>
          {totalScheduled30d > 0 && totalTaken30d > 0 && (
            <>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400">التزام {adherencePct}%</span>
            </>
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

      {/* Recharts 30-Day Consumption & Rolling Trend Chart */}
      <div className="rounded-xl border border-white/[0.08] bg-black/45 p-2.5">
        <div className="h-[175px] w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="shortLabel"
                tick={{ fill: '#71717a', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
                interval={5}
                minTickGap={16}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#71717a', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={34}
              />
              <Tooltip
                content={<ConsumptionTooltip />}
                cursor={{ fill: 'rgba(127, 255, 212, 0.06)' }}
              />
              <Bar
                dataKey="taken"
                name="جرعات اليوم"
                radius={[3, 3, 0, 0]}
                maxBarSize={14}
                isAnimationActive={false}
              >
                {series.map((entry) => {
                  const fullHit = entry.scheduled > 0 && entry.taken >= entry.scheduled;
                  const fill = fullHit ? '#4ADE80' : '#7FFFD4';
                  const opacity = entry.isToday ? 1 : entry.taken > 0 ? 0.72 : 0.15;
                  return <Cell key={entry.dateIso} fill={fill} fillOpacity={opacity} />;
                })}
              </Bar>
              <Line
                type="monotone"
                dataKey="trend7d"
                name="متوسط 7 أيام"
                stroke="#7FFFD4"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3.5, fill: '#7FFFD4', stroke: '#000000', strokeWidth: 1.5 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Compact Chart Legend */}
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-xs bg-[#4ADE80]" />
              جرعات مأخوذة
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-[#7FFFD4]" />
              اتجاه 7 أيام
            </span>
          </div>
          {totalTaken30d === 0 && (
            <span className="text-zinc-500">اضغط «تم اليوم» لبدء رسم الاتجاه</span>
          )}
        </div>
      </div>

      {/* Refill Forecast Strip */}
      {forecasts.length > 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-black/45 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-zinc-200 flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-[#7FFFD4]" />
              توقّع موعد إعادة الشراء
            </span>
            <span className="text-[10px] text-zinc-500">
              {forecasts[0]?.rateSource === 'actual' ? 'بناءً على استهلاكك الفعلي' : 'بناءً على جدول الجرعات'}
            </span>
          </div>

          <div className="space-y-1.5">
            {forecasts.map((item) => (
              <div
                key={item.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                  item.urgency === 'empty'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : item.urgency === 'soon'
                      ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                      : 'border-white/[0.07] bg-black/50 text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold truncate">{item.name}</span>
                  <span className="font-mono-tabular text-[10px] opacity-80 shrink-0">
                    ({item.remainingDoses} جرعة · {item.dailyRate.toFixed(1)}/يوم)
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono-tabular text-[10px] shrink-0">
                  {item.urgency === 'empty' ? (
                    <span className="font-bold text-rose-300">نفدت — اشترِ الآن</span>
                  ) : (
                    <>
                      <span className="text-zinc-400">ينفد ~{item.runOutDateAr}</span>
                      <span
                        className={`font-bold flex items-center gap-1 ${
                          item.urgency === 'soon' ? 'text-amber-300' : 'text-[#7FFFD4]'
                        }`}
                      >
                        <CalendarClock className="w-3 h-3" />
                        اشترِ قبل {item.buyByDateAr}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 px-1">
          <ShoppingBag className="w-3 h-3 text-zinc-500 shrink-0" />
          <span>
            أضف عدد الجرعات المتبقية عبر «+ تتبع المخزون» على أي دواء لحساب موعد إعادة الشراء تلقائياً.
          </span>
        </div>
      )}
    </div>
  );
};
