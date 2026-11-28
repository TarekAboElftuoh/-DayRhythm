import React from 'react';
import { CalendarClock, ShoppingBag } from 'lucide-react';

export interface MedicationRefillForecastItem {
  id: string;
  name: string;
  remainingDoses: number;
  dailyRate: number;
  rateSource: 'actual' | 'scheduled';
  urgency: 'empty' | 'soon' | 'ok';
  runOutDateAr: string;
  buyByDateAr: string;
}

export const MedicationRefillForecast: React.FC<{
  forecasts: MedicationRefillForecastItem[];
}> = ({ forecasts }) => {
  if (forecasts.length === 0) {
    return (
      <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 px-1">
        <ShoppingBag className="w-3 h-3 text-zinc-500 shrink-0" />
        <span>
          أضف عدد الجرعات المتبقية عبر «+ تتبع المخزون» على أي دواء لحساب موعد إعادة الشراء تلقائياً.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/45 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="font-bold text-zinc-200 flex items-center gap-1.5">
          <ShoppingBag className="w-3.5 h-3.5 text-[#7FFFD4]" />
          توقّع موعد إعادة الشراء
        </span>
        <span className="text-[10px] text-zinc-400">
          {forecasts[0]?.rateSource === 'actual' ? 'بناءً على استهلاكك الفعلي' : 'بناءً على جدول الجرعات'}
        </span>
      </div>

      <div className="space-y-1.5">
        {forecasts.map((item) => (
          <div
            key={item.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-[11px] ${
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
                <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-bold text-rose-300">
                  نفدت — اشترِ الآن
                </span>
              ) : (
                <>
                  <span className="text-zinc-400">ينفد ~{item.runOutDateAr}</span>
                  <span
                    className={`font-bold flex items-center gap-1 rounded px-1.5 py-0.5 ${
                      item.urgency === 'soon'
                        ? 'bg-amber-400/15 text-amber-300'
                        : 'bg-[#7FFFD4]/10 text-[#7FFFD4]'
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
  );
};
