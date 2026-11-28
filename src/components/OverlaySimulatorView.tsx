import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BellRing,
  BatteryCharging,
  Columns2,
  Power,
  Rows2,
  Volume2,
  VolumeX,
  PictureInPicture2,
  Cloud,
} from 'lucide-react';
import {
  BatteryGuardState,
  CapsuleOrientation,
  CapsuleSize,
  GeoLocation,
  PhoneBatteryTelemetry,
  QuietModeType,
  ScheduleBlock,
} from '../types/dayrhythm';
import { QUIET_MODE_LABELS } from '../engines/i18n';
import { CapsulePrefs } from './FloatingPiPCapsule';

import { formatEtaAr, type OverlaySimulatorViewProps } from './overlay/types';
import { CapsuleSettingsCard } from './overlay/CapsuleSettingsCard';
import { BatteryTelemetryCard } from './overlay/BatteryTelemetryCard';

export const OverlaySimulatorView: React.FC<OverlaySimulatorViewProps> = ({
  quietMode,
  stealthAudioOnly,
  onToggleStealthAudioOnly,
  alarmRinging,
  onTriggerRing,
  onDismissTwoWay,
  phoneBattery,
  onChangeChargeLimit,
  capsulePrefs = { orientation: 'horizontal', size: 'md' },
  onChangeCapsulePrefs,
  activeLocation,
  firestoreSynced = false,
}) => {
  const webviewBridge =
    typeof window !== 'undefined'
      ? (window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } })
          .chrome?.webview
      : undefined;
  const isNativeWindowsExe = Boolean(webviewBridge?.postMessage);
  const [winAutoLaunch, setWinAutoLaunch] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return (window as Window & { __drWinAutoLaunch?: boolean }).__drWinAutoLaunch ?? true;
  });

  useEffect(() => {
    if (!isNativeWindowsExe) return;
    const onWinPrefs = (ev: Event) => {
      const detail = (ev as CustomEvent<{ autoLaunch?: boolean }>).detail;
      if (typeof detail?.autoLaunch === 'boolean') {
        setWinAutoLaunch(detail.autoLaunch);
      }
    };
    window.addEventListener('dayrhythm:win-prefs', onWinPrefs);
    try {
      webviewBridge?.postMessage?.('get-win-prefs');
    } catch {
      // ignore
    }
    return () => window.removeEventListener('dayrhythm:win-prefs', onWinPrefs);
  }, [isNativeWindowsExe, webviewBridge]);

  const batteryFresh = Boolean(
    phoneBattery && Date.now() - phoneBattery.updatedAtMs < 45 * 60_000
  );
  const batteryEtaLabel =
    batteryFresh && phoneBattery?.charging
      ? formatEtaAr(phoneBattery.chargeTimeRemainingMin)
      : '';
  const batteryAtLimit = Boolean(
    batteryFresh &&
      phoneBattery?.charging &&
      phoneBattery.levelPct >= phoneBattery.chargeLimitPct
  );

  const updateCapsule = (patch: Partial<CapsulePrefs>) => {
    onChangeCapsulePrefs?.({
      orientation: (patch.orientation ?? capsulePrefs.orientation) as CapsuleOrientation,
      size: (patch.size ?? capsulePrefs.size) as CapsuleSize,
    });
  };

  return (
    <div className="mx-auto max-w-[1040px] px-4 sm:px-6 py-6 space-y-5">
      {/* Clean Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <h1 className="text-lg font-bold text-white">وضع الكمبيوتر</h1>
          <p className="text-xs text-zinc-400 mt-1">
            التحكم المباشر في كبسولة سطح المكتب، بطارية الهاتف، والتزامن اللحظي للتنبيهات
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Cloud
            className={`w-4 h-4 ${firestoreSynced ? 'text-[#7FFFD4]' : 'text-zinc-500'}`}
          />
          <span>
            {firestoreSynced
              ? 'مزامنة سحابية لحظية مع الهاتف (تعمل على أي شبكة)'
              : 'سجّل الدخول بحساب Google لتفعيل المزامنة اللحظية'}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <CapsuleSettingsCard
        isNativeWindowsExe={isNativeWindowsExe}
        webviewBridge={webviewBridge}
        capsulePrefs={capsulePrefs}
        updateCapsule={updateCapsule}
      />
      <BatteryTelemetryCard
        phoneBattery={phoneBattery}
        batteryFresh={batteryFresh}
        batteryAtLimit={batteryAtLimit}
        batteryEtaLabel={batteryEtaLabel}
        onChangeChargeLimit={onChangeChargeLimit}
      />
        {/* Card 3: Alerts & Cross-Device Instant Sync */}
        <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-4 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <BellRing className="w-4 h-4 text-[#7FFFD4]" />
              <span>التنبيهات والإيقاف المتزامن</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              عند إغلاق أو تأجيل أي تنبيه من الكمبيوتر أو الهاتف يتوقف تلقائياً على الجهاز الآخر فوراً (حتى على شبكتين مختلفتين)
            </p>
          </div>

          {/* Stealth Audio-Only Mode */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] px-3.5 py-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                {stealthAudioOnly ? (
                  <Volume2 className="w-3.5 h-3.5 text-[#7FFFD4]" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
                )}
                <span>وضع الصوت فقط (بدون نافذة منبثقة)</span>
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                مفيد أثناء الاجتماعات أو مشاركة الشاشة
              </div>
            </div>
            <button
              type="button"
              aria-pressed={stealthAudioOnly}
              onClick={onToggleStealthAudioOnly}
              className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                stealthAudioOnly
                  ? 'bg-[#7FFFD4] text-black'
                  : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
              }`}
            >
              {stealthAudioOnly ? 'مفعّل' : 'متوقف'}
            </button>
          </div>

          {isNativeWindowsExe && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] px-3.5 py-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Power className={`w-3.5 h-3.5 ${winAutoLaunch ? 'text-[#7FFFD4]' : 'text-zinc-400'}`} />
                  <span>التشغيل تلقائياً مع ويندوز</span>
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  يبدأ مصغّراً في شريط النظام لتبقى الكبسولة والتنبيهات 24/7
                </div>
              </div>
              <button
                type="button"
                aria-pressed={winAutoLaunch}
                onClick={() => {
                  const next = !winAutoLaunch;
                  setWinAutoLaunch(next);
                  try {
                    webviewBridge?.postMessage?.(
                      JSON.stringify({ type: 'set-auto-launch', enabled: next })
                    );
                  } catch {
                    // ignore
                  }
                }}
                className={`min-h-[44px] px-3.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                  winAutoLaunch
                    ? 'bg-[#7FFFD4] text-black'
                    : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
                }`}
              >
                {winAutoLaunch ? 'مفعّل' : 'متوقف'}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-xs text-zinc-400 px-1">
            <span>وضع الاجتماع الحالي</span>
            <span className="font-semibold text-zinc-200">{QUIET_MODE_LABELS[quietMode].ar}</span>
          </div>

          <div className="pt-3 border-t border-white/[0.06] flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onTriggerRing}
              className="flex-1 min-h-[44px] px-3 rounded-xl border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 text-[#7FFFD4] hover:bg-[#7FFFD4]/20 text-xs font-bold transition-colors cursor-pointer"
            >
              اختبار التنبيه المتزامن
            </button>
            <AnimatePresence>
              {alarmRinging && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                  type="button"
                  onClick={onDismissTwoWay}
                  className="flex-1 min-h-[44px] px-3 rounded-xl bg-[#4ADE80] text-black hover:bg-emerald-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  إيقاف على الجهازين الآن
                </motion.button>
              )}
            </AnimatePresence>
          </div>

        </section>

      </div>
    </div>
  );
};

