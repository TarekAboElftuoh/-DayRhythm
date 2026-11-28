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
} from '../types/dayrhythm';

import { WHITELISTED_KEYS } from './settingsPatch/constants';
import {
  isPlainRecord,
  collectBlockedKeysDeep,
  type SettingsPatchValidationResult,
  type SettingsValidationCtx,
} from './settingsPatch/helpers';
import { applySleepSection } from './settingsPatch/sleep';
import { applyFastingHydrationSection } from './settingsPatch/fastingHydration';
import { applySanctuariesSection } from './settingsPatch/sanctuaries';
import { applyBatteryAndModesSection } from './settingsPatch/batteryAndModes';
import { applyUiAndAlertsSection } from './settingsPatch/uiAndAlerts';
import { applyWorkAndLocationSection } from './settingsPatch/workAndLocation';
import { applyMedicationsSection, formatSettingsSchemaForGemini } from './settingsPatch/medicationsAndSchema';

export { isBlockedSettingKey, type SettingsPatchValidationResult } from './settingsPatch/helpers';
export { formatSettingsSchemaForGemini };

export function validateAndNormalizeSettingsPatch(
  currentProfile: LifeProfile,
  rawPatch: unknown,
  context?: SettingsSnapshotContext
): SettingsPatchValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const blockedKeys: string[] = [];
  const diffs: SettingsDiffItem[] = [];
  const normalizedPatch: UnifiedSettingsPatch = {};
  const profilePatch: Partial<LifeProfile> = {};
  const appSettingsPatch: AppSettingsPatch = {};
  const medicationFastingPolicies: MedicationFastingPolicyUpdate[] = [];

  if (!isPlainRecord(rawPatch)) {
    return {
      valid: false,
      hasChanges: false,
      normalizedPatch,
      profilePatch,
      appSettingsPatch,
      medicationFastingPolicies,
      diffs,
      errors: ['صيغة تعديل الإعدادات غير صالحة (يجب أن تكون كائن إعدادات).'],
      warnings,
      blockedKeys,
      affectsAlarms: false,
    };
  }

  const sanitizedRaw = collectBlockedKeysDeep(rawPatch, '', blockedKeys, warnings) as Record<
    string,
    unknown
  >;

  for (const key of Object.keys(sanitizedRaw)) {
    if (!WHITELISTED_KEYS.has(key)) {
      warnings.push(`تم تجاهل الإعداد غير المدعوم «${key}».`);
    }
  }

  const currentApp = context?.appSettings ?? {};
  const ctx: SettingsValidationCtx = {
    sanitizedRaw,
    currentProfile,
    currentApp,
    context,
    currentChargeLimit: currentApp.phoneChargeLimitPct ?? 90,
    currentWaterReminders: currentApp.waterRemindersEnabled ?? true,
    currentQuietMode: currentApp.quietMode ?? 'normal',
    currentFastingOverride: context?.fastingOverride ?? 'auto',
    currentSanctuaryMode:
      (currentProfile.sanctuarySilenceMode as SanctuarySilenceModeOption | undefined) ??
      'silent_inbox',
    errors,
    warnings,
    blockedKeys,
    diffs,
    normalizedPatch,
    profilePatch,
    appSettingsPatch,
    medicationFastingPolicies,
    fastingOverrideOut: undefined,
    sanctuaryOverrideUntilMsOut: undefined,
    cancelActiveSanctuaryEarlyOut: undefined,
    travelStatePatchOut: undefined,
    affectsAlarms: false,
  };

  applySleepSection(ctx);
  applyFastingHydrationSection(ctx);
  applySanctuariesSection(ctx);
  applyBatteryAndModesSection(ctx);
  applyUiAndAlertsSection(ctx);
  applyWorkAndLocationSection(ctx);
  applyMedicationsSection(ctx);

  const hasChanges =
    Object.keys(profilePatch).length > 0 ||
    Object.keys(appSettingsPatch).length > 0 ||
    ctx.fastingOverrideOut !== undefined ||
    ctx.sanctuaryOverrideUntilMsOut !== undefined ||
    ctx.cancelActiveSanctuaryEarlyOut === true ||
    ctx.travelStatePatchOut !== undefined ||
    medicationFastingPolicies.length > 0;

  return {
    valid: errors.length === 0,
    hasChanges,
    normalizedPatch,
    profilePatch,
    appSettingsPatch,
    fastingOverride: ctx.fastingOverrideOut,
    sanctuaryOverrideUntilMs: ctx.sanctuaryOverrideUntilMsOut,
    cancelActiveSanctuaryEarly: ctx.cancelActiveSanctuaryEarlyOut,
    travelStatePatch: ctx.travelStatePatchOut,
    medicationFastingPolicies,
    diffs,
    errors,
    warnings,
    blockedKeys,
    affectsAlarms: ctx.affectsAlarms,
  };
}
