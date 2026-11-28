import React from 'react';
import { motion } from 'framer-motion';
import { Columns2, Rows2, PictureInPicture2 } from 'lucide-react';
import type { CapsulePrefs } from '../FloatingPiPCapsule';

export const CapsuleSettingsCard: React.FC<{
  isNativeWindowsExe: boolean;
  webviewBridge?: { postMessage?: (msg: string) => void };
  capsulePrefs: CapsulePrefs;
  updateCapsule: (patch: Partial<CapsulePrefs>) => void;
}> = ({ isNativeWindowsExe, webviewBridge, capsulePrefs, updateCapsule }) => {
  return (
    <>
        {/* Card 1: Desktop Capsule Shape & Size */}
        <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white">كبسولة سطح المكتب</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                تعرض الإيموجي والعدّاد التنازلي للمهمة والماء بوضوح بدون إزعاج
              </p>
            </div>
            {isNativeWindowsExe && (
              <button
                type="button"
                onClick={() => {
                  try {
                    webviewBridge?.postMessage?.(JSON.stringify({ type: 'show-native-capsule' }));
                  } catch {
                    // ignore
                  }
                }}
                className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <PictureInPicture2 className="w-3.5 h-3.5" />
                <span>إظهار الآن</span>
              </button>
            )}
          </div>

          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <div className="text-xs text-zinc-400">الاتجاه</div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[var(--bg-surface)] border border-white/[0.06]">
                {(
                  [
                    { id: 'horizontal', label: 'عرضي (أفقي)', Icon: Columns2 },
                    { id: 'vertical', label: 'طولي (رأسي)', Icon: Rows2 },
                  ] as const
                ).map(({ id, label, Icon }) => {
                  const active = capsulePrefs.orientation === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => updateCapsule({ orientation: id })}
                      className={`relative min-h-[44px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer select-none ${
                        active ? 'text-[#7FFFD4]' : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="overlay-capsule-orientation"
                          transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                          className="absolute inset-0 rounded-xl bg-[#7FFFD4]/12 border border-[#7FFFD4]/25"
                        />
                      )}
                      <Icon className="relative z-10 w-3.5 h-3.5" />
                      <span className="relative z-10">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-zinc-400">الحجم</div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[var(--bg-surface)] border border-white/[0.06]">
                {(
                  [
                    { id: 'sm', label: 'صغير' },
                    { id: 'md', label: 'متوسط' },
                    { id: 'lg', label: 'كبير' },
                  ] as const
                ).map((opt) => {
                  const active = capsulePrefs.size === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateCapsule({ size: opt.id })}
                      className={`relative min-h-[44px] rounded-xl text-xs font-semibold transition-colors cursor-pointer select-none ${
                        active ? 'text-[#7FFFD4]' : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="overlay-capsule-size"
                          transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                          className="absolute inset-0 rounded-xl bg-[#7FFFD4]/12 border border-[#7FFFD4]/25"
                        />
                      )}
                      <span className="relative z-10">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

    </>
  );
};
