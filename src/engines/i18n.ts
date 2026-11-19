import { AppLanguage, QuietModeType } from '../types/dayrhythm';

export const UI_STRINGS = {
  ar: {
    brand: 'إيقاع اليوم · DayRhythm',
    navDashboard: 'لوحة اليوم',
    navMobile: 'الموبايل والويدجت',
    navOverlay: 'منبه الشاشة',
    navAssistant: 'المساعد والخرائط',
    navBlueprint: 'المخطط المعماري',
    ctaCatchUp: '⚡ تدارك اليوم',
    nextAlarmHeader: 'المنبه القادم',
    adhanLeadTag: 'تنبيه قبل الأذان بـ 3 دقائق',
    rhythmTag: 'إيقاع اليوم',
    dualStreaksTitle: 'سلاسل الالتزام الثنائية',
    hydrationTitle: 'محرك الترطيب (177 مل / كوب)',
    logCupBtn: '+1 كوب (177 مل)',
    timelineTitle: 'الجدول الزمني للإيقاع اليومي',
    timelineSubtitle: 'عناوين بأزواج الإيموجي · مراسي الجمعة · المزامنة الرباعية · مكنسة الـ 14 يوماً',
    quietModesTitle: 'أوضاع الهدوء المؤقتة (متزامنة بين الهاتف والكمبيوتر)',
    periodicTitle: 'المهام الدورية الخاصة المجدولة',
    sharedTruthTitle: 'بروتوكول الذاكرة المشتركة (Google Drive Shared Changelog)',
    langSwitchLabel: 'EN',
  },
  en: {
    brand: 'DayRhythm · إيقاع اليوم',
    navDashboard: 'Today Dashboard',
    navMobile: 'Mobile & Widgets',
    navOverlay: 'PC Overlay',
    navAssistant: 'Gemini & Maps',
    navBlueprint: 'Architecture',
    ctaCatchUp: '⚡ Smart Catch-Up',
    nextAlarmHeader: 'Next Alarm',
    adhanLeadTag: '-3m Pre-Adhan Lead',
    rhythmTag: 'Daily Rhythm',
    dualStreaksTitle: 'Dual Commitment Streaks',
    hydrationTitle: 'Hydration Engine (177 ml / cup)',
    logCupBtn: '+1 Cup (177 ml)',
    timelineTitle: 'Daily Rhythm Schedule Timeline',
    timelineSubtitle: 'Emoji-Pair Titles · Friday Anchors · 4-Tier Free Sync · 14-Day Tombstones',
    quietModesTitle: 'Smart Timed Quiet Modes (Phone ↔ PC Sync)',
    periodicTitle: 'Scheduled Periodic Rituals',
    sharedTruthTitle: 'Shared Truth Protocol (Google Drive Changelog)',
    langSwitchLabel: 'عربي',
  },
} as const;

export const QUIET_MODE_LABELS: Record<
  QuietModeType,
  { ar: string; en: string; descAr: string; descEn: string }
> = {
  normal: {
    ar: '🔊 عادي (كامل)',
    en: '🔊 Normal (Full)',
    descAr: 'صوت + اهتزاز + نوافذ وكبسولة',
    descEn: 'Audio + Haptics + Overlays',
  },
  mute_audio: {
    ar: '🔈 كتم الصوت فقط',
    en: '🔈 Mute Audio Only',
    descAr: 'بدون صوت مع بقاء الاهتزاز والكبسولة والشاشات',
    descEn: 'Muted sound, keeps haptics & visual capsule',
  },
  vibrate_only: {
    ar: '📳 اهتزاز فقط',
    en: '📳 Vibrate Only',
    descAr: 'اهتزاز في الموبايل وصامت تام في الكمبيوتر',
    descEn: 'Phone vibration only, silent on PC',
  },
  silent_all: {
    ar: '🔕 صامت شامل',
    en: '🔕 Silent All',
    descAr: 'كتم الصوت والاهتزاز والنوافذ المنبثقة (عدا نداء الصلاة المحمي)',
    descEn: 'No audio, haptics, or popups (except protected Adhan)',
  },
};

export function t(lang: AppLanguage, key: keyof typeof UI_STRINGS.ar): string {
  return UI_STRINGS[lang][key];
}
