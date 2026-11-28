import React from 'react';
import { PictureInPicture2, SlidersHorizontal } from 'lucide-react';
import type { CapsulePrefs } from '../pip/types';
import { CapsuleShapeControls } from '../pip/CapsulePopover';

export const NativeWindowsCapsuleTrigger: React.FC<{
  menuOpen: boolean;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  prefs: CapsulePrefs;
  updatePrefs: (patch: Partial<CapsulePrefs>) => void;
  showNative: () => void;
}> = ({ menuOpen, setMenuOpen, prefs, updatePrefs, showNative }) => (
  <div className="fixed bottom-4 left-4 z-40">
    <div className="relative inline-block">
      {menuOpen && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 w-64 rounded-2xl border border-white/[0.1] bg-[#0B0E14]/96 p-3 text-xs shadow-[0_18px_48px_rgba(0,0,0,0.85)] space-y-2.5">
          <CapsuleShapeControls prefs={prefs} onUpdatePrefs={updatePrefs} />
          <button
            type="button"
            onClick={() => { showNative(); setMenuOpen(false); }}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#7FFFD4] text-black py-2 text-xs font-bold hover:bg-[#66eec2] transition-colors cursor-pointer"
          >
            <PictureInPicture2 className="w-3.5 h-3.5" />
            <span>إظهار الكبسولة على سطح المكتب</span>
          </button>
        </div>
      )}
      <div className="flex items-center gap-1 rounded-full border border-white/[0.12] bg-gradient-to-b from-[#10151E] to-[#07080B] p-1 shadow-[0_8px_30px_rgba(0,0,0,0.65)]">
        <button
          type="button"
          onClick={showNative}
          className="rounded-full px-3 py-1.5 text-[11px] font-medium text-zinc-200 hover:bg-white/[0.06] hover:text-[#7FFFD4] flex items-center gap-1.5 transition-colors cursor-pointer"
          title="إظهار الكبسولة العائمة على سطح المكتب"
        >
          <PictureInPicture2 className="w-3.5 h-3.5 text-[#7FFFD4]" />
          <span>الكبسولة</span>
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-full p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
          title="خيارات حجم واتجاه الكبسولة"
          aria-label="خيارات الكبسولة"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
);
