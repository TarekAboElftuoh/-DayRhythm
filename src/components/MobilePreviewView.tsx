import React, { useState } from 'react';
import {
  BatteryCharging,
  Droplets,
  Plane,
  Zap,
  Timer,
  Moon,
  ShieldCheck,
  Vibrate,
  CheckCircle2,
  Sparkles,
  Sliders,
  ShieldAlert,
  Cloud,
  BellRing,
} from 'lucide-react';
import {
  AppLanguage,
  BatteryGuardState,
  HydrationDayLog,
  PrayerTimeItem,
  QuietModeType,
  ScheduleBlock,
  TravelState,
} from '../types/dayrhythm';
import { LiveAlertsLeadMinutes, OnePlusDeviceSettings } from '../firebase';
import { formatCairoNow12h, formatMinutes12h } from '../engines/prayerEngine';
import { QUIET_MODE_LABELS } from '../engines/i18n';
import { HAPTIC_WAVEFORMS, triggerHapticWaveform } from '../engines/hapticsEngine';

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
}

const PERMISSION_STEPS = [
  { id: 'alarm', labelAr: 'منبهات دقيقة لا تتأخر في وضع السكون' },
  { id: 'fullscreen', labelAr: 'الظهور فوق شاشة القفل لنداء الفجر' },
  { id: 'battery', labelAr: 'استثناء التطبيق من إغلاق البطارية في الخلفية' },
  { id: 'autolaunch', labelAr: 'إعادة جدولة المنبهات تلقائياً بعد إعادة التشغيل' },
];

const LEAD_MINUTE_OPTIONS: LiveAlertsLeadMinutes[] = [5, 10, 15, 20, 30];

export const MobilePreviewView: React.FC<MobilePreviewViewProps> = ({
  language,
  prayers,
  blocks,
  hydrationToday,
  onLogWaterCup,
  quietMode,
  quietRemainingSec,
  onCycleQuietMode,
  onSetQuietMode,
  travelState,
  onOpenTravel,
  onOpenCatchUp,
  onOpenPomodoro,
  liveCountdownSec,
  batteryGuard,
  onToggleBypassCharging,
  alarmRinging,
  onDismissTwoWay,
  deviceSettings,
  onUpdateDeviceSettings,
  firestoreSynced,
}) => {
  const [showNightWakeScreen, setShowNightWakeScreen] = useState(false);
  const [liveAlertMode, setLiveAlertMode] = useState<'alarm' | 'hydration' | 'charge'>('alarm');
  const [previewPocketShield, setPreviewPocketShield] = useState(false);
  const [lastHapticNote, setLastHapticNote] = useState<string>('');
  const [permState, setPermState] = useState<Record<string, boolean>>({
    alarm: true,
    fullscreen: true,
    battery: true,
    autolaunch: true,
  });

  const nextBlock = blocks.find((b) => !b.completed && !b.deleted) ?? blocks[0];
  const fajrPrayer = prayers.find((p) => p.id === 'fajr');
  const isMutedState = quietMode !== 'normal';

  const pocketShieldVisible = deviceSettings.pocketProtectionEnabled && previewPocketShield;

  const handleHapticTest = (kind: keyof typeof HAPTIC_WAVEFORMS) => {
    triggerHapticWaveform(kind);
    const wf = HAPTIC_WAVEFORMS[kind];
    setLastHapticNote(language === 'ar' ? wf.labelAr : wf.labelEn);
  };

  return (
    <div className="mx-auto max-w-[1380px] px-3 sm:px-6 py-4 sm:py-6">
      <div className="mb-5 pb-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-base sm:text-lg font-bold text-white">إعدادات الهاتف</h1>
          {firestoreSynced && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#4ADE80]">
              <Cloud className="w-3.5 h-3.5" />
              <span>متزامن لحظياً</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setPreviewPocketShield(false);
            setShowNightWakeScreen((v) => !v);
          }}
          className={`min-h-[38px] px-3.5 py-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
            showNightWakeScreen
              ? 'border-[#7FFFD4] bg-[#7FFFD4] text-black font-bold'
              : 'border-white/15 bg-white/[0.04] text-zinc-200 hover:border-white/30'
          }`}
        >
          <Moon className="w-3.5 h-3.5" />
          <span>معاينة شاشة الفجر الليلية</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
        {/* Left: Clean OnePlus 12R Live Preview Frame */}
        <div className="lg:col-span-5 flex flex-col items-center w-full">
          <div className="w-full max-w-[380px] rounded-[34px] sm:rounded-[38px] border-2 border-zinc-700/80 bg-black px-3.5 sm:px-4 pb-4 pt-3 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-center mb-2">
              <span className="w-12 h-1 rounded-full bg-zinc-800" />
            </div>

            {pocketShieldVisible ? (
              <div className="min-h-[580px] bg-[#000000] flex flex-col justify-between py-10 px-5 text-center">
                <div className="text-[11px] text-zinc-600">حماية الجيب</div>
                <div className="space-y-4">
                  <div className="mx-auto w-14 h-14 rounded-2xl border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 flex items-center justify-center">
                    <ShieldAlert className="w-7 h-7 text-[#7FFFD4]" />
                  </div>
                  <div className="text-lg font-bold text-white">حماية الجيب نشطة</div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    تم قفل اللمس العرضي وتأجيل التنبيهات البصرية أثناء وجود الهاتف في الجيب، مع استمرار الأذان والاهتزاز.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewPocketShield(false)}
                  className="w-full min-h-[50px] rounded-2xl border border-[#7FFFD4]/45 bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold text-xs cursor-pointer hover:bg-[#7FFFD4]/25"
                >
                  إغلاق المعاينة
                </button>
              </div>
            ) : showNightWakeScreen ? (
              <div className="min-h-[580px] bg-[#000000] flex flex-col justify-between py-8 px-4 text-center">
                <div className="text-[11px] text-zinc-600 font-mono-tabular">
                  {deviceSettings.ltpoNight1Hz ? '1Hz' : '120Hz'} · #000000
                </div>
                <div className="space-y-4">
                  <div className="text-6xl">🕌 🌌</div>
                  <div className="text-xl font-bold text-[#7FFFD4]/85">
                    أذان -3 د · الفجر
                  </div>
                  <div className="font-mono-tabular text-4xl font-bold text-white/80">
                    {fajrPrayer ? formatMinutes12h(fajrPrayer.alarmMinutes, language) : '04:49 ص'}
                  </div>
                </div>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNightWakeScreen(false);
                      onDismissTwoWay();
                    }}
                    className={`w-full ${
                      deviceSettings.aquaTouchMode ? 'min-h-[56px]' : 'min-h-[44px]'
                    } rounded-2xl border border-[#7FFFD4]/40 bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold text-sm cursor-pointer`}
                  >
                    إيقاف المنبه
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNightWakeScreen(false)}
                    className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    إغلاق المعاينة
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* OxygenOS 16 Live Alerts Capsule */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                  <span className="font-mono-tabular text-[11px] text-zinc-400">
                    {formatCairoNow12h(language)}
                  </span>

                  {deviceSettings.liveAlertsEnabled ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLiveAlertMode((m) =>
                          m === 'alarm' ? 'hydration' : m === 'hydration' ? 'charge' : 'alarm'
                        )
                      }
                      className="flex items-center gap-1.5 rounded-full bg-zinc-900 border border-[#7FFFD4]/45 px-3 py-1 cursor-pointer hover:border-[#7FFFD4]"
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-black border border-zinc-700 shrink-0" />
                      {liveAlertMode === 'alarm' ? (
                        <>
                          <span className="text-xs">{nextBlock?.emojiPair.split(' ')[0] ?? '🕌'}</span>
                          <span className="font-mono-tabular text-[11px] font-bold text-[#7FFFD4]">
                            قبل {deviceSettings.liveAlertsLeadMinutes}د · 00:{String(liveCountdownSec).padStart(2, '0')}
                          </span>
                        </>
                      ) : liveAlertMode === 'hydration' ? (
                        <span className="font-mono-tabular text-[11px] font-bold text-[#7FFFD4]">
                          💧 {hydrationToday.cupsLogged}/{hydrationToday.targetCups}
                        </span>
                      ) : (
                        <span className="font-mono-tabular text-[11px] font-bold text-[#4ADE80]">
                          ⚡ {batteryGuard.levelPct}%
                        </span>
                      )}
                    </button>
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-900 border border-zinc-700" />
                  )}

                  <div className="flex items-center gap-1 font-mono-tabular text-[11px] text-zinc-300">
                    <BatteryCharging
                      className={`w-3.5 h-3.5 ${
                        batteryGuard.bypassChargingLimitPct
                          ? 'text-sky-400'
                          : batteryGuard.levelPct >= 90
                            ? 'text-[#4ADE80]'
                            : batteryGuard.levelPct <= 25
                              ? 'text-rose-400'
                              : 'text-zinc-300'
                      }`}
                    />
                    <span>{batteryGuard.levelPct}%</span>
                  </div>
                </div>

                {/* Quick Settings Tiles */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onLogWaterCup();
                      handleHapticTest('water_cup');
                    }}
                    className={`${
                      deviceSettings.aquaTouchMode ? 'min-h-[82px]' : 'min-h-[70px]'
                    } rounded-2xl border border-[#7FFFD4]/40 bg-[#7FFFD4]/12 px-3 py-2.5 text-right hover:bg-[#7FFFD4]/20 cursor-pointer transition-colors`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base">💧</span>
                      <span className="font-mono-tabular text-[10px] text-[#7FFFD4]">
                        {hydrationToday.cupsLogged}/{hydrationToday.targetCups}
                      </span>
                    </div>
                    <div className="text-[11px] font-bold text-white mt-1">كوب ماء</div>
                  </button>

                  <button
                    type="button"
                    onClick={onCycleQuietMode}
                    className={`${
                      deviceSettings.aquaTouchMode ? 'min-h-[82px]' : 'min-h-[70px]'
                    } rounded-2xl border px-3 py-2.5 text-right cursor-pointer transition-colors ${
                      isMutedState
                        ? 'border-amber-400/50 bg-amber-400/12'
                        : 'border-white/15 bg-zinc-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base">{isMutedState ? '🔇' : '🔊'}</span>
                      {quietRemainingSec > 0 && (
                        <span className="font-mono-tabular text-[10px] text-amber-300">
                          {Math.ceil(quietRemainingSec / 60)}د
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-bold text-white mt-1 truncate">
                      {QUIET_MODE_LABELS[quietMode][language]}
                    </div>
                  </button>
                </div>

                {alarmRinging && (
                  <button
                    type="button"
                    onClick={onDismissTwoWay}
                    className="mt-2.5 w-full py-2.5 px-3 rounded-xl bg-rose-500 text-white text-xs font-bold cursor-pointer hover:bg-rose-600"
                  >
                    🔕 إيقاف الرنين على الهاتف والكمبيوتر
                  </button>
                )}

                {/* Upcoming Events Feed */}
                <div className="mt-3 space-y-2 max-h-[210px] overflow-y-auto pr-1">
                  {blocks
                    .filter((b) => !b.deleted)
                    .slice(0, 4)
                    .map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0A0D12] px-3.5 py-2.5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-lg shrink-0">{b.emojiPair}</span>
                          <div className="min-w-0">
                            {(() => {
                              const raw = b.categoryAr.trim();
                              const ep = b.emojiPair.trim();
                              const rem = raw.startsWith(ep) ? raw.slice(ep.length).trim() : raw;
                              return rem ? (
                                <div className="text-xs font-semibold text-white truncate">{rem}</div>
                              ) : null;
                            })()}
                            <div className="font-mono-tabular text-[10px] text-zinc-500">
                              {formatMinutes12h(b.startMin, language)}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono-tabular text-[11px] text-zinc-400 shrink-0">
                          {b.durationMin}د
                        </span>
                      </div>
                    ))}
                </div>

                {/* Thumb Zone */}
                <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      onLogWaterCup();
                      handleHapticTest('water_cup');
                    }}
                    className={`w-full ${
                      deviceSettings.aquaTouchMode ? 'min-h-[54px]' : 'min-h-[44px]'
                    } rounded-2xl bg-[#7FFFD4] text-black font-bold text-xs flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer transition-all`}
                  >
                    <Droplets className="w-4 h-4" />
                    <span>+1 كوب ماء · {hydrationToday.cupsLogged}/{hydrationToday.targetCups}</span>
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={onOpenCatchUp}
                      className={`${
                        deviceSettings.aquaTouchMode ? 'min-h-[52px]' : 'min-h-[44px]'
                      } rounded-2xl border border-white/15 bg-zinc-900 text-white text-xs font-medium flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:border-[#7FFFD4]/50`}
                    >
                      <Zap className="w-4 h-4 text-[#7FFFD4]" />
                      <span>تدارك</span>
                    </button>
                    <button
                      type="button"
                      onClick={onOpenTravel}
                      className={`${
                        deviceSettings.aquaTouchMode ? 'min-h-[52px]' : 'min-h-[44px]'
                      } rounded-2xl border text-xs font-medium flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                        travelState.active
                          ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                          : 'border-white/15 bg-zinc-900 text-white hover:border-[#7FFFD4]/50'
                      }`}
                    >
                      <Plane className="w-4 h-4 text-[#7FFFD4]" />
                      <span>سفر</span>
                    </button>
                    <button
                      type="button"
                      onClick={onOpenPomodoro}
                      className={`${
                        deviceSettings.aquaTouchMode ? 'min-h-[52px]' : 'min-h-[44px]'
                      } rounded-2xl border border-white/15 bg-zinc-900 text-white text-xs font-medium flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:border-[#7FFFD4]/50`}
                    >
                      <Timer className="w-4 h-4 text-[#7FFFD4]" />
                      <span>بومودورو</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Clean, Practical Controls Only (Zero Bloat) */}
        <div className="lg:col-span-7 space-y-4 text-xs">
          {/* 1. Live Alerts (Lead Time Only — yields silently to ANY active app at OS level) */}
          <div className="rounded-2xl border border-white/15 bg-[#090C10] p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-white">
                <BellRing className="w-4 h-4 text-[#7FFFD4]" />
                <span>كبسولة Live Alerts</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateDeviceSettings({ liveAlertsEnabled: !deviceSettings.liveAlertsEnabled })
                }
                className={`px-3 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                  deviceSettings.liveAlertsEnabled
                    ? 'border-[#4ADE80]/50 bg-[#4ADE80]/15 text-[#4ADE80]'
                    : 'border-white/15 text-zinc-400'
                }`}
              >
                {deviceSettings.liveAlertsEnabled ? 'مفعّلة' : 'متوقفة'}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-zinc-400">الظهور قبل الموعد بـ:</span>
              <div className="grid grid-cols-5 gap-1.5 w-full sm:w-auto">
                {LEAD_MINUTE_OPTIONS.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    disabled={!deviceSettings.liveAlertsEnabled}
                    onClick={() => onUpdateDeviceSettings({ liveAlertsLeadMinutes: mins })}
                    className={`px-3 py-1.5 rounded-lg border font-mono-tabular text-[11px] font-bold cursor-pointer disabled:opacity-40 ${
                      deviceSettings.liveAlertsLeadMinutes === mins
                        ? 'border-[#7FFFD4] bg-[#7FFFD4] text-black'
                        : 'border-white/10 text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    {mins}د
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Aqua Touch + LTPO4 1Hz AND Pocket Protection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/15 bg-[#090C10] p-5 space-y-3">
              <div className="flex items-center gap-2 font-bold text-white">
                <Sparkles className="w-4 h-4 text-[#7FFFD4]" />
                <span>الشاشة واللمس (Aqua Touch · LTPO4)</span>
              </div>

              <div className="space-y-2">
                <div className="rounded-xl border border-white/10 bg-black/50 p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">وضع الوضوء Aqua Touch</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      تكبير أزرار الماء والأذان لأيدٍ مبللة
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateDeviceSettings({ aquaTouchMode: !deviceSettings.aquaTouchMode })
                    }
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold cursor-pointer shrink-0 ${
                      deviceSettings.aquaTouchMode
                        ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/15 text-[#7FFFD4]'
                        : 'border-white/10 text-zinc-400'
                    }`}
                  >
                    {deviceSettings.aquaTouchMode ? 'مفعّل' : 'قياسي'}
                  </button>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/50 p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">شاشة الفجر LTPO4 1Hz</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      خلفية سوداء #000000 على تردد 1Hz
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateDeviceSettings({ ltpoNight1Hz: !deviceSettings.ltpoNight1Hz })
                    }
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold cursor-pointer shrink-0 ${
                      deviceSettings.ltpoNight1Hz
                        ? 'border-[#4ADE80]/50 bg-[#4ADE80]/15 text-[#4ADE80]'
                        : 'border-white/10 text-zinc-400'
                    }`}
                  >
                    {deviceSettings.ltpoNight1Hz ? '1Hz' : '120Hz'}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/15 bg-[#090C10] p-5 space-y-3 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-[#7FFFD4]" />
                    <span>حماية الجيب</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !deviceSettings.pocketProtectionEnabled;
                      onUpdateDeviceSettings({ pocketProtectionEnabled: next });
                      if (!next) setPreviewPocketShield(false);
                    }}
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                      deviceSettings.pocketProtectionEnabled
                        ? 'border-[#4ADE80]/50 bg-[#4ADE80]/15 text-[#4ADE80]'
                        : 'border-white/10 text-zinc-400'
                    }`}
                  >
                    {deviceSettings.pocketProtectionEnabled ? 'مفعّلة' : 'متوقفة'}
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  يمنع اللمس العرضي ويؤجل التنبيهات البصرية داخل الجيب مع استمرار الأذان والاهتزاز.
                </p>
              </div>

              <button
                type="button"
                disabled={!deviceSettings.pocketProtectionEnabled}
                onClick={() => {
                  setShowNightWakeScreen(false);
                  setPreviewPocketShield((v) => !v);
                }}
                className={`w-full py-2 rounded-xl border text-[11px] font-semibold cursor-pointer disabled:opacity-40 ${
                  pocketShieldVisible
                    ? 'border-[#7FFFD4] bg-[#7FFFD4] text-black font-bold'
                    : 'border-white/15 bg-black/50 text-zinc-200 hover:border-[#7FFFD4]/40'
                }`}
              >
                {pocketShieldVisible ? 'إغلاق معاينة الجيب' : 'معاينة شاشة حماية الجيب'}
              </button>
            </div>
          </div>

          {/* 3. Bypass Charging + Optional Side Alert Slider */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/15 bg-[#090C10] p-4 space-y-2.5">
              <div className="font-bold text-white flex items-center gap-2">
                <BatteryCharging className="w-4 h-4 text-sky-400" />
                <span>الشحن التجاوزي (Bypass Charging)</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                يمنع إنذار الـ 90% المتكرر عند تثبيت الشحن أثناء العمل أو اللعب.
              </p>
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {([null, 80, 90] as const).map((lim) => (
                  <button
                    key={String(lim)}
                    type="button"
                    onClick={() => onToggleBypassCharging(lim)}
                    className={`py-1.5 rounded-lg text-[11px] cursor-pointer border ${
                      batteryGuard.bypassChargingLimitPct === lim
                        ? 'border-sky-400 bg-sky-400/20 text-white font-bold'
                        : 'border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {lim === null ? 'عادي' : `تثبيت ${lim}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#090C10] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-zinc-400" />
                  <span className="font-bold text-white">Alert Slider (اختياري)</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateDeviceSettings({
                      alertSliderLinked: !deviceSettings.alertSliderLinked,
                    })
                  }
                  className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                    deviceSettings.alertSliderLinked
                      ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/15 text-[#7FFFD4]'
                      : 'border-white/15 bg-black/50 text-zinc-400'
                  }`}
                >
                  {deviceSettings.alertSliderLinked ? 'مربوط' : 'مستقل'}
                </button>
              </div>

              {deviceSettings.alertSliderLinked ? (
                <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-black border border-white/10">
                  {(
                    [
                      { label: 'صامت', mode: 'silent_all', mins: 30 },
                      { label: 'اهتزاز', mode: 'vibrate_only', mins: 30 },
                      { label: 'رنين', mode: 'normal', mins: 0 },
                    ] as const
                  ).map((pos) => {
                    const isSelected =
                      pos.mode === quietMode ||
                      (pos.mode === 'vibrate_only' && quietMode === 'mute_audio');
                    return (
                      <button
                        key={pos.mode}
                        type="button"
                        onClick={() => onSetQuietMode(pos.mode, pos.mins)}
                        className={`py-1.5 rounded-md text-[10px] font-medium cursor-pointer ${
                          isSelected
                            ? 'bg-[#7FFFD4] text-black font-bold'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {pos.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  يعمل المفتاح بحريته المستقلة ولا يغيّر أوضاع الهدوء داخل التطبيق إلا عند التفعيل.
                </p>
              )}
            </div>
          </div>

          {/* 4. X-Axis Haptics + Background Permissions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/15 bg-[#090C10] p-4 space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-white">
                <Vibrate className="w-4 h-4 text-[#7FFFD4]" />
                <span>أنماط الاهتزاز X-Axis</span>
              </div>
              <div className="space-y-1.5">
                {(['wake_fajr', 'pomodoro', 'water_cup'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => handleHapticTest(kind)}
                    className="w-full rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-right text-[11px] text-zinc-200 hover:border-[#7FFFD4]/50 flex items-center justify-between cursor-pointer"
                  >
                    <span>{HAPTIC_WAVEFORMS[kind].labelAr}</span>
                    <span className="text-[10px] text-[#7FFFD4]">تجربة</span>
                  </button>
                ))}
              </div>
              {lastHapticNote && (
                <div className="text-[10px] text-[#4ADE80]">✓ {lastHapticNote}</div>
              )}
            </div>

            <div className="rounded-2xl border border-white/15 bg-[#090C10] p-4 space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-white">
                <ShieldCheck className="w-4 h-4 text-[#4ADE80]" />
                <span>صلاحيات العمل في الخلفية</span>
              </div>
              <div className="space-y-1.5">
                {PERMISSION_STEPS.map((step) => {
                  const ok = permState[step.id];
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() =>
                        setPermState((p) => ({ ...p, [step.id]: !p[step.id] }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-right text-[11px] flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="text-zinc-200">{step.labelAr}</span>
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 ${
                          ok ? 'text-[#4ADE80]' : 'text-zinc-600'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
