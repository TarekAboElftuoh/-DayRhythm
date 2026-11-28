import React, { useMemo, useState } from 'react';
import { TrendingUp, ShoppingBag, CalendarClock } from 'lucide-react';
import { MedicationItem } from '../../types/dayrhythm';


export interface MedicationConsumptionChartProps {
  medications: MedicationItem[];
  todayCairoIso: string;
}

export interface DayConsumptionPoint {
  dateIso: string;
  shortLabel: string;
  fullDateAr: string;
  taken: number;
  scheduled: number;
  trend7d: number;
  isToday: boolean;
}

export interface RefillForecast {
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

export const AR_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function parseIsoUtc(dateIso: string): Date {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1, 12, 0, 0));
}

export function addDaysUtc(baseDate: Date, offsetDays: number): Date {
  const dt = new Date(baseDate.getTime());
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return dt;
}

export function toIsoDateUtc(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatArabicShortDate(dt: Date): string {
  return `${dt.getUTCDate()} ${AR_SHORT_MONTHS[dt.getUTCMonth()] ?? ''}`;
}

export function formatArabicFullDate(dt: Date): string {
  const dayName = AR_WEEKDAYS[dt.getUTCDay()] ?? '';
  return `${dayName} ${dt.getUTCDate()} ${AR_SHORT_MONTHS[dt.getUTCMonth()] ?? ''}`;
}

export function getDoseTimes(med: MedicationItem): string[] {
  if (med.times24 && med.times24.length > 0) return med.times24;
  if (med.time24) return [med.time24];
  return [];
}

export function isMedScheduledOnWeekday(med: MedicationItem, weekdayNum: number): boolean {
  if (!med.daysOfWeek || med.daysOfWeek.length === 0) return true;
  return med.daysOfWeek.includes(weekdayNum);
}

export function getDosesTakenOnDate(med: MedicationItem, dateIso: string, todayCairoIso: string): number {
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

export const ConsumptionTooltip: React.FC<{ point: DayConsumptionPoint | null }> = ({ point }) => {
  if (!point) return null;

  return (
    <div
      dir="rtl"
      className="rounded-xl border border-white/15 bg-[#0A0A0A] px-3 py-2 text-xs shadow-xl"
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

