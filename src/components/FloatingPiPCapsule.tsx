import React, { useEffect, useRef, useState } from 'react';
import {
  EyeOff,
  Eye,
  LayoutDashboard,
  GripHorizontal,
  PictureInPicture2,
} from 'lucide-react';

interface DocumentPictureInPictureApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
}

interface WebView2Bridge {
  postMessage?: (message: string) => void;
}

interface FloatingPiPCapsuleProps {
  nextEmoji: string;
  nextTitle: string;
  statusLabel: string;
  countdownText: string;
  isNow: boolean;
  isUrgent: boolean;
  progressRatio: number;
  targetEpochMs: number;
  durationSeconds: number;
  onOpenDashboard: () => void;
}

export const FloatingPiPCapsule: React.FC<FloatingPiPCapsuleProps> = ({
  nextEmoji,
  nextTitle,
  statusLabel,
  countdownText,
  isNow,
  isUrgent,
  targetEpochMs,
  durationSeconds,
  onOpenDashboard,
}) => {
  const [visible, setVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const pipWindowRef = useRef<Window | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const webviewBridge: WebView2Bridge | undefined =
    typeof window !== 'undefined'
      ? (window as Window & { chrome?: { webview?: WebView2Bridge } }).chrome?.webview
      : undefined;
  const isNativeWindowsExe = Boolean(webviewBridge?.postMessage);

  const docPiP: DocumentPictureInPictureApi | undefined =
    typeof window !== 'undefined'
      ? (window as Window & { documentPictureInPicture?: DocumentPictureInPictureApi })
          .documentPictureInPicture
      : undefined;
  const supportsDesktopPopout = Boolean(docPiP?.requestWindow);

  // Keep native Windows free-floating DesktopCapsuleForm synced live outside the EXE window
  useEffect(() => {
    if (!isNativeWindowsExe || !webviewBridge?.postMessage) return;
    try {
      webviewBridge.postMessage(
        JSON.stringify({
          type: 'capsule-state',
          emoji: nextEmoji,
          title: nextTitle,
          statusLabel,
          countdownText,
          isNow,
          isUrgent,
          targetEpochMs,
          durationSeconds,
        })
      );
    } catch {
      // ignore WebView2 postMessage issues
    }
  }, [
    isNativeWindowsExe,
    webviewBridge,
    nextEmoji,
    nextTitle,
    statusLabel,
    countdownText,
    isNow,
    isUrgent,
    targetEpochMs,
    durationSeconds,
  ]);

  // Keep open Browser Document Picture-in-Picture mini capsule updated live every second
  useEffect(() => {
    const pipWin = pipWindowRef.current;
    if (!pipWin || pipWin.closed) return;
    const doc = pipWin.document;
    const clockEl = doc.getElementById('dr-pip-clock');
    const emojiEl = doc.getElementById('dr-pip-emoji');
    const accent = isUrgent ? '#FF6B6B' : '#7FFFD4';
    if (clockEl) {
      clockEl.textContent = countdownText;
      clockEl.style.color = accent;
    }
    if (emojiEl) emojiEl.textContent = nextEmoji;
  }, [countdownText, nextEmoji, isUrgent]);

  useEffect(() => {
    return () => {
      try {
        if (pipWindowRef.current && !pipWindowRef.current.closed) {
          pipWindowRef.current.close();
        }
      } catch {
        // ignore cleanup error
      }
    };
  }, []);

  const openBrowserDesktopPopout = async () => {
    if (!docPiP?.requestWindow) return;
    try {
      if (pipWindowRef.current && !pipWindowRef.current.closed) {
        pipWindowRef.current.focus();
        return;
      }
      const pipWin = await docPiP.requestWindow({ width: 176, height: 56 });
      pipWindowRef.current = pipWin;
      setMenuOpen(false);

      const accent = isUrgent ? '#FF6B6B' : '#7FFFD4';
      pipWin.document.title = 'إيقاع اليوم';
      pipWin.document.documentElement.dir = 'rtl';
      pipWin.document.documentElement.lang = 'ar';
      pipWin.document.head.innerHTML = `
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #000000;
            color: #F4F4F5;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 4px;
            overflow: hidden;
            user-select: none;
          }
          #dr-pip-shell {
            width: 100%;
            height: 100%;
            border-radius: 16px;
            background: rgba(8, 10, 14, 0.96);
            border: 1px solid rgba(255, 255, 255, 0.2);
            padding: 6px 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
          }
          #dr-pip-emoji {
            font-size: 18px;
            line-height: 1;
          }
          #dr-pip-clock {
            font-family: "JetBrains Mono", "Consolas", ui-monospace, monospace;
            font-variant-numeric: tabular-nums;
            direction: ltr;
            font-size: 15px;
            font-weight: 700;
            color: ${accent};
          }
        </style>
      `;
      pipWin.document.body.innerHTML = `
        <div id="dr-pip-shell">
          <span id="dr-pip-emoji">${nextEmoji}</span>
          <span id="dr-pip-clock">${countdownText}</span>
        </div>
      `;

      pipWin.addEventListener('pagehide', () => {
        pipWindowRef.current = null;
      });
    } catch {
      // ignore PiP rejection
    }
  };

  // Inside native Windows EXE, the real compact DesktopCapsuleForm floats freely on the desktop
  if (isNativeWindowsExe) {
    return (
      <button
        type="button"
        onClick={() => {
          try {
            webviewBridge?.postMessage?.(JSON.stringify({ type: 'show-native-capsule' }));
          } catch {
            // ignore
          }
        }}
        className="hidden md:flex fixed bottom-4 left-4 z-40 rounded-full border border-white/15 bg-black/85 backdrop-blur-md px-3 py-1.5 text-[11px] text-zinc-300 hover:border-[#7FFFD4] hover:text-[#7FFFD4] items-center gap-1.5 shadow-xl cursor-pointer"
        title="إظهار الكبسولة العائمة على سطح المكتب"
      >
        <PictureInPicture2 className="w-3.5 h-3.5" />
        <span>إظهار الكبسولة</span>
      </button>
    );
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
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
      {/* Classic compact sleek capsule: Emoji + smooth live countdown timer only */}
      <div
        className="flex items-center gap-3 rounded-2xl border border-white/20 bg-black/85 backdrop-blur-xl px-3.5 py-2 shadow-2xl cursor-grab active:cursor-grabbing"
        title={`${nextTitle} · اسحب للتحريك أو كليك يمين للقائمة`}
      >
        <GripHorizontal className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="text-base leading-none">{nextEmoji}</span>
        <span
          className={`font-digits text-xs font-bold ${
            isUrgent ? 'text-[#FF6B6B]' : isNow ? 'text-[#4ADE80]' : 'text-[#7FFFD4]'
          }`}
        >
          {countdownText}
        </span>
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
        <div className="mt-2 w-52 rounded-xl border border-white/15 bg-[#090C10]/95 backdrop-blur-xl p-1.5 text-xs shadow-2xl">
          {supportsDesktopPopout && (
            <button
              type="button"
              onClick={() => void openBrowserDesktopPopout()}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[#7FFFD4] hover:bg-[#7FFFD4]/15 cursor-pointer"
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
              <span>فصلها خارج المتصفح</span>
            </button>
          )}
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
