import { SoundRepeatMap } from '../../types/dayrhythm';

export const audioState = {
  audioCtx: null as AudioContext | null,
  activeRepeatTimers: [] as number[],
  activeContinuousInterval: null as number | null,
  activeContinuousSafetyTimeout: null as number | null,
  alertPlayGeneration: 0,
  lastPlayedAlertId: null as string | null,
  batteryAlertInterval: null as number | null,
  batteryAlertSafetyTimeout: null as number | null,
  batteryAlertCycleTimeout: null as number | null,
};

export const DEFAULT_SOUND_REPEATS: SoundRepeatMap = {
  prayer: 3,
  water: 2,
  medication: 2,
  focus_work: 2,
  pomodoro: 2,
  walk_health: 2,
  sleep_suhoor: 'continuous',
  meeting_event: 3,
  general: 1,
};

export function stopSmartChargeCompleteAlert(): void {
  if (typeof window === 'undefined') return;
  if (audioState.batteryAlertInterval !== null) {
    window.clearInterval(audioState.batteryAlertInterval);
    audioState.batteryAlertInterval = null;
  }
  if (audioState.batteryAlertSafetyTimeout !== null) {
    window.clearTimeout(audioState.batteryAlertSafetyTimeout);
    audioState.batteryAlertSafetyTimeout = null;
  }
  if (audioState.batteryAlertCycleTimeout !== null) {
    window.clearTimeout(audioState.batteryAlertCycleTimeout);
    audioState.batteryAlertCycleTimeout = null;
  }
}

export function stopContinuousAlert(): void {
  audioState.alertPlayGeneration += 1;
  audioState.lastPlayedAlertId = null;
  if (typeof window === 'undefined') return;
  for (const t of audioState.activeRepeatTimers) {
    window.clearTimeout(t);
  }
  audioState.activeRepeatTimers = [];
  if (audioState.activeContinuousInterval !== null) {
    window.clearInterval(audioState.activeContinuousInterval);
    audioState.activeContinuousInterval = null;
  }
  if (audioState.activeContinuousSafetyTimeout !== null) {
    window.clearTimeout(audioState.activeContinuousSafetyTimeout);
    audioState.activeContinuousSafetyTimeout = null;
  }
  stopSmartChargeCompleteAlert();
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(0);
    } catch {
      // ignore vibration cancel errors
    }
  }
}

export function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  if (!audioState.audioCtx) {
    audioState.audioCtx = new Ctx();
  }
  if (audioState.audioCtx.state === 'suspended') {
    audioState.audioCtx.resume().catch(() => {});
  }
  return audioState.audioCtx;
}

export function unlockAudioContext(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const playSilentBlip = () => {
    if (ctx.state !== 'running') return;
    try {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const osc = ctx.createOscillator();
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.02);
    } catch {
      // ignore unlock blip errors
    }
  };
  if (ctx.state === 'suspended') {
    void ctx.resume().then(playSilentBlip).catch(() => {});
  } else {
    playSilentBlip();
  }
}

export function hasPlayedAlertId(alertId: string): boolean {
  return Boolean(alertId && audioState.lastPlayedAlertId === alertId && audioState.audioCtx?.state === 'running');
}

