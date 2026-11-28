import React, { useEffect, useState } from 'react';

export const ChartLoadingFallback = () => (
  <div className="mt-3 h-40 rounded-xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
);

export const LiveSecClock: React.FC<{ initialSec?: number; fallback: string; resetKey: number }> = ({
  initialSec,
  fallback,
  resetKey,
}) => {
  const [sec, setSec] = useState<number | undefined>(initialSec);
  useEffect(() => {
    setSec(initialSec);
    if (typeof initialSec !== 'number') return;

    const endAtMs = Date.now() + Math.max(0, initialSec) * 1000;
    let intervalId: number | null = null;

    const syncFromClock = () => {
      setSec(Math.max(0, Math.round((endAtMs - Date.now()) / 1000)));
    };

    const startTicker = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(syncFromClock, 1000);
    };

    const stopTicker = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const onVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        stopTicker();
      } else {
        syncFromClock();
        startTicker();
      }
    };

    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
      startTicker();
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityOrFocus);
    }
    window.addEventListener('focus', onVisibilityOrFocus);

    return () => {
      stopTicker();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      }
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, [initialSec, resetKey]);
  if (typeof sec !== 'number') return <>{fallback}</>;
  const safe = Math.max(0, Math.floor(sec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return (
    <>
      {h > 0
        ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`}
    </>
  );
};

export function formatDurationLabel(totalMin: number): string {
  const safe = Math.max(5, Math.round(totalMin));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h > 0 && m > 0) return `${h} س ${m} د`;
  if (h > 0) return `${h} ساعة`;
  return `${m} دقيقة`;
}

export function formatCairoDayHeading(dateIso: string): string {
  const dt = new Date(`${dateIso}T12:00:00Z`);
  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(dt);
}

export function formatSecClock(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
