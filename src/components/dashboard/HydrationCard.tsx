import React, { Suspense, lazy } from 'react';
import { Droplets, Volume2, Bell, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { ErrorBoundary } from '../ErrorBoundary';
import { formatMinutes12h } from '../../engines/prayerEngine';
import { t } from '../../engines/i18n';
import { ChartLoadingFallback } from './DashboardShared';
const HydrationWeeklyChart = lazy(() => import('../HydrationWeeklyChart').then((m) => ({ default: m.HydrationWeeklyChart })));
import type { DashboardController } from './useDashboardController';

export const HydrationCard: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, hydrationToday, hydrationHistory, onToggleWaterSlot, lifeProfile, dailyRhythmPlan, onTriggerTaskAlert, weatherInfo, waterRemindersEnabled, notificationPermission, onToggleWaterReminders, onRequestNotificationPermission, cardSurface, showHydrationSchedule, setShowHydrationSchedule, showWaterChart, setShowWaterChart, scheduledHydrationSlots, scheduledTargetCups, displayedCupsLogged, totalMl, targetMl, waterPct, nextWaterSlot,
  } = d;
  return (
    <>
          {/* 1. Hydration Card (Promoted to #1 in Support Column — highest tap frequency) */}
          <ErrorBoundary sectionTitle="الماء والترطيب" compact>
          <section className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${cardSurface}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Droplets className="w-4 h-4 text-[#7FFFD4]" />
                <span>
                  {dailyRhythmPlan.isFastingToday
                    ? 'الماء · الصيام'
                    : t(language, 'hydrationTitle')}
                </span>
              </h2>
              <div className="font-mono-tabular text-xs flex items-center gap-2">
                <span className="font-bold text-[#7FFFD4]">
                  {displayedCupsLogged}/{scheduledTargetCups}
                </span>
                <span className="text-zinc-500">·</span>
                <span className="text-zinc-400">
                  {totalMl} / {targetMl} مل
                </span>
                <span className="text-zinc-500">·</span>
                <span className={waterPct >= 100 ? 'text-[#4ADE80] font-bold' : 'text-zinc-300'}>
                  {waterPct}%
                </span>
              </div>
            </div>

            {weatherInfo && weatherInfo.heatBonusMl > 0 && (
              <div className="text-[11px] font-mono-tabular text-amber-300">
                {weatherInfo.icon} +{weatherInfo.heatBonusMl} مل إضافية لحرارة اليوم ({weatherInfo.maxTempC}°C)
              </div>
            )}

            {/* Tactile Interactive Cup Progress Strip (Wraps comfortably on narrow phones, compact single-row on desktop) */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-1">
              {scheduledHydrationSlots.map((slotPlan, idx) => {
                const filled = Boolean(hydrationToday.slots[idx]);
                return (
                  <button
                    key={slotPlan.cupIndex}
                    type="button"
                    onClick={() => onToggleWaterSlot(idx)}
                    title={`كوب ${idx + 1} · ${formatMinutes12h(slotPlan.timeMinutes, language)}`}
                    className={`min-w-[44px] min-h-[44px] sm:min-w-0 sm:flex-1 sm:h-9 sm:min-h-[36px] rounded-xl sm:rounded-lg font-mono-tabular text-xs sm:text-[11px] font-bold flex items-center justify-center transition-all active:scale-95 cursor-pointer select-none ${
                      filled
                        ? 'bg-[#7FFFD4] text-black hover:bg-[#66eec2]'
                        : 'bg-white/[0.04] border border-[var(--border-subtle)] text-zinc-400 hover:bg-white/[0.1] hover:text-white'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Clean Next-Cup Reminder Line */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-white/[0.07] text-xs">
              <div className="flex items-center gap-1.5 text-zinc-300 min-w-0">
                <Bell
                  className={`w-3.5 h-3.5 shrink-0 ${
                    waterRemindersEnabled ? 'text-[#7FFFD4]' : 'text-zinc-500'
                  }`}
                />
                {nextWaterSlot ? (
                  <span className="truncate font-mono-tabular">
                    كوب #{nextWaterSlot.cupIndex} ·{' '}
                    <strong className="text-[#7FFFD4]">
                      {formatMinutes12h(nextWaterSlot.timeMinutes, language)}
                    </strong>
                  </span>
                ) : (
                  <span className="text-[#4ADE80] font-semibold">أتممت هدف اليوم ✓</span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onToggleWaterReminders}
                  className={`min-h-[40px] sm:min-h-0 px-3 sm:px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                    waterRemindersEnabled
                      ? 'border-[#4ADE80]/35 bg-[#4ADE80]/10 text-[#4ADE80]'
                      : 'border-white/10 text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  {waterRemindersEnabled ? 'التنبيه مفعّل' : 'متوقف'}
                </button>
                {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
                  <button
                    type="button"
                    onClick={() => void onRequestNotificationPermission()}
                    className="min-h-[40px] sm:min-h-0 px-3 sm:px-2 py-1 rounded-lg border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 text-[11px] font-medium text-[#7FFFD4] hover:bg-[#7FFFD4]/20 cursor-pointer"
                  >
                    الإشعارات
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onTriggerTaskAlert('💧', 'water', {
                      bypassSanctuary: true,
                      privacyEmoji: '💧',
                    })
                  }
                  className="min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg text-zinc-500 hover:text-[#7FFFD4] hover:bg-white/[0.04] flex items-center justify-center cursor-pointer"
                  title="تجربة تنبيه كوب الماء"
                  aria-label="تجربة تنبيه كوب الماء"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Rolling 7-Day Water Log (always visible, auto-drops day 8) */}
            {hydrationHistory.length > 0 && (
              <div className="pt-2.5 border-t border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>سجل آخر 7 أيام</span>
                  <span className="font-mono-tabular text-[#7FFFD4]">
                    {hydrationHistory.reduce((acc, d) => acc + d.cupsLogged, 0)} كوب ·{' '}
                    {hydrationHistory.filter((d) => d.cupsLogged >= Math.max(1, d.targetCups)).length}/7 هدف
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1 min-w-0">
                  {hydrationHistory.slice(-7).map((day, idx, arr) => {
                    const isTodayCell = idx === arr.length - 1;
                    const ratio = Math.min(1, day.cupsLogged / Math.max(1, day.targetCups));
                    const hitGoal = day.cupsLogged >= Math.max(1, day.targetCups);
                    return (
                      <div
                        key={day.dateKey || `${day.labelAr}-${idx}`}
                        title={`${day.labelAr}: ${day.cupsLogged} من ${day.targetCups} كوب`}
                        className={`min-w-0 rounded-lg border px-0.5 sm:px-1 py-1.5 text-center transition-colors ${
                          hitGoal
                            ? 'border-[#4ADE80]/35 bg-[#4ADE80]/10'
                            : isTodayCell
                              ? 'border-[#7FFFD4]/35 bg-[#7FFFD4]/[0.07]'
                              : 'border-white/[0.06] bg-white/[0.02]'
                        }`}
                      >
                        <div
                          className={`text-[10px] truncate ${
                            isTodayCell ? 'text-[#7FFFD4] font-bold' : 'text-zinc-500'
                          }`}
                        >
                          {isTodayCell ? 'اليوم' : day.labelAr}
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden my-1">
                          <div
                            className={`h-full rounded-full transition-all ${
                              hitGoal ? 'bg-[#4ADE80]' : 'bg-[#7FFFD4]'
                            }`}
                            style={{ width: `${Math.round(ratio * 100)}%` }}
                          />
                        </div>
                        <div
                          className={`font-mono-tabular text-[11px] font-bold ${
                            hitGoal
                              ? 'text-[#4ADE80]'
                              : day.cupsLogged > 0
                                ? 'text-zinc-200'
                                : 'text-zinc-500'
                          }`}
                        >
                          {day.cupsLogged}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* On-Demand Expanders: Cup Schedule & 7-Day Detailed Chart */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06] text-[11px]">
              <button
                type="button"
                onClick={() => setShowHydrationSchedule((v) => !v)}
                className="text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>مواعيد الأكواب</span>
                {showHydrationSchedule ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowWaterChart((v) => !v)}
                className="text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>تفاصيل 7 أيام</span>
                {showWaterChart ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {showHydrationSchedule && (
              <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pt-1">
                {dailyRhythmPlan.hydrationSlots.map((slot, idx) => {
                  const done = hydrationToday.slots[idx];
                  return (
                    <button
                      key={slot.cupIndex}
                      type="button"
                      onClick={() => onToggleWaterSlot(idx)}
                      className={`rounded-lg border px-2.5 py-2 text-right text-[11px] transition-colors cursor-pointer ${
                        done
                          ? 'border-[#4ADE80]/35 bg-[#4ADE80]/10 text-[#4ADE80]'
                          : 'border-white/[0.07] bg-white/[0.02] text-zinc-300 hover:border-[#7FFFD4]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 font-mono-tabular">
                        <span className="font-bold">
                          {done ? '✓ ' : ''}كوب {slot.cupIndex}
                        </span>
                        <span>{formatMinutes12h(slot.timeMinutes, language)}</span>
                      </div>
                      {slot.windowAr ? (
                        <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                          {slot.windowAr}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            {showWaterChart && (
              <Suspense fallback={<ChartLoadingFallback />}>
                <HydrationWeeklyChart
                  hydrationHistory={hydrationHistory}
                  weatherInfo={weatherInfo}
                  cupSizeMl={lifeProfile.cupSizeMl}
                />
              </Suspense>
            )}
          </section>
          </ErrorBoundary>
    </>
  );
};
