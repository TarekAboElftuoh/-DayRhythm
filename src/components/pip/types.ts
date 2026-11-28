import type {
  CapsuleOrientation,
  CapsuleSize,
  PhoneBatteryTelemetry,
} from '../../types/dayrhythm';

export interface DocumentPictureInPictureApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
}

export interface WebView2Bridge {
  postMessage?: (message: string) => void;
}

export type { CapsuleOrientation, CapsuleSize };

export interface CapsulePrefs {
  orientation: CapsuleOrientation;
  size: CapsuleSize;
}

export const CAPSULE_PREFS_KEY = 'dayrhythm_capsule_prefs_v1';

export function loadCapsulePrefs(): CapsulePrefs {
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

export interface FloatingPiPCapsuleProps {
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

export function formatDigitalCountdown(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '00:00';
  const totalSec = Math.ceil(remainingMs / 1000);
  if (totalSec <= 0) return '00:00';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function resolveDigitalClock(
  targetEpochMs: number,
  countdownText: string | undefined,
  nowMs: number
): string {
  if (targetEpochMs > 0) {
    return formatDigitalCountdown(Math.max(0, targetEpochMs - nowMs));
  }
  const trimmed = (countdownText ?? '').trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) return trimmed;
  if (!trimmed || trimmed === 'الآن') return '00:00';

  const hMatch = trimmed.match(/(\d+)\s*(?:ساعة|س|h)/i);
  const mMatch = trimmed.match(/(\d+)\s*(?:دقيقة|دقائق|د|m)/i);
  const sMatch = trimmed.match(/(\d+)\s*(?:ثانية|ث|s)/i);
  const h = hMatch ? Number(hMatch[1]) : 0;
  const m = mMatch ? Number(mMatch[1]) : 0;
  const s = sMatch ? Number(sMatch[1]) : 0;
  const totalMs = (h * 3600 + m * 60 + s) * 1000;
  return totalMs > 0 ? formatDigitalCountdown(totalMs) : '00:00';
}

export function formatChargeEtaShort(etaMin?: number): string {
  if (typeof etaMin !== 'number' || !Number.isFinite(etaMin) || etaMin <= 0) return '';
  const totalMin = Math.round(etaMin);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
