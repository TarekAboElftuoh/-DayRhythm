import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Check, Clock, Droplets, Pill, X } from 'lucide-react';
import { hasPlayedAlertId, playTaskSignature, unlockAudioContext } from '../engines/audioEngine';
import { SoundRepeatSetting, TaskSoundCategory } from '../types/dayrhythm';

export interface PersistentAlertItem {
  id: string;
  emoji: string;
  title: string;
  description?: string;
  sourceLabel: string;
  time12h: string;
  category: TaskSoundCategory;
  createdAtMs: number;
  durationMs: number;
  isContinuous?: boolean;
  repeatCount?: SoundRepeatSetting;
  queuedCount?: number;
  isHydration?: boolean;
  medicationId?: string;
  medicationDoseTime24?: string;
  taskId?: string;
  taskListId?: string;
  blockId?: string;
  occurrenceKey?: string;
}

interface PersistentAlertOverlayProps {
  alert: PersistentAlertItem | null;
  defaultSnoozeMinutes?: number;
  allowVibration?: boolean;
  onDismiss: () => void;
  onAutoSnooze?: (alert: PersistentAlertItem, minutes: number) => void;
  onConfirmWater?: () => void;
  onConfirmMedication?: (medicationId: string, doseTime24?: string) => void;
  onCompleteTask?: (taskId: string, taskListId: string) => void;
  onSnoozeAlert?: (alert: PersistentAlertItem, minutes: number) => void;
}

export const PersistentAlertOverlay: React.FC<PersistentAlertOverlayProps> = ({
  alert,
  defaultSnoozeMinutes = 5,
  allowVibration = true,
  onDismiss,
  onAutoSnooze,
  onConfirmWater,
  onConfirmMedication,
  onCompleteTask,
  onSnoozeAlert,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const snoozeMin = defaultSnoozeMinutes === 10 || defaultSnoozeMinutes === 15 ? defaultSnoozeMinutes : 5;
  const lastVibratedAlertIdRef = useRef<string | null>(null);
  const lastSoundAlertIdRef = useRef<string | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const onAutoSnoozeRef = useRef(onAutoSnooze);
  onAutoSnoozeRef.current = onAutoSnooze;

  useEffect(() => {
    if (!alert) {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(0);
        } catch {
          // ignore
        }
      }
      return;
    }
    setNowMs(Date.now());

    // Only vibrate ONCE per new alert ID, and ONLY if NOT running in Android native APK
    // (Android native APK already uses hardware Vibrator on STREAM_ALARM channel)
    const isAndroidNative =
      typeof window !== 'undefined' &&
      Boolean((window as Window & { DayRhythmNative?: unknown }).DayRhythmNative);
    const isMobileUa =
      typeof navigator !== 'undefined' &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (!isAndroidNative && !isMobileUa && lastSoundAlertIdRef.current !== alert.id) {
      lastSoundAlertIdRef.current = alert.id;
      if (!alert.id.startsWith('charge_') && !hasPlayedAlertId(alert.id)) {
        unlockAudioContext();
        playTaskSignature(alert.category, {
          bypassSanctuary: true,
          repeatCount: alert.isContinuous ? 'continuous' : 1,
          alertId: alert.id,
        });
      }
    }

    if (allowVibration && !isAndroidNative && lastVibratedAlertIdRef.current !== alert.id) {
      lastVibratedAlertIdRef.current = alert.id;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([0, 180, 90, 260, 90, 180]);
        } catch {
          // ignore vibrate errors
        }
      }
    }

    const id = window.setInterval(() => {
      const t = Date.now();
      setNowMs(t);
      if (alert.id.startsWith('charge_') && t - alert.createdAtMs >= alert.durationMs) {
        onDismissRef.current();
      }
    }, 1000);

    return () => {
      window.clearInterval(id);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(0);
        } catch {
          // ignore
        }
      }
    };
  }, [alert?.id, alert?.createdAtMs, alert?.durationMs, alert?.isContinuous]);

  if (!alert) return null;

  const elapsedMs = Math.max(0, nowMs - alert.createdAtMs);
  const remainingSec = Math.max(0, Math.ceil((alert.durationMs - elapsedMs) / 1000));
  const progressPct = alert.isContinuous
    ? 100
    : Math.max(0, Math.min(100, ((alert.durationMs - elapsedMs) / alert.durationMs) * 100));
  const remMin = Math.floor(remainingSec / 60);
  const remSec = remainingSec % 60;
  const remFormatted = `${String(remMin).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;

  const isWater = alert.category === 'water' || Boolean(alert.isHydration);

  const accentBorder =
    isWater
      ? 'border-sky-400/75 shadow-[0_0_24px_rgba(56,189,248,0.24)]'
      : alert.category === 'medication'
        ? 'border-rose-400/75 shadow-[0_0_24px_rgba(251,113,133,0.24)]'
        : 'border-[#7FFFD4]/80 shadow-[0_0_26px_rgba(127,255,212,0.24)]';

  const barColor =
    isWater
      ? 'bg-sky-400'
      : alert.category === 'medication'
        ? 'bg-rose-400'
        : 'bg-[#7FFFD4]';

  const canSnooze = Boolean(onSnoozeAlert);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        'fixed z-50 transition-all',
        'top-[calc(0.75rem+env(safe-area-inset-top))] inset-x-3',
        'md:top-auto md:inset-x-auto md:bottom-5 md:right-5 md:w-[392px]',
        'rounded-2xl border bg-[#070B10]/96 overflow-hidden',
        accentBorder,
      ].join(' ')}
    >
      {/* Animated countdown progress bar */}
      <div className="h-1 w-full bg-white/10">
        <div
          className={`h-full transition-all duration-1000 ${barColor}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/15 flex items-center justify-center text-xl shrink-0">
              {alert.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className={`inline-flex items-center gap-1 font-bold ${isWater ? 'text-sky-300' : 'text-[#7FFFD4]'}`}>
                  {isWater ? <Droplets className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                  <span>{alert.sourceLabel}</span>
                </span>
                <span className="text-zinc-500">·</span>
                <span className="font-mono-tabular text-zinc-200 font-semibold">{alert.time12h}</span>
                {!alert.isContinuous && (
                  <>
                    <span className="text-zinc-500">·</span>
                    <span className="font-mono-tabular text-zinc-400">
                      {remFormatted}
                    </span>
                  </>
                )}
                {typeof alert.queuedCount === 'number' && alert.queuedCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[#7FFFD4]/15 border border-[#7FFFD4]/35 text-[#7FFFD4] font-bold text-[10px]">
                    +{alert.queuedCount} في الانتظار
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-white leading-snug mt-1 break-words">
                {alert.title}
              </p>
              {alert.description && (
                <p className="mt-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-2 text-xs text-zinc-300 leading-relaxed whitespace-pre-line break-words">
                  {alert.description}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer shrink-0 flex items-center justify-center"
            aria-label="إغلاق التنبيه"
            title="إغلاق وإيقاف الصوت على أجهزتك"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isWater && onConfirmWater && (
            <button
              type="button"
              onClick={onConfirmWater}
              className="flex-1 sm:flex-none min-h-[46px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-sky-400 text-black text-xs font-bold hover:bg-sky-300 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Droplets className="w-3.5 h-3.5" />
              <span>شربت فعلاً</span>
            </button>
          )}

          {alert.medicationId && onConfirmMedication && (
            <button
              type="button"
              onClick={() => onConfirmMedication(alert.medicationId!, alert.medicationDoseTime24)}
              className="flex-1 sm:flex-none min-h-[46px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-400 text-black text-xs font-bold hover:bg-rose-300 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Pill className="w-3.5 h-3.5" />
              <span>أخذت الجرعة</span>
            </button>
          )}

          {alert.taskId && alert.taskListId && onCompleteTask && (
            <button
              type="button"
              onClick={() => onCompleteTask(alert.taskId!, alert.taskListId!)}
              className="flex-1 sm:flex-none min-h-[46px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-400 text-black text-xs font-bold hover:bg-emerald-300 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>أنجزت المهمة</span>
            </button>
          )}

          {canSnooze && (
            <button
              type="button"
              onClick={() => onSnoozeAlert?.(alert, snoozeMin)}
              className="min-h-[46px] sm:min-h-[40px] px-3 py-2 rounded-xl border border-[#7FFFD4]/45 bg-[#7FFFD4]/12 text-[#7FFFD4] hover:bg-[#7FFFD4]/22 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
              title={`تأجيل التنبيه وإعادة التذكير بعد ${snoozeMin} دقيقة`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>تأجيل {snoozeMin} د</span>
            </button>
          )}

          <button
            type="button"
            onClick={onDismiss}
            className={`min-h-[46px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              alert.isContinuous
                ? 'bg-[#7FFFD4] text-black hover:bg-[#66eec2]'
                : 'border border-white/15 bg-white/[0.06] text-zinc-100 hover:bg-white/15'
            }`}
          >
            {alert.isContinuous ? (
              <>
                <BellOff className="w-3.5 h-3.5" />
                <span>تم</span>
              </>
            ) : (
              <span>تم</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
