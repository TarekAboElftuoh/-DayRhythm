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

export function applyBatteryAndModesSection(ctx: SettingsValidationCtx): void {
  // --- Phone & Battery ---
  if (ctx.sanitizedRaw.phoneChargeLimitPct !== undefined) {
    const val = ctx.sanitizedRaw.phoneChargeLimitPct;
    if (!H.isFiniteNumber(val)) {
      ctx.errors.push('حد شحن البطارية يجب أن يكون رقماً بين 50% و100%.');
    } else {
      const rounded = Math.round(val);
      const clamped = Math.max(50, Math.min(100, rounded));
      if (clamped !== rounded) {
        ctx.warnings.push(
          `تم تعديل حد الشحن من ${rounded}% إلى ${clamped}% (النطاق المسموح 50%–100%).`
        );
      }
      ctx.appSettingsPatch.phoneChargeLimitPct = clamped;
      ctx.normalizedPatch.phoneChargeLimitPct = clamped;
      if (ctx.currentChargeLimit !== clamped) {
        ctx.diffs.push({
          key: 'phoneChargeLimitPct',
          labelAr: 'حد شحن البطارية',
          beforeDisplay: `${ctx.currentChargeLimit}%`,
          afterDisplay: `${clamped}%`,
        });
      }
    }
  }

  const chargeAlertFlag = H.readBooleanFlag(
    ctx.sanitizedRaw,
    'chargeAlertEnabled',
    'smartChargeAlertEnabled'
  );
  if (chargeAlertFlag.invalidKey) {
    ctx.errors.push('تفعيل تنبيه اكتمال الشحن يجب أن يكون true أو false.');
  } else if (chargeAlertFlag.present && chargeAlertFlag.value !== undefined) {
    const prev = ctx.currentApp.chargeAlertEnabled ?? true;
    ctx.appSettingsPatch.chargeAlertEnabled = chargeAlertFlag.value;
    ctx.normalizedPatch.chargeAlertEnabled = chargeAlertFlag.value;
    if (prev !== chargeAlertFlag.value) {
      ctx.diffs.push({
        key: 'chargeAlertEnabled',
        labelAr: 'تنبيه اكتمال الشحن',
        beforeDisplay: prev ? 'مفعّل' : 'متوقف',
        afterDisplay: chargeAlertFlag.value ? 'مفعّل' : 'متوقف',
      });
    }
  }

  const keepUntilUnpluggedFlag = H.readBooleanFlag(
    ctx.sanitizedRaw,
    'chargeAlertKeepUntilUnplugged',
    'smartChargeKeepUntilUnplugged'
  );
  if (keepUntilUnpluggedFlag.invalidKey) {
    ctx.errors.push('خيار استمرار رنين الشحن يجب أن يكون true أو false.');
  } else if (keepUntilUnpluggedFlag.present && keepUntilUnpluggedFlag.value !== undefined) {
    const prev = ctx.currentApp.chargeAlertKeepUntilUnplugged ?? true;
    ctx.appSettingsPatch.chargeAlertKeepUntilUnplugged = keepUntilUnpluggedFlag.value;
    ctx.normalizedPatch.chargeAlertKeepUntilUnplugged = keepUntilUnpluggedFlag.value;
    if (prev !== keepUntilUnpluggedFlag.value) {
      ctx.diffs.push({
        key: 'chargeAlertKeepUntilUnplugged',
        labelAr: 'استمرار رنين الشحن حتى الفصل',
        beforeDisplay: prev ? 'مفعّل' : 'متوقف',
        afterDisplay: keepUntilUnpluggedFlag.value ? 'مفعّل' : 'متوقف',
      });
    }
  }

  // --- Daily Modes (quietMode, meetingMode, travelState, lowEnergy) ---
  if (ctx.sanitizedRaw.quietMode !== undefined) {
    const val = ctx.sanitizedRaw.quietMode;
    if (typeof val === 'string' && C.VALID_QUIET_MODES.has(val)) {
      const mode = val as QuietModeType;
      ctx.appSettingsPatch.quietMode = mode;
      ctx.normalizedPatch.quietMode = mode;
      let durationMin = 0;
      if (ctx.sanitizedRaw.quietModeMinutes !== undefined) {
        if (!H.isFiniteNumber(ctx.sanitizedRaw.quietModeMinutes) || ctx.sanitizedRaw.quietModeMinutes < 0) {
          ctx.errors.push('مدة وضع الهدوء يجب أن تكون رقماً موجباً بالدقائق.');
        } else {
          durationMin = Math.min(1440, Math.round(ctx.sanitizedRaw.quietModeMinutes));
          ctx.appSettingsPatch.quietModeMinutes = durationMin;
          ctx.normalizedPatch.quietModeMinutes = durationMin;
        }
      }
      if (ctx.currentQuietMode !== mode || durationMin > 0) {
        ctx.diffs.push({
          key: 'quietMode',
          labelAr: 'وضع الهدوء',
          beforeDisplay: C.QUIET_MODE_LABELS_AR[ctx.currentQuietMode],
          afterDisplay:
            durationMin > 0 && mode !== 'normal'
              ? `${C.QUIET_MODE_LABELS_AR[mode]} (${durationMin} د)`
              : C.QUIET_MODE_LABELS_AR[mode],
        });
        ctx.affectsAlarms = true;
      }
    } else {
      ctx.errors.push('قيمة وضع الهدوء غير صالحة.');
    }
  } else if (ctx.sanitizedRaw.meetingMode !== undefined) {
    if (typeof ctx.sanitizedRaw.meetingMode !== 'boolean') {
      ctx.errors.push('وضع الاجتماع يجب أن يكون true أو false.');
    } else {
      const active = ctx.sanitizedRaw.meetingMode;
      const mappedMode: QuietModeType = active ? 'vibrate_only' : 'normal';
      let mins = 0;
      if (active && ctx.sanitizedRaw.meetingModeMinutes !== undefined) {
        if (
          !H.isFiniteNumber(ctx.sanitizedRaw.meetingModeMinutes) ||
          ctx.sanitizedRaw.meetingModeMinutes < 0 ||
          ctx.sanitizedRaw.meetingModeMinutes > 480
        ) {
          ctx.errors.push('مدة وضع الاجتماع يجب أن تكون بين 0 و480 دقيقة.');
        } else {
          mins = Math.round(ctx.sanitizedRaw.meetingModeMinutes);
        }
      } else if (active) {
        mins = 60;
      }
      ctx.appSettingsPatch.quietMode = mappedMode;
      ctx.appSettingsPatch.quietModeMinutes = mins;
      ctx.normalizedPatch.meetingMode = active;
      ctx.normalizedPatch.meetingModeMinutes = mins;
      ctx.normalizedPatch.quietMode = mappedMode;
      ctx.normalizedPatch.quietModeMinutes = mins;
      ctx.diffs.push({
        key: 'meetingMode',
        labelAr: 'وضع الاجتماع',
        beforeDisplay: ctx.currentQuietMode !== 'normal' ? 'مفعّل' : 'متوقف',
        afterDisplay: active ? `مفعّل (${mins > 0 ? `${mins} د` : 'مستمر'})` : 'متوقف',
      });
      ctx.affectsAlarms = true;
    }
  }

  const adhanSilentFlag = H.readBooleanFlag(ctx.sanitizedRaw, 'adhanSoundInSilent');
  if (adhanSilentFlag.invalidKey) {
    ctx.errors.push('خيار صوت الأذان أثناء الصمت يجب أن يكون true أو false.');
  } else if (adhanSilentFlag.present && adhanSilentFlag.value !== undefined) {
    const prev = ctx.currentApp.adhanSoundInSilent ?? true;
    ctx.appSettingsPatch.adhanSoundInSilent = adhanSilentFlag.value;
    ctx.normalizedPatch.adhanSoundInSilent = adhanSilentFlag.value;
    if (prev !== adhanSilentFlag.value) {
      ctx.diffs.push({
        key: 'adhanSoundInSilent',
        labelAr: 'نداء الأذان أثناء الصمت',
        beforeDisplay: prev ? 'مفعّل' : 'مكتوم',
        afterDisplay: adhanSilentFlag.value ? 'مفعّل' : 'مكتوم',
      });
      ctx.affectsAlarms = true;
    }
  }

  if (ctx.sanitizedRaw.travelState !== undefined) {
    if (!H.isPlainRecord(ctx.sanitizedRaw.travelState)) {
      ctx.errors.push('بيانات وضع السفر يجب أن تكون كائناً صالحاً.');
    } else {
      const tRaw = ctx.sanitizedRaw.travelState;
      const tPatch: TravelStatePatch = {};
      if (tRaw.active !== undefined) {
        if (typeof tRaw.active !== 'boolean') {
          ctx.errors.push('حالة تفعيل وضع السفر يجب أن تكون true أو false.');
        } else {
          tPatch.active = tRaw.active;
        }
      }
      if (typeof tRaw.cityName === 'string' && tRaw.cityName.trim()) {
        tPatch.cityName = tRaw.cityName.trim().slice(0, 80);
      }
      if (H.isFiniteNumber(tRaw.lat) && tRaw.lat >= -90 && tRaw.lat <= 90) {
        tPatch.lat = tRaw.lat;
      }
      if (H.isFiniteNumber(tRaw.lng) && tRaw.lng >= -180 && tRaw.lng <= 180) {
        tPatch.lng = tRaw.lng;
      }
      if (typeof tRaw.timeZone === 'string' && tRaw.timeZone.trim()) {
        tPatch.timeZone = tRaw.timeZone.trim().slice(0, 64);
      }
      if (H.isFiniteNumber(tRaw.distanceKm) && tRaw.distanceKm >= 0 && tRaw.distanceKm <= 25000) {
        tPatch.distanceKm = Math.round(tRaw.distanceKm);
      }
      if (typeof tRaw.durationMode === 'string' && C.VALID_TRAVEL_DURATION_MODES.has(tRaw.durationMode)) {
        tPatch.durationMode = tRaw.durationMode as TravelDurationMode;
      }
      if (typeof tRaw.returnDate === 'string' && H.isValidIsoDate(tRaw.returnDate)) {
        tPatch.returnDate = tRaw.returnDate;
      }
      if (Array.isArray(tRaw.deferredCategories)) {
        tPatch.deferredCategories = tRaw.deferredCategories.filter(
          (c): c is TravelDeferrableCategory =>
            typeof c === 'string' && C.VALID_TRAVEL_DEFERRABLE.has(c)
        );
      }
      if (Array.isArray(tRaw.deferredMedIds)) {
        tPatch.deferredMedIds = tRaw.deferredMedIds.filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0
        );
      }
      if (Object.keys(tPatch).length > 0) {
        ctx.travelStatePatchOut = tPatch;
        ctx.normalizedPatch.travelState = tPatch;
        const prevActive = ctx.context?.travelState?.active ?? false;
        const nextActive = tPatch.active ?? prevActive;
        ctx.diffs.push({
          key: 'travelState',
          labelAr: 'وضع السفر',
          beforeDisplay: prevActive
            ? `مفعّل (${ctx.context?.travelState?.location.nameAr ?? 'سفر'})`
            : 'متوقف',
          afterDisplay: nextActive
            ? `مفعّل (${tPatch.cityName ?? ctx.context?.travelState?.location.nameAr ?? 'وجهة السفر'})`
            : 'متوقف (العودة للموقع الأساسي)',
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  if (ctx.sanitizedRaw.lowEnergyDateKey !== undefined) {
    const val = ctx.sanitizedRaw.lowEnergyDateKey;
    if (typeof val === 'string' && (val === '' || H.isValidIsoDate(val))) {
      ctx.profilePatch.lowEnergyDateKey = val;
      ctx.normalizedPatch.lowEnergyDateKey = val;
      if (ctx.currentProfile.lowEnergyDateKey !== val) {
        ctx.diffs.push({
          key: 'lowEnergyDateKey',
          labelAr: 'وضع اليوم الهادئ',
          beforeDisplay: ctx.currentProfile.lowEnergyDateKey ? 'مفعّل' : 'عادي',
          afterDisplay: val ? `مفعّل (${val})` : 'عادي',
        });
        ctx.affectsAlarms = true;
      }
    } else {
      ctx.errors.push('تاريخ وضع اليوم الهادئ يجب أن يكون بصيغة YYYY-MM-DD.');
    }
  }

}
