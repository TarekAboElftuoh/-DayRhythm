import React from 'react';
import { motion } from 'framer-motion';
import { Timer, Volume2, MessageSquare } from 'lucide-react';
import { SunlightCard } from '../SunlightCard';
import { ErrorBoundary } from '../ErrorBoundary';
import { formatMinutes12h } from '../../engines/prayerEngine';
import { t } from '../../engines/i18n';
import { LiveSecClock, formatDurationLabel } from './DashboardShared';
import type { DashboardController } from './useDashboardController';

export const FocalHeroCard: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, adhanOverrideSilent, onToggleAdhanOverrideSilent, onTestAdhanChime, prayers, pomodoro, onOpenPomodoro, calendarConnected, prayersReady, locationResolutionState, onOpenAssistant, activeTimeZone, sunlightSessions = [], sunlightEnabled = false, onSnoozeSunlight, onSunlightSessionEnd, cardSurface, setConfirmHeroCompleteId, liveNowMs, nowMinutes, formatDurationLabel, nextAlarmBlock, nextObligatoryPrayerId, isNextBlockHappeningNow, nextAlarmDisplay, guestNextPrayer, countdownMeta, heroProgressPct,
  } = d;
  return (
    <>
      {/* 3. FOCAL HERO COMMAND CENTER — Swiss-Watch Hero + Ultra-Thin Progress + 5 Prayers */}
      <ErrorBoundary sectionTitle="المتابعة اللحظية" compact>
      <section className={`rounded-2xl border p-5 sm:p-6 space-y-5 ${cardSurface}`}>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6 items-center">
          {/* Primary Focus: Current / Next Event + Oversized Tabular Countdown */}
          <div className="md:col-span-6 flex flex-col justify-between gap-4 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isNextBlockHappeningNow ? 'bg-[#7FFFD4] animate-pulse' : 'bg-[#7FFFD4]/80'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-[#7FFFD4] font-semibold">
                    {isNextBlockHappeningNow
                      ? 'الآن'
                      : language === 'ar'
                        ? 'القادم'
                        : 'Up Next'}
                  </span>
                  {nextAlarmBlock?.isAnchor && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span className="text-zinc-400">{t(language, 'adhanLeadTag')}</span>
                    </>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-2xl sm:text-3xl shrink-0 leading-none mt-0.5">
                    {nextAlarmBlock?.emojiPair ?? guestNextPrayer?.prayer.emojiPair ?? '✅'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg sm:text-xl font-bold text-white leading-snug break-words">
                      {nextAlarmBlock
                        ? nextAlarmDisplay.title
                        : calendarConnected
                          ? 'أنجزت مهام اليوم ✓'
                          : guestNextPrayer
                            ? language === 'ar'
                              ? `أذان ${guestNextPrayer.prayer.nameAr}`
                              : `${guestNextPrayer.prayer.nameEn} adhan`
                            : 'اربط حساب Google للبدء'}
                    </h2>
                    {nextAlarmBlock && nextAlarmDisplay.detail && (
                      <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed line-clamp-1">
                        {nextAlarmDisplay.detail}
                      </p>
                    )}
                    <div className="font-mono-tabular text-xs text-zinc-400 mt-1">
                      {nextAlarmBlock
                        ? nextAlarmBlock.isAllDay
                          ? 'طوال اليوم'
                          : nextAlarmBlock.durationMin === 0
                            ? `${formatMinutes12h(nextAlarmBlock.startMin, language)} · ${formatDurationLabel(0)}`
                            : `${formatMinutes12h(nextAlarmBlock.startMin, language)} – ${formatMinutes12h(nextAlarmBlock.startMin + nextAlarmBlock.durationMin, language)} · ${formatDurationLabel(nextAlarmBlock.durationMin)}`
                        : guestNextPrayer
                          ? `${formatMinutes12h(guestNextPrayer.prayer.adhanMinutes, language)} · ${
                              language === 'ar' ? 'التنبيه' : 'alarm'
                            } ${formatMinutes12h(guestNextPrayer.prayer.alarmMinutes, language)} · ${
                              language === 'ar' ? 'سجّل الدخول لعرض جدولك' : 'sign in for your schedule'
                            }`
                          : 'سجّل الدخول لعرض جدولك الفعلي'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-right sm:text-left shrink-0 flex flex-row sm:flex-col items-baseline sm:items-end justify-between sm:justify-center gap-2 pt-2 sm:pt-0 border-t border-[var(--border-subtle)] sm:border-t-0">
                <div
                  data-countdown=""
                  className="font-digits text-4xl sm:text-5xl font-semibold tracking-tight leading-none whitespace-nowrap text-[#7FFFD4]"
                >
                  <LiveSecClock
                    initialSec={countdownMeta.remainingSec}
                    fallback={countdownMeta.clock}
                    resetKey={liveNowMs}
                  />
                </div>
                <div className="text-[11px] font-medium text-zinc-400 whitespace-nowrap">
                  {countdownMeta.caption}
                </div>
              </div>
            </div>

            {/* Ultra-Thin Swiss-Watch Progress Bar */}
            <div
              className="h-[2px] w-full rounded-full bg-white/[0.06] overflow-hidden"
              role="progressbar"
              aria-valuenow={heroProgressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <motion.div
                className="h-full rounded-full bg-[#7FFFD4]"
                initial={false}
                animate={{ width: `${heroProgressPct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>

            {/* Single Primary Accent CTA + Quiet Secondary Controls */}
            <div
              className={`grid ${
                nextAlarmBlock ? 'grid-cols-3' : 'grid-cols-2'
              } sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2`}
            >
              {nextAlarmBlock && (
                <button
                  type="button"
                  onClick={() => setConfirmHeroCompleteId(nextAlarmBlock.id)}
                  className="min-h-[44px] sm:min-h-[38px] px-2 sm:px-4 py-1.5 rounded-xl bg-[#7FFFD4] text-black text-[11.5px] sm:text-xs md:text-sm font-bold hover:bg-[#66eec2] transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap flex items-center justify-center"
                >
                  ✓ تم الإنجاز
                </button>
              )}

              <button
                type="button"
                onClick={onOpenPomodoro}
                className="min-h-[44px] sm:min-h-[38px] px-2 sm:px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-white/[0.02] text-zinc-300 hover:border-white/20 hover:text-white text-[11.5px] sm:text-xs md:text-sm font-medium flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap font-mono-tabular transition-colors"
              >
                <Timer className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span>
                  {pomodoro.isRunning
                    ? `${Math.floor(pomodoro.remainingSeconds / 60)}:${String(pomodoro.remainingSeconds % 60).padStart(2, '0')}`
                    : 'بومودورو'}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenAssistant}
                className={`min-h-[44px] sm:min-h-[38px] px-2 sm:px-3.5 py-1.5 rounded-xl text-[11.5px] sm:text-xs md:text-sm flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                  nextAlarmBlock
                    ? 'border border-[var(--border-subtle)] bg-white/[0.02] text-zinc-300 hover:border-white/20 hover:text-white font-medium'
                    : 'bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2]'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="sm:hidden">Gemini</span>
                <span className="hidden sm:inline">شات Gemini</span>
              </button>
            </div>
          </div>

          {/* 5 Prayers Strip — Clean Horizontal Grid with Subtle Active Highlight */}
          <div className="md:col-span-6 md:border-r md:border-[var(--border-subtle)] md:pr-6 min-w-0">
            <div className="grid grid-cols-5 gap-1 sm:gap-2 text-center">
              {prayers
                .filter((p) => p.isObligatory)
                .map((p) => {
                  const showLivePrayer = prayersReady ?? calendarConnected;
                  const isNextPrayer = showLivePrayer && p.id === nextObligatoryPrayerId;
                  const isPassed = showLivePrayer && p.adhanMinutes < nowMinutes && !isNextPrayer;
                  return (
                    <div
                      key={p.id}
                      className={`rounded-xl border py-2.5 px-0.5 sm:px-2 min-w-0 transition-colors ${
                        isNextPrayer
                          ? 'border-[#7FFFD4]/40 bg-[#7FFFD4]/[0.07]'
                          : 'border-[var(--border-subtle)] bg-white/[0.02]'
                      } ${isPassed ? 'opacity-40' : ''}`}
                    >
                      <div className="text-xs sm:text-sm leading-none">{p.emojiPair.split(' ')[1]}</div>
                      <div
                        className={`text-[11px] md:text-xs mt-1.5 truncate ${
                          isNextPrayer ? 'font-bold text-white' : 'font-medium text-zinc-400'
                        }`}
                      >
                        {language === 'ar' ? p.nameAr : p.nameEn}
                      </div>
                      <div
                        className={`font-mono-tabular text-[11px] sm:text-sm font-semibold mt-0.5 whitespace-nowrap tracking-tight sm:tracking-normal ${
                          showLivePrayer
                            ? isNextPrayer
                              ? 'text-[#7FFFD4]'
                              : 'text-zinc-200'
                            : 'text-zinc-500'
                        }`}
                      >
                        {showLivePrayer ? formatMinutes12h(p.alarmMinutes, language) : '00:00'}
                      </div>
                      <div className="font-mono-tabular text-[10px] sm:text-xs text-zinc-500 mt-0.5 whitespace-nowrap">
                        {showLivePrayer ? formatMinutes12h(p.adhanMinutes, language) : '00:00'}
                      </div>
                    </div>
                  );
                })}
            </div>

            {!(prayersReady ?? calendarConnected) && (
              <div className="mt-2 text-[11px] text-zinc-500 text-center">
                {locationResolutionState === 'resolving_gps'
                  ? 'جارٍ تحديد الموقع لحساب المواقيت...'
                  : 'بانتظار تحديد الموقع'}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
              <button
                type="button"
                onClick={onToggleAdhanOverrideSilent}
                className={`min-h-[36px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                  adhanOverrideSilent ? 'text-[#7FFFD4]' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>
                  نداء الأذان · {adhanOverrideSilent ? 'مفعّل' : 'صامت'}
                </span>
              </button>
              <button
                type="button"
                onClick={onTestAdhanChime}
                className="min-h-[36px] text-zinc-400 hover:text-[#7FFFD4] transition-colors cursor-pointer"
              >
                تجربة الصوت
              </button>
            </div>
          </div>
        </div>
      </section>
      </ErrorBoundary>

      {onSnoozeSunlight && (
        <SunlightCard
          sessions={sunlightSessions}
          enabled={sunlightEnabled}
          activeTimeZone={activeTimeZone}
          cardSurface={cardSurface}
          onSnooze={onSnoozeSunlight}
          onSessionEnd={onSunlightSessionEnd}
        />
      )}
    </>
  );
};
