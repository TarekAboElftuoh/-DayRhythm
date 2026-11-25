export type HapticWaveformKind = 'wake_fajr' | 'pomodoro' | 'water_cup' | 'shake_undo';

export const HAPTIC_WAVEFORMS: Record<
  HapticWaveformKind,
  {
    labelAr: string;
    labelEn: string;
    patternMs: number[];
    amplitudes: number[];
    summary: string;
  }
> = {
  wake_fajr: {
    labelAr: 'استيقاظ والفجر (متصاعد قوي)',
    labelEn: 'Fajr & Wake (Escalating Strong)',
    patternMs: [0, 120, 80, 200, 80, 320, 100, 420],
    amplitudes: [0, 120, 0, 190, 0, 235, 0, 255],
    summary: 'createWaveform([0,120,80,200,80,320,100,420], [0,120,0,190,0,235,0,255], -1)',
  },
  pomodoro: {
    labelAr: 'بومودورو (اهتزاز ناعم خفيف)',
    labelEn: 'Pomodoro (Gentle Double Tap)',
    patternMs: [0, 45, 70, 45],
    amplitudes: [0, 95, 0, 110],
    summary: 'createWaveform([0,45,70,45], [0,95,0,110], -1)',
  },
  water_cup: {
    labelAr: 'تسجيل كوب ماء (نقرة لطيفة)',
    labelEn: 'Water Cup Logged (Crisp Click)',
    patternMs: [0, 22],
    amplitudes: [0, 140],
    summary: 'createWaveform([0,22], [0,140], -1)',
  },
  shake_undo: {
    labelAr: 'تراجع بالهز (تأكيد ثنائي)',
    labelEn: 'Shake Undo (Confirm Pulse)',
    patternMs: [0, 40, 30, 60],
    amplitudes: [0, 180, 0, 220],
    summary: 'createWaveform([0,40,30,60], [0,180,0,220], -1)',
  },
};

export function triggerHapticWaveform(kind: HapticWaveformKind): boolean {
  // Inside Android Native APK, hardware vibration is owned by ReminderAlarmReceiver on STREAM_ALARM.
  // Calling WebView navigator.vibrate causes erratic shaking on app open/UI interactions.
  if (typeof window !== 'undefined' && (window as Window & { DayRhythmNative?: unknown }).DayRhythmNative) {
    return false;
  }
  const wf = HAPTIC_WAVEFORMS[kind];
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      return navigator.vibrate(wf.patternMs);
    } catch {
      return false;
    }
  }
  return false;
}
