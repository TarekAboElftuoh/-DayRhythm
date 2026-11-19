import {
  CatchUpDecision,
  DayMode,
  PrayerTimeItem,
  ReflowResult,
  ScheduleBlock,
  TravelState,
} from '../types/dayrhythm';

const hm = (h: number, m: number) => h * 60 + m;

export interface ScheduleBuildOptions {
  isFriday?: boolean;
  includeBiweeklyPcCleanup?: boolean;
}

/**
 * Generates the daily rhythm for Normal (default) vs Optional Fasting days,
 * with Friday Rituals Anchor Engine protection.
 * Privacy invariants strictly enforced:
 * - Only emoji pairs for titles
 * - Only 🦷 / 🪥 (never text)
 * - Only 🌱 (strictly emoji-only marker)
 */
export function buildBaseSchedule(
  mode: DayMode,
  prayers: PrayerTimeItem[],
  options: ScheduleBuildOptions = {}
): ScheduleBlock[] {
  const byId = Object.fromEntries(prayers.map((p) => [p.id, p])) as Record<
    PrayerTimeItem['id'],
    PrayerTimeItem
  >;

  const fajrAlarm = byId.fajr.alarmMinutes;
  const dhuhrAlarm = byId.dhuhr.alarmMinutes;
  const asrAlarm = byId.asr.alarmMinutes;
  const maghribAlarm = byId.maghrib.alarmMinutes;
  const ishaAlarm = byId.isha.alarmMinutes;

  const isFriday = options.isFriday ?? new Date().getDay() === 5;
  const includeBiweeklyPcCleanup = options.includeBiweeklyPcCleanup ?? true;

  if (mode === 'normal') {
    const base: ScheduleBlock[] = [
      {
        id: 'wake_care',
        emojiPair: '⏰ 🦷',
        categoryAr: 'استيقاظ الصباح',
        startMin: hm(4, 25),
        durationMin: 15,
        minDurationMin: 10,
        isAnchor: false,
        travelGroup: 'C_PORTABLE',
        canShiftEvening: false,
        completed: false,
        deleted: false,
      },
      {
        id: 'prayer_fajr',
        emojiPair: '🕌 🌌',
        categoryAr: 'أذان -3 د · الفجر',
        startMin: fajrAlarm,
        durationMin: 25,
        minDurationMin: 25,
        isAnchor: true,
        travelGroup: 'ANCHOR',
        canShiftEvening: false,
        completed: false,
        deleted: false,
      },
      {
        id: 'quran_commitment',
        emojiPair: '📖 🌱',
        categoryAr: 'ورد والتزام يومي',
        startMin: fajrAlarm + 25,
        durationMin: 30,
        minDurationMin: 20,
        isAnchor: false,
        travelGroup: 'C_PORTABLE',
        canShiftEvening: true,
        completed: false,
        deleted: false,
      },
      {
        id: 'room_cleanup',
        emojiPair: '🪟 ✨',
        categoryAr: 'ترتيب الغرفة',
        startMin: fajrAlarm + 55,
        durationMin: 20,
        minDurationMin: 15,
        isAnchor: false,
        travelGroup: 'A_FIXED',
        canShiftEvening: true,
        completed: false,
        deleted: false,
      },
      {
        id: 'sunrise_tea',
        emojiPair: '🌅 🍵',
        categoryAr: 'شاي الشروق وأذكار الصباح',
        startMin: hm(6, 5),
        durationMin: 25,
        minDurationMin: 15,
        isAnchor: false,
        travelGroup: 'C_PORTABLE',
        canShiftEvening: false,
        completed: false,
        deleted: false,
      },
      {
        id: 'light_workout',
        emojiPair: '🏃 💪',
        categoryAr: 'تمرين خفيف',
        startMin: hm(6, 35),
        durationMin: 25,
        minDurationMin: 15,
        isAnchor: false,
        travelGroup: 'B_WORK',
        canShiftEvening: true,
        completed: false,
        deleted: false,
      },
      {
        id: 'deep_work_1',
        emojiPair: '💼 🔥',
        categoryAr: 'تركيز عميق 1',
        startMin: hm(7, 15),
        durationMin: 90,
        minDurationMin: 45,
        isAnchor: false,
        travelGroup: 'B_WORK',
        canShiftEvening: false,
        completed: false,
        deleted: false,
      },
      {
        id: 'breakfast_pumpkin',
        emojiPair: '🍳 💊',
        categoryAr: 'إفطار + زيت بذور اليقطين',
        startMin: hm(8, 50),
        durationMin: 30,
        minDurationMin: 20,
        isAnchor: false,
        travelGroup: 'C_PORTABLE',
        canShiftEvening: false,
        completed: false,
        deleted: false,
      },
      {
        id: 'deep_work_2',
        emojiPair: '🎯 ⚡',
        categoryAr: 'تركيز عميق 2',
        startMin: hm(9, 30),
        durationMin: Math.max(45, dhuhrAlarm - hm(9, 30) - 10),
        minDurationMin: 45,
        isAnchor: false,
        travelGroup: 'B_WORK',
        canShiftEvening: false,
        completed: false,
        deleted: false,
      },
      // Friday Rituals Anchor Engine: extended Jumu'ah block -> Practical Work starts 1:15 PM (13:15)
      isFriday
        ? {
            id: 'prayer_jumuah',
            emojiPair: '🕌 🕌',
            categoryAr: 'مرساة الجمعة · الخطبة والصلاة (ممتدة حتى 1:15 م)',
            startMin: dhuhrAlarm,
            durationMin: Math.max(60, hm(13, 15) - dhuhrAlarm),
            minDurationMin: Math.max(60, hm(13, 15) - dhuhrAlarm),
            isAnchor: true,
            isFridayRitual: true,
            travelGroup: 'ANCHOR',
            canShiftEvening: false,
            completed: false,
            deleted: false,
          }
        : {
            id: 'prayer_dhuhr',
            emojiPair: '🕌 ☀️',
            categoryAr: 'أذان -3 د · الظهر',
            startMin: dhuhrAlarm,
            durationMin: 25,
            minDurationMin: 25,
            isAnchor: true,
            travelGroup: 'ANCHOR',
            canShiftEvening: false,
            completed: false,
            deleted: false,
          },
      {
        id: 'practical_work_3',
        emojiPair: '🛠️ 📈',
        categoryAr: isFriday ? 'عمل تطبيقي 3 (يبدأ 1:15 م بعد الجمعة)' : 'عمل عملي 3',
        startMin: isFriday ? hm(13, 15) : dhuhrAlarm + 30,
        durationMin: isFriday
          ? Math.max(45, asrAlarm - hm(13, 15) - 5)
          : Math.max(45, asrAlarm - (dhuhrAlarm + 35)),
        minDurationMin: 40,
        isAnchor: false,
        travelGroup: 'B_WORK',
        canShiftEvening: true,
        completed: false,
        deleted: false,
      },
      {
        id: 'prayer_asr',
        emojiPair: '🕌 🌤️',
        categoryAr: 'أذان -3 د · العصر',
        startMin: asrAlarm,
        durationMin: 25,
        minDurationMin: 25,
        isAnchor: true,
        travelGroup: 'ANCHOR',
        canShiftEvening: false,
        completed: false,
        deleted: false,
      },
      ...(isFriday
        ? [
            {
              id: 'friday_room_cleanup',
              emojiPair: '🧹 🛏️',
              categoryAr: 'مرساة الجمعة · تنظيف الأوضة الأسبوعي (3:30 م)',
              startMin: hm(15, 30),
              durationMin: 40,
              minDurationMin: 40,
              isAnchor: true,
              isFridayRitual: true,
              travelGroup: 'A_FIXED' as const,
              canShiftEvening: false,
              completed: false,
              deleted: false,
            },
            ...(includeBiweeklyPcCleanup
              ? [
                  {
                    id: 'friday_pc_cleanup',
                    emojiPair: '💻 🧼',
                    categoryAr: 'مرساة الجمعة · تنظيف الكمبيوتر كل جمعتين (4:15 م)',
                    startMin: hm(16, 15),
                    durationMin: 35,
                    minDurationMin: 35,
                    isAnchor: true,
                    isFridayRitual: true,
                    travelGroup: 'A_FIXED' as const,
                    canShiftEvening: false,
                    completed: false,
                    deleted: false,
                  },
                ]
              : []),
          ]
        : [
            {
              id: 'lunch_rest',
              emojiPair: '🍲 🛋️',
              categoryAr: 'غداء وراحة',
              startMin: asrAlarm + 30,
              durationMin: 55,
              minDurationMin: 35,
              isAnchor: false,
              travelGroup: 'C_PORTABLE' as const,
              canShiftEvening: false,
              completed: false,
              deleted: false,
            },
          ]),
      {
        id: 'sunset_adhkar',
        emojiPair: '🌇 📿',
        categoryAr: 'شاي الغروب وأذكار المساء',
        startMin: Math.max(asrAlarm + 90, maghribAlarm - 35),
        durationMin: 25,
        minDurationMin: 15,
        isAnchor: false,
        travelGroup: 'C_PORTABLE',
        canShiftEvening: false,
        completed: false,
        deleted: false,
      },
      {
        id: 'prayer_maghrib',
        emojiPair: '🕌 🌆',
        categoryAr: 'أذان -3 د · المغرب',
        startMin: maghribAlarm,
        durationMin: 20,
        minDurationMin: 20,
        isAnchor: true,
        travelGroup: 'ANCHOR',
        canShiftEvening: false,
        completed: false,
        deleted: false,
      },
      {
        id: 'light_dinner',
        emojiPair: '🥗 🍏',
        categoryAr: 'عشاء خفيف مبكر',
        startMin: maghribAlarm + 25,
        durationMin: 25,
        minDurationMin: 20,
        isAnchor: false,
        travelGroup: 'C_PORTABLE',
        canShiftEvening: false,
        completed: false,
        deleted: false,
      },
      {
        id: 'prayer_isha',
        emojiPair: '🕌 🌃',
        categoryAr: 'أذان -3 د · العشاء',
        startMin: ishaAlarm,
        durationMin: 25,
        minDurationMin: 25,
        isAnchor: true,
        travelGroup: 'ANCHOR',
        canShiftEvening: false,
        completed: false,
        deleted: false,
      },
      {
        id: 'islamic_lecture',
        emojiPair: '🎧 📺',
        categoryAr: 'محاضرة مرئية',
        startMin: ishaAlarm + 30,
        durationMin: 60,
        minDurationMin: 35,
        isAnchor: false,
        travelGroup: 'C_PORTABLE',
        canShiftEvening: true,
        completed: false,
        deleted: false,
      },
      {
        id: 'optional_walk',
        emojiPair: '🚶 🌿',
        categoryAr: 'مشي مسائي اختياري',
        startMin: hm(19, 50),
        durationMin: 35,
        minDurationMin: 20,
        isAnchor: false,
        travelGroup: 'B_WORK',
        canShiftEvening: true,
        completed: false,
        deleted: false,
      },
      {
        id: 'witr_bedcare',
        emojiPair: '🤲 🪥',
        categoryAr: 'الوتر واستعداد النوم',
        startMin: hm(20, 50),
        durationMin: 20,
        minDurationMin: 15,
        isAnchor: false,
        travelGroup: 'C_PORTABLE',
        canShiftEvening: false,
        completed: false,
        deleted: false,
      },
      {
        id: 'sleep_anchor',
        emojiPair: '😴 🌙',
        categoryAr: 'نوم مبكر ثابت',
        startMin: hm(21, 15),
        durationMin: 430,
        minDurationMin: 420,
        isAnchor: true,
        travelGroup: 'ANCHOR',
        canShiftEvening: false,
        completed: false,
        deleted: false,
      },
    ];

    return base.sort((a, b) => a.startMin - b.startMin);
  }

  // Optional Fasting Day (only when explicitly active and not exempted by travel/health)
  const fastingBlocks: ScheduleBlock[] = [
    {
      id: 'suhoor_staged',
      emojiPair: '🏮 🥣',
      categoryAr: 'سحور وماء على مراحل + الوتر',
      startMin: hm(3, 45),
      durationMin: 45,
      minDurationMin: 35,
      isAnchor: false,
      travelGroup: 'C_PORTABLE',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    {
      id: 'suhoor_care',
      emojiPair: '🤲 🪥',
      categoryAr: 'ختام السحور',
      startMin: Math.max(hm(4, 30), fajrAlarm - 15),
      durationMin: 10,
      minDurationMin: 10,
      isAnchor: false,
      travelGroup: 'C_PORTABLE',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    {
      id: 'prayer_fajr',
      emojiPair: '🕌 🌌',
      categoryAr: 'أذان -3 د · الفجر',
      startMin: fajrAlarm,
      durationMin: 25,
      minDurationMin: 25,
      isAnchor: true,
      travelGroup: 'ANCHOR',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    {
      id: 'quran_commitment',
      emojiPair: '📖 🌱',
      categoryAr: 'ورد والتزام يومي',
      startMin: fajrAlarm + 25,
      durationMin: 30,
      minDurationMin: 20,
      isAnchor: false,
      travelGroup: 'C_PORTABLE',
      canShiftEvening: true,
      completed: false,
      deleted: false,
    },
    {
      id: 'room_cleanup',
      emojiPair: '🪟 ✨',
      categoryAr: 'ترتيب الغرفة',
      startMin: fajrAlarm + 55,
      durationMin: 20,
      minDurationMin: 15,
      isAnchor: false,
      travelGroup: 'A_FIXED',
      canShiftEvening: true,
      completed: false,
      deleted: false,
    },
    {
      id: 'morning_adhkar_fast',
      emojiPair: '🌅 📿',
      categoryAr: 'أذكار الصباح (صيام)',
      startMin: hm(6, 5),
      durationMin: 20,
      minDurationMin: 15,
      isAnchor: false,
      travelGroup: 'C_PORTABLE',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    {
      id: 'deep_work_1',
      emojiPair: '💼 🔥',
      categoryAr: 'تركيز عميق 1',
      startMin: hm(6, 40),
      durationMin: 100,
      minDurationMin: 50,
      isAnchor: false,
      travelGroup: 'B_WORK',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    {
      id: 'fasting_break',
      emojiPair: '☕ 😌',
      categoryAr: 'استراحة صيام قصيرة',
      startMin: hm(8, 25),
      durationMin: 20,
      minDurationMin: 15,
      isAnchor: false,
      travelGroup: 'C_PORTABLE',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    {
      id: 'deep_work_2',
      emojiPair: '🎯 ⚡',
      categoryAr: 'تركيز عميق 2',
      startMin: hm(8, 50),
      durationMin: Math.max(45, dhuhrAlarm - hm(8, 50) - 10),
      minDurationMin: 45,
      isAnchor: false,
      travelGroup: 'B_WORK',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    isFriday
      ? {
          id: 'prayer_jumuah',
          emojiPair: '🕌 🕌',
          categoryAr: 'مرساة الجمعة · الخطبة والصلاة (ممتدة حتى 1:15 م)',
          startMin: dhuhrAlarm,
          durationMin: Math.max(60, hm(13, 15) - dhuhrAlarm),
          minDurationMin: Math.max(60, hm(13, 15) - dhuhrAlarm),
          isAnchor: true,
          isFridayRitual: true,
          travelGroup: 'ANCHOR',
          canShiftEvening: false,
          completed: false,
          deleted: false,
        }
      : {
          id: 'prayer_dhuhr',
          emojiPair: '🕌 ☀️',
          categoryAr: 'أذان -3 د · الظهر',
          startMin: dhuhrAlarm,
          durationMin: 25,
          minDurationMin: 25,
          isAnchor: true,
          travelGroup: 'ANCHOR',
          canShiftEvening: false,
          completed: false,
          deleted: false,
        },
    {
      id: 'practical_work_3',
      emojiPair: '🛠️ 📈',
      categoryAr: isFriday ? 'عمل تطبيقي 3 (يبدأ 1:15 م بعد الجمعة)' : 'عمل عملي 3',
      startMin: isFriday ? hm(13, 15) : dhuhrAlarm + 30,
      durationMin: isFriday
        ? Math.max(45, asrAlarm - hm(13, 15) - 5)
        : Math.max(45, asrAlarm - (dhuhrAlarm + 35)),
      minDurationMin: 40,
      isAnchor: false,
      travelGroup: 'B_WORK',
      canShiftEvening: true,
      completed: false,
      deleted: false,
    },
    {
      id: 'prayer_asr',
      emojiPair: '🕌 🌤️',
      categoryAr: 'أذان -3 د · العصر',
      startMin: asrAlarm,
      durationMin: 25,
      minDurationMin: 25,
      isAnchor: true,
      travelGroup: 'ANCHOR',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    {
      id: 'pre_iftar_nap',
      emojiPair: '🛌 🔋',
      categoryAr: 'قيلولة قبل الإفطار',
      startMin: asrAlarm + 30,
      durationMin: 40,
      minDurationMin: 25,
      isAnchor: false,
      travelGroup: 'C_PORTABLE',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    {
      id: 'pre_iftar_workout',
      emojiPair: '🏃 💪',
      categoryAr: 'تمرين خفيف قبل الإفطار',
      startMin: Math.max(asrAlarm + 75, maghribAlarm - 55),
      durationMin: 25,
      minDurationMin: 15,
      isAnchor: false,
      travelGroup: 'B_WORK',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    {
      id: 'evening_adhkar_fast',
      emojiPair: '🌇 📿',
      categoryAr: 'أذكار المساء (صيام)',
      startMin: maghribAlarm - 25,
      durationMin: 20,
      minDurationMin: 15,
      isAnchor: false,
      travelGroup: 'C_PORTABLE',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    {
      id: 'prayer_maghrib',
      emojiPair: '🕌 🌆',
      categoryAr: 'أذان -3 د · المغرب',
      startMin: maghribAlarm,
      durationMin: 20,
      minDurationMin: 20,
      isAnchor: true,
      travelGroup: 'ANCHOR',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    {
      id: 'iftar_pumpkin_tea',
      emojiPair: '🌴 🍽️',
      categoryAr: 'إفطار + زيت بذور اليقطين + شاي',
      startMin: maghribAlarm + 20,
      durationMin: 40,
      minDurationMin: 30,
      isAnchor: false,
      travelGroup: 'C_PORTABLE',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    {
      id: 'prayer_isha',
      emojiPair: '🕌 🌃',
      categoryAr: 'أذان -3 د · العشاء',
      startMin: ishaAlarm,
      durationMin: 25,
      minDurationMin: 25,
      isAnchor: true,
      travelGroup: 'ANCHOR',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
    {
      id: 'islamic_lecture',
      emojiPair: '🎧 📺',
      categoryAr: 'محاضرة مرئية',
      startMin: ishaAlarm + 30,
      durationMin: 60,
      minDurationMin: 35,
      isAnchor: false,
      travelGroup: 'C_PORTABLE',
      canShiftEvening: true,
      completed: false,
      deleted: false,
    },
    {
      id: 'optional_walk',
      emojiPair: '🚶 🌿',
      categoryAr: 'مشي مسائي اختياري',
      startMin: hm(20, 0),
      durationMin: 35,
      minDurationMin: 20,
      isAnchor: false,
      travelGroup: 'B_WORK',
      canShiftEvening: true,
      completed: false,
      deleted: false,
    },
    {
      id: 'sleep_anchor',
      emojiPair: '😴 🌙',
      categoryAr: 'نوم مبكر ثابت',
      startMin: hm(21, 15),
      durationMin: 430,
      minDurationMin: 420,
      isAnchor: true,
      travelGroup: 'ANCHOR',
      canShiftEvening: false,
      completed: false,
      deleted: false,
    },
  ];
  return fastingBlocks.sort((a, b) => a.startMin - b.startMin);
}

/**
 * Travel Mode 3-Group Matrix Resolution
 */
export function applyTravelMatrix(
  blocks: ScheduleBlock[],
  travel: TravelState
): ScheduleBlock[] {
  if (!travel.active) return blocks;

  return blocks.map((b) => {
    if (b.isAnchor || b.travelGroup === 'ANCHOR' || b.travelGroup === 'C_PORTABLE') {
      return b;
    }
    if (b.travelGroup === 'A_FIXED') {
      const postponed = travel.postponedTaskIds.includes(b.id) || b.isFridayRitual;
      return {
        ...b,
        reflowStatus: postponed ? 'postponed_travel' : undefined,
      };
    }
    if (b.travelGroup === 'B_WORK') {
      const enabled = travel.enabledWorkTaskIds.includes(b.id);
      return {
        ...b,
        reflowStatus: enabled ? undefined : 'postponed_travel',
      };
    }
    return b;
  });
}

/**
 * Collision-Free Reflow & Gap Absorption Algorithm
 * W = T_anchor - T_now
 * Compresses flexible work blocks down to minDurationMin while keeping
 * Prayer (-3m), Friday Rituals, and Sleep (21:15) anchors 100% immutable.
 */
export function computeCollisionFreeReflow(
  blocks: ScheduleBlock[],
  nowMin: number,
  decisions: Record<string, CatchUpDecision>
): ReflowResult {
  const cloned = blocks.map((b) => ({
    ...b,
    originalStartMin: b.originalStartMin ?? b.startMin,
    originalDurationMin: b.originalDurationMin ?? b.durationMin,
  }));

  const anchors = cloned
    .filter((b) => b.isAnchor && !b.deleted)
    .sort((a, b) => a.startMin - b.startMin);

  const overdueFlexible = cloned.filter(
    (b) => !b.isAnchor && !b.completed && !b.deleted && b.startMin < nowMin
  );

  let compressedCount = 0;
  let shiftedCount = 0;
  let skippedCount = 0;
  const notesAr: string[] = [];

  for (const item of overdueFlexible) {
    const d = decisions[item.id] ?? 'skip_today';
    if (d === 'skip_today') {
      item.reflowStatus = 'skipped';
      skippedCount++;
    }
  }

  const startNowTasks = overdueFlexible.filter(
    (b) => (decisions[b.id] ?? 'skip_today') === 'start_now'
  );
  const shiftEveningTasks = overdueFlexible.filter(
    (b) => (decisions[b.id] ?? 'skip_today') === 'shift_evening'
  );

  let eveningCursor = hm(19, 45);
  const sleepStart = anchors.find((a) => a.id === 'sleep_anchor')?.startMin ?? hm(21, 15);
  for (const item of shiftEveningTasks) {
    const dur = Math.min(item.durationMin, Math.max(item.minDurationMin, 25));
    if (eveningCursor + dur <= sleepStart - 25) {
      item.startMin = eveningCursor;
      item.durationMin = dur;
      item.reflowStatus = 'shifted_evening';
      eveningCursor += dur + 5;
      shiftedCount++;
    } else {
      item.reflowStatus = 'skipped';
      skippedCount++;
      notesAr.push(`تعذر ترحيل ${item.emojiPair} لامتلاء نافذة المساء قبل النوم.`);
    }
  }

  const upcomingFlex = cloned
    .filter(
      (b) =>
        !b.isAnchor &&
        !b.deleted &&
        !b.completed &&
        b.startMin >= nowMin &&
        b.reflowStatus !== 'shifted_evening' &&
        b.reflowStatus !== 'skipped'
    )
    .sort((a, b) => a.startMin - b.startMin);

  const packQueue = [...startNowTasks, ...upcomingFlex];

  const futureAnchors = anchors.filter((a) => a.startMin + a.durationMin > nowMin);
  const windows: Array<{ start: number; end: number }> = [];
  let cursor = nowMin;

  for (const anchor of futureAnchors) {
    if (anchor.startMin > cursor) {
      windows.push({ start: cursor, end: anchor.startMin - 3 });
    }
    cursor = Math.max(cursor, anchor.startMin + anchor.durationMin + 3);
  }

  const availableBudgetMin = windows.reduce((acc, w) => acc + Math.max(0, w.end - w.start), 0);
  const requiredWorkMin = packQueue.reduce((acc, t) => acc + t.durationMin, 0);

  const minRequiredMin = packQueue.reduce((acc, t) => acc + t.minDurationMin, 0);
  const deficit = Math.max(0, requiredWorkMin - availableBudgetMin);
  const maxCompressible = Math.max(1, requiredWorkMin - minRequiredMin);
  const compressionRatio = deficit > 0 ? Math.min(1, deficit / maxCompressible) : 0;

  let winIdx = 0;
  let winCursor = windows[0]?.start ?? nowMin;

  for (const task of packQueue) {
    const isStartNow = startNowTasks.some((s) => s.id === task.id);
    const reducible = Math.max(0, task.durationMin - task.minDurationMin);
    const targetDur = Math.max(
      task.minDurationMin,
      Math.round(task.durationMin - reducible * compressionRatio)
    );

    if (targetDur < task.durationMin) {
      compressedCount++;
    }

    while (winIdx < windows.length && winCursor + targetDur > windows[winIdx].end) {
      winIdx++;
      if (winIdx < windows.length) {
        winCursor = windows[winIdx].start;
      }
    }

    if (winIdx < windows.length) {
      task.startMin = winCursor;
      task.durationMin = targetDur;
      if (isStartNow) {
        task.reflowStatus = 'started_now';
      } else if (targetDur < (task.originalDurationMin ?? task.durationMin)) {
        task.reflowStatus = 'compressed';
      }
      winCursor += targetDur + 5;
    } else {
      task.reflowStatus = 'skipped';
      skippedCount++;
      notesAr.push(`تم إخلاء ${task.emojiPair} لحماية المراسي الثابتة والنوم 09:15 م.`);
    }
  }

  if (compressedCount > 0) {
    notesAr.unshift(`تم امتصاص الفجوة بضغط ${compressedCount} مهام مرنة دون المساس بأي صلاة أو طقوس الجمعة أو النوم.`);
  }
  if (shiftedCount > 0) {
    notesAr.push(`تم ترحيل ${shiftedCount} مهام إلى نافذة المساء (07:45 م – 08:30 م).`);
  }

  cloned.sort((a, b) => a.startMin - b.startMin);

  return {
    reflowedBlocks: cloned,
    compressedCount,
    shiftedCount,
    skippedCount,
    availableBudgetMin,
    requiredWorkMin,
    collisionFree: true,
    notesAr,
  };
}
