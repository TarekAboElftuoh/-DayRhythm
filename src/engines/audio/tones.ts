import { ActiveSanctuaryState } from '../../types/dayrhythm';
import { SoundRepeatSetting, TaskSoundCategory } from '../../types/dayrhythm';
import { DEFAULT_SOUND_REPEATS, audioState, getCtx, stopContinuousAlert } from './state';

export function scheduleTone(
  ctx: AudioContext,
  freq: number,
  startOffsetSec: number,
  durationSec: number,
  wave: OscillatorType,
  peakGain: number,
  slideToFreq?: number
) {
  const now = ctx.currentTime + startOffsetSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, now);
  if (slideToFreq) {
    osc.frequency.exponentialRampToValueAtTime(slideToFreq, now + durationSec * 0.75);
  }
  gain.gain.setValueAtTime(0.0008, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.03);
}

const BURST_DURATION_MS: Record<TaskSoundCategory, number> = {
  prayer: 1450,
  water: 480,
  medication: 520,
  focus_work: 660,
  pomodoro: 760,
  walk_health: 720,
  sleep_suhoor: 1280,
  meeting_event: 780,
  general: 520,
};

function playSingleBurst(ctx: AudioContext, category: TaskSoundCategory) {
  switch (category) {
    case 'prayer':
      scheduleTone(ctx, 392.0, 0, 0.75, 'sine', 0.12);
      scheduleTone(ctx, 587.33, 0.22, 0.85, 'sine', 0.11);
      scheduleTone(ctx, 783.99, 0.48, 0.95, 'triangle', 0.09);
      break;
    case 'water':
      scheduleTone(ctx, 520, 0, 0.16, 'sine', 0.11, 980);
      scheduleTone(ctx, 640, 0.17, 0.18, 'sine', 0.12, 1240);
      scheduleTone(ctx, 780, 0.34, 0.14, 'sine', 0.07, 1460);
      break;
    case 'medication':
      scheduleTone(ctx, 880.0, 0, 0.20, 'triangle', 0.10);
      scheduleTone(ctx, 1174.66, 0.18, 0.30, 'sine', 0.11);
      break;
    case 'focus_work':
      scheduleTone(ctx, 440.0, 0, 0.22, 'triangle', 0.09);
      scheduleTone(ctx, 554.37, 0.14, 0.22, 'triangle', 0.09);
      scheduleTone(ctx, 659.25, 0.28, 0.34, 'sine', 0.1);
      break;
    case 'pomodoro':
      scheduleTone(ctx, 587.33, 0, 0.18, 'triangle', 0.1);
      scheduleTone(ctx, 783.99, 0.16, 0.2, 'sine', 0.11);
      scheduleTone(ctx, 1046.5, 0.34, 0.36, 'sine', 0.11);
      break;
    case 'walk_health':
      scheduleTone(ctx, 523.25, 0, 0.14, 'sine', 0.09);
      scheduleTone(ctx, 659.25, 0.12, 0.14, 'sine', 0.09);
      scheduleTone(ctx, 783.99, 0.24, 0.18, 'sine', 0.1);
      scheduleTone(ctx, 1046.5, 0.38, 0.26, 'sine', 0.11);
      break;
    case 'sleep_suhoor':
      scheduleTone(ctx, 329.63, 0, 0.45, 'sine', 0.1);
      scheduleTone(ctx, 440.0, 0.28, 0.55, 'sine', 0.11);
      scheduleTone(ctx, 523.25, 0.6, 0.65, 'triangle', 0.09);
      break;
    case 'meeting_event':
      // Smooth warm calendar triple chime (replaces harsh square buzz)
      scheduleTone(ctx, 587.33, 0, 0.24, 'sine', 0.10);
      scheduleTone(ctx, 739.99, 0.16, 0.26, 'sine', 0.10);
      scheduleTone(ctx, 880.0, 0.32, 0.44, 'triangle', 0.11);
      break;
    default:
      scheduleTone(ctx, 587.33, 0, 0.28, 'sine', 0.08);
      scheduleTone(ctx, 880.0, 0.16, 0.32, 'sine', 0.08);
      break;
  }
}

function playBurstWhenReady(
  ctx: AudioContext,
  category: TaskSoundCategory,
  gen: number
): void {
  if (ctx.state === 'running') {
    playSingleBurst(ctx, category);
    return;
  }
  if (ctx.state === 'suspended') {
    void ctx
      .resume()
      .then(() => {
        if (gen === audioState.alertPlayGeneration && ctx.state === 'running') {
          playSingleBurst(ctx, category);
        }
      })
      .catch(() => {});
  }
}

/**
 * Plays a distinct, recognizable audio signature for each task category with smooth breathing gaps
 * between repeats so consecutive chimes never clash (1x..4x or continuous up to 60s).
 */
export function playTaskSignature(
  category: TaskSoundCategory,
  options?: {
    bypassSanctuary?: boolean;
    sanctuary?: ActiveSanctuaryState;
    repeatCount?: SoundRepeatSetting;
    alertId?: string;
  }
): { playedAudio: boolean; vibrated: boolean; isContinuous: boolean } {
  const sanctuary = options?.sanctuary;
  if (!options?.bypassSanctuary && sanctuary && sanctuary.type !== 'none') {
    if (sanctuary.vibrateOnly && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([70, 50, 70]);
      return { playedAudio: false, vibrated: true, isContinuous: false };
    }
    return { playedAudio: false, vibrated: false, isContinuous: false };
  }

  const ctx = getCtx();
  if (!ctx) return { playedAudio: false, vibrated: false, isContinuous: false };

  stopContinuousAlert();
  const gen = audioState.alertPlayGeneration;
  audioState.lastPlayedAlertId = options?.alertId ?? null;

  const repeat: SoundRepeatSetting = options?.repeatCount ?? 1;
  playBurstWhenReady(ctx, category, gen);

  const burstMs = BURST_DURATION_MS[category] ?? 650;

  if (repeat === 'continuous' && typeof window !== 'undefined') {
    const loopMs = Math.max(2400, burstMs + 1400);
    audioState.activeContinuousInterval = window.setInterval(() => {
      const c = getCtx();
      if (c) playBurstWhenReady(c, category, gen);
      const isAndroidNative =
        typeof window !== 'undefined' &&
        Boolean((window as Window & { DayRhythmNative?: unknown }).DayRhythmNative);
      if (!isAndroidNative && typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([120, 80, 120]);
        } catch {
          // ignore
        }
      }
    }, loopMs);
    // Stop after 1 minute cleanly so card can auto-snooze for 5 minutes if unacknowledged
    audioState.activeContinuousSafetyTimeout = window.setTimeout(() => {
      stopContinuousAlert();
    }, 60_000);
    return { playedAudio: true, vibrated: false, isContinuous: true };
  }

  if (typeof repeat === 'number' && repeat > 1 && typeof window !== 'undefined') {
    const gapMs = Math.max(1950, burstMs + 1150);
    const clamped = Math.min(4, Math.max(1, Math.round(repeat)));
    for (let i = 1; i < clamped; i++) {
      const id = window.setTimeout(() => {
        const c = getCtx();
        if (c) playBurstWhenReady(c, category, gen);
      }, i * gapMs);
      audioState.activeRepeatTimers.push(id);
    }
  }

  return { playedAudio: true, vibrated: false, isContinuous: false };
}

