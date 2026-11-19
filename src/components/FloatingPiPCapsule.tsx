import React, { useRef, useState } from 'react';
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
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Allow clicking buttons inside the capsule without triggering drag
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.button !== 0) return;
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    setOffset({
      x: dragStateRef.current.originX + dx,
      y: dragStateRef.current.originY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore if capture already released
    }
  };

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
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen((v) => !v);
      }}
      style={{
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
      }}
      className="hidden md:block fixed bottom-5 left-5 z-40 select-none touch-none"
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
    </div>
  );
};
