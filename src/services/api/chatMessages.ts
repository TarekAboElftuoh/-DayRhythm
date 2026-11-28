import { PersistedChatMessage } from '../../types/dayrhythm';

export function sanitizePersistedChats(
  raw: unknown,
  welcomeMessage: PersistedChatMessage
): PersistedChatMessage[] {
  if (!Array.isArray(raw)) return [welcomeMessage];
  const seenIds = new Set<string>();
  const validModes = new Set(['chat', 'maps', 'search']);
  const cleaned: PersistedChatMessage[] = [];

  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const obj = item as Partial<PersistedChatMessage>;
    const role = obj.role === 'user' || obj.role === 'model' ? obj.role : null;
    const text = typeof obj.text === 'string' ? obj.text.trim() : '';
    if (!role || !text) continue;

    let id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `msg-${i}-${Date.now()}`;
    if (seenIds.has(id)) {
      id = `${id}-${i}`;
    }
    seenIds.add(id);

    const mode =
      typeof obj.mode === 'string' && validModes.has(obj.mode)
        ? (obj.mode as PersistedChatMessage['mode'])
        : 'chat';

    const pendingProposal =
      obj.pendingProposal && typeof obj.pendingProposal === 'object'
        ? {
            summaryAr:
              typeof obj.pendingProposal.summaryAr === 'string'
                ? obj.pendingProposal.summaryAr
                : 'تعديل مقترح',
            actions: Array.isArray(obj.pendingProposal.actions) ? obj.pendingProposal.actions : [],
            taskActions: Array.isArray(obj.pendingProposal.taskActions)
              ? obj.pendingProposal.taskActions
              : undefined,
            medicationActions: Array.isArray(obj.pendingProposal.medicationActions)
              ? obj.pendingProposal.medicationActions
              : undefined,
            creativeActions: Array.isArray(obj.pendingProposal.creativeActions)
              ? obj.pendingProposal.creativeActions
              : undefined,
            profileUpdates:
              obj.pendingProposal.profileUpdates &&
              typeof obj.pendingProposal.profileUpdates === 'object'
                ? obj.pendingProposal.profileUpdates
                : undefined,
            memoryActions: Array.isArray(obj.pendingProposal.memoryActions)
              ? obj.pendingProposal.memoryActions
              : undefined,
            appSettings:
              obj.pendingProposal.appSettings && typeof obj.pendingProposal.appSettings === 'object'
                ? obj.pendingProposal.appSettings
                : undefined,
            status:
              obj.pendingProposal.status === 'confirmed' ||
              obj.pendingProposal.status === 'cancelled'
                ? obj.pendingProposal.status
                : ('pending' as const),
          }
        : undefined;

    cleaned.push({
      id,
      role,
      mode,
      text,
      createdAtIso: typeof obj.createdAtIso === 'string' ? obj.createdAtIso : undefined,
      places: Array.isArray(obj.places) ? obj.places : undefined,
      sources: Array.isArray(obj.sources) ? obj.sources : undefined,
      pendingProposal,
      executionLinks: Array.isArray(obj.executionLinks) ? obj.executionLinks : undefined,
      latencyMs: typeof obj.latencyMs === 'number' ? obj.latencyMs : undefined,
      memoriesAppliedCount:
        typeof obj.memoriesAppliedCount === 'number' ? obj.memoriesAppliedCount : undefined,
      cached: Boolean(obj.cached),
      error: Boolean(obj.error),
    });
  }

  return cleaned.length > 0 ? sortChatMessagesChronologically(cleaned.slice(-60)) : [welcomeMessage];
}

/**
 * Safely extracts an epoch millisecond timestamp from a persisted chat message.
 * Inspects `createdAtIso`, embedded timestamp in message IDs (`u-174000...`, `m-174000...`),
 * and ensures deterministic chronological ordering.
 */
export function getChatMessageTimestampMs(msg: PersistedChatMessage): number {
  if (msg.id === 'welcome-1') return 0;
  if (typeof msg.createdAtIso === 'string' && msg.createdAtIso) {
    const parsed = Date.parse(msg.createdAtIso);
    if (Number.isFinite(parsed) && parsed > 1_000_000_000_000) {
      return parsed;
    }
  }
  const match = msg.id.match(/\b(?:u|m|msg|chat)-(\d{12,14})\b/);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 1_000_000_000_000) {
      return parsed;
    }
  }
  return 0;
}

/**
 * Deterministically sorts chat messages in ascending chronological order:
 * 1. welcome-1 is always pinned to the top.
 * 2. Older messages precede newer messages based on timestamp.
 * 3. Tie-breaker: user messages ALWAYS precede model replies when timestamps match.
 * 4. Secondary tie-breaker: deterministic ID comparison.
 */
export function sortChatMessagesChronologically(
  msgs: PersistedChatMessage[]
): PersistedChatMessage[] {
  if (!Array.isArray(msgs) || msgs.length <= 1) return msgs || [];

  const welcome = msgs.find((m) => m.id === 'welcome-1');
  const others = msgs.filter((m) => m.id !== 'welcome-1');

  others.sort((a, b) => {
    const tsA = getChatMessageTimestampMs(a);
    const tsB = getChatMessageTimestampMs(b);
    if (tsA !== tsB) {
      return tsA - tsB;
    }
    // If identical timestamp: user query always comes before model response
    if (a.role === 'user' && b.role === 'model') return -1;
    if (a.role === 'model' && b.role === 'user') return 1;
    return a.id.localeCompare(b.id);
  });

  return welcome ? [welcome, ...others] : others;
}

/**
 * Strips HTML markup that Google Calendar sometimes embeds in event descriptions.
 */
