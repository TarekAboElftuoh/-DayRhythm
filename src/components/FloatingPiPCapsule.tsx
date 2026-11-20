import React, { useEffect, useRef, useState } from 'react';
import {
  EyeOff,
  Eye,
  LayoutDashboard,
  GripHorizontal,
  PictureInPicture2,
  Zap,
} from 'lucide-react';
import { PhoneBatteryTelemetry } from '../types/dayrhythm';

interface DocumentPictureInPictureApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
}

interface WebView2Bridge {
  postMessage?: (message: string) => void;
}

export interface CapsuleTrackInfo {
  emoji: string;
  title: string;
  statusLabel: string;
  countdownText: string;
  isNow: boolean;
  isUrgent: boolean;
  targetEpochMs: number;
  durationSeconds: number;
}

interface FloatingPiPCapsuleProps {
  nextEmoji: string;
  nextTitle: string;
  statusLabel: string;
  sourceKind: 'calendar' | 'task' | 'none';
  countdownText: string;
  isNow: boolean;
  isUrgent: boolean;
  progressRatio: number;
  targetEpochMs: number;
  durationSeconds: number;
  calendarTrack?: CapsuleTrackInfo | null;
  taskTrack?: CapsuleTrackInfo | null;
  phoneBattery?: PhoneBatteryTelemetry | null;
  onOpenDashboard: () => void;
}

export const FloatingPiPCapsule: React.FC<FloatingPiPCapsuleProps> = ({
  nextEmoji,
  nextTitle,
  statusLabel,
  sourceKind,
  countdownText,
  isNow,
  isUrgent,
  targetEpochMs,
  durationSeconds,
  calendarTrack,
  taskTrack,
  phoneBattery,
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

  const showPhoneChargingBadge = Boolean(
    phoneBattery && phoneBattery.charging && Date.now() - phoneBattery.updatedAtMs < 20 * 60_000
  );
  const phoneReachedLimit = Boolean(
    showPhoneChargingBadge && phoneBattery && phoneBattery.levelPct >= phoneBattery.chargeLimitPct
  );
  const sourceBadgeAr = sourceKind === 'task' ? 'مهام' : sourceKind === 'calendar' ? 'تقويم' : '';
  const hasDualTimers = Boolean(calendarTrack && taskTrack);

  // Keep native Windows free-floating DesktopCapsuleForm synced live outside the EXE window (supports Dual Calendar + Tasks timers!)
  useEffect(() => {
    if (!isNativeWindowsExe || !webviewBridge?.postMessage) return;
    try {
      const primary = calendarTrack ?? {
        emoji: nextEmoji,
        title: nextTitle,
        statusLabel,
        countdownText,
        isNow,
        isUrgent,
        targetEpochMs,
        durationSeconds,
      };
      webviewBridge.postMessage(
        JSON.stringify({
          type: 'capsule-state',
          emoji: primary.emoji,
          title: primary.title,
          statusLabel: primary.statusLabel,
          sourceKind: calendarTrack ? 'calendar' : sourceKind,
          countdownText: primary.countdownText,
          isNow: primary.isNow,
          isUrgent: primary.isUrgent,
          targetEpochMs: primary.targetEpochMs,
          durationSeconds: primary.durationSeconds,
          hasSecondaryTimer: Boolean(calendarTrack && taskTrack),
          secondaryEmoji: taskTrack?.emoji ?? '☑️',
          secondaryTitle: taskTrack?.title ?? '',
          secondaryCountdownText: taskTrack?.countdownText ?? '',
          secondaryTargetEpochMs: taskTrack?.targetEpochMs ?? 0,
          secondaryIsNow: taskTrack?.isNow ?? false,
          secondaryIsUrgent: taskTrack?.isUrgent ?? false,
          phoneBatteryPct: showPhoneChargingBadge && phoneBattery ? phoneBattery.levelPct : -1,
          phoneCharging: showPhoneChargingBadge,
          phoneChargeLimitPct: phoneBattery?.chargeLimitPct ?? 90,
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
    sourceKind,
    countdownText,
    isNow,
    isUrgent,
    targetEpochMs,
    durationSeconds,
    calendarTrack,
    taskTrack,
    showPhoneChargingBadge,
    phoneBattery,
  ]);

  // Keep open Browser Document Picture-in-Picture mini capsule updated live every second (supports Dual Timers!)
  useEffect(() => {
    const pipWin = pipWindowRef.current;
    if (!pipWin || pipWin.closed) return;
    const doc = pipWin.document;
    const clockEl = doc.getElementById('dr-pip-clock');
    const emojiEl = doc.getElementById('dr-pip-emoji');
    const taskWrapEl = doc.getElementById('dr-pip-task-wrap');
    const taskClockEl = doc.getElementById('dr-pip-task-clock');
    const batEl = doc.getElementById('dr-pip-bat');

    const primary = hasDualTimers && calendarTrack ? calendarTrack : null;
    const displayClock = primary ? primary.countdownText : countdownText;
    const displayEmoji = primary ? primary.emoji : nextEmoji;
    const primaryUrgent = primary ? primary.isUrgent : isUrgent;
    const primaryNow = primary ? primary.isNow : isNow;
    const accent = primaryUrgent ? '#FF6B6B' : primaryNow ? '#4ADE80' : '#7FFFD4';

    if (clockEl) {
      clockEl.textContent = displayClock;
      clockEl.style.color = accent;
    }
    if (emojiEl) emojiEl.textContent = displayEmoji;
    if (taskWrapEl && taskClockEl) {
      if (hasDualTimers && taskTrack) {
        taskWrapEl.style.display = 'inline-flex';
        taskClockEl.textContent = taskTrack.countdownText;
        taskClockEl.style.color = taskTrack.isUrgent
          ? '#FF6B6B'
          : taskTrack.isNow
            ? '#4ADE80'
            : '#FCD34D';
      } else {
        taskWrapEl.style.display = 'none';
      }
    }
    if (batEl) {
      if (showPhoneChargingBadge && phoneBattery) {
        batEl.style.display = 'inline';
        batEl.textContent = `⚡${phoneBattery.levelPct}%`;
        batEl.style.color = phoneReachedLimit ? '#4ADE80' : '#FCD34D';
      } else {
        batEl.style.display = 'none';
      }
    }
  }, [
    countdownText,
    nextEmoji,
    isUrgent,
    isNow,
    hasDualTimers,
    calendarTrack,
    taskTrack,
    showPhoneChargingBadge,
    phoneBattery,
    phoneReachedLimit,
  ]);

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
      const pipWin = await docPiP.requestWindow({
        width: hasDualTimers ? 310 : 220,
        height: 56,
      });
      pipWindowRef.current = pipWin;
      setMenuOpen(false);

      const primary = hasDualTimers && calendarTrack ? calendarTrack : null;
      const pClock = primary ? primary.countdownText : countdownText;
      const pEmoji = primary ? primary.emoji : nextEmoji;
      const pAccent = (primary ? primary.isUrgent : isUrgent) ? '#FF6B6B' : '#7FFFD4';

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
            padding: 6px 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
          }
          .seg { display: inline-flex; align-items: center; gap: 5px; }
          #dr-pip-emoji, #dr-pip-task-emoji { font-size: 16px; line-height: 1; }
          #dr-pip-clock, #dr-pip-task-clock {
            font-family: "JetBrains Mono", "Consolas", ui-monospace, monospace;
            font-variant-numeric: tabular-nums;
            direction: ltr;
            font-size: 14px;
            font-weight: 700;
          }
          #dr-pip-clock { color: ${pAccent}; }
          #dr-pip-task-wrap {
            border-right: 1px solid rgba(255,255,255,0.18);
            padding-right: 9px;
          }
          #dr-pip-bat {
            font-family: "JetBrains Mono", "Consolas", ui-monospace, monospace;
            font-variant-numeric: tabular-nums;
            direction: ltr;
            font-size: 11px;
            font-weight: 700;
            border-right: 1px solid rgba(255,255,255,0.15);
            padding-right: 6px;
          }
        </style>
      `;
      pipWin.document.body.innerHTML = `
        <div id="dr-pip-shell">
          <span class="seg">
            <span id="dr-pip-emoji">${pEmoji}</span>
            <span id="dr-pip-clock">${pClock}</span>
          </span>
          <span id="dr-pip-task-wrap" class="seg" style="display:${hasDualTimers && taskTrack ? 'inline-flex' : 'none'}">
            <span id="dr-pip-task-emoji">☑️</span>
            <span id="dr-pip-task-clock" style="color:#FCD34D">${taskTrack?.countdownText ?? ''}</span>
          </span>
          <span id="dr-pip-bat" style="display:${showPhoneChargingBadge ? 'inline' : 'none'};color:${phoneReachedLimit ? '#4ADE80' : '#FCD34D'}">${showPhoneChargingBadge && phoneBattery ? `⚡${phoneBattery.levelPct}%` : ''}</span>
        </div>
      `;

      pipWin.addEventListener('pagehide', () => {
        pipWindowRef.current = null;
      });
    } catch {
      // ignore PiP rejection
    }
  };

  // Mobile Live Compact Capsule (shows BOTH Calendar & Task timers simultaneously when active)
  const mobileCapsuleBar = (
    <button
      type="button"
      onClick={onOpenDashboard}
      className="md:hidden fixed bottom-[calc(4.15rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-30 max-w-[94vw] flex items-center gap-2 rounded-full border border-white/20 bg-black/90 backdrop-blur-xl px-3.5 py-1.5 shadow-2xl active:scale-95 transition-transform cursor-pointer"
      title={
        hasDualTimers && calendarTrack && taskTrack
          ? `تقويم: ${calendarTrack.title} (${calendarTrack.countdownText}) · مهام: ${taskTrack.title} (${taskTrack.countdownText})`
          : `${nextTitle} · ${statusLabel}`
      }
    >
      {hasDualTimers && calendarTrack && taskTrack ? (
        <>
          <span className="flex items-center gap-1 shrink-0">
            <span className="text-sm leading-none">{calendarTrack.emoji}</span>
            <span
              className={`font-digits text-xs font-bold ${
                calendarTrack.isUrgent
                  ? 'text-[#FF6B6B]'
                  : calendarTrack.isNow
                    ? 'text-[#4ADE80]'
                    : 'text-[#7FFFD4]'
              }`}
            >
              {calendarTrack.countdownText}
            </span>
          </span>
          <span className="h-3.5 w-px bg-white/20 shrink-0" />
          <span className="flex items-center gap-1 shrink-0">
            <span className="text-xs leading-none">☑️</span>
            <span
              className={`font-digits text-xs font-bold ${
                taskTrack.isUrgent
                  ? 'text-[#FF6B6B]'
                  : taskTrack.isNow
                    ? 'text-[#4ADE80]'
                    : 'text-amber-300'
              }`}
            >
              {taskTrack.countdownText}
            </span>
          </span>
        </>
      ) : (
        <>
          <span className="text-sm leading-none shrink-0">{nextEmoji}</span>
          {sourceBadgeAr && (
            <span className="text-[10px] font-semibold text-zinc-400 shrink-0">
              {sourceBadgeAr}
            </span>
          )}
          <span className="text-[11px] text-zinc-200 truncate max-w-[130px]">{nextTitle}</span>
          <span
            className={`font-digits text-xs font-bold shrink-0 ${
              isUrgent ? 'text-[#FF6B6B]' : isNow ? 'text-[#4ADE80]' : 'text-[#7FFFD4]'
            }`}
          >
            {countdownText}
          </span>
        </>
      )}
    </button>
  );

  // Inside native Windows EXE, the real compact DesktopCapsuleForm floats freely on the desktop
  if (isNativeWindowsExe) {
    return (
      <>
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
      </>
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
      <>
        {mobileCapsuleBar}
        <button
          type="button"
          onClick={() => setVisible(true)}
          className="hidden md:flex fixed bottom-4 left-4 z-40 rounded-full border border-white/15 bg-black/85 backdrop-blur-md px-3 py-1.5 text-[11px] text-zinc-300 hover:border-[#7FFFD4] hover:text-[#7FFFD4] items-center gap-1.5 shadow-xl cursor-pointer"
          title="إظهار كبسولة سطح المكتب العائمة"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>إظهار الكبسولة</span>
        </button>
      </>
    );
  }

  return (
    <>
      {mobileCapsuleBar}
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
        {/* Dual-Timer Desktop Capsule: Calendar Countdown + Google Tasks Countdown simultaneously! */}
        <div
          className="flex items-center gap-2.5 rounded-2xl border border-white/20 bg-black/90 backdrop-blur-xl px-3.5 py-2 shadow-2xl cursor-grab active:cursor-grabbing"
          title={
            hasDualTimers && calendarTrack && taskTrack
              ? `تقويم: ${calendarTrack.title} (${calendarTrack.countdownText}) · مهام: ${taskTrack.title} (${taskTrack.countdownText}) · اسحب للتحريك`
              : `${sourceBadgeAr ? `[${sourceBadgeAr}] ` : ''}${nextTitle} · ${statusLabel} · اسحب للتحريك أو كليك يمين للقائمة`
          }
        >
          <GripHorizontal className="w-3.5 h-3.5 text-zinc-500 shrink-0" />

          {hasDualTimers && calendarTrack && taskTrack ? (
            <>
              <div
                className="flex items-center gap-1.5"
                title={`تقويم: ${calendarTrack.title} · ${calendarTrack.statusLabel}`}
              >
                <span className="text-base leading-none">{calendarTrack.emoji}</span>
                <span className="text-[10px] font-semibold text-zinc-400">تقويم</span>
                <span
                  className={`font-digits text-xs font-bold ${
                    calendarTrack.isUrgent
                      ? 'text-[#FF6B6B]'
                      : calendarTrack.isNow
                        ? 'text-[#4ADE80]'
                        : 'text-[#7FFFD4]'
                  }`}
                >
                  {calendarTrack.countdownText}
                </span>
              </div>
              <span className="h-4 w-px bg-white/15 shrink-0" />
              <div
                className="flex items-center gap-1.5"
                title={`مهام: ${taskTrack.title} · ${taskTrack.statusLabel}`}
              >
                <span className="text-sm leading-none">☑️</span>
                <span className="text-[10px] font-semibold text-amber-300/90">مهام</span>
                <span
                  className={`font-digits text-xs font-bold ${
                    taskTrack.isUrgent
                      ? 'text-[#FF6B6B]'
                      : taskTrack.isNow
                        ? 'text-[#4ADE80]'
                        : 'text-amber-300'
                  }`}
                >
                  {taskTrack.countdownText}
                </span>
              </div>
            </>
          ) : (
            <>
              <span className="text-base leading-none">{nextEmoji}</span>
              {sourceKind === 'task' && (
                <span className="text-[10px] font-bold text-amber-300">مهام</span>
              )}
              <span
                className={`font-digits text-xs font-bold ${
                  isUrgent ? 'text-[#FF6B6B]' : isNow ? 'text-[#4ADE80]' : 'text-[#7FFFD4]'
                }`}
              >
                {countdownText}
              </span>
            </>
          )}

          {showPhoneChargingBadge && phoneBattery && (
            <span
              className={`flex items-center gap-0.5 border-r border-white/15 pr-2 font-digits text-[11px] font-bold ${
                phoneReachedLimit ? 'text-[#4ADE80] animate-pulse' : 'text-amber-300'
              }`}
              title={`بطارية ${phoneBattery.deviceLabel}: ${phoneBattery.levelPct}% (الحد ${phoneBattery.chargeLimitPct}%)`}
            >
              <Zap className="w-3 h-3" />
              <span>{phoneBattery.levelPct}%</span>
            </span>
          )}
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
    </>
  );
};
