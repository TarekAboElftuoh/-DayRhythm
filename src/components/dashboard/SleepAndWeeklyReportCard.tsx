import React from 'react';
import { Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import { WeeklyReportCard } from '../WeeklyReportCard';
import { formatMinutes12h } from '../../engines/prayerEngine';
import { formatDurationAr } from '../../engines/lifeRhythmEngine';
import { t } from '../../engines/i18n';
import type { DashboardController } from './useDashboardController';

export const SleepAndWeeklyReportCard: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, hydrationHistory, medications, streaks, lifeProfile, dailyRhythmPlan, onOpenLifeProfile, onLogSleepQuality, onOpenAssistantWithPrompt, todayCairoIso, cardSurface, showSleepCheckinEdit, setShowSleepCheckinEdit,
  } = d;
  return (
    <>
          {/* 3. Sleep & Sun Rhythm (Checked morning/night — positioned cleanly below Water & Meds) */}
          <section className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${cardSurface}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
                <Moon className="w-4 h-4 text-[#7FFFD4]" />
                <span>إيقاع النوم والشمس</span>
              </h2>
              <button
                type="button"
                onClick={onOpenLifeProfile}
                className="min-h-[44px] sm:min-h-[32px] px-2 text-xs md:text-sm text-zinc-400 hover:text-[#7FFFD4] cursor-pointer transition-colors"
              >
                الثوابت
              </button>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 text-center">
              <div
                className={`rounded-xl border p-2.5 min-w-0 ${
                  dailyRhythmPlan.nightlyRecoveryMin > 0
                    ? 'border-[#7FFFD4]/35 bg-[#7FFFD4]/[0.06]'
                    : 'border-[var(--border-subtle)] bg-white/[0.02]'
                }`}
              >
                <div className="text-[11px] md:text-xs text-zinc-400">النوم</div>
                <div className="font-mono-tabular text-xs md:text-sm font-bold text-white mt-0.5 whitespace-nowrap">
                  {formatMinutes12h(dailyRhythmPlan.bedtimeMin, language)}
                </div>
                <div
                  className={`text-[11px] md:text-xs mt-0.5 whitespace-nowrap ${
                    dailyRhythmPlan.nightlyRecoveryMin > 0 ? 'text-[#7FFFD4]' : 'text-zinc-500'
                  }`}
                >
                  {dailyRhythmPlan.nightlyRecoveryMin > 0
                    ? `-${dailyRhythmPlan.nightlyRecoveryMin} د تعويض`
                    : formatDurationAr(dailyRhythmPlan.coreNightSleepMin)}
                </div>
              </div>

              <div
                className={`rounded-xl border p-2.5 min-w-0 ${
                  dailyRhythmPlan.suhoorStartMin !== null
                    ? 'border-[#7FFFD4]/35 bg-[#7FFFD4]/[0.06]'
                    : 'border-[var(--border-subtle)] bg-white/[0.02]'
                }`}
              >
                <div className="text-[11px] md:text-xs text-zinc-400">
                  {dailyRhythmPlan.suhoorStartMin !== null ? 'سحور غداً' : 'الاستيقاظ'}
                </div>
                <div
                  className={`font-mono-tabular text-xs md:text-sm font-bold mt-0.5 whitespace-nowrap ${
                    dailyRhythmPlan.suhoorStartMin !== null ? 'text-[#7FFFD4]' : 'text-white'
                  }`}
                >
                  {formatMinutes12h(dailyRhythmPlan.wakeMin, language)}
                </div>
                <div className="text-[11px] md:text-xs text-zinc-500 mt-0.5 whitespace-nowrap">
                  {dailyRhythmPlan.suhoorStartMin !== null
                    ? 'قبل الفجر بـ 45 د'
                    : 'قبل الفجر بـ 15 د'}
                </div>
              </div>

              <div className="col-span-2 xl:col-span-1 rounded-xl border border-[var(--border-subtle)] bg-white/[0.02] p-2.5 min-w-0">
                {dailyRhythmPlan.qailulahStartMin !== null ? (
                  <>
                    <div className="text-[11px] md:text-xs text-zinc-400">القيلولة</div>
                    <div className="font-mono-tabular text-xs md:text-sm font-bold text-[#4ADE80] mt-0.5 whitespace-nowrap">
                      {formatMinutes12h(dailyRhythmPlan.qailulahStartMin, language)}
                    </div>
                    <div className="text-[11px] md:text-xs text-zinc-500 mt-0.5 whitespace-nowrap">
                      {dailyRhythmPlan.qailulahDurationMin} د
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 xl:grid-cols-1 gap-2 xl:gap-1 items-center">
                    <div className="flex items-center justify-between gap-1.5 text-[11px] md:text-xs min-w-0">
                      <span className="inline-flex items-center gap-1 text-[#FBBF24] shrink-0">
                        <Sunrise className="w-3 h-3 shrink-0" />
                        <span>الشروق</span>
                      </span>
                      <span className="font-mono-tabular font-bold text-[#FDE68A] whitespace-nowrap shrink-0">
                        {formatMinutes12h(dailyRhythmPlan.sunriseMin, language)}
                      </span>
                    </div>
                    <div className="hidden xl:block h-px bg-white/[0.06]" />
                    <div className="flex items-center justify-between gap-1.5 text-[11px] md:text-xs min-w-0">
                      <span className="inline-flex items-center gap-1 text-[#FB7185] shrink-0">
                        <Sunset className="w-3 h-3 shrink-0" />
                        <span>الغروب</span>
                      </span>
                      <span className="font-mono-tabular font-bold text-[#FDA4AF] whitespace-nowrap shrink-0">
                        {formatMinutes12h(dailyRhythmPlan.maghribMin, language)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {typeof dailyRhythmPlan.postFajrStartMin === 'number' &&
              typeof dailyRhythmPlan.postFajrEndMin === 'number' &&
              typeof dailyRhythmPlan.postFajrDurationMin === 'number' &&
              dailyRhythmPlan.postFajrDurationMin > 0 && (
                <div className="rounded-lg border border-[#7FFFD4]/25 bg-[#7FFFD4]/[0.05] px-3 py-1.5 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-zinc-300">تعويض بعد الفجر (حتى الشروق)</span>
                  <span className="font-mono-tabular font-semibold text-[#7FFFD4] whitespace-nowrap">
                    {formatMinutes12h(dailyRhythmPlan.postFajrStartMin, language)} –{' '}
                    {formatMinutes12h(dailyRhythmPlan.postFajrEndMin, language)} ({dailyRhythmPlan.postFajrDurationMin} د)
                  </span>
                </div>
              )}

            {dailyRhythmPlan.qailulahStartMin !== null && (
              <div className="flex items-center justify-between gap-3 px-1 text-[11px] text-zinc-400">
                <span className="inline-flex items-center gap-1 text-[#FBBF24]">
                  <Sunrise className="w-3 h-3 shrink-0" />
                  <span>الشروق</span>
                  <span className="font-mono-tabular font-bold text-[#FDE68A]">
                    {formatMinutes12h(dailyRhythmPlan.sunriseMin, language)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-[#FB7185]">
                  <Sunset className="w-3 h-3 shrink-0" />
                  <span>الغروب</span>
                  <span className="font-mono-tabular font-bold text-[#FDA4AF]">
                    {formatMinutes12h(dailyRhythmPlan.maghribMin, language)}
                  </span>
                </span>
              </div>
            )}

            {dailyRhythmPlan.conflictWarningAr && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.08] px-3 py-2 text-[11px] text-amber-200">
                ⚠️ {dailyRhythmPlan.conflictWarningAr}
              </div>
            )}

            {/* Sleep Debt Recovery or Clean 1-Line Morning Check-In */}
            {dailyRhythmPlan.sleepDebtMinutes > 0 ? (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 space-y-2 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-amber-200">
                    عجز نوم: {formatDurationAr(dailyRhythmPlan.sleepDebtMinutes)}
                  </span>
                  {dailyRhythmPlan.nightlyRecoveryMin > 0 && (
                    <span className="font-mono-tabular text-[11px] text-[#7FFFD4]">
                      تبكير الليلة -{dailyRhythmPlan.nightlyRecoveryMin} د
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onLogSleepQuality('good')}
                    className="min-h-[40px] sm:min-h-0 px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-lg bg-[#7FFFD4] text-black font-bold text-[11px] hover:bg-[#66eec2] cursor-pointer"
                  >
                    نمت كويس (-{Math.max(dailyRhythmPlan.nightlyRecoveryMin, 30)}د)
                  </button>
                  <button
                    type="button"
                    onClick={() => onLogSleepQuality('reset')}
                    className="min-h-[40px] sm:min-h-0 px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-lg border border-[#4ADE80]/35 bg-[#4ADE80]/10 text-[#4ADE80] font-semibold text-[11px] hover:bg-[#4ADE80]/20 cursor-pointer"
                  >
                    تصفير ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => onLogSleepQuality('short_30')}
                    className="min-h-[40px] sm:min-h-0 px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-lg border border-white/10 text-zinc-300 text-[11px] hover:text-white cursor-pointer"
                  >
                    +30 د نقص
                  </button>
                  {dailyRhythmPlan.sleepDebtMinutes >= 60 && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenAssistantWithPrompt(
                          `عندي رصيد نوم ناقص ${dailyRhythmPlan.sleepDebtMinutes} دقيقة — فضّي لي مكان لقيلولة تعويضية 30 دقيقة النهاردة في التقويم بدون المساس بالصلاة`
                        )
                      }
                      className="min-h-[40px] sm:min-h-0 px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-lg border border-indigo-400/35 bg-indigo-400/12 text-indigo-200 font-semibold text-[11px] hover:bg-indigo-400/20 cursor-pointer"
                    >
                      قيلولة بـ Gemini
                    </button>
                  )}
                </div>
              </div>
            ) : lifeProfile.sleepDebtLogDateKey === todayCairoIso && !showSleepCheckinEdit ? (
              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[#4ADE80]">✓ نومك متوازن اليوم</span>
                <button
                  type="button"
                  onClick={() => setShowSleepCheckinEdit(true)}
                  className="text-zinc-500 hover:text-zinc-300 text-[11px] cursor-pointer"
                >
                  تعديل
                </button>
              </div>
            ) : (
              <div className="pt-2 border-t border-white/[0.06] space-y-2 text-[11px]">
                <div className="text-zinc-400 font-medium">كيف كان نومك الليلة الماضية؟</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onLogSleepQuality('good');
                      setShowSleepCheckinEdit(false);
                    }}
                    className="min-h-[42px] sm:min-h-0 py-1.5 px-2 rounded-lg border border-[#4ADE80]/30 bg-[#4ADE80]/[0.07] text-[#4ADE80] font-semibold text-[11px] hover:bg-[#4ADE80]/15 cursor-pointer"
                  >
                    ممتاز ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onLogSleepQuality('short_30');
                      setShowSleepCheckinEdit(false);
                    }}
                    className="min-h-[42px] sm:min-h-0 py-1.5 px-2 rounded-lg border border-white/10 text-zinc-300 text-[11px] hover:border-amber-400/40 hover:text-amber-200 cursor-pointer"
                  >
                    أقل (-30د)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onLogSleepQuality('short_60');
                      setShowSleepCheckinEdit(false);
                    }}
                    className="min-h-[42px] sm:min-h-0 py-1.5 px-2 rounded-lg border border-white/10 text-zinc-300 text-[11px] hover:border-amber-400/40 hover:text-amber-200 cursor-pointer"
                  >
                    سهر (-60د)
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 4. Compact weekly report (last 7 days) */}
          <WeeklyReportCard
            hydrationHistory={hydrationHistory}
            medications={medications}
            streaks={streaks}
            lifeProfile={lifeProfile}
            todayIso={todayCairoIso}
            cardSurface={cardSurface}
          />
    </>
  );
};
