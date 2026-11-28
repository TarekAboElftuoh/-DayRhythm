import type { GeminiStreamDonePayload } from './config';
import { apiStreamGeminiChatClient } from './chatStream';
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

import { getGeminiApiKey, resolveGeminiModelOrder, type ChatStreamHandlers } from './config';
import { getFromCache, setToCache } from './cacheAndTime';
import { formatFriendlyGeminiErrorAr } from './errorsAndStatus';
import {
  PLACES_RANK_PREFERENCE,
  PLACES_TRAVEL_MODE,
  rankPlacesByWalkingDistance,
  walkingSearchRadii,
} from '../../engines/places/walkingNearest';

export async function apiStreamGeminiMapsClient(
  payload: {
    query: string;
    lat?: number;
    lng?: number;
    memories?: Array<{ ruleText: string; category?: string }>;
    constitutionBrief?: string;
  },
  handlers: ChatStreamHandlers
): Promise<boolean> {
  const startedAt = Date.now();
  const apiKey = getGeminiApiKey();
  const query = (payload.query || '').trim();
  const lat = typeof payload.lat === 'number' ? payload.lat : 31.1953;
  const lng = typeof payload.lng === 'number' ? payload.lng : 31.5212;

  handlers.onStatus?.('جارٍ البحث الجغرافي المباشر حول موقعك...');

  let places: Array<GroundingPlace & { distanceMeters: number }> = [];
  const haversineMetersClient = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  };

  const formatMetersWalk = (distanceMeters: number, address?: string): string => {
    const walkMin = Math.max(1, Math.round(distanceMeters / 80));
    const walkLabel =
      walkMin === 1 ? 'دقيقة مشي' : walkMin <= 10 ? `${walkMin} دقائق مشي` : `${walkMin} دقيقة مشي`;
    return `${distanceMeters} متر · ${walkLabel}${address ? ` · ${address}` : ''}`;
  };

  const isMosqueQuery = /(مسجد|مساجد|جامع|جوامع|زاوية|صلاة|الجماعة|mosque)/i.test(query);

  const queryOverpassClient = async (): Promise<Array<GroundingPlace & { distanceMeters: number }>> => {
    if (!isMosqueQuery && !/(صيدلية|مستشفى|مطعم|كافيه|سوبر ماركت|بنزين|pharmacy|hospital|restaurant|cafe)/i.test(query)) {
      return [];
    }
    const tagFilter = isMosqueQuery
      ? '["amenity"="place_of_worship"]["religion"="muslim"]'
      : /(صيدلية|pharmacy)/i.test(query)
        ? '["amenity"="pharmacy"]'
        : /(مستشفى|hospital|clinic)/i.test(query)
          ? '["amenity"~"^(hospital|clinic)$"]'
          : /(مطعم|restaurant)/i.test(query)
            ? '["amenity"="restaurant"]'
            : /(كافيه|cafe|coffee)/i.test(query)
              ? '["amenity"="cafe"]'
              : /(سوبر ماركت|supermarket)/i.test(query)
                ? '["shop"="supermarket"]'
                : '["amenity"="fuel"]';

    // Walking-first: 300m then 500m (mosque) before widening, so a near small mosque wins.
    for (const radiusMeters of walkingSearchRadii(isMosqueQuery)) {
      const ql = `[out:json][timeout:4];(nwr${tagFilter}(around:${radiusMeters},${lat.toFixed(6)},${lng.toFixed(6)}););out center tags 15;`;
      try {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: `data=${encodeURIComponent(ql)}`,
          signal: handlers.signal,
        });
        if (!res.ok) continue;
        const data = (await res.json()) as {
          elements?: Array<{
            lat?: number;
            lon?: number;
            center?: { lat?: number; lon?: number };
            tags?: Record<string, string>;
          }>;
        };
        const elements = Array.isArray(data.elements) ? data.elements : [];
        if (elements.length === 0) continue;
        const dedup = new Map<string, GroundingPlace & { distanceMeters: number }>();
        for (const el of elements) {
          const pLat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
          const pLng = typeof el.lon === 'number' ? el.lon : el.center?.lon;
          if (typeof pLat !== 'number' || typeof pLng !== 'number') continue;
          const tags = el.tags ?? {};
          const title = (tags['name:ar'] || tags.name || tags['name:en'] || (isMosqueQuery ? 'مسجد قريب' : query)).trim();
          const distanceMeters = haversineMetersClient(lat, lng, pLat, pLng);
          const address = [tags['addr:street'], tags['addr:suburb'], tags['addr:city']].filter(Boolean).join('، ');
          const key = `${title.toLowerCase()}@${pLat.toFixed(4)},${pLng.toFixed(4)}`;
          const existing = dedup.get(key);
          if (existing && existing.distanceMeters <= distanceMeters) continue;
          dedup.set(key, {
            title,
            uri: `https://www.google.com/maps/search/?api=1&query=${pLat.toFixed(6)},${pLng.toFixed(6)}`,
            snippets: [formatMetersWalk(distanceMeters, address)],
            distanceMeters,
          });
        }
        const sorted = rankPlacesByWalkingDistance(Array.from(dedup.values()));
        if (sorted.length > 0) return sorted;
      } catch {
        // try next radius
      }
    }
    return [];
  };

  const queryNearbyBox = async (delta: number, maxDistMeters: number) => {
    const viewbox = `${(lng - delta).toFixed(4)},${(lat + delta).toFixed(4)},${(lng + delta).toFixed(4)},${(lat - delta).toFixed(4)}`;
    const [photonRes, nomRes] = await Promise.allSettled([
      fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${lat}&lon=${lng}&limit=10`, {
        signal: handlers.signal,
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10&viewbox=${viewbox}&bounded=1&accept-language=ar`,
        { signal: handlers.signal }
      ).then((r) => (r.ok ? r.json() : null)),
    ]);

    const raw: Array<{ title: string; lat: number; lng: number; address: string }> = [];
    if (photonRes.status === 'fulfilled' && Array.isArray(photonRes.value?.features)) {
      for (const f of photonRes.value.features as Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: { name?: string; street?: string; city?: string; state?: string };
      }>) {
        const name = (f.properties?.name || '').trim();
        const coords = f.geometry?.coordinates;
        if (!name || !coords) continue;
        const address = [f.properties?.street, f.properties?.city, f.properties?.state].filter(Boolean).join('، ');
        raw.push({ title: name, lat: coords[1], lng: coords[0], address });
      }
    }
    if (nomRes.status === 'fulfilled' && Array.isArray(nomRes.value)) {
      for (const item of nomRes.value as Array<{ name?: string; display_name?: string; lat?: string; lon?: string }>) {
        const pLat = Number(item.lat);
        const pLng = Number(item.lon);
        const title = (item.name || item.display_name?.split(',')[0] || '').trim();
        if (!title || Number.isNaN(pLat) || Number.isNaN(pLng)) continue;
        raw.push({ title, lat: pLat, lng: pLng, address: String(item.display_name ?? '').slice(0, 120) });
      }
    }

    const dedup = new Map<string, GroundingPlace & { distanceMeters: number }>();
    for (const p of raw) {
      const distanceMeters = haversineMetersClient(lat, lng, p.lat, p.lng);
      if (distanceMeters > maxDistMeters) continue;
      const key = p.title.toLowerCase().replace(/\s+/g, ' ');
      const existing = dedup.get(key);
      if (existing && existing.distanceMeters <= distanceMeters) continue;
      dedup.set(key, {
        title: p.title,
        uri: `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`,
        snippets: [formatMetersWalk(distanceMeters, p.address)],
        distanceMeters,
      });
    }
    return rankPlacesByWalkingDistance(Array.from(dedup.values()));
  };

  try {
    places = await queryOverpassClient();
    if (places.length === 0) {
      places = await queryNearbyBox(0.015, 1500);
    }
    if (places.length === 0) {
      places = await queryNearbyBox(0.05, 5000);
    }
  } catch {
    // ignore overpass/photon/nominatim failures and let Gemini synthesize
  }

  handlers.onStatus?.('جارٍ تلخيص الأماكن عبر Gemini...');

  const placesContext =
    places.length > 0
      ? places.map((p, i) => `${i + 1}. ${p.title} (${(p.snippets ?? []).join(' - ')}) - رابط خرائط: ${p.uri}`).join('\n')
      : 'لم تتوفر نتائج تلقائية مباشرة من الخريطة.';

  const prompt = `أنت دليل الأماكن والخرائط في تطبيق «إيقاع اليوم».
المستخدم يبحث عن: "${query}"
موقعه الحالي: خط عرض ${lat} وخط طول ${lng}.
النتائج الجغرافية المكتشفة:
${placesContext}

أجب باختصار مباشر وودود باللغة العربية، مع إعطاء الأولوية القصوى للأماكن ضمن نطاق المشي (أقل من 1–2 كم أولاً) مرتبةً من الأقرب فالأقرب مع تقدير مدة المشي بالدقائق والمسافة وأفضل نصيحة توقيت لزيارتها. Prioritize strictly the closest places within walking distance (under 1–2 km first), sorted nearest-first with walking time and distance.
إذا كان السؤال عن مسجد أو صلاة: اختر المسجد الأقرب الذي يمكن المشي إليه فعلاً من النتائج (${PLACES_TRAVEL_MODE} · rankPreference ${PLACES_RANK_PREFERENCE}، نطاق البحث يبدأ من 300–500 متر)، ولا تقترح أبداً مسجداً أكبر أو أشهر إن كان أبعد، واذكر مدة المشي للمسجد الأقرب فقط. Never recommend a larger or more prominent mosque that is farther away.`;

  return apiStreamGeminiChatClient(
    {
      message: prompt,
      contextSummary: payload.constitutionBrief,
      memories: payload.memories?.map((m, idx) => ({ id: `m-${idx}`, category: m.category || 'general', ruleText: m.ruleText })),
    },
    {
      signal: handlers.signal,
      onStatus: handlers.onStatus,
      onDelta: handlers.onDelta,
      onDone: (donePayload) => {
        handlers.onDone({
          ...donePayload,
          places: places.length > 0 ? places : donePayload.places,
          latencyMs: Math.max(1, Date.now() - startedAt),
        });
      },
    }
  );
}

/**
 * Client-Side Web Search Query: Synthesizes live search answers via Google Gemini client-side.
 */
