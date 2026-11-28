import { useEffect, useRef } from 'react';
import type {
  CapsulePrefs,
  CapsuleTrackInfo,
  DocumentPictureInPictureApi,
} from './types';

interface UseDocumentPiPArgs {
  docPiP?: DocumentPictureInPictureApi;
  prefs: CapsulePrefs;
  isVertical: boolean;
  hasDualTimers: boolean;
  calendarTrack?: CapsuleTrackInfo | null;
  taskTrack?: CapsuleTrackInfo | null;
  nextEmoji: string;
  isUrgent: boolean;
  activePrimary: CapsuleTrackInfo;
  activePrimaryClock: string;
  activePrimaryUrgent: boolean;
  activeTask: CapsuleTrackInfo | null;
  activeTaskClock: string;
  activeTaskUrgent: boolean;
  phoneBatteryBadge: string;
  phoneReachedLimit: boolean;
  onMenuClose: () => void;
}

export function useDocumentPiP({
  docPiP,
  prefs,
  isVertical,
  hasDualTimers,
  calendarTrack,
  taskTrack,
  nextEmoji,
  isUrgent,
  activePrimary,
  activePrimaryClock,
  activePrimaryUrgent,
  activeTask,
  activeTaskClock,
  activeTaskUrgent,
  phoneBatteryBadge,
  phoneReachedLimit,
  onMenuClose,
}: UseDocumentPiPArgs) {
  const pipWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    const pipWin = pipWindowRef.current;
    if (!pipWin || pipWin.closed) return;
    const doc = pipWin.document;
    const shellEl = doc.getElementById('dr-pip-shell');
    const clockEl = doc.getElementById('dr-pip-clock');
    const emojiEl = doc.getElementById('dr-pip-emoji');
    const taskWrapEl = doc.getElementById('dr-pip-task-wrap');
    const taskEmojiEl = doc.getElementById('dr-pip-task-emoji');
    const taskClockEl = doc.getElementById('dr-pip-task-clock');
    const batEl = doc.getElementById('dr-pip-bat');

    const accent = activePrimaryUrgent ? '#FF6B6B' : activePrimary.isNow ? '#4ADE80' : '#7FFFD4';

    if (shellEl) {
      shellEl.style.flexDirection = isVertical ? 'column' : 'row';
      shellEl.style.gap = isVertical ? '6px' : '10px';
      shellEl.style.borderRadius = isVertical ? '16px' : '999px';
    }
    if (clockEl) {
      clockEl.textContent = activePrimaryClock;
      clockEl.style.color = accent;
      clockEl.style.fontSize = prefs.size === 'lg' ? '15px' : prefs.size === 'sm' ? '12px' : '13.5px';
    }
    if (emojiEl) {
      emojiEl.textContent = activePrimary.emoji;
      emojiEl.style.fontSize = prefs.size === 'lg' ? '18px' : prefs.size === 'sm' ? '13px' : '15px';
    }
    if (taskWrapEl && taskClockEl) {
      if (hasDualTimers && activeTask) {
        taskWrapEl.style.display = 'inline-flex';
        taskWrapEl.style.borderRight = isVertical ? 'none' : '1px solid rgba(255,255,255,0.12)';
        taskWrapEl.style.paddingRight = isVertical ? '0' : '9px';
        taskWrapEl.style.borderTop = isVertical ? '1px solid rgba(255,255,255,0.12)' : 'none';
        taskWrapEl.style.paddingTop = isVertical ? '5px' : '0';
        if (taskEmojiEl) {
          taskEmojiEl.textContent = activeTask.emoji;
          taskEmojiEl.style.fontSize = prefs.size === 'lg' ? '17px' : prefs.size === 'sm' ? '13px' : '15px';
        }
        taskClockEl.textContent = activeTaskClock;
        taskClockEl.style.fontSize = prefs.size === 'lg' ? '15px' : prefs.size === 'sm' ? '12px' : '13.5px';
        taskClockEl.style.color = activeTaskUrgent
          ? '#FF6B6B'
          : activeTask.isNow
            ? '#4ADE80'
            : activeTask.emoji === '💧'
              ? '#38BDF8'
              : '#FCD34D';
      } else {
        taskWrapEl.style.display = 'none';
      }
    }
    if (batEl) {
      if (phoneBatteryBadge) {
        batEl.style.display = 'inline';
        batEl.textContent = phoneBatteryBadge;
        batEl.style.color = phoneReachedLimit ? '#4ADE80' : '#FCD34D';
      } else {
        batEl.style.display = 'none';
      }
    }
  }, [
    activePrimaryClock,
    activePrimary.emoji,
    activePrimaryUrgent,
    activePrimary.isNow,
    hasDualTimers,
    activeTask,
    activeTaskClock,
    activeTaskUrgent,
    phoneBatteryBadge,
    phoneReachedLimit,
    isVertical,
    prefs.size,
  ]);

  useEffect(() => {
    return () => {
      try {
        if (pipWindowRef.current && !pipWindowRef.current.closed) {
          pipWindowRef.current.close();
        }
      } catch {
        // ignore cleanup error
      }
    };
  }, []);

  const openBrowserDesktopPopout = async () => {
    if (!docPiP?.requestWindow) return;
    try {
      if (pipWindowRef.current && !pipWindowRef.current.closed) {
        pipWindowRef.current.focus();
        return;
      }
      const scaleMult = prefs.size === 'lg' ? 1.18 : prefs.size === 'sm' ? 0.88 : 1;
      const popWidth = isVertical
        ? Math.round(138 * scaleMult)
        : Math.round((hasDualTimers ? 256 : 156) * scaleMult);
      const popHeight = isVertical
        ? Math.round((hasDualTimers ? 104 : 64) * scaleMult)
        : Math.round(52 * scaleMult);

      const pipWin = await docPiP.requestWindow({
        width: popWidth,
        height: popHeight,
      });
      pipWindowRef.current = pipWin;
      onMenuClose();

      const primary = hasDualTimers && calendarTrack ? calendarTrack : null;
      const pClock = activePrimaryClock;
      const pEmoji = primary ? primary.emoji : nextEmoji;
      const pAccent = (primary ? primary.isUrgent : isUrgent) ? '#FF6B6B' : '#7FFFD4';
      const tEmoji = taskTrack?.emoji ?? '💧';
      const tAccent = tEmoji === '💧' ? '#38BDF8' : '#FCD34D';
      const emojiPx = prefs.size === 'lg' ? 18 : prefs.size === 'sm' ? 13 : 15;
      const clockPx = prefs.size === 'lg' ? 15 : prefs.size === 'sm' ? 12 : 13.5;

      const pipDoc = pipWin.document;
      pipDoc.title = 'إيقاع اليوم';
      pipDoc.documentElement.dir = 'rtl';
      pipDoc.documentElement.lang = 'ar';

      pipDoc.head.replaceChildren();
      const styleEl = pipDoc.createElement('style');
      styleEl.textContent = [
        '* { box-sizing: border-box; margin: 0; padding: 0; }',
        'body { background: #000000; color: #F4F4F5; font-family: "Cairo", "Segoe UI", system-ui, sans-serif; height: 100vh; display: flex; align-items: center; justify-content: center; padding: 4px; overflow: hidden; user-select: none; }',
        `#dr-pip-shell { width: 100%; height: 100%; border-radius: ${isVertical ? '16px' : '999px'}; background: linear-gradient(180deg, #10151E 0%, #07080B 100%); border: 1px solid rgba(255, 255, 255, 0.14); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); padding: 6px 12px; display: flex; flex-direction: ${isVertical ? 'column' : 'row'}; align-items: center; justify-content: center; gap: ${isVertical ? '6px' : '10px'}; }`,
        '.seg { display: inline-flex; align-items: center; gap: 6px; }',
        `#dr-pip-emoji, #dr-pip-task-emoji { font-size: ${emojiPx}px; line-height: 1; }`,
        `#dr-pip-clock, #dr-pip-task-clock { font-family: "JetBrains Mono", "Cascadia Mono", "Consolas", ui-monospace, monospace; font-variant-numeric: tabular-nums; direction: ltr; font-size: ${clockPx}px; font-weight: 700; }`,
        `#dr-pip-clock { color: ${pAccent}; }`,
        `#dr-pip-task-wrap { ${isVertical ? 'border-top: 1px solid rgba(255,255,255,0.12); padding-top: 5px;' : 'border-right: 1px solid rgba(255,255,255,0.12); padding-right: 9px;'} }`,
        '#dr-pip-bat { font-family: "JetBrains Mono", "Consolas", ui-monospace, monospace; font-variant-numeric: tabular-nums; direction: ltr; font-size: 11px; font-weight: 700; }',
      ].join('\n');
      pipDoc.head.appendChild(styleEl);

      pipDoc.body.replaceChildren();
      const shellEl = pipDoc.createElement('div');
      shellEl.id = 'dr-pip-shell';

      const primarySeg = pipDoc.createElement('span');
      primarySeg.className = 'seg';
      const primaryEmojiEl = pipDoc.createElement('span');
      primaryEmojiEl.id = 'dr-pip-emoji';
      primaryEmojiEl.textContent = pEmoji;
      const primaryClockEl = pipDoc.createElement('span');
      primaryClockEl.id = 'dr-pip-clock';
      primaryClockEl.textContent = pClock;
      primarySeg.append(primaryEmojiEl, primaryClockEl);

      const taskWrapEl = pipDoc.createElement('span');
      taskWrapEl.id = 'dr-pip-task-wrap';
      taskWrapEl.className = 'seg';
      taskWrapEl.style.display = hasDualTimers && taskTrack ? 'inline-flex' : 'none';
      const taskEmojiEl = pipDoc.createElement('span');
      taskEmojiEl.id = 'dr-pip-task-emoji';
      taskEmojiEl.textContent = tEmoji;
      const taskClockEl = pipDoc.createElement('span');
      taskClockEl.id = 'dr-pip-task-clock';
      taskClockEl.style.color = tAccent;
      taskClockEl.textContent = activeTaskClock;
      taskWrapEl.append(taskEmojiEl, taskClockEl);

      const batEl = pipDoc.createElement('span');
      batEl.id = 'dr-pip-bat';
      batEl.style.display = phoneBatteryBadge ? 'inline' : 'none';
      batEl.style.color = phoneReachedLimit ? '#4ADE80' : '#FCD34D';
      batEl.textContent = phoneBatteryBadge;

      shellEl.append(primarySeg, taskWrapEl, batEl);
      pipDoc.body.appendChild(shellEl);

      pipWin.addEventListener('pagehide', () => {
        pipWindowRef.current = null;
      });
    } catch {
      // ignore PiP rejection
    }
  };

  return { openBrowserDesktopPopout };
}
