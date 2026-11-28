import type { SeasonalSleepGuidance, SeasonalSleepPhase } from '../../types/dayrhythm';
import { formatMinutes12h } from '../prayerEngine';
import { formatDurationAr, wrap1440 } from './constants';

export function buildSeasonalSleepGuidance(params: {
  coreNightSleepMin: number;
  bedtimeMin: number;
  wakeMin: number;
  maghrib: number;
  targetSleepMin: number;
  availableNightMin: number;
  solvedMode: SeasonalSleepGuidance['mode'];
  qailulahStartMin: number | null;
  qailulahDurationMin: number;
  postFajrStartMin: number | null;
  postFajrEndMin: number | null;
  postFajrDurationMin: number;
}): SeasonalSleepGuidance {
  const {
    coreNightSleepMin,
    bedtimeMin,
    wakeMin,
    maghrib,
    targetSleepMin,
    availableNightMin,
    solvedMode,
    qailulahStartMin,
    qailulahDurationMin,
    postFajrStartMin,
    postFajrEndMin,
    postFajrDurationMin,
  } = params;

  const completedCycles = Math.max(2, Math.floor(coreNightSleepMin / 90));
  const caffeineCutoffMin = wrap1440(bedtimeMin - 8 * 60);
  const maxNightWindowMin = availableNightMin;
  const seasonalPhase: SeasonalSleepPhase =
    maxNightWindowMin < 360
      ? 'short_summer_night'
      : maxNightWindowMin < targetSleepMin
        ? 'transitional_tight'
        : maxNightWindowMin >= targetSleepMin + 90
          ? 'abundant_winter'
          : 'balanced_equinox';

  const phaseLabelMap: Record<SeasonalSleepPhase, string> = {
    abundant_winter: 'ليل شتوي طويل ومريح',
    balanced_equinox: 'توازن فصلي مثالي',
    transitional_tight: 'ليل انتقالي + قيلولة تعويضية',
    short_summer_night: 'بروتوكول الليل القصير',
  };

  const windDownStartMin =
    seasonalPhase === 'short_summer_night' || seasonalPhase === 'transitional_tight'
      ? Math.max(wrap1440(maghrib + 15), wrap1440(bedtimeMin - 45))
      : wrap1440(bedtimeMin - 35);

  const nsdrWindowAr =
    qailulahStartMin !== null
      ? `قيلولة تعويضية ${qailulahDurationMin} د الساعة ${formatMinutes12h(qailulahStartMin)} (بعد الظهر وبعيداً عن الشروق والغروب)`
      : 'صفر نوم نهاري — نوم ليلي كامل مع ضوء الشروق الصباحي';

  const protocolSummaryAr =
    solvedMode === 'short_night'
      ? `نوم ليلي (${formatMinutes12h(bedtimeMin)} – ${formatMinutes12h(wakeMin)})${postFajrDurationMin > 0 ? ` + تعويض بعد الفجر (${postFajrDurationMin} د حتى الشروق)` : ''} + قيلولة ${qailulahDurationMin} د بعد الظهر.`
      : solvedMode === 'medium_night'
        ? `نوم ليلي (${formatMinutes12h(bedtimeMin)} – ${formatMinutes12h(wakeMin)} · ${formatDurationAr(coreNightSleepMin)}) + قيلولة ${qailulahDurationMin} د الساعة ${formatMinutes12h(qailulahStartMin!)}.`
        : seasonalPhase === 'abundant_winter'
          ? `متّسع ليلي مريح (${formatDurationAr(maxNightWindowMin)} متاح) يكفي ${completedCycles} دورات نوم كاملة (${formatDurationAr(coreNightSleepMin)}) بدون قيلولة.`
          : `إيقاع متوازن (${completedCycles} دورات · ${formatDurationAr(coreNightSleepMin)}) من ${formatMinutes12h(bedtimeMin)} حتى ${formatMinutes12h(wakeMin)} بدون قيلولة.`;

  return {
    phase: seasonalPhase,
    mode: solvedMode,
    phaseLabelAr: phaseLabelMap[seasonalPhase],
    astronomicalNightMin: maxNightWindowMin,
    completedCycles,
    windDownStartMin,
    caffeineCutoffMin,
    nsdrWindowAr,
    protocolSummaryAr,
    postFajrStartMin,
    postFajrEndMin,
    postFajrDurationMin,
  };
}
