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
} from '../types/dayrhythm';
import { LiveAlertsLeadMinutes, OnePlusDeviceSettings } from '../firebase';
import { QUIET_MODE_LABELS } from '../engines/i18n';
import { AndroidPermissionsCard } from './AndroidPermissionsCard';
import {
  type AndroidPermissionsStatus,
  getAndroidPermissionsStatus,
  isAndroidNative,
  openLiveAlertSettings,
} from '../services/androidPermissions';
import type { MobilePreviewViewProps } from './mobile/types';
import { LiveAlertsSection } from './mobile/LiveAlertsSection';
import { GpsAndHardwareSection } from './mobile/GpsAndHardwareSection';

export const MobilePreviewView: React.FC<MobilePreviewViewProps> = ({
  hydrationToday,
  quietMode,
  quietRemainingSec,
  onTestAdhanChime,
  batteryGuard,
  onSimulateCharge90,
  onSimulatePowerDisconnect,
  onSimulateBedtimeLowBattery,
  onToggleBypassCharging,
  hasShakeUndoActive,
  onTriggerShakeUndo,
  alarmRinging,
  onTriggerRing,
  onDismissTwoWay,
  deviceSettings,
  onUpdateDeviceSettings,
  firestoreSynced,
  activeLocation,
  onRefreshGps,
  gpsSyncing = false,
  phoneBattery,
  phoneChargeLimitPct = 90,
  onUpdatePhoneChargeLimit,
  smartChargeAlertEnabled = true,
  onToggleSmartChargeAlertEnabled,
  upcomingPreview,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isAndroid = isAndroidNative();
  const [androidPerms, setAndroidPerms] = useState<AndroidPermissionsStatus | null>(() =>
    getAndroidPermissionsStatus()
  );

  useEffect(() => {
    if (!isAndroid) return;
    const syncPerms = () => setAndroidPerms(getAndroidPermissionsStatus());
    syncPerms();
    const onVis = () => {
      if (document.visibilityState === 'visible') syncPerms();
    };
    window.addEventListener('dayrhythm:permissions-changed', syncPerms);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('dayrhythm:permissions-changed', syncPerms);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isAndroid]);

  const persistentEnabled = deviceSettings.persistentCountdownNotif ?? true;
  const alwaysOn = Boolean(deviceSettings.liveAlertsAlwaysOn);
  const showChargingPill = deviceSettings.liveAlertsShowCharging ?? true;
  const batteryEtaMin = phoneBattery?.chargeTimeRemainingMin;
  const batteryEtaText =
    phoneBattery?.charging && typeof batteryEtaMin === 'number' && batteryEtaMin > 0
      ? `متبقي ~${batteryEtaMin} د`
      : phoneBattery?.charging
        ? 'قيد الشحن الآن'
        : 'غير موصول بالشاحن';
  const promotedGranted = androidPerms ? Boolean(androidPerms.promotedAlerts ?? androidPerms.notifications) : null;

  return (
    <div className="mx-auto max-w-[920px] px-4 sm:px-6 py-5 sm:py-6 space-y-4">
      {/* Clean Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <h1 className="text-lg font-bold text-white">إعدادات الهاتف (OnePlus 12R)</h1>
          <p className="text-xs text-zinc-400 mt-1">
            التحكم في Dynamic Island، الإشعار الثابت بالعدّاد، ومزامنة GPS والبطارية مع الكمبيوتر
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Cloud className={`w-4 h-4 ${firestoreSynced ? 'text-[#7FFFD4]' : 'text-zinc-500'}`} />
          <span>{firestoreSynced ? 'متزامن لحظياً مع الكمبيوتر' : 'غير متصل'}</span>
        </div>
      </header>

      {/* Active Ringing Banner (Two-Way Dismiss) */}
      <AnimatePresence>
        {alarmRinging && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-[#4ADE80]/35 bg-[#4ADE80]/10 p-4 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex items-center gap-2.5 text-sm font-bold text-[#4ADE80]">
              <BellRing className="w-4 h-4" />
              <span>يوجد تنبيه نشط الآن</span>
            </div>
            <button
              type="button"
              onClick={onDismissTwoWay}
              className="min-h-[44px] px-4 rounded-xl bg-[#4ADE80] text-black text-xs font-bold hover:bg-emerald-300 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>إيقاف التنبيه على الهاتف والكمبيوتر معاً</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <LiveAlertsSection
        deviceSettings={deviceSettings}
        onUpdateDeviceSettings={onUpdateDeviceSettings}
        upcomingPreview={upcomingPreview}
        hydrationToday={hydrationToday}
        isAndroid={isAndroid}
        promotedGranted={promotedGranted}
        alwaysOn={alwaysOn}
        showChargingPill={showChargingPill}
        persistentEnabled={persistentEnabled}
      />
      <GpsAndHardwareSection
        activeLocation={activeLocation}
        onRefreshGps={onRefreshGps}
        gpsSyncing={gpsSyncing}
        quietMode={quietMode}
        quietRemainingSec={quietRemainingSec}
        phoneBattery={phoneBattery}
        batteryEtaText={batteryEtaText}
        phoneChargeLimitPct={phoneChargeLimitPct}
        onUpdatePhoneChargeLimit={onUpdatePhoneChargeLimit}
        smartChargeAlertEnabled={smartChargeAlertEnabled}
        onToggleSmartChargeAlertEnabled={onToggleSmartChargeAlertEnabled}
        batteryGuard={batteryGuard}
        onToggleBypassCharging={onToggleBypassCharging}
        onSimulateCharge90={onSimulateCharge90}
        onSimulatePowerDisconnect={onSimulatePowerDisconnect}
        onSimulateBedtimeLowBattery={onSimulateBedtimeLowBattery}
        onTestAdhanChime={onTestAdhanChime}
        onTriggerRing={onTriggerRing}
        alarmRinging={alarmRinging}
        onDismissTwoWay={onDismissTwoWay}
        hasShakeUndoActive={hasShakeUndoActive}
        onTriggerShakeUndo={onTriggerShakeUndo}
      />
      {/* Secondary / Advanced Hardware Settings & Live Permissions */}
      <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] overflow-hidden">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="w-full min-h-[52px] px-4 py-3.5 flex items-center justify-between gap-3 text-right hover:bg-white/[0.02] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 text-xs font-bold text-zinc-200">
            <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
            <span>الأذونات الحقيقية وإعدادات الهاردوير (OnePlus 12R)</span>
          </span>
          {advancedOpen ? (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </button>

        <AnimatePresence initial={false}>
          {advancedOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-3 border-t border-white/[0.06] space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(
                    [
                      {
                        key: 'aquaTouchMode' as const,
                        title: 'وضع اللمس المبلل (Aqua Touch)',
                        desc: 'تكبير أزرار التأكيد عند الوضوء أو المطر',
                      },
                    ] as const
                  ).map((item) => {
                    const enabled = Boolean(deviceSettings[item.key]);
                    return (
                      <div
                        key={item.key}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white">{item.title}</div>
                          <div className="text-[11px] text-zinc-400 mt-0.5">{item.desc}</div>
                        </div>
                        <button
                          type="button"
                          aria-pressed={enabled}
                          onClick={() => onUpdateDeviceSettings({ [item.key]: !enabled })}
                          className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                            enabled
                              ? 'bg-[#7FFFD4] text-black'
                              : 'bg-white/[0.06] text-zinc-300 hover:text-white'
                          }`}
                        >
                          {enabled ? 'مفعّل' : 'متوقف'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {isAndroid ? (
                  <AndroidPermissionsCard />
                ) : (
                  <div className="rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] px-4 py-3 text-xs text-zinc-400 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#7FFFD4] shrink-0" />
                    <span>افتح التطبيق على هاتف OnePlus 12R لمراجعة وتفعيل أذونات النظام الحقيقية مباشرة.</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
};

