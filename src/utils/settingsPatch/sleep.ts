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

export function applySleepSection(ctx: SettingsValidationCtx): void {
  // --- Sleep & Wake Targets ---
  const rawBedtime =
    ctx.sanitizedRaw.bedtime24 !== undefined ? ctx.sanitizedRaw.bedtime24 : ctx.sanitizedRaw.bedtime;
  if (rawBedtime !== undefined) {
    if (rawBedtime === '') {
      ctx.profilePatch.bedtime24 = '';
      ctx.normalizedPatch.bedtime24 = '';
      if ((ctx.currentProfile.bedtime24 ?? '') !== '') {
        ctx.diffs.push({
          key: 'bedtime24',
          labelAr: 'وقت النوم المفضّل',
          beforeDisplay: H.formatTime24Ar(ctx.currentProfile.bedtime24),
          afterDisplay: 'تلقائي حسب الفجر والعشاء',
        });
        ctx.affectsAlarms = true;
      }
    } else if (typeof rawBedtime === 'string' && H.isValidTime24(rawBedtime.trim())) {
      const cleanBed = rawBedtime.trim();
      ctx.profilePatch.bedtime24 = cleanBed;
      ctx.normalizedPatch.bedtime24 = cleanBed;
      if ((ctx.currentProfile.bedtime24 ?? '') !== cleanBed) {
        ctx.diffs.push({
          key: 'bedtime24',
          labelAr: 'وقت النوم المفضّل',
          beforeDisplay: H.formatTime24Ar(ctx.currentProfile.bedtime24),
          afterDisplay: H.formatTime24Ar(cleanBed),
        });
        ctx.affectsAlarms = true;
      }
    } else {
      ctx.errors.push('وقت النوم يجب أن يكون بصيغة HH:MM (مثال: 22:30).');
    }
  }

  if (ctx.sanitizedRaw.sleepTargetHours !== undefined) {
    const val = ctx.sanitizedRaw.sleepTargetHours;
    if (!H.isFiniteNumber(val)) {
      ctx.errors.push('هدف ساعات النوم يجب أن يكون رقماً صحيحاً.');
    } else if (val < 3 || val > 14) {
      ctx.errors.push('هدف ساعات النوم يجب أن يكون بين 3 و14 ساعة.');
    } else {
      const mins = Math.round(val * 60);
      ctx.profilePatch.sleepTargetMinutes = mins;
      ctx.normalizedPatch.sleepTargetHours = Math.round(val * 10) / 10;
      ctx.normalizedPatch.sleepTargetMinutes = mins;
      if (ctx.currentProfile.sleepTargetMinutes !== mins) {
        ctx.diffs.push({
          key: 'sleepTargetMinutes',
          labelAr: 'هدف النوم اليومي',
          beforeDisplay: H.formatMinutesAsHoursAr(ctx.currentProfile.sleepTargetMinutes),
          afterDisplay: H.formatMinutesAsHoursAr(mins),
        });
        ctx.affectsAlarms = true;
      }
    }
  } else if (ctx.sanitizedRaw.sleepTargetMinutes !== undefined) {
    const val = ctx.sanitizedRaw.sleepTargetMinutes;
    if (!H.isFiniteNumber(val)) {
      ctx.errors.push('هدف النوم بالدقائق يجب أن يكون رقماً.');
    } else if (val < 180 || val > 840) {
      ctx.errors.push('هدف النوم بالدقائق يجب أن يكون بين 180 (3 ساعات) و840 (14 ساعة).');
    } else {
      const mins = Math.round(val);
      ctx.profilePatch.sleepTargetMinutes = mins;
      ctx.normalizedPatch.sleepTargetMinutes = mins;
      if (ctx.currentProfile.sleepTargetMinutes !== mins) {
        ctx.diffs.push({
          key: 'sleepTargetMinutes',
          labelAr: 'هدف النوم اليومي',
          beforeDisplay: H.formatMinutesAsHoursAr(ctx.currentProfile.sleepTargetMinutes),
          afterDisplay: H.formatMinutesAsHoursAr(mins),
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  if (ctx.sanitizedRaw.wakeLeadBeforeFajrMinutes !== undefined) {
    const val = ctx.sanitizedRaw.wakeLeadBeforeFajrMinutes;
    if (!H.isFiniteNumber(val)) {
      ctx.errors.push('مدة الاستيقاظ قبل الفجر يجب أن تكون رقماً.');
    } else if (val < 0 || val > 180) {
      ctx.errors.push('مدة الاستيقاظ قبل الفجر يجب أن تكون بين 0 و180 دقيقة.');
    } else {
      const mins = Math.round(val);
      const prev = ctx.currentProfile.wakeLeadBeforeFajrMinutes ?? 15;
      ctx.profilePatch.wakeLeadBeforeFajrMinutes = mins;
      ctx.normalizedPatch.wakeLeadBeforeFajrMinutes = mins;
      if (prev !== mins) {
        ctx.diffs.push({
          key: 'wakeLeadBeforeFajrMinutes',
          labelAr: 'الاستيقاظ قبل الفجر',
          beforeDisplay: `${prev} دقيقة`,
          afterDisplay: `${mins} دقيقة`,
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  if (ctx.sanitizedRaw.suhoorLeadMinutes !== undefined) {
    const val = ctx.sanitizedRaw.suhoorLeadMinutes;
    if (!H.isFiniteNumber(val)) {
      ctx.errors.push('مدة السحور قبل الفجر يجب أن تكون رقماً.');
    } else if (val < 10 || val > 180) {
      ctx.errors.push('مدة السحور قبل الفجر يجب أن تكون بين 10 و180 دقيقة.');
    } else {
      const mins = Math.round(val);
      ctx.profilePatch.suhoorLeadMinutes = mins;
      ctx.normalizedPatch.suhoorLeadMinutes = mins;
      if (ctx.currentProfile.suhoorLeadMinutes !== mins) {
        ctx.diffs.push({
          key: 'suhoorLeadMinutes',
          labelAr: 'موعد السحور قبل الفجر',
          beforeDisplay: `${ctx.currentProfile.suhoorLeadMinutes} دقيقة`,
          afterDisplay: `${mins} دقيقة`,
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  if (ctx.sanitizedRaw.sleepStrategy !== undefined) {
    const val = ctx.sanitizedRaw.sleepStrategy;
    if (typeof val === 'string' && C.VALID_SLEEP_STRATEGIES.has(val)) {
      const strat = val as SleepStrategy;
      ctx.profilePatch.sleepStrategy = strat;
      ctx.normalizedPatch.sleepStrategy = strat;
      if (ctx.currentProfile.sleepStrategy !== strat) {
        ctx.diffs.push({
          key: 'sleepStrategy',
          labelAr: 'استراتيجية النوم',
          beforeDisplay: C.SLEEP_STRATEGY_LABELS_AR[ctx.currentProfile.sleepStrategy],
          afterDisplay: C.SLEEP_STRATEGY_LABELS_AR[strat],
        });
        ctx.affectsAlarms = true;
      }
    } else {
      ctx.errors.push('استراتيجية النوم غير مدعومة.');
    }
  }

  if (ctx.sanitizedRaw.sleepDebtMinutes !== undefined) {
    const val = ctx.sanitizedRaw.sleepDebtMinutes;
    if (!H.isFiniteNumber(val)) {
      ctx.errors.push('رصيد النوم الناقص يجب أن يكون رقماً.');
    } else {
      const clamped = Math.max(0, Math.min(480, Math.round(val)));
      if (clamped !== Math.round(val)) {
        ctx.warnings.push(`تم ضبط رصيد النوم الناقص إلى ${clamped} دقيقة (النطاق 0–480).`);
      }
      ctx.profilePatch.sleepDebtMinutes = clamped;
      ctx.normalizedPatch.sleepDebtMinutes = clamped;
      if (ctx.currentProfile.sleepDebtMinutes !== clamped) {
        ctx.diffs.push({
          key: 'sleepDebtMinutes',
          labelAr: 'رصيد النوم الناقص',
          beforeDisplay: `${ctx.currentProfile.sleepDebtMinutes} دقيقة`,
          afterDisplay: `${clamped} دقيقة`,
        });
        ctx.affectsAlarms = true;
      }
    }
  }

}
