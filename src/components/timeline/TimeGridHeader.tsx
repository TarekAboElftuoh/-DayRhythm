import React from 'react';
import type { AppLanguage } from '../../types/dayrhythm';

interface TimeGridHeaderProps {
  language: AppLanguage;
  showBackgroundEvents: boolean;
  backgroundCount: number;
  onToggleBackgroundEvents: () => void;
}

export const TimeGridHeader: React.FC<TimeGridHeaderProps> = ({
  language,
  showBackgroundEvents,
  backgroundCount,
  onToggleBackgroundEvents,
}) => (
  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#060E0C] px-3.5 py-2.5 text-[11px]">
    <span className="font-semibold text-zinc-200">
      {language === 'ar' ? 'المخطط الزمني (٢٤ ساعة)' : '24h Time Grid'}
    </span>
    <div className="flex flex-wrap items-center gap-3 text-zinc-400">
      <button
        type="button"
        aria-pressed={showBackgroundEvents}
        onClick={onToggleBackgroundEvents}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
          showBackgroundEvents
            ? 'border-[#7FFFD4]/50 bg-[#7FFFD4]/15 text-[#7FFFD4]'
            : 'border-white/15 bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <span>{language === 'ar' ? 'إظهار المهام الخلفية' : 'Background items'}</span>
        {backgroundCount > 0 && (
          <span className="font-mono-tabular opacity-80">· {backgroundCount}</span>
        )}
      </button>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm border border-white/20 bg-[#040807]" />
        <span>{language === 'ar' ? 'مقفل' : 'Locked'}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm border border-[#7FFFD4]/40 bg-[#060E0C]" />
        <span>{language === 'ar' ? 'نشط' : 'Active'}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[#7FFFD4]/50 bg-[#030908]" />
        <span>{language === 'ar' ? 'فراغ' : 'Free'}</span>
      </span>
    </div>
  </header>
);
