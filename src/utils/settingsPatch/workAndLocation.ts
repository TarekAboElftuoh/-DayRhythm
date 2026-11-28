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

export function applyWorkAndLocationSection(ctx: SettingsValidationCtx): void {
  if (typeof ctx.sanitizedRaw.careerTrack === 'string') {
    const clean = ctx.sanitizedRaw.careerTrack.trim().slice(0, 120);
    ctx.profilePatch.careerTrack = clean;
    ctx.normalizedPatch.careerTrack = clean;
    if (ctx.currentProfile.careerTrack !== clean) {
      ctx.diffs.push({
        key: 'careerTrack',
        labelAr: 'المسار المهني',
        beforeDisplay: ctx.currentProfile.careerTrack || 'غير محدد',
        afterDisplay: clean || 'غير محدد',
      });
    }
  }

  const workEnabledFlag = H.readBooleanFlag(ctx.sanitizedRaw, 'workEnabled');
  if (workEnabledFlag.present && workEnabledFlag.value !== undefined) {
    ctx.profilePatch.workEnabled = workEnabledFlag.value;
    ctx.normalizedPatch.workEnabled = workEnabledFlag.value;
    if (ctx.currentProfile.workEnabled !== workEnabledFlag.value) {
      ctx.diffs.push({
        key: 'workEnabled',
        labelAr: 'ساعات العمل الثابتة',
        beforeDisplay: ctx.currentProfile.workEnabled ? 'مفعّلة' : 'متوقفة',
        afterDisplay: workEnabledFlag.value ? 'مفعّلة' : 'متوقفة',
      });
      ctx.affectsAlarms = true;
    }
  }

  if (ctx.sanitizedRaw.workStart24 !== undefined) {
    if (typeof ctx.sanitizedRaw.workStart24 === 'string' && H.isValidTime24(ctx.sanitizedRaw.workStart24.trim())) {
      const clean = ctx.sanitizedRaw.workStart24.trim();
      ctx.profilePatch.workStart24 = clean;
      ctx.normalizedPatch.workStart24 = clean;
      if (ctx.currentProfile.workStart24 !== clean) {
        ctx.diffs.push({
          key: 'workStart24',
          labelAr: 'بداية الدوام',
          beforeDisplay: H.formatTime24Ar(ctx.currentProfile.workStart24),
          afterDisplay: H.formatTime24Ar(clean),
        });
      }
    } else {
      ctx.errors.push('بداية العمل يجب أن تكون بصيغة HH:MM.');
    }
  }

  if (ctx.sanitizedRaw.workEnd24 !== undefined) {
    if (typeof ctx.sanitizedRaw.workEnd24 === 'string' && H.isValidTime24(ctx.sanitizedRaw.workEnd24.trim())) {
      const clean = ctx.sanitizedRaw.workEnd24.trim();
      ctx.profilePatch.workEnd24 = clean;
      ctx.normalizedPatch.workEnd24 = clean;
      if (ctx.currentProfile.workEnd24 !== clean) {
        ctx.diffs.push({
          key: 'workEnd24',
          labelAr: 'نهاية الدوام',
          beforeDisplay: H.formatTime24Ar(ctx.currentProfile.workEnd24),
          afterDisplay: H.formatTime24Ar(clean),
        });
      }
    } else {
      ctx.errors.push('نهاية العمل يجب أن تكون بصيغة HH:MM.');
    }
  }

  if (ctx.sanitizedRaw.workDays !== undefined) {
    const parsed = H.normalizeWeekdayArray(ctx.sanitizedRaw.workDays, 'أيام العمل', ctx.errors);
    if (parsed) {
      ctx.profilePatch.workDays = parsed;
      ctx.normalizedPatch.workDays = parsed;
      if (!H.sameNumberArray([...ctx.currentProfile.workDays].sort((a, b) => a - b), parsed)) {
        ctx.diffs.push({
          key: 'workDays',
          labelAr: 'أيام العمل',
          beforeDisplay: H.formatWeekdaysAr(ctx.currentProfile.workDays),
          afterDisplay: H.formatWeekdaysAr(parsed),
        });
      }
    }
  }

  const autoLocFlag = H.readBooleanFlag(ctx.sanitizedRaw, 'autoLocationSync');
  if (autoLocFlag.present && autoLocFlag.value !== undefined) {
    ctx.profilePatch.autoLocationSync = autoLocFlag.value;
    ctx.normalizedPatch.autoLocationSync = autoLocFlag.value;
    if (ctx.currentProfile.autoLocationSync !== autoLocFlag.value) {
      ctx.diffs.push({
        key: 'autoLocationSync',
        labelAr: 'تحديث الموقع التلقائي',
        beforeDisplay: ctx.currentProfile.autoLocationSync ? 'تلقائي' : 'يدوي',
        afterDisplay: autoLocFlag.value ? 'تلقائي' : 'يدوي',
      });
    }
  }

  if (typeof ctx.sanitizedRaw.currentCityName === 'string' && ctx.sanitizedRaw.currentCityName.trim()) {
    const clean = ctx.sanitizedRaw.currentCityName.trim().slice(0, 100);
    ctx.profilePatch.currentCityName = clean;
    ctx.normalizedPatch.currentCityName = clean;
    if (ctx.currentProfile.currentCityName !== clean) {
      ctx.diffs.push({
        key: 'currentCityName',
        labelAr: 'المدينة الحالية',
        beforeDisplay: ctx.currentProfile.currentCityName,
        afterDisplay: clean,
      });
      ctx.affectsAlarms = true;
    }
  }

  if (typeof ctx.sanitizedRaw.currentTimeZone === 'string' && ctx.sanitizedRaw.currentTimeZone.trim()) {
    const clean = ctx.sanitizedRaw.currentTimeZone.trim().slice(0, 64);
    ctx.profilePatch.currentTimeZone = clean;
    ctx.normalizedPatch.currentTimeZone = clean;
    if (ctx.currentProfile.currentTimeZone !== clean) {
      ctx.diffs.push({
        key: 'currentTimeZone',
        labelAr: 'المنطقة الزمنية',
        beforeDisplay: ctx.currentProfile.currentTimeZone,
        afterDisplay: clean,
      });
      ctx.affectsAlarms = true;
    }
  }

  if (ctx.sanitizedRaw.currentLat !== undefined) {
    if (!H.isFiniteNumber(ctx.sanitizedRaw.currentLat) || ctx.sanitizedRaw.currentLat < -90 || ctx.sanitizedRaw.currentLat > 90) {
      ctx.errors.push('خط العرض (Lat) يجب أن يكون بين -90 و90.');
    } else {
      ctx.profilePatch.currentLat = ctx.sanitizedRaw.currentLat;
      ctx.normalizedPatch.currentLat = ctx.sanitizedRaw.currentLat;
      ctx.affectsAlarms = true;
    }
  }

  if (ctx.sanitizedRaw.currentLng !== undefined) {
    if (!H.isFiniteNumber(ctx.sanitizedRaw.currentLng) || ctx.sanitizedRaw.currentLng < -180 || ctx.sanitizedRaw.currentLng > 180) {
      ctx.errors.push('خط الطول (Lng) يجب أن يكون بين -180 و180.');
    } else {
      ctx.profilePatch.currentLng = ctx.sanitizedRaw.currentLng;
      ctx.normalizedPatch.currentLng = ctx.sanitizedRaw.currentLng;
      ctx.affectsAlarms = true;
    }
  }

  if (typeof ctx.sanitizedRaw.priorityOrderAr === 'string') {
    const clean = ctx.sanitizedRaw.priorityOrderAr.trim().slice(0, 260);
    ctx.profilePatch.priorityOrderAr = clean;
    ctx.normalizedPatch.priorityOrderAr = clean;
    if (ctx.currentProfile.priorityOrderAr !== clean) {
      ctx.diffs.push({
        key: 'priorityOrderAr',
        labelAr: 'ترتيب الأولويات',
        beforeDisplay: 'الترتيب السابق',
        afterDisplay: clean,
      });
    }
  }

  if (typeof ctx.sanitizedRaw.personalNotes === 'string') {
    const clean = ctx.sanitizedRaw.personalNotes.trim().slice(0, 600);
    ctx.profilePatch.personalNotes = clean;
    ctx.normalizedPatch.personalNotes = clean;
    if (ctx.currentProfile.personalNotes !== clean) {
      ctx.diffs.push({
        key: 'personalNotes',
        labelAr: 'ملاحظات شخصية',
        beforeDisplay: ctx.currentProfile.personalNotes || 'فارغة',
        afterDisplay: clean || 'فارغة',
      });
    }
  }

}
