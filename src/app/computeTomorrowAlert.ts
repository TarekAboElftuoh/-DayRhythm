import type { GoogleCalendarEventItem, TomorrowAlertInfo } from '../types/dayrhythm';
import { analyzeTomorrowAlert } from '../engines/lifeRhythmEngine';
import { cleanCalendarText } from '../services/apiClient';

const ROUTINE_KEYWORDS =
  /(نوم|استيقاظ|الصلوات|صلاة|صلاه|الفجر|الظهر|العصر|المغرب|العشاء|الوتر|وتر|الضحى|قيام|تراويح|الجمعة|سنن|أذكار|اذكار|قرآن|قران|ورد|شرب|ماء|ماية|مياه|ترطيب|فطار|إفطار|افطار|غداء|عشاء|سحور|وجبة|تنظيف|ترتيب|الأوضة|الاوضة|اوضة|أوضة|الغرفة|الغرفه|غرفة|غرفه|مذاكرة|مراجعة|جيم|تمرين|رياضة|مشي|روتين|قيلولة|استحمام|دش|مكمل|فيتامين|بذور اليقطين|دواء|علاج|قهوة|شاي|شمس|sunlight)/i;

const EXTERNAL_SPECIAL_PATTERN =
  /(سفر|رحلة|طيران|مطار|قطار|دكتور|طبيب|عيادة|مستشفى|تحليل|مقابلة|إنترفيو|انترفيو|امتحان|اختبار|تسليم|اجتماع|لقاء|مكالمة|مؤتمر|موعد|زيارة|مناسبة|حجز|flight|airport|travel|trip|doctor|clinic|hospital|interview|exam|deadline|meeting|call|sync|appointment|visit|booking)/i;

const AR_WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function computeTomorrowAlert(
  calendarEvents: GoogleCalendarEventItem[],
  tomorrowIso: string,
  tomorrowW: number,
  specialFastTomorrow: { id: string; emoji: string; nameAr: string } | null
): TomorrowAlertInfo | null {
  const normalizeEvSig = (ev: GoogleCalendarEventItem): string => {
    const cleaned = cleanCalendarText(ev.summary || '').toLowerCase();
    return cleaned.replace(/\d{1,2}:\d{2}\s*(ص|م|am|pm)?/gi, '').replace(/\s+/g, ' ').trim();
  };

  const sigDays = new Map<string, Set<string>>();
  for (const ev of calendarEvents) {
    const dIso = String(ev.start ?? '').slice(0, 10);
    if (!dIso) continue;
    const sig = normalizeEvSig(ev);
    if (!sig) continue;
    if (!sigDays.has(sig)) sigDays.set(sig, new Set());
    sigDays.get(sig)!.add(dIso);
  }

  const nonRoutineTomorrowEvents = calendarEvents.filter((ev) => {
    const dIso = String(ev.start ?? '').slice(0, 10);
    if (dIso !== tomorrowIso) return false;
    if (ev.isRecurring || ev.recurringEventId) return false;
    const sig = normalizeEvSig(ev);
    const text = `${ev.summary ?? ''} ${ev.description ?? ''} ${ev.location ?? ''}`;
    if (EXTERNAL_SPECIAL_PATTERN.test(text)) return true;
    if (sig && (sigDays.get(sig)?.size ?? 1) >= 2) return false;
    if (ROUTINE_KEYWORDS.test(text)) return false;
    return true;
  });

  const base = analyzeTomorrowAlert(nonRoutineTomorrowEvents, tomorrowIso, tomorrowW);
  if (!specialFastTomorrow || specialFastTomorrow.id === 'ramadan') return base;
  const headline = `${specialFastTomorrow.emoji} بكرة ${specialFastTomorrow.nameAr} — صيام سُنّة`;
  const detail = 'السحور ومواعيد المية اتظبطوا تلقائياً على الصيام';
  if (base) return { ...base, headlineAr: headline, detailAr: `${detail} · ${base.detailAr}` };
  return {
    tomorrowIso,
    weekdayAr: AR_WEEKDAYS[tomorrowW] ?? '',
    isBusy: false,
    hasSpecialEvent: true,
    eventCount: 0,
    totalHours: 0,
    specialEvents: [],
    headlineAr: headline,
    detailAr: detail,
  };
}
