import { Capacitor } from '@capacitor/core';

/**
 * Universal platform detection service for DayRhythm.
 * Distinguishes cleanly between Desktop (Windows PC / Mac) and Mobile (Android APK / Smartphone).
 */

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  // 1. Android Native Capacitor Bridge
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      return true;
    }
  } catch {
    // ignore
  }
  // 2. Legacy / Custom Android WebKit Bridge
  if (Boolean((window as Window & { DayRhythmNative?: unknown }).DayRhythmNative)) {
    return true;
  }
  // 3. Mobile User Agent
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
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      return true;
    }
  } catch {
    // ignore
  }
  return Boolean((window as Window & { DayRhythmNative?: unknown }).DayRhythmNative);
}
