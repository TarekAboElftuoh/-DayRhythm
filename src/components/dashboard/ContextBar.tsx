import React from 'react';
import { MapPin, BatteryCharging, Smartphone } from 'lucide-react';
import type { DashboardController } from './useDashboardController';

export const ContextBar: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, travelState, phoneBattery, lifeProfile, dailyRhythmPlan, silentNotifications, weatherInfo, todayCalendarMeta, setShowSilentInbox,
  } = d;
  return (
    <>
      {/* 1. QUIET UNBOXED CONTEXT BAR — Date · Location · Weather · Inline Battery · Quick Modes */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pb-1">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {language === 'ar' ? todayCalendarMeta.weekdayAr : todayCalendarMeta.weekdayEn}
            </h1>
            <span className="text-xs sm:text-sm text-zinc-400 font-medium">
              {language === 'ar' ? todayCalendarMeta.gregorianAr : todayCalendarMeta.gregorianEn}
            </span>
            {todayCalendarMeta.hijriFullAr && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <span className="text-xs sm:text-sm text-zinc-500">
                  {todayCalendarMeta.hijriFullAr}
                </span>
              </>
            )}
            {Boolean(lifeProfile.whiteDaysEnabled ?? lifeProfile.fastingWhiteDays) &&
              todayCalendarMeta.isFullMoonWhiteDay && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <span
                  className="text-xs font-semibold text-zinc-200 inline-flex items-center gap-1"
                  title="الأيام البيض"
                >
                  <span className="leading-none">🌕</span>
                  <span>{todayCalendarMeta.hijriDay} {todayCalendarMeta.hijriMonthAr}</span>
                </span>
              </>
            )}
            {(todayCalendarMeta.isRamadan || dailyRhythmPlan.isRamadan) && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <span
                  className="text-xs font-semibold text-[#7FFFD4] inline-flex items-center gap-1"
                  title="شهر رمضان"
                >
                  <span className="leading-none">🌙</span>
                  <span>رمضان</span>
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-400">
            <span
              title="الموقع الحالي"
              className="text-zinc-300 font-medium inline-flex items-center gap-1"
            >
              <MapPin className="w-3.5 h-3.5 text-[#7FFFD4]" />
              <span>
                {travelState.active
                  ? language === 'ar'
                    ? travelState.location.nameAr
                    : travelState.location.nameEn
                  : lifeProfile.currentCityName}
              </span>
            </span>

            {weatherInfo && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <span
                  className="font-mono-tabular text-zinc-300"
                  title={`العظمى ${weatherInfo.maxTempC}°C`}
                >
                  {weatherInfo.icon} {weatherInfo.currentTempC}°C{' '}
                  <span className="text-zinc-500 font-sans">{weatherInfo.conditionAr}</span>
                </span>
              </>
            )}

            {phoneBattery && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <span
                  className={`inline-flex items-center gap-1 font-mono-tabular ${
                    phoneBattery.charging && phoneBattery.levelPct >= phoneBattery.chargeLimitPct
                      ? 'text-[#4ADE80] font-semibold'
                      : phoneBattery.charging
                        ? 'text-[#7FFFD4]'
                        : 'text-zinc-400'
                  }`}
                  title={phoneBattery.deviceLabel || 'الهاتف'}
                >
                  {phoneBattery.charging ? (
                    <BatteryCharging className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{phoneBattery.levelPct}%</span>
                  {phoneBattery.charging &&
                    typeof phoneBattery.chargeTimeRemainingMin === 'number' &&
                    phoneBattery.chargeTimeRemainingMin > 0 && (
                      <span className="text-[11px] text-zinc-400">
                        ·{' '}
                        {phoneBattery.chargeTimeRemainingMin >= 60
                          ? `${Math.floor(phoneBattery.chargeTimeRemainingMin / 60)}س ${phoneBattery.chargeTimeRemainingMin % 60}د`
                          : `${phoneBattery.chargeTimeRemainingMin}د`}
                      </span>
                    )}
                </span>
              </>
            )}

            {silentNotifications.length > 0 && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setShowSilentInbox((v) => !v)}
                  className="text-zinc-300 hover:text-[#7FFFD4] font-medium cursor-pointer transition-colors"
                >
                  🔕 {silentNotifications.length} صامت
                </button>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
};
