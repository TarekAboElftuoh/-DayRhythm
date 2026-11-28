export type DayMode = 'normal' | 'fasting';

export type FastingExemption = 'none' | 'travel' | 'health';

export type SurfaceTheme = 'amoled' | 'obsidian';

export type CapsuleOrientation = 'horizontal' | 'vertical';

export type CapsuleSize = 'sm' | 'md' | 'lg';

export interface UiPrefs {
  selectedLogoId: string;
  capsuleOrientation: CapsuleOrientation;
  capsuleSize: CapsuleSize;
  cloudApiUrl?: string;
}

export type AppLanguage = 'ar' | 'en';

export type ActiveTab = 'dashboard' | 'mobile' | 'overlay' | 'assistant';

export type TravelGroup = 'A_FIXED' | 'B_WORK' | 'C_PORTABLE' | 'ANCHOR';

export type TravelDurationMode =
  | 'until_return'
  | '1d'
  | '2d'
  | '7d'
  | '14d'
  | 'custom_date'
  | 'today'
  | 'tomorrow'
  | 'manual';

export type TravelDeferrableCategory = 'water' | 'sunlight' | 'calendar' | 'tasks';

export type CatchUpDecision = 'start_now' | 'shift_evening' | 'skip_today';

export type QuietModeType = 'normal' | 'mute_audio' | 'vibrate_only' | 'silent_all';

export type SyncTierMode =
  | 'google_calendar_api'
  | 'android_calendar_contract'
  | 'apps_script_bridge'
  | 'ics_rrule_feed'
  | 'offline_rules';

export interface GeoLocation {
  id: string;
  nameAr: string;
  nameEn: string;
  lat: number;
  lng: number;
  tzOffsetHours: number;
  timeZone?: string;
}

export interface PrayerTimeItem {
  id: 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
  nameAr: string;
  nameEn: string;
  emojiPair: string;
  adhanMinutes: number;
  alarmMinutes: number; // adhanMinutes - 3 (except sunrise)
  isObligatory: boolean;
  redSunMinutes?: number;
}

export interface ScheduleBlock {
  id: string;
  emojiPair: string;
  categoryAr: string;
  categoryEn?: string;
  startMin: number;
  durationMin: number;
  minDurationMin: number;
  isAnchor: boolean;
  isFridayRitual?: boolean;
  travelGroup: TravelGroup;
  canShiftEvening: boolean;
  completed: boolean;
  deleted: boolean;
  reflowStatus?: 'compressed' | 'shifted_evening' | 'started_now' | 'skipped' | 'postponed_travel';
  originalStartMin?: number;
  originalDurationMin?: number;
  googleEventId?: string;
  googleCalendarId?: string;
  calendarTitle?: string;
  calendarColor?: string;
  googleHtmlLink?: string;
  dateIso?: string;
  startIso?: string;
  endIso?: string;
  isAllDay?: boolean;
  description?: string;
  source?: 'google_calendar' | 'prayer' | 'ics' | 'offline' | 'creative';
  creativeActivityId?: string;
}

