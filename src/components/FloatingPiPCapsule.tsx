import React, { useEffect, useRef, useState } from 'react';
import {
  Eye,
  GripHorizontal,
  PictureInPicture2,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';
import { pickActiveCountdownItem } from '../hooks/useCountdown';
import {
  CAPSULE_PREFS_KEY,
  formatChargeEtaShort,
  loadCapsulePrefs,
  resolveDigitalClock,
  type CapsuleOrientation,
  type CapsulePrefs,
  type CapsuleSize,
  type CapsuleTrackInfo,
  type DocumentPictureInPictureApi,
  type FloatingPiPCapsuleProps,
  type WebView2Bridge,
} from './pip/types';
import { useNativeWindowsCapsule } from './pip/useNativeWindowsCapsule';
import { useDocumentPiP } from './pip/useDocumentPiP';
import { CapsulePopover } from './pip/CapsulePopover';
import { computePhoneBatteryBadge, getCapsuleSizeTokens, useCapsuleDrag } from './capsule/capsuleHelpers';
import { NativeWindowsCapsuleTrigger } from './capsule/NativeWindowsCapsuleTrigger';

export type { CapsuleOrientation, CapsuleSize, CapsulePrefs, CapsuleTrackInfo };

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

  const { offset, handlePointerDown, handlePointerMove, handlePointerUp } = useCapsuleDrag();

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

  const { phoneBatteryFresh, showPhoneChargingBadge, phoneReachedLimit, phoneEtaShort, phoneBatteryBadge } = computePhoneBatteryBadge(phoneBattery);
  const hasDualTimers = Boolean(calendarTrack && taskTrack);
  const isVertical = prefs.orientation === 'vertical';

  const sizeTokens = getCapsuleSizeTokens(prefs.size, isVertical);

  useNativeWindowsCapsule({
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
    prefs,
    upcomingQueue,
  });

  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (isNativeAndroidApk || isNativeWindowsExe) return;
    const id = window.setInterval(() => setNowTickMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isNativeAndroidApk, isNativeWindowsExe]);

  const primaryTrack: CapsuleTrackInfo = hasDualTimers && calendarTrack
    ? calendarTrack
    : { emoji: nextEmoji, title: nextTitle, statusLabel, countdownText, isNow, isUrgent, targetEpochMs, durationSeconds };
  const activePrimary = pickActiveCountdownItem(primaryTrack, upcomingQueue, nowTickMs);
  const activePrimaryRemMs = activePrimary.targetEpochMs > 0 ? Math.max(0, activePrimary.targetEpochMs - nowTickMs) : 0;
  const activePrimaryClock = resolveDigitalClock(activePrimary.targetEpochMs, activePrimary.countdownText, nowTickMs);
  const activePrimaryUrgent = activePrimary.targetEpochMs > 0 ? activePrimaryRemMs <= 60_000 : activePrimary.isUrgent;

  const activeTask = taskTrack
    ? pickActiveCountdownItem(
        taskTrack,
        upcomingQueue.filter((q) => q.targetEpochMs > nowTickMs && q.targetEpochMs !== activePrimary.targetEpochMs),
        nowTickMs
      )
    : null;
  const activeTaskRemMs = activeTask && activeTask.targetEpochMs > 0 ? Math.max(0, activeTask.targetEpochMs - nowTickMs) : 0;
  const activeTaskClock = activeTask
    ? resolveDigitalClock(activeTask.targetEpochMs, activeTask.countdownText, nowTickMs)
    : '';
  const activeTaskUrgent = Boolean(activeTask && (activeTask.targetEpochMs > 0 ? activeTaskRemMs <= 60_000 : activeTask.isUrgent));

  const { openBrowserDesktopPopout } = useDocumentPiP({
    docPiP,
    prefs,
    isVertical,
    hasDualTimers,
    calendarTrack,
    taskTrack,
    nextEmoji,
    isUrgent,
    activePrimary,
    activePrimaryClock,
    activePrimaryUrgent,
    activeTask,
    activeTaskClock,
    activeTaskUrgent,
    phoneBatteryBadge,
    phoneReachedLimit,
    onMenuClose: () => setMenuOpen(false),
  });

  if (isNativeAndroidApk) return null;

  if (isNativeWindowsExe) {
    const showNative = () => {
      try {
        webviewBridge?.postMessage?.(JSON.stringify({ type: 'show-native-capsule' }));
      } catch {
        // ignore
      }
    };
    return (
      <NativeWindowsCapsuleTrigger
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        prefs={prefs}
        updatePrefs={updatePrefs}
        showNative={showNative}
      />
    );
  }

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
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen((v) => !v); }}
      style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
      className="hidden md:block fixed bottom-5 left-5 z-40 select-none touch-none"
    >
      <div
        className={`flex ${isVertical ? 'flex-col items-center rounded-2xl' : 'flex-row items-center rounded-full'} ${sizeTokens.shellGap} ${sizeTokens.shellPad} border border-white/[0.14] bg-gradient-to-b from-[#10151E]/95 to-[#07080B]/95 shadow-[0_12px_36px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-[#7FFFD4]/40 transition-colors cursor-grab active:cursor-grabbing`}
        title={
          hasDualTimers && activeTask
            ? `${activePrimary.title} (${activePrimaryClock}) · ${activeTask.title} (${activeTaskClock})`
            : `${activePrimary.title} · ${activePrimary.statusLabel ?? statusLabel}`
        }
      >
        <GripHorizontal className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
        <div className="flex items-center gap-1.5" title={`${activePrimary.title}${activePrimary.clockLabel ? ` (${activePrimary.clockLabel})` : ''} · ${activePrimary.statusLabel ?? statusLabel}`}>
          <span className={sizeTokens.emojiCls}>{activePrimary.emoji}</span>
          <span dir="ltr" className={`${sizeTokens.clockCls} ${activePrimaryUrgent ? 'text-[#FF6B6B]' : activePrimary.isNow ? 'text-[#4ADE80]' : 'text-[#7FFFD4]'}`}>
            {activePrimaryClock}
          </span>
        </div>

        {hasDualTimers && activeTask && (
          <>
            <span className={isVertical ? 'w-full h-px bg-white/[0.08] shrink-0' : 'h-3.5 w-px bg-white/[0.12] shrink-0'} />
            <div className="flex items-center gap-1.5" title={`${activeTask.title}${activeTask.clockLabel ? ` — الساعة ${activeTask.clockLabel}` : ''} · ${activeTask.statusLabel ?? ''}`}>
              <span className={sizeTokens.emojiCls}>{activeTask.emoji}</span>
              <span dir="ltr" className={`${sizeTokens.clockCls} ${activeTaskUrgent ? 'text-[#FF6B6B]' : activeTask.isNow ? 'text-[#4ADE80]' : activeTask.emoji === '💧' ? 'text-sky-300' : 'text-amber-300'}`}>
                {activeTaskClock}
              </span>
            </div>
          </>
        )}

        {phoneBatteryFresh && phoneBattery && (
          <span
            className={`flex items-center gap-1 font-digits text-[11px] font-bold ${isVertical ? 'border-t border-white/[0.08] pt-1.5' : 'border-r border-white/[0.12] pr-2'} ${phoneReachedLimit ? 'text-[#4ADE80]' : 'text-amber-300'}`}
            title={`بطارية ${phoneBattery.deviceLabel}: ${phoneBattery.levelPct}%${phoneEtaShort ? ` · متبقي ${phoneEtaShort}` : ''} (الحد ${phoneBattery.chargeLimitPct}%)`}
          >
            <Zap className="w-3 h-3 shrink-0" />
            <span>{phoneBattery.levelPct}%</span>
            {phoneEtaShort && <span className="text-[10px] opacity-85">· {phoneEtaShort}</span>}
          </span>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={`rounded-full text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer ${isVertical ? 'w-full border-t border-white/[0.08] pt-1 flex items-center justify-center' : 'p-1'}`}
          aria-label="خيارات الكبسولة"
          title="خيارات الكبسولة"
        >
          <SlidersHorizontal className="w-3 h-3" />
        </button>
      </div>

      {menuOpen && (
        <CapsulePopover
          prefs={prefs}
          onUpdatePrefs={updatePrefs}
          quickDoneFlash={quickDoneFlash}
          onFlashQuickDone={flashQuickDone}
          onQuickLogWater={onQuickLogWater}
          nextMedicationQuick={nextMedicationQuick}
          onQuickTakeMedication={onQuickTakeMedication}
          upcomingQueue={upcomingQueue}
          nowTickMs={nowTickMs}
          supportsDesktopPopout={supportsDesktopPopout}
          onOpenPopout={() => void openBrowserDesktopPopout()}
          onOpenDashboard={onOpenDashboard}
          onHideCapsule={() => { setVisible(false); setMenuOpen(false); }}
          onCloseMenu={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
};
