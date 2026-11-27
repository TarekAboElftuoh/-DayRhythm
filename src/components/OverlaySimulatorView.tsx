import React from 'react';
import {
  BellRing,
  BatteryCharging,
  Columns2,
  Rows2,
  Volume2,
  VolumeX,
  PictureInPicture2,
  MapPin,
  Cloud,
  CheckCircle2,
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

interface OverlaySimulatorViewProps {
  blocks: ScheduleBlock[];
  batteryGuard: BatteryGuardState;
  quietMode: QuietModeType;
  stealthAudioOnly: boolean;
  onToggleStealthAudioOnly: () => void;
  alarmRinging: boolean;
  onTriggerRing: () => void;
  onDismissTwoWay: () => void;
  onSimulateCharge90?: () => void;
  onSimulatePowerDisconnect?: () => void;
  onSimulateWindowsWake?: () => string;
  phoneBattery?: PhoneBatteryTelemetry | null;
  onChangeChargeLimit?: (limitPct: number) => void;
  capsulePrefs?: CapsulePrefs;
  onChangeCapsulePrefs?: (next: CapsulePrefs) => void;
  activeLocation?: GeoLocation;
  firestoreSynced?: boolean;
}

function formatEtaAr(etaMin?: number): string {
  if (typeof etaMin !== 'number' || !Number.isFinite(etaMin) || etaMin < 0) return '';
  if (etaMin === 0) return 'مكتمل الشحن';
  if (etaMin >= 60) {
    const h = Math.floor(etaMin / 60);
    const m = etaMin % 60;
    return m > 0 ? `متبقي ~${h} س و ${m} د` : `متبقي ~${h} ساعة`;
  }
  return `متبقي ~${etaMin} دقيقة`;
}

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
    <div className="mx-auto max-w-[1040px] px-4 sm:px-6 py-6 space-y-6">
      {/* Clean Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Desktop Capsule Shape & Size */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#0B0E14] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white">كبسولة سطح المكتب</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                تعرض الإيموجي والعدّاد التنازلي للمهمة والماء بوضوح بدون إزعاج
              </p>
            </div>
            {isNativeWindowsExe && (
              <button
                type="button"
                onClick={() => {
                  try {
                    webviewBridge?.postMessage?.(JSON.stringify({ type: 'show-native-capsule' }));
                  } catch {
                    // ignore
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <PictureInPicture2 className="w-3.5 h-3.5" />
                <span>إظهار الآن</span>
              </button>
            )}
          </div>

          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <div className="text-xs text-zinc-400">الاتجاه</div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/50 border border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => updateCapsule({ orientation: 'horizontal' })}
                  className={`min-h-[38px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    capsulePrefs.orientation === 'horizontal'
                      ? 'bg-[#7FFFD4] text-black'
                      : 'text-zinc-300 hover:bg-white/[0.05]'
                  }`}
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  <span>عرضي (أفقي)</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateCapsule({ orientation: 'vertical' })}
                  className={`min-h-[38px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    capsulePrefs.orientation === 'vertical'
                      ? 'bg-[#7FFFD4] text-black'
                      : 'text-zinc-300 hover:bg-white/[0.05]'
                  }`}
                >
                  <Rows2 className="w-3.5 h-3.5" />
                  <span>طولي (رأسي)</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-zinc-400">الحجم</div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/50 border border-white/[0.07]">
                {(
                  [
                    { id: 'sm', label: 'صغير' },
                    { id: 'md', label: 'متوسط' },
                    { id: 'lg', label: 'كبير' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateCapsule({ size: opt.id })}
                    className={`min-h-[36px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      capsulePrefs.size === opt.id
                        ? 'bg-[#7FFFD4] text-black'
                        : 'text-zinc-300 hover:bg-white/[0.05]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Card 2: Live Phone Battery & Charging ETA */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#0B0E14] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <BatteryCharging
                  className={`w-4 h-4 ${
                    batteryAtLimit
                      ? 'text-[#4ADE80]'
                      : batteryFresh && phoneBattery?.charging
                        ? 'text-amber-300'
                        : 'text-zinc-400'
                  }`}
                />
                <span>بطارية الهاتف المباشرة</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {phoneBattery?.deviceLabel
                  ? `متصل مع ${phoneBattery.deviceLabel}`
                  : 'تظهر النسبة ووقت الشحن المتبقي تلقائياً عند توصيل الهاتف بالشاحن'}
              </p>
            </div>
            {batteryFresh && phoneBattery && (
              <div className="text-left">
                <div
                  className={`font-digits text-2xl font-extrabold leading-none ${
                    batteryAtLimit
                      ? 'text-[#4ADE80]'
                      : phoneBattery.charging
                        ? 'text-amber-300'
                        : 'text-white'
                  }`}
                >
                  {phoneBattery.levelPct}%
                </div>
                <div className="text-[11px] text-zinc-400 mt-1">
                  {phoneBattery.charging
                    ? batteryEtaLabel || 'قيد الشحن الآن'
                    : 'غير موصول بالشاحن'}
                </div>
              </div>
            )}
          </div>

          {batteryFresh && phoneBattery ? (
            <div className="space-y-3">
              <div className="h-2 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    batteryAtLimit
                      ? 'bg-[#4ADE80]'
                      : phoneBattery.charging
                        ? 'bg-amber-400'
                        : 'bg-[#7FFFD4]'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, phoneBattery.levelPct))}%` }}
                />
              </div>

              {batteryAtLimit && (
                <div className="rounded-xl border border-[#4ADE80]/30 bg-[#4ADE80]/10 px-3 py-2 text-xs text-[#4ADE80] font-semibold">
                  وصل الهاتف إلى الحد المحدد ({phoneBattery.chargeLimitPct}%) — يمكنك فصله من الشاحن.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-black/40 px-3.5 py-3 text-xs text-zinc-400 leading-relaxed">
              افتح التطبيق على هاتفك مرة واحدة بحساب Google نفسه — وستصل نسبة الشحن والوقت المتبقي هنا وفي الكبسولة تلقائياً.
            </div>
          )}

          {onChangeChargeLimit && (
            <div className="space-y-1.5 pt-1 border-t border-white/[0.07]">
              <div className="text-xs text-zinc-400">تنبيه اكتمال الشحن عند</div>
              <div className="grid grid-cols-4 gap-1.5">
                {[80, 85, 90, 95].map((pct) => {
                  const active = (phoneBattery?.chargeLimitPct ?? 90) === pct;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => onChangeChargeLimit(pct)}
                      className={`min-h-[34px] rounded-lg font-digits text-xs font-bold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#7FFFD4] text-black'
                          : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]'
                      }`}
                    >
                      {pct}%
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Card 3: Alerts & Cross-Device Instant Sync */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#0B0E14] p-5 space-y-4">
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
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/40 px-3.5 py-3">
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
              className={`min-h-[42px] px-3.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                stealthAudioOnly
                  ? 'bg-[#7FFFD4] text-black'
                  : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
              }`}
            >
              {stealthAudioOnly ? 'مفعّل' : 'متوقف'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-zinc-400 px-1">
            <span>وضع الاجتماع الحالي</span>
            <span className="font-semibold text-zinc-200">{QUIET_MODE_LABELS[quietMode].ar}</span>
          </div>

          <div className="pt-2 border-t border-white/[0.07] flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onTriggerRing}
              className="flex-1 min-h-[42px] px-3 rounded-xl border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 text-[#7FFFD4] hover:bg-[#7FFFD4]/20 text-xs font-bold transition-colors cursor-pointer"
            >
              اختبار التنبيه المتزامن
            </button>
            {alarmRinging && (
              <button
                type="button"
                onClick={onDismissTwoWay}
                className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#4ADE80] text-black hover:bg-emerald-300 text-xs font-bold transition-colors cursor-pointer"
              >
                إيقاف على الجهازين الآن
              </button>
            )}
          </div>

        </section>

      </div>
    </div>
  );
};
