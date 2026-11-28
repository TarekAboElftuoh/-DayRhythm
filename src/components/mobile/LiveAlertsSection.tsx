import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BatteryCharging,
  MapPin,
  BellRing,
  CheckCircle2,
  Cloud,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Clock,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import {
  AppLanguage,
  BatteryGuardState,
  GeoLocation,
  HydrationDayLog,
  PhoneBatteryTelemetry,
  PrayerTimeItem,
  QuietModeType,
  ScheduleBlock,
  TravelState,
} from '../../types/dayrhythm';
import { LiveAlertsLeadMinutes, OnePlusDeviceSettings } from '../../firebase';
import { QUIET_MODE_LABELS } from '../../engines/i18n';
import { AndroidPermissionsCard } from '../AndroidPermissionsCard';
import {
  type AndroidPermissionsStatus,
  getAndroidPermissionsStatus,
  isAndroidNative,
  openLiveAlertSettings,
} from '../../services/androidPermissions';
import type { MobilePreviewViewProps } from './types';

import { PersistentCountdownToggleCard } from './PersistentCountdownToggleCard';

export const LiveAlertsSection: React.FC<{
  deviceSettings: MobilePreviewViewProps['deviceSettings'];
  onUpdateDeviceSettings: MobilePreviewViewProps['onUpdateDeviceSettings'];
  upcomingPreview: MobilePreviewViewProps['upcomingPreview'];
  hydrationToday: HydrationDayLog;
  isAndroid: boolean;
  promotedGranted: boolean | null;
  alwaysOn: boolean;
  showChargingPill: boolean;
  persistentEnabled: boolean;
}> = ({
  deviceSettings,
  onUpdateDeviceSettings,
  upcomingPreview,
  hydrationToday,
  isAndroid,
  promotedGranted,
  alwaysOn,
  showChargingPill,
  persistentEnabled,
}) => {
  return (
    <>
      {/* Primary Section 1: OnePlus 12R Dynamic Island (Live Alerts) + Persistent Countdown Notification */}
      <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#7FFFD4] shrink-0" />
              <span>كبسولة شريط الحالة (Live Alerts)</span>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              تظهر تلقائياً في شريط حالة OnePlus 12R (بجوار الكاميرا) قبل الموعد بـ {deviceSettings.liveAlertsLeadMinutes} دقائق أو طوال الوقت مع الإيموجي والعدّاد التنازلي وحالة الشحن.
            </p>
          </div>
          <button
            type="button"
            aria-pressed={deviceSettings.liveAlertsEnabled}
            onClick={() =>
              onUpdateDeviceSettings({ liveAlertsEnabled: !deviceSettings.liveAlertsEnabled })
            }
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              deviceSettings.liveAlertsEnabled
                ? 'bg-[#7FFFD4] text-black'
                : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
            }`}
          >
            {deviceSettings.liveAlertsEnabled ? 'مفعّلة' : 'متوقفة'}
          </button>
        </div>

        {/* Android 16 / OxygenOS 16 Live Alerts System Permission Diagnostic Banner */}
        {isAndroid && promotedGranted === false && (
          <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3.5 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-100 leading-relaxed">
                <span className="font-bold block text-amber-300">إذن النظام مطلوب لإظهار Live Alerts</span>
                فعّل خيار «التنبيهات المباشرة / Promoted Notifications» للتطبيق في إعدادات أندرويد 16 حتى تظهر الكبسولة أعلى الشاشة.
              </div>
            </div>
            <button
              type="button"
              onClick={openLiveAlertSettings}
              className="min-h-[44px] px-3.5 rounded-xl bg-amber-400 text-black text-xs font-bold hover:bg-amber-300 transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <span>تفعيل من النظام</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {isAndroid && promotedGranted === true && deviceSettings.liveAlertsEnabled && (
          <div className="rounded-xl border border-[#4ADE80]/25 bg-[#4ADE80]/8 px-3.5 py-2.5 flex items-center justify-between gap-3">
            <span className="text-xs text-[#4ADE80] font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>إذن Live Alerts مفعّل في النظام ✓</span>
            </span>
            <button
              type="button"
              onClick={openLiveAlertSettings}
              className="min-h-[44px] sm:min-h-[36px] px-2.5 rounded-xl text-[11px] font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>فتح الإعدادات</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        )}

        <AnimatePresence initial={false}>
          {deviceSettings.liveAlertsEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-4 pt-1">
                {/* Lead time options: 5 / 10 / 15 / 20 / 30 min + Always On */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#7FFFD4]" />
                      <span>تبدأ الكبسولة بالظهور قبل الموعد بـ</span>
                    </span>
                    <span className="font-mono-tabular text-[11px] font-medium text-[#7FFFD4]">
                      {alwaysOn ? 'ظهور مستمر طوال اليوم' : `قبل ${deviceSettings.liveAlertsLeadMinutes} دقائق`}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 p-1 rounded-2xl bg-[var(--bg-surface)] border border-white/[0.06]">
                    {([5, 10, 15, 20, 30] as const).map((mins) => {
                      const selected = !alwaysOn && deviceSettings.liveAlertsLeadMinutes === mins;
                      return (
                        <button
                          key={mins}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            onUpdateDeviceSettings({
                              liveAlertsLeadMinutes: mins,
                              liveAlertsAlwaysOn: false,
                            })
                          }
                          className={`relative min-h-[44px] px-2 rounded-xl text-xs font-bold font-mono-tabular transition-colors cursor-pointer select-none ${
                            selected ? 'text-[#7FFFD4]' : 'text-zinc-300 hover:text-white'
                          }`}
                        >
                          {selected && (
                            <motion.span
                              layoutId="mobile-lead-minute-pill"
                              transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                              className="absolute inset-0 rounded-xl bg-[#7FFFD4]/12 border border-[#7FFFD4]/25"
                            />
                          )}
                          <span className="relative z-10">{mins} د</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      aria-pressed={alwaysOn}
                      onClick={() =>
                        onUpdateDeviceSettings({
                          liveAlertsAlwaysOn: !alwaysOn,
                        })
                      }
                      className={`relative min-h-[44px] px-2 rounded-xl text-xs font-bold transition-colors cursor-pointer select-none ${
                        alwaysOn ? 'text-[#7FFFD4]' : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      {alwaysOn && (
                        <motion.span
                          layoutId="mobile-lead-minute-pill"
                          transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                          className="absolute inset-0 rounded-xl bg-[#7FFFD4]/12 border border-[#7FFFD4]/25"
                        />
                      )}
                      <span className="relative z-10">دائماً</span>
                    </button>
                  </div>
                </div>

                {/* Charging Capsule Toggle */}
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <BatteryCharging className="w-3.5 h-3.5 text-[#7FFFD4] shrink-0" />
                      <span>إظهار كبسولة الشحن المباشرة</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      تعرض نسبة البطارية والوقت المتبقي للحد المحدد في شريط الحالة عند توصيل الشاحن
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-pressed={showChargingPill}
                    onClick={() =>
                      onUpdateDeviceSettings({ liveAlertsShowCharging: !showChargingPill })
                    }
                    className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                      showChargingPill
                        ? 'bg-[#7FFFD4] text-black'
                        : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
                    }`}
                  >
                    {showChargingPill ? 'مفعّل' : 'متوقف'}
                  </button>
                </div>

                {/* Live factual preview: Status Bar Chip + Rich Expanded Notification Drawer */}
                <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-zinc-400">معاينة شريط الحالة وستارة الإشعارات</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#7FFFD4]/35 bg-[var(--bg-card)] px-3 py-1 text-xs font-bold font-mono-tabular text-[#7FFFD4]">
                      <span>{upcomingPreview?.emoji || '💧'}</span>
                      <span dir="ltr">
                        {upcomingPreview?.countdownText ||
                          `${String(deviceSettings.liveAlertsLeadMinutes).padStart(2, '0')}:00`}
                      </span>
                    </span>
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-[var(--bg-card)] p-3.5 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white truncate">
                        {upcomingPreview?.emoji || '📅'} {upcomingPreview?.title || 'المهمة القادمة'}
                        {upcomingPreview?.clockLabel ? ` · ${upcomingPreview.clockLabel}` : ''}
                      </span>
                      <span className="font-mono-tabular text-[11px] text-[#7FFFD4] shrink-0">
                        {upcomingPreview?.clockLabel || '12h'}
                      </span>
                    </div>
                    <div className="font-mono-tabular text-[11px] text-zinc-300">
                      ⏳ {upcomingPreview?.statusLabel || `يبدأ قبل الموعد بـ ${deviceSettings.liveAlertsLeadMinutes} د`} · 💧 {hydrationToday.cupsLogged}/{hydrationToday.targetCups} كوب
                    </div>
                    {upcomingPreview?.nextUpText && (
                      <div className="text-[11px] text-zinc-400 truncate">
                        ⏭ التالي: {upcomingPreview.nextUpText}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <PersistentCountdownToggleCard
          persistentEnabled={persistentEnabled}
          onUpdateDeviceSettings={onUpdateDeviceSettings}
        />
      </section>

    </>
  );
};
