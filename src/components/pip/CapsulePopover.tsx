import React from 'react';
import {
  Check,
  Columns2,
  Droplets,
  EyeOff,
  LayoutDashboard,
  PictureInPicture2,
  Pill,
  Rows2,
} from 'lucide-react';
import { resolveDigitalClock, type CapsulePrefs, type CapsuleTrackInfo } from './types';

export const CapsuleShapeControls: React.FC<{
  prefs: CapsulePrefs;
  onUpdatePrefs: (patch: Partial<CapsulePrefs>) => void;
}> = ({ prefs, onUpdatePrefs }) => (
  <div className="space-y-2.5 border-b border-white/[0.08] pb-2.5">
    <div className="space-y-1.5">
      <div className="px-0.5 text-[10px] font-semibold text-zinc-400">اتجاه الكبسولة</div>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06] p-1">
        <button
          type="button"
          onClick={() => onUpdatePrefs({ orientation: 'horizontal' })}
          className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
            prefs.orientation === 'horizontal'
              ? 'bg-[#7FFFD4] text-black'
              : 'text-zinc-300 hover:bg-white/[0.06]'
          }`}
        >
          <Columns2 className="w-3.5 h-3.5 shrink-0" />
          <span>عرضي</span>
        </button>
        <button
          type="button"
          onClick={() => onUpdatePrefs({ orientation: 'vertical' })}
          className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
            prefs.orientation === 'vertical'
              ? 'bg-[#7FFFD4] text-black'
              : 'text-zinc-300 hover:bg-white/[0.06]'
          }`}
        >
          <Rows2 className="w-3.5 h-3.5 shrink-0" />
          <span>طولي</span>
        </button>
      </div>
    </div>

    <div className="space-y-1.5">
      <div className="px-0.5 text-[10px] font-semibold text-zinc-400">حجم الكبسولة</div>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06] p-1">
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
            onClick={() => onUpdatePrefs({ size: opt.id })}
            className={`rounded-md py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
              prefs.size === opt.id
                ? 'bg-[#7FFFD4] text-black'
                : 'text-zinc-300 hover:bg-white/[0.06]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);

export const CapsulePopover: React.FC<{
  prefs: CapsulePrefs;
  onUpdatePrefs: (patch: Partial<CapsulePrefs>) => void;
  quickDoneFlash: string | null;
  onFlashQuickDone: (msg: string) => void;
  onQuickLogWater?: () => void;
  nextMedicationQuick?: { id: string; name: string; doseTime24?: string; timeLabel?: string } | null;
  onQuickTakeMedication?: (id: string, doseTime24?: string) => void;
  upcomingQueue: CapsuleTrackInfo[];
  nowTickMs: number;
  supportsDesktopPopout: boolean;
  onOpenPopout: () => void;
  onOpenDashboard: () => void;
  onHideCapsule: () => void;
  onCloseMenu: () => void;
}> = ({
  prefs,
  onUpdatePrefs,
  quickDoneFlash,
  onFlashQuickDone,
  onQuickLogWater,
  nextMedicationQuick,
  onQuickTakeMedication,
  upcomingQueue,
  nowTickMs,
  supportsDesktopPopout,
  onOpenPopout,
  onOpenDashboard,
  onHideCapsule,
  onCloseMenu,
}) => (
  <div className="absolute bottom-[calc(100%+10px)] left-0 w-64 rounded-2xl border border-white/[0.1] bg-[#0B0E14]/96 p-3 text-xs shadow-[0_18px_48px_rgba(0,0,0,0.85)] space-y-2.5">
    {(onQuickLogWater || (nextMedicationQuick && onQuickTakeMedication)) && (
      <div className="space-y-1.5 border-b border-white/[0.08] pb-2.5">
        <div className="px-0.5 text-[10px] font-semibold text-zinc-400">تسجيل سريع</div>
        {quickDoneFlash && (
          <div className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{quickDoneFlash}</span>
          </div>
        )}
        <div className="space-y-1.5">
          {onQuickLogWater && (
            <button
              type="button"
              onClick={() => {
                onQuickLogWater();
                onFlashQuickDone('تم تسجيل كوب ماء ✓');
              }}
              className="w-full flex items-center justify-between gap-2 rounded-lg border border-sky-400/25 bg-sky-500/10 px-2.5 py-2 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/20 cursor-pointer transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                <span>سجّل كوب ماء</span>
              </span>
              <span className="font-digits text-[10px] text-sky-300">+1</span>
            </button>
          )}
          {nextMedicationQuick && onQuickTakeMedication && (
            <button
              type="button"
              onClick={() => {
                onQuickTakeMedication(nextMedicationQuick.id, nextMedicationQuick.doseTime24);
                onFlashQuickDone(`تم تسجيل ${nextMedicationQuick.name} ✓`);
              }}
              className="w-full flex items-center justify-between gap-2 rounded-lg border border-rose-400/25 bg-rose-500/10 px-2.5 py-2 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20 cursor-pointer transition-colors"
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <Pill className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                <span className="truncate">أخذت {nextMedicationQuick.name}</span>
              </span>
              {nextMedicationQuick.timeLabel && (
                <span className="font-digits text-[10px] text-rose-300 shrink-0">
                  {nextMedicationQuick.timeLabel}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    )}

    <CapsuleShapeControls prefs={prefs} onUpdatePrefs={onUpdatePrefs} />

    {upcomingQueue.length > 0 && (
      <div className="border-b border-white/[0.08] pb-2.5 space-y-1.5">
        <div className="px-0.5 text-[10px] font-semibold text-zinc-400">القادم خلال اليوم</div>
        {upcomingQueue.slice(0, 4).map((item, idx) => (
          <div
            key={`${item.title}-${idx}`}
            className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm leading-none shrink-0">{item.emoji}</span>
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-zinc-100 truncate">{item.title}</div>
                {item.clockLabel && (
                  <div className="text-[10px] text-zinc-500 font-digits">{item.clockLabel}</div>
                )}
              </div>
            </div>
            <span
              dir="ltr"
              className={`font-digits text-[11px] font-bold shrink-0 ${
                item.isUrgent
                  ? 'text-[#FF6B6B]'
                  : item.isNow
                    ? 'text-[#4ADE80]'
                    : item.emoji === '💧'
                      ? 'text-sky-300'
                      : 'text-[#7FFFD4]'
              }`}
            >
              {resolveDigitalClock(item.targetEpochMs, item.countdownText, nowTickMs)}
            </span>
          </div>
        ))}
      </div>
    )}

    <div className="space-y-1">
      {supportsDesktopPopout && (
        <button
          type="button"
          onClick={onOpenPopout}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[#7FFFD4] hover:bg-[#7FFFD4]/12 transition-colors cursor-pointer"
        >
          <PictureInPicture2 className="w-3.5 h-3.5" />
          <span>فصلها خارج المتصفح</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          onOpenDashboard();
          onCloseMenu();
        }}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
      >
        <LayoutDashboard className="w-3.5 h-3.5" />
        <span>فتح لوحة التحكم</span>
      </button>
      <button
        type="button"
        onClick={onHideCapsule}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
      >
        <EyeOff className="w-3.5 h-3.5" />
        <span>إخفاء الكبسولة</span>
      </button>
    </div>
  </div>
);
