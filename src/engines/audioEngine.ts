import {
  ActiveSanctuaryState,
  PrayerTimeItem,
  SoundRepeatMap,
  SoundRepeatSetting,
  TaskSoundCategory,
} from '../types/dayrhythm';

let audioCtx: AudioContext | null = null;
let activeRepeatTimers: number[] = [];
let activeContinuousInterval: number | null = null;
let activeContinuousSafetyTimeout: number | null = null;

let batteryAlertInterval: number | null = null;
let batteryAlertSafetyTimeout: number | null = null;
let batteryAlertCycleTimeout: number | null = null;

export const DEFAULT_SOUND_REPEATS: SoundRepeatMap = {
  prayer: 3,
  water: 2,
  medication: 2,
  focus_work: 2,
  walk_health: 2,
  sleep_suhoor: 'continuous',
  meeting_event: 3,
  general: 1,
};

export function stopSmartChargeCompleteAlert(): void {
  if (typeof window === 'undefined') return;
  if (batteryAlertInterval !== null) {
    window.clearInterval(batteryAlertInterval);
    batteryAlertInterval = null;
  }
  if (batteryAlertSafetyTimeout !== null) {
    window.clearTimeout(batteryAlertSafetyTimeout);
    batteryAlertSafetyTimeout = null;
  }
  if (batteryAlertCycleTimeout !== null) {
    window.clearTimeout(batteryAlertCycleTimeout);
    batteryAlertCycleTimeout = null;
  }
}

export function stopContinuousAlert(): void {
  if (typeof window === 'undefined') return;
  for (const t of activeRepeatTimers) {
    window.clearTimeout(t);
  }
  activeRepeatTimers = [];
  if (activeContinuousInterval !== null) {
    window.clearInterval(activeContinuousInterval);
    activeContinuousInterval = null;
  }
  if (activeContinuousSafetyTimeout !== null) {
    window.clearTimeout(activeContinuousSafetyTimeout);
    activeContinuousSafetyTimeout = null;
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

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export const TASK_SOUND_META: Record<
  TaskSoundCategory,
  { labelAr: string; icon: string; descAr: string }
> = {
  prayer: {
    labelAr: 'أذان وصلاة',
    icon: '🕌',
    descAr: 'رنين روحاني دافئ وممتد قبل الأذان',
  },
  water: {
    labelAr: 'شرب الماء',
    icon: '💧',
    descAr: 'نغمة قطرتين سريعتين متصاعدتين',
  },
  medication: {
    labelAr: 'علاج ومكمل',
    icon: '💊',
    descAr: 'نبضتان زجاجيتان واضحتان للجرعة',
  },
  focus_work: {
    labelAr: 'مذاكرة / عمل',
    icon: '💻',
    descAr: 'ثلاثية إيقاعية متزنة لبداية التركيز',
  },
  walk_health: {
    labelAr: 'مشي وحركة',
    icon: '🚶',
    descAr: 'سلم حيوي صاعد من 3 خطوات',
  },
  sleep_suhoor: {
    labelAr: 'نوم وسحور واستيقاظ',
    icon: '🌙',
    descAr: 'نغمة ليلية واضحة ومستمرة حتى الإيقاف',
  },
  meeting_event: {
    labelAr: 'موعد واجتماع',
    icon: '📅',
    descAr: 'طرقة خشبية مزدوجة خفيفة',
  },
  general: {
    labelAr: 'مهمة عامة',
    icon: '🔔',
    descAr: 'رنة هادئة قصيرة',
  },
};

export function classifyTaskSound(
  title: string,
  emojiPair = '',
  isAnchor = false
): TaskSoundCategory {
  const text = `${emojiPair} ${title}`.toLowerCase();
  if (
    isAnchor ||
    text.includes('🕌') ||
    /صلا|أذان|اذان|فجر|ظهر|عصر|مغرب|عشاء|جمعة|fajr|dhuhr|asr|maghrib|isha|prayer/.test(
      text
    )
  ) {
    return 'prayer';
  }
  if (text.includes('💧') || text.includes('🥤') || /ماء|مايه|مياه|كوب|water|hydrat/.test(text)) {
    return 'water';
  }
  if (
    text.includes('💊') ||
    text.includes('🩺') ||
    /علاج|دواء|فيتامين|يقطين|مكمل|جرعة|vitamin|med|supplement|oil/.test(text)
  ) {
    return 'medication';
  }
  if (
    text.includes('🌙') ||
    text.includes('😴') ||
    /نوم|سحور|قيلولة|استيقاظ|صحي|sleep|suhoor|nap|bed|wake/.test(text)
  ) {
    return 'sleep_suhoor';
  }
  if (
    text.includes('🚶') ||
    text.includes('🏃') ||
    text.includes('🏋') ||
    /مشي|رياضة|تمرين|جيم|walk|run|workout|gym/.test(text)
  ) {
    return 'walk_health';
  }
  if (
    text.includes('💻') ||
    text.includes('🔥') ||
    text.includes('📚') ||
    /مذاكر|كورس|تطبيق|شغل|عمل|devops|linux|docker|kubernetes|k8s|study|course|code|work/.test(
      text
    )
  ) {
    return 'focus_work';
  }
  if (
    text.includes('🎙') ||
    text.includes('🤝') ||
    text.includes('📞') ||
    /اجتماع|مكالمة|مقابلة|لقاء|meeting|call|sync|interview/.test(text)
  ) {
    return 'meeting_event';
  }
  return 'general';
}

function isMinuteWithinCircularWindow(
  nowMin: number,
  startMin: number,
  durationMin: number
): boolean {
  const n = ((nowMin % 1440) + 1440) % 1440;
  const s = ((startMin % 1440) + 1440) % 1440;
  const diff = (n - s + 1440) % 1440;
  return diff >= 0 && diff < durationMin;
}

export function evaluateAudioSanctuary(params: {
  nowMin: number;
  prayers: PrayerTimeItem[];
  bedtimeMin: number;
  wakeMin: number;
  prayerSilenceMinutes: number;
  fajrSilenceMinutes: number;
  oneTimeSilenceMinutes?: number;
  meetingActive: boolean;
  /** true = fully silent (no vibration either), false/undefined = silent with vibration. */
  meetingMuteFully?: boolean;
  isFriday?: boolean;
}): ActiveSanctuaryState {
  const {
    nowMin,
    prayers,
    bedtimeMin,
    wakeMin,
    prayerSilenceMinutes,
    fajrSilenceMinutes,
    oneTimeSilenceMinutes = 0,
    meetingActive,
    meetingMuteFully = false,
    isFriday = false,
  } = params;

  // 1. Automatic Prayer Silence Sanctuary (starts at actual Adhan time, AFTER the -3m pre-Adhan call)
  for (const p of prayers) {
    if (!p.isObligatory) continue;
    const baseDuration =
      p.id === 'fajr'
        ? fajrSilenceMinutes
        : isFriday && p.id === 'dhuhr'
          ? Math.max(prayerSilenceMinutes, 50)
          : prayerSilenceMinutes;
    const silenceDuration =
      oneTimeSilenceMinutes >= 5 && oneTimeSilenceMinutes <= 120
        ? oneTimeSilenceMinutes
        : baseDuration;

    if (isMinuteWithinCircularWindow(nowMin, p.adhanMinutes, silenceDuration)) {
      return {
        type: 'prayer',
        labelAr: `صامت تلقائياً · وقت صلاة ${p.nameAr} (${silenceDuration} د${oneTimeSilenceMinutes >= 5 ? ' · تعديل مؤقت' : ''})`,
        endsAtMin: (p.adhanMinutes + silenceDuration) % 1440,
        vibrateOnly: true,
      };
    }
  }

  // 2. Manual 1-Tap Meeting Mode
  if (meetingActive) {
    return {
      type: 'meeting',
      labelAr: meetingMuteFully
        ? 'وضع الاجتماع نشط · كتم تام مع حفظ الإشعارات'
        : 'وضع الاجتماع نشط · صامت مع اهتزاز وحفظ الإشعارات',
      vibrateOnly: !meetingMuteFully,
    };
  }

  // 3. Automatic Sleep Silence Sanctuary (bedtime -> wake)
  const sleepDur = (wakeMin - bedtimeMin + 1440) % 1440;
  if (sleepDur > 0 && sleepDur < 900 && isMinuteWithinCircularWindow(nowMin, bedtimeMin, sleepDur)) {
    return {
      type: 'sleep',
      labelAr: 'وقت النوم · كتم تام للصوت مع حفظ الإشعارات',
      endsAtMin: wakeMin,
      vibrateOnly: false,
    };
  }

  return {
    type: 'none',
    labelAr: '',
    vibrateOnly: false,
  };
}

function scheduleTone(
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

  const repeat: SoundRepeatSetting = options?.repeatCount ?? 1;
  playSingleBurst(ctx, category);

  const burstMs = BURST_DURATION_MS[category] ?? 650;

  if (repeat === 'continuous' && typeof window !== 'undefined') {
    const loopMs = Math.max(2400, burstMs + 1400);
    activeContinuousInterval = window.setInterval(() => {
      const c = getCtx();
      if (c) playSingleBurst(c, category);
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
    activeContinuousSafetyTimeout = window.setTimeout(() => {
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
        if (c) playSingleBurst(c, category);
      }, i * gapMs);
      activeRepeatTimers.push(id);
    }
  }

  return { playedAudio: true, vibrated: false, isContinuous: false };
}

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
 * Distinct crystalline ascending harmonic signature exclusively for
 * "Smart Charge Complete" (90% phone battery reached).
 */
export function playBatteryFullSignature(): boolean {
  const ctx = getCtx();
  if (!ctx) return false;
  // Bright ascending E-major9 crystalline power-up chime (E5 -> G#5 -> B5 -> E6 + warm shimmer)
  scheduleTone(ctx, 659.25, 0.0, 0.22, 'triangle', 0.14);
  scheduleTone(ctx, 830.61, 0.11, 0.24, 'triangle', 0.15);
  scheduleTone(ctx, 987.77, 0.22, 0.28, 'sine', 0.16);
  scheduleTone(ctx, 1318.51, 0.34, 0.52, 'sine', 0.17);
  scheduleTone(ctx, 1975.53, 0.36, 0.42, 'sine', 0.05);
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
    if (batteryAlertInterval !== null) {
      window.clearInterval(batteryAlertInterval);
      batteryAlertInterval = null;
    }
    if (batteryAlertSafetyTimeout !== null) {
      window.clearTimeout(batteryAlertSafetyTimeout);
      batteryAlertSafetyTimeout = null;
    }
    playBatteryFullSignature();
    batteryAlertInterval = window.setInterval(() => {
      playBatteryFullSignature();
    }, 3200);

    batteryAlertSafetyTimeout = window.setTimeout(() => {
      if (batteryAlertInterval !== null) {
        window.clearInterval(batteryAlertInterval);
        batteryAlertInterval = null;
      }
      batteryAlertSafetyTimeout = null;
      if (options?.keepRingingUntilUnplugged) {
        // Wait 5 minutes quietly, then re-ring for another minute
        batteryAlertCycleTimeout = window.setTimeout(() => {
          batteryAlertCycleTimeout = null;
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
    batteryAlertInterval = window.setInterval(() => {
      playBatteryFullSignature();
    }, 3200);
    batteryAlertSafetyTimeout = window.setTimeout(() => {
      if (batteryAlertInterval !== null) {
        window.clearInterval(batteryAlertInterval);
        batteryAlertInterval = null;
      }
      batteryAlertSafetyTimeout = null;
      if (options?.keepRingingUntilUnplugged) {
        batteryAlertCycleTimeout = window.setTimeout(() => {
          batteryAlertCycleTimeout = null;
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


