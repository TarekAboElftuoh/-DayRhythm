import type { GmailDigestItem } from '../types/dayrhythm';
import { getDateIsoInTimeZone } from '../engines/prayerEngine';

export interface GmailDirectResult {
  ok: boolean;
  status: number;
  needsReauth?: boolean;
  error?: string;
  scannedCount: number;
  digestItems: GmailDigestItem[];
}

const NOISE_PATTERN =
  /verification code|otp|security alert|password reset|unsubscribe|newsletter|promo|receipt|invoice paid|كود التحقق|رمز التحقق|نشرة|إعلان|عروض/i;

const CATEGORY_RULES: Array<{
  category: GmailDigestItem['category'];
  pattern: RegExp;
  duration: number;
  emoji: string;
}> = [
  {
    category: 'meeting',
    pattern: /meeting|zoom|teams|google meet|interview|call|invite|اجتماع|مقابلة|دعوة/i,
    duration: 45,
    emoji: '📅',
  },
  {
    category: 'travel',
    pattern: /flight|boarding|ticket|hotel|booking|check-in|رحلة|طيران|حجز|فندق/i,
    duration: 90,
    emoji: '✈️',
  },
  {
    category: 'medical',
    pattern: /doctor|clinic|hospital|lab|medical|appointment|دكتور|عيادة|مستشفى|تحاليل|كشف/i,
    duration: 60,
    emoji: '🏥',
  },
  {
    category: 'deadline',
    pattern: /deadline|due|submit|renewal|expire|exam|bill due|موعد نهائي|تسليم|تجديد|استحقاق|فاتورة/i,
    duration: 30,
    emoji: '⏳',
  },
  {
    category: 'delivery',
    pattern: /delivery|shipment|courier|order arriving|out for delivery|شحنة|توصيل|مندوب|طلبك/i,
    duration: 20,
    emoji: '📦',
  },
];

export async function fetchGmailDigestDirectClient(
  token: string,
  signal: AbortSignal,
  activeTimeZone: string
): Promise<GmailDirectResult> {
  const listUrl =
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=12&q=' +
    encodeURIComponent('in:inbox newer_than:7d -category:promotions -category:social');
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (listRes.status === 401 || listRes.status === 403) {
    return {
      ok: false,
      status: listRes.status,
      needsReauth: true,
      error: 'انتهت جلسة صلاحية Gmail — اضغط «تجديد ربط Google الآن» في الأعلى.',
      scannedCount: 0,
      digestItems: [],
    };
  }
  if (!listRes.ok) {
    return {
      ok: false,
      status: listRes.status,
      error: 'تعذر الوصول إلى صندوق Gmail حالياً.',
      scannedCount: 0,
      digestItems: [],
    };
  }
  const listJson = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const msgRefs = Array.isArray(listJson.messages) ? listJson.messages.slice(0, 10) : [];
  if (msgRefs.length === 0) {
    return { ok: true, status: 200, scannedCount: 0, digestItems: [] };
  }

  const detailResults = await Promise.all(
    msgRefs.map(async (ref) => {
      try {
        const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          ref.id
        )}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;
        const res = await fetch(detailUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
        if (!res.ok) return null;
        return (await res.json()) as {
          id: string;
          snippet?: string;
          payload?: { headers?: Array<{ name?: string; value?: string }> };
        };
      } catch {
        return null;
      }
    })
  );

  const fallbackDateIso = getDateIsoInTimeZone(activeTimeZone);
  const digestItems: GmailDigestItem[] = [];

  for (const msg of detailResults) {
    if (!msg) continue;
    const headers = msg.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value?.trim() || '';
    const subject = getHeader('Subject') || 'رسالة بريد مهمة';
    const fromRaw = getHeader('From');
    const sender = fromRaw.replace(/<[^>]+>/g, '').replace(/"/g, '').trim() || 'Gmail';
    const snippet = (msg.snippet || '').replace(/\s+/g, ' ').trim();
    const combined = `${subject} ${snippet}`;

    if (NOISE_PATTERN.test(combined)) continue;

    const matchedRule = CATEGORY_RULES.find((r) => r.pattern.test(combined));
    if (!matchedRule) continue;

    const isoMatch = combined.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    const timeMatch = combined.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    const dateIso = isoMatch ? isoMatch[1] : fallbackDateIso;
    const startTime24 = timeMatch
      ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
      : '10:00';

    digestItems.push({
      id: `gm_${msg.id}`,
      messageId: msg.id,
      category: matchedRule.category,
      titleAr: subject.slice(0, 90),
      sender: sender.slice(0, 50),
      summaryAr: (snippet || subject).slice(0, 140),
      dateIso,
      startTime24,
      durationMinutes: matchedRule.duration,
      suggestedAction: {
        operation: 'create',
        title: `${matchedRule.emoji} ${subject.slice(0, 70)}`,
        dateIso,
        startTime24,
        durationMinutes: matchedRule.duration,
        description: `من: ${sender}\n${snippet.slice(0, 200)}`,
      },
    });
  }

  return {
    ok: true,
    status: 200,
    scannedCount: msgRefs.length,
    digestItems: digestItems.slice(0, 6),
  };
}
