import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Check, Clock, Droplets, Pill, X } from 'lucide-react';
import { TaskSoundCategory } from '../types/dayrhythm';

export interface PersistentAlertItem {
  id: string;
  emoji: string;
  title: string;
  sourceLabel: string;
  time12h: string;
  category: TaskSoundCategory;
  createdAtMs: number;
  durationMs: number;
  isContinuous?: boolean;
  isHydration?: boolean;
  medicationId?: string;
  medicationDoseTime24?: string;
  taskId?: string;
  taskListId?: string;
  blockId?: string;
}

interface PersistentAlertOverlayProps {
  alert: PersistentAlertItem | null;
  defaultSnoozeMinutes?: number;
  onDismiss: () => void;
  onConfirmWater?: () => void;
  onConfirmMedication?: (medicationId: string, doseTime24?: string) => void;
  onCompleteTask?: (taskId: string, taskListId: string) => void;
  onSnoozeAlert?: (alert: PersistentAlertItem, minutes: number) => void;
}

export const PersistentAlertOverlay: React.FC<PersistentAlertOverlayProps> = ({
  alert,
  defaultSnoozeMinutes = 5,
  onDismiss,
  onConfirmWater,
  onConfirmMedication,
  onCompleteTask,
  onSnoozeAlert,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const snoozeMin = defaultSnoozeMinutes === 10 || defaultSnoozeMinutes === 15 ? defaultSnoozeMinutes : 5;
  const lastVibratedAlertIdRef = useRef<string | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

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
    if (!isAndroidNative && lastVibratedAlertIdRef.current !== alert.id) {
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
      if (!alert.isContinuous && t - alert.createdAtMs >= alert.durationMs) {
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

  const accentBorder =
    alert.category === 'water'
      ? 'border-sky-400/75 shadow-[0_0_24px_rgba(56,189,248,0.24)]'
      : alert.category === 'medication'
        ? 'border-rose-400/75 shadow-[0_0_24px_rgba(251,113,133,0.24)]'
        : 'border-[#7FFFD4]/80 shadow-[0_0_26px_rgba(127,255,212,0.24)]';

  const barColor =
    alert.category === 'water'
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
        'md:top-auto md:inset-x-auto md:bottom-5 md:right-5 md:w-[360px]',
        'rounded-2xl border bg-[#070B10]/96 backdrop-blur-xl overflow-hidden',
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

      <div className="p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/15 flex items-center justify-center text-xl shrink-0">
              {alert.emoji}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="inline-flex items-center gap-1 font-bold text-[#7FFFD4]">
                  <Bell className="w-3 h-3" />
                  <span>{alert.sourceLabel}</span>
                </span>
                <span className="text-zinc-500">·</span>
                <span className="font-mono-tabular text-zinc-300">{alert.time12h}</span>
                {!alert.isContinuous && (
                  <>
                    <span className="text-zinc-500">·</span>
                    <span className="font-mono-tabular text-zinc-400">
                      {remFormatted}
                    </span>
                  </>
                )}
              </div>
              <p className="text-sm font-bold text-white leading-snug mt-0.5 break-words">
                {alert.title}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
            aria-label="إغلاق التنبيه"
            title="إغلاق وإيقاف الصوت"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {alert.isHydration && onConfirmWater && (
            <button
              type="button"
              onClick={() => {
                onConfirmWater();
                onDismiss();
              }}
              className="flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Droplets className="w-3.5 h-3.5" />
              <span>شربت فعلاً</span>
            </button>
          )}

          {alert.medicationId && onConfirmMedication && (
            <button
              type="button"
              onClick={() => {
                onConfirmMedication(alert.medicationId!, alert.medicationDoseTime24);
                onDismiss();
              }}
              className="flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl bg-rose-400 text-black text-xs font-bold hover:bg-rose-300 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Pill className="w-3.5 h-3.5" />
              <span>أخذت الجرعة</span>
            </button>
          )}

          {alert.taskId && alert.taskListId && onCompleteTask && (
            <button
              type="button"
              onClick={() => {
                onCompleteTask(alert.taskId!, alert.taskListId!);
                onDismiss();
              }}
              className="flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl bg-emerald-400 text-black text-xs font-bold hover:bg-emerald-300 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>أنجزت المهمة</span>
            </button>
          )}

          {canSnooze && (
            <button
              type="button"
              onClick={() => {
                onSnoozeAlert?.(alert, snoozeMin);
                onDismiss();
              }}
              className="px-3 py-1.5 rounded-xl border border-[#7FFFD4]/45 bg-[#7FFFD4]/12 text-[#7FFFD4] hover:bg-[#7FFFD4]/22 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
              title={`تأجيل التنبيه وإعادة التذكير بعد ${snoozeMin} دقيقة`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>تأجيل {snoozeMin} د</span>
            </button>
          )}

          <button
            type="button"
            onClick={onDismiss}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
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
