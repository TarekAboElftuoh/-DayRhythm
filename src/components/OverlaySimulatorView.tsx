import React, { useState } from 'react';
import {
  Monitor,
  Volume2,
  BellRing,
  Clock,
  BatteryCharging,
  Unplug,
  Power,
  Lock,
} from 'lucide-react';
import { BatteryGuardState, QuietModeType, ScheduleBlock } from '../types/dayrhythm';
import { formatMinutes12h } from '../engines/prayerEngine';
import { QUIET_MODE_LABELS } from '../engines/i18n';

interface OverlaySimulatorViewProps {
  blocks: ScheduleBlock[];
  batteryGuard: BatteryGuardState;
  quietMode: QuietModeType;
  stealthAudioOnly: boolean;
  onToggleStealthAudioOnly: () => void;
  alarmRinging: boolean;
  onTriggerRing: () => void;
  onDismissTwoWay: () => void;
  onSimulateCharge90: () => void;
  onSimulatePowerDisconnect: () => void;
  onSimulateWindowsWake: () => string;
}

type DisplayMode = 'dual_monitor' | 'single_corner' | 'audio_only';

export const OverlaySimulatorView: React.FC<OverlaySimulatorViewProps> = ({
  blocks,
  batteryGuard,
  quietMode,
  stealthAudioOnly,
  onToggleStealthAudioOnly,
  alarmRinging,
  onTriggerRing,
  onDismissTwoWay,
  onSimulateCharge90,
  onSimulatePowerDisconnect,
  onSimulateWindowsWake,
}) => {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('dual_monitor');
  const [snoozedMsg, setSnoozedMsg] = useState<string>('');
  const [ipcStatus, setIpcStatus] = useState<string>(
    'QLocalServer Lock Active (PID Single-Instance)'
  );
  const [wakeLog, setWakeLog] = useState<string>('');

  const sampleAlarm =
    blocks.find((b) => b.isAnchor && !b.deleted) ?? blocks[0];

  const effectiveMode: DisplayMode = stealthAudioOnly ? 'audio_only' : displayMode;
  const pcMutedByQuiet = quietMode === 'vibrate_only' || quietMode === 'silent_all';

  return (
    <div className="mx-auto max-w-[1380px] px-4 sm:px-6 py-6 space-y-6">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h1 className="text-lg font-bold text-white">
            بيئة سطح المكتب المتقدمة ومنبه الشاشة المزدوجة (PySide6)
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            التعافي من السكون (WM_POWERBROADCAST) · قفل النسخة الواحدة (QLocalServer) · وضع الصوت فقط · إيقاف متزامن في الاتجاهين عبر WebSocket
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/10">
            {(
              [
                { id: 'dual_monitor', label: 'شاشتان (توجيه للثانوية)' },
                { id: 'single_corner', label: 'شاشة واحدة (بطاقة زاوية)' },
                { id: 'audio_only', label: 'صوتي فقط' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setDisplayMode(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                  effectiveMode === m.id
                    ? 'bg-[#7FFFD4] text-black font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleStealthAudioOnly}
            className={`px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
              stealthAudioOnly
                ? 'border-sky-400 bg-sky-400/15 text-sky-300'
                : 'border-white/15 bg-white/[0.03] text-zinc-300'
            }`}
          >
            🔇 وضع الصوت فقط (كتم النوافذ)
          </button>

          <button
            type="button"
            onClick={() => {
              const msg = onSimulateWindowsWake();
              setWakeLog(msg);
            }}
            className="px-3 py-2 rounded-xl border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[#7FFFD4] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Power className="w-3.5 h-3.5" /> محاكاة Wake من Sleep
          </button>

          <button
            type="button"
            onClick={() =>
              setIpcStatus(
                `QLocalServer: تم منع تشغيل نسخة مكررة وتنشيط النافذة الأصلية (${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })}) ✓`
              )
            }
            className="px-3 py-2 rounded-xl border border-white/15 bg-white/[0.03] text-zinc-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5 text-[#7FFFD4]" /> اختبار قفل النسخة الواحدة
          </button>

          <button
            type="button"
            onClick={onSimulateCharge90}
            className="px-3 py-2 rounded-xl border border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#4ADE80] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <BatteryCharging className="w-3.5 h-3.5" /> شحن 90%
          </button>

          <button
            type="button"
            onClick={onSimulatePowerDisconnect}
            className="px-3 py-2 rounded-xl border border-amber-400/40 bg-amber-400/10 text-amber-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Unplug className="w-3.5 h-3.5" /> فصل الشاحن
          </button>

          <button
            type="button"
            onClick={() => {
              setSnoozedMsg('');
              onTriggerRing();
            }}
            className="px-4 py-2 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-[#66eec2]"
          >
            <BellRing className="w-3.5 h-3.5" /> إطلاق رنين متزامن
          </button>
        </div>
      </div>

      {/* Windows System Telemetry Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl border border-white/10 bg-[#080B10] px-4 py-3 text-zinc-300">
          <div className="text-[11px] text-zinc-500">حارس النسخة الواحدة (Single-Instance IPC)</div>
          <div className="font-mono-tabular text-[#7FFFD4] mt-1">{ipcStatus}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#080B10] px-4 py-3 text-zinc-300">
          <div className="text-[11px] text-zinc-500">إشارة نواة ويندوز (WM_POWERBROADCAST)</div>
          <div className="font-mono-tabular text-[#4ADE80] mt-1">
            {wakeLog || 'PBT_APMRESUMEAUTOMATIC Listener: Ready'}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#080B10] px-4 py-3 text-zinc-300">
          <div className="text-[11px] text-zinc-500">وضع الهدوء المتزامن للكمبيوتر</div>
          <div className="font-semibold text-white mt-1">
            {QUIET_MODE_LABELS[quietMode].ar}
            {pcMutedByQuiet && ' (الكمبيوتر صامت تماماً)'}
          </div>
        </div>
      </div>

      {/* Monitors Simulation Canvas */}
      <div
        className={`grid gap-6 ${
          effectiveMode === 'dual_monitor' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {/* Primary Monitor */}
        <div className="rounded-2xl border border-white/15 bg-[#080A0E] p-5 min-h-[340px] relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-2 font-semibold text-zinc-200">
              <Monitor className="w-4 h-4 text-[#7FFFD4]" />
              الشاشة الرئيسية (Display 1 · 1920×1080)
            </span>
            <span>مساحة العمل النشطة (غير مقاطعة)</span>
          </div>

          <div className="my-6 rounded-xl border border-white/10 bg-black/60 p-4 text-xs text-zinc-400 space-y-2">
            <div className="text-zinc-200 font-semibold">حالة حارس الشحن المرتبط عبر LAN :48721</div>
            <div>
              {batteryGuard.pcAlertActive
                ? '⚡ تنبيه بطارية الهاتف 90% نشط على الشاشة الثانوية — بمجرد فصل الكابل من الهاتف يُكتم الصوت وتُغلق البطاقة في التو واللحظة.'
                : batteryGuard.autoSilencedByDisconnect
                  ? '✓ تم استلام ACTION_POWER_DISCONNECTED عبر الشبكة وإلغاء التنبيه وكتم الصوت وإغلاق البطاقة تلقائياً دون لمس الماوس أو لوحة المفاتيح.'
                  : 'استخدم أزرار المحاكاة بالأعلى لاختبار تنبيه الشحن 90% ثم فصله تلقائياً، أو الإيقاف المتزامن بين الهاتف والكمبيوتر.'}
            </div>
          </div>

          {effectiveMode === 'single_corner' && alarmRinging && !pcMutedByQuiet && (
            <div className="self-end w-full max-w-[360px] rounded-2xl border border-[#7FFFD4] bg-black/95 p-4 shadow-2xl animate-alarm-shake">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{sampleAlarm?.emojiPair}</span>
                <span className="font-mono-tabular text-xs font-bold text-[#7FFFD4]">
                  {sampleAlarm ? formatMinutes12h(sampleAlarm.startMin) : ''}
                </span>
              </div>
              {(() => {
                if (!sampleAlarm) return null;
                const raw = sampleAlarm.categoryAr.trim();
                const ep = sampleAlarm.emojiPair.trim();
                const rem = raw.startsWith(ep) ? raw.slice(ep.length).trim() : raw;
                return rem ? <div className="text-sm font-bold text-white mt-2">{rem}</div> : null;
              })()}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onDismissTwoWay}
                  className="flex-1 py-2 rounded-lg bg-[#7FFFD4] text-black text-xs font-bold cursor-pointer"
                >
                  إيقاف (يسكت الموبايل أيضاً)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDismissTwoWay();
                    setSnoozedMsg('تم التأجيل 5 دقائق');
                  }}
                  className="px-3 py-2 rounded-lg border border-white/15 text-xs text-zinc-300 cursor-pointer"
                >
                  غفوة 5د
                </button>
              </div>
            </div>
          )}

          {effectiveMode === 'audio_only' && (
            <div className="self-end rounded-xl border border-[#7FFFD4]/40 bg-black px-4 py-2.5 text-xs text-[#7FFFD4] flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              <span>
                وضع الصوت فقط (Stealth Mode): كتم النوافذ المنبثقة بالكامل لحماية الألعاب/الأفلام مع بقاء النغمات الصوتية فقط
              </span>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Windows 11 Taskbar · Always-on-Top PiP Capsule Active</span>
            <span className="font-mono-tabular">
              Tray: DayRhythm · WebSocket :48721 · UDP :48722
            </span>
          </div>
        </div>

        {/* Secondary Monitor */}
        {effectiveMode === 'dual_monitor' && (
          <div className="rounded-2xl border border-white/15 bg-black p-5 min-h-[340px] flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-2 font-semibold text-zinc-200">
                <Monitor className="w-4 h-4 text-[#4ADE80]" />
                الشاشة الثانوية (Display 2 · المستهدفة للتنبيه)
              </span>
              <span className="font-mono-tabular">
                True Two-Way WebSocket Dismiss
              </span>
            </div>

            {batteryGuard.pcAlertActive && (
              <div className="rounded-2xl border-2 border-[#4ADE80] bg-[#07120B] p-4 flex items-center justify-between gap-3 animate-alarm-pulse">
                <div className="flex items-center gap-3">
                  <BatteryCharging className="w-7 h-7 text-[#4ADE80]" />
                  <div>
                    <div className="text-sm font-bold text-white">
                      ⚡ بطارية OnePlus 12R وصلت إلى {batteryGuard.levelPct}%
                    </div>
                    <div className="text-xs text-[#4ADE80]">
                      افصل كابل الشاحن من الهاتف الآن — سيتم كتم التنبيه وإغلاق هذه البطاقة تلقائياً
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSimulatePowerDisconnect}
                  className="px-3 py-2 rounded-xl bg-[#4ADE80] text-black text-xs font-bold cursor-pointer shrink-0"
                >
                  محاكاة فصل الكابل
                </button>
              </div>
            )}

            {alarmRinging && !pcMutedByQuiet ? (
              <div className="my-auto mx-auto w-full max-w-md rounded-3xl border-2 border-[#7FFFD4] bg-[#070A0E] p-7 text-center animate-alarm-shake animate-alarm-pulse">
                <div className="text-5xl mb-3">{sampleAlarm?.emojiPair}</div>
                {(() => {
                  if (!sampleAlarm) return null;
                  const raw = sampleAlarm.categoryAr.trim();
                  const ep = sampleAlarm.emojiPair.trim();
                  const rem = raw.startsWith(ep) ? raw.slice(ep.length).trim() : raw;
                  return rem ? <div className="text-xl font-bold text-white">{rem}</div> : null;
                })()}
                <div className="font-mono-tabular text-sm text-[#7FFFD4] mt-1">
                  {sampleAlarm ? formatMinutes12h(sampleAlarm.startMin) : ''} · -3 د قبل الأذان
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={onDismissTwoWay}
                    className="flex-1 py-3 rounded-xl bg-[#7FFFD4] text-black text-sm font-bold hover:bg-[#66eec2] cursor-pointer"
                  >
                    إيقاف (يسكت الموبايل فوراً)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDismissTwoWay();
                      setSnoozedMsg('تم تأجيل المنبه 5 دقائق وإبلاغ الموبايل عبر LAN');
                    }}
                    className="px-4 py-3 rounded-xl border border-white/20 bg-white/5 text-white text-xs font-semibold hover:bg-white/10 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Clock className="w-4 h-4" /> غفوة 5د
                  </button>
                </div>
              </div>
            ) : (
              <div className="my-auto text-center space-y-2">
                <div className="text-sm font-semibold text-zinc-300">
                  {pcMutedByQuiet
                    ? `الكمبيوتر صامت حالياً (${QUIET_MODE_LABELS[quietMode].ar})`
                    : snoozedMsg || 'تم إيقاف المنبه بنجاح ومزامنة الإيقاف مع الموبايل عبر WebSocket ✓'}
                </div>
                {!pcMutedByQuiet && (
                  <button
                    type="button"
                    onClick={onTriggerRing}
                    className="text-xs text-[#7FFFD4] hover:underline cursor-pointer"
                  >
                    إعادة إطلاق رنين متزامن
                  </button>
                )}
              </div>
            )}

            <div className="text-[11px] text-zinc-500 text-center">
              تجاوز تلقائي لإيقاظ ويندوز عبر WM_POWERBROADCAST / PBT_APMRESUMEAUTOMATIC
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
