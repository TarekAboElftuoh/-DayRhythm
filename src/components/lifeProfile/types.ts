import { useEffect, useState } from 'react';
import type { CapsulePrefs } from '../FloatingPiPCapsule';
import type {
  GeoLocation,
  LifeProfile,
  MemoryCategory,
  MemoryItem,
  PhoneBatteryTelemetry,
  PrayerTimeItem,
  QuietModeType,
  SoundRepeatMap,
  SoundRepeatSetting,
  SunlightSettings,
  TaskSoundCategory,
} from '../../types/dayrhythm';

export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export interface LifeProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: LifeProfile;
  prayers: PrayerTimeItem[];
  activeLocation: GeoLocation;
  memories: MemoryItem[];
  onAddMemory: (input: { category: MemoryCategory; ruleText: string }) => void;
  onUpdateMemory?: (id: string, patch: { category: MemoryCategory; ruleText: string }) => void;
  onDeleteMemory: (id: string) => void;
  onSaveProfile: (next: LifeProfile) => void;
  onDetectGpsLocation: () => Promise<void>;
  isDetectingGps: boolean;
  includePrayerAnchors?: boolean;
  onToggleIncludePrayerAnchors?: () => void;
  isFridayMode?: boolean;
  onToggleFridayMode?: (v: boolean) => void;
  includeBiweeklyPcCleanup?: boolean;
  onToggleBiweeklyPcCleanup?: (v: boolean) => void;
  calendarConnected?: boolean;
  onGoogleSignOut?: () => Promise<void>;
  quietMode?: QuietModeType;
  onSetQuietMode?: (mode: QuietModeType, durationMinutes: number) => void;
  soundRepeats?: SoundRepeatMap;
  onUpdateSoundRepeat?: (category: TaskSoundCategory, setting: SoundRepeatSetting) => void;
  onTriggerTaskAlert?: (
    title: string,
    category: TaskSoundCategory,
    options?: { bypassSanctuary?: boolean; privacyEmoji?: string }
  ) => void;
  phoneBattery?: PhoneBatteryTelemetry | null;
  phoneChargeLimitPct?: number;
  onUpdatePhoneChargeLimit?: (limitPct: number) => void;
  smartChargeAlertEnabled?: boolean;
  onToggleSmartChargeAlertEnabled?: () => void;
  smartChargeKeepUntilUnplugged?: boolean;
  onToggleSmartChargeKeepUntilUnplugged?: () => void;
  smartChargeAudioActive?: boolean;
  onTestSmartChargeAlert?: () => void;
  onCheckAppUpdates?: () => void;
  activeBrandLogo?: { titleAr: string; src: string; isDefault?: boolean } | null;
  onOpenLogoPicker?: () => void;
  capsulePrefs?: CapsulePrefs;
  onChangeCapsulePrefs?: (next: CapsulePrefs) => void;
  googleDriveSynced?: boolean;
  onSyncGoogleDriveNow?: () => Promise<boolean>;
  isSyncingGoogleDrive?: boolean;
  onExportBackupJson?: () => void;
  onImportBackupJson?: (rawText: string) => Promise<{
    ok: boolean;
    summaryAr: string;
  }>;
  sunlightSettings?: SunlightSettings;
  onUpdateSunlightSettings?: (next: SunlightSettings) => void;
}

export type NumericProfileKey =
  | 'weightKg'
  | 'heightCm'
  | 'cupSizeMl'
  | 'suhoorLeadMinutes'
  | 'sleepTargetMinutes'
  | 'adhanLeadMinutes'
  | 'prayerSilenceMinutes'
  | 'fajrSilenceMinutes';

export const NUMERIC_FIELD_BOUNDS: Record<
  NumericProfileKey,
  { min: number; max: number; fallback: number; allowFloat?: boolean }
> = {
  weightKg: { min: 40, max: 200, fallback: 70, allowFloat: true },
  heightCm: { min: 120, max: 230, fallback: 177 },
  cupSizeMl: { min: 100, max: 1000, fallback: 250 },
  suhoorLeadMinutes: { min: 10, max: 120, fallback: 50 },
  sleepTargetMinutes: { min: 240, max: 720, fallback: 450 },
  adhanLeadMinutes: { min: 0, max: 30, fallback: 0 },
  prayerSilenceMinutes: { min: 0, max: 60, fallback: 20 },
  fajrSilenceMinutes: { min: 0, max: 90, fallback: 30 },
};

export function clampNumericProfileField(key: NumericProfileKey, raw: string | number): number {
  const { min, max, fallback, allowFloat } = NUMERIC_FIELD_BOUNDS[key];
  if (typeof raw === 'string' && raw.trim() === '') return fallback;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(max, Math.max(min, parsed));
  return allowFloat ? Math.round(clamped * 10) / 10 : Math.round(clamped);
}
