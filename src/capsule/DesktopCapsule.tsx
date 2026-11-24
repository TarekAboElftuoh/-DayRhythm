import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * The Windows desktop capsule, drawn with the app's own design system (same card surface,
 * aqua/green/coral accents, Cairo + JetBrains Mono fonts). Hosted in a tiny WebView2 window by
 * DesktopCapsuleForm.cs, which sends the state; this page sends back its size, drag, menu and
 * open requests.
 */

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

/** Live clock from the target time; falls back to the app's text when there's no target. */
function liveClock(targetEpochMs: number, fallback: string, baseUrgent: boolean, nowMs: number) {
  if (fallback === 'الآن') return { text: 'الآن', urgent: true };
  if (!targetEpochMs || targetEpochMs <= 0) return { text: fallback || '--:--', urgent: baseUrgent };
  const remaining = Math.max(0, Math.round((targetEpochMs - nowMs) / 1000));
  if (remaining === 0) return { text: 'الآن', urgent: true };
  const urgent = baseUrgent || (remaining > 0 && remaining <= 60);
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { text: h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`, urgent };
}

const accentClass = (urgent: boolean, now: boolean) =>
  urgent ? 'text-[#FF6B6B]' : now ? 'text-[#4ADE80]' : 'text-[#7FFFD4]';

export const DesktopCapsule: React.FC = () => {
  const [state, setState] = useState<CapsuleState>(() => {
    // Preview helper: capsule.html?demo=1 in a browser shows sample data.
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

  // State from the native window
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

  // 1-second tick for the live countdowns
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Tell the native window our exact size so it can fit and round itself.
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

  const primary = state.isNow
    ? { text: 'الآن', urgent: true }
    : liveClock(state.targetEpochMs, state.countdownText, state.isUrgent, nowMs);
  const secondary = state.hasSecondaryTimer
    ? (state.secondaryIsNow
        ? { text: 'الآن', urgent: true }
        : liveClock(state.secondaryTargetEpochMs, state.secondaryCountdownText, state.secondaryIsUrgent, nowMs))
    : null;
  const showBattery = state.phoneCharging && state.phoneBatteryPct >= 0;
  const batteryFull = showBattery && state.phoneBatteryPct >= state.phoneChargeLimitPct;
  const divider = vertical ? 'border-t border-white/[0.1] pt-2' : 'border-r border-white/[0.1] pr-2.5';

  const tooltip = [
    `${state.emoji} ${state.title || 'إيقاع اليوم'}`,
    secondary && state.secondaryTitle ? `${state.secondaryEmoji} ${state.secondaryTitle}` : '',
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
        <span className={`${tokens.emoji} leading-none`}>{state.emoji}</span>
        <span className={`font-digits font-bold tracking-tight ${tokens.clock} ${accentClass(primary.urgent, state.isNow)}`}>
          {primary.text}
        </span>
      </div>

      {secondary && (
        <div className={`inline-flex items-center gap-1.5 ${divider}`}>
          <span className={`${tokens.emoji} leading-none`}>{state.secondaryEmoji}</span>
          <span
            className={`font-digits font-bold tracking-tight ${tokens.clock} ${accentClass(secondary.urgent, state.secondaryIsNow)}`}
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
