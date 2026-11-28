import React from 'react';
import type { OnePlusDeviceSettings } from '../../firebase';

export const PersistentCountdownToggleCard: React.FC<{
  persistentEnabled: boolean;
  onUpdateDeviceSettings: (patch: Partial<OnePlusDeviceSettings>) => void;
}> = ({ persistentEnabled, onUpdateDeviceSettings }) => (
  <div className="pt-4 border-t border-white/[0.06] flex items-start justify-between gap-4">
    <div className="space-y-1">
      <h3 className="text-sm font-bold text-white">
        إشعار ثابت غني بالمعلومات في الستارة
      </h3>
      <p className="text-xs text-zinc-400 leading-relaxed">
        يبقي الموعد القادم وتفاصيله والعدّاد التنازلي والترطيب والمهمة التالية ظاهرين في ستارة الإشعارات بصمت طوال اليوم.
      </p>
    </div>
    <button
      type="button"
      aria-pressed={persistentEnabled}
      onClick={() =>
        onUpdateDeviceSettings({ persistentCountdownNotif: !persistentEnabled })
      }
      className={`min-h-[44px] px-4 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 ${
        persistentEnabled
          ? 'bg-[#7FFFD4] text-black'
          : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
      }`}
    >
      {persistentEnabled ? 'مفعّل' : 'متوقف'}
    </button>
  </div>
);
