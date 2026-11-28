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

export function applyFastingHydrationSection(ctx: SettingsValidationCtx): void {
  // --- Fasting Settings ---
  const hasFastingDayMutation =
    ctx.sanitizedRaw.fastingDays !== undefined ||
    ctx.sanitizedRaw.addFastingDays !== undefined ||
    ctx.sanitizedRaw.removeFastingDays !== undefined ||
    ctx.sanitizedRaw.fastingMonThu !== undefined;

  if (hasFastingDayMutation) {
    let nextDays = [...ctx.currentProfile.fastingDays];
    let fastingDaysValid = true;

    if (ctx.sanitizedRaw.fastingDays !== undefined) {
      const parsed = H.normalizeWeekdayArray(
        ctx.sanitizedRaw.fastingDays,
        'أيام الصيام الأسبوعية',
        ctx.errors
      );
      if (parsed) nextDays = parsed;
      else fastingDaysValid = false;
    }

    if (ctx.sanitizedRaw.addFastingDays !== undefined) {
      const toAdd = H.normalizeWeekdayArray(
        ctx.sanitizedRaw.addFastingDays,
        'إضافة أيام صيام',
        ctx.errors
      );
      if (toAdd) {
        nextDays = Array.from(new Set([...nextDays, ...toAdd])).sort((a, b) => a - b);
      } else {
        fastingDaysValid = false;
      }
    }

    if (ctx.sanitizedRaw.removeFastingDays !== undefined) {
      const toRemove = H.normalizeWeekdayArray(
        ctx.sanitizedRaw.removeFastingDays,
        'إزالة أيام صيام',
        ctx.errors
      );
      if (toRemove) {
        const removeSet = new Set(toRemove);
        nextDays = nextDays.filter((d) => !removeSet.has(d));
      } else {
        fastingDaysValid = false;
      }
    }

    if (ctx.sanitizedRaw.fastingMonThu !== undefined) {
      if (typeof ctx.sanitizedRaw.fastingMonThu !== 'boolean') {
        ctx.errors.push('صيام الإثنين والخميس يجب أن يكون قيمة منطقية (تفعيل/إيقاف).');
        fastingDaysValid = false;
      } else {
        ctx.normalizedPatch.fastingMonThu = ctx.sanitizedRaw.fastingMonThu;
        if (ctx.sanitizedRaw.fastingMonThu) {
          nextDays = Array.from(new Set([...nextDays, 1, 4])).sort((a, b) => a - b);
        } else {
          nextDays = nextDays.filter((d) => d !== 1 && d !== 4);
        }
      }
    }

    if (fastingDaysValid) {
      ctx.profilePatch.fastingDays = nextDays;
      ctx.normalizedPatch.fastingDays = nextDays;
      const prevSorted = [...ctx.currentProfile.fastingDays].sort((a, b) => a - b);
      if (!H.sameNumberArray(prevSorted, nextDays)) {
        ctx.diffs.push({
          key: 'fastingDays',
          labelAr: 'أيام الصيام الأسبوعية',
          beforeDisplay: H.formatWeekdaysAr(prevSorted),
          afterDisplay: H.formatWeekdaysAr(nextDays),
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  if (ctx.sanitizedRaw.fastingWhiteDays !== undefined) {
    if (typeof ctx.sanitizedRaw.fastingWhiteDays !== 'boolean') {
      ctx.errors.push('تفعيل صيام الأيام البيض يجب أن يكون true أو false.');
    } else {
      const prev = ctx.currentProfile.fastingWhiteDays !== false;
      ctx.profilePatch.fastingWhiteDays = ctx.sanitizedRaw.fastingWhiteDays;
      ctx.normalizedPatch.fastingWhiteDays = ctx.sanitizedRaw.fastingWhiteDays;
      if (prev !== ctx.sanitizedRaw.fastingWhiteDays) {
        ctx.diffs.push({
          key: 'fastingWhiteDays',
          labelAr: 'صيام الأيام البيض (13-15 هجري)',
          beforeDisplay: prev ? 'مفعّل' : 'متوقف',
          afterDisplay: ctx.sanitizedRaw.fastingWhiteDays ? 'مفعّل' : 'متوقف',
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  if (ctx.sanitizedRaw.fastingOverride !== undefined) {
    const val = ctx.sanitizedRaw.fastingOverride;
    if (typeof val === 'string' && C.VALID_FASTING_OVERRIDES.has(val)) {
      const mode = val as 'auto' | 'fasting' | 'normal';
      ctx.fastingOverrideOut = mode;
      ctx.normalizedPatch.fastingOverride = mode;
      if (ctx.currentFastingOverride !== mode) {
        ctx.diffs.push({
          key: 'fastingOverride',
          labelAr: 'حالة الصيام اليوم',
          beforeDisplay: C.FASTING_OVERRIDE_LABELS_AR[ctx.currentFastingOverride],
          afterDisplay: C.FASTING_OVERRIDE_LABELS_AR[mode],
        });
        ctx.affectsAlarms = true;
      }
    } else {
      ctx.errors.push('قيمة حالة الصيام اليوم غير صالحة (المسموح: auto أو fasting أو normal).');
    }
  }

  // --- Hydration & Body ---
  if (ctx.sanitizedRaw.dailyWaterTargetLiters !== undefined) {
    const val = ctx.sanitizedRaw.dailyWaterTargetLiters;
    if (!H.isFiniteNumber(val)) {
      ctx.errors.push('هدف الماء باللتر يجب أن يكون رقماً.');
    } else if (val < 1 || val > 8) {
      ctx.errors.push('هدف الماء اليومي يجب أن يكون بين 1 و8 لتر.');
    } else {
      const ml = Math.round(val * 1000);
      const prevMl = ctx.currentProfile.dailyWaterTargetMl;
      ctx.profilePatch.dailyWaterTargetMl = ml;
      ctx.normalizedPatch.dailyWaterTargetLiters = Math.round(val * 100) / 100;
      ctx.normalizedPatch.dailyWaterTargetMl = ml;
      if (prevMl !== ml) {
        ctx.diffs.push({
          key: 'dailyWaterTargetMl',
          labelAr: 'هدف الماء اليومي',
          beforeDisplay: prevMl ? `${(prevMl / 1000).toFixed(1)} لتر (${prevMl} مل)` : 'تلقائي حسب الوزن',
          afterDisplay: `${(ml / 1000).toFixed(1)} لتر (${ml} مل)`,
        });
        ctx.affectsAlarms = true;
      }
    }
  } else if (ctx.sanitizedRaw.dailyWaterTargetMl !== undefined) {
    const val = ctx.sanitizedRaw.dailyWaterTargetMl;
    if (!H.isFiniteNumber(val)) {
      ctx.errors.push('هدف الماء بالملليلتر يجب أن يكون رقماً.');
    } else if (val < 1000 || val > 8000) {
      ctx.errors.push('هدف الماء اليومي يجب أن يكون بين 1000 و8000 مل.');
    } else {
      const ml = Math.round(val);
      const prevMl = ctx.currentProfile.dailyWaterTargetMl;
      ctx.profilePatch.dailyWaterTargetMl = ml;
      ctx.normalizedPatch.dailyWaterTargetMl = ml;
      if (prevMl !== ml) {
        ctx.diffs.push({
          key: 'dailyWaterTargetMl',
          labelAr: 'هدف الماء اليومي',
          beforeDisplay: prevMl ? `${prevMl} مل` : 'تلقائي حسب الوزن',
          afterDisplay: `${ml} مل`,
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  if (ctx.sanitizedRaw.cupSizeMl !== undefined) {
    const val = ctx.sanitizedRaw.cupSizeMl;
    if (!H.isFiniteNumber(val)) {
      ctx.errors.push('حجم الكوب يجب أن يكون رقماً بالملليلتر.');
    } else if (val < 50 || val > 2000) {
      ctx.errors.push('حجم الكوب يجب أن يكون بين 50 و2000 مل.');
    } else {
      const ml = Math.round(val);
      ctx.profilePatch.cupSizeMl = ml;
      ctx.normalizedPatch.cupSizeMl = ml;
      if (ctx.currentProfile.cupSizeMl !== ml) {
        ctx.diffs.push({
          key: 'cupSizeMl',
          labelAr: 'حجم كوب الماء',
          beforeDisplay: `${ctx.currentProfile.cupSizeMl} مل`,
          afterDisplay: `${ml} مل`,
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  const waterRemFlag = H.readBooleanFlag(ctx.sanitizedRaw, 'waterRemindersEnabled');
  if (waterRemFlag.invalidKey) {
    ctx.errors.push('تفعيل تنبيهات الماء يجب أن يكون true أو false.');
  } else if (waterRemFlag.present && waterRemFlag.value !== undefined) {
    ctx.appSettingsPatch.waterRemindersEnabled = waterRemFlag.value;
    ctx.normalizedPatch.waterRemindersEnabled = waterRemFlag.value;
    if (ctx.currentWaterReminders !== waterRemFlag.value) {
      ctx.diffs.push({
        key: 'waterRemindersEnabled',
        labelAr: 'تنبيهات شرب الماء',
        beforeDisplay: ctx.currentWaterReminders ? 'مفعّلة' : 'متوقفة',
        afterDisplay: waterRemFlag.value ? 'مفعّلة' : 'متوقفة',
      });
      ctx.affectsAlarms = true;
    }
  }

  if (ctx.sanitizedRaw.weightKg !== undefined) {
    const val = ctx.sanitizedRaw.weightKg;
    if (!H.isFiniteNumber(val) || val < 30 || val > 250) {
      ctx.errors.push('الوزن يجب أن يكون بين 30 و250 كجم.');
    } else {
      const w = Math.round(val * 2) / 2;
      ctx.profilePatch.weightKg = w;
      ctx.normalizedPatch.weightKg = w;
      if (ctx.currentProfile.weightKg !== w) {
        ctx.diffs.push({
          key: 'weightKg',
          labelAr: 'الوزن',
          beforeDisplay: `${ctx.currentProfile.weightKg} كجم`,
          afterDisplay: `${w} كجم`,
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  if (ctx.sanitizedRaw.heightCm !== undefined) {
    const val = ctx.sanitizedRaw.heightCm;
    if (!H.isFiniteNumber(val) || val < 100 || val > 240) {
      ctx.errors.push('الطول يجب أن يكون بين 100 و240 سم.');
    } else {
      const h = Math.round(val);
      ctx.profilePatch.heightCm = h;
      ctx.normalizedPatch.heightCm = h;
      if (ctx.currentProfile.heightCm !== h) {
        ctx.diffs.push({
          key: 'heightCm',
          labelAr: 'الطول',
          beforeDisplay: `${ctx.currentProfile.heightCm} سم`,
          afterDisplay: `${h} سم`,
        });
      }
    }
  }

}
