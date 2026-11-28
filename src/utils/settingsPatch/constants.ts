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

export const WEEKDAY_NAMES_AR: ReadonlyArray<string> = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

export const QUIET_MODE_LABELS_AR: Record<QuietModeType, string> = {
  normal: 'عادي',
  mute_audio: 'كتم الصوت',
  vibrate_only: 'اهتزاز فقط',
  silent_all: 'صمت كامل',
};

export const SLEEP_STRATEGY_LABELS_AR: Record<SleepStrategy, string> = {
  night_only_strict: 'نوم ليلي فقط',
  biphasic_qailulah: 'نوم ليلي + قيلولة',
  anchor_early_bed: 'نوم ليلي مبكر',
};

export const SANCTUARY_MODE_LABELS_AR: Record<SanctuarySilenceModeOption, string> = {
  silent_inbox: 'صندوق صامت داخل التطبيق',
  silent_notif: 'إشعارات صامتة بالهاتف',
  vibrate_notif: 'إشعارات باهتزاز خفيف',
  hide_all: 'إخفاء كامل أثناء الحرم',
};

export const FASTING_OVERRIDE_LABELS_AR: Record<'auto' | 'fasting' | 'normal', string> = {
  auto: 'تلقائي حسب الجدول',
  fasting: 'صائم اليوم (تفعيل إجباري)',
  normal: 'يوم عادي (إفطار)',
};

export const MED_FASTING_POLICY_LABELS_AR: Record<MedicationFastingPolicy, string> = {
  'auto-nearest': 'تلقائي لأقرب وجبة',
  'before-fajr': 'قبل الفجر (السحور)',
  'after-maghrib': 'بعد المغرب (الإفطار)',
  skip: 'تخطي في أيام الصيام',
  unchanged: 'بدون تغيير في الموعد',
};

export const SOUND_CATEGORY_LABELS_AR: Record<TaskSoundCategory, string> = {
  prayer: 'الصلاة',
  water: 'المياه',
  medication: 'العلاجات',
  focus_work: 'العمل والتركيز',
  walk_health: 'المشي والصحة',
  sleep_suhoor: 'النوم والسحور',
  meeting_event: 'الاجتماعات',
  general: 'عام',
};

export const VALID_QUIET_MODES: ReadonlySet<string> = new Set([
  'normal',
  'mute_audio',
  'vibrate_only',
  'silent_all',
]);

export const VALID_SLEEP_STRATEGIES: ReadonlySet<string> = new Set([
  'night_only_strict',
  'biphasic_qailulah',
  'anchor_early_bed',
]);

export const VALID_SANCTUARY_MODES: ReadonlySet<string> = new Set([
  'silent_inbox',
  'silent_notif',
  'vibrate_notif',
  'hide_all',
]);

export const VALID_FASTING_OVERRIDES: ReadonlySet<string> = new Set([
  'auto',
  'fasting',
  'normal',
]);

export const VALID_MED_FASTING_POLICIES: ReadonlySet<string> = new Set([
  'auto-nearest',
  'before-fajr',
  'after-maghrib',
  'skip',
  'unchanged',
]);

export const VALID_TRAVEL_DURATION_MODES: ReadonlySet<string> = new Set([
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

export const VALID_TRAVEL_DEFERRABLE: ReadonlySet<string> = new Set([
  'water',
  'sunlight',
  'calendar',
  'tasks',
]);

export const VALID_LEAD_MINUTES: ReadonlySet<number> = new Set([5, 10, 15, 20, 30]);
export const VALID_SNOOZE_MINUTES: ReadonlySet<number> = new Set([5, 10, 15]);
export const VALID_SOUND_CATEGORIES: ReadonlySet<string> = new Set(
  Object.keys(SOUND_CATEGORY_LABELS_AR)
);

/**
 * Security blocklist: keys that Gemini may NEVER read, expose, or mutate.
 * Normalized by stripping underscores/hyphens and lowercasing.
 */
export const BLOCKED_CANONICAL_KEYS: ReadonlySet<string> = new Set([
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
export const WHITELISTED_KEYS: ReadonlySet<string> = new Set([
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

