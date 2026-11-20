import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Check, Droplets, X } from 'lucide-react';
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
  taskId?: string;
  taskListId?: string;
}

interface PersistentAlertOverlayProps {
  alert: PersistentAlertItem | null;
  onDismiss: () => void;
  onConfirmWater?: () => void;
  onCompleteTask?: (taskId: string, taskListId: string) => void;
}

export const PersistentAlertOverlay: React.FC<PersistentAlertOverlayProps> = ({
  alert,
  onDismiss,
  onConfirmWater,
  onCompleteTask,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!alert) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      const t = Date.now();
      setNowMs(t);
      if (!alert.isContinuous && t - alert.createdAtMs >= alert.durationMs) {
        onDismiss();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [alert, onDismiss]);

  if (!alert) return null;

  const elapsedMs = Math.max(0, nowMs - alert.createdAtMs);
  const remainingSec = Math.max(0, Math.ceil((alert.durationMs - elapsedMs) / 1000));
  const progressPct = alert.isContinuous
    ? 100
    : Math.max(0, Math.min(100, ((alert.durationMs - elapsedMs) / alert.durationMs) * 100));
  const remMin = Math.floor(remainingSec / 60);
  const remSec = remainingSec % 60;
  const remFormatted = `${String(remMin).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;

  const accentBorder = alert.isContinuous
    ? 'border-amber-400/80 shadow-[0_0_28px_rgba(251,191,36,0.28)]'
    : alert.category === 'water'
      ? 'border-sky-400/75 shadow-[0_0_24px_rgba(56,189,248,0.25)]'
      : alert.category === 'medication'
        ? 'border-rose-400/75 shadow-[0_0_24px_rgba(251,113,133,0.25)]'
        : 'border-[#7FFFD4]/80 shadow-[0_0_26px_rgba(127,255,212,0.24)]';

  const barColor = alert.isContinuous
    ? 'bg-amber-400'
    : alert.category === 'water'
      ? 'bg-sky-400'
      : alert.category === 'medication'
        ? 'bg-rose-400'
        : 'bg-[#7FFFD4]';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        // Mobile: prominent top banner below status bar; Desktop: non-intrusive side-docked card on right edge
        'fixed z-50 transition-all',
        'top-[calc(0.75rem+env(safe-area-inset-top))] inset-x-3',
        'md:top-auto md:inset-x-auto md:bottom-5 md:right-5 md:w-[340px]',
        'rounded-2xl border-2 bg-[#070B10]/95 backdrop-blur-xl overflow-hidden',
        accentBorder,
      ].join(' ')}
    >
      {/* Animated 5-minute countdown progress bar */}
      <div className="h-1 w-full bg-white/10">
        <div
          className={`h-full transition-all duration-1000 ${barColor}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/15 flex items-center justify-center text-xl shrink-0 animate-pulse">
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
                    <span className="font-mono-tabular text-zinc-400" title="يختفي تلقائياً بعد انتهاء الـ 5 دقائق">
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
              <span>شربت فعلاً ✓</span>
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
              <span>أنجزت المهمة ✓</span>
            </button>
          )}

          <button
            type="button"
            onClick={onDismiss}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              alert.isContinuous
                ? 'bg-amber-400 text-black hover:bg-amber-300'
                : 'border border-white/15 bg-white/[0.06] text-zinc-200 hover:bg-white/15'
            }`}
          >
            {alert.isContinuous ? (
              <>
                <BellOff className="w-3.5 h-3.5" />
                <span>إيقاف التنبيه ✓</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>تم العلم ✓</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
