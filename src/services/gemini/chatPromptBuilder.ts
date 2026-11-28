import { DAYRHYTHM_SYSTEM_INSTRUCTION } from './systemInstruction';
import { formatServerIsoTo12h, getCairoNowTime12, getCairoTodayIso } from './cacheAndTime';
import {
  AppSettingsPatch,
  CalendarActionProposal,
  CreativeActivityActionProposal,
  DynamicHabitAnchor,
  DynamicHabitStatus,
  FreeWindow,
  GroundingPlace,
  MedicationActionProposal,
  MemoryActionProposal,
  PersistedChatMessage,
  SeasonalSleepMode,
  SettingsSnapshotContext,
  TaskActionProposal,
} from '../../types/dayrhythm';
import { formatMinutes12h, calculateEgyptianPrayerTimes } from '../../engines/prayerEngine';
import {
  DYNAMIC_HABIT_ANCHOR_LABELS,
  computeDailyRhythmPlan,
  formatDurationAr,
} from '../../engines/lifeRhythmEngine';
import { formatSettingsSchemaForGemini } from '../../utils/settingsPatchValidator';
import {
  type GeminiFunctionCall,
  type GeminiScheduleGuardContext,
  type GeminiScheduleGuardResult,
  type GeminiScheduleGuardViolation,
  extractPendingProposalFromFunctionCalls,
  validateGeminiScheduleProposal,
  sanitizeGeminiOutputText,
  cleanDisplayMessageText,
} from '../geminiSanitizer';

import type { ChatRequestPayload } from './config';

import { buildProtectedAndFreeWindowsBlock } from './chatPromptWindows';

const ACTION_INTENT_PATTERN =
  /(أضف|اضف|ضيف|ضيّف|أنشئ|انشئ|اعمل|أنشأ|جدول|جدوللي|عدّل|عدل|غيّر|غير|خلّي|خلي|اجعل|اضبط|ضبط|فعّل|فعل|شغّل|شغل|اقفل|أوقف|وقف|عطّل|عطل|احذف|امسح|ألغ|الغ|ذكرني|فكّرني|فكرني|مهمة|مهمه|مهام|تاسك|موعد|حدث|أحداث|دواء|علاج|جرعة|مكمل|فيتامين|نشاط|عادة|هدف|ذاكرة|قاعدة|احفظ|سجل|سجّل|أجل|انقل|رحّل|رتب|نظم|فاضي|فراغ|متاح|مؤجل|مؤجلة|إعداد|اعداد|صيام|صوم|سحور|إفطار|افطار|شحن|بطارية|نوم|استيقاظ|ماء|مية|مياه|كوب|وزن|طول|صمت|كتم|هدوء|اجتماع|سفر|حرم|أذان|لغة|كبسولة|ثيم|مظهر|نهاري|ليلي|plan|schedule|remind|create|add|edit|update|set|change|enable|disable|turn|mute|quiet|meeting|travel|fasting|sleep|bedtime|wake|suhoor|water|hydration|charge|battery|sanctuary|silence|language|theme|delete|cancel|task|event|memory|setting|reorganize|free)/i;

export function shouldAttachChatTools(message?: string): boolean {
  return ACTION_INTENT_PATTERN.test(message ?? '');
}

export function buildChatSystemInstruction(
  payload: ChatRequestPayload,
  options?: { lean?: boolean }
): {
  systemInstruction: string;
  memoriesAppliedCount: number;
} {
  // Plain chat does not need the calendar/tasks/meds dumps: they only add prefill latency.
  const lean = Boolean(options?.lean);
  const todayCairo = getCairoTodayIso();
  const nowCairo12 = getCairoNowTime12();
  const dayNamesAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  const memoriesArr = Array.isArray(payload.memories)
    ? payload.memories.filter((m) => m && typeof m.ruleText === 'string' && m.ruleText.trim().length > 0)
    : [];

  const memoriesBlock =
    memoriesArr.length > 0
      ? `\n\n=== ذاكرة المستخدم الدائمة ===\n${memoriesArr
          .slice(0, 20)
          .map((m, idx) => `${idx + 1}. [id=${m.id}|${m.category}] ${m.ruleText.trim().slice(0, 180)}`)
          .join('\n')}`
      : '';

  // The fetched window starts YESTERDAY, and a full routine is ~20 events/day, so the old
  // `.slice(0, 18)` only ever showed Gemini yesterday's events. Send what is still ahead, with dates.
  // Events the user names in the message are always included, so Gemini never has to guess an id.
  const nowMs = Date.now();
  const userText = payload.message || '';
  const allUpcoming = (Array.isArray(payload.calendarEvents) ? payload.calendarEvents : [])
    .filter((e) => {
      const endMs = new Date(e.end || e.start).getTime();
      return Number.isNaN(endMs) || endMs >= nowMs;
    })
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const mentioned = allUpcoming.filter((e) => {
    const s = (e.summary || '').trim();
    return s.length >= 2 && userText.includes(s);
  });
  const upcomingEvents = [...mentioned, ...allUpcoming.filter((e) => !mentioned.includes(e))]
    .slice(0, 45)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const eventsListText =
    !lean && upcomingEvents.length > 0
      ? `\n\nأحداث Google Calendar القادمة (من الآن):\n${upcomingEvents
          .map(
            (e) =>
              `- [id=${e.id}${e.calendarId ? `|cal=${e.calendarId}` : ''}] ${e.summary} | ${String(e.start).slice(0, 10)} ${formatServerIsoTo12h(e.start)}${e.end ? `–${formatServerIsoTo12h(e.end)}` : ''}`
          )
          .join('\n')}`
      : '';

  const tasksListText =
    !lean && Array.isArray(payload.tasks) && payload.tasks.length > 0
      ? `\n\nمهام Google Tasks:\n${[...payload.tasks]
          // open tasks first; completed ones only fill the remaining slots
          .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'))
          .slice(0, 15)
          .map(
            (t) =>
              `- [taskId=${t.id}|list=${t.taskListId}] ${t.title} | ${t.status === 'completed' ? 'مكتملة' : 'قيد التنفيذ'}${t.due ? ` | ${t.due.slice(0, 10)}` : ''}`
          )
          .join('\n')}`
      : '';

  const medsListText =
    !lean && Array.isArray(payload.medications) && payload.medications.length > 0
      ? `\n\nقائمة العلاجات والمكملات الحالية:\n${payload.medications
          .map((m) => {
            const doses =
              Array.isArray(m.times24) && m.times24.length > 0
                ? m.times24.join(', ')
                : m.time24 || 'بدون ميعاد محدد بعد';
            const daysStr =
              Array.isArray(m.daysOfWeek) && m.daysOfWeek.length > 0
                ? `أيام: ${m.daysOfWeek.map((d) => dayNamesAr[d] ?? d).join('، ')}`
                : 'يومياً';
            const courseStr = m.courseEndDate ? ` | ينتهي الكورس: ${m.courseEndDate}` : '';
            const refillStr =
              typeof m.remainingDoses === 'number' && m.remainingDoses >= 0
                ? ` | المتبقي: ${m.remainingDoses}${typeof m.totalDoses === 'number' && m.totalDoses > 0 ? `/${m.totalDoses}` : ''} جرعة (تنبيه قبل ${m.refillAlertDays ?? 3} أيام)`
                : '';
            return `- [medicationId=${m.id}] ${m.name} | المواعيد: ${doses} | التكرار: ${daysStr} | سياسة الصيام: ${m.fastingPolicy ?? 'auto-nearest'}${courseStr}${refillStr}${m.doseNote ? ` | ${m.doseNote}` : ''} | حالة اليوم: ${m.takenToday ? 'تم التناول ✓' : m.takenDosesToday && m.takenDosesToday.length > 0 ? `أُخذ (${m.takenDosesToday.join(', ')})` : 'لم يُؤخذ بعد'}`;
          })
          .join('\n')}`
      : '';

  const creativeListText =
    !lean && Array.isArray(payload.creativeActivities) && payload.creativeActivities.length > 0
      ? `\n\nالأنشطة الإبداعية والهوايات المسجلة:\n${payload.creativeActivities
          .map((a) => {
            const cadAr = a.cadence === 'daily' ? 'يومي' : a.cadence === 'monthly' ? 'شهري' : 'أسبوعي';
            return `- [activityId=${a.id}] ${a.emoji ?? '🎨'} ${a.name} | (${cadAr}: ${a.sessionsInPeriod ?? a.sessionsThisWeek}/${a.goalCount ?? a.weeklyGoalSessions}) | المدة: ${a.sessionMinutes} د${a.expiresOnDate ? ` | حتى ${a.expiresOnDate}` : ''}${a.scheduledTime24 ? ` | موعد مجدول: ${a.scheduledTime24}` : ''} | اليوم: ${a.completedToday ? 'أُنجز ✓' : 'لم يُنجز بعد'}`;
          })
          .join('\n')}`
      : '';

  const habitsList = Array.isArray(payload.habits) ? payload.habits : [];
  const activeHabits = habitsList.filter((h) => h.status === 'active');
  const plannedHabits = habitsList.filter((h) => h.status === 'planned');
  const habitsBlockText =
    habitsList.length > 0
      ? `\n\n=== العادات الديناميكية (حالية ومستقبلية) ===${
          activeHabits.length > 0
            ? `\nالعادات الحالية اليوم (active):\n${activeHabits
                .map((h) => {
                  const anchorLabel = DYNAMIC_HABIT_ANCHOR_LABELS[h.anchor]?.labelAr ?? h.anchor;
                  const slotInfo = h.skippedReasonAr
                    ? `الحالة اليوم: ${h.skippedReasonAr}`
                    : h.resolvedTimeLabel
                      ? `الموعد اليوم: ${h.resolvedTimeLabel}${h.isFallbackSlot ? ' (بديل متاح)' : ''}`
                      : h.isFlexibleUnplaced
                        ? 'الموعد اليوم: مرن حسب التفرغ'
                        : 'الموعد اليوم: غير محدد';
                  return `- [habitId=${h.id}] ${h.title} | المرتكز: ${anchorLabel} | المدة: ${h.durationMin} د | ${slotInfo} | الإنجاز اليوم: ${h.completedToday ? 'تم ✓' : 'لم يُنجز بعد'}`;
                })
                .join('\n')}`
            : ''
        }${
          plannedHabits.length > 0
            ? `\nالعادات المستقبلية المؤجلة (planned — غير مفعّلة في جدول اليوم):\n${plannedHabits
                .map((h) => {
                  const anchorLabel = DYNAMIC_HABIT_ANCHOR_LABELS[h.anchor]?.labelAr ?? h.anchor;
                  return `- [habitId=${h.id}] ${h.title} | المرتكز المقترح: ${anchorLabel} | المدة: ${h.durationMin} د | الحالة: مستقبلية (planned)`;
                })
                .join('\n')}`
            : ''
        }`
      : '';

  const longTermArchiveBlock =
    !lean &&
    typeof payload.longTermChatContext === 'string' &&
    payload.longTermChatContext.trim().length > 0
      ? `\n\n=== مقتطفات مرجعية سابقة ===\n${payload.longTermChatContext.trim().slice(0, 1400)}`
      : '';

  const settingsSchemaBlock =
    !lean && payload.settingsSnapshot?.lifeProfile
      ? `\n\n${formatSettingsSchemaForGemini(
          payload.settingsSnapshot.lifeProfile,
          payload.settingsSnapshot
        )}`
      : '';

  const seasonalAndFreeWindowsBlock = buildProtectedAndFreeWindowsBlock(payload, todayCairo);

  const contextText = (payload.contextSummary ?? '').slice(0, lean ? 600 : 1800);
  const systemInstruction = `${DAYRHYTHM_SYSTEM_INSTRUCTION}\n\nالتاريخ: ${todayCairo} | الوقت الآن: ${nowCairo12} | التزم حرفياً بالدستور والذاكرة أدناه وأجب باختصار مباشر وسريع.${memoriesBlock}${longTermArchiveBlock}\n\n=== الدستور والسياق ===\n${contextText}${seasonalAndFreeWindowsBlock}${habitsBlockText}${settingsSchemaBlock}${eventsListText}${tasksListText}${medsListText}${creativeListText}`;

  return { systemInstruction, memoriesAppliedCount: memoriesArr.length };
}

export function normalizeGeminiHistory(
  rawHistory?: Array<{ role: 'user' | 'model'; text: string }>
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) return [];
  const merged: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (const item of rawHistory) {
    if (!item || (item.role !== 'user' && item.role !== 'model')) continue;
    const text = typeof item.text === 'string' ? cleanDisplayMessageText(item.text).trim() : '';
    if (!text) continue;
    if (merged.length === 0 && item.role !== 'user') {
      continue;
    }
    const prev = merged[merged.length - 1];
    if (prev && prev.role === item.role) {
      prev.text = `${prev.text}\n\n${text}`.slice(0, 1200);
    } else {
      merged.push({ role: item.role, text: text.slice(0, 1200) });
    }
  }
  const recent = merged.slice(-10);
  while (recent.length > 0 && recent[0].role !== 'user') {
    recent.shift();
  }
  while (recent.length > 0 && recent[recent.length - 1].role === 'user') {
    recent.pop();
  }
  return recent.map((h) => ({
    role: h.role,
    parts: [{ text: h.text }],
  }));
}

