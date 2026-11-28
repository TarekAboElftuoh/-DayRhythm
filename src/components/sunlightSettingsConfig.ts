import type {
  SunlightExposureMode,
  SunlightSessionId,
  SunlightSkinTone,
} from '../types/dayrhythm';
import type { SunlightZoneBounds } from '../engines/sunlightEngine';

export const SESSION_ORDER: SunlightSessionId[] = ['morning', 'noon', 'evening'];

export const SESSION_ZONES: Record<SunlightSessionId, SunlightZoneBounds> = {
  morning: { minUseful: 5, optimal: 12, maxUseful: 18, maxSafe: 20 },
  noon: { minUseful: 5, optimal: 15, maxUseful: 25, maxSafe: 30 },
  evening: { minUseful: 5, optimal: 15, maxUseful: 20, maxSafe: 25 },
};

export const SKIN_TONE_OPTIONS: Array<{ value: SunlightSkinTone; labelAr: string }> = [
  { value: 'fair', labelAr: 'فاتحة' },
  { value: 'wheat', labelAr: 'قمحية' },
  { value: 'dark', labelAr: 'سمراء' },
];

export const EXPOSURE_OPTIONS: Array<{ value: SunlightExposureMode; labelAr: string }> = [
  { value: 'auto', labelAr: 'تلقائي' },
  { value: 'face_hands', labelAr: 'وجه ويدين' },
  { value: 'arms_light', labelAr: 'ذراعين' },
];

export function buildZoneGradient(zones: SunlightZoneBounds): string {
  const min = zones.minUseful;
  const max = zones.maxSafe;
  const span = Math.max(1, max - min);
  const toPct = (val: number) => Math.max(0, Math.min(100, ((val - min) / span) * 100));
  const optPct = toPct(zones.optimal);
  const maxUsefulPct = toPct(zones.maxUseful);
  return `linear-gradient(to right, rgba(245, 158, 11, 0.35) 0%, rgba(16, 185, 129, 0.38) ${optPct.toFixed(1)}%, rgba(56, 189, 248, 0.35) ${maxUsefulPct.toFixed(1)}%, rgba(161, 161, 170, 0.22) 100%)`;
}
