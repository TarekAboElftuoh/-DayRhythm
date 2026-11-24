import React from 'react';
import { Play, Pause, RotateCcw, FastForward, X } from 'lucide-react';
import { PomodoroState } from '../types/dayrhythm';

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
  if (!isOpen) return null;

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
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
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0A0D12] p-6 text-zinc-100 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h2 className="text-base font-bold text-white">⏱️ محرك التركيز (Cirillo 25/5)</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {isFocus
                ? 'جلسة تركيز · يتبعها تلقائياً استراحة 5 دقائق'
                : 'استراحة هادئة · تحول لوني تلقائي للأخضر'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer"
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
                stroke="rgba(255,255,255,0.08)"
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
        <div className="grid grid-cols-3 gap-2 mb-5">
          {(
            [
              { min: 25, label: '25 د ⭐ قياسي' },
              { min: 50, label: '50 د ممتد' },
              { min: 5, label: '5 د استراحة' },
            ] as const
          ).map((p) => (
            <button
              key={p.min}
              type="button"
              onClick={() => onSelectPreset(p.min)}
              className={`py-2 px-2 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                state.presetMinutes === p.min && isFocus
                  ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                  : 'border-white/10 bg-black/50 text-zinc-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onToggleRun}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs text-black cursor-pointer transition-all"
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
            className="min-h-[44px] px-4 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 cursor-pointer"
            title="إعادة ضبط"
            aria-label="إعادة ضبط"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onFastForwardTest}
            className="min-h-[44px] px-3 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:text-[#4ADE80] hover:border-[#4ADE80]/40 text-xs flex items-center gap-1.5 cursor-pointer"
            title="اختبار الانتقال التلقائي للاستراحة خلال 3 ثوانٍ"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>3ث</span>
          </button>
        </div>
      </div>
    </div>
  );
};
