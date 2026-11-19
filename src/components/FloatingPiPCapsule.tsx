import React, { useEffect, useRef, useState } from 'react';
import {
  EyeOff,
  Eye,
  LayoutDashboard,
  GripHorizontal,
  PictureInPicture2,
  Shield,
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
  progressRatio,
  targetEpochMs,
  durationSeconds,
  onOpenDashboard,
}) => {
  const [visible, setVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [pipOpen, setPipOpen] = useState(false);

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

  // Sync live state directly to native Windows free-floating DesktopCapsuleForm outside the EXE window
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

  // Keep open Browser Document Picture-in-Picture mini-window updated live every second
  useEffect(() => {
    const pipWin = pipWindowRef.current;
    if (!pipWin || pipWin.closed) return;
    const doc = pipWin.document;
    const clockEl = doc.getElementById('dr-pip-clock');
    const emojiEl = doc.getElementById('dr-pip-emoji');
    const titleEl = doc.getElementById('dr-pip-title');
    const subEl = doc.getElementById('dr-pip-sub');
    const barEl = doc.getElementById('dr-pip-bar');
    const shellEl = doc.getElementById('dr-pip-shell');

    const accent = isUrgent ? '#FF6B6B' : isNow ? '#4ADE80' : '#7FFFD4';
    if (clockEl) {
      clockEl.textContent = countdownText;
      clockEl.style.color = accent;
    }
    if (emojiEl) emojiEl.textContent = nextEmoji;
    if (titleEl) titleEl.textContent = privacyMode ? nextEmoji : nextTitle;
    if (subEl) subEl.textContent = statusLabel;
    if (barEl) {
      barEl.style.width = `${Math.round(Math.min(100, Math.max(0, progressRatio * 100)))}%`;
      barEl.style.background = accent;
    }
    if (shellEl) {
      shellEl.style.borderColor = `${accent}66`;
    }
  }, [countdownText, nextEmoji, nextTitle, statusLabel, isNow, isUrgent, progressRatio, privacyMode]);

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
      const pipWin = await docPiP.requestWindow({ width: 310, height: 84 });
      pipWindowRef.current = pipWin;
      setPipOpen(true);
      setMenuOpen(false);

      const accent = isUrgent ? '#FF6B6B' : isNow ? '#4ADE80' : '#7FFFD4';
      const safeTitle = (privacyMode ? nextEmoji : nextTitle)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const safeSub = statusLabel
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      pipWin.document.title = 'إيقاع اليوم · تايمر';
      pipWin.document.documentElement.dir = 'rtl';
      pipWin.document.documentElement.lang = 'ar';
      pipWin.document.head.innerHTML = `
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #05070B;
            color: #F4F4F5;
            font-family: "Cairo", "Segoe UI", system-ui, sans-serif;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 6px;
            overflow: hidden;
            user-select: none;
          }
          #dr-pip-shell {
            width: 100%;
            height: 100%;
            border-radius: 18px;
            background: linear-gradient(180deg, #0E121A 0%, #07090D 100%);
            border: 1.5px solid ${accent}66;
            padding: 10px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            position: relative;
            overflow: hidden;
          }
          .task {
            display: flex;
            align-items: center;
            gap: 9px;
            min-width: 0;
            flex: 1;
          }
          #dr-pip-emoji {
            font-size: 22px;
            line-height: 1;
            flex-shrink: 0;
          }
          .meta {
            min-width: 0;
            flex: 1;
          }
          #dr-pip-title {
            font-size: 13px;
            font-weight: 700;
            color: #F4F4F5;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          #dr-pip-sub {
            font-size: 10.5px;
            color: #A1A1AA;
            margin-top: 1px;
            white-space: nowrap;
          }
          .divider {
            width: 1px;
            height: 30px;
            background: rgba(255,255,255,0.12);
            flex-shrink: 0;
          }
          #dr-pip-clock {
            font-family: "JetBrains Mono", "Consolas", ui-monospace, monospace;
            font-variant-numeric: tabular-nums;
            direction: ltr;
            font-size: 20px;
            font-weight: 800;
            letter-spacing: -0.02em;
            color: ${accent};
            flex-shrink: 0;
          }
          .track {
            position: absolute;
            left: 14px;
            right: 14px;
            bottom: 4px;
            height: 2px;
            background: rgba(255,255,255,0.08);
            border-radius: 99px;
            overflow: hidden;
          }
          #dr-pip-bar {
            height: 100%;
            width: ${Math.round(Math.min(100, Math.max(0, progressRatio * 100)))}%;
            background: ${accent};
            transition: width 0.8s linear;
          }
        </style>
      `;
      pipWin.document.body.innerHTML = `
        <div id="dr-pip-shell">
          <div class="task">
            <span id="dr-pip-emoji">${nextEmoji}</span>
            <div class="meta">
              <div id="dr-pip-title">${safeTitle}</div>
              <div id="dr-pip-sub">${safeSub}</div>
            </div>
          </div>
          <div class="divider"></div>
          <div id="dr-pip-clock">${countdownText}</div>
          <div class="track"><div id="dr-pip-bar"></div></div>
        </div>
      `;

      pipWin.addEventListener('pagehide', () => {
        pipWindowRef.current = null;
        setPipOpen(false);
      });
    } catch {
      setPipOpen(false);
    }
  };

  // Inside native Windows EXE, the real DesktopCapsuleForm floats freely on the Windows desktop!
  // Only render a quiet restore trigger if the user wants to bring it back on screen.
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
        className="hidden md:flex fixed bottom-4 left-4 z-40 rounded-xl border border-white/10 bg-[#080B10]/90 backdrop-blur-md px-3 py-1.5 text-[11px] text-zinc-400 hover:border-[#7FFFD4]/50 hover:text-[#7FFFD4] items-center gap-1.5 shadow-xl cursor-pointer transition-colors"
        title="إظهار كبسولة التايمر الحرة على سطح المكتب"
      >
        <PictureInPicture2 className="w-3.5 h-3.5 text-[#7FFFD4]" />
        <span>تايمر سطح المكتب الحر</span>
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
        className="hidden md:flex fixed bottom-4 left-4 z-40 rounded-xl border border-white/15 bg-black/85 backdrop-blur-md px-3 py-1.5 text-[11px] text-zinc-300 hover:border-[#7FFFD4] hover:text-[#7FFFD4] items-center gap-1.5 shadow-xl cursor-pointer"
        title="إظهار تايمر المهمة القادمة"
      >
        <Eye className="w-3.5 h-3.5" />
        <span>إظهار التايمر</span>
      </button>
    );
  }

  const accentTextClass = isUrgent
    ? 'text-[#FF6B6B]'
    : isNow
      ? 'text-[#4ADE80]'
      : 'text-[#7FFFD4]';

  const accentBorderClass = isUrgent
    ? 'border-[#FF6B6B]/45'
    : isNow
      ? 'border-[#4ADE80]/40'
      : 'border-[#7FFFD4]/35';

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
        className={`relative overflow-hidden flex items-center gap-3 rounded-2xl border ${accentBorderClass} bg-[#080B10]/95 backdrop-blur-xl px-3.5 py-2.5 shadow-2xl cursor-grab active:cursor-grabbing max-w-[330px]`}
        title="اسحب للتحريك · اضغط على أيقونة النافذة الحرة لتثبيته خارج المتصفح على سطح المكتب"
      >
        <GripHorizontal className="w-3.5 h-3.5 text-zinc-600 shrink-0" />

        <span className="text-lg leading-none shrink-0">{nextEmoji}</span>

        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-zinc-100 truncate">
            {privacyMode ? nextEmoji : nextTitle}
          </div>
          <div className="text-[10px] text-zinc-400 truncate mt-0.5">{statusLabel}</div>
        </div>

        <span className="h-6 w-px bg-white/10 shrink-0" />

        <span className={`font-digits text-base font-extrabold tracking-tight shrink-0 ${accentTextClass}`}>
          {countdownText}
        </span>

        {supportsDesktopPopout && (
          <button
            type="button"
            onClick={() => void openBrowserDesktopPopout()}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
              pipOpen
                ? 'border-[#4ADE80]/50 bg-[#4ADE80]/15 text-[#4ADE80]'
                : 'border-white/10 text-zinc-400 hover:border-[#7FFFD4]/50 hover:text-[#7FFFD4]'
            }`}
            title="فصل الكبسولة كنافذة حرة على سطح المكتب خارج المتصفح"
            aria-label="نافذة حرة على سطح المكتب"
          >
            <PictureInPicture2 className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="text-xs text-zinc-500 hover:text-zinc-200 px-1 cursor-pointer shrink-0"
          aria-label="خيارات التايمر"
        >
          ⋮
        </button>

        {isNow && progressRatio > 0.01 && (
          <div className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.round(Math.min(100, Math.max(0, progressRatio * 100)))}%`,
                backgroundColor: isUrgent ? '#FF6B6B' : '#4ADE80',
              }}
            />
          </div>
        )}
      </div>

      {/* Quick context menu (Timer-only, zero hydration clutter) */}
      {menuOpen && (
        <div className="mt-2 w-56 rounded-xl border border-white/15 bg-[#090C10]/95 backdrop-blur-xl p-1.5 text-xs shadow-2xl">
          {supportsDesktopPopout && (
            <button
              type="button"
              onClick={() => void openBrowserDesktopPopout()}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[#7FFFD4] hover:bg-[#7FFFD4]/15 cursor-pointer"
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
              <span>تثبيت كنافذة حرة على سطح المكتب</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setPrivacyMode((v) => !v);
              setMenuOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-200 hover:bg-white/10 cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-zinc-400" />
            <span>{privacyMode ? 'إظهار اسم المهمة' : 'وضع الخصوصية (إيموجي فقط)'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenDashboard();
              setMenuOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-200 hover:bg-white/10 cursor-pointer"
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-zinc-400" />
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
            <span>إخفاء التايمر</span>
          </button>
        </div>
      )}
    </div>
  );
};
