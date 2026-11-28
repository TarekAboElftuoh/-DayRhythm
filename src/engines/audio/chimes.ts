import { ActiveSanctuaryState } from '../../types/dayrhythm';
import { playTaskSignature } from './tones';
import { getCtx, audioState, stopSmartChargeCompleteAlert } from './state';
import { scheduleTone } from './tones';

export function playSoftChime(
  type: 'focus_done' | 'break_done' | 'alarm_pulse',
  sanctuary?: ActiveSanctuaryState
): void {
  if (type === 'focus_done') {
    playTaskSignature('focus_work', { sanctuary, repeatCount: 1 });
  } else if (type === 'break_done') {
    playTaskSignature('walk_health', { sanctuary, repeatCount: 1 });
  } else {
    playTaskSignature('prayer', { sanctuary, repeatCount: 2 });
  }
}

/**
 * Gentle Web Audio chimes for daily sunlight exposure cues and completion.
 */
export function playSunlightChime(
  type: 'morning' | 'noon' | 'evening' | 'end'
): boolean {
  const ctx = getCtx();
  if (!ctx) return false;

  const playNotes = () => {
    if (type === 'morning') {
      // Warm rising dawn triad (C5 -> E5 -> G5)
      scheduleTone(ctx, 523.25, 0.0, 0.32, 'sine', 0.11);
      scheduleTone(ctx, 659.25, 0.14, 0.36, 'sine', 0.11);
      scheduleTone(ctx, 783.99, 0.28, 0.55, 'sine', 0.1);
    } else if (type === 'noon') {
      // Bright clear solar bell (G5 -> B5 -> D6)
      scheduleTone(ctx, 783.99, 0.0, 0.26, 'triangle', 0.1);
      scheduleTone(ctx, 987.77, 0.12, 0.3, 'sine', 0.11);
      scheduleTone(ctx, 1174.66, 0.24, 0.48, 'sine', 0.1);
    } else if (type === 'evening') {
      // Soft amber descending sunset tone (A4 -> F4 -> D4)
      scheduleTone(ctx, 440.0, 0.0, 0.38, 'sine', 0.1);
      scheduleTone(ctx, 349.23, 0.16, 0.42, 'sine', 0.1);
      scheduleTone(ctx, 293.66, 0.34, 0.6, 'sine', 0.09);
    } else {
      // Gentle completion two-note bell (E5 -> A5)
      scheduleTone(ctx, 659.25, 0.0, 0.28, 'sine', 0.1);
      scheduleTone(ctx, 880.0, 0.15, 0.5, 'sine', 0.11);
    }
  };

  if (ctx.state === 'running') {
    playNotes();
  } else if (ctx.state === 'suspended') {
    void ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running') playNotes();
      })
      .catch(() => {});
  }

  return true;
}

/**
 * Distinct crystalline ascending harmonic signature exclusively for
 * "Smart Charge Complete" (90% phone battery reached).
 */
export function playBatteryFullSignature(): boolean {
  const ctx = getCtx();
  if (!ctx) return false;
  const playChime = () => {
    // Bright ascending E-major9 crystalline power-up chime (E5 -> G#5 -> B5 -> E6 + warm shimmer)
    scheduleTone(ctx, 659.25, 0.0, 0.22, 'triangle', 0.14);
    scheduleTone(ctx, 830.61, 0.11, 0.24, 'triangle', 0.15);
    scheduleTone(ctx, 987.77, 0.22, 0.28, 'sine', 0.16);
    scheduleTone(ctx, 1318.51, 0.34, 0.52, 'sine', 0.17);
    scheduleTone(ctx, 1975.53, 0.36, 0.42, 'sine', 0.05);
  };
  if (ctx.state === 'running') {
    playChime();
  } else if (ctx.state === 'suspended') {
    void ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running') playChime();
      })
      .catch(() => {});
  }
  return true;
}

export function startSmartChargeCompleteAlert(options?: {
  sanctuary?: ActiveSanctuaryState;
  keepRingingUntilUnplugged?: boolean;
  onCycleRestart?: () => void;
  onAutoStop?: () => void;
}): { playedAudio: boolean; suppressedBySanctuary: boolean } {
  stopSmartChargeCompleteAlert();

  const sanctuary = options?.sanctuary;
  if (sanctuary && sanctuary.type !== 'none') {
    if (sanctuary.vibrateOnly && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([120, 80, 120]);
      } catch {
        // ignore vibration errors
      }
    }
    return { playedAudio: false, suppressedBySanctuary: true };
  }

  let played = false;
  if (typeof window === 'undefined') {
    played = playBatteryFullSignature();
    return { playedAudio: played, suppressedBySanctuary: false };
  }

  // Loop protocol: ring cleanly for 1 minute -> pause silently for 5 minutes -> ring for 1 minute until unplugged.
  const runOneMinuteBurst = () => {
    if (audioState.batteryAlertInterval !== null) {
      window.clearInterval(audioState.batteryAlertInterval);
      audioState.batteryAlertInterval = null;
    }
    if (audioState.batteryAlertSafetyTimeout !== null) {
      window.clearTimeout(audioState.batteryAlertSafetyTimeout);
      audioState.batteryAlertSafetyTimeout = null;
    }
    playBatteryFullSignature();
    audioState.batteryAlertInterval = window.setInterval(() => {
      playBatteryFullSignature();
    }, 3200);

    audioState.batteryAlertSafetyTimeout = window.setTimeout(() => {
      if (audioState.batteryAlertInterval !== null) {
        window.clearInterval(audioState.batteryAlertInterval);
        audioState.batteryAlertInterval = null;
      }
      audioState.batteryAlertSafetyTimeout = null;
      if (options?.keepRingingUntilUnplugged) {
        // Wait 5 minutes quietly, then re-ring for another minute
        audioState.batteryAlertCycleTimeout = window.setTimeout(() => {
          audioState.batteryAlertCycleTimeout = null;
          options?.onCycleRestart?.();
          runOneMinuteBurst();
        }, 5 * 60_000);
      } else {
        options?.onAutoStop?.();
      }
    }, 60_000);
  };

  played = playBatteryFullSignature();
  if (played) {
    // Replace initial double strike cleanly by letting runOneMinuteBurst own timers after first burst
    audioState.batteryAlertInterval = window.setInterval(() => {
      playBatteryFullSignature();
    }, 3200);
    audioState.batteryAlertSafetyTimeout = window.setTimeout(() => {
      if (audioState.batteryAlertInterval !== null) {
        window.clearInterval(audioState.batteryAlertInterval);
        audioState.batteryAlertInterval = null;
      }
      audioState.batteryAlertSafetyTimeout = null;
      if (options?.keepRingingUntilUnplugged) {
        audioState.batteryAlertCycleTimeout = window.setTimeout(() => {
          audioState.batteryAlertCycleTimeout = null;
          options?.onCycleRestart?.();
          runOneMinuteBurst();
        }, 5 * 60_000);
      } else {
        options?.onAutoStop?.();
      }
    }, 60_000);
  }

  return { playedAudio: played, suppressedBySanctuary: false };
}



