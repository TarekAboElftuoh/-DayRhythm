import type { PersistedChatMessage } from '../../types/dayrhythm';
import { sortChatMessagesChronologically } from '../../services/apiClient';
import type { QueuedChatMessage } from './types';

const CHAT_OFFLINE_QUEUE_KEY = 'dayrhythm_chat_offline_queue_v1';

export function readChatOfflineQueue(): QueuedChatMessage[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_OFFLINE_QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? (parsed as QueuedChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function writeChatOfflineQueue(queue: QueuedChatMessage[]): void {
  try {
    if (queue.length === 0) localStorage.removeItem(CHAT_OFFLINE_QUEUE_KEY);
    else localStorage.setItem(CHAT_OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore storage errors
  }
}

function normalizeArabicSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ARCHIVE_STOPWORDS = new Set([
  'في', 'من', 'علي', 'الي', 'عن', 'مع', 'هل', 'ما', 'هذا', 'هذه', 'انا', 'انت', 'هو', 'هي',
  'كان', 'يكون', 'تم', 'اللي', 'الذي', 'التي', 'عشان', 'علشان', 'عاوز', 'عايز', 'ممكن', 'لو',
  'بس', 'مش', 'لا', 'نعم', 'كل', 'اي', 'ايه', 'ازاي', 'فين', 'امتي', 'ليه', 'كمان', 'جدا',
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'what', 'when', 'how',
]);

export function buildLongTermChatContext(
  allMessages: PersistedChatMessage[],
  currentQuery: string
): string {
  const cleanChat = allMessages.filter(
    (m) => m.mode === 'chat' && !m.error && m.id !== 'welcome-1' && (m.text || '').trim().length > 0
  );
  if (cleanChat.length <= 14) return '';
  const older = cleanChat.slice(0, -14);

  const queryTokens = normalizeArabicSearchText(currentQuery)
    .split(' ')
    .filter((tok) => tok.length >= 3 && !ARCHIVE_STOPWORDS.has(tok));

  const scored = older.map((msg, idx) => {
    const norm = normalizeArabicSearchText(msg.text);
    let score = 0;
    for (const tok of queryTokens) {
      if (norm.includes(tok)) {
        score += tok.length >= 5 ? 3 : 2;
      }
    }
    return { idx, msg, score };
  });

  const matched = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.idx - a.idx)
    .slice(0, 6);

  const selectedIndices = new Set<number>();
  if (matched.length > 0) {
    for (const m of matched) {
      selectedIndices.add(m.idx);
      if (m.msg.role === 'user' && m.idx + 1 < older.length && older[m.idx + 1].role === 'model') {
        selectedIndices.add(m.idx + 1);
      } else if (m.msg.role === 'model' && m.idx - 1 >= 0 && older[m.idx - 1].role === 'user') {
        selectedIndices.add(m.idx - 1);
      }
    }
  } else {
    const startIdx = Math.max(0, older.length - 4);
    for (let i = startIdx; i < older.length; i += 1) {
      selectedIndices.add(i);
    }
  }

  const ordered = Array.from(selectedIndices)
    .sort((a, b) => a - b)
    .slice(0, 10)
    .map((idx) => {
      const m = older[idx];
      const dateTag = m.createdAtIso ? m.createdAtIso.slice(0, 10) : 'سابقاً';
      const speaker = m.role === 'user' ? 'المستخدم' : 'Gemini';
      return `[${dateTag} · ${speaker}]: ${m.text.replace(/\s+/g, ' ').trim().slice(0, 280)}`;
    });

  return ordered.join('\n').slice(0, 3000);
}

export function buildNormalizedHistory(
  msgs: PersistedChatMessage[]
): Array<{ role: 'user' | 'model'; text: string }> {
  const sorted = sortChatMessagesChronologically(msgs);
  const merged: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (const m of sorted) {
    if (m.mode !== 'chat' || m.error || m.id === 'welcome-1') continue;
    const text = (m.text || '').trim();
    if (!text) continue;
    if (merged.length === 0 && m.role !== 'user') continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role) {
      prev.text = `${prev.text}\n\n${text}`.slice(0, 1200);
    } else {
      merged.push({ role: m.role, text: text.slice(0, 1200) });
    }
  }
  const recent = merged.slice(-10);
  while (recent.length > 0 && recent[0].role !== 'user') recent.shift();
  while (recent.length > 0 && recent[recent.length - 1].role === 'user') recent.pop();
  return recent;
}
