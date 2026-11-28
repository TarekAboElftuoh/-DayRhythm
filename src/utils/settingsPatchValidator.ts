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

const WEEKDAY_NAMES_AR: ReadonlyArray<string> = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

const QUIET_MODE_LABELS_AR: Record<QuietModeType, string> = {
  normal: 'عادي',
  mute_audio: 'كتم الصوت',
  vibrate_only: 'اهتزاز فقط',
  silent_all: 'صمت كامل',
};

const SLEEP_STRATEGY_LABELS_AR: Record<SleepStrategy, string> = {
  night_only_strict: 'نوم ليلي فقط',
  biphasic_qailulah: 'نوم ليلي + قيلولة',
  anchor_early_bed: 'نوم ليلي مبكر',
};

const SANCTUARY_MODE_LABELS_AR: Record<SanctuarySilenceModeOption, string> = {
  silent_inbox: 'صندوق صامت داخل التطبيق',
  silent_notif: 'إشعارات صامتة بالهاتف',
  vibrate_notif: 'إشعارات باهتزاز خفيف',
  hide_all: 'إخفاء كامل أثناء الحرم',
};

const FASTING_OVERRIDE_LABELS_AR: Record<'auto' | 'fasting' | 'normal', string> = {
  auto: 'تلقائي حسب الجدول',
  fasting: 'صائم اليوم (تفعيل إجباري)',
  normal: 'يوم عادي (إفطار)',
};

const MED_FASTING_POLICY_LABELS_AR: Record<MedicationFastingPolicy, string> = {
  'auto-nearest': 'تلقائي لأقرب وجبة',
  'before-fajr': 'قبل الفجر (السحور)',
  'after-maghrib': 'بعد المغرب (الإفطار)',
  skip: 'تخطي في أيام الصيام',
  unchanged: 'بدون تغيير في الموعد',
};

const SOUND_CATEGORY_LABELS_AR: Record<TaskSoundCategory, string> = {
  prayer: 'الصلاة',
  water: 'المياه',
  medication: 'العلاجات',
  focus_work: 'العمل والتركيز',
  walk_health: 'المشي والصحة',
  sleep_suhoor: 'النوم والسحور',
  meeting_event: 'الاجتماعات',
  general: 'عام',
};

const VALID_QUIET_MODES: ReadonlySet<string> = new Set([
  'normal',
  'mute_audio',
  'vibrate_only',
  'silent_all',
]);

const VALID_SLEEP_STRATEGIES: ReadonlySet<string> = new Set([
  'night_only_strict',
  'biphasic_qailulah',
  'anchor_early_bed',
]);

const VALID_SANCTUARY_MODES: ReadonlySet<string> = new Set([
  'silent_inbox',
  'silent_notif',
  'vibrate_notif',
  'hide_all',
]);

const VALID_FASTING_OVERRIDES: ReadonlySet<string> = new Set([
  'auto',
  'fasting',
  'normal',
]);

const VALID_MED_FASTING_POLICIES: ReadonlySet<string> = new Set([
  'auto-nearest',
  'before-fajr',
  'after-maghrib',
  'skip',
  'unchanged',
]);

const VALID_TRAVEL_DURATION_MODES: ReadonlySet<string> = new Set([
  'until_return',
  '1d',
  '2d',
  '7d',
  '14d',
  'custom_date',
  'today',
  'tomorrow',
  'manual',
]);

const VALID_TRAVEL_DEFERRABLE: ReadonlySet<string> = new Set([
  'water',
  'sunlight',
  'calendar',
  'tasks',
]);

const VALID_LEAD_MINUTES: ReadonlySet<number> = new Set([5, 10, 15, 20, 30]);
const VALID_SNOOZE_MINUTES: ReadonlySet<number> = new Set([5, 10, 15]);
const VALID_SOUND_CATEGORIES: ReadonlySet<string> = new Set(
  Object.keys(SOUND_CATEGORY_LABELS_AR)
);

/**
 * Security blocklist: keys that Gemini may NEVER read, expose, or mutate.
 * Normalized by stripping underscores/hyphens and lowercasing.
 */
const BLOCKED_CANONICAL_KEYS: ReadonlySet<string> = new Set([
  'geminiapikey',
  'defaultgeminiapikey',
  'geminiapikeystoragekey',
  'apikey',
  'token',
  'authtoken',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'oauthtoken',
  'calendartoken',
  'bearertoken',
  'secret',
  'clientsecret',
  'password',
  'passcode',
  'pin',
  'firebase',
  'firebaseconfig',
  'authdomain',
  'projectid',
  'storagebucket',
  'messagingsenderid',
  'appid',
  'measurementid',
  'uid',
  'userid',
  'firebaseuid',
  'clientid',
  'originclientid',
  'authuser',
  'email',
  'autoexecutechat',
]);

/** Whitelist of patch keys accepted by the validator. */
const WHITELISTED_KEYS: ReadonlySet<string> = new Set([
  // Sleep & wake
  'bedtime24',
  'bedtime',
  'sleepTargetHours',
  'sleepTargetMinutes',
  'wakeLeadBeforeFajrMinutes',
  'suhoorLeadMinutes',
  'sleepStrategy',
  'sleepDebtMinutes',
  // Fasting
  'fastingDays',
  'addFastingDays',
  'removeFastingDays',
  'fastingMonThu',
  'fastingWhiteDays',
  'fastingOverride',
  // Hydration & body
  'dailyWaterTargetLiters',
  'dailyWaterTargetMl',
  'cupSizeMl',
  'waterRemindersEnabled',
  'weightKg',
  'heightCm',
  // Audio Silence Sanctuaries
  'adhanLeadMinutes',
  'prayerSilenceMinutes',
  'fajrSilenceMinutes',
  'oneTimeSilenceMinutes',
  'oneTimeSilenceDateKey',
  'sanctuarySilenceMode',
  'sanctuaryOverrideUntilMs',
  'sanctuaryOverrideMinutes',
  'cancelActiveSanctuaryEarly',
  'defaultSnoozeMinutes',
  'soundRepeats',
  // Phone & battery
  'phoneChargeLimitPct',
  'chargeAlertEnabled',
  'smartChargeAlertEnabled',
  'chargeAlertKeepUntilUnplugged',
  'smartChargeKeepUntilUnplugged',
  // Daily modes & UI & work & location
  'quietMode',
  'quietModeMinutes',
  'adhanSoundInSilent',
  'meetingMode',
  'meetingModeMinutes',
  'travelState',
  'lowEnergyDateKey',
  'sunMode',
  'language',
  'capsuleOrientation',
  'capsuleSize',
  'liveAlertsEnabled',
  'liveAlertsLeadMinutes',
  'liveAlertsAlwaysOn',
  'liveAlertsShowCharging',
  'persistentCountdownNotif',
  'includePrayerAnchors',
  'careerTrack',
  'workEnabled',
  'workStart24',
  'workEnd24',
  'workDays',
  'autoLocationSync',
  'currentCityName',
  'currentTimeZone',
  'currentLat',
  'currentLng',
  'priorityOrderAr',
  'personalNotes',
  // Medication fasting policies
  'medicationFastingPolicies',
  // Optional metadata stripped cleanly when passed from Gemini tool args
  'summaryAr',
]);

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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalKeyName(key: string): string {
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

function collectBlockedKeysDeep(
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidTime24(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatTime24Ar(hhmm?: string): string {
  if (!hhmm || !isValidTime24(hhmm)) return 'تلقائي';
  const [hhStr, mmStr] = hhmm.split(':');
  const hh = Number(hhStr);
  const period = hh >= 12 ? 'م' : 'ص';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mmStr} ${period}`;
}

function formatWeekdaysAr(days?: number[]): string {
  if (!days || days.length === 0) return 'لا يوجد';
  return days.map((d) => WEEKDAY_NAMES_AR[d] ?? String(d)).join('، ');
}

function normalizeWeekdayArray(
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

function formatMinutesAsHoursAr(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h} س (${minutes} د)`;
}

function sameNumberArray(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function readBooleanFlag(
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

  let fastingOverrideOut: 'auto' | 'fasting' | 'normal' | undefined;
  let sanctuaryOverrideUntilMsOut: number | undefined;
  let cancelActiveSanctuaryEarlyOut: boolean | undefined;
  let travelStatePatchOut: TravelStatePatch | undefined;
  let affectsAlarms = false;

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

  // Step 1: Deeply strip security blocklisted keys first
  const sanitizedRaw = collectBlockedKeysDeep(rawPatch, '', blockedKeys, warnings) as Record<
    string,
    unknown
  >;

  // Step 2: Enforce strict whitelist at top level
  for (const key of Object.keys(sanitizedRaw)) {
    if (!WHITELISTED_KEYS.has(key)) {
      warnings.push(`تم تجاهل الإعداد غير المدعوم «${key}».`);
    }
  }

  const currentApp = context?.appSettings ?? {};
  const currentChargeLimit = currentApp.phoneChargeLimitPct ?? 90;
  const currentWaterReminders = currentApp.waterRemindersEnabled ?? true;
  const currentQuietMode: QuietModeType = currentApp.quietMode ?? 'normal';
  const currentFastingOverride = context?.fastingOverride ?? 'auto';
  const currentSanctuaryMode: SanctuarySilenceModeOption =
    (currentProfile.sanctuarySilenceMode as SanctuarySilenceModeOption | undefined) ??
    'silent_inbox';

  // --- Sleep & Wake Targets ---
  const rawBedtime =
    sanitizedRaw.bedtime24 !== undefined ? sanitizedRaw.bedtime24 : sanitizedRaw.bedtime;
  if (rawBedtime !== undefined) {
    if (rawBedtime === '') {
      profilePatch.bedtime24 = '';
      normalizedPatch.bedtime24 = '';
      if ((currentProfile.bedtime24 ?? '') !== '') {
        diffs.push({
          key: 'bedtime24',
          labelAr: 'وقت النوم المفضّل',
          beforeDisplay: formatTime24Ar(currentProfile.bedtime24),
          afterDisplay: 'تلقائي حسب الفجر والعشاء',
        });
        affectsAlarms = true;
      }
    } else if (typeof rawBedtime === 'string' && isValidTime24(rawBedtime.trim())) {
      const cleanBed = rawBedtime.trim();
      profilePatch.bedtime24 = cleanBed;
      normalizedPatch.bedtime24 = cleanBed;
      if ((currentProfile.bedtime24 ?? '') !== cleanBed) {
        diffs.push({
          key: 'bedtime24',
          labelAr: 'وقت النوم المفضّل',
          beforeDisplay: formatTime24Ar(currentProfile.bedtime24),
          afterDisplay: formatTime24Ar(cleanBed),
        });
        affectsAlarms = true;
      }
    } else {
      errors.push('وقت النوم يجب أن يكون بصيغة HH:MM (مثال: 22:30).');
    }
  }

  if (sanitizedRaw.sleepTargetHours !== undefined) {
    const val = sanitizedRaw.sleepTargetHours;
    if (!isFiniteNumber(val)) {
      errors.push('هدف ساعات النوم يجب أن يكون رقماً صحيحاً.');
    } else if (val < 3 || val > 14) {
      errors.push('هدف ساعات النوم يجب أن يكون بين 3 و14 ساعة.');
    } else {
      const mins = Math.round(val * 60);
      profilePatch.sleepTargetMinutes = mins;
      normalizedPatch.sleepTargetHours = Math.round(val * 10) / 10;
      normalizedPatch.sleepTargetMinutes = mins;
      if (currentProfile.sleepTargetMinutes !== mins) {
        diffs.push({
          key: 'sleepTargetMinutes',
          labelAr: 'هدف النوم اليومي',
          beforeDisplay: formatMinutesAsHoursAr(currentProfile.sleepTargetMinutes),
          afterDisplay: formatMinutesAsHoursAr(mins),
        });
        affectsAlarms = true;
      }
    }
  } else if (sanitizedRaw.sleepTargetMinutes !== undefined) {
    const val = sanitizedRaw.sleepTargetMinutes;
    if (!isFiniteNumber(val)) {
      errors.push('هدف النوم بالدقائق يجب أن يكون رقماً.');
    } else if (val < 180 || val > 840) {
      errors.push('هدف النوم بالدقائق يجب أن يكون بين 180 (3 ساعات) و840 (14 ساعة).');
    } else {
      const mins = Math.round(val);
      profilePatch.sleepTargetMinutes = mins;
      normalizedPatch.sleepTargetMinutes = mins;
      if (currentProfile.sleepTargetMinutes !== mins) {
        diffs.push({
          key: 'sleepTargetMinutes',
          labelAr: 'هدف النوم اليومي',
          beforeDisplay: formatMinutesAsHoursAr(currentProfile.sleepTargetMinutes),
          afterDisplay: formatMinutesAsHoursAr(mins),
        });
        affectsAlarms = true;
      }
    }
  }

  if (sanitizedRaw.wakeLeadBeforeFajrMinutes !== undefined) {
    const val = sanitizedRaw.wakeLeadBeforeFajrMinutes;
    if (!isFiniteNumber(val)) {
      errors.push('مدة الاستيقاظ قبل الفجر يجب أن تكون رقماً.');
    } else if (val < 0 || val > 180) {
      errors.push('مدة الاستيقاظ قبل الفجر يجب أن تكون بين 0 و180 دقيقة.');
    } else {
      const mins = Math.round(val);
      const prev = currentProfile.wakeLeadBeforeFajrMinutes ?? 15;
      profilePatch.wakeLeadBeforeFajrMinutes = mins;
      normalizedPatch.wakeLeadBeforeFajrMinutes = mins;
      if (prev !== mins) {
        diffs.push({
          key: 'wakeLeadBeforeFajrMinutes',
          labelAr: 'الاستيقاظ قبل الفجر',
          beforeDisplay: `${prev} دقيقة`,
          afterDisplay: `${mins} دقيقة`,
        });
        affectsAlarms = true;
      }
    }
  }

  if (sanitizedRaw.suhoorLeadMinutes !== undefined) {
    const val = sanitizedRaw.suhoorLeadMinutes;
    if (!isFiniteNumber(val)) {
      errors.push('مدة السحور قبل الفجر يجب أن تكون رقماً.');
    } else if (val < 10 || val > 180) {
      errors.push('مدة السحور قبل الفجر يجب أن تكون بين 10 و180 دقيقة.');
    } else {
      const mins = Math.round(val);
      profilePatch.suhoorLeadMinutes = mins;
      normalizedPatch.suhoorLeadMinutes = mins;
      if (currentProfile.suhoorLeadMinutes !== mins) {
        diffs.push({
          key: 'suhoorLeadMinutes',
          labelAr: 'موعد السحور قبل الفجر',
          beforeDisplay: `${currentProfile.suhoorLeadMinutes} دقيقة`,
          afterDisplay: `${mins} دقيقة`,
        });
        affectsAlarms = true;
      }
    }
  }

  if (sanitizedRaw.sleepStrategy !== undefined) {
    const val = sanitizedRaw.sleepStrategy;
    if (typeof val === 'string' && VALID_SLEEP_STRATEGIES.has(val)) {
      const strat = val as SleepStrategy;
      profilePatch.sleepStrategy = strat;
      normalizedPatch.sleepStrategy = strat;
      if (currentProfile.sleepStrategy !== strat) {
        diffs.push({
          key: 'sleepStrategy',
          labelAr: 'استراتيجية النوم',
          beforeDisplay: SLEEP_STRATEGY_LABELS_AR[currentProfile.sleepStrategy],
          afterDisplay: SLEEP_STRATEGY_LABELS_AR[strat],
        });
        affectsAlarms = true;
      }
    } else {
      errors.push('استراتيجية النوم غير مدعومة.');
    }
  }

  if (sanitizedRaw.sleepDebtMinutes !== undefined) {
    const val = sanitizedRaw.sleepDebtMinutes;
    if (!isFiniteNumber(val)) {
      errors.push('رصيد النوم الناقص يجب أن يكون رقماً.');
    } else {
      const clamped = Math.max(0, Math.min(480, Math.round(val)));
      if (clamped !== Math.round(val)) {
        warnings.push(`تم ضبط رصيد النوم الناقص إلى ${clamped} دقيقة (النطاق 0–480).`);
      }
      profilePatch.sleepDebtMinutes = clamped;
      normalizedPatch.sleepDebtMinutes = clamped;
      if (currentProfile.sleepDebtMinutes !== clamped) {
        diffs.push({
          key: 'sleepDebtMinutes',
          labelAr: 'رصيد النوم الناقص',
          beforeDisplay: `${currentProfile.sleepDebtMinutes} دقيقة`,
          afterDisplay: `${clamped} دقيقة`,
        });
        affectsAlarms = true;
      }
    }
  }

  // --- Fasting Settings ---
  const hasFastingDayMutation =
    sanitizedRaw.fastingDays !== undefined ||
    sanitizedRaw.addFastingDays !== undefined ||
    sanitizedRaw.removeFastingDays !== undefined ||
    sanitizedRaw.fastingMonThu !== undefined;

  if (hasFastingDayMutation) {
    let nextDays = [...currentProfile.fastingDays];
    let fastingDaysValid = true;

    if (sanitizedRaw.fastingDays !== undefined) {
      const parsed = normalizeWeekdayArray(
        sanitizedRaw.fastingDays,
        'أيام الصيام الأسبوعية',
        errors
      );
      if (parsed) nextDays = parsed;
      else fastingDaysValid = false;
    }

    if (sanitizedRaw.addFastingDays !== undefined) {
      const toAdd = normalizeWeekdayArray(
        sanitizedRaw.addFastingDays,
        'إضافة أيام صيام',
        errors
      );
      if (toAdd) {
        nextDays = Array.from(new Set([...nextDays, ...toAdd])).sort((a, b) => a - b);
      } else {
        fastingDaysValid = false;
      }
    }

    if (sanitizedRaw.removeFastingDays !== undefined) {
      const toRemove = normalizeWeekdayArray(
        sanitizedRaw.removeFastingDays,
        'إزالة أيام صيام',
        errors
      );
      if (toRemove) {
        const removeSet = new Set(toRemove);
        nextDays = nextDays.filter((d) => !removeSet.has(d));
      } else {
        fastingDaysValid = false;
      }
    }

    if (sanitizedRaw.fastingMonThu !== undefined) {
      if (typeof sanitizedRaw.fastingMonThu !== 'boolean') {
        errors.push('صيام الإثنين والخميس يجب أن يكون قيمة منطقية (تفعيل/إيقاف).');
        fastingDaysValid = false;
      } else {
        normalizedPatch.fastingMonThu = sanitizedRaw.fastingMonThu;
        if (sanitizedRaw.fastingMonThu) {
          nextDays = Array.from(new Set([...nextDays, 1, 4])).sort((a, b) => a - b);
        } else {
          nextDays = nextDays.filter((d) => d !== 1 && d !== 4);
        }
      }
    }

    if (fastingDaysValid) {
      profilePatch.fastingDays = nextDays;
      normalizedPatch.fastingDays = nextDays;
      const prevSorted = [...currentProfile.fastingDays].sort((a, b) => a - b);
      if (!sameNumberArray(prevSorted, nextDays)) {
        diffs.push({
          key: 'fastingDays',
          labelAr: 'أيام الصيام الأسبوعية',
          beforeDisplay: formatWeekdaysAr(prevSorted),
          afterDisplay: formatWeekdaysAr(nextDays),
        });
        affectsAlarms = true;
      }
    }
  }

  if (sanitizedRaw.fastingWhiteDays !== undefined) {
    if (typeof sanitizedRaw.fastingWhiteDays !== 'boolean') {
      errors.push('تفعيل صيام الأيام البيض يجب أن يكون true أو false.');
    } else {
      const prev = currentProfile.fastingWhiteDays !== false;
      profilePatch.fastingWhiteDays = sanitizedRaw.fastingWhiteDays;
      normalizedPatch.fastingWhiteDays = sanitizedRaw.fastingWhiteDays;
      if (prev !== sanitizedRaw.fastingWhiteDays) {
        diffs.push({
          key: 'fastingWhiteDays',
          labelAr: 'صيام الأيام البيض (13-15 هجري)',
          beforeDisplay: prev ? 'مفعّل' : 'متوقف',
          afterDisplay: sanitizedRaw.fastingWhiteDays ? 'مفعّل' : 'متوقف',
        });
        affectsAlarms = true;
      }
    }
  }

  if (sanitizedRaw.fastingOverride !== undefined) {
    const val = sanitizedRaw.fastingOverride;
    if (typeof val === 'string' && VALID_FASTING_OVERRIDES.has(val)) {
      const mode = val as 'auto' | 'fasting' | 'normal';
      fastingOverrideOut = mode;
      normalizedPatch.fastingOverride = mode;
      if (currentFastingOverride !== mode) {
        diffs.push({
          key: 'fastingOverride',
          labelAr: 'حالة الصيام اليوم',
          beforeDisplay: FASTING_OVERRIDE_LABELS_AR[currentFastingOverride],
          afterDisplay: FASTING_OVERRIDE_LABELS_AR[mode],
        });
        affectsAlarms = true;
      }
    } else {
      errors.push('قيمة حالة الصيام اليوم غير صالحة (المسموح: auto أو fasting أو normal).');
    }
  }

  // --- Hydration & Body ---
  if (sanitizedRaw.dailyWaterTargetLiters !== undefined) {
    const val = sanitizedRaw.dailyWaterTargetLiters;
    if (!isFiniteNumber(val)) {
      errors.push('هدف الماء باللتر يجب أن يكون رقماً.');
    } else if (val < 1 || val > 8) {
      errors.push('هدف الماء اليومي يجب أن يكون بين 1 و8 لتر.');
    } else {
      const ml = Math.round(val * 1000);
      const prevMl = currentProfile.dailyWaterTargetMl;
      profilePatch.dailyWaterTargetMl = ml;
      normalizedPatch.dailyWaterTargetLiters = Math.round(val * 100) / 100;
      normalizedPatch.dailyWaterTargetMl = ml;
      if (prevMl !== ml) {
        diffs.push({
          key: 'dailyWaterTargetMl',
          labelAr: 'هدف الماء اليومي',
          beforeDisplay: prevMl ? `${(prevMl / 1000).toFixed(1)} لتر (${prevMl} مل)` : 'تلقائي حسب الوزن',
          afterDisplay: `${(ml / 1000).toFixed(1)} لتر (${ml} مل)`,
        });
        affectsAlarms = true;
      }
    }
  } else if (sanitizedRaw.dailyWaterTargetMl !== undefined) {
    const val = sanitizedRaw.dailyWaterTargetMl;
    if (!isFiniteNumber(val)) {
      errors.push('هدف الماء بالملليلتر يجب أن يكون رقماً.');
    } else if (val < 1000 || val > 8000) {
      errors.push('هدف الماء اليومي يجب أن يكون بين 1000 و8000 مل.');
    } else {
      const ml = Math.round(val);
      const prevMl = currentProfile.dailyWaterTargetMl;
      profilePatch.dailyWaterTargetMl = ml;
      normalizedPatch.dailyWaterTargetMl = ml;
      if (prevMl !== ml) {
        diffs.push({
          key: 'dailyWaterTargetMl',
          labelAr: 'هدف الماء اليومي',
          beforeDisplay: prevMl ? `${prevMl} مل` : 'تلقائي حسب الوزن',
          afterDisplay: `${ml} مل`,
        });
        affectsAlarms = true;
      }
    }
  }

  if (sanitizedRaw.cupSizeMl !== undefined) {
    const val = sanitizedRaw.cupSizeMl;
    if (!isFiniteNumber(val)) {
      errors.push('حجم الكوب يجب أن يكون رقماً بالملليلتر.');
    } else if (val < 50 || val > 2000) {
      errors.push('حجم الكوب يجب أن يكون بين 50 و2000 مل.');
    } else {
      const ml = Math.round(val);
      profilePatch.cupSizeMl = ml;
      normalizedPatch.cupSizeMl = ml;
      if (currentProfile.cupSizeMl !== ml) {
        diffs.push({
          key: 'cupSizeMl',
          labelAr: 'حجم كوب الماء',
          beforeDisplay: `${currentProfile.cupSizeMl} مل`,
          afterDisplay: `${ml} مل`,
        });
        affectsAlarms = true;
      }
    }
  }

  const waterRemFlag = readBooleanFlag(sanitizedRaw, 'waterRemindersEnabled');
  if (waterRemFlag.invalidKey) {
    errors.push('تفعيل تنبيهات الماء يجب أن يكون true أو false.');
  } else if (waterRemFlag.present && waterRemFlag.value !== undefined) {
    appSettingsPatch.waterRemindersEnabled = waterRemFlag.value;
    normalizedPatch.waterRemindersEnabled = waterRemFlag.value;
    if (currentWaterReminders !== waterRemFlag.value) {
      diffs.push({
        key: 'waterRemindersEnabled',
        labelAr: 'تنبيهات شرب الماء',
        beforeDisplay: currentWaterReminders ? 'مفعّلة' : 'متوقفة',
        afterDisplay: waterRemFlag.value ? 'مفعّلة' : 'متوقفة',
      });
      affectsAlarms = true;
    }
  }

  if (sanitizedRaw.weightKg !== undefined) {
    const val = sanitizedRaw.weightKg;
    if (!isFiniteNumber(val) || val < 30 || val > 250) {
      errors.push('الوزن يجب أن يكون بين 30 و250 كجم.');
    } else {
      const w = Math.round(val * 2) / 2;
      profilePatch.weightKg = w;
      normalizedPatch.weightKg = w;
      if (currentProfile.weightKg !== w) {
        diffs.push({
          key: 'weightKg',
          labelAr: 'الوزن',
          beforeDisplay: `${currentProfile.weightKg} كجم`,
          afterDisplay: `${w} كجم`,
        });
        affectsAlarms = true;
      }
    }
  }

  if (sanitizedRaw.heightCm !== undefined) {
    const val = sanitizedRaw.heightCm;
    if (!isFiniteNumber(val) || val < 100 || val > 240) {
      errors.push('الطول يجب أن يكون بين 100 و240 سم.');
    } else {
      const h = Math.round(val);
      profilePatch.heightCm = h;
      normalizedPatch.heightCm = h;
      if (currentProfile.heightCm !== h) {
        diffs.push({
          key: 'heightCm',
          labelAr: 'الطول',
          beforeDisplay: `${currentProfile.heightCm} سم`,
          afterDisplay: `${h} سم`,
        });
      }
    }
  }

  // --- Audio Silence Sanctuaries ---
  if (sanitizedRaw.adhanLeadMinutes !== undefined) {
    const val = sanitizedRaw.adhanLeadMinutes;
    if (!isFiniteNumber(val) || val < 0 || val > 30) {
      errors.push('التنبيه قبل الأذان يجب أن يكون بين 0 و30 دقيقة.');
    } else {
      const mins = Math.round(val);
      profilePatch.adhanLeadMinutes = mins;
      normalizedPatch.adhanLeadMinutes = mins;
      if (currentProfile.adhanLeadMinutes !== mins) {
        diffs.push({
          key: 'adhanLeadMinutes',
          labelAr: 'التنبيه قبل الأذان',
          beforeDisplay: `${currentProfile.adhanLeadMinutes} دقيقة`,
          afterDisplay: `${mins} دقيقة`,
        });
        affectsAlarms = true;
      }
    }
  }

  if (sanitizedRaw.prayerSilenceMinutes !== undefined) {
    const val = sanitizedRaw.prayerSilenceMinutes;
    if (!isFiniteNumber(val) || val < 0 || val > 90) {
      errors.push('مدة صمت الصلاة يجب أن تكون بين 0 و90 دقيقة.');
    } else {
      const mins = Math.round(val);
      profilePatch.prayerSilenceMinutes = mins;
      normalizedPatch.prayerSilenceMinutes = mins;
      if (currentProfile.prayerSilenceMinutes !== mins) {
        diffs.push({
          key: 'prayerSilenceMinutes',
          labelAr: 'مدة صمت الصلوات',
          beforeDisplay: `${currentProfile.prayerSilenceMinutes} دقيقة`,
          afterDisplay: `${mins} دقيقة`,
        });
        affectsAlarms = true;
      }
    }
  }

  if (sanitizedRaw.fajrSilenceMinutes !== undefined) {
    const val = sanitizedRaw.fajrSilenceMinutes;
    if (!isFiniteNumber(val) || val < 0 || val > 90) {
      errors.push('مدة صمت الفجر يجب أن تكون بين 0 و90 دقيقة.');
    } else {
      const mins = Math.round(val);
      profilePatch.fajrSilenceMinutes = mins;
      normalizedPatch.fajrSilenceMinutes = mins;
      if (currentProfile.fajrSilenceMinutes !== mins) {
        diffs.push({
          key: 'fajrSilenceMinutes',
          labelAr: 'مدة صمت الفجر',
          beforeDisplay: `${currentProfile.fajrSilenceMinutes} دقيقة`,
          afterDisplay: `${mins} دقيقة`,
        });
        affectsAlarms = true;
      }
    }
  }

  if (sanitizedRaw.oneTimeSilenceMinutes !== undefined) {
    const val = sanitizedRaw.oneTimeSilenceMinutes;
    if (!isFiniteNumber(val) || val < 0 || val > 120) {
      errors.push('الصمت المؤقت لمرة واحدة يجب أن يكون بين 0 و120 دقيقة.');
    } else {
      const mins = Math.round(val);
      profilePatch.oneTimeSilenceMinutes = mins;
      normalizedPatch.oneTimeSilenceMinutes = mins;
      const prev = currentProfile.oneTimeSilenceMinutes ?? 0;
      if (prev !== mins) {
        diffs.push({
          key: 'oneTimeSilenceMinutes',
          labelAr: 'صمت مؤقت لصلاة واحدة',
          beforeDisplay: prev > 0 ? `${prev} دقيقة` : 'غير مفعّل',
          afterDisplay: mins > 0 ? `${mins} دقيقة` : 'إيقاف',
        });
        affectsAlarms = true;
      }
    }
  }

  if (sanitizedRaw.oneTimeSilenceDateKey !== undefined) {
    const val = sanitizedRaw.oneTimeSilenceDateKey;
    if (typeof val === 'string' && (val === '' || isValidIsoDate(val))) {
      profilePatch.oneTimeSilenceDateKey = val;
      normalizedPatch.oneTimeSilenceDateKey = val;
    } else {
      errors.push('تاريخ الصمت المؤقت يجب أن يكون بصيغة YYYY-MM-DD.');
    }
  }

  if (sanitizedRaw.sanctuarySilenceMode !== undefined) {
    const val = sanitizedRaw.sanctuarySilenceMode;
    if (typeof val === 'string' && VALID_SANCTUARY_MODES.has(val)) {
      const mode = val as SanctuarySilenceModeOption;
      profilePatch.sanctuarySilenceMode = mode;
      normalizedPatch.sanctuarySilenceMode = mode;
      if (currentSanctuaryMode !== mode) {
        diffs.push({
          key: 'sanctuarySilenceMode',
          labelAr: 'سلوك الإشعارات أثناء الحرم الصوتي',
          beforeDisplay: SANCTUARY_MODE_LABELS_AR[currentSanctuaryMode],
          afterDisplay: SANCTUARY_MODE_LABELS_AR[mode],
        });
        affectsAlarms = true;
      }
    } else {
      errors.push('نمط الحرم الصوتي غير صالح.');
    }
  }

  if (sanitizedRaw.cancelActiveSanctuaryEarly !== undefined) {
    if (typeof sanitizedRaw.cancelActiveSanctuaryEarly !== 'boolean') {
      errors.push('خيار إنهاء الحرم الصوتي مبكراً يجب أن يكون true أو false.');
    } else if (sanitizedRaw.cancelActiveSanctuaryEarly) {
      cancelActiveSanctuaryEarlyOut = true;
      normalizedPatch.cancelActiveSanctuaryEarly = true;
      diffs.push({
        key: 'cancelActiveSanctuaryEarly',
        labelAr: 'إنهاء الحرم الصوتي الحالي مبكراً',
        beforeDisplay: 'الحرم الصوتي نشط',
        afterDisplay: 'إلغاء مبكر وإعادة الصوت',
      });
      affectsAlarms = true;
    }
  }

  if (sanitizedRaw.sanctuaryOverrideMinutes !== undefined) {
    const val = sanitizedRaw.sanctuaryOverrideMinutes;
    if (!isFiniteNumber(val) || val < 0 || val > 720) {
      errors.push('مدة تجاوز الحرم الصوتي يجب أن تكون بين 0 و720 دقيقة.');
    } else {
      const mins = Math.round(val);
      const untilMs = mins === 0 ? 0 : Date.now() + mins * 60_000;
      sanctuaryOverrideUntilMsOut = untilMs;
      normalizedPatch.sanctuaryOverrideMinutes = mins;
      normalizedPatch.sanctuaryOverrideUntilMs = untilMs;
      diffs.push({
        key: 'sanctuaryOverrideUntilMs',
        labelAr: 'تجاوز الحرم الصوتي',
        beforeDisplay: (context?.sanctuaryOverrideUntilMs ?? 0) > Date.now() ? 'مفعّل' : 'تلقائي',
        afterDisplay: mins === 0 ? 'إعادة التفعيل التلقائي' : `تجاوز لمدة ${mins} دقيقة`,
      });
      affectsAlarms = true;
    }
  } else if (sanitizedRaw.sanctuaryOverrideUntilMs !== undefined) {
    const val = sanitizedRaw.sanctuaryOverrideUntilMs;
    if (!isFiniteNumber(val) || val < 0) {
      errors.push('وقت إنهاء الحرم الصوتي يجب أن يكون رقماً موجباً.');
    } else {
      const untilMs = Math.round(val);
      sanctuaryOverrideUntilMsOut = untilMs;
      normalizedPatch.sanctuaryOverrideUntilMs = untilMs;
      diffs.push({
        key: 'sanctuaryOverrideUntilMs',
        labelAr: 'تجاوز الحرم الصوتي',
        beforeDisplay: (context?.sanctuaryOverrideUntilMs ?? 0) > Date.now() ? 'مفعّل' : 'تلقائي',
        afterDisplay: untilMs === 0 ? 'تلقائي' : 'إلغاء مبكر مؤقت',
      });
      affectsAlarms = true;
    }
  }

  if (sanitizedRaw.defaultSnoozeMinutes !== undefined) {
    const val = sanitizedRaw.defaultSnoozeMinutes;
    if (!isFiniteNumber(val) || !VALID_SNOOZE_MINUTES.has(Math.round(val))) {
      errors.push('مدة الغفوة (Snooze) المسموحة هي 5 أو 10 أو 15 دقيقة فقط.');
    } else {
      const mins = Math.round(val) as 5 | 10 | 15;
      const prev = currentProfile.defaultSnoozeMinutes ?? 5;
      profilePatch.defaultSnoozeMinutes = mins;
      normalizedPatch.defaultSnoozeMinutes = mins;
      if (prev !== mins) {
        diffs.push({
          key: 'defaultSnoozeMinutes',
          labelAr: 'مدة التأجيل (Snooze)',
          beforeDisplay: `${prev} دقائق`,
          afterDisplay: `${mins} دقائق`,
        });
        affectsAlarms = true;
      }
    }
  }

  if (sanitizedRaw.soundRepeats !== undefined) {
    if (!isPlainRecord(sanitizedRaw.soundRepeats)) {
      errors.push('إعدادات تكرار الرنين يجب أن تكون كائناً.');
    } else {
      const repeatsOut: NonNullable<AppSettingsPatch['soundRepeats']> = {};
      for (const [cat, val] of Object.entries(sanitizedRaw.soundRepeats)) {
        if (!VALID_SOUND_CATEGORIES.has(cat)) {
          warnings.push(`تم تجاهل فئة صوت غير معروفة «${cat}».`);
          continue;
        }
        const soundCat = cat as TaskSoundCategory;
        if (val === 'continuous') {
          repeatsOut[soundCat] = 'continuous';
          diffs.push({
            key: `soundRepeats.${soundCat}`,
            labelAr: `تكرار رنين ${SOUND_CATEGORY_LABELS_AR[soundCat]}`,
            beforeDisplay: String(currentProfile.soundRepeats?.[soundCat] ?? 'افتراضي'),
            afterDisplay: 'رنين مستمر',
          });
        } else if (isFiniteNumber(val)) {
          const clamped = Math.max(1, Math.min(10, Math.round(val)));
          if (clamped !== Math.round(val)) {
            warnings.push(`تم ضبط تكرار رنين ${SOUND_CATEGORY_LABELS_AR[soundCat]} إلى ${clamped} (النطاق 1–10).`);
          }
          repeatsOut[soundCat] = clamped;
          diffs.push({
            key: `soundRepeats.${soundCat}`,
            labelAr: `تكرار رنين ${SOUND_CATEGORY_LABELS_AR[soundCat]}`,
            beforeDisplay: String(currentProfile.soundRepeats?.[soundCat] ?? 'افتراضي'),
            afterDisplay: `${clamped} مرات`,
          });
        } else {
          errors.push(`قيمة تكرار الرنين لفئة ${SOUND_CATEGORY_LABELS_AR[soundCat]} غير صالحة.`);
        }
      }
      if (Object.keys(repeatsOut).length > 0) {
        appSettingsPatch.soundRepeats = repeatsOut;
        normalizedPatch.soundRepeats = repeatsOut;
      }
    }
  }

  // --- Phone & Battery ---
  if (sanitizedRaw.phoneChargeLimitPct !== undefined) {
    const val = sanitizedRaw.phoneChargeLimitPct;
    if (!isFiniteNumber(val)) {
      errors.push('حد شحن البطارية يجب أن يكون رقماً بين 50% و100%.');
    } else {
      const rounded = Math.round(val);
      const clamped = Math.max(50, Math.min(100, rounded));
      if (clamped !== rounded) {
        warnings.push(
          `تم تعديل حد الشحن من ${rounded}% إلى ${clamped}% (النطاق المسموح 50%–100%).`
        );
      }
      appSettingsPatch.phoneChargeLimitPct = clamped;
      normalizedPatch.phoneChargeLimitPct = clamped;
      if (currentChargeLimit !== clamped) {
        diffs.push({
          key: 'phoneChargeLimitPct',
          labelAr: 'حد شحن البطارية',
          beforeDisplay: `${currentChargeLimit}%`,
          afterDisplay: `${clamped}%`,
        });
      }
    }
  }

  const chargeAlertFlag = readBooleanFlag(
    sanitizedRaw,
    'chargeAlertEnabled',
    'smartChargeAlertEnabled'
  );
  if (chargeAlertFlag.invalidKey) {
    errors.push('تفعيل تنبيه اكتمال الشحن يجب أن يكون true أو false.');
  } else if (chargeAlertFlag.present && chargeAlertFlag.value !== undefined) {
    const prev = currentApp.chargeAlertEnabled ?? true;
    appSettingsPatch.chargeAlertEnabled = chargeAlertFlag.value;
    normalizedPatch.chargeAlertEnabled = chargeAlertFlag.value;
    if (prev !== chargeAlertFlag.value) {
      diffs.push({
        key: 'chargeAlertEnabled',
        labelAr: 'تنبيه اكتمال الشحن',
        beforeDisplay: prev ? 'مفعّل' : 'متوقف',
        afterDisplay: chargeAlertFlag.value ? 'مفعّل' : 'متوقف',
      });
    }
  }

  const keepUntilUnpluggedFlag = readBooleanFlag(
    sanitizedRaw,
    'chargeAlertKeepUntilUnplugged',
    'smartChargeKeepUntilUnplugged'
  );
  if (keepUntilUnpluggedFlag.invalidKey) {
    errors.push('خيار استمرار رنين الشحن يجب أن يكون true أو false.');
  } else if (keepUntilUnpluggedFlag.present && keepUntilUnpluggedFlag.value !== undefined) {
    const prev = currentApp.chargeAlertKeepUntilUnplugged ?? true;
    appSettingsPatch.chargeAlertKeepUntilUnplugged = keepUntilUnpluggedFlag.value;
    normalizedPatch.chargeAlertKeepUntilUnplugged = keepUntilUnpluggedFlag.value;
    if (prev !== keepUntilUnpluggedFlag.value) {
      diffs.push({
        key: 'chargeAlertKeepUntilUnplugged',
        labelAr: 'استمرار رنين الشحن حتى الفصل',
        beforeDisplay: prev ? 'مفعّل' : 'متوقف',
        afterDisplay: keepUntilUnpluggedFlag.value ? 'مفعّل' : 'متوقف',
      });
    }
  }

  // --- Daily Modes (quietMode, meetingMode, travelState, lowEnergy) ---
  if (sanitizedRaw.quietMode !== undefined) {
    const val = sanitizedRaw.quietMode;
    if (typeof val === 'string' && VALID_QUIET_MODES.has(val)) {
      const mode = val as QuietModeType;
      appSettingsPatch.quietMode = mode;
      normalizedPatch.quietMode = mode;
      let durationMin = 0;
      if (sanitizedRaw.quietModeMinutes !== undefined) {
        if (!isFiniteNumber(sanitizedRaw.quietModeMinutes) || sanitizedRaw.quietModeMinutes < 0) {
          errors.push('مدة وضع الهدوء يجب أن تكون رقماً موجباً بالدقائق.');
        } else {
          durationMin = Math.min(1440, Math.round(sanitizedRaw.quietModeMinutes));
          appSettingsPatch.quietModeMinutes = durationMin;
          normalizedPatch.quietModeMinutes = durationMin;
        }
      }
      if (currentQuietMode !== mode || durationMin > 0) {
        diffs.push({
          key: 'quietMode',
          labelAr: 'وضع الهدوء',
          beforeDisplay: QUIET_MODE_LABELS_AR[currentQuietMode],
          afterDisplay:
            durationMin > 0 && mode !== 'normal'
              ? `${QUIET_MODE_LABELS_AR[mode]} (${durationMin} د)`
              : QUIET_MODE_LABELS_AR[mode],
        });
        affectsAlarms = true;
      }
    } else {
      errors.push('قيمة وضع الهدوء غير صالحة.');
    }
  } else if (sanitizedRaw.meetingMode !== undefined) {
    if (typeof sanitizedRaw.meetingMode !== 'boolean') {
      errors.push('وضع الاجتماع يجب أن يكون true أو false.');
    } else {
      const active = sanitizedRaw.meetingMode;
      const mappedMode: QuietModeType = active ? 'vibrate_only' : 'normal';
      let mins = 0;
      if (active && sanitizedRaw.meetingModeMinutes !== undefined) {
        if (
          !isFiniteNumber(sanitizedRaw.meetingModeMinutes) ||
          sanitizedRaw.meetingModeMinutes < 0 ||
          sanitizedRaw.meetingModeMinutes > 480
        ) {
          errors.push('مدة وضع الاجتماع يجب أن تكون بين 0 و480 دقيقة.');
        } else {
          mins = Math.round(sanitizedRaw.meetingModeMinutes);
        }
      } else if (active) {
        mins = 60;
      }
      appSettingsPatch.quietMode = mappedMode;
      appSettingsPatch.quietModeMinutes = mins;
      normalizedPatch.meetingMode = active;
      normalizedPatch.meetingModeMinutes = mins;
      normalizedPatch.quietMode = mappedMode;
      normalizedPatch.quietModeMinutes = mins;
      diffs.push({
        key: 'meetingMode',
        labelAr: 'وضع الاجتماع',
        beforeDisplay: currentQuietMode !== 'normal' ? 'مفعّل' : 'متوقف',
        afterDisplay: active ? `مفعّل (${mins > 0 ? `${mins} د` : 'مستمر'})` : 'متوقف',
      });
      affectsAlarms = true;
    }
  }

  const adhanSilentFlag = readBooleanFlag(sanitizedRaw, 'adhanSoundInSilent');
  if (adhanSilentFlag.invalidKey) {
    errors.push('خيار صوت الأذان أثناء الصمت يجب أن يكون true أو false.');
  } else if (adhanSilentFlag.present && adhanSilentFlag.value !== undefined) {
    const prev = currentApp.adhanSoundInSilent ?? true;
    appSettingsPatch.adhanSoundInSilent = adhanSilentFlag.value;
    normalizedPatch.adhanSoundInSilent = adhanSilentFlag.value;
    if (prev !== adhanSilentFlag.value) {
      diffs.push({
        key: 'adhanSoundInSilent',
        labelAr: 'نداء الأذان أثناء الصمت',
        beforeDisplay: prev ? 'مفعّل' : 'مكتوم',
        afterDisplay: adhanSilentFlag.value ? 'مفعّل' : 'مكتوم',
      });
      affectsAlarms = true;
    }
  }

  if (sanitizedRaw.travelState !== undefined) {
    if (!isPlainRecord(sanitizedRaw.travelState)) {
      errors.push('بيانات وضع السفر يجب أن تكون كائناً صالحاً.');
    } else {
      const tRaw = sanitizedRaw.travelState;
      const tPatch: TravelStatePatch = {};
      if (tRaw.active !== undefined) {
        if (typeof tRaw.active !== 'boolean') {
          errors.push('حالة تفعيل وضع السفر يجب أن تكون true أو false.');
        } else {
          tPatch.active = tRaw.active;
        }
      }
      if (typeof tRaw.cityName === 'string' && tRaw.cityName.trim()) {
        tPatch.cityName = tRaw.cityName.trim().slice(0, 80);
      }
      if (isFiniteNumber(tRaw.lat) && tRaw.lat >= -90 && tRaw.lat <= 90) {
        tPatch.lat = tRaw.lat;
      }
      if (isFiniteNumber(tRaw.lng) && tRaw.lng >= -180 && tRaw.lng <= 180) {
        tPatch.lng = tRaw.lng;
      }
      if (typeof tRaw.timeZone === 'string' && tRaw.timeZone.trim()) {
        tPatch.timeZone = tRaw.timeZone.trim().slice(0, 64);
      }
      if (isFiniteNumber(tRaw.distanceKm) && tRaw.distanceKm >= 0 && tRaw.distanceKm <= 25000) {
        tPatch.distanceKm = Math.round(tRaw.distanceKm);
      }
      if (typeof tRaw.durationMode === 'string' && VALID_TRAVEL_DURATION_MODES.has(tRaw.durationMode)) {
        tPatch.durationMode = tRaw.durationMode as TravelDurationMode;
      }
      if (typeof tRaw.returnDate === 'string' && isValidIsoDate(tRaw.returnDate)) {
        tPatch.returnDate = tRaw.returnDate;
      }
      if (Array.isArray(tRaw.deferredCategories)) {
        tPatch.deferredCategories = tRaw.deferredCategories.filter(
          (c): c is TravelDeferrableCategory =>
            typeof c === 'string' && VALID_TRAVEL_DEFERRABLE.has(c)
        );
      }
      if (Array.isArray(tRaw.deferredMedIds)) {
        tPatch.deferredMedIds = tRaw.deferredMedIds.filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0
        );
      }
      if (Object.keys(tPatch).length > 0) {
        travelStatePatchOut = tPatch;
        normalizedPatch.travelState = tPatch;
        const prevActive = context?.travelState?.active ?? false;
        const nextActive = tPatch.active ?? prevActive;
        diffs.push({
          key: 'travelState',
          labelAr: 'وضع السفر',
          beforeDisplay: prevActive
            ? `مفعّل (${context?.travelState?.location.nameAr ?? 'سفر'})`
            : 'متوقف',
          afterDisplay: nextActive
            ? `مفعّل (${tPatch.cityName ?? context?.travelState?.location.nameAr ?? 'وجهة السفر'})`
            : 'متوقف (العودة للموقع الأساسي)',
        });
        affectsAlarms = true;
      }
    }
  }

  if (sanitizedRaw.lowEnergyDateKey !== undefined) {
    const val = sanitizedRaw.lowEnergyDateKey;
    if (typeof val === 'string' && (val === '' || isValidIsoDate(val))) {
      profilePatch.lowEnergyDateKey = val;
      normalizedPatch.lowEnergyDateKey = val;
      if (currentProfile.lowEnergyDateKey !== val) {
        diffs.push({
          key: 'lowEnergyDateKey',
          labelAr: 'وضع اليوم الهادئ',
          beforeDisplay: currentProfile.lowEnergyDateKey ? 'مفعّل' : 'عادي',
          afterDisplay: val ? `مفعّل (${val})` : 'عادي',
        });
        affectsAlarms = true;
      }
    } else {
      errors.push('تاريخ وضع اليوم الهادئ يجب أن يكون بصيغة YYYY-MM-DD.');
    }
  }

  // --- UI, Alerts, Work & Location ---
  const sunFlag = readBooleanFlag(sanitizedRaw, 'sunMode');
  if (sunFlag.invalidKey) {
    errors.push('المظهر النهاري يجب أن يكون true أو false.');
  } else if (sunFlag.present && sunFlag.value !== undefined) {
    const prev = currentApp.sunMode ?? false;
    appSettingsPatch.sunMode = sunFlag.value;
    normalizedPatch.sunMode = sunFlag.value;
    if (prev !== sunFlag.value) {
      diffs.push({
        key: 'sunMode',
        labelAr: 'مظهر الواجهة',
        beforeDisplay: prev ? 'نهاري (الشمس)' : 'ليلي (AMOLED)',
        afterDisplay: sunFlag.value ? 'نهاري (الشمس)' : 'ليلي (AMOLED)',
      });
    }
  }

  if (sanitizedRaw.language !== undefined) {
    if (sanitizedRaw.language === 'ar' || sanitizedRaw.language === 'en') {
      const prev = currentApp.language ?? 'ar';
      appSettingsPatch.language = sanitizedRaw.language;
      normalizedPatch.language = sanitizedRaw.language;
      if (prev !== sanitizedRaw.language) {
        diffs.push({
          key: 'language',
          labelAr: 'لغة التطبيق',
          beforeDisplay: prev === 'ar' ? 'العربية' : 'English',
          afterDisplay: sanitizedRaw.language === 'ar' ? 'العربية' : 'English',
        });
      }
    } else {
      errors.push('اللغة المدعومة هي ar أو en فقط.');
    }
  }

  if (sanitizedRaw.capsuleOrientation !== undefined) {
    if (
      sanitizedRaw.capsuleOrientation === 'horizontal' ||
      sanitizedRaw.capsuleOrientation === 'vertical'
    ) {
      const prev = currentApp.capsuleOrientation ?? 'horizontal';
      appSettingsPatch.capsuleOrientation = sanitizedRaw.capsuleOrientation;
      normalizedPatch.capsuleOrientation = sanitizedRaw.capsuleOrientation;
      if (prev !== sanitizedRaw.capsuleOrientation) {
        diffs.push({
          key: 'capsuleOrientation',
          labelAr: 'اتجاه كبسولة سطح المكتب',
          beforeDisplay: prev === 'horizontal' ? 'أفقي' : 'عمودي',
          afterDisplay: sanitizedRaw.capsuleOrientation === 'horizontal' ? 'أفقي' : 'عمودي',
        });
      }
    } else {
      errors.push('اتجاه الكبسولة يجب أن يكون horizontal أو vertical.');
    }
  }

  if (sanitizedRaw.capsuleSize !== undefined) {
    if (
      sanitizedRaw.capsuleSize === 'sm' ||
      sanitizedRaw.capsuleSize === 'md' ||
      sanitizedRaw.capsuleSize === 'lg'
    ) {
      const prev = currentApp.capsuleSize ?? 'md';
      appSettingsPatch.capsuleSize = sanitizedRaw.capsuleSize;
      normalizedPatch.capsuleSize = sanitizedRaw.capsuleSize;
      if (prev !== sanitizedRaw.capsuleSize) {
        diffs.push({
          key: 'capsuleSize',
          labelAr: 'حجم كبسولة سطح المكتب',
          beforeDisplay: prev,
          afterDisplay: sanitizedRaw.capsuleSize,
        });
      }
    } else {
      errors.push('حجم الكبسولة يجب أن يكون sm أو md أو lg.');
    }
  }

  const liveAlertsFlag = readBooleanFlag(sanitizedRaw, 'liveAlertsEnabled');
  if (liveAlertsFlag.invalidKey) {
    errors.push('تفعيل التنبيهات الحية يجب أن يكون true أو false.');
  } else if (liveAlertsFlag.present && liveAlertsFlag.value !== undefined) {
    const prev = currentApp.liveAlertsEnabled ?? true;
    appSettingsPatch.liveAlertsEnabled = liveAlertsFlag.value;
    normalizedPatch.liveAlertsEnabled = liveAlertsFlag.value;
    if (prev !== liveAlertsFlag.value) {
      diffs.push({
        key: 'liveAlertsEnabled',
        labelAr: 'التنبيهات الحية',
        beforeDisplay: prev ? 'مفعّلة' : 'متوقفة',
        afterDisplay: liveAlertsFlag.value ? 'مفعّلة' : 'متوقفة',
      });
    }
  }

  if (sanitizedRaw.liveAlertsLeadMinutes !== undefined) {
    const val = sanitizedRaw.liveAlertsLeadMinutes;
    if (!isFiniteNumber(val) || !VALID_LEAD_MINUTES.has(Math.round(val))) {
      errors.push('وقت التنبيه الحي المسبق يجب أن يكون 5 أو 10 أو 15 أو 20 أو 30 دقيقة.');
    } else {
      const lead = Math.round(val) as 5 | 10 | 15 | 20 | 30;
      const prev = currentApp.liveAlertsLeadMinutes ?? 15;
      appSettingsPatch.liveAlertsLeadMinutes = lead;
      normalizedPatch.liveAlertsLeadMinutes = lead;
      if (prev !== lead) {
        diffs.push({
          key: 'liveAlertsLeadMinutes',
          labelAr: 'التنبيه الحي قبل الموعد',
          beforeDisplay: `${prev} د`,
          afterDisplay: `${lead} د`,
        });
      }
    }
  }

  const liveAlwaysFlag = readBooleanFlag(sanitizedRaw, 'liveAlertsAlwaysOn');
  if (liveAlwaysFlag.present && liveAlwaysFlag.value !== undefined) {
    appSettingsPatch.liveAlertsAlwaysOn = liveAlwaysFlag.value;
    normalizedPatch.liveAlertsAlwaysOn = liveAlwaysFlag.value;
    diffs.push({
      key: 'liveAlertsAlwaysOn',
      labelAr: 'بقاء الكبسولة الحية ظاهرة دائماً',
      beforeDisplay: currentApp.liveAlertsAlwaysOn ? 'نعم' : 'لا',
      afterDisplay: liveAlwaysFlag.value ? 'نعم' : 'لا',
    });
  }

  const liveChargingFlag = readBooleanFlag(sanitizedRaw, 'liveAlertsShowCharging');
  if (liveChargingFlag.present && liveChargingFlag.value !== undefined) {
    appSettingsPatch.liveAlertsShowCharging = liveChargingFlag.value;
    normalizedPatch.liveAlertsShowCharging = liveChargingFlag.value;
    diffs.push({
      key: 'liveAlertsShowCharging',
      labelAr: 'إظهار حالة الشحن بالتنبيه الحي',
      beforeDisplay: currentApp.liveAlertsShowCharging ? 'نعم' : 'لا',
      afterDisplay: liveChargingFlag.value ? 'نعم' : 'لا',
    });
  }

  const persistentNotifFlag = readBooleanFlag(sanitizedRaw, 'persistentCountdownNotif');
  if (persistentNotifFlag.present && persistentNotifFlag.value !== undefined) {
    appSettingsPatch.persistentCountdownNotif = persistentNotifFlag.value;
    normalizedPatch.persistentCountdownNotif = persistentNotifFlag.value;
    diffs.push({
      key: 'persistentCountdownNotif',
      labelAr: 'إشعار العد التنازلي الدائم',
      beforeDisplay: currentApp.persistentCountdownNotif ? 'مفعّل' : 'متوقف',
      afterDisplay: persistentNotifFlag.value ? 'مفعّل' : 'متوقف',
    });
  }

  const prayerAnchorsFlag = readBooleanFlag(sanitizedRaw, 'includePrayerAnchors');
  if (prayerAnchorsFlag.present && prayerAnchorsFlag.value !== undefined) {
    appSettingsPatch.includePrayerAnchors = prayerAnchorsFlag.value;
    normalizedPatch.includePrayerAnchors = prayerAnchorsFlag.value;
    diffs.push({
      key: 'includePrayerAnchors',
      labelAr: 'تضمين مواقيت الصلاة بالجدول',
      beforeDisplay: (currentApp.includePrayerAnchors ?? true) ? 'مفعّل' : 'متوقف',
      afterDisplay: prayerAnchorsFlag.value ? 'مفعّل' : 'متوقف',
    });
    affectsAlarms = true;
  }

  if (typeof sanitizedRaw.careerTrack === 'string') {
    const clean = sanitizedRaw.careerTrack.trim().slice(0, 120);
    profilePatch.careerTrack = clean;
    normalizedPatch.careerTrack = clean;
    if (currentProfile.careerTrack !== clean) {
      diffs.push({
        key: 'careerTrack',
        labelAr: 'المسار المهني',
        beforeDisplay: currentProfile.careerTrack || 'غير محدد',
        afterDisplay: clean || 'غير محدد',
      });
    }
  }

  const workEnabledFlag = readBooleanFlag(sanitizedRaw, 'workEnabled');
  if (workEnabledFlag.present && workEnabledFlag.value !== undefined) {
    profilePatch.workEnabled = workEnabledFlag.value;
    normalizedPatch.workEnabled = workEnabledFlag.value;
    if (currentProfile.workEnabled !== workEnabledFlag.value) {
      diffs.push({
        key: 'workEnabled',
        labelAr: 'ساعات العمل الثابتة',
        beforeDisplay: currentProfile.workEnabled ? 'مفعّلة' : 'متوقفة',
        afterDisplay: workEnabledFlag.value ? 'مفعّلة' : 'متوقفة',
      });
      affectsAlarms = true;
    }
  }

  if (sanitizedRaw.workStart24 !== undefined) {
    if (typeof sanitizedRaw.workStart24 === 'string' && isValidTime24(sanitizedRaw.workStart24.trim())) {
      const clean = sanitizedRaw.workStart24.trim();
      profilePatch.workStart24 = clean;
      normalizedPatch.workStart24 = clean;
      if (currentProfile.workStart24 !== clean) {
        diffs.push({
          key: 'workStart24',
          labelAr: 'بداية الدوام',
          beforeDisplay: formatTime24Ar(currentProfile.workStart24),
          afterDisplay: formatTime24Ar(clean),
        });
      }
    } else {
      errors.push('بداية العمل يجب أن تكون بصيغة HH:MM.');
    }
  }

  if (sanitizedRaw.workEnd24 !== undefined) {
    if (typeof sanitizedRaw.workEnd24 === 'string' && isValidTime24(sanitizedRaw.workEnd24.trim())) {
      const clean = sanitizedRaw.workEnd24.trim();
      profilePatch.workEnd24 = clean;
      normalizedPatch.workEnd24 = clean;
      if (currentProfile.workEnd24 !== clean) {
        diffs.push({
          key: 'workEnd24',
          labelAr: 'نهاية الدوام',
          beforeDisplay: formatTime24Ar(currentProfile.workEnd24),
          afterDisplay: formatTime24Ar(clean),
        });
      }
    } else {
      errors.push('نهاية العمل يجب أن تكون بصيغة HH:MM.');
    }
  }

  if (sanitizedRaw.workDays !== undefined) {
    const parsed = normalizeWeekdayArray(sanitizedRaw.workDays, 'أيام العمل', errors);
    if (parsed) {
      profilePatch.workDays = parsed;
      normalizedPatch.workDays = parsed;
      if (!sameNumberArray([...currentProfile.workDays].sort((a, b) => a - b), parsed)) {
        diffs.push({
          key: 'workDays',
          labelAr: 'أيام العمل',
          beforeDisplay: formatWeekdaysAr(currentProfile.workDays),
          afterDisplay: formatWeekdaysAr(parsed),
        });
      }
    }
  }

  const autoLocFlag = readBooleanFlag(sanitizedRaw, 'autoLocationSync');
  if (autoLocFlag.present && autoLocFlag.value !== undefined) {
    profilePatch.autoLocationSync = autoLocFlag.value;
    normalizedPatch.autoLocationSync = autoLocFlag.value;
    if (currentProfile.autoLocationSync !== autoLocFlag.value) {
      diffs.push({
        key: 'autoLocationSync',
        labelAr: 'تحديث الموقع التلقائي',
        beforeDisplay: currentProfile.autoLocationSync ? 'تلقائي' : 'يدوي',
        afterDisplay: autoLocFlag.value ? 'تلقائي' : 'يدوي',
      });
    }
  }

  if (typeof sanitizedRaw.currentCityName === 'string' && sanitizedRaw.currentCityName.trim()) {
    const clean = sanitizedRaw.currentCityName.trim().slice(0, 100);
    profilePatch.currentCityName = clean;
    normalizedPatch.currentCityName = clean;
    if (currentProfile.currentCityName !== clean) {
      diffs.push({
        key: 'currentCityName',
        labelAr: 'المدينة الحالية',
        beforeDisplay: currentProfile.currentCityName,
        afterDisplay: clean,
      });
      affectsAlarms = true;
    }
  }

  if (typeof sanitizedRaw.currentTimeZone === 'string' && sanitizedRaw.currentTimeZone.trim()) {
    const clean = sanitizedRaw.currentTimeZone.trim().slice(0, 64);
    profilePatch.currentTimeZone = clean;
    normalizedPatch.currentTimeZone = clean;
    if (currentProfile.currentTimeZone !== clean) {
      diffs.push({
        key: 'currentTimeZone',
        labelAr: 'المنطقة الزمنية',
        beforeDisplay: currentProfile.currentTimeZone,
        afterDisplay: clean,
      });
      affectsAlarms = true;
    }
  }

  if (sanitizedRaw.currentLat !== undefined) {
    if (!isFiniteNumber(sanitizedRaw.currentLat) || sanitizedRaw.currentLat < -90 || sanitizedRaw.currentLat > 90) {
      errors.push('خط العرض (Lat) يجب أن يكون بين -90 و90.');
    } else {
      profilePatch.currentLat = sanitizedRaw.currentLat;
      normalizedPatch.currentLat = sanitizedRaw.currentLat;
      affectsAlarms = true;
    }
  }

  if (sanitizedRaw.currentLng !== undefined) {
    if (!isFiniteNumber(sanitizedRaw.currentLng) || sanitizedRaw.currentLng < -180 || sanitizedRaw.currentLng > 180) {
      errors.push('خط الطول (Lng) يجب أن يكون بين -180 و180.');
    } else {
      profilePatch.currentLng = sanitizedRaw.currentLng;
      normalizedPatch.currentLng = sanitizedRaw.currentLng;
      affectsAlarms = true;
    }
  }

  if (typeof sanitizedRaw.priorityOrderAr === 'string') {
    const clean = sanitizedRaw.priorityOrderAr.trim().slice(0, 260);
    profilePatch.priorityOrderAr = clean;
    normalizedPatch.priorityOrderAr = clean;
    if (currentProfile.priorityOrderAr !== clean) {
      diffs.push({
        key: 'priorityOrderAr',
        labelAr: 'ترتيب الأولويات',
        beforeDisplay: 'الترتيب السابق',
        afterDisplay: clean,
      });
    }
  }

  if (typeof sanitizedRaw.personalNotes === 'string') {
    const clean = sanitizedRaw.personalNotes.trim().slice(0, 600);
    profilePatch.personalNotes = clean;
    normalizedPatch.personalNotes = clean;
    if (currentProfile.personalNotes !== clean) {
      diffs.push({
        key: 'personalNotes',
        labelAr: 'ملاحظات شخصية',
        beforeDisplay: currentProfile.personalNotes || 'فارغة',
        afterDisplay: clean || 'فارغة',
      });
    }
  }

  // --- Medication Fasting Policies ---
  if (sanitizedRaw.medicationFastingPolicies !== undefined) {
    if (!Array.isArray(sanitizedRaw.medicationFastingPolicies)) {
      errors.push('تعديلات سياسة صيام الأدوية يجب أن تكون قائمة.');
    } else {
      const medsList = context?.medications ?? [];
      for (const item of sanitizedRaw.medicationFastingPolicies) {
        if (!isPlainRecord(item)) {
          errors.push('عنصر سياسة صيام الدواء غير صالح.');
          continue;
        }
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const medId = typeof item.medicationId === 'string' ? item.medicationId.trim() : undefined;
        const policyRaw = item.fastingPolicy;
        if (!name && !medId) {
          errors.push('يجب تحديد اسم أو معرف الدواء لتعديل سياسة الصيام.');
          continue;
        }
        if (typeof policyRaw !== 'string' || !VALID_MED_FASTING_POLICIES.has(policyRaw)) {
          errors.push(`سياسة الصيام للدواء «${name || medId}» غير صالحة.`);
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
        medicationFastingPolicies.push({
          medicationId: matchedMed?.id ?? medId,
          name: displayName,
          fastingPolicy: policy,
        });
        if (prevPolicy !== policy || !matchedMed) {
          diffs.push({
            key: `medFastingPolicy.${matchedMed?.id ?? displayName}`,
            labelAr: `سياسة صيام «${displayName}»`,
            beforeDisplay: MED_FASTING_POLICY_LABELS_AR[prevPolicy],
            afterDisplay: MED_FASTING_POLICY_LABELS_AR[policy],
          });
          affectsAlarms = true;
        }
      }
      if (medicationFastingPolicies.length > 0) {
        normalizedPatch.medicationFastingPolicies = medicationFastingPolicies;
      }
    }
  }

  const hasChanges =
    Object.keys(profilePatch).length > 0 ||
    Object.keys(appSettingsPatch).length > 0 ||
    fastingOverrideOut !== undefined ||
    sanctuaryOverrideUntilMsOut !== undefined ||
    cancelActiveSanctuaryEarlyOut === true ||
    travelStatePatchOut !== undefined ||
    medicationFastingPolicies.length > 0;

  return {
    valid: errors.length === 0,
    hasChanges,
    normalizedPatch,
    profilePatch,
    appSettingsPatch,
    fastingOverride: fastingOverrideOut,
    sanctuaryOverrideUntilMs: sanctuaryOverrideUntilMsOut,
    cancelActiveSanctuaryEarly: cancelActiveSanctuaryEarlyOut,
    travelStatePatch: travelStatePatchOut,
    medicationFastingPolicies,
    diffs,
    errors,
    warnings,
    blockedKeys,
    affectsAlarms,
  };
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
  const fastingDaysStr = formatWeekdaysAr(currentProfile.fastingDays);
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
