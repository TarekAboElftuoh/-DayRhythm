import type {
  DailyRhythmPlan,
  GoogleTaskItem,
  HydrationDayLog,
  LifeProfile,
  MedicationItem,
  QuietModeType,
  ScheduleBlock,
  SunlightSettings,
  TravelState,
} from '../types/dayrhythm';
import type { ComputedSunlightSession } from '../engines/sunlightEngine';
import { calculateEgyptianPrayerTimes, formatMinutes12h, getNowMinutesInTimeZone, getWeekdayInTimeZone } from '../engines/prayerEngine';
import { buildMedicationAlarmEntries } from '../engines/lifeRhythmEngine';
import { cleanCalendarText } from '../services/apiClient';
import { trueNowMs } from '../engines/trueClock';
import { extractTaskTimeMinutesForToday } from '../utils/appHelpers';
import { sanitizeEmojis } from './capsuleTextHelpers';

export type PrayerTimeEntry = ReturnType<typeof calculateEgyptianPrayerTimes>[number];

export interface ExactAlarmEntry {
  id: string;
  kind: 'prayer' | 'water' | 'medication' | 'event' | 'task';
  title: string;
  body: string;
  triggerAtMs: number;
  snoozeMinutes: number;
  medicationId?: string;
  doseTime24?: string;
}

export interface BuildExactAlarmsInput {
  activeTimeZone: string;
  todayCairoIso: string;
  lifeProfile: LifeProfile;
  dailyRhythmPlan: DailyRhythmPlan;
  quietMode: QuietModeType;
  quietUntilTs: number | null;
  adhanOverrideSilent: boolean;
  sanctuaryOverrideUntilMs: number;
  lowEnergyActive: boolean;
  includePrayerAnchors: boolean;
  prayers: PrayerTimeEntry[];
  sunlightSettings: SunlightSettings;
  sunlightSessions: ComputedSunlightSession[];
  waterRemindersEnabled: boolean;
  hydrationToday: HydrationDayLog | undefined;
  targetCups: number;
  travelState: TravelState;
  medications: MedicationItem[];
  liveBlocks: ScheduleBlock[];
  googleTasks: GoogleTaskItem[];
}

export function buildExactAlarms(input: BuildExactAlarmsInput): ExactAlarmEntry[] {
  const nowMs = trueNowMs();
  const nowMinInTz = getNowMinutesInTimeZone(input.activeTimeZone, new Date(nowMs));
  const minuteStartMs = nowMs - (nowMs % 60_000);
  const msForMinuteToday = (targetMin: number) => minuteStartMs + (targetMin - nowMinInTz) * 60_000;
  const todayW = getWeekdayInTimeZone(input.activeTimeZone);
  const snoozeMinutes =
    input.lifeProfile.defaultSnoozeMinutes === 10 || input.lifeProfile.defaultSnoozeMinutes === 15
      ? input.lifeProfile.defaultSnoozeMinutes
      : 5;

  const alarms: ExactAlarmEntry[] = [];
  const sleepDurMin = (input.dailyRhythmPlan.wakeMin - input.dailyRhythmPlan.bedtimeMin + 1440) % 1440;
  const isFullMuteMode = input.quietMode === 'silent_all' || input.quietMode === 'mute_audio';
  const hasFiniteQuietUntil =
    typeof input.quietUntilTs === 'number' && Number.isFinite(input.quietUntilTs) && input.quietUntilTs > 0;
  const isMutedByQuietModeAt = (triggerAtMs: number) => {
    if (!isFullMuteMode) return false;
    if (hasFiniteQuietUntil) return triggerAtMs <= (input.quietUntilTs as number);
    return true;
  };
  const isSilencedAt = (minOfDay: number, triggerAtMs: number) => {
    if (isMutedByQuietModeAt(triggerAtMs)) return true;
    if (input.sanctuaryOverrideUntilMs > triggerAtMs) return false;
    if (sleepDurMin > 0 && sleepDurMin < 900) {
      const m = ((minOfDay % 1440) + 1440) % 1440;
      if ((m - input.dailyRhythmPlan.bedtimeMin + 1440) % 1440 < sleepDurMin) return true;
    }
    return false;
  };

  if (input.includePrayerAnchors) {
    for (const p of input.prayers) {
      if (!p.isObligatory) continue;
      const triggerAtMs = msForMinuteToday(p.alarmMinutes);
      if (triggerAtMs > nowMs + 1_000 && (!isMutedByQuietModeAt(triggerAtMs) || input.adhanOverrideSilent)) {
        alarms.push({
          id: `prayer_${input.todayCairoIso}_${p.id}`,
          kind: 'prayer',
          title: `${p.emojiPair} ${p.nameAr}`,
          body:
            input.lifeProfile.adhanLeadMinutes > 0
              ? `متبقي ${input.lifeProfile.adhanLeadMinutes} د على أذان ${p.nameAr} (${formatMinutes12h(p.adhanMinutes, 'ar')})`
              : `حان الآن موعد أذان ${p.nameAr} (${formatMinutes12h(p.adhanMinutes, 'ar')})`,
          triggerAtMs,
          snoozeMinutes,
        });
      }
      const hasActiveEveningSunlight =
        input.sunlightSettings.enabled && input.sunlightSessions.some((s) => s.id === 'evening' && s.enabled);
      if (p.id === 'maghrib' && !hasActiveEveningSunlight && !input.lowEnergyActive) {
        const redSunMin = (p as PrayerTimeEntry & { redSunMinutes?: number }).redSunMinutes;
        if (typeof redSunMin === 'number') {
          const rsTriggerAtMs = msForMinuteToday(redSunMin);
          if (rsTriggerAtMs > nowMs + 1_000 && !isMutedByQuietModeAt(rsTriggerAtMs)) {
            alarms.push({
              id: `solar_redsun_${input.todayCairoIso}`,
              kind: 'prayer',
              title: '🌇 ☀️ الشمس الحمراء',
              body: `الساعة الذهبية المسائية — الغروب بعد ~6 دقائق (${formatMinutes12h(redSunMin, 'ar')})`,
              triggerAtMs: rsTriggerAtMs,
              snoozeMinutes,
            });
          }
        }
        const magTrigger = msForMinuteToday(p.adhanMinutes);
        if (magTrigger > nowMs + 1_000 && !isMutedByQuietModeAt(magTrigger)) {
          alarms.push({
            id: `solar_maghrib_${input.todayCairoIso}`,
            kind: 'prayer',
            title: '🌆 غروب الشمس',
            body: `وقت الغروب والمغرب (${formatMinutes12h(p.adhanMinutes, 'ar')})`,
            triggerAtMs: magTrigger,
            snoozeMinutes,
          });
        }
      }
    }
  }

  const deferWaterAlarm = input.travelState.active && (input.travelState.deferredCategories?.includes('water') ?? false);
  if (input.waterRemindersEnabled && input.hydrationToday && !deferWaterAlarm) {
    const totalCups = input.dailyRhythmPlan.hydrationSlots.length || input.targetCups;
    input.dailyRhythmPlan.hydrationSlots.forEach((slot, idx) => {
      if (input.hydrationToday?.slots[idx]) return;
      if (input.lowEnergyActive && idx % 2 === 1) return;
      const triggerAtMs = msForMinuteToday(slot.timeMinutes);
      if (triggerAtMs > nowMs + 1_000 && !isSilencedAt(slot.timeMinutes, triggerAtMs)) {
        alarms.push({
          id: `water_${input.todayCairoIso}_${slot.cupIndex}`,
          kind: 'water',
          title: `💧 كوب ماء #${slot.cupIndex} من ${totalCups}`,
          body: `موعد شرب ${input.dailyRhythmPlan.cupSizeMl} مل (${formatMinutes12h(slot.timeMinutes, 'ar')})\nالهدف اليومي: ${input.hydrationToday?.cupsLogged ?? 0}/${totalCups} كوب منجز حتى الآن`,
          triggerAtMs,
          snoozeMinutes,
        });
      }
    });
  }

  const alarmFajrMin = input.prayers.find((p) => p.id === 'fajr')?.adhanMinutes ?? 4 * 60 + 45;
  const alarmMaghribMin = input.prayers.find((p) => p.id === 'maghrib')?.adhanMinutes ?? 17 * 60 + 30;
  alarms.push(
    ...buildMedicationAlarmEntries({
      medications: input.medications,
      todayIso: input.todayCairoIso,
      todayWeekday: todayW,
      isFastingToday: Boolean(input.dailyRhythmPlan.isFastingToday),
      fajrMin: alarmFajrMin,
      maghribMin: alarmMaghribMin,
      nowMs,
      snoozeMinutes,
      deferredMedIds: input.travelState.active ? input.travelState.deferredMedIds ?? [] : null,
      msForMinuteToday,
      isSilencedAt,
    })
  );

  const deferCalendarAlarm = input.travelState.active && (input.travelState.deferredCategories?.includes('calendar') ?? false);
  for (const block of input.liveBlocks) {
    if (
      block.deleted || block.completed || block.isAllDay || block.source === 'prayer' ||
      block.reflowStatus === 'postponed_travel' ||
      (deferCalendarAlarm && block.source === 'google_calendar') ||
      (input.lowEnergyActive && !block.isAnchor && block.source !== 'google_calendar')
    ) continue;
    const triggerAtMs = msForMinuteToday(block.startMin);
    if (triggerAtMs > nowMs + 1_000 && !isSilencedAt(block.startMin, triggerAtMs)) {
      const emoji = (block.emojiPair || '📅').trim();
      const titleText = cleanCalendarText(block.categoryAr) || 'موعد في التقويم';
      const desc = cleanCalendarText(block.description || '').slice(0, 220);
      const durMin = Math.max(5, block.durationMin || 30);
      alarms.push({
        id: `event_${input.todayCairoIso}_${block.id}_${block.startMin}`,
        kind: 'event',
        title: `${emoji} ${titleText}`,
        body: `${desc ? `${desc}\n` : ''}📅 تقويم Google · ${formatMinutes12h(block.startMin, 'ar')} (المدة ${durMin} د)`,
        triggerAtMs,
        snoozeMinutes,
      });
    }
  }

  const deferTasksAlarm = input.travelState.active && (input.travelState.deferredCategories?.includes('tasks') ?? false);
  if (!deferTasksAlarm && !input.lowEnergyActive) {
    for (const tk of input.googleTasks) {
      if (tk.status === 'completed') continue;
      const info = extractTaskTimeMinutesForToday(tk, input.todayCairoIso, input.activeTimeZone);
      if (!info || !info.hasExplicitTime) continue;
      const triggerAtMs = msForMinuteToday(info.startMin);
      if (triggerAtMs > nowMs + 1_000 && !isSilencedAt(info.startMin, triggerAtMs)) {
        const titleText = cleanCalendarText(tk.title) || 'مهمة مطلوبة الآن';
        const notes = cleanCalendarText(tk.notes || '').slice(0, 220);
        alarms.push({
          id: `task_${input.todayCairoIso}_${tk.id}_${info.startMin}`,
          kind: 'task',
          title: `☑️ ${titleText}`,
          body: `${notes ? `${notes}\n` : ''}مهام Google · ${formatMinutes12h(info.startMin, 'ar')}`,
          triggerAtMs,
          snoozeMinutes,
        });
      }
    }
  }

  const deferSunlightAlarm = input.travelState.active && (input.travelState.deferredCategories?.includes('sunlight') ?? false);
  if (input.sunlightSettings.enabled && !deferSunlightAlarm && !input.lowEnergyActive) {
    for (const session of input.sunlightSessions) {
      if (!session.enabled || session.isCloudBlocked) continue;
      const startTriggerAtMs = msForMinuteToday(session.alertMinutes);
      if (startTriggerAtMs > nowMs + 1_000 && !isSilencedAt(session.alertMinutes, startTriggerAtMs)) {
        alarms.push({
          id: `sunlight_start_${input.todayCairoIso}_${session.id}`,
          kind: 'event',
          title: session.leadMinutes > 0 ? `${session.emoji} ${session.labelAr} بعد ${session.leadMinutes} د` : `${session.emoji} ابدأ ${session.labelAr} الآن`,
          body: `${session.descAr} · ${formatMinutes12h(session.startMinutes, 'ar')} (${session.durationMinutes} د)`,
          triggerAtMs: startTriggerAtMs,
          snoozeMinutes,
        });
      }
      const endTriggerAtMs = msForMinuteToday(session.endMinutes);
      if (endTriggerAtMs > nowMs + 1_000 && !isSilencedAt(session.endMinutes, endTriggerAtMs)) {
        alarms.push({
          id: `sunlight_end_${input.todayCairoIso}_${session.id}`,
          kind: 'event',
          title: `${session.emoji} انتهت جلسة ${session.labelAr}`,
          body: `اكتملت مدة التعرّض للشمس (${formatMinutes12h(session.endMinutes, 'ar')})`,
          triggerAtMs: endTriggerAtMs,
          snoozeMinutes,
        });
      }
    }
  }

  alarms.sort((a, b) => a.triggerAtMs - b.triggerAtMs);
  return alarms.slice(0, 60).map((alarm) => ({
    ...alarm,
    title: sanitizeEmojis(alarm.title, 2),
    body: sanitizeEmojis(alarm.body, 2),
  }));
}
