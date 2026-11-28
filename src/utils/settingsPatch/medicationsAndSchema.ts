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

import * as C from './constants';
import * as H from './helpers';
import type { SettingsValidationCtx } from './helpers';

export function applyMedicationsSection(ctx: SettingsValidationCtx): void {
  // --- Medication Fasting Policies ---
  if (ctx.sanitizedRaw.medicationFastingPolicies !== undefined) {
    if (!Array.isArray(ctx.sanitizedRaw.medicationFastingPolicies)) {
      ctx.errors.push('تعديلات سياسة صيام الأدوية يجب أن تكون قائمة.');
    } else {
      const medsList = ctx.context?.medications ?? [];
      for (const item of ctx.sanitizedRaw.medicationFastingPolicies) {
        if (!H.isPlainRecord(item)) {
          ctx.errors.push('عنصر سياسة صيام الدواء غير صالح.');
          continue;
        }
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const medId = typeof item.medicationId === 'string' ? item.medicationId.trim() : undefined;
        const policyRaw = item.fastingPolicy;
        if (!name && !medId) {
          ctx.errors.push('يجب تحديد اسم أو معرف الدواء لتعديل سياسة الصيام.');
          continue;
        }
        if (typeof policyRaw !== 'string' || !C.VALID_MED_FASTING_POLICIES.has(policyRaw)) {
          ctx.errors.push(`سياسة الصيام للدواء «${name || medId}» غير صالحة.`);
          continue;
        }
        const policy = policyRaw as MedicationFastingPolicy;
        const matchedMed = medsList.find(
          (m) =>
            (medId && m.id === medId) ||
            (name &&
              (m.name.trim().toLowerCase() === name.toLowerCase() ||
                m.name.trim().toLowerCase().includes(name.toLowerCase())))
        );
        const displayName = matchedMed?.name ?? name ?? medId ?? 'دواء';
        const prevPolicy: MedicationFastingPolicy = matchedMed?.fastingPolicy ?? 'auto-nearest';
        ctx.medicationFastingPolicies.push({
          medicationId: matchedMed?.id ?? medId,
          name: displayName,
          fastingPolicy: policy,
        });
        if (prevPolicy !== policy || !matchedMed) {
          ctx.diffs.push({
            key: `medFastingPolicy.${matchedMed?.id ?? displayName}`,
            labelAr: `سياسة صيام «${displayName}»`,
            beforeDisplay: C.MED_FASTING_POLICY_LABELS_AR[prevPolicy],
            afterDisplay: C.MED_FASTING_POLICY_LABELS_AR[policy],
          });
          ctx.affectsAlarms = true;
        }
      }
      if (ctx.medicationFastingPolicies.length > 0) {
        ctx.normalizedPatch.medicationFastingPolicies = ctx.medicationFastingPolicies;
      }
    }
  }
}

/**
 * Generates a concise Arabic+key schema summary of all editable app settings and their
 * current live values so Gemini knows exact field keys and before-state.
 */
export function formatSettingsSchemaForGemini(
  currentProfile: LifeProfile,
  context?: SettingsSnapshotContext
): string {
  const app = context?.appSettings ?? {};
  const fastingDaysStr = H.formatWeekdaysAr(currentProfile.fastingDays);
  const sleepH = (currentProfile.sleepTargetMinutes / 60).toFixed(1);
  const waterMlStr = currentProfile.dailyWaterTargetMl
    ? `${currentProfile.dailyWaterTargetMl} مل`
    : 'تلقائي بالمعادلة';
  const quiet = app.quietMode ?? 'normal';
  const travel = context?.travelState;
  const medsPolicies = (context?.medications ?? [])
    .slice(0, 12)
    .map((m) => `${m.name}: ${m.fastingPolicy ?? 'auto-nearest'}`)
    .join(' | ');

  return [
    '=== خريطة الإعدادات القابلة للتعديل عبر update_app_settings (القيم الحالية) ===',
    `- النوم والاستيقاظ: sleepTargetHours=${sleepH} (3–14) | bedtime24=${currentProfile.bedtime24 || 'تلقائي'} | wakeLeadBeforeFajrMinutes=${currentProfile.wakeLeadBeforeFajrMinutes ?? 15} (0–180) | suhoorLeadMinutes=${currentProfile.suhoorLeadMinutes} (10–180) | sleepStrategy=${currentProfile.sleepStrategy} | sleepDebtMinutes=${currentProfile.sleepDebtMinutes}`,
    `- الصيام: fastingDays=[${currentProfile.fastingDays.join(',')}] (${fastingDaysStr}) | addFastingDays/removeFastingDays | fastingMonThu=${currentProfile.fastingDays.includes(1) && currentProfile.fastingDays.includes(4)} | fastingWhiteDays=${currentProfile.fastingWhiteDays !== false} | fastingOverride=${context?.fastingOverride ?? 'auto'}`,
    `- الماء والقياسات: dailyWaterTargetLiters / dailyWaterTargetMl=${waterMlStr} | cupSizeMl=${currentProfile.cupSizeMl} (50–2000) | waterRemindersEnabled=${app.waterRemindersEnabled ?? true} | weightKg=${currentProfile.weightKg} | heightCm=${currentProfile.heightCm}`,
    `- الحرم الصوتي والتنبيهات: adhanLeadMinutes=${currentProfile.adhanLeadMinutes} | prayerSilenceMinutes=${currentProfile.prayerSilenceMinutes} | fajrSilenceMinutes=${currentProfile.fajrSilenceMinutes} | sanctuarySilenceMode=${currentProfile.sanctuarySilenceMode ?? 'silent_inbox'} | cancelActiveSanctuaryEarly | defaultSnoozeMinutes=${currentProfile.defaultSnoozeMinutes ?? 5}`,
    `- البطارية والشحن: phoneChargeLimitPct=${app.phoneChargeLimitPct ?? 90} (50–100) | chargeAlertEnabled=${app.chargeAlertEnabled ?? true} | chargeAlertKeepUntilUnplugged=${app.chargeAlertKeepUntilUnplugged ?? true}`,
    `- الأوضاع والمظهر: quietMode=${quiet} (quietModeMinutes) | meetingMode=${quiet !== 'normal'} (meetingModeMinutes) | adhanSoundInSilent=${app.adhanSoundInSilent ?? true} | travelState.active=${travel?.active ?? false} | sunMode=${app.sunMode ?? false} | language=${app.language ?? 'ar'} | lowEnergyDateKey=${currentProfile.lowEnergyDateKey || 'غير مفعّل'}`,
    medsPolicies
      ? `- سياسة صيام الأدوية (medicationFastingPolicies: auto-nearest | before-fajr | after-maghrib | skip | unchanged): ${medsPolicies}`
      : '',
    '- أمان: يُمنع تماماً قراءة أو تعديل مفاتيح API أو التوكنات أو إعدادات Firebase أو UIDs أو autoExecuteChat.',
  ]
    .filter(Boolean)
    .join('\n');
}

