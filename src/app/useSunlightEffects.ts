import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
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
import { evaluateOccurrenceGate, observeTick, type TickObservation } from '../engines/alarmGate';
import { loadDismissedOccurrenceKeys, markOccurrenceFired } from '../engines/alarmOccurrence';

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
  const tickRef = useRef<TickObservation | null>(null);

  const handleSunlightSessionEnd = useCallback(
    (id: SunlightSessionId) => {
      const session = p.sunlightSessions.find((s) => s.id === id);
      if (!session || !session.enabled || session.isCloudBlocked) return;
      const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
      const gate = evaluateOccurrenceGate({
        entityId: `sunlight_end_${id}`,
        dateIso: todayIso,
        scheduledMinute: session.endMinutes,
        nowMinute: p.nowTickMin,
        previousMinute: tickRef.current?.minute ?? null,
        windowMinutes: Math.max(1, session.durationMinutes),
        firedKeys: p.firedReminderKeysRef.current,
        dismissedKeys: loadDismissedOccurrenceKeys(),
      });
      if (!gate.fire) return;
      markOccurrenceFired(gate.key, todayIso);
      if (p.activeSanctuary.type === 'none' && p.quietMode !== 'silent_all') playSunlightChime('end');
      p.triggerTaskAlert(session.emoji, 'general', {
        privacyEmoji: session.emoji,
        displayTitle: `انتهت جلسة ${session.labelAr}`,
        sourceLabel: 'الأشعة المفيدة',
        description: 'اكتملت مدة التعرّض للشمس اليوم',
        occurrenceKey: gate.key,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.sunlightSessions, p.activeTimeZone, p.activeSanctuary.type, p.quietMode, p.triggerTaskAlert, p.nowTickMin]
  );

  useEffect(() => {
    if (!p.sunlightSettings.enabled || p.lowEnergyActive) return;
    if (p.travelState.active && (p.travelState.deferredCategories?.includes('sunlight') ?? false)) return;
    const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
    const sanctuaryBlocked = p.activeSanctuary.type !== 'none' || p.quietMode === 'silent_all';
    const firedKeys = p.firedReminderKeysRef.current;
    const dismissedKeys = loadDismissedOccurrenceKeys();
    const { previousMinute, current } = observeTick(tickRef.current, todayIso, p.nowTickMin);
    tickRef.current = current;

    const gate = (entityId: string, scheduledMinute: number, windowMinutes: number) =>
      evaluateOccurrenceGate({
        entityId,
        dateIso: todayIso,
        scheduledMinute,
        nowMinute: p.nowTickMin,
        previousMinute,
        windowMinutes,
        firedKeys,
        dismissedKeys,
      });

    for (const session of p.sunlightSessions) {
      if (!session.enabled || session.isCloudBlocked) continue;

      if (session.leadMinutes > 0) {
        const lead = gate(`sunlight_lead_${session.id}`, session.alertMinutes, session.leadMinutes);
        if (lead.fire) {
          if (!sanctuaryBlocked) playSunlightChime(session.id);
          p.triggerTaskAlert(session.emoji, 'general', {
            privacyEmoji: session.emoji,
            displayTitle: `${session.labelAr} بعد ${session.leadMinutes} د`,
            sourceLabel: 'الأشعة المفيدة',
            description: session.descAr,
            occurrenceKey: lead.key,
          });
        }
      }

      const start = gate(`sunlight_start_${session.id}`, session.startMinutes, session.durationMinutes);
      if (start.fire) {
        if (!sanctuaryBlocked) playSunlightChime(session.id);
        p.triggerTaskAlert(session.emoji, 'general', {
          privacyEmoji: session.emoji,
          displayTitle: `ابدأ ${session.labelAr} الآن (${session.durationMinutes} د)`,
          sourceLabel: 'الأشعة المفيدة',
          description: session.descAr,
          occurrenceKey: start.key,
        });
      }

      const end = gate(`sunlight_end_${session.id}`, session.endMinutes, 1);
      if (end.fire) {
        if (!sanctuaryBlocked) playSunlightChime('end');
        p.triggerTaskAlert(session.emoji, 'general', {
          privacyEmoji: session.emoji,
          displayTitle: `انتهت جلسة ${session.labelAr}`,
          sourceLabel: 'الأشعة المفيدة',
          description: 'اكتملت مدة التعرّض للشمس اليوم',
          occurrenceKey: end.key,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.sunlightSettings.enabled, p.sunlightSessions, p.nowTickMin, p.activeTimeZone, p.activeSanctuary.type, p.quietMode, p.triggerTaskAlert]);

  return { handleSunlightSessionEnd };
}
