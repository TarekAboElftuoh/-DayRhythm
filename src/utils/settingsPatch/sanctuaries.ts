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

export function applySanctuariesSection(ctx: SettingsValidationCtx): void {
  // --- Audio Silence Sanctuaries ---
  if (ctx.sanitizedRaw.adhanLeadMinutes !== undefined) {
    const val = ctx.sanitizedRaw.adhanLeadMinutes;
    if (!H.isFiniteNumber(val) || val < 0 || val > 30) {
      ctx.errors.push('التنبيه قبل الأذان يجب أن يكون بين 0 و30 دقيقة.');
    } else {
      const mins = Math.round(val);
      ctx.profilePatch.adhanLeadMinutes = mins;
      ctx.normalizedPatch.adhanLeadMinutes = mins;
      if (ctx.currentProfile.adhanLeadMinutes !== mins) {
        ctx.diffs.push({
          key: 'adhanLeadMinutes',
          labelAr: 'التنبيه قبل الأذان',
          beforeDisplay: `${ctx.currentProfile.adhanLeadMinutes} دقيقة`,
          afterDisplay: `${mins} دقيقة`,
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  if (ctx.sanitizedRaw.prayerSilenceMinutes !== undefined) {
    const val = ctx.sanitizedRaw.prayerSilenceMinutes;
    if (!H.isFiniteNumber(val) || val < 0 || val > 90) {
      ctx.errors.push('مدة صمت الصلاة يجب أن تكون بين 0 و90 دقيقة.');
    } else {
      const mins = Math.round(val);
      ctx.profilePatch.prayerSilenceMinutes = mins;
      ctx.normalizedPatch.prayerSilenceMinutes = mins;
      if (ctx.currentProfile.prayerSilenceMinutes !== mins) {
        ctx.diffs.push({
          key: 'prayerSilenceMinutes',
          labelAr: 'مدة صمت الصلوات',
          beforeDisplay: `${ctx.currentProfile.prayerSilenceMinutes} دقيقة`,
          afterDisplay: `${mins} دقيقة`,
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  if (ctx.sanitizedRaw.fajrSilenceMinutes !== undefined) {
    const val = ctx.sanitizedRaw.fajrSilenceMinutes;
    if (!H.isFiniteNumber(val) || val < 0 || val > 90) {
      ctx.errors.push('مدة صمت الفجر يجب أن تكون بين 0 و90 دقيقة.');
    } else {
      const mins = Math.round(val);
      ctx.profilePatch.fajrSilenceMinutes = mins;
      ctx.normalizedPatch.fajrSilenceMinutes = mins;
      if (ctx.currentProfile.fajrSilenceMinutes !== mins) {
        ctx.diffs.push({
          key: 'fajrSilenceMinutes',
          labelAr: 'مدة صمت الفجر',
          beforeDisplay: `${ctx.currentProfile.fajrSilenceMinutes} دقيقة`,
          afterDisplay: `${mins} دقيقة`,
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  if (ctx.sanitizedRaw.oneTimeSilenceMinutes !== undefined) {
    const val = ctx.sanitizedRaw.oneTimeSilenceMinutes;
    if (!H.isFiniteNumber(val) || val < 0 || val > 120) {
      ctx.errors.push('الصمت المؤقت لمرة واحدة يجب أن يكون بين 0 و120 دقيقة.');
    } else {
      const mins = Math.round(val);
      ctx.profilePatch.oneTimeSilenceMinutes = mins;
      ctx.normalizedPatch.oneTimeSilenceMinutes = mins;
      const prev = ctx.currentProfile.oneTimeSilenceMinutes ?? 0;
      if (prev !== mins) {
        ctx.diffs.push({
          key: 'oneTimeSilenceMinutes',
          labelAr: 'صمت مؤقت لصلاة واحدة',
          beforeDisplay: prev > 0 ? `${prev} دقيقة` : 'غير مفعّل',
          afterDisplay: mins > 0 ? `${mins} دقيقة` : 'إيقاف',
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  if (ctx.sanitizedRaw.oneTimeSilenceDateKey !== undefined) {
    const val = ctx.sanitizedRaw.oneTimeSilenceDateKey;
    if (typeof val === 'string' && (val === '' || H.isValidIsoDate(val))) {
      ctx.profilePatch.oneTimeSilenceDateKey = val;
      ctx.normalizedPatch.oneTimeSilenceDateKey = val;
    } else {
      ctx.errors.push('تاريخ الصمت المؤقت يجب أن يكون بصيغة YYYY-MM-DD.');
    }
  }

  if (ctx.sanitizedRaw.sanctuarySilenceMode !== undefined) {
    const val = ctx.sanitizedRaw.sanctuarySilenceMode;
    if (typeof val === 'string' && C.VALID_SANCTUARY_MODES.has(val)) {
      const mode = val as SanctuarySilenceModeOption;
      ctx.profilePatch.sanctuarySilenceMode = mode;
      ctx.normalizedPatch.sanctuarySilenceMode = mode;
      if (ctx.currentSanctuaryMode !== mode) {
        ctx.diffs.push({
          key: 'sanctuarySilenceMode',
          labelAr: 'سلوك الإشعارات أثناء الحرم الصوتي',
          beforeDisplay: C.SANCTUARY_MODE_LABELS_AR[ctx.currentSanctuaryMode],
          afterDisplay: C.SANCTUARY_MODE_LABELS_AR[mode],
        });
        ctx.affectsAlarms = true;
      }
    } else {
      ctx.errors.push('نمط الحرم الصوتي غير صالح.');
    }
  }

  if (ctx.sanitizedRaw.cancelActiveSanctuaryEarly !== undefined) {
    if (typeof ctx.sanitizedRaw.cancelActiveSanctuaryEarly !== 'boolean') {
      ctx.errors.push('خيار إنهاء الحرم الصوتي مبكراً يجب أن يكون true أو false.');
    } else if (ctx.sanitizedRaw.cancelActiveSanctuaryEarly) {
      ctx.cancelActiveSanctuaryEarlyOut = true;
      ctx.normalizedPatch.cancelActiveSanctuaryEarly = true;
      ctx.diffs.push({
        key: 'cancelActiveSanctuaryEarly',
        labelAr: 'إنهاء الحرم الصوتي الحالي مبكراً',
        beforeDisplay: 'الحرم الصوتي نشط',
        afterDisplay: 'إلغاء مبكر وإعادة الصوت',
      });
      ctx.affectsAlarms = true;
    }
  }

  if (ctx.sanitizedRaw.sanctuaryOverrideMinutes !== undefined) {
    const val = ctx.sanitizedRaw.sanctuaryOverrideMinutes;
    if (!H.isFiniteNumber(val) || val < 0 || val > 720) {
      ctx.errors.push('مدة تجاوز الحرم الصوتي يجب أن تكون بين 0 و720 دقيقة.');
    } else {
      const mins = Math.round(val);
      const untilMs = mins === 0 ? 0 : Date.now() + mins * 60_000;
      ctx.sanctuaryOverrideUntilMsOut = untilMs;
      ctx.normalizedPatch.sanctuaryOverrideMinutes = mins;
      ctx.normalizedPatch.sanctuaryOverrideUntilMs = untilMs;
      ctx.diffs.push({
        key: 'sanctuaryOverrideUntilMs',
        labelAr: 'تجاوز الحرم الصوتي',
        beforeDisplay: (ctx.context?.sanctuaryOverrideUntilMs ?? 0) > Date.now() ? 'مفعّل' : 'تلقائي',
        afterDisplay: mins === 0 ? 'إعادة التفعيل التلقائي' : `تجاوز لمدة ${mins} دقيقة`,
      });
      ctx.affectsAlarms = true;
    }
  } else if (ctx.sanitizedRaw.sanctuaryOverrideUntilMs !== undefined) {
    const val = ctx.sanitizedRaw.sanctuaryOverrideUntilMs;
    if (!H.isFiniteNumber(val) || val < 0) {
      ctx.errors.push('وقت إنهاء الحرم الصوتي يجب أن يكون رقماً موجباً.');
    } else {
      const untilMs = Math.round(val);
      ctx.sanctuaryOverrideUntilMsOut = untilMs;
      ctx.normalizedPatch.sanctuaryOverrideUntilMs = untilMs;
      ctx.diffs.push({
        key: 'sanctuaryOverrideUntilMs',
        labelAr: 'تجاوز الحرم الصوتي',
        beforeDisplay: (ctx.context?.sanctuaryOverrideUntilMs ?? 0) > Date.now() ? 'مفعّل' : 'تلقائي',
        afterDisplay: untilMs === 0 ? 'تلقائي' : 'إلغاء مبكر مؤقت',
      });
      ctx.affectsAlarms = true;
    }
  }

  if (ctx.sanitizedRaw.defaultSnoozeMinutes !== undefined) {
    const val = ctx.sanitizedRaw.defaultSnoozeMinutes;
    if (!H.isFiniteNumber(val) || !C.VALID_SNOOZE_MINUTES.has(Math.round(val))) {
      ctx.errors.push('مدة الغفوة (Snooze) المسموحة هي 5 أو 10 أو 15 دقيقة فقط.');
    } else {
      const mins = Math.round(val) as 5 | 10 | 15;
      const prev = ctx.currentProfile.defaultSnoozeMinutes ?? 5;
      ctx.profilePatch.defaultSnoozeMinutes = mins;
      ctx.normalizedPatch.defaultSnoozeMinutes = mins;
      if (prev !== mins) {
        ctx.diffs.push({
          key: 'defaultSnoozeMinutes',
          labelAr: 'مدة التأجيل (Snooze)',
          beforeDisplay: `${prev} دقائق`,
          afterDisplay: `${mins} دقائق`,
        });
        ctx.affectsAlarms = true;
      }
    }
  }

  if (ctx.sanitizedRaw.soundRepeats !== undefined) {
    if (!H.isPlainRecord(ctx.sanitizedRaw.soundRepeats)) {
      ctx.errors.push('إعدادات تكرار الرنين يجب أن تكون كائناً.');
    } else {
      const repeatsOut: NonNullable<AppSettingsPatch['soundRepeats']> = {};
      for (const [cat, val] of Object.entries(ctx.sanitizedRaw.soundRepeats)) {
        if (!C.VALID_SOUND_CATEGORIES.has(cat)) {
          ctx.warnings.push(`تم تجاهل فئة صوت غير معروفة «${cat}».`);
          continue;
        }
        const soundCat = cat as TaskSoundCategory;
        if (val === 'continuous') {
          repeatsOut[soundCat] = 'continuous';
          ctx.diffs.push({
            key: `soundRepeats.${soundCat}`,
            labelAr: `تكرار رنين ${C.SOUND_CATEGORY_LABELS_AR[soundCat]}`,
            beforeDisplay: String(ctx.currentProfile.soundRepeats?.[soundCat] ?? 'افتراضي'),
            afterDisplay: 'رنين مستمر',
          });
        } else if (H.isFiniteNumber(val)) {
          const clamped = Math.max(1, Math.min(10, Math.round(val)));
          if (clamped !== Math.round(val)) {
            ctx.warnings.push(`تم ضبط تكرار رنين ${C.SOUND_CATEGORY_LABELS_AR[soundCat]} إلى ${clamped} (النطاق 1–10).`);
          }
          repeatsOut[soundCat] = clamped;
          ctx.diffs.push({
            key: `soundRepeats.${soundCat}`,
            labelAr: `تكرار رنين ${C.SOUND_CATEGORY_LABELS_AR[soundCat]}`,
            beforeDisplay: String(ctx.currentProfile.soundRepeats?.[soundCat] ?? 'افتراضي'),
            afterDisplay: `${clamped} مرات`,
          });
        } else {
          ctx.errors.push(`قيمة تكرار الرنين لفئة ${C.SOUND_CATEGORY_LABELS_AR[soundCat]} غير صالحة.`);
        }
      }
      if (Object.keys(repeatsOut).length > 0) {
        ctx.appSettingsPatch.soundRepeats = repeatsOut;
        ctx.normalizedPatch.soundRepeats = repeatsOut;
      }
    }
  }

}
