import type {
  AppSettingsPatch,
  LifeProfile,
  MedicationFastingPolicy,
  MedicationFastingPolicyUpdate,
  QuietModeType,
  SanctuarySilenceModeOption,
  SettingsDiffItem,
  SettingsSnapshotContext,
  SleepStrategy,
  TaskSoundCategory,
  TravelDeferrableCategory,
  TravelDurationMode,
  TravelStatePatch,
  UnifiedSettingsPatch,
} from '../../types/dayrhythm';
import { BLOCKED_CANONICAL_KEYS, WEEKDAY_NAMES_AR } from './constants';

export interface SettingsPatchValidationResult {
  valid: boolean;
  hasChanges: boolean;
  normalizedPatch: UnifiedSettingsPatch;
  profilePatch: Partial<LifeProfile>;
  appSettingsPatch: AppSettingsPatch;
  fastingOverride?: 'auto' | 'fasting' | 'normal';
  sanctuaryOverrideUntilMs?: number;
  cancelActiveSanctuaryEarly?: boolean;
  travelStatePatch?: TravelStatePatch;
  medicationFastingPolicies: MedicationFastingPolicyUpdate[];
  diffs: SettingsDiffItem[];
  errors: string[];
  warnings: string[];
  blockedKeys: string[];
  affectsAlarms: boolean;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalKeyName(key: string): string {
  return key.replace(/[_-]/g, '').toLowerCase();
}

export function isBlockedSettingKey(key: string): boolean {
  const canonical = canonicalKeyName(key);
  if (BLOCKED_CANONICAL_KEYS.has(canonical)) return true;
  if (
    canonical.includes('apikey') ||
    canonical.includes('firebaseconfig') ||
    canonical.includes('authtoken') ||
    canonical.includes('accesstoken') ||
    canonical.includes('refreshtoken')
  ) {
    return true;
  }
  return false;
}

export function collectBlockedKeysDeep(
  value: unknown,
  prefix: string,
  blockedOut: string[],
  warningsOut: string[]
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, idx) =>
      collectBlockedKeysDeep(item, `${prefix}[${idx}]`, blockedOut, warningsOut)
    );
  }
  if (!isPlainRecord(value)) return value;

  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (isBlockedSettingKey(k)) {
      blockedOut.push(fullKey);
      warningsOut.push(
        `تم حظر المفتاح الحساس «${k}» لأسباب أمنية ولا يمكن تعديله أو الوصول إليه.`
      );
      continue;
    }
    cleaned[k] = collectBlockedKeysDeep(v, fullKey, blockedOut, warningsOut);
  }
  return cleaned;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isValidTime24(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function formatTime24Ar(hhmm?: string): string {
  if (!hhmm || !isValidTime24(hhmm)) return 'تلقائي';
  const [hhStr, mmStr] = hhmm.split(':');
  const hh = Number(hhStr);
  const period = hh >= 12 ? 'م' : 'ص';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mmStr} ${period}`;
}

export function formatWeekdaysAr(days?: number[]): string {
  if (!days || days.length === 0) return 'لا يوجد';
  return days.map((d) => WEEKDAY_NAMES_AR[d] ?? String(d)).join('، ');
}

export function normalizeWeekdayArray(
  raw: unknown,
  labelAr: string,
  errors: string[]
): number[] | undefined {
  if (!Array.isArray(raw)) {
    errors.push(`${labelAr}: يجب أن تكون قائمة أيام أسبوع (أرقام من 0 إلى 6).`);
    return undefined;
  }
  const clean: number[] = [];
  for (const item of raw) {
    if (!isFiniteNumber(item) || !Number.isInteger(item) || item < 0 || item > 6) {
      errors.push(`${labelAr}: رقم اليوم غير صالح (المسموح 0 للأحد حتى 6 للسبت).`);
      return undefined;
    }
    if (!clean.includes(item)) clean.push(item);
  }
  return clean.sort((a, b) => a - b);
}

export function formatMinutesAsHoursAr(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h} س (${minutes} د)`;
}

export function sameNumberArray(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export function readBooleanFlag(
  raw: Record<string, unknown>,
  primaryKey: string,
  aliasKey?: string
): { present: boolean; value?: boolean; invalidKey?: string } {
  if (primaryKey in raw && raw[primaryKey] !== undefined) {
    if (typeof raw[primaryKey] === 'boolean') {
      return { present: true, value: raw[primaryKey] };
    }
    return { present: true, invalidKey: primaryKey };
  }
  if (aliasKey && aliasKey in raw && raw[aliasKey] !== undefined) {
    if (typeof raw[aliasKey] === 'boolean') {
      return { present: true, value: raw[aliasKey] };
    }
    return { present: true, invalidKey: aliasKey };
  }
  return { present: false };
}

/**
 * Strict, type-safe whitelist validator and normalizer for any Gemini or UI settings patch.
 * Strips blocklisted security keys, validates/clamps numeric bounds with Arabic messages,
 * and produces human-readable Arabic before -> after diffs.
 */

export interface SettingsValidationCtx {
  sanitizedRaw: Record<string, unknown>;
  currentProfile: LifeProfile;
  currentApp: AppSettingsPatch;
  context?: SettingsSnapshotContext;
  currentChargeLimit: number;
  currentWaterReminders: boolean;
  currentQuietMode: QuietModeType;
  currentFastingOverride: 'auto' | 'fasting' | 'normal';
  currentSanctuaryMode: SanctuarySilenceModeOption;
  errors: string[];
  warnings: string[];
  blockedKeys: string[];
  diffs: SettingsDiffItem[];
  normalizedPatch: UnifiedSettingsPatch;
  profilePatch: Partial<LifeProfile>;
  appSettingsPatch: AppSettingsPatch;
  medicationFastingPolicies: MedicationFastingPolicyUpdate[];
  fastingOverrideOut: 'auto' | 'fasting' | 'normal' | undefined;
  sanctuaryOverrideUntilMsOut: number | undefined;
  cancelActiveSanctuaryEarlyOut: boolean | undefined;
  travelStatePatchOut: TravelStatePatch | undefined;
  affectsAlarms: boolean;
}
