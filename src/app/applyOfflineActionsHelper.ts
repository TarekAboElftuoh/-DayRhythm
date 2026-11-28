import type { CalendarActionProposal, ScheduleBlock } from '../types/dayrhythm';
import { extractEmojiPair } from '../utils/appHelpers';

export function applyOfflineActionsToBlocks(
  prev: ScheduleBlock[],
  actions: CalendarActionProposal[]
): ScheduleBlock[] {
  let next = [...prev];
  actions.forEach((act) => {
    const parseMin = (hhmm?: string): number => {
      if (!hhmm || !hhmm.includes(':')) return 9 * 60;
      const [hStr, mStr] = hhmm.split(':');
      return (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
    };
    if (act.operation === 'delete') {
      next = next.map((b) =>
        b.id === act.eventId || b.emojiPair === act.title || b.categoryAr.includes(act.title)
          ? { ...b, deleted: true }
          : b
      );
    } else if (act.operation === 'update' || act.operation === 'shift') {
      const newStart = parseMin(act.startTime24);
      next = next.map((b) =>
        b.id === act.eventId || b.emojiPair === act.title || b.categoryAr.includes(act.title)
          ? { ...b, startMin: newStart, durationMin: act.durationMinutes ?? b.durationMin, reflowStatus: 'shifted_evening' }
          : b
      );
    } else {
      const startMin = parseMin(act.startTime24);
      next.push({
        id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        emojiPair: extractEmojiPair(act.title, '📅 ✨'),
        categoryAr: act.title,
        startMin,
        durationMin: act.durationMinutes ?? 30,
        minDurationMin: 15,
        isAnchor: false,
        travelGroup: 'B_WORK',
        canShiftEvening: true,
        completed: false,
        deleted: false,
        source: 'offline',
      });
    }
  });
  return next.sort((a, b) => a.startMin - b.startMin);
}
