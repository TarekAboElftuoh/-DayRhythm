/**
 * Real time, independent of this device's clock. The Windows host measures how far the PC clock
 * is from network time (NTP) and sends the difference; reminders fire on true time so the PC and
 * the phone (which keeps network time) ring together even when Windows' clock has drifted.
 */
let offsetMs = 0;

export function trueNowMs(): number {
  return Date.now() + offsetMs;
}

export function setClockOffsetMs(value: unknown): void {
  const v = Number(value);
  // Ignore nonsense; a real drift is seconds, not hours.
  if (Number.isFinite(v) && Math.abs(v) < 60 * 60_000) offsetMs = Math.round(v);
}

if (typeof window !== 'undefined') {
  setClockOffsetMs((window as Window & { __drClockOffsetMs?: number }).__drClockOffsetMs ?? 0);
  window.addEventListener('dayrhythm:clock-offset', (ev) => {
    setClockOffsetMs((ev as CustomEvent<number>).detail);
  });
}
