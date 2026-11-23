/**
 * Universal platform detection service for DayRhythm.
 * Distinguishes cleanly between Desktop (Windows PC / Mac) and Mobile (Android APK / Smartphone).
 */

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  // 1. Android WebKit Bridge
  if (Boolean((window as Window & { DayRhythmNative?: unknown }).DayRhythmNative)) {
    return true;
  }
  // 2. Mobile User Agent
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

export function isDesktopDevice(): boolean {
  return !isMobileDevice();
}

export function isWindowsNative(): boolean {
  if (typeof window === 'undefined') return false;
  const wv = (window as Window & { chrome?: { webview?: { postMessage?: (msg: string) => void } } })
    .chrome?.webview;
  return Boolean(wv?.postMessage);
}

export function isAndroidNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as Window & { DayRhythmNative?: unknown }).DayRhythmNative);
}

/**
 * Protocol 1: WebSocket Full-Duplex LAN Broadcast
 * Immediately transmits events (quiet mode, alarm dismiss, settings changes, buttons)
 * across the local Wi-Fi in < 50ms between Windows PC and Android.
 */
export function dispatchLanBroadcast(payload: Record<string, unknown>): void {
  try {
    const jsonStr = JSON.stringify({
      ...payload,
      clientId: payload.clientId || `client_${Math.random().toString(36).substring(2, 9)}`,
      timestampMs: payload.timestampMs || Date.now(),
    });

    // 1. Windows PC WebView2
    if (isWindowsNative()) {
      const wv = (window as Window & { chrome?: { webview?: { postMessage: (msg: unknown) => void } } }).chrome?.webview;
      wv?.postMessage({
        type: 'lan_broadcast',
        payload: JSON.parse(jsonStr),
      });
      return;
    }

    // 2. Android Native WebKit
    if (isAndroidNativeApp()) {
      const bridge = (window as Window & { DayRhythmNative?: { broadcastLanMessage?: (msg: string) => void } }).DayRhythmNative;
      bridge?.broadcastLanMessage?.(jsonStr);
      return;
    }
  } catch {
    // Non-blocking LAN broadcast
  }
}
