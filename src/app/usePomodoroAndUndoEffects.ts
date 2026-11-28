import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import type { ActiveSanctuaryState, PomodoroState, QuietModeType, ScheduleBlock, TaskSoundCategory } from '../types/dayrhythm';
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
  triggerTaskAlert: (
    title: string,
    category: TaskSoundCategory,
    options?: {
      bypassSanctuary?: boolean;
      privacyEmoji?: string;
      displayTitle?: string;
      sourceLabel?: string;
      description?: string;
    }
  ) => void;
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

  const pomodoroRef = useRef(p.pomodoro);
  pomodoroRef.current = p.pomodoro;
  const triggerTaskAlertRef = useRef(p.triggerTaskAlert);
  triggerTaskAlertRef.current = p.triggerTaskAlert;

  useEffect(() => {
    if (!p.pomodoro.isRunning) return;
    const id = window.setInterval(() => {
      const cur = pomodoroRef.current;
      if (!cur.isRunning) return;
      if (cur.remainingSeconds > 1) {
        p.setPomodoro((prev) =>
          prev.isRunning && prev.remainingSeconds > 1
            ? { ...prev, remainingSeconds: prev.remainingSeconds - 1 }
            : prev
        );
        return;
      }

      const finishedPhase = cur.phase;
      p.setPomodoro((prev) => {
        if (!prev.isRunning) return prev;
        if (prev.phase === 'focus') {
          return { ...prev, phase: 'break', remainingSeconds: 5 * 60, totalSeconds: 5 * 60, isRunning: true, completedCycles: prev.completedCycles + 1 };
        }
        return { ...prev, phase: 'focus', remainingSeconds: prev.presetMinutes * 60, totalSeconds: prev.presetMinutes * 60, isRunning: false };
      });

      if (p.quietMode !== 'silent_all' && p.quietMode !== 'mute_audio') {
        triggerHapticWaveform('pomodoro');
      }
      if (finishedPhase === 'focus') {
        triggerTaskAlertRef.current('انتهت جلسة التركيز — حان وقت الاستراحة 5 دقائق', 'pomodoro', {
          privacyEmoji: '🍅',
          displayTitle: 'انتهت جلسة التركيز! حان وقت الاستراحة (5 د)',
          sourceLabel: 'مؤقت بومودورو',
          description: 'خذ نفساً عميقاً، تحرّك قليلاً أو اشرب كوب ماء قبل الدورة القادمة.',
        });
      } else {
        triggerTaskAlertRef.current('انتهت الاستراحة — جاهز لجلسة تركيز جديدة', 'pomodoro', {
          privacyEmoji: '🍅',
          displayTitle: 'انتهت الاستراحة! جاهز لجلسة تركيز جديدة',
          sourceLabel: 'مؤقت بومودورو',
          description: 'اضغط بدء التركيز عند استعدادك للدورة التالية.',
        });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [p.pomodoro.isRunning, p.quietMode, p.setPomodoro]);

  return { handleTriggerShakeUndo };
}
