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

export const GpsAndHardwareSection: React.FC<{
  activeLocation: MobilePreviewViewProps['activeLocation'];
  onRefreshGps: MobilePreviewViewProps['onRefreshGps'];
  gpsSyncing: boolean;
  quietMode: MobilePreviewViewProps['quietMode'];
  quietRemainingSec: number;
  phoneBattery: MobilePreviewViewProps['phoneBattery'];
  batteryEtaText: string;
  phoneChargeLimitPct: number;
  onUpdatePhoneChargeLimit: MobilePreviewViewProps['onUpdatePhoneChargeLimit'];
  smartChargeAlertEnabled: boolean;
  onToggleSmartChargeAlertEnabled: MobilePreviewViewProps['onToggleSmartChargeAlertEnabled'];
  batteryGuard: MobilePreviewViewProps['batteryGuard'];
  onToggleBypassCharging: MobilePreviewViewProps['onToggleBypassCharging'];
  onSimulateCharge90: MobilePreviewViewProps['onSimulateCharge90'];
  onSimulatePowerDisconnect: MobilePreviewViewProps['onSimulatePowerDisconnect'];
  onSimulateBedtimeLowBattery: MobilePreviewViewProps['onSimulateBedtimeLowBattery'];
  onTestAdhanChime: MobilePreviewViewProps['onTestAdhanChime'];
  onTriggerRing: MobilePreviewViewProps['onTriggerRing'];
  alarmRinging: boolean;
  onDismissTwoWay: MobilePreviewViewProps['onDismissTwoWay'];
  hasShakeUndoActive: boolean;
  onTriggerShakeUndo: MobilePreviewViewProps['onTriggerShakeUndo'];
}> = (props) => {
  const {
    activeLocation, onRefreshGps, gpsSyncing, quietMode, quietRemainingSec,
    phoneBattery, batteryEtaText, phoneChargeLimitPct, onUpdatePhoneChargeLimit,
    smartChargeAlertEnabled, onToggleSmartChargeAlertEnabled,
    batteryGuard, onToggleBypassCharging, onSimulateCharge90,
    onSimulatePowerDisconnect, onSimulateBedtimeLowBattery,
    onTestAdhanChime, onTriggerRing, alarmRinging, onDismissTwoWay,
    hasShakeUndoActive, onTriggerShakeUndo,
  } = props;
  return (
    <>
      {/* Primary Section 2: GPS (the phone is the location source for the PC) */}
      <div className="grid grid-cols-1 gap-4">
        {/* GPS Authority -> PC */}
        <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-4 space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#7FFFD4]" />
              <span>توحيد GPS مع الكمبيوتر</span>
            </h2>
            <p className="text-xs text-zinc-400">
              هاتفك هو مصدر الموقع الرئيسي — يتم تحديث موقع الكمبيوتر ومواقيت الصلاة والطقس منه تلقائياً
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] px-4 py-3 space-y-1">
            <div className="text-sm font-bold text-white">
              {activeLocation?.nameAr || 'جاري تحديد الموقع...'}
            </div>
            {activeLocation && (
              <div className="font-mono-tabular text-[11px] text-zinc-400">
                {activeLocation.lat.toFixed(4)}, {activeLocation.lng.toFixed(4)} ·{' '}
                {activeLocation.timeZone || 'Africa/Cairo'}
              </div>
            )}
          </div>

          {onRefreshGps && (
            <button
              type="button"
              onClick={onRefreshGps}
              disabled={gpsSyncing}
              className="w-full min-h-[44px] rounded-xl border border-[#7FFFD4]/40 bg-[#7FFFD4]/12 px-4 py-2 text-xs font-bold text-[#7FFFD4] hover:bg-[#7FFFD4]/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${gpsSyncing ? 'animate-spin' : ''}`} />
              <span>
                {gpsSyncing ? 'جاري قراءة GPS...' : 'تحديث موقع GPS الآن ومزامنته للكمبيوتر'}
              </span>
            </button>
          )}
        </section>

      </div>

      {/* Compact read-only status pill when Meeting Mode is active */}
      {quietMode !== 'normal' && (
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-400/10 px-3.5 py-1.5 text-xs text-amber-200">
          <Volume2 className="w-3.5 h-3.5 shrink-0" />
          <span>وضع الاجتماع نشط: {QUIET_MODE_LABELS[quietMode].ar}</span>
        </div>
      )}

      {/* Hardware Controls: Bypass Charging, Charge Limit & Synced Alarm Test */}
      <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <BatteryCharging className="w-4 h-4 text-[#7FFFD4]" />
              <span>الشحن التجاوزي وحماية البطارية</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono-tabular">
              {phoneBattery
                ? `${phoneBattery.levelPct}% · ${batteryEtaText}`
                : 'تحكم مباشر بحد الشحن والتنبيهات من الهاتف'}
            </p>
          </div>
          {hasShakeUndoActive && (
            <button
              type="button"
              onClick={onTriggerShakeUndo}
              className="min-h-[44px] px-3.5 rounded-xl bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>تراجع عن آخر حذف</span>
            </button>
          )}
        </div>

        <div className="space-y-3">
          {onToggleSmartChargeAlertEnabled && (
            <button
              type="button"
              onClick={onToggleSmartChargeAlertEnabled}
              aria-pressed={smartChargeAlertEnabled}
              className={`w-full min-h-[44px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                smartChargeAlertEnabled
                  ? 'border-[#4ADE80]/45 bg-[#4ADE80]/12 text-[#4ADE80]'
                  : 'border-white/[0.06] bg-[var(--bg-surface)] text-zinc-400 hover:border-white/20'
              }`}
            >
              {smartChargeAlertEnabled ? (
                <Volume2 className="w-4 h-4 shrink-0" />
              ) : (
                <VolumeX className="w-4 h-4 shrink-0" />
              )}
              <span>{smartChargeAlertEnabled ? 'التنبيه الذكي للشحن مفعّل' : 'التنبيه الذكي للشحن متوقف'}</span>
            </button>
          )}
          {onUpdatePhoneChargeLimit && (
            <div dir="rtl" className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-zinc-200">
                  حد الشحن التجاوزي الذكي
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono-tabular text-xs font-extrabold px-2.5 py-1 rounded-lg border border-[#7FFFD4]/40 bg-[#7FFFD4]/15 text-[#7FFFD4]">
                    {phoneChargeLimitPct}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onToggleBypassCharging(
                        batteryGuard.bypassChargingLimitPct === null ? phoneChargeLimitPct : null
                      )
                    }
                    aria-pressed={batteryGuard.bypassChargingLimitPct !== null}
                    className={`min-h-[44px] sm:min-h-[34px] px-2.5 rounded-xl border text-[11px] font-bold transition-colors cursor-pointer ${
                      batteryGuard.bypassChargingLimitPct !== null
                        ? 'border-[#4ADE80]/50 bg-[#4ADE80]/15 text-[#4ADE80]'
                        : 'border-white/[0.06] bg-[var(--bg-card)] text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    {batteryGuard.bypassChargingLimitPct !== null ? 'تجاوزي نشط' : 'عادي'}
                  </button>
                </div>
              </div>

              <div className="relative flex items-center py-1">
                <input
                  type="range"
                  min={80}
                  max={100}
                  step={5}
                  dir="rtl"
                  aria-label="حد الشحن التجاوزي"
                  value={Math.max(80, Math.min(100, Math.round(phoneChargeLimitPct / 5) * 5))}
                  onChange={(e) => {
                    const nextPct = Number(e.target.value);
                    onUpdatePhoneChargeLimit(nextPct);
                    onToggleBypassCharging(nextPct);
                  }}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-white/15 accent-[#7FFFD4]"
                />
              </div>

              <div className="grid grid-cols-5 gap-2">
                {[80, 85, 90, 95, 100].map((pct) => {
                  const active = phoneChargeLimitPct === pct;
                  return (
                    <button
                      key={pct}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        onUpdatePhoneChargeLimit(pct);
                        onToggleBypassCharging(pct);
                      }}
                      className={`relative min-h-[44px] px-1.5 rounded-xl border font-mono-tabular text-xs font-bold transition-colors cursor-pointer select-none ${
                        active
                          ? 'border-[#7FFFD4]/45 text-[#7FFFD4]'
                          : 'border-white/[0.06] bg-[var(--bg-card)] text-zinc-300 hover:border-white/20'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="mobile-charge-limit-pill"
                          transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                          className="absolute inset-0 rounded-xl bg-[#7FFFD4]/12"
                        />
                      )}
                      <span className="relative z-10">{pct}%</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {(onTriggerRing || alarmRinging) && (
          <div className="pt-3 border-t border-white/[0.06] flex flex-wrap gap-2">
            {onTriggerRing && (
              <button
                type="button"
                onClick={onTriggerRing}
                className="flex-1 min-h-[48px] px-4 rounded-xl border border-[#7FFFD4]/40 bg-[#7FFFD4]/12 text-[#7FFFD4] hover:bg-[#7FFFD4]/20 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <BellRing className="w-4 h-4 shrink-0" />
                <span>اختبار التنبيه المتزامن</span>
              </button>
            )}
            {alarmRinging && (
              <button
                type="button"
                onClick={onDismissTwoWay}
                className="flex-1 min-h-[48px] px-4 rounded-xl bg-[#4ADE80] text-black hover:bg-emerald-300 text-xs font-bold transition-colors cursor-pointer"
              >
                إيقاف على الجهازين الآن
              </button>
            )}
          </div>
        )}
      </section>

    </>
  );
};
