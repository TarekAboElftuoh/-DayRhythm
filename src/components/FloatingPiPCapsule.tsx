import React, { useEffect, useRef, useState } from 'react';
import {
  EyeOff,
  Eye,
  LayoutDashboard,
  GripHorizontal,
  PictureInPicture2,
  Zap,
  Columns2,
  Rows2,
  Droplets,
  Pill,
  Check,
  SlidersHorizontal,
} from 'lucide-react';
import {
  CapsuleOrientation,
  CapsuleSize,
  PhoneBatteryTelemetry,
} from '../types/dayrhythm';

interface DocumentPictureInPictureApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
}

interface WebView2Bridge {
  postMessage?: (message: string) => void;
}

export type { CapsuleOrientation, CapsuleSize };

export interface CapsulePrefs {
  orientation: CapsuleOrientation;
  size: CapsuleSize;
}

const CAPSULE_PREFS_KEY = 'dayrhythm_capsule_prefs_v1';

function loadCapsulePrefs(): CapsulePrefs {
  if (typeof window === 'undefined') {
    return { orientation: 'horizontal', size: 'md' };
  }
  try {
    const raw = window.localStorage.getItem(CAPSULE_PREFS_KEY);
    if (!raw) return { orientation: 'horizontal', size: 'md' };
    const parsed = JSON.parse(raw) as Partial<CapsulePrefs>;
    const orientation: CapsuleOrientation =
      parsed.orientation === 'vertical' ? 'vertical' : 'horizontal';
    const size: CapsuleSize =
      parsed.size === 'sm' || parsed.size === 'lg' ? parsed.size : 'md';
    return { orientation, size };
  } catch {
    return { orientation: 'horizontal', size: 'md' };
  }
}

export interface CapsuleTrackInfo {
  emoji: string;
  title: string;
  statusLabel: string;
  clockLabel?: string;
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
  sourceKind: 'calendar' | 'task' | 'water' | 'medication' | 'none';
  countdownText: string;
  isNow: boolean;
  isUrgent: boolean;
  progressRatio: number;
  targetEpochMs: number;
  durationSeconds: number;
  calendarTrack?: CapsuleTrackInfo | null;
  taskTrack?: CapsuleTrackInfo | null;
  upcomingQueue?: CapsuleTrackInfo[];
  phoneBattery?: PhoneBatteryTelemetry | null;
  capsulePrefs?: CapsulePrefs;
  onChangeCapsulePrefs?: (next: CapsulePrefs) => void;
  onQuickLogWater?: () => void;
  nextMedicationQuick?: { id: string; name: string; doseTime24?: string; timeLabel?: string } | null;
  onQuickTakeMedication?: (id: string, doseTime24?: string) => void;
  onOpenDashboard: () => void;
}

function formatChargeEtaShort(etaMin?: number): string {
  if (typeof etaMin !== 'number' || !Number.isFinite(etaMin) || etaMin <= 0) return '';
  if (etaMin >= 60) {
    const h = Math.floor(etaMin / 60);
    const m = etaMin % 60;
    return m > 0 ? `${h}س ${m}د` : `${h}س`;
  }
  return `${etaMin}د`;
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
  upcomingQueue = [],
  phoneBattery,
  capsulePrefs,
  onChangeCapsulePrefs,
  onQuickLogWater,
  nextMedicationQuick = null,
  onQuickTakeMedication,
  onOpenDashboard,
}) => {
  const [visible, setVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [localPrefs, setLocalPrefs] = useState<CapsulePrefs>(loadCapsulePrefs);
  const [quickDoneFlash, setQuickDoneFlash] = useState<string | null>(null);

  const prefs = capsulePrefs ?? localPrefs;

  const updatePrefs = (patch: Partial<CapsulePrefs>) => {
    const next: CapsulePrefs = {
      orientation: patch.orientation ?? prefs.orientation,
      size: patch.size ?? prefs.size,
    };
    setLocalPrefs(next);
    try {
      window.localStorage.setItem(CAPSULE_PREFS_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failure
    }
    onChangeCapsulePrefs?.(next);
  };

  const flashQuickDone = (msg: string) => {
    setQuickDoneFlash(msg);
    window.setTimeout(() => {
      setQuickDoneFlash((curr) => (curr === msg ? null : curr));
    }, 1800);
  };

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
  const isNativeAndroidApk =
    typeof window !== 'undefined' &&
    Boolean((window as Window & { DayRhythmNative?: unknown }).DayRhythmNative);

  const docPiP: DocumentPictureInPictureApi | undefined =
    typeof window !== 'undefined'
      ? (window as Window & { documentPictureInPicture?: DocumentPictureInPictureApi })
          .documentPictureInPicture
      : undefined;
  const supportsDesktopPopout = Boolean(docPiP?.requestWindow);

  const showPhoneChargingBadge = Boolean(
    phoneBattery && phoneBattery.charging && Date.now() - phoneBattery.updatedAtMs < 30 * 60_000
  );
  const phoneReachedLimit = Boolean(
    showPhoneChargingBadge && phoneBattery && phoneBattery.levelPct >= phoneBattery.chargeLimitPct
  );
  const phoneEtaShort = showPhoneChargingBadge
    ? formatChargeEtaShort(phoneBattery?.chargeTimeRemainingMin)
    : '';
  const hasDualTimers = Boolean(calendarTrack && taskTrack);
  const isVertical = prefs.orientation === 'vertical';

  // Sleek size scale tokens matching the main app's obsidian-glass design system
  const sizeTokens =
    prefs.size === 'sm'
      ? {
          shellPad: isVertical ? 'px-2.5 py-2' : 'px-3 py-1.5',
          shellGap: isVertical ? 'gap-1.5' : 'gap-2',
          emojiCls: 'text-sm leading-none shrink-0',
          clockCls: 'font-digits text-[11px] font-bold tracking-tight shrink-0',
        }
      : prefs.size === 'lg'
        ? {
            shellPad: isVertical ? 'px-4 py-3' : 'px-4 py-2.5',
            shellGap: isVertical ? 'gap-2.5' : 'gap-3',
            emojiCls: 'text-lg leading-none shrink-0',
            clockCls: 'font-digits text-sm font-bold tracking-tight shrink-0',
          }
        : {
            shellPad: isVertical ? 'px-3 py-2.5' : 'px-3.5 py-2',
            shellGap: isVertical ? 'gap-2' : 'gap-2.5',
            emojiCls: 'text-[15px] leading-none shrink-0',
            clockCls: 'font-digits text-xs font-bold tracking-tight shrink-0',
          };

  // Keep native Windows free-floating DesktopCapsuleForm synced live outside the EXE window
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
          secondaryEmoji: taskTrack?.emoji ?? '💧',
          secondaryTitle: taskTrack?.title ?? '',
          secondaryCountdownText: taskTrack?.countdownText ?? '',
          secondaryTargetEpochMs: taskTrack?.targetEpochMs ?? 0,
          secondaryIsNow: taskTrack?.isNow ?? false,
          secondaryIsUrgent: taskTrack?.isUrgent ?? false,
          phoneBatteryPct: showPhoneChargingBadge && phoneBattery ? phoneBattery.levelPct : -1,
          phoneCharging: showPhoneChargingBadge,
          phoneChargeLimitPct: phoneBattery?.chargeLimitPct ?? 90,
          phoneChargeEtaMin:
            showPhoneChargingBadge && typeof phoneBattery?.chargeTimeRemainingMin === 'number'
              ? phoneBattery.chargeTimeRemainingMin
              : -1,
          orientation: prefs.orientation,
          size: prefs.size,
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
    prefs.orientation,
    prefs.size,
  ]);

  // Keep open Browser Document Picture-in-Picture mini capsule updated live every second
  useEffect(() => {
    const pipWin = pipWindowRef.current;
    if (!pipWin || pipWin.closed) return;
    const doc = pipWin.document;
    const shellEl = doc.getElementById('dr-pip-shell');
    const clockEl = doc.getElementById('dr-pip-clock');
    const emojiEl = doc.getElementById('dr-pip-emoji');
    const taskWrapEl = doc.getElementById('dr-pip-task-wrap');
    const taskEmojiEl = doc.getElementById('dr-pip-task-emoji');
    const taskClockEl = doc.getElementById('dr-pip-task-clock');
    const batEl = doc.getElementById('dr-pip-bat');

    const primary = hasDualTimers && calendarTrack ? calendarTrack : null;
    const displayClock = primary ? primary.countdownText : countdownText;
    const displayEmoji = primary ? primary.emoji : nextEmoji;
    const primaryUrgent = primary ? primary.isUrgent : isUrgent;
    const primaryNow = primary ? primary.isNow : isNow;
    const accent = primaryUrgent ? '#FF6B6B' : primaryNow ? '#4ADE80' : '#7FFFD4';

    if (shellEl) {
      shellEl.style.flexDirection = isVertical ? 'column' : 'row';
      shellEl.style.gap = isVertical ? '6px' : '10px';
      shellEl.style.borderRadius = isVertical ? '16px' : '999px';
    }
    if (clockEl) {
      clockEl.textContent = displayClock;
      clockEl.style.color = accent;
      clockEl.style.fontSize = prefs.size === 'lg' ? '15px' : prefs.size === 'sm' ? '12px' : '13.5px';
    }
    if (emojiEl) {
      emojiEl.textContent = displayEmoji;
      emojiEl.style.fontSize = prefs.size === 'lg' ? '18px' : prefs.size === 'sm' ? '13px' : '15px';
    }
    if (taskWrapEl && taskClockEl) {
      if (hasDualTimers && taskTrack) {
        taskWrapEl.style.display = 'inline-flex';
        taskWrapEl.style.borderRight = isVertical ? 'none' : '1px solid rgba(255,255,255,0.12)';
        taskWrapEl.style.paddingRight = isVertical ? '0' : '9px';
        taskWrapEl.style.borderTop = isVertical ? '1px solid rgba(255,255,255,0.12)' : 'none';
        taskWrapEl.style.paddingTop = isVertical ? '5px' : '0';
        if (taskEmojiEl) {
          taskEmojiEl.textContent = taskTrack.emoji;
          taskEmojiEl.style.fontSize = prefs.size === 'lg' ? '17px' : prefs.size === 'sm' ? '13px' : '15px';
        }
        taskClockEl.textContent = taskTrack.countdownText;
        taskClockEl.style.fontSize = prefs.size === 'lg' ? '15px' : prefs.size === 'sm' ? '12px' : '13.5px';
        taskClockEl.style.color = taskTrack.isUrgent
          ? '#FF6B6B'
          : taskTrack.isNow
            ? '#4ADE80'
            : taskTrack.emoji === '💧'
              ? '#38BDF8'
              : '#FCD34D';
      } else {
        taskWrapEl.style.display = 'none';
      }
    }
    if (batEl) {
      if (showPhoneChargingBadge && phoneBattery) {
        batEl.style.display = 'inline';
        batEl.textContent = phoneEtaShort
          ? `⚡${phoneBattery.levelPct}% · ${phoneEtaShort}`
          : `⚡${phoneBattery.levelPct}%`;
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
    phoneEtaShort,
    isVertical,
    prefs.size,
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

  // Mobile NEVER renders an in-app capsule — OnePlus 12R uses Native Dynamic Island (Live Alerts) + Persistent Notification!
  if (isNativeAndroidApk) {
    return null;
  }

  const openBrowserDesktopPopout = async () => {
    if (!docPiP?.requestWindow) return;
    try {
      if (pipWindowRef.current && !pipWindowRef.current.closed) {
        pipWindowRef.current.focus();
        return;
      }
      const scaleMult = prefs.size === 'lg' ? 1.18 : prefs.size === 'sm' ? 0.88 : 1;
      const popWidth = isVertical
        ? Math.round(138 * scaleMult)
        : Math.round((hasDualTimers ? 256 : 156) * scaleMult);
      const popHeight = isVertical
        ? Math.round((hasDualTimers ? 104 : 64) * scaleMult)
        : Math.round(52 * scaleMult);

      const pipWin = await docPiP.requestWindow({
        width: popWidth,
        height: popHeight,
      });
      pipWindowRef.current = pipWin;
      setMenuOpen(false);

      const primary = hasDualTimers && calendarTrack ? calendarTrack : null;
      const pClock = primary ? primary.countdownText : countdownText;
      const pEmoji = primary ? primary.emoji : nextEmoji;
      const pAccent = (primary ? primary.isUrgent : isUrgent) ? '#FF6B6B' : '#7FFFD4';
      const tEmoji = taskTrack?.emoji ?? '💧';
      const tAccent = tEmoji === '💧' ? '#38BDF8' : '#FCD34D';
      const emojiPx = prefs.size === 'lg' ? 18 : prefs.size === 'sm' ? 13 : 15;
      const clockPx = prefs.size === 'lg' ? 15 : prefs.size === 'sm' ? 12 : 13.5;

      const pipDoc = pipWin.document;
      pipDoc.title = 'إيقاع اليوم';
      pipDoc.documentElement.dir = 'rtl';
      pipDoc.documentElement.lang = 'ar';

      pipDoc.head.replaceChildren();
      const styleEl = pipDoc.createElement('style');
      styleEl.textContent = [
        '* { box-sizing: border-box; margin: 0; padding: 0; }',
        'body { background: #000000; color: #F4F4F5; font-family: "Cairo", "Segoe UI", system-ui, sans-serif; height: 100vh; display: flex; align-items: center; justify-content: center; padding: 4px; overflow: hidden; user-select: none; }',
        `#dr-pip-shell { width: 100%; height: 100%; border-radius: ${isVertical ? '16px' : '999px'}; background: linear-gradient(180deg, #10151E 0%, #07080B 100%); border: 1px solid rgba(255, 255, 255, 0.14); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); padding: 6px 12px; display: flex; flex-direction: ${isVertical ? 'column' : 'row'}; align-items: center; justify-content: center; gap: ${isVertical ? '6px' : '10px'}; }`,
        '.seg { display: inline-flex; align-items: center; gap: 6px; }',
        `#dr-pip-emoji, #dr-pip-task-emoji { font-size: ${emojiPx}px; line-height: 1; }`,
        `#dr-pip-clock, #dr-pip-task-clock { font-family: "JetBrains Mono", "Cascadia Mono", "Consolas", ui-monospace, monospace; font-variant-numeric: tabular-nums; direction: ltr; font-size: ${clockPx}px; font-weight: 700; }`,
        `#dr-pip-clock { color: ${pAccent}; }`,
        `#dr-pip-task-wrap { ${isVertical ? 'border-top: 1px solid rgba(255,255,255,0.12); padding-top: 5px;' : 'border-right: 1px solid rgba(255,255,255,0.12); padding-right: 9px;'} }`,
        '#dr-pip-bat { font-family: "JetBrains Mono", "Consolas", ui-monospace, monospace; font-variant-numeric: tabular-nums; direction: ltr; font-size: 11px; font-weight: 700; }',
      ].join('\n');
      pipDoc.head.appendChild(styleEl);

      pipDoc.body.replaceChildren();
      const shellEl = pipDoc.createElement('div');
      shellEl.id = 'dr-pip-shell';

      const primarySeg = pipDoc.createElement('span');
      primarySeg.className = 'seg';
      const primaryEmojiEl = pipDoc.createElement('span');
      primaryEmojiEl.id = 'dr-pip-emoji';
      primaryEmojiEl.textContent = pEmoji;
      const primaryClockEl = pipDoc.createElement('span');
      primaryClockEl.id = 'dr-pip-clock';
      primaryClockEl.textContent = pClock;
      primarySeg.append(primaryEmojiEl, primaryClockEl);

      const taskWrapEl = pipDoc.createElement('span');
      taskWrapEl.id = 'dr-pip-task-wrap';
      taskWrapEl.className = 'seg';
      taskWrapEl.style.display = hasDualTimers && taskTrack ? 'inline-flex' : 'none';
      const taskEmojiEl = pipDoc.createElement('span');
      taskEmojiEl.id = 'dr-pip-task-emoji';
      taskEmojiEl.textContent = tEmoji;
      const taskClockEl = pipDoc.createElement('span');
      taskClockEl.id = 'dr-pip-task-clock';
      taskClockEl.style.color = tAccent;
      taskClockEl.textContent = taskTrack?.countdownText ?? '';
      taskWrapEl.append(taskEmojiEl, taskClockEl);

      const batEl = pipDoc.createElement('span');
      batEl.id = 'dr-pip-bat';
      batEl.style.display = showPhoneChargingBadge ? 'inline' : 'none';
      batEl.style.color = phoneReachedLimit ? '#4ADE80' : '#FCD34D';
      batEl.textContent =
        showPhoneChargingBadge && phoneBattery
          ? phoneEtaShort
            ? `⚡${phoneBattery.levelPct}% · ${phoneEtaShort}`
            : `⚡${phoneBattery.levelPct}%`
          : '';

      shellEl.append(primarySeg, taskWrapEl, batEl);
      pipDoc.body.appendChild(shellEl);

      pipWin.addEventListener('pagehide', () => {
        pipWindowRef.current = null;
      });
    } catch {
      // ignore PiP rejection
    }
  };

  const renderShapeControls = () => (
    <div className="space-y-2.5 border-b border-white/[0.08] pb-2.5">
      <div className="space-y-1.5">
        <div className="px-0.5 text-[10px] font-semibold text-zinc-400">اتجاه الكبسولة</div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06] p-1">
          <button
            type="button"
            onClick={() => updatePrefs({ orientation: 'horizontal' })}
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
            onClick={() => updatePrefs({ orientation: 'vertical' })}
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
              onClick={() => updatePrefs({ size: opt.id })}
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

  const renderQuickCheckIn = () => {
    if (!onQuickLogWater && !(nextMedicationQuick && onQuickTakeMedication)) return null;
    return (
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
                flashQuickDone('تم تسجيل كوب ماء ✓');
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
                flashQuickDone(`تم تسجيل ${nextMedicationQuick.name} ✓`);
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
    );
  };

  // Inside native Windows EXE, the sleek native DesktopCapsuleForm floats freely on the desktop.
  // Provide only a clean obsidian-glass dock trigger with popover controls (no duplicate floating bar).
  if (isNativeWindowsExe) {
    return (
      <div className="hidden md:block fixed bottom-4 left-4 z-40">
        {menuOpen && (
          <div className="mb-2 w-64 rounded-2xl border border-white/[0.1] bg-[#0B0E14]/96 backdrop-blur-xl p-3 text-xs shadow-2xl space-y-2.5">
            {renderShapeControls()}
            <button
              type="button"
              onClick={() => {
                try {
                  webviewBridge?.postMessage?.(JSON.stringify({ type: 'show-native-capsule' }));
                } catch {
                  // ignore
                }
                setMenuOpen(false);
              }}
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
            onClick={() => {
              try {
                webviewBridge?.postMessage?.(JSON.stringify({ type: 'show-native-capsule' }));
              } catch {
                // ignore
              }
            }}
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

  // Desktop-only (md:flex / md:block) — Mobile NEVER shows an in-app floating capsule!
  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="hidden md:flex fixed bottom-4 left-4 z-40 rounded-full border border-white/[0.12] bg-gradient-to-b from-[#10151E] to-[#07080B] px-3.5 py-2 text-[11px] font-medium text-zinc-200 hover:border-[#7FFFD4]/50 hover:text-[#7FFFD4] items-center gap-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.65)] transition-colors cursor-pointer"
        title="إظهار كبسولة سطح المكتب العائمة"
      >
        <Eye className="w-3.5 h-3.5 text-[#7FFFD4]" />
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
      {/* Sleek Obsidian-Glass Desktop Capsule (Emoji + Tabular Countdown + Optional Phone Charging ETA) */}
      <div
        className={`flex ${
          isVertical ? 'flex-col items-center rounded-2xl' : 'flex-row items-center rounded-full'
        } ${sizeTokens.shellGap} ${sizeTokens.shellPad} border border-white/[0.14] bg-gradient-to-b from-[#10151E]/95 to-[#07080B]/95 backdrop-blur-xl shadow-[0_12px_36px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-[#7FFFD4]/40 transition-colors cursor-grab active:cursor-grabbing`}
        title={
          hasDualTimers && calendarTrack && taskTrack
            ? `${calendarTrack.title} (${calendarTrack.countdownText}) · ${taskTrack.title} (${taskTrack.countdownText})`
            : `${nextTitle} · ${statusLabel}`
        }
      >
        <GripHorizontal className="w-3.5 h-3.5 text-zinc-600 shrink-0" />

        {hasDualTimers && calendarTrack && taskTrack ? (
          <>
            <div
              className="flex items-center gap-1.5"
              title={`${calendarTrack.title}${calendarTrack.clockLabel ? ` (${calendarTrack.clockLabel})` : ''} · ${calendarTrack.statusLabel}`}
            >
              <span className={sizeTokens.emojiCls}>{calendarTrack.emoji}</span>
              <span
                className={`${sizeTokens.clockCls} ${
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

            <span
              className={
                isVertical
                  ? 'w-full h-px bg-white/[0.08] shrink-0'
                  : 'h-3.5 w-px bg-white/[0.12] shrink-0'
              }
            />

            <div
              className="flex items-center gap-1.5"
              title={`${taskTrack.title}${taskTrack.clockLabel ? ` — الساعة ${taskTrack.clockLabel}` : ''} · ${taskTrack.statusLabel}`}
            >
              <span className={sizeTokens.emojiCls}>{taskTrack.emoji}</span>
              <span
                className={`${sizeTokens.clockCls} ${
                  taskTrack.isUrgent
                    ? 'text-[#FF6B6B]'
                    : taskTrack.isNow
                      ? 'text-[#4ADE80]'
                      : taskTrack.emoji === '💧'
                        ? 'text-sky-300'
                        : 'text-amber-300'
                }`}
              >
                {taskTrack.countdownText}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5" title={`${nextTitle} · ${statusLabel}`}>
            <span className={sizeTokens.emojiCls}>{nextEmoji}</span>
            <span
              className={`${sizeTokens.clockCls} ${
                isUrgent ? 'text-[#FF6B6B]' : isNow ? 'text-[#4ADE80]' : 'text-[#7FFFD4]'
              }`}
            >
              {countdownText}
            </span>
          </div>
        )}

        {showPhoneChargingBadge && phoneBattery && (
          <span
            className={`flex items-center gap-1 font-digits text-[11px] font-bold ${
              isVertical
                ? 'border-t border-white/[0.08] pt-1.5'
                : 'border-r border-white/[0.12] pr-2'
            } ${phoneReachedLimit ? 'text-[#4ADE80]' : 'text-amber-300'}`}
            title={`شحن ${phoneBattery.deviceLabel}: ${phoneBattery.levelPct}%${phoneEtaShort ? ` · متبقي ${phoneEtaShort}` : ''} (الحد ${phoneBattery.chargeLimitPct}%)`}
          >
            <Zap className="w-3 h-3 shrink-0" />
            <span>{phoneBattery.levelPct}%</span>
            {phoneEtaShort && <span className="text-[10px] opacity-85">· {phoneEtaShort}</span>}
          </span>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={`rounded-full text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer ${
            isVertical
              ? 'w-full border-t border-white/[0.08] pt-1 flex items-center justify-center'
              : 'p-1'
          }`}
          aria-label="خيارات الكبسولة"
          title="خيارات الكبسولة"
        >
          <SlidersHorizontal className="w-3 h-3" />
        </button>
      </div>

      {/* Sleek Obsidian Popover Menu matching App UI */}
      {menuOpen && (
        <div className="mt-2 w-64 rounded-2xl border border-white/[0.1] bg-[#0B0E14]/96 backdrop-blur-xl p-3 text-xs shadow-[0_18px_48px_rgba(0,0,0,0.8)] space-y-2.5">
          {renderQuickCheckIn()}
          {renderShapeControls()}

          {upcomingQueue.length > 0 && (
            <div className="border-b border-white/[0.08] pb-2.5 space-y-1.5">
              <div className="px-0.5 text-[10px] font-semibold text-zinc-400">
                القادم خلال اليوم
              </div>
              {upcomingQueue.slice(0, 4).map((item, idx) => (
                <div
                  key={`${item.title}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm leading-none shrink-0">{item.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-zinc-100 truncate">
                        {item.title}
                      </div>
                      {item.clockLabel && (
                        <div className="text-[10px] text-zinc-500 font-digits">
                          {item.clockLabel}
                        </div>
                      )}
                    </div>
                  </div>
                  <span
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
                    {item.countdownText}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1">
            {supportsDesktopPopout && (
              <button
                type="button"
                onClick={() => void openBrowserDesktopPopout()}
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
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
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
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>إخفاء الكبسولة</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
