import React, { useEffect, useState } from 'react';
import { Play, Pause, RotateCcw, FastForward, X } from 'lucide-react';
import { Drawer } from 'vaul';
import { motion } from 'framer-motion';
import { PomodoroState } from '../types/dayrhythm';

function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

interface PomodoroModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: PomodoroState;
  onToggleRun: () => void;
  onReset: () => void;
  onSelectPreset: (minutes: 25 | 50 | 5) => void;
  onFastForwardTest: () => void;
}

export const PomodoroModal: React.FC<PomodoroModalProps> = ({
  isOpen,
  onClose,
  state,
  onToggleRun,
  onReset,
  onSelectPreset,
  onFastForwardTest,
}) => {
  const isMobile = useIsMobileViewport();

  const isFocus = state.phase === 'focus';
  const accentHex = isFocus ? '#7FFFD4' : '#4ADE80';
  const mins = Math.floor(state.remainingSeconds / 60);
  const secs = state.remainingSeconds % 60;
  const progress =
    state.totalSeconds > 0
      ? 1 - state.remainingSeconds / state.totalSeconds
      : 0;

  const radius = 86;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  const renderBody = (headerTitle: React.ReactNode) => (
    <>
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
        <div className="min-w-0">
          {headerTitle}
          <p className="text-xs text-zinc-400 mt-0.5">
            {isFocus
              ? 'جلسة تركيز · يتبعها تلقائياً استراحة 5 دقائق'
              : 'استراحة هادئة · تحول لوني تلقائي للأخضر'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer shrink-0"
          aria-label="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Circular Timer */}
      <div className="my-6 flex flex-col items-center">
        <div className="relative w-52 h-52 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="10"
            />
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke={accentHex}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-xs font-semibold mb-1"
              style={{ color: accentHex }}
            >
              {isFocus ? 'تركيز عميق' : 'استراحة تلقائية'}
            </span>
            <span className="font-mono-tabular text-4xl font-bold text-white tracking-tight">
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
            <span className="font-mono-tabular text-[11px] text-zinc-500 mt-1">
              الدورات المكتملة: {state.completedCycles}
            </span>
          </div>
        </div>
      </div>

      {/* Presets */}
      <div className="grid grid-cols-3 gap-2 mb-5 p-1 rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)]">
        {(
          [
            { min: 25, label: '25 د ⭐ قياسي' },
            { min: 50, label: '50 د ممتد' },
            { min: 5, label: '5 د استراحة' },
          ] as const
        ).map((p) => {
          const active = state.presetMinutes === p.min && isFocus;
          return (
            <button
              key={p.min}
              type="button"
              onClick={() => onSelectPreset(p.min)}
              className={`relative min-h-[44px] py-2 px-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                active
                  ? 'text-[#7FFFD4] font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="pomodoro-preset-pill"
                  transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                  className="absolute inset-0 rounded-xl bg-[#7FFFD4]/12 border border-[#7FFFD4]/25"
                />
              )}
              <span className="relative z-10 font-mono-tabular">{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onToggleRun}
          className="flex-1 min-h-[44px] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs text-black cursor-pointer transition-all active:scale-[0.98]"
          style={{ backgroundColor: accentHex }}
        >
          {state.isRunning ? (
            <>
              <Pause className="w-4 h-4" /> إيقاف مؤقت
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> {isFocus ? 'بدء التركيز' : 'بدء الاستراحة'}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onReset}
          className="min-h-[44px] min-w-[44px] px-4 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] text-zinc-300 hover:bg-white/[0.06] cursor-pointer transition-colors"
          title="إعادة ضبط"
          aria-label="إعادة ضبط"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onFastForwardTest}
          className="min-h-[44px] px-3.5 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] text-zinc-300 hover:text-[#4ADE80] hover:border-[#4ADE80]/40 text-xs font-mono-tabular flex items-center gap-1.5 cursor-pointer transition-colors"
          title="اختبار الانتقال التلقائي للاستراحة خلال 3 ثوانٍ"
        >
          <FastForward className="w-3.5 h-3.5" />
          <span>3ث</span>
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        direction="bottom"
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md" />
          <Drawer.Content
            dir="rtl"
            aria-describedby={undefined}
            aria-label="مؤقت بومودورو القياسي"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-x border-white/[0.08] bg-[var(--bg-card)] text-zinc-100 shadow-2xl outline-none"
          >
            <div className="pt-3 pb-1 flex justify-center shrink-0">
              <Drawer.Handle className="h-1.5 w-11 rounded-full bg-white/20" />
            </div>
            <div className="overflow-y-auto px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {renderBody(
                <Drawer.Title className="text-base font-bold text-white">
                  ⏱️ محرك التركيز (Cirillo 25/5)
                </Drawer.Title>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  if (!isOpen) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-label="مؤقت بومودورو القياسي"
      tabIndex={-1}
      ref={(el) => el?.focus()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onClick={(e) => {
        // Tap outside the card closes it (the timer keeps running).
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-6 text-zinc-100 shadow-2xl">
        {renderBody(
          <h2 className="text-base font-bold text-white">⏱️ محرك التركيز (Cirillo 25/5)</h2>
        )}
      </div>
    </div>
  );
};
