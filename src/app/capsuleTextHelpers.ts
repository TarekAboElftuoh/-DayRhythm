import { formatMinutes12h } from '../engines/prayerEngine';

export function sanitizeEmojis(text: string, maxCount: number): string {
  if (!text) return '';
  const emojiRe = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;
  const groupOf = (norm: string): string => {
    if (norm === '☀' || norm === '🌞') return 'sun';
    if (norm === '🌅' || norm === '🌄') return 'sunrise';
    if (norm === '🌇' || norm === '🌆') return 'sunset';
    if (norm === '🕌' || norm === '🕋' || norm === '📿') return 'prayer';
    if (norm === '💧' || norm === '💦' || norm === '🥤') return 'water';
    if (norm === '💊' || norm === '💉') return 'med';
    if (norm === '📅' || norm === '📆' || norm === '🗓') return 'cal';
    if (norm === '☑' || norm === '✅' || norm === '✔') return 'check';
    if (norm === '⚡' || norm === '🔋') return 'charge';
    return norm;
  };
  const seen = new Set<string>();
  let lastGroup = '';
  let kept = 0;
  const cleaned = text.replace(emojiRe, (match) => {
    if (maxCount <= 0 || kept >= maxCount) return '';
    const norm = match.replace(/\uFE0F/g, '');
    const grp = groupOf(norm);
    if (seen.has(norm) || (lastGroup !== '' && grp === lastGroup)) return '';
    seen.add(norm);
    lastGroup = grp;
    kept += 1;
    return match;
  });
  return cleaned
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .replace(/[^\S\r\n]*\n[^\S\r\n]*/g, '\n')
    .trim();
}

export function formatCompactTimeRange(startClock: string, durationSeconds?: number): string {
  const trimmed = startClock.trim();
  if (!trimmed || !durationSeconds || durationSeconds <= 0) return trimmed;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*([صم])$/);
  if (!match) return trimmed;
  const h12 = Number(match[1]);
  const mins = Number(match[2]);
  const startPeriod = match[3];
  const h24 = startPeriod === 'م' ? (h12 === 12 ? 12 : h12 + 12) : (h12 === 12 ? 0 : h12);
  const endClock = formatMinutes12h(h24 * 60 + mins + Math.round(durationSeconds / 60), 'ar');
  const endMatch = endClock.match(/^(\d{1,2}):(\d{2})\s*([صم])$/);
  if (endMatch && endMatch[3] === startPeriod) {
    return `${match[1]}:${match[2]} ← ${endMatch[1]}:${endMatch[2]} ${endMatch[3]}`;
  }
  return `${trimmed} ← ${endClock}`;
}

export function cleanCompactNote(rawDesc: string, eventTitle: string, clockText: string): string {
  let cleaned = rawDesc
    .replace(/متبقي\s+\d+\s*(?:دقيقة|دقائق|د)\b[^·\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (eventTitle) cleaned = cleaned.split(eventTitle).join('').trim();
  if (clockText) cleaned = cleaned.split(clockText).join('').trim();
  cleaned = cleaned.replace(/^[\s·\-:—–|]+|[\s·\-:—–|]+$/g, '').trim();
  if (!cleaned || cleaned === eventTitle) return '';
  return sanitizeEmojis(cleaned.slice(0, 100), 2);
}
