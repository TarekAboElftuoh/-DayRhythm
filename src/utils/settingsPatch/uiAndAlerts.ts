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

export function applyUiAndAlertsSection(ctx: SettingsValidationCtx): void {
  // --- UI, Alerts, Work & Location ---
  const sunFlag = H.readBooleanFlag(ctx.sanitizedRaw, 'sunMode');
  if (sunFlag.invalidKey) {
    ctx.errors.push('المظهر النهاري يجب أن يكون true أو false.');
  } else if (sunFlag.present && sunFlag.value !== undefined) {
    const prev = ctx.currentApp.sunMode ?? false;
    ctx.appSettingsPatch.sunMode = sunFlag.value;
    ctx.normalizedPatch.sunMode = sunFlag.value;
    if (prev !== sunFlag.value) {
      ctx.diffs.push({
        key: 'sunMode',
        labelAr: 'مظهر الواجهة',
        beforeDisplay: prev ? 'نهاري (الشمس)' : 'ليلي (AMOLED)',
        afterDisplay: sunFlag.value ? 'نهاري (الشمس)' : 'ليلي (AMOLED)',
      });
    }
  }

  if (ctx.sanitizedRaw.language !== undefined) {
    if (ctx.sanitizedRaw.language === 'ar' || ctx.sanitizedRaw.language === 'en') {
      const prev = ctx.currentApp.language ?? 'ar';
      ctx.appSettingsPatch.language = ctx.sanitizedRaw.language;
      ctx.normalizedPatch.language = ctx.sanitizedRaw.language;
      if (prev !== ctx.sanitizedRaw.language) {
        ctx.diffs.push({
          key: 'language',
          labelAr: 'لغة التطبيق',
          beforeDisplay: prev === 'ar' ? 'العربية' : 'English',
          afterDisplay: ctx.sanitizedRaw.language === 'ar' ? 'العربية' : 'English',
        });
      }
    } else {
      ctx.errors.push('اللغة المدعومة هي ar أو en فقط.');
    }
  }

  if (ctx.sanitizedRaw.capsuleOrientation !== undefined) {
    if (
      ctx.sanitizedRaw.capsuleOrientation === 'horizontal' ||
      ctx.sanitizedRaw.capsuleOrientation === 'vertical'
    ) {
      const prev = ctx.currentApp.capsuleOrientation ?? 'horizontal';
      ctx.appSettingsPatch.capsuleOrientation = ctx.sanitizedRaw.capsuleOrientation;
      ctx.normalizedPatch.capsuleOrientation = ctx.sanitizedRaw.capsuleOrientation;
      if (prev !== ctx.sanitizedRaw.capsuleOrientation) {
        ctx.diffs.push({
          key: 'capsuleOrientation',
          labelAr: 'اتجاه كبسولة سطح المكتب',
          beforeDisplay: prev === 'horizontal' ? 'أفقي' : 'عمودي',
          afterDisplay: ctx.sanitizedRaw.capsuleOrientation === 'horizontal' ? 'أفقي' : 'عمودي',
        });
      }
    } else {
      ctx.errors.push('اتجاه الكبسولة يجب أن يكون horizontal أو vertical.');
    }
  }

  if (ctx.sanitizedRaw.capsuleSize !== undefined) {
    if (
      ctx.sanitizedRaw.capsuleSize === 'sm' ||
      ctx.sanitizedRaw.capsuleSize === 'md' ||
      ctx.sanitizedRaw.capsuleSize === 'lg'
    ) {
      const prev = ctx.currentApp.capsuleSize ?? 'md';
      ctx.appSettingsPatch.capsuleSize = ctx.sanitizedRaw.capsuleSize;
      ctx.normalizedPatch.capsuleSize = ctx.sanitizedRaw.capsuleSize;
      if (prev !== ctx.sanitizedRaw.capsuleSize) {
        ctx.diffs.push({
          key: 'capsuleSize',
          labelAr: 'حجم كبسولة سطح المكتب',
          beforeDisplay: prev,
          afterDisplay: ctx.sanitizedRaw.capsuleSize,
        });
      }
    } else {
      ctx.errors.push('حجم الكبسولة يجب أن يكون sm أو md أو lg.');
    }
  }

  const liveAlertsFlag = H.readBooleanFlag(ctx.sanitizedRaw, 'liveAlertsEnabled');
  if (liveAlertsFlag.invalidKey) {
    ctx.errors.push('تفعيل التنبيهات الحية يجب أن يكون true أو false.');
  } else if (liveAlertsFlag.present && liveAlertsFlag.value !== undefined) {
    const prev = ctx.currentApp.liveAlertsEnabled ?? true;
    ctx.appSettingsPatch.liveAlertsEnabled = liveAlertsFlag.value;
    ctx.normalizedPatch.liveAlertsEnabled = liveAlertsFlag.value;
    if (prev !== liveAlertsFlag.value) {
      ctx.diffs.push({
        key: 'liveAlertsEnabled',
        labelAr: 'التنبيهات الحية',
        beforeDisplay: prev ? 'مفعّلة' : 'متوقفة',
        afterDisplay: liveAlertsFlag.value ? 'مفعّلة' : 'متوقفة',
      });
    }
  }

  if (ctx.sanitizedRaw.liveAlertsLeadMinutes !== undefined) {
    const val = ctx.sanitizedRaw.liveAlertsLeadMinutes;
    if (!H.isFiniteNumber(val) || !C.VALID_LEAD_MINUTES.has(Math.round(val))) {
      ctx.errors.push('وقت التنبيه الحي المسبق يجب أن يكون 5 أو 10 أو 15 أو 20 أو 30 دقيقة.');
    } else {
      const lead = Math.round(val) as 5 | 10 | 15 | 20 | 30;
      const prev = ctx.currentApp.liveAlertsLeadMinutes ?? 15;
      ctx.appSettingsPatch.liveAlertsLeadMinutes = lead;
      ctx.normalizedPatch.liveAlertsLeadMinutes = lead;
      if (prev !== lead) {
        ctx.diffs.push({
          key: 'liveAlertsLeadMinutes',
          labelAr: 'التنبيه الحي قبل الموعد',
          beforeDisplay: `${prev} د`,
          afterDisplay: `${lead} د`,
        });
      }
    }
  }

  const liveAlwaysFlag = H.readBooleanFlag(ctx.sanitizedRaw, 'liveAlertsAlwaysOn');
  if (liveAlwaysFlag.present && liveAlwaysFlag.value !== undefined) {
    ctx.appSettingsPatch.liveAlertsAlwaysOn = liveAlwaysFlag.value;
    ctx.normalizedPatch.liveAlertsAlwaysOn = liveAlwaysFlag.value;
    ctx.diffs.push({
      key: 'liveAlertsAlwaysOn',
      labelAr: 'بقاء الكبسولة الحية ظاهرة دائماً',
      beforeDisplay: ctx.currentApp.liveAlertsAlwaysOn ? 'نعم' : 'لا',
      afterDisplay: liveAlwaysFlag.value ? 'نعم' : 'لا',
    });
  }

  const liveChargingFlag = H.readBooleanFlag(ctx.sanitizedRaw, 'liveAlertsShowCharging');
  if (liveChargingFlag.present && liveChargingFlag.value !== undefined) {
    ctx.appSettingsPatch.liveAlertsShowCharging = liveChargingFlag.value;
    ctx.normalizedPatch.liveAlertsShowCharging = liveChargingFlag.value;
    ctx.diffs.push({
      key: 'liveAlertsShowCharging',
      labelAr: 'إظهار حالة الشحن بالتنبيه الحي',
      beforeDisplay: ctx.currentApp.liveAlertsShowCharging ? 'نعم' : 'لا',
      afterDisplay: liveChargingFlag.value ? 'نعم' : 'لا',
    });
  }

  const persistentNotifFlag = H.readBooleanFlag(ctx.sanitizedRaw, 'persistentCountdownNotif');
  if (persistentNotifFlag.present && persistentNotifFlag.value !== undefined) {
    ctx.appSettingsPatch.persistentCountdownNotif = persistentNotifFlag.value;
    ctx.normalizedPatch.persistentCountdownNotif = persistentNotifFlag.value;
    ctx.diffs.push({
      key: 'persistentCountdownNotif',
      labelAr: 'إشعار العد التنازلي الدائم',
      beforeDisplay: ctx.currentApp.persistentCountdownNotif ? 'مفعّل' : 'متوقف',
      afterDisplay: persistentNotifFlag.value ? 'مفعّل' : 'متوقف',
    });
  }

  const prayerAnchorsFlag = H.readBooleanFlag(ctx.sanitizedRaw, 'includePrayerAnchors');
  if (prayerAnchorsFlag.present && prayerAnchorsFlag.value !== undefined) {
    ctx.appSettingsPatch.includePrayerAnchors = prayerAnchorsFlag.value;
    ctx.normalizedPatch.includePrayerAnchors = prayerAnchorsFlag.value;
    ctx.diffs.push({
      key: 'includePrayerAnchors',
      labelAr: 'تضمين مواقيت الصلاة بالجدول',
      beforeDisplay: (ctx.currentApp.includePrayerAnchors ?? true) ? 'مفعّل' : 'متوقف',
      afterDisplay: prayerAnchorsFlag.value ? 'مفعّل' : 'متوقف',
    });
    ctx.affectsAlarms = true;
  }

}
