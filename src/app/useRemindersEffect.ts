import { useEffect, useRef } from 'react';
import type React from 'react';
import type {
  ActiveSanctuaryState,
  DailyRhythmPlan,
  GoogleTaskItem,
  HydrationDayLog,
  MedicationItem,
  QuietModeType,
  ScheduleBlock,
  TaskSoundCategory,
  TravelState,
} from '../types/dayrhythm';
import type { PrayerTimeEntry } from './buildExactAlarms';
import { classifyTaskSound } from '../engines/audioEngine';
import { computeMedicationDaysLeft, resolveMedicationDosesForDay } from '../engines/lifeRhythmEngine';
import { formatMinutes12h, getDateIsoInTimeZone, getWeekdayInTimeZone } from '../engines/prayerEngine';
import { cleanCalendarText } from '../services/apiClient';
import { extractTaskTimeMinutesForToday } from '../utils/appHelpers';
import {
  buildOccurrenceKey,
  hasFiredInSession,
  isLiveTransition,
  isOccurrenceDismissed,
  markFiredInSession,
} from './alarmOccurrenceGuard';

export interface UseRemindersEffectParams {
  activeTimeZone: string;
  nowTickMin: number;
  waterRemindersEnabled: boolean;
  dailyRhythmPlan: DailyRhythmPlan;
  hydrationToday: HydrationDayLog | undefined;
  travelState: TravelState;
  lowEnergyActive: boolean;
  prayers: PrayerTimeEntry[];
  medications: MedicationItem[];
  liveBlocks: ScheduleBlock[];
  googleTasks: GoogleTaskItem[];
  includePrayerAnchors: boolean;
  activeSanctuary: ActiveSanctuaryState;
  quietMode: QuietModeType;
  firedReminderKeysRef: React.MutableRefObject<Set<string>>;
  acknowledgedBlockIdsRef: React.MutableRefObject<Set<string>>;
  triggerTaskAlert: (title: string, category: TaskSoundCategory, opts?: Record<string, unknown>) => void;
  handleLogWaterCup: (opts?: { fromRemote?: boolean; waterOpId?: string; dateKey?: string }) => void;
  handleAcknowledgeAudioAlert: () => void;
}

export function useRemindersEffect(p: UseRemindersEffectParams): void {
  const prevNowTickMinRef = useRef<number | null>(null);

  useEffect(() => {
    const prevNowMin = prevNowTickMinRef.current;
    const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
    const todayW = getWeekdayInTimeZone(p.activeTimeZone);

    const canFireScheduled = (occurrenceKey: string, triggerMin: number, maxLagMin: number): boolean => {
      if (!isLiveTransition(prevNowMin, p.nowTickMin, triggerMin, maxLagMin)) return false;
      if (hasFiredInSession(occurrenceKey) || isOccurrenceDismissed(occurrenceKey)) return false;
      return true;
    };

    const nativeOwnsReminders = Boolean(
      (window as Window & { DayRhythmNative?: { scheduleExactAlarms?: unknown } }).DayRhythmNative?.scheduleExactAlarms
    );
    if (!nativeOwnsReminders) {
      const deferWater = p.travelState.active && (p.travelState.deferredCategories?.includes('water') ?? false);
      if (p.waterRemindersEnabled && p.hydrationToday && !deferWater) {
        p.dailyRhythmPlan.hydrationSlots.forEach((slot, idx) => {
          if (p.hydrationToday?.slots[idx]) return;
          if (p.lowEnergyActive && idx % 2 === 1) return;
          const occurrenceKey = buildOccurrenceKey(`water_${slot.cupIndex}`, todayIso, slot.timeMinutes);
          const key = `${todayIso}:water:${slot.cupIndex}`;
          if (p.firedReminderKeysRef.current.has(key)) return;
          if (!canFireScheduled(occurrenceKey, slot.timeMinutes, 4)) return;
          p.firedReminderKeysRef.current.add(key);
          markFiredInSession(occurrenceKey);
          p.triggerTaskAlert('💧', 'water', {
            privacyEmoji: '💧',
            displayTitle: `موعد شرب كوب ماء (${p.dailyRhythmPlan.cupSizeMl} مل)`,
            sourceLabel: 'ترطيب يومي',
            occurrenceKey,
          });
        });
      }

      const deferredMedsSet = p.travelState.active ? new Set(p.travelState.deferredMedIds ?? []) : null;
      const fajrMin = p.prayers.find((x) => x.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
      const maghribMin = p.prayers.find((x) => x.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;
      p.medications.forEach((med) => {
        if (deferredMedsSet?.has(med.id)) return;
        if (med.daysOfWeek && med.daysOfWeek.length > 0 && !med.daysOfWeek.includes(todayW)) return;
        const rawTimesCount = med.times24 && med.times24.length > 0 ? med.times24.length : med.time24 ? 1 : 0;
        const resolved = resolveMedicationDosesForDay(med, {
          isFastingToday: Boolean(p.dailyRhythmPlan.isFastingToday),
          fajrMin,
          maghribMin,
        });
        const takenDoses = med.takenDateKey === todayIso ? med.takenDosesToday ?? [] : [];
        resolved.doses.forEach((dose) => {
          const alreadyTaken =
            rawTimesCount > 1
              ? takenDoses.includes(dose.originalTime24) || takenDoses.includes(dose.effectiveTime24)
              : med.takenDateKey === todayIso;
          if (alreadyTaken) return;

          const occurrenceKey = buildOccurrenceKey(`med_${med.id}`, todayIso, dose.effectiveMin);
          const key = `${todayIso}:med:${med.id}:${dose.effectiveTime24}`;
          if (p.firedReminderKeysRef.current.has(key)) return;
          if (!canFireScheduled(occurrenceKey, dose.effectiveMin, 4)) return;
          p.firedReminderKeysRef.current.add(key);
          markFiredInSession(occurrenceKey);
          p.triggerTaskAlert('💊', 'medication', {
            privacyEmoji: '💊',
            displayTitle: `موعد الجرعة: ${med.name}`,
            sourceLabel: dose.wasShifted ? 'العلاجات والأدوية · معدّل للصيام' : 'العلاجات والأدوية',
            medicationId: med.id,
            medicationDoseTime24: rawTimesCount > 1 ? dose.originalTime24 : undefined,
            occurrenceKey,
          });
        });
      });

      const deferCalendar = p.travelState.active && (p.travelState.deferredCategories?.includes('calendar') ?? false);
      p.liveBlocks.forEach((block) => {
        if (
          block.deleted || block.completed || block.isAllDay || block.source === 'prayer' ||
          block.reflowStatus === 'postponed_travel' ||
          (deferCalendar && block.source === 'google_calendar') ||
          (p.lowEnergyActive && !block.isAnchor && block.source !== 'google_calendar') ||
          p.acknowledgedBlockIdsRef.current.has(block.id)
        ) return;
        const occurrenceKey = buildOccurrenceKey(block.id, todayIso, block.startMin);
        const key = `${todayIso}:event:${block.id}:${block.startMin}`;
        if (p.firedReminderKeysRef.current.has(key)) return;
        if (!canFireScheduled(occurrenceKey, block.startMin, 2)) return;
        p.firedReminderKeysRef.current.add(key);
        markFiredInSession(occurrenceKey);
        const emojiOnly = (block.emojiPair || '📅').trim();
        const cleanTitle = cleanCalendarText(block.categoryAr) || 'موعد في التقويم';
        const soundCat = classifyTaskSound(block.categoryAr, block.emojiPair, block.isAnchor);
        p.triggerTaskAlert(emojiOnly, soundCat, {
          privacyEmoji: emojiOnly, displayTitle: cleanTitle, sourceLabel: 'تقويم Google',
          description: block.description, blockId: block.id, occurrenceKey,
        });
      });

      const deferTasks = p.travelState.active && (p.travelState.deferredCategories?.includes('tasks') ?? false);
      if (!deferTasks && !p.lowEnergyActive) {
        p.googleTasks.forEach((tk) => {
          if (tk.status === 'completed') return;
          const info = extractTaskTimeMinutesForToday(tk, todayIso, p.activeTimeZone);
          if (!info || !info.hasExplicitTime) return;
          const occurrenceKey = buildOccurrenceKey(tk.id, todayIso, info.startMin);
          const key = `${todayIso}:gtask:${tk.id}:${info.startMin}`;
          if (p.firedReminderKeysRef.current.has(key)) return;
          if (!canFireScheduled(occurrenceKey, info.startMin, 2)) return;
          p.firedReminderKeysRef.current.add(key);
          markFiredInSession(occurrenceKey);
          const cleanTitle = cleanCalendarText(tk.title) || 'مهمة مطلوبة الآن';
          const soundCat = classifyTaskSound(tk.title, '☑️', false);
          p.triggerTaskAlert('☑️', soundCat, {
            privacyEmoji: '☑️', displayTitle: cleanTitle,
            sourceLabel: tk.taskListTitle ? `مهام · ${tk.taskListTitle}` : 'مهام Google',
            taskId: tk.id, taskListId: tk.taskListId, description: tk.notes, occurrenceKey,
          });
        });
      }

      if (p.includePrayerAnchors && !p.lowEnergyActive) {
        const maghribItem = p.prayers.find((x) => x.id === 'maghrib');
        if (maghribItem) {
          const redSunMin = (maghribItem as PrayerTimeEntry & { redSunMinutes?: number }).redSunMinutes;
          if (typeof redSunMin === 'number') {
            const occurrenceKeyRed = buildOccurrenceKey('redSun', todayIso, redSunMin);
            const keyRed = `${todayIso}:redSun:${redSunMin}`;
            if (!p.firedReminderKeysRef.current.has(keyRed) && canFireScheduled(occurrenceKeyRed, redSunMin, 4)) {
              p.firedReminderKeysRef.current.add(keyRed);
              markFiredInSession(occurrenceKeyRed);
              p.triggerTaskAlert('🌇 ☀️', 'general', {
                privacyEmoji: '🌇', displayTitle: 'الشمس الحمراء · الساعة الذهبية', sourceLabel: 'مواقيت شمسية',
                description: `الشمس الحمراء · بداية الساعة الذهبية المسائية (${formatMinutes12h(redSunMin, 'ar')}) — الغروب بعد ~6 دقائق`,
                occurrenceKey: occurrenceKeyRed,
              });
            }
          }
          const occurrenceKeyMag = buildOccurrenceKey('maghrib_solar', todayIso, maghribItem.adhanMinutes);
          const keyMag = `${todayIso}:maghrib_solar:${maghribItem.adhanMinutes}`;
          if (!p.firedReminderKeysRef.current.has(keyMag) && canFireScheduled(occurrenceKeyMag, maghribItem.adhanMinutes, 4)) {
            p.firedReminderKeysRef.current.add(keyMag);
            markFiredInSession(occurrenceKeyMag);
            p.triggerTaskAlert('🌆', 'general', {
              privacyEmoji: '🌆', displayTitle: 'غروب الشمس', sourceLabel: 'مواقيت شمسية',
              description: `غروب الشمس (${formatMinutes12h(maghribItem.adhanMinutes, 'ar')}) — وقت المغرب`,
              occurrenceKey: occurrenceKeyMag,
            });
          }
        }
      }
    }

    prevNowTickMinRef.current = p.nowTickMin;

    p.medications.forEach((med) => {
      if (typeof med.remainingDoses !== 'number' || med.remainingDoses < 0) return;
      const alertLeadDays = Math.max(1, Math.min(14, med.refillAlertDays ?? 3));
      const daysLeft = computeMedicationDaysLeft(
        med.remainingDoses,
        med.times24 && med.times24.length > 0 ? med.times24.length : 1,
        med.daysOfWeek
      );
      if (daysLeft <= alertLeadDays) {
        const refillKey = `${todayIso}:med_refill:${med.id}`;
        if (!p.firedReminderKeysRef.current.has(refillKey)) p.firedReminderKeysRef.current.add(refillKey);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    p.nowTickMin, p.waterRemindersEnabled, p.dailyRhythmPlan.hydrationSlots,
    p.dailyRhythmPlan.isFastingToday, p.dailyRhythmPlan.cupSizeMl, p.hydrationToday,
    p.medications, p.liveBlocks, p.googleTasks, p.activeTimeZone, p.activeSanctuary.type,
    p.quietMode, p.triggerTaskAlert, p.handleLogWaterCup, p.handleAcknowledgeAudioAlert,
    p.includePrayerAnchors, p.lowEnergyActive, p.prayers,
  ]);
}
