import { ScheduleBlock } from '../types/dayrhythm';

export interface ParsedIcsEvent {
  uid: string;
  summary: string;
  startMin: number;
  durationMin: number;
  rrule?: string;
  appliesToday: boolean;
}

export const SAMPLE_ICS_FEED = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//DayRhythm//Personal Feed//EN
BEGIN:VEVENT
UID:ics-weekly-friday-room@dayrhythm
DTSTART;TZID=Africa/Cairo:20261113T153000
DTEND;TZID=Africa/Cairo:20261113T161000
RRULE:FREQ=WEEKLY;BYDAY=FR
SUMMARY:🧹 🛏️ تنظيف الأوضة الأسبوعي (ICS RRULE)
END:VEVENT
BEGIN:VEVENT
UID:ics-biweekly-pc@dayrhythm
DTSTART;TZID=Africa/Cairo:20261106T161500
DTEND;TZID=Africa/Cairo:20261106T165000
RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR
SUMMARY:💻 🧼 تنظيف الكمبيوتر كل جمعتين (ICS)
END:VEVENT
BEGIN:VEVENT
UID:ics-daily-review@dayrhythm
DTSTART;TZID=Africa/Cairo:20261118T183000
DTEND;TZID=Africa/Cairo:20261118T190000
RRULE:FREQ=DAILY;COUNT=30
SUMMARY:📘 ✨ مراجعة تقنية سريعة (خلاصة .ics)
END:VEVENT
END:VCALENDAR`;

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

function parseIcsTimeToMin(raw: string): number {
  const m = raw.match(/T(\d{2})(\d{2})/);
  if (!m) return 9 * 60;
  return Number(m[1]) * 60 + Number(m[2]);
}

function rruleAppliesToDate(rrule: string | undefined, targetDate: Date): boolean {
  if (!rrule) return true;
  const parts = Object.fromEntries(
    rrule
      .toUpperCase()
      .split(';')
      .map((kv) => kv.split('='))
      .filter((kv) => kv.length === 2)
  );
  const freq = parts.FREQ;
  if (freq === 'DAILY') return true;
  if (freq === 'WEEKLY') {
    if (!parts.BYDAY) return true;
    const todayCode = DAY_CODES[targetDate.getDay()];
    return parts.BYDAY.split(',').includes(todayCode);
  }
  return true;
}

export function parseIcsFeedWithRrule(
  icsText: string,
  targetDate: Date = new Date()
): ParsedIcsEvent[] {
  const blocks = icsText.split('BEGIN:VEVENT').slice(1);
  const results: ParsedIcsEvent[] = [];

  for (const rawBlock of blocks) {
    const body = rawBlock.split('END:VEVENT')[0] ?? '';
    const lines = body
      .replace(/\r\n /g, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    let uid = `ics-${Math.random().toString(36).slice(2, 8)}`;
    let summary = '📅 ✨ حدث مستورد (.ics)';
    let startMin = 9 * 60;
    let endMin = 9 * 60 + 30;
    let rrule: string | undefined;

    for (const line of lines) {
      if (line.startsWith('UID:')) uid = line.slice(4).trim();
      else if (line.startsWith('SUMMARY:')) summary = line.slice(8).trim();
      else if (line.startsWith('DTSTART')) {
        const val = line.split(':').slice(1).join(':');
        startMin = parseIcsTimeToMin(val);
      } else if (line.startsWith('DTEND')) {
        const val = line.split(':').slice(1).join(':');
        endMin = parseIcsTimeToMin(val);
      } else if (line.startsWith('RRULE:')) {
        rrule = line.slice(6).trim();
      }
    }

    const durationMin = Math.max(15, endMin > startMin ? endMin - startMin : 30);
    results.push({
      uid,
      summary,
      startMin,
      durationMin,
      rrule,
      appliesToday: rruleAppliesToDate(rrule, targetDate),
    });
  }

  return results;
}

export function icsEventsToScheduleBlocks(events: ParsedIcsEvent[]): ScheduleBlock[] {
  return events
    .filter((e) => e.appliesToday)
    .map((e) => {
      const tokens = e.summary.trim().split(' ');
      const emojiPair =
        tokens.length >= 2 && /[\u{1F300}-\u{1FAFF}]/u.test(tokens[0])
          ? `${tokens[0]} ${tokens[1]}`
          : '📅 📥';
      return {
        id: `ics-${e.uid}`,
        emojiPair,
        categoryAr: e.summary,
        startMin: e.startMin,
        durationMin: e.durationMin,
        minDurationMin: 15,
        isAnchor: false,
        travelGroup: 'C_PORTABLE',
        canShiftEvening: true,
        completed: false,
        deleted: false,
      };
    });
}
