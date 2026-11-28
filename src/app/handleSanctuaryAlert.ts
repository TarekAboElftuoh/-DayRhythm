import type React from 'react';
import type {
  ActiveSanctuaryState,
  LifeProfile,
  SilentNotificationItem,
  TaskSoundCategory,
} from '../types/dayrhythm';
import { playTaskSignature, TASK_SOUND_META } from '../engines/audioEngine';
import { triggerHapticWaveform } from '../engines/hapticsEngine';
import { formatNow12hInTimeZone } from '../engines/prayerEngine';
import { cleanCalendarText } from '../services/apiClient';
import type { SanctuarySilenceMode } from '../services/cloudStateService';

export function handleSanctuaryAlert(params: {
  activeSanctuary: ActiveSanctuaryState;
  lifeProfile: LifeProfile;
  category: TaskSoundCategory;
  visibleTitle: string;
  visibleDescription: string;
  visibleSource: string;
  isAndroidNative: boolean;
  activeTimeZone: string;
  setSilentNotifications: React.Dispatch<React.SetStateAction<SilentNotificationItem[]>>;
  showToast: (msg: string) => void;
}): boolean {
  const {
    activeSanctuary,
    lifeProfile,
    category,
    visibleTitle,
    visibleDescription,
    visibleSource,
    isAndroidNative,
    activeTimeZone,
    setSilentNotifications,
    showToast,
  } = params;
  if (activeSanctuary.type === 'none') return false;

  const meta = TASK_SOUND_META[category];
  const isPrayerOrSleep = activeSanctuary.type === 'prayer' || activeSanctuary.type === 'sleep';
  const silenceMode: SanctuarySilenceMode = isPrayerOrSleep
    ? lifeProfile.sanctuarySilenceMode ?? 'silent_inbox'
    : 'silent_inbox';
  if (silenceMode === 'hide_all') return true;

  const cleanedTitle = cleanCalendarText(visibleTitle);
  const hasReadableChars = cleanedTitle.replace(/[\p{Extended_Pictographic}\uFE0F\u200D\s]/gu, '').length > 0;
  const readableTitle = hasReadableChars ? cleanedTitle : meta.labelAr;
  const shortDescription = visibleDescription || visibleSource;

  if (!isPrayerOrSleep && !isAndroidNative) {
    playTaskSignature(category, { sanctuary: activeSanctuary, repeatCount: 1 });
  } else if (silenceMode === 'vibrate_notif' && !isAndroidNative) {
    triggerHapticWaveform('pomodoro');
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate([160, 80, 160]); } catch { /* ignore */ }
    }
  }

  const reasonAr =
    activeSanctuary.type === 'prayer' ? 'وقت الصلاة' : activeSanctuary.type === 'sleep' ? 'وقت النوم' : 'وضع الاجتماع';
  const item: SilentNotificationItem = {
    id: `sn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title: readableTitle,
    description: shortDescription,
    reasonAr,
    time12h: formatNow12hInTimeZone(activeTimeZone, 'ar'),
    soundCategory: category,
    createdAtIso: new Date().toISOString(),
  };
  setSilentNotifications((prev) => [item, ...prev].slice(0, 25));

  if ((silenceMode === 'silent_notif' || silenceMode === 'vibrate_notif') && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(readableTitle, { body: shortDescription ? `${shortDescription} · ${reasonAr}` : reasonAr, silent: true });
    } catch { /* ignore */ }
  }
  showToast(
    `${silenceMode === 'vibrate_notif' ? '📳' : '🔕'} ${readableTitle}${shortDescription ? ` — ${shortDescription}` : ''}`
  );
  return true;
}
