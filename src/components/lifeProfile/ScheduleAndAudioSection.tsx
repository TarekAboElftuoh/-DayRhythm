import React, { useState } from 'react';
import { ChevronDown, SlidersHorizontal, Volume2 } from 'lucide-react';
import type {
  LifeProfile,
  SoundRepeatMap,
  SoundRepeatSetting,
  TaskSoundCategory,
} from '../../types/dayrhythm';
import { TASK_SOUND_META } from '../../engines/audioEngine';

export const ScheduleAndAudioSection: React.FC<{
  draft: LifeProfile;
  updateDraft: (updater: (prev: LifeProfile) => LifeProfile) => void;
  calendarConnected: boolean;
  onGoogleSignOut?: () => Promise<void>;
  onClose: () => void;
  soundRepeats?: SoundRepeatMap;
  onUpdateSoundRepeat?: (category: TaskSoundCategory, setting: SoundRepeatSetting) => void;
  onTriggerTaskAlert?: (
    title: string,
    category: TaskSoundCategory,
    options?: { bypassSanctuary?: boolean; privacyEmoji?: string }
  ) => void;
  activeBrandLogo?: { titleAr: string; src: string; isDefault?: boolean } | null;
  onOpenLogoPicker?: () => void;
}> = ({
  draft,
  updateDraft,
  calendarConnected,
  onGoogleSignOut,
  onClose,
  soundRepeats,
  onUpdateSoundRepeat,
  onTriggerTaskAlert,
  activeBrandLogo,
  onOpenLogoPicker,
}) => {
  const [isRingAccordionOpen, setIsRingAccordionOpen] = useState(false);

  return (
  <>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-[#7FFFD4]" />
        <span>إعدادات الجدول والأصوات والحساب</span>
      </h3>
      {calendarConnected && onGoogleSignOut && (
        <button
          type="button"
          onClick={() => {
            void onGoogleSignOut();
            onClose();
          }}
          className="px-2.5 py-1 rounded-lg border border-rose-500/30 text-[11px] text-rose-300 hover:bg-rose-500/10 cursor-pointer"
        >
          فصل حساب Google
        </button>
      )}
    </div>

    <div className="space-y-2 pt-2 border-t border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-zinc-200">مدة زر التأجيل للتنبيهات (تعمل أيضاً من شات Gemini)</span>
        <span className="font-mono-tabular text-[#7FFFD4]">الافتراضي: {draft.defaultSnoozeMinutes ?? 5} د</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([5, 10, 15] as const).map((mins) => {
          const active = (draft.defaultSnoozeMinutes ?? 5) === mins;
          return (
            <button
              key={mins}
              type="button"
              onClick={() => updateDraft((p) => ({ ...p, defaultSnoozeMinutes: mins }))}
              className={`py-2 rounded-xl border font-mono-tabular text-xs font-bold cursor-pointer transition-colors ${
                active ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]' : 'border-white/10 bg-black/40 text-zinc-300 hover:border-white/25 hover:text-white'
              }`}
            >
              {mins} دقائق
            </button>
          );
        })}
      </div>
    </div>

    {soundRepeats && onUpdateSoundRepeat && (
      <div className="pt-2 border-t border-white/10">
        <button
          type="button"
          aria-expanded={isRingAccordionOpen}
          onClick={() => setIsRingAccordionOpen((open) => !open)}
          className="w-full flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2.5 text-right hover:border-[#7FFFD4]/40 transition-colors cursor-pointer"
        >
          <div className="min-w-0">
            <div className="text-xs font-bold text-white">إعدادات الرنين والتكرار</div>
            <div className="text-[11px] text-zinc-400">تخصيص عدد رنات كل تنبيه</div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-[#7FFFD4] shrink-0 transition-transform duration-200 ${
              isRingAccordionOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isRingAccordionOpen && (
          <div className="mt-2 space-y-2 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2">
            <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/[0.06] text-xs">
              <span className="font-medium text-zinc-200">الوقت بين كل رنة</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={draft.ringPauseSeconds ?? 2}
                  onChange={(e) =>
                    updateDraft((p) => ({ ...p, ringPauseSeconds: Number(e.target.value) }))
                  }
                  aria-label="الوقت بين كل رنة"
                  className="w-24 accent-[#7FFFD4] cursor-pointer"
                />
                <span className="font-mono-tabular text-[#7FFFD4] font-bold w-8 text-left">
                  {draft.ringPauseSeconds ?? 2} ث
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>اضغط على أي نوع لتجربة النغمة · ∞ = مستمر حتى الإيقاف</span>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {(
                ['sleep_suhoor', 'prayer', 'water', 'medication', 'meeting_event', 'focus_work', 'pomodoro', 'walk_health', 'general'] as const
              ).map((cat) => {
                const meta = TASK_SOUND_META[cat];
                const currentRepeat = soundRepeats[cat] ?? 1;
                const repeatOptions: SoundRepeatSetting[] = [1, 2, 3, 4, 'continuous'];
                return (
                  <div key={cat} className="py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onTriggerTaskAlert?.(meta.labelAr, cat, { bypassSanctuary: true })}
                      className="flex items-center gap-1.5 text-zinc-200 hover:text-[#7FFFD4] cursor-pointer"
                      title="تجربة النغمة الآن"
                    >
                      <span>{meta.icon}</span>
                      <span className="font-medium">{meta.labelAr}</span>
                      <Volume2 className="w-3 h-3 text-zinc-500" />
                    </button>
                    <div className="flex items-center gap-1 font-mono-tabular">
                      {repeatOptions.map((opt) => {
                        const selected = currentRepeat === opt;
                        return (
                          <button
                            key={String(opt)}
                            type="button"
                            onClick={() => onUpdateSoundRepeat(cat, opt)}
                            className={`px-2 py-0.5 rounded-md border text-[11px] cursor-pointer transition-colors ${
                              selected ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold' : 'border-white/10 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {opt === 'continuous' ? '∞' : `${opt}×`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    )}

    {onOpenLogoPicker && (
      <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 min-w-0">
          {activeBrandLogo?.src && (
            <img
              src={activeBrandLogo.src}
              alt={activeBrandLogo.titleAr}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-xl object-cover border border-white/15 shrink-0"
            />
          )}
          <div className="min-w-0">
            <div className="font-semibold text-white">شعار البرنامج: {activeBrandLogo?.titleAr ?? 'أفق الشروق الزجاجي'}</div>
            <p className="text-[11px] text-zinc-400">الشعار الافتراضي «أفق الشروق الزجاجي»، ويمكنك التبديل لبقية التصميمات بأي وقت من هنا.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenLogoPicker}
          className="px-3.5 py-1.5 rounded-lg border border-white/15 bg-white/[0.04] text-zinc-200 text-xs font-semibold hover:border-[#7FFFD4]/50 hover:text-[#7FFFD4] cursor-pointer whitespace-nowrap"
        >
          تغيير اللوجو
        </button>
      </div>
    )}
  </>
  );
};
