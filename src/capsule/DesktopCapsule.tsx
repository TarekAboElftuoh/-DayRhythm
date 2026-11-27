import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pickActiveCountdownItem } from '../hooks/useCountdown';

/**
 * The Windows desktop capsule, drawn with the app's own design system (same card surface,
 * aqua/green/coral accents, Cairo + JetBrains Mono fonts). Hosted in a tiny WebView2 window by
 * DesktopCapsuleForm.cs, which sends the state; this page sends back its size, drag, menu and
 * open requests.
 */

interface CapsuleQueueItem {
  emoji: string;
  title: string;
  statusLabel?: string;
  clockLabel?: string;
  countdownText: string;
  isNow: boolean;
  isUrgent: boolean;
  targetEpochMs: number;
  durationSeconds?: number;
}

interface CapsuleState {
  emoji: string;
  title: string;
  countdownText: string;
  isNow: boolean;
  isUrgent: boolean;
  targetEpochMs: number;
  hasSecondaryTimer: boolean;
  secondaryEmoji: string;
  secondaryTitle: string;
  secondaryCountdownText: string;
  secondaryTargetEpochMs: number;
  secondaryIsNow: boolean;
  secondaryIsUrgent: boolean;
  upcomingQueue?: CapsuleQueueItem[];
  phoneBatteryPct: number;
  phoneCharging: boolean;
  phoneChargeLimitPct: number;
  phoneChargeEtaMin: number;
  orientation: string;
  size: string;
}

const EMPTY_STATE: CapsuleState = {
  emoji: '📅',
  title: 'إيقاع اليوم',
  countdownText: '--:--',
  isNow: false,
  isUrgent: false,
  targetEpochMs: 0,
  hasSecondaryTimer: false,
  secondaryEmoji: '💧',
  secondaryTitle: '',
  secondaryCountdownText: '',
  secondaryTargetEpochMs: 0,
  secondaryIsNow: false,
  secondaryIsUrgent: false,
  upcomingQueue: [],
  phoneBatteryPct: -1,
  phoneCharging: false,
  phoneChargeLimitPct: 90,
  phoneChargeEtaMin: -1,
  orientation: 'horizontal',
  size: 'md',
};

type WebViewBridge = {
  postMessage: (msg: string) => void;
  addEventListener: (type: 'message', cb: (e: { data: unknown }) => void) => void;
  removeEventListener: (type: 'message', cb: (e: { data: unknown }) => void) => void;
};

function bridge(): WebViewBridge | undefined {
  return (window as Window & { chrome?: { webview?: WebViewBridge } }).chrome?.webview;
}

function post(msg: Record<string, unknown>) {
  try {
    bridge()?.postMessage(JSON.stringify(msg));
  } catch {
    // not hosted in WebView2 (e.g. opened in a normal browser for preview)
  }
}

function formatNumericCountdown(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '00:00';
  const totalSec = Math.ceil(remainingMs / 1000);
  if (totalSec <= 0) return '00:00';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Smooth clock from targetEpochMs: <H:MM:SS> when >= 1h, otherwise <MM:SS> down to 00:00. */
function liveClock(targetEpochMs: number, fallback: string, baseUrgent: boolean, nowMs: number) {
  if (!targetEpochMs || targetEpochMs <= 0) {
    const cleanFallback = !fallback || fallback === 'الآن' ? '00:00' : fallback;
    return { text: cleanFallback, urgent: baseUrgent };
  }
  const remMs = Math.max(0, targetEpochMs - nowMs);
  return {
    text: formatNumericCountdown(remMs),
    urgent: remMs <= 60_000,
  };
}

const accentClass = (urgent: boolean, now: boolean) =>
  urgent ? 'text-[#FF6B6B]' : now ? 'text-[#4ADE80]' : 'text-[#7FFFD4]';

export const DesktopCapsule: React.FC = () => {
  const [state, setState] = useState<CapsuleState>(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      return {
        ...EMPTY_STATE,
        emoji: '🕌',
        title: 'صلاة العصر',
        targetEpochMs: Date.now() + 42 * 60_000,
        hasSecondaryTimer: true,
        secondaryEmoji: '💧',
        secondaryTitle: 'كوب مية',
        secondaryTargetEpochMs: Date.now() + 12 * 60_000,
        phoneBatteryPct: 82,
        phoneCharging: true,
        phoneChargeEtaMin: 18,
      };
    }
    return EMPTY_STATE;
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const b = bridge();
    if (!b) return;
    const onMsg = (e: { data: unknown }) => {
      const data = e.data as { type?: string; state?: Partial<CapsuleState> } | null;
      if (data?.type === 'capsule-state' && data.state) {
        setState((prev) => ({ ...prev, ...data.state }));
      }
    };
    b.addEventListener('message', onMsg);
    return () => b.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || r.height / 2;
      post({ type: 'capsule-size', w: Math.ceil(r.width), h: Math.ceil(r.height), radius });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    void document.fonts?.ready.then(report);
    return () => ro.disconnect();
  }, []);

  const vertical = state.orientation === 'vertical';
  const size = state.size === 'sm' || state.size === 'lg' ? state.size : 'md';
  const tokens = {
    sm: { pad: vertical ? 'px-2.5 py-2' : 'px-3 py-1.5', gap: 'gap-2', emoji: 'text-sm', clock: 'text-[12px]', chip: 'text-[10px]' },
    md: { pad: vertical ? 'px-3 py-2.5' : 'px-3.5 py-2', gap: 'gap-2.5', emoji: 'text-[15px]', clock: 'text-[13.5px]', chip: 'text-[11px]' },
    lg: { pad: vertical ? 'px-4 py-3' : 'px-4 py-2.5', gap: 'gap-3', emoji: 'text-lg', clock: 'text-[15px]', chip: 'text-xs' },
  }[size];

  // Auto-roll to the next event in upcomingQueue immediately when primary finishes
  const activePrimary = pickActiveCountdownItem(
    {
      emoji: state.emoji,
      title: state.title,
      countdownText: state.countdownText,
      isNow: state.isNow,
      isUrgent: state.isUrgent,
      targetEpochMs: state.targetEpochMs,
    },
    state.upcomingQueue,
    nowMs
  );

  const primary = liveClock(
    activePrimary.targetEpochMs,
    activePrimary.countdownText,
    activePrimary.isUrgent,
    nowMs
  );

  const secondaryCandidate = state.hasSecondaryTimer
    ? pickActiveCountdownItem(
        {
          emoji: state.secondaryEmoji,
          title: state.secondaryTitle,
          countdownText: state.secondaryCountdownText,
          isNow: state.secondaryIsNow,
          isUrgent: state.secondaryIsUrgent,
          targetEpochMs: state.secondaryTargetEpochMs,
        },
        state.upcomingQueue?.filter(
          (q) => q.targetEpochMs > nowMs && q.targetEpochMs !== activePrimary.targetEpochMs
        ),
        nowMs
      )
    : null;

  const secondary =
    secondaryCandidate && (secondaryCandidate.targetEpochMs > nowMs || !secondaryCandidate.targetEpochMs)
      ? liveClock(
          secondaryCandidate.targetEpochMs,
          secondaryCandidate.countdownText,
          secondaryCandidate.isUrgent,
          nowMs
        )
      : null;

  const showBattery = state.phoneCharging && state.phoneBatteryPct >= 0;
  const batteryFull = showBattery && state.phoneBatteryPct >= state.phoneChargeLimitPct;
  const divider = vertical ? 'border-t border-white/[0.1] pt-2' : 'border-r border-white/[0.1] pr-2.5';

  const tooltip = [
    `${activePrimary.emoji} ${activePrimary.title || 'إيقاع اليوم'}`,
    secondary && secondaryCandidate?.title ? `${secondaryCandidate.emoji} ${secondaryCandidate.title}` : '',
    showBattery ? `⚡ بطارية الهاتف ${state.phoneBatteryPct}%` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div
      ref={shellRef}
      title={tooltip}
      onMouseDown={(e) => {
        if (e.button === 0 && e.detail === 1) post({ type: 'capsule-drag' });
      }}
      onDoubleClick={() => post({ type: 'capsule-open' })}
      onContextMenu={(e) => {
        e.preventDefault();
        post({ type: 'capsule-menu' });
      }}
      className={`inline-flex ${vertical ? 'flex-col items-stretch rounded-2xl' : 'flex-row items-center rounded-full'} ${tokens.pad} ${tokens.gap} bg-[#0B0E14] border border-white/[0.08] cursor-grab active:cursor-grabbing whitespace-nowrap`}
    >
      <div className="inline-flex items-center gap-1.5">
        <span className={`${tokens.emoji} leading-none`}>{activePrimary.emoji}</span>
        <span className={`font-digits font-bold tracking-tight ${tokens.clock} ${accentClass(primary.urgent, activePrimary.isNow)}`}>
          {primary.text}
        </span>
      </div>

      {secondary && secondaryCandidate && (
        <div className={`inline-flex items-center gap-1.5 ${divider}`}>
          <span className={`${tokens.emoji} leading-none`}>{secondaryCandidate.emoji}</span>
          <span
            className={`font-digits font-bold tracking-tight ${tokens.clock} ${accentClass(secondary.urgent, secondaryCandidate.isNow)}`}
          >
            {secondary.text}
          </span>
        </div>
      )}

      {showBattery && (
        <div className={`inline-flex items-center ${divider}`}>
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${tokens.chip} ${
              batteryFull
                ? 'bg-[#4ADE80]/15 text-[#4ADE80]'
                : 'bg-[#7FFFD4]/10 text-[#7FFFD4]'
            }`}
          >
            ⚡{state.phoneBatteryPct}%{state.phoneChargeEtaMin > 0 ? ` · ${state.phoneChargeEtaMin}د` : ''}
          </span>
        </div>
      )}
    </div>
  );
};
