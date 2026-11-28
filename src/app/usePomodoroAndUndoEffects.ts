import { useCallback, useEffect } from 'react';
import type React from 'react';
import type { ActiveSanctuaryState, PomodoroState, QuietModeType, ScheduleBlock } from '../types/dayrhythm';
import { playSoftChime } from '../engines/audioEngine';
import { triggerHapticWaveform } from '../engines/hapticsEngine';

export interface UsePomodoroAndUndoEffectsParams {
  shakeUndoSecondsLeft: number;
  lastDeletedBlock: ScheduleBlock | null;
  pomodoro: PomodoroState;
  quietMode: QuietModeType;
  activeSanctuary: ActiveSanctuaryState;
  setShakeUndoSecondsLeft: React.Dispatch<React.SetStateAction<number>>;
  setOfflineBlocks: React.Dispatch<React.SetStateAction<ScheduleBlock[]>>;
  setLastDeletedBlock: React.Dispatch<React.SetStateAction<ScheduleBlock | null>>;
  setPomodoro: React.Dispatch<React.SetStateAction<PomodoroState>>;
  showToast: (msg: string) => void;
}

export function usePomodoroAndUndoEffects(p: UsePomodoroAndUndoEffectsParams) {
  useEffect(() => {
    if (p.shakeUndoSecondsLeft <= 0) return;
    const id = window.setTimeout(() => p.setShakeUndoSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [p.setShakeUndoSecondsLeft, p.shakeUndoSecondsLeft]);

  const handleTriggerShakeUndo = useCallback(() => {
    if (!p.lastDeletedBlock || p.shakeUndoSecondsLeft <= 0) return;
    const targetId = p.lastDeletedBlock.id;
    p.setOfflineBlocks((prev) => prev.map((b) => (b.id === targetId ? { ...b, deleted: false } : b)));
    p.setLastDeletedBlock(null);
    p.setShakeUndoSecondsLeft(0);
    triggerHapticWaveform('shake_undo');
    p.showToast(`تم التراجع واسترجاع الحدث بنجاح (${p.lastDeletedBlock.emojiPair})`);
  }, [p.lastDeletedBlock, p.setLastDeletedBlock, p.setOfflineBlocks, p.setShakeUndoSecondsLeft, p.shakeUndoSecondsLeft, p.showToast]);

  useEffect(() => {
    if (p.shakeUndoSecondsLeft <= 0 || typeof window === 'undefined') return;
    const onMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const gx = (acc.x ?? 0) / 9.81;
      const gy = (acc.y ?? 0) / 9.81;
      const gz = (acc.z ?? 0) / 9.81;
      if (Math.sqrt(gx * gx + gy * gy + gz * gz) > 2.6) handleTriggerShakeUndo();
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [p.shakeUndoSecondsLeft, handleTriggerShakeUndo]);

  useEffect(() => {
    if (!p.pomodoro.isRunning) return;
    const id = window.setInterval(() => {
      p.setPomodoro((prev) => {
        if (!prev.isRunning) return prev;
        if (prev.remainingSeconds > 1) return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
        if (prev.phase === 'focus') {
          if (p.quietMode === 'normal') playSoftChime('focus_done', p.activeSanctuary);
          if (p.quietMode !== 'silent_all' && p.quietMode !== 'mute_audio') triggerHapticWaveform('pomodoro');
          return { ...prev, phase: 'break', remainingSeconds: 5 * 60, totalSeconds: 5 * 60, isRunning: true, completedCycles: prev.completedCycles + 1 };
        }
        if (p.quietMode === 'normal') playSoftChime('break_done', p.activeSanctuary);
        if (p.quietMode !== 'silent_all' && p.quietMode !== 'mute_audio') triggerHapticWaveform('pomodoro');
        return { ...prev, phase: 'focus', remainingSeconds: prev.presetMinutes * 60, totalSeconds: prev.presetMinutes * 60, isRunning: false };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [p.pomodoro.isRunning, p.quietMode, p.activeSanctuary, p.setPomodoro]);

  return { handleTriggerShakeUndo };
}
