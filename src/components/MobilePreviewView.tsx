import React, { useEffect, useState } from 'react';
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

interface MobilePreviewViewProps {
  language: AppLanguage;
  prayers: PrayerTimeItem[];
  blocks: ScheduleBlock[];
  hydrationToday: HydrationDayLog;
  onLogWaterCup: () => void;
  quietMode: QuietModeType;
  quietRemainingSec: number;
  adhanOverrideSilent: boolean;
  onTestAdhanChime: () => void;
  travelState: TravelState;
  batteryGuard: BatteryGuardState;
  onSimulateCharge90: () => void;
  onSimulatePowerDisconnect: () => void;
  onSimulateBedtimeLowBattery: () => void;
  onToggleBypassCharging: (limit: number | null) => void;
  hasShakeUndoActive: boolean;
  onTriggerShakeUndo: () => void;
  alarmRinging: boolean;
  onTriggerRing?: () => void;
  onDismissTwoWay: () => void;
  deviceSettings: OnePlusDeviceSettings;
  onUpdateDeviceSettings: (patch: Partial<OnePlusDeviceSettings>) => void;
  firestoreSynced: boolean;
  activeTimeZone?: string;
  activeLocation?: GeoLocation;
  onRefreshGps?: () => void;
  gpsSyncing?: boolean;
  phoneBattery?: PhoneBatteryTelemetry | null;
  phoneChargeLimitPct?: number;
  onUpdatePhoneChargeLimit?: (limitPct: number) => void;
  smartChargeAlertEnabled?: boolean;
  onToggleSmartChargeAlertEnabled?: () => void;
  upcomingPreview?: {
    emoji: string;
    title: string;
    countdownText: string;
    statusLabel?: string;
    clockLabel?: string;
    nextUpText?: string;
  } | null;
}

const LEAD_MINUTE_OPTIONS: LiveAlertsLeadMinutes[] = [5, 10, 15, 20, 30];

export const MobilePreviewView: React.FC<MobilePreviewViewProps> = ({
  hydrationToday,
  quietMode,
  batteryGuard,
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
    <div className="mx-auto max-w-[920px] px-4 sm:px-6 py-5 sm:py-6 space-y-5">
      {/* Clean Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
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
      {alarmRinging && (
        <div className="rounded-2xl border border-[#4ADE80]/40 bg-[#4ADE80]/10 p-4 flex flex-wrap items-center justify-between gap-3">
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
        </div>
      )}

      {/* Primary Section 1: OnePlus 12R Dynamic Island (Live Alerts) + Persistent Countdown Notification */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#0B0E14] p-5 space-y-5">
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
              className="min-h-[36px] px-2.5 rounded-lg text-[11px] font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>فتح الإعدادات</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        )}

        {deviceSettings.liveAlertsEnabled && (
          <div className="space-y-4 pt-1">
            {/* Lead time options: 5 / 10 / 15 / 20 / 30 min + Always On */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#7FFFD4]" />
                  <span>تبدأ الكبسولة بالظهور قبل الموعد بـ</span>
                </span>
                <span className="text-[11px] font-medium text-[#7FFFD4]">
                  {alwaysOn ? 'ظهور مستمر طوال اليوم' : `قبل ${deviceSettings.liveAlertsLeadMinutes} دقائق`}
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 p-1 rounded-xl bg-black/60 border border-white/[0.08]">
                {LEAD_MINUTE_OPTIONS.map((mins) => {
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
                      className={`min-h-[42px] px-2 rounded-lg text-xs font-bold font-digits transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#7FFFD4] text-black'
                          : 'text-zinc-300 hover:text-white hover:bg-white/[0.05]'
                      }`}
                    >
                      {mins} د
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
                  className={`min-h-[42px] px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    alwaysOn
                      ? 'bg-[#7FFFD4] text-black'
                      : 'text-zinc-300 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  دائماً
                </button>
              </div>
            </div>

            {/* Charging Capsule Toggle */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/45 px-3.5 py-3">
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
                className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                  showChargingPill
                    ? 'bg-[#7FFFD4] text-black'
                    : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
                }`}
              >
                {showChargingPill ? 'مفعّل' : 'متوقف'}
              </button>
            </div>

            {/* Live factual preview: Status Bar Chip + Rich Expanded Notification Drawer */}
            <div className="rounded-xl border border-white/[0.08] bg-black/60 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-zinc-400">معاينة شريط الحالة وستارة الإشعارات</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#7FFFD4]/40 bg-black px-3 py-1 text-xs font-bold font-digits text-[#7FFFD4]">
                  <span>{upcomingPreview?.emoji || '💧'}</span>
                  <span dir="ltr">
                    {upcomingPreview?.countdownText ||
                      `${String(deviceSettings.liveAlertsLeadMinutes).padStart(2, '0')}:00`}
                  </span>
                </span>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-[#0F131C] p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white truncate">
                    {upcomingPreview?.emoji || '📅'} {upcomingPreview?.title || 'المهمة القادمة'}
                    {upcomingPreview?.clockLabel ? ` · ${upcomingPreview.clockLabel}` : ''}
                  </span>
                  <span className="text-[11px] text-[#7FFFD4] shrink-0">
                    {upcomingPreview?.clockLabel || '12h'}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-300">
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
        )}

        {/* Persistent Ongoing Countdown Notification Toggle */}
        <div className="pt-4 border-t border-white/[0.08] flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">
              إشعار ثابت غني بالمعلومات في الستارة
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              يبقي الموعد القادم وتفاصيله والعدّاد التنازلي والترطيب والمهمة التالية ظاهرين في ستارة الإشعارات بصمت طوال اليوم.
            </p>
          </div>
          <button
            type="button"
            aria-pressed={persistentEnabled}
            onClick={() =>
              onUpdateDeviceSettings({ persistentCountdownNotif: !persistentEnabled })
            }
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              persistentEnabled
                ? 'bg-[#7FFFD4] text-black'
                : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
            }`}
          >
            {persistentEnabled ? 'مفعّل' : 'متوقف'}
          </button>
        </div>
      </section>

      {/* Primary Section 2: GPS (the phone is the location source for the PC) */}
      <div className="grid grid-cols-1 gap-5">
        {/* GPS Authority -> PC */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#0B0E14] p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#7FFFD4]" />
              <span>توحيد GPS مع الكمبيوتر</span>
            </h2>
            <p className="text-xs text-zinc-400">
              هاتفك هو مصدر الموقع الرئيسي — يتم تحديث موقع الكمبيوتر ومواقيت الصلاة والطقس منه تلقائياً
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-black/45 px-3.5 py-3 space-y-1">
            <div className="text-sm font-bold text-white">
              {activeLocation?.nameAr || 'جاري تحديد الموقع...'}
            </div>
            {activeLocation && (
              <div className="font-digits text-[11px] text-zinc-400">
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
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3.5 py-1.5 text-xs text-amber-200">
          <Volume2 className="w-3.5 h-3.5 shrink-0" />
          <span>وضع الاجتماع نشط: {QUIET_MODE_LABELS[quietMode].ar}</span>
        </div>
      )}

      {/* Hardware Controls: Bypass Charging, Charge Limit & Synced Alarm Test */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#0B0E14] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <BatteryCharging className="w-4 h-4 text-[#7FFFD4]" />
              <span>الشحن التجاوزي وحماية البطارية</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {phoneBattery
                ? `${phoneBattery.levelPct}% · ${batteryEtaText}`
                : 'تحكم مباشر بحد الشحن والتنبيهات من الهاتف'}
            </p>
          </div>
          {hasShakeUndoActive && (
            <button
              type="button"
              onClick={onTriggerShakeUndo}
              className="min-h-[40px] px-3.5 rounded-xl bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>تراجع عن آخر حذف</span>
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {onToggleSmartChargeAlertEnabled && (
            <button
              type="button"
              onClick={onToggleSmartChargeAlertEnabled}
              aria-pressed={smartChargeAlertEnabled}
              className={`w-full min-h-[44px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                smartChargeAlertEnabled
                  ? 'border-[#4ADE80]/50 bg-[#4ADE80]/15 text-[#4ADE80]'
                  : 'border-white/[0.08] bg-black/40 text-zinc-400 hover:border-white/20'
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
            <div dir="rtl" className="rounded-xl border border-white/[0.08] bg-black/40 p-3.5 space-y-3">
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
                    className={`min-h-[32px] px-2.5 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                      batteryGuard.bypassChargingLimitPct !== null
                        ? 'border-[#4ADE80]/50 bg-[#4ADE80]/15 text-[#4ADE80]'
                        : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20'
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
                      className={`min-h-[44px] px-1.5 rounded-xl border font-mono-tabular text-xs font-bold transition-colors cursor-pointer ${
                        active
                          ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                          : 'border-white/[0.08] bg-black/50 text-zinc-300 hover:border-white/20'
                      }`}
                    >
                      {pct}%
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {(onTriggerRing || alarmRinging) && (
          <div className="pt-2 border-t border-white/[0.07] flex flex-wrap gap-2">
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

      {/* Secondary / Advanced Hardware Settings & Live Permissions */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#0B0E14] overflow-hidden">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="w-full min-h-[52px] px-5 py-3.5 flex items-center justify-between gap-3 text-right hover:bg-white/[0.02] transition-colors cursor-pointer"
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

        {advancedOpen && (
          <div className="px-5 pb-5 pt-3 border-t border-white/[0.08] space-y-4">
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
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/40 p-3.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white">{item.title}</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">{item.desc}</div>
                    </div>
                    <button
                      type="button"
                      aria-pressed={enabled}
                      onClick={() => onUpdateDeviceSettings({ [item.key]: !enabled })}
                      className={`min-h-[40px] px-3.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
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
              <div className="rounded-xl border border-white/[0.07] bg-black/40 px-4 py-3 text-xs text-zinc-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#7FFFD4] shrink-0" />
                <span>افتح التطبيق على هاتف OnePlus 12R لمراجعة وتفعيل أذونات النظام الحقيقية مباشرة.</span>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
