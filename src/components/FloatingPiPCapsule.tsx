import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Droplets, EyeOff, Eye, LayoutDashboard, GripHorizontal } from 'lucide-react';

interface FloatingPiPCapsuleProps {
  nextEmoji: string;
  countdownText: string;
  cupsLogged: number;
  targetCups: number;
  onLogWaterCup: () => void;
  onOpenDashboard: () => void;
}

export const FloatingPiPCapsule: React.FC<FloatingPiPCapsuleProps> = ({
  nextEmoji,
  countdownText,
  cupsLogged,
  targetCups,
  onLogWaterCup,
  onOpenDashboard,
}) => {
  const [visible, setVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="hidden md:flex fixed bottom-4 left-4 z-40 rounded-full border border-white/15 bg-black/85 backdrop-blur-md px-3 py-1.5 text-[11px] text-zinc-300 hover:border-[#7FFFD4] hover:text-[#7FFFD4] items-center gap-1.5 shadow-xl cursor-pointer"
        title="إظهار كبسولة سطح المكتب العائمة"
      >
        <Eye className="w-3.5 h-3.5" />
        <span>إظهار الكبسولة</span>
      </button>
    );
  }

  return (
    <motion.div
      drag
      dragMomentum={false}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen((v) => !v);
      }}
      className="hidden md:block fixed bottom-5 left-5 z-40 select-none"
    >
      <div
        className="flex items-center gap-3 rounded-2xl border border-white/20 bg-black/85 backdrop-blur-xl px-3.5 py-2 shadow-2xl cursor-grab active:cursor-grabbing"
        title="اسحب للتحريك لأي زاوية · كليك يمين للقائمة السريعة"
      >
        <GripHorizontal className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="text-base">{nextEmoji}</span>
        <span className="font-mono-tabular text-xs font-bold text-[#7FFFD4]">
          {countdownText}
        </span>
        <span className="text-white/20">|</span>
        <button
          type="button"
          onClick={onLogWaterCup}
          className="font-mono-tabular text-xs font-semibold text-zinc-200 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer"
          title="اضغط لتسجيل +1 كوب (177 مل)"
        >
          <span>💧</span>
          <span>
            {cupsLogged}/{targetCups}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="text-[10px] text-zinc-500 hover:text-zinc-200 px-1 cursor-pointer"
          aria-label="قائمة الكبسولة"
        >
          ⋮
        </button>
      </div>

      {/* Right-click / quick context menu */}
      {menuOpen && (
        <div className="mt-2 w-48 rounded-xl border border-white/15 bg-[#090C10]/95 backdrop-blur-xl p-1.5 text-xs shadow-2xl">
          <button
            type="button"
            onClick={() => {
              onLogWaterCup();
              setMenuOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-200 hover:bg-[#7FFFD4]/15 hover:text-[#7FFFD4] cursor-pointer"
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>تسجيل +1 كوب (177 مل)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenDashboard();
              setMenuOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-200 hover:bg-white/10 cursor-pointer"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>فتح لوحة التحكم</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setVisible(false);
              setMenuOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>إخفاء الكبسولة</span>
          </button>
        </div>
      )}
    </motion.div>
  );
};
