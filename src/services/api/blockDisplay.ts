import { ScheduleBlock } from '../../types/dayrhythm';

export function cleanCalendarText(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function stripEmojisOnly(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0F\u200D\u20E3]/g, '')
    .replace(/[·\-–—|•]+/g, ' ')
    .trim();
}

const EMOJI_CLUSTER = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*️?/gu;

function normalizeEmoji(e: string): string {
  return e.replace(/️/g, '');
}

/**
 * The row already shows the event's emoji pair as icons; titles taken from the description often
 * start (or end) with the same emoji, which showed it twice (e.g. "🕌 🌤️  🕌 العصر"). Strip those.
 */
function stripPairEmojisFromTitle(title: string, emojiOnly: string): string {
  const pair = new Set((emojiOnly.match(EMOJI_CLUSTER) ?? []).map(normalizeEmoji));
  if (pair.size === 0) return title;
  const original = title.trim();
  // Split into tokens; within the run of emojis at the start and at the end of the title,
  // drop the ones already shown as icons and keep any other emoji.
  const tokens = original.split(/\s+/).filter(Boolean);
  const isEmojiOnlyToken = (tok: string) =>
    tok.replace(EMOJI_CLUSTER, '').replace(/[️‍·\-–—|]/g, '').length === 0;
  const keepToken = (tok: string) => {
    const clusters = tok.match(EMOJI_CLUSTER) ?? [];
    const kept = clusters.filter((c) => !pair.has(normalizeEmoji(c)));
    return kept.join('');
  };
  let i = 0;
  const lead: string[] = [];
  while (i < tokens.length && isEmojiOnlyToken(tokens[i])) {
    const k = keepToken(tokens[i]);
    if (k) lead.push(k);
    i += 1;
  }
  let j = tokens.length - 1;
  const trail: string[] = [];
  while (j >= i && isEmojiOnlyToken(tokens[j])) {
    const k = keepToken(tokens[j]);
    if (k) trail.unshift(k);
    j -= 1;
  }
  const middle = tokens.slice(i, j + 1);
  const result = [...lead, ...middle, ...trail].join(' ').trim();
  // Never strip a title down to nothing readable.
  return stripEmojisOnly(result).length > 0 ? result : original;
}

export interface BlockDisplayInfo {
  title: string;
  detail: string;
  emojiOnly: string;
}

export function resolveBlockDisplayInfo(block: ScheduleBlock | null | undefined): BlockDisplayInfo {
  const info = resolveBlockDisplayInfoRaw(block);
  return { ...info, title: stripPairEmojisFromTitle(info.title, info.emojiOnly) };
}

function resolveBlockDisplayInfoRaw(block: ScheduleBlock | null | undefined): BlockDisplayInfo {
  if (!block) {
    return { title: '', detail: '', emojiOnly: '📅' };
  }

  const emojiOnly = (block.emojiPair || '📅').trim();
  const rawSummary = (block.categoryAr || '').trim();
  const summaryWithoutPrefix = rawSummary.startsWith(emojiOnly)
    ? rawSummary.slice(emojiOnly.length).trim()
    : rawSummary;

  const summaryHasReadableText = stripEmojisOnly(summaryWithoutPrefix).length > 0;
  const cleanedDesc = cleanCalendarText(block.description);
  const descLines = cleanedDesc
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (summaryHasReadableText) {
    const detailText =
      descLines.length > 0 && descLines[0] !== summaryWithoutPrefix
        ? descLines.join(' · ')
        : '';
    return {
      title: summaryWithoutPrefix,
      detail: detailText,
      emojiOnly,
    };
  }

  if (descLines.length > 0) {
    return {
      title: descLines[0],
      detail: descLines.slice(1).join(' · '),
      emojiOnly,
    };
  }

  if (block.calendarTitle && !block.calendarTitle.includes('@')) {
    return {
      title: block.calendarTitle,
      detail: '',
      emojiOnly,
    };
  }

  return {
    title: block.isAnchor ? 'موعد صلاة' : emojiOnly,
    detail: '',
    emojiOnly,
  };
}

