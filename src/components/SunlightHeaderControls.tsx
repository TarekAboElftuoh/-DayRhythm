import React from 'react';
import { Sun, Volume2 } from 'lucide-react';
import { playSunlightChime } from '../engines/audioEngine';

export const SunlightHeaderControls: React.FC<{
  enabled: boolean;
  onToggle: () => void;
}> = ({ enabled, onToggle }) => (
  <div className="flex flex-wrap items-center justify-between gap-2">
    <h3 className="text-sm font-bold text-white flex items-center gap-2">
      <Sun className="w-4 h-4 text-amber-300" aria-hidden="true" />
      <span>الأشعة المفيدة</span>
    </h3>

    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => playSunlightChime('end')}
        title="تجربة نغمة انتهاء الجلسة"
        className="px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.03] text-zinc-300 hover:text-[#7FFFD4] hover:border-[#7FFFD4]/40 text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
      >
        <Volume2 className="w-3 h-3" aria-hidden="true" />
        <span>نغمة الانتهاء</span>
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={`px-3 py-1 rounded-full border font-mono-tabular text-[11px] font-semibold cursor-pointer transition-colors ${
          enabled
            ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/15 text-[#7FFFD4]'
            : 'border-white/15 bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
        }`}
      >
        {enabled ? 'مفعّل' : 'متوقف'}
      </button>
    </div>
  </div>
);
