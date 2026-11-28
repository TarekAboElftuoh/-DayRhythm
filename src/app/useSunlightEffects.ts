import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import {
  buildOccurrenceKey,
  hasFiredInSession,
  isLiveTransition,
  isOccurrenceDismissed,
  markFiredInSession,
} from './alarmOccurrenceGuard';
import type {
  ActiveSanctuaryState,
  QuietModeType,
  SunlightSessionId,
  SunlightSettings,
  TaskSoundCategory,
  TravelState,
} from '../types/dayrhythm';
import type { ComputedSunlightSession } from '../engines/sunlightEngine';
import { playSunlightChime } from '../engines/audioEngine';
import { getDateIsoInTimeZone } from '../engines/prayerEngine';

export interface UseSunlightEffectsParams {
  activeTimeZone: string;
  nowTickMin: number;
  sunlightSettings: SunlightSettings;
  sunlightSessions: ComputedSunlightSession[];
  lowEnergyActive: boolean;
  travelState: TravelState;
  activeSanctuary: ActiveSanctuaryState;
  quietMode: QuietModeType;
  firedReminderKeysRef: React.MutableRefObject<Set<string>>;
  triggerTaskAlert: (title: string, category: TaskSoundCategory, opts?: Record<string, unknown>) => void;
}

export function useSunlightEffects(p: UseSunlightEffectsParams) {
  const prevNowTickMinRef = useRef<number | null>(null);

  const handleSunlightSessionEnd = useCallback(
    (id: SunlightSessionId) => {
      const session = p.sunlightSessions.find((s) => s.id === id);
      if (!session || !session.enabled || session.isCloudBlocked) return;
      const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
      const endKey = `${todayIso}:sunlight_end:${id}`;
      if (p.firedReminderKeysRef.current.has(endKey)) return;
      p.firedReminderKeysRef.current.add(endKey);
      if (p.activeSanctuary.type === 'none' && p.quietMode !== 'silent_all') playSunlightChime('end');
      p.triggerTaskAlert(session.emoji, 'general', {
        privacyEmoji: session.emoji,
        displayTitle: `انتهت جلسة ${session.labelAr}`,
        sourceLabel: 'الأشعة المفيدة',
        description: 'اكتملت مدة التعرّض للشمس اليوم',
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.sunlightSessions, p.activeTimeZone, p.activeSanctuary.type, p.quietMode, p.triggerTaskAlert]
  );

  useEffect(() => {
    const prevNowMin = prevNowTickMinRef.current;
    prevNowTickMinRef.current = p.nowTickMin;
    if (!p.sunlightSettings.enabled || p.lowEnergyActive) return;
    if (p.travelState.active && (p.travelState.deferredCategories?.includes('sunlight') ?? false)) return;
    const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
    const sanctuaryBlocked = p.activeSanctuary.type !== 'none' || p.quietMode === 'silent_all';
    for (const session of p.sunlightSessions) {
      if (!session.enabled || session.isCloudBlocked) continue;
      if (session.leadMinutes > 0 && p.nowTickMin < session.startMinutes) {
        const occKey = buildOccurrenceKey(`sunlight_lead_${session.id}`, todayIso, session.alertMinutes);
        const leadKey = `${todayIso}:sunlight_lead:${session.id}:${session.alertMinutes}`;
        if (
          !p.firedReminderKeysRef.current.has(leadKey) &&
          isLiveTransition(prevNowMin, p.nowTickMin, session.alertMinutes, 4) &&
          !hasFiredInSession(occKey) &&
          !isOccurrenceDismissed(occKey)
        ) {
          p.firedReminderKeysRef.current.add(leadKey);
          markFiredInSession(occKey);
          if (!sanctuaryBlocked) playSunlightChime(session.id);
          p.triggerTaskAlert(session.emoji, 'general', {
            privacyEmoji: session.emoji,
            displayTitle: `${session.labelAr} بعد ${session.leadMinutes} د`,
            sourceLabel: 'الأشعة المفيدة',
            description: session.descAr,
            occurrenceKey: occKey,
          });
        }
      }
      if (p.nowTickMin < session.endMinutes) {
        const occKey = buildOccurrenceKey(`sunlight_start_${session.id}`, todayIso, session.startMinutes);
        const startKey = `${todayIso}:sunlight_start:${session.id}:${session.startMinutes}`;
        if (
          !p.firedReminderKeysRef.current.has(startKey) &&
          isLiveTransition(prevNowMin, p.nowTickMin, session.startMinutes, 4) &&
          !hasFiredInSession(occKey) &&
          !isOccurrenceDismissed(occKey)
        ) {
          p.firedReminderKeysRef.current.add(startKey);
          markFiredInSession(occKey);
          if (!sanctuaryBlocked) playSunlightChime(session.id);
          p.triggerTaskAlert(session.emoji, 'general', {
            privacyEmoji: session.emoji,
            displayTitle: `ابدأ ${session.labelAr} الآن (${session.durationMinutes} د)`,
            sourceLabel: 'الأشعة المفيدة',
            description: session.descAr,
            occurrenceKey: occKey,
          });
        }
      }
      const occEndKey = buildOccurrenceKey(`sunlight_end_${session.id}`, todayIso, session.endMinutes);
      const endKey = `${todayIso}:sunlight_end:${session.id}`;
      if (
        !p.firedReminderKeysRef.current.has(endKey) &&
        isLiveTransition(prevNowMin, p.nowTickMin, session.endMinutes, 1) &&
        !hasFiredInSession(occEndKey) &&
        !isOccurrenceDismissed(occEndKey)
      ) {
        p.firedReminderKeysRef.current.add(endKey);
        markFiredInSession(occEndKey);
        if (!sanctuaryBlocked) playSunlightChime('end');
        p.triggerTaskAlert(session.emoji, 'general', {
          privacyEmoji: session.emoji,
          displayTitle: `انتهت جلسة ${session.labelAr}`,
          sourceLabel: 'الأشعة المفيدة',
          description: 'اكتملت مدة التعرّض للشمس اليوم',
          occurrenceKey: occEndKey,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.sunlightSettings.enabled, p.sunlightSessions, p.nowTickMin, p.activeTimeZone, p.activeSanctuary.type, p.quietMode, p.triggerTaskAlert]);

  return { handleSunlightSessionEnd };
}
