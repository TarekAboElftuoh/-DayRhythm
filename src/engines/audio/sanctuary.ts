import { ActiveSanctuaryState, PrayerTimeItem, TaskSoundCategory } from '../../types/dayrhythm';

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

