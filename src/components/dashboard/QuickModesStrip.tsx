import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, SlidersHorizontal, MicOff, Leaf, BatteryCharging, Plane } from 'lucide-react';
import type { DashboardController } from './useDashboardController';

export const QuickModesStrip: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, travelState, onOpenTravel, quietMode, onSetQuietMode, calendarConnected, calendarUserEmail, isLoggingIn, loadingCalendarEvents, loadingTasks, onGoogleSignIn, onRefreshWorkspace, phoneBattery, phoneChargeLimitPct, onOpenLifeProfile, lowEnergyActive, onToggleLowEnergyToday, meetingPickerOpen, setMeetingPickerOpen,
  } = d;
  return (
    <>
        {/* Unified Quick Modes Segmented Strip + Compact Utilities */}
        <div className="flex flex-wrap items-center gap-2 max-w-full w-full sm:w-auto">
          <div className="flex items-center justify-between sm:justify-start gap-1.5 flex-nowrap sm:flex-wrap w-full sm:w-auto">
            <div
              role="group"
              aria-label={language === 'ar' ? 'أوضاع اليوم' : 'Daily modes'}
              className="inline-flex flex-nowrap items-center gap-1 p-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-w-full"
            >
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                aria-pressed={lowEnergyActive}
                aria-label={lowEnergyActive ? 'إلغاء وضع يوم هادئ' : 'يوم هادئ'}
                onClick={onToggleLowEnergyToday}
                className={`relative min-h-[44px] sm:min-h-[36px] min-w-[42px] sm:min-w-0 justify-center px-2.5 sm:px-3 py-1.5 rounded-xl text-xs md:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap select-none ${
                  lowEnergyActive
                    ? 'text-[#7FFFD4] font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
                title="يوم هادئ — تخفيف اليوم عند انخفاض الطاقة"
              >
                <AnimatePresence>
                  {lowEnergyActive && (
                    <motion.span
                      layoutId="mode-pill-calm"
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-[#7FFFD4]/15 border border-[#7FFFD4]/35"
                    />
                  )}
                </AnimatePresence>
                <Leaf className="relative z-10 w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span className="relative z-10 hidden sm:inline">{lowEnergyActive ? '✓ يوم هادئ' : 'يوم هادئ'}</span>
              </motion.button>

              <div className="relative">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  aria-pressed={quietMode !== 'normal'}
                  aria-label={quietMode !== 'normal' ? 'إنهاء الاجتماع' : 'وضع الاجتماع'}
                  onClick={() => {
                    // Timed quiet mode is the single source of truth here (it's the one that actually
                    // auto-expires on its own); if it's already running — from this button, from
                    // Gemini, or from another device — one tap ends it early, no picker needed.
                    if (quietMode !== 'normal') {
                      onSetQuietMode('normal', 0);
                      setMeetingPickerOpen(false);
                      return;
                    }
                    setMeetingPickerOpen((v) => !v);
                  }}
                  className={`relative min-h-[44px] sm:min-h-[36px] min-w-[42px] sm:min-w-0 justify-center px-2.5 sm:px-3 py-1.5 rounded-xl text-xs md:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap select-none ${
                    quietMode !== 'normal'
                      ? 'text-[#7FFFD4] font-semibold'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                  title="وضع الاجتماع وكتم الصوت مؤقتاً أو حتى الإلغاء"
                >
                  <AnimatePresence>
                    {quietMode !== 'normal' && (
                      <motion.span
                        layoutId="mode-pill-meeting"
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.94 }}
                        transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                        className="absolute inset-0 rounded-xl bg-[#7FFFD4]/15 border border-[#7FFFD4]/35"
                      />
                    )}
                  </AnimatePresence>
                  <MicOff className="relative z-10 w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span className="relative z-10 hidden sm:inline">
                    {quietMode !== 'normal' ? 'إنهاء الاجتماع' : 'وضع الاجتماع'}
                  </span>
                </motion.button>

                <AnimatePresence>
                  {meetingPickerOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.16 }}
                      className="absolute z-30 top-full mt-2 right-0 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 space-y-2.5 shadow-xl"
                    >
                      <div className="text-[11px] text-zinc-400">اختر المدة والطريقة، وهتخلص لوحدها تلقائياً</div>
                      {(
                        [
                          { mode: 'mute_audio' as const, label: '🔇 ميوت تام + إشعار' },
                          { mode: 'vibrate_only' as const, label: '📳 اهتزاز فقط + إشعار' },
                        ]
                      ).map((row) => (
                        <div key={row.mode} className="space-y-1">
                          <div className="text-[11px] font-medium text-zinc-300">{row.label}</div>
                          <div className="grid grid-cols-5 gap-1">
                            {[15, 30, 60, 120, 0].map((mins) => (
                              <button
                                key={mins}
                                type="button"
                                onClick={() => {
                                  onSetQuietMode(row.mode, mins);
                                  setMeetingPickerOpen(false);
                                }}
                                className="min-h-[34px] rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-[var(--border-subtle)] text-[11px] font-mono-tabular text-zinc-200 cursor-pointer transition-colors"
                              >
                                {mins === 0 ? 'مفتوح' : mins >= 60 ? `${mins / 60} س` : `${mins} د`}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setMeetingPickerOpen(false)}
                        className="w-full min-h-[34px] text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer pt-1"
                      >
                        إلغاء
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                aria-pressed={travelState.active}
                aria-label={travelState.active ? 'في السفر' : 'وضع السفر'}
                onClick={onOpenTravel}
                className={`relative min-h-[44px] sm:min-h-[36px] min-w-[42px] sm:min-w-0 justify-center px-2.5 sm:px-3 py-1.5 rounded-xl text-xs md:text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap select-none ${
                  travelState.active
                    ? 'text-[#7FFFD4] font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
                title="وضع السفر وتأجيل التنبيهات مؤقتاً"
              >
                <AnimatePresence>
                  {travelState.active && (
                    <motion.span
                      layoutId="mode-pill-travel"
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-[#7FFFD4]/15 border border-[#7FFFD4]/35"
                    />
                  )}
                </AnimatePresence>
                <Plane className="relative z-10 w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span className="relative z-10 hidden sm:inline">{travelState.active ? 'في السفر' : 'السفر'}</span>
                {travelState.active &&
                  ((travelState.deferredCategories?.length ?? 0) +
                    (travelState.deferredMedIds?.length ?? 0)) > 0 && (
                    <span className="relative z-10 hidden sm:inline px-1.5 py-0.5 rounded-full bg-[#7FFFD4]/20 text-[10px] font-mono-tabular">
                      {(travelState.deferredCategories?.length ?? 0) +
                        (travelState.deferredMedIds?.length ?? 0)}
                    </span>
                  )}
              </motion.button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenLifeProfile}
                aria-label="الإعدادات والثوابت"
                className="min-h-[44px] sm:min-h-[38px] min-w-[44px] sm:min-w-0 justify-center px-2.5 sm:px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs md:text-sm font-medium text-zinc-300 hover:border-white/20 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                title="الإعدادات والثوابت"
              >
                <SlidersHorizontal className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-zinc-400 shrink-0" />
                <span className="hidden sm:inline">الإعدادات</span>
              </button>

              {calendarConnected && (
                <button
                  type="button"
                  onClick={() => onRefreshWorkspace()}
                  aria-label="تحديث التقويم والمهام"
                  className="min-h-[44px] sm:min-h-[38px] min-w-[44px] sm:min-w-0 justify-center px-2.5 sm:px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs md:text-sm text-zinc-300 hover:border-white/20 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                  title={calendarUserEmail ? `تحديث (${calendarUserEmail})` : 'تحديث'}
                >
                  <RefreshCw
                    className={`w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#7FFFD4] shrink-0 ${loadingCalendarEvents || loadingTasks ? 'animate-spin' : ''}`}
                  />
                  <span className="hidden sm:inline">تحديث</span>
                </button>
              )}
            </div>
          </div>

          {!calendarConnected && (
            <button
              type="button"
              onClick={() => {
                onGoogleSignIn().catch(() => {});
              }}
              disabled={isLoggingIn}
              className="min-h-[44px] sm:min-h-[38px] flex items-center gap-2 rounded-xl border border-[#747775] bg-white px-3 py-1.5 text-xs font-semibold text-[#1F1F1F] hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>{isLoggingIn ? 'جارٍ الاتصال...' : 'تسجيل الدخول بحساب Google'}</span>
            </button>
          )}
        </div>

      {/* Live Phone Charging Status Strip (Visible whenever OnePlus/Android phone is plugged in) */}
      {/* Stale reading (no update for 3 min: unplugged while offline, app killed) ≠ still charging. */}
      {phoneBattery?.charging &&
        phoneBattery.levelPct < phoneBattery.chargeLimitPct &&
        Date.now() - phoneBattery.updatedAtMs < 3 * 60_000 && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-active)] bg-[var(--bg-card)] px-4 py-2.5 text-xs">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#7FFFD4]/30 bg-[#7FFFD4]/10 text-[#7FFFD4] shrink-0">
              <BatteryCharging className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-zinc-100">
                  {phoneBattery.deviceLabel || 'الهاتف'} على الشاحن
                </span>
                <span className="font-mono-tabular font-bold text-[#7FFFD4]">
                  {phoneBattery.levelPct}%
                </span>
                {typeof phoneBattery.chargeTimeRemainingMin === 'number' &&
                  phoneBattery.chargeTimeRemainingMin > 0 && (
                    <span className="font-mono-tabular text-zinc-300">
                      · متبقي{' '}
                      {phoneBattery.chargeTimeRemainingMin >= 60
                        ? `~${Math.floor(phoneBattery.chargeTimeRemainingMin / 60)} س ${phoneBattery.chargeTimeRemainingMin % 60} د`
                        : `~${phoneBattery.chargeTimeRemainingMin} دقيقة`}
                    </span>
                  )}
                {phoneBattery.levelPct >= phoneBattery.chargeLimitPct && (
                  <span className="text-[#4ADE80] font-semibold">
                    · وصل حد الشحن ({phoneBattery.chargeLimitPct}%) ✓
                  </span>
                )}
              </div>
              <div className="mt-1.5 h-1.5 w-48 max-w-full rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    phoneBattery.levelPct >= phoneBattery.chargeLimitPct
                      ? 'bg-[#4ADE80]'
                      : 'bg-[#7FFFD4]'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, phoneBattery.levelPct))}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-[11px] text-zinc-400">
            <span className="font-mono-tabular">الحد: {phoneChargeLimitPct}%</span>
          </div>
        </div>
      )}
    </>
  );
};
