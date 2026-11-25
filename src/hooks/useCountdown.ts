/**
 * useCountdown — anchored real-time countdown from an absolute epoch target.
 *
 * Returns remaining milliseconds computed directly from Date.now() every 500ms
 * in small leaf components so it is immune to parent re-renders or sync delays.
 * Never call this inside root App().
 */
import { useEffect, useRef, useState } from 'react';

export function useCountdown(targetEpochMs: number): number {
  const [remainingMs, setRemainingMs] = useState(() =>
    targetEpochMs > 0 ? Math.max(0, targetEpochMs - Date.now()) : 0
  );
  const targetRef = useRef(targetEpochMs);
  targetRef.current = targetEpochMs;

  useEffect(() => {
    if (targetEpochMs <= 0) {
      setRemainingMs(0);
      return;
    }
    const id = window.setInterval(() => {
      const next = Math.max(0, targetRef.current - Date.now());
      setRemainingMs(next);
      if (next === 0) window.clearInterval(id);
    }, 500);
    setRemainingMs(Math.max(0, targetEpochMs - Date.now()));
    return () => window.clearInterval(id);
  }, [targetEpochMs]);

  return remainingMs;
}

/**
 * Formats remaining ms smoothly:
 *  - > 60 s  → "X دقيقة" (or "H س M د" when >= 60 min)
 *  - <= 60 s → "MM:SS" second-by-second countdown (01:00 → 00:59 → ... → 00:00)
 */
export function formatCountdown(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '00:00';
  const totalSec = Math.ceil(remainingMs / 1000);
  if (totalSec <= 0) return '00:00';
  if (totalSec > 60) {
    const totalMins = Math.ceil(totalSec / 60);
    if (totalMins >= 60) {
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      return m > 0 ? `${h} س ${m} د` : `${h} ساعة`;
    }
    return `${totalMins} دقيقة`;
  }
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface CountdownQueueItem {
  emoji: string;
  title: string;
  statusLabel?: string;
  clockLabel?: string;
  countdownText: string;
  isNow: boolean;
  isUrgent: boolean;
  targetEpochMs: number;
}

/**
 * Picks the active upcoming item from `primary` + `queue` at `nowMs`.
 * Once the active target hits 0, automatically advances to the next item in `queue`
 * instead of stalling on stale text.
 */
export function pickActiveCountdownItem<T extends CountdownQueueItem>(
  primary: T,
  queue: T[] | undefined,
  nowMs: number
): T {
  if (primary.targetEpochMs > nowMs) return primary;
  if (queue && queue.length > 0) {
    const nextFuture = queue.find((item) => item.targetEpochMs > nowMs);
    if (nextFuture) return nextFuture;
  }
  return primary;
}
