import React, { useState } from 'react';
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
  Vibrate,
  ShieldCheck,
  RefreshCw,
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
import { HAPTIC_WAVEFORMS, HapticWaveformKind, triggerHapticWaveform } from '../engines/hapticsEngine';

interface MobilePreviewViewProps {
  language: AppLanguage;
  prayers: PrayerTimeItem[];
  blocks: ScheduleBlock[];
  hydrationToday: HydrationDayLog;
  onLogWaterCup: () => void;
  quietMode: QuietModeType;
  quietRemainingSec: number;
  onCycleQuietMode: () => void;
  onSetQuietMode: (mode: QuietModeType, durationMinutes: number) => void;
  adhanOverrideSilent: boolean;
  onTestAdhanChime: () => void;
  travelState: TravelState;
  onOpenTravel: () => void;
  onOpenCatchUp: () => void;
  onOpenPomodoro: () => void;
  liveCountdownSec: number;
  batteryGuard: BatteryGuardState;
  onSimulateCharge90: () => void;
  onSimulatePowerDisconnect: () => void;
  onSimulateBedtimeLowBattery: () => void;
  onToggleBypassCharging: (limit: 80 | 90 | null) => void;
  hasShakeUndoActive: boolean;
  onTriggerShakeUndo: () => void;
  alarmRinging: boolean;
  onDismissTwoWay: () => void;
  deviceSettings: OnePlusDeviceSettings;
  onUpdateDeviceSettings: (patch: Partial<OnePlusDeviceSettings>) => void;
  firestoreSynced: boolean;
  activeTimeZone?: string;
  activeLocation?: GeoLocation;
  onRefreshGps?: () => void;
  gpsSyncing?: boolean;
  phoneBattery?: PhoneBatteryTelemetry | null;
  upcomingPreview?: { emoji: string; title: string; countdownText: string } | null;
}

const LEAD_MINUTE_OPTIONS: LiveAlertsLeadMinutes[] = [5, 10, 15];

const PERMISSION_STEPS = [
  { id: 'alarm', labelAr: 'منبهات دقيقة لا تتأخر في وضع السكون' },
  { id: 'battery', labelAr: 'استثناء التطبيق من تحسين البطارية في الخلفية' },
  { id: 'notif', labelAr: 'السماح بإشعارات Live Alerts وشريط الحالة' },
];

export const MobilePreviewView: React.FC<MobilePreviewViewProps> = ({
  quietMode,
  onSetQuietMode,
  batteryGuard,
  onToggleBypassCharging,
  alarmRinging,
  onDismissTwoWay,
  deviceSettings,
  onUpdateDeviceSettings,
  firestoreSynced,
  activeLocation,
  onRefreshGps,
  gpsSyncing = false,
  phoneBattery,
  upcomingPreview,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [lastHapticNote, setLastHapticNote] = useState<string>('');

  const persistentEnabled = deviceSettings.persistentCountdownNotif ?? true;
  const batteryEtaMin = phoneBattery?.chargeTimeRemainingMin;
  const batteryEtaText =
    phoneBattery?.charging && typeof batteryEtaMin === 'number' && batteryEtaMin > 0
      ? `متبقي ~${batteryEtaMin} د`
      : phoneBattery?.charging
        ? 'قيد الشحن الآن'
        : 'غير موصول بالشاحن';

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
          <span>{firestoreSynced ? 'متزامن لحظياً مع الكمبيوتر' : 'وضع محلي'}</span>
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
            <h2 className="text-sm font-bold text-white">
              كبسولة Dynamic Island (Live Alerts)
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              تظهر تلقائياً في أعلى شاشة OnePlus 12R قبل موعد المهمة أو التنبيه القادم مع الإيموجي وعدّاد الثواني (ولا تظهر أي كبسولة مكررة داخل التطبيق).
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateDeviceSettings({ liveAlertsEnabled: !deviceSettings.liveAlertsEnabled })
            }
            className={`min-h-[40px] px-4 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              deviceSettings.liveAlertsEnabled
                ? 'bg-[#7FFFD4] text-black'
                : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
            }`}
          >
            {deviceSettings.liveAlertsEnabled ? 'مفعّلة' : 'متوقفة'}
          </button>
        </div>

        {deviceSettings.liveAlertsEnabled && (
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-zinc-300">تبدأ بالظهور قبل الموعد بـ</span>
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-black/60 border border-white/[0.08]">
                {LEAD_MINUTE_OPTIONS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => onUpdateDeviceSettings({ liveAlertsLeadMinutes: mins })}
                    className={`min-h-[36px] px-3.5 rounded-lg text-xs font-bold font-digits transition-colors cursor-pointer ${
                      deviceSettings.liveAlertsLeadMinutes === mins
                        ? 'bg-[#7FFFD4] text-black'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {mins} دقائق
                  </button>
                ))}
              </div>
            </div>

            {/* Minimal, factual preview of the exact Dynamic Island chip format */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/50 px-3.5 py-2.5">
              <span className="text-xs text-zinc-400">شكل الكبسولة في شريط الحالة</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#7FFFD4]/35 bg-black px-3 py-1 text-xs font-bold font-digits text-[#7FFFD4]">
                <span>{upcomingPreview?.emoji || '💧'}</span>
                <span dir="ltr">
                  {upcomingPreview?.countdownText ||
                    `${String(deviceSettings.liveAlertsLeadMinutes).padStart(2, '0')}:00`}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Persistent Ongoing Countdown Notification Toggle */}
        <div className="pt-4 border-t border-white/[0.08] flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">
              إشعار ثابت بعدّاد تنازلي في الإشعارات
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              يبقي المهمة أو الحدث القادم (من التقويم أو المهام أو الماء أو العلاج) ظاهراً دائماً في ستارة الإشعارات بعدّاد تنازلي مباشر صامت.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateDeviceSettings({ persistentCountdownNotif: !persistentEnabled })
            }
            className={`min-h-[40px] px-4 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
              persistentEnabled
                ? 'bg-[#7FFFD4] text-black'
                : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
            }`}
          >
            {persistentEnabled ? 'مفعّل' : 'متوقف'}
          </button>
        </div>
      </section>

      {/* Primary Section 2: Unified GPS & Battery Sync with PC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

        {/* Battery & Smart Charge Limit -> PC */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#0B0E14] p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <BatteryCharging className="w-4 h-4 text-amber-300" />
                <span>البطارية والشحن الذكي</span>
              </h2>
              <p className="text-xs text-zinc-400">
                تصل النسبة ووقت الشحن المتبقي لبرنامج الكمبيوتر لحظياً
              </p>
            </div>
            {phoneBattery && (
              <div className="text-left">
                <div className="font-digits text-xl font-extrabold text-white">
                  {phoneBattery.levelPct}%
                </div>
                <div className="text-[11px] text-zinc-400">{batteryEtaText}</div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="text-xs text-zinc-400">حد الشحن المفضل (تنبيه تلقائي على الكمبيوتر)</div>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/50 border border-white/[0.07]">
              {(
                [
                  { val: null, label: 'عادي' },
                  { val: 80 as const, label: '80%' },
                  { val: 90 as const, label: '90%' },
                ] as const
              ).map((opt) => (
                <button
                  key={String(opt.val)}
                  type="button"
                  onClick={() => onToggleBypassCharging(opt.val)}
                  className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    batteryGuard.bypassChargingLimitPct === opt.val
                      ? 'bg-[#7FFFD4] text-black'
                      : 'text-zinc-300 hover:bg-white/[0.05]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Primary Section 3: Synced Quiet Mode */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#0B0E14] p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-[#7FFFD4]" />
            <span>الوضع الهادئ المتزامن (هاتف + كمبيوتر)</span>
          </h2>
          <span className="text-xs text-[#7FFFD4] font-semibold">
            {QUIET_MODE_LABELS[quietMode].ar}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['normal', 'mute_audio', 'vibrate_only', 'silent_all'] as QuietModeType[]).map(
            (mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onSetQuietMode(mode, mode === 'normal' ? 0 : 60)}
                className={`min-h-[44px] rounded-xl border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  quietMode === mode
                    ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                    : 'border-white/[0.08] bg-black/40 text-zinc-300 hover:border-white/20'
                }`}
              >
                {QUIET_MODE_LABELS[mode].ar}
              </button>
            )
          )}
        </div>
      </section>

      {/* Secondary / Advanced Hardware Settings (Collapsed by Default!) */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#0B0E14] overflow-hidden">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="w-full min-h-[52px] px-5 py-3.5 flex items-center justify-between gap-3 text-right hover:bg-white/[0.02] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 text-xs font-bold text-zinc-200">
            <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
            <span>إعدادات متقدمة للنظام والأذونات (OnePlus 12R)</span>
          </span>
          {advancedOpen ? (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </button>

        {advancedOpen && (
          <div className="px-5 pb-5 pt-2 border-t border-white/[0.08] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  {
                    key: 'alertSliderLinked' as const,
                    title: 'ربط مفتاح Alert Slider',
                    desc: 'مزامنة وضع الصامت مع الكمبيوتر عند تحريك الزر الجانبي',
                  },
                  {
                    key: 'aquaTouchMode' as const,
                    title: 'وضع اللمس المبلل (Aqua Touch)',
                    desc: 'تكبير أزرار التأكيد عند الوضوء أو المطر',
                  },
                  {
                    key: 'ltpoNight1Hz' as const,
                    title: 'توفير الطاقة الليلي (1Hz)',
                    desc: 'تعتيم تلقائي للشاشة ليلاً لحفظ البطارية',
                  },
                  {
                    key: 'pocketProtectionEnabled' as const,
                    title: 'حماية الجيب',
                    desc: 'منع الإغلاق العرضي للمنبه داخل الجيب',
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
                      <div className="text-[11px] text-zinc-500 mt-0.5">{item.desc}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUpdateDeviceSettings({ [item.key]: !enabled })}
                      className={`min-h-[34px] px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                        enabled
                          ? 'bg-[#7FFFD4] text-black'
                          : 'bg-white/[0.06] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {enabled ? 'مفعّل' : 'متوقف'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Haptics test */}
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Vibrate className="w-3.5 h-3.5 text-[#7FFFD4]" />
                  <span>اختبار اهتزاز الهاتف</span>
                </span>
                {lastHapticNote && (
                  <span className="text-[11px] text-[#7FFFD4]">{lastHapticNote}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(HAPTIC_WAVEFORMS) as Array<[HapticWaveformKind, (typeof HAPTIC_WAVEFORMS)[HapticWaveformKind]]>).map(
                  ([kind, wf]) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        const supported = triggerHapticWaveform(kind);
                        setLastHapticNote(
                          supported ? `تم تشغيل: ${wf.labelAr}` : 'الاهتزاز غير مدعوم في المتصفح الحالي'
                        );
                      }}
                      className="min-h-[36px] px-3 rounded-lg border border-white/[0.08] bg-black/40 text-xs text-zinc-300 hover:border-[#7FFFD4]/40 hover:text-white cursor-pointer"
                    >
                      {wf.labelAr}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Background Permissions Checklist */}
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#7FFFD4]" />
                <span>أذونات العمل في الخلفية الموصى بها</span>
              </div>
              <ul className="space-y-1.5">
                {PERMISSION_STEPS.map((p) => (
                  <li key={p.id} className="text-xs text-zinc-400 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />
                    <span>{p.labelAr}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
