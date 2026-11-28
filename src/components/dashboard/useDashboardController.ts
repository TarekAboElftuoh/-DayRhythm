import { useMemo, useState } from 'react';
import type React from 'react';
import type {
  CreativeActivityPlacement,
  DynamicHabitAnchor,
  DynamicHabitStatus,
  GmailDigestItem,
  GoogleCalendarEventItem,
  MedicationFastingPolicy,
  MedicationItem,
  TaskActionProposal,
} from '../../types/dayrhythm';
import { formatTime24To12h, getDateIsoInTimeZone } from '../../engines/prayerEngine';
import { checkSmartScheduleConflict } from '../../engines/lifeRhythmEngine';
import type { DashboardViewProps } from './types';
import { useMedicationsSummary } from './useMedicationsSummary';
import { useTimelineModel } from './useTimelineModel';
import { useTimelineMoves } from './useTimelineMoves';
import { useHeroAndWater } from './useHeroAndWater';

export function useDashboardController(props: DashboardViewProps) {
  const activeTimeZone = props.activeTimeZone ?? 'Africa/Cairo';
  const todayCairoIso = getDateIsoInTimeZone(activeTimeZone);

  const [showTrash, setShowTrash] = useState(false);
  const [autoPlacedBlockStarts, setAutoPlacedBlockStarts] = useState<Record<string, number>>({});
  const [unplacedLocalBlockIds, setUnplacedLocalBlockIds] = useState<Record<string, boolean>>({});
  const [isSyncingAutoPlace, setIsSyncingAutoPlace] = useState(false);
  const [showSilentInbox, setShowSilentInbox] = useState(false);
  const [confirmCancelSanctuary, setConfirmCancelSanctuary] = useState(false);
  const [showGmailDrawer, setShowGmailDrawer] = useState(false);
  const [showTaskScheduleRow, setShowTaskScheduleRow] = useState(false);
  const [creatingTaskNow, setCreatingTaskNow] = useState(false);
  const [showAllCreative, setShowAllCreative] = useState(false);
  const [showPlannedHabits, setShowPlannedHabits] = useState(false);
  const [habitModalOpen, setHabitModalOpen] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [habitTitle, setHabitTitle] = useState('');
  const [habitStatus, setHabitStatus] = useState<DynamicHabitStatus>('active');
  const [habitAnchor, setHabitAnchor] = useState<DynamicHabitAnchor>('sunrise-light');
  const [habitDurationMin, setHabitDurationMin] = useState<number>(30);
  const [habitDaysOfWeek, setHabitDaysOfWeek] = useState<number[]>([]);
  const [habitSkipOnFasting, setHabitSkipOnFasting] = useState<boolean>(false);
  const [showHydrationSchedule, setShowHydrationSchedule] = useState(false);
  const [meetingPickerOpen, setMeetingPickerOpen] = useState(false);
  const [showWaterChart, setShowWaterChart] = useState(false);
  const [showMedChart, setShowMedChart] = useState(false);
  const [pendingDeleteMed, setPendingDeleteMed] = useState<MedicationItem | null>(null);
  const [deleteMedStep, setDeleteMedStep] = useState<1 | 2>(1);
  const [deleteMedConfirmed, setDeleteMedConfirmed] = useState(false);
  const [showSleepCheckinEdit, setShowSleepCheckinEdit] = useState(false);
  const [scheduleCardMode, setScheduleCardMode] = useState<'schedule' | 'tasks'>('schedule');
  const [confirmHeroCompleteId, setConfirmHeroCompleteId] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<'today' | 'tomorrow' | 'special' | 'done'>('today');
  const [selectedTaskListId, setSelectedTaskListId] = useState<string>('all');
  const [syncLoading, setSyncLoading] = useState(false);
  const [confirmDeleteGoogleEv, setConfirmDeleteGoogleEv] = useState<GoogleCalendarEventItem | null>(null);
  const [pendingTaskConfirmation, setPendingTaskConfirmation] = useState<TaskActionProposal | null>(null);
  const [pendingGmailEventConfirm, setPendingGmailEventConfirm] = useState<GmailDigestItem | null>(null);
  const [pendingCreativeCalendarConfirm, setPendingCreativeCalendarConfirm] = useState<CreativeActivityPlacement | null>(null);
  const [addedGmailIds, setAddedGmailIds] = useState<Record<string, boolean>>({});
  const [newEventModalOpen, setNewEventModalOpen] = useState(false);
  const [newEvTitle, setNewEvTitle] = useState('');
  const [newEvDate, setNewEvDate] = useState(() => getDateIsoInTimeZone(activeTimeZone));
  const [newEvHour12, setNewEvHour12] = useState<number>(4);
  const [newEvMinute, setNewEvMinute] = useState<string>('');
  const [newEvPeriod, setNewEvPeriod] = useState<'AM' | 'PM'>('PM');
  const [newEvDuration, setNewEvDuration] = useState<number>(0);
  const [newEvConfirmStep, setNewEvConfirmStep] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueIso, setNewTaskDueIso] = useState('');
  const [newTaskTime24, setNewTaskTime24] = useState('');
  const [showAddMedForm, setShowAddMedForm] = useState(false);
  const [showMedAdvanced, setShowMedAdvanced] = useState(false);
  const [showEditMedAdvanced, setShowEditMedAdvanced] = useState(false);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [editMedName, setEditMedName] = useState('');
  const [editMedHour12, setEditMedHour12] = useState<number>(8);
  const [editMedMinute, setEditMedMinute] = useState<string>('00');
  const [editMedPeriod, setEditMedPeriod] = useState<'AM' | 'PM'>('AM');
  const [editMedTimes24, setEditMedTimes24] = useState<string[]>([]);
  const [editMedDaysOfWeek, setEditMedDaysOfWeek] = useState<number[]>([]);
  const [editMedFastingPolicy, setEditMedFastingPolicy] = useState<MedicationFastingPolicy>('auto-nearest');
  const [editMedNote, setEditMedNote] = useState('');
  const [editMedCourseEnd, setEditMedCourseEnd] = useState('');
  const [editMedRemainingDoses, setEditMedRemainingDoses] = useState('');
  const [editMedRefillAlertDays, setEditMedRefillAlertDays] = useState<number>(3);
  const [newMedName, setNewMedName] = useState('');
  const [newMedHour12, setNewMedHour12] = useState<number>(8);
  const [newMedMinute, setNewMedMinute] = useState<string>('');
  const [newMedPeriod, setNewMedPeriod] = useState<'AM' | 'PM'>('AM');
  const [newMedTimes24, setNewMedTimes24] = useState<string[]>([]);
  const [newMedDaysOfWeek, setNewMedDaysOfWeek] = useState<number[]>([]);
  const [newMedFastingPolicy, setNewMedFastingPolicy] = useState<MedicationFastingPolicy>('auto-nearest');
  const [newMedNote, setNewMedNote] = useState('');
  const [newMedCourseEnd, setNewMedCourseEnd] = useState('');
  const [newMedRemainingDoses, setNewMedRemainingDoses] = useState('');
  const [newMedRefillAlertDays, setNewMedRefillAlertDays] = useState<number>(3);
  const [newMedSyncCalendar, setNewMedSyncCalendar] = useState(true);
  const [editingStockMedId, setEditingStockMedId] = useState<string | null>(null);
  const [editStockDosesInput, setEditStockDosesInput] = useState<string>('');
  const [editStockAlertDays, setEditStockAlertDays] = useState<number>(3);
  const [purchaseMedId, setPurchaseMedId] = useState<string | null>(null);
  const [purchaseAddDoses, setPurchaseAddDoses] = useState<string>('30');
  const [purchaseMode, setPurchaseMode] = useState<'add' | 'set'>('add');
  const [purchaseAlertDays, setPurchaseAlertDays] = useState<number>(3);

  const medSummary = useMedicationsSummary({
    medications: props.medications, prayers: props.prayers, dailyRhythmPlan: props.dailyRhythmPlan,
    todayCairoIso, activeTimeZone,
  });

  const openPurchaseRestockForm = (med: MedicationItem) => {
    if (purchaseMedId === med.id) { setPurchaseMedId(null); return; }
    setPurchaseMedId(med.id);
    setPurchaseAddDoses(String(med.totalDoses && med.totalDoses > 0 ? med.totalDoses : 30));
    setPurchaseMode('add');
    setPurchaseAlertDays(med.refillAlertDays ?? 3);
  };

  const timelineModelData = useTimelineModel({
    blocks: props.blocks, prayers: props.prayers, dailyRhythmPlan: props.dailyRhythmPlan,
    lifeProfile: props.lifeProfile, habits: props.habits ?? [], googleTasks: props.googleTasks,
    calendarEvents: props.calendarEvents, todayCairoIso,
    todayWeekday: medSummary.last7CairoDays[medSummary.last7CairoDays.length - 1]?.weekdayNum,
    activeTimeZone, language: props.language, timelineFilter, autoPlacedBlockStarts, unplacedLocalBlockIds,
  });

  const timelineMoves = useTimelineMoves({
    todayCairoIso, calendarConnected: props.calendarConnected, setIsSyncingAutoPlace,
    setAutoPlacedBlockStarts, setUnplacedLocalBlockIds, onUpdateHabit: props.onUpdateHabit,
    onExecuteCalendarActions: props.onExecuteCalendarActions, onExecuteTaskActions: props.onExecuteTaskActions,
  });

  const heroAndWater = useHeroAndWater({
    remainingTodayBlocks: timelineModelData.remainingTodayBlocks,
    finishedTodayBlocks: timelineModelData.finishedTodayBlocks,
    prayers: props.prayers, prayersReady: props.prayersReady, calendarConnected: props.calendarConnected,
    nowMinutes: timelineModelData.nowMinutes, nowSecOfDay: timelineModelData.liveClockParts.nowSecOfDay,
    language: props.language, dailyRhythmPlan: props.dailyRhythmPlan, hydrationToday: props.hydrationToday,
    googleTasks: props.googleTasks, selectedTaskListId,
  });

  const newEventTime24 = useMemo(() => {
    let h24 = newEvHour12 % 12;
    if (newEvPeriod === 'PM') h24 += 12;
    const clampedMin = Math.max(0, Math.min(59, Math.round(Number(newEvMinute) || 0)));
    return `${String(h24).padStart(2, '0')}:${String(clampedMin).padStart(2, '0')}`;
  }, [newEvHour12, newEvMinute, newEvPeriod]);

  const applyTime24To12hPicker = (
    time24: string, setHour12: React.Dispatch<React.SetStateAction<number>>,
    setMinute: React.Dispatch<React.SetStateAction<string>>, setPeriod: React.Dispatch<React.SetStateAction<'AM' | 'PM'>>
  ) => {
    const match = time24.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return;
    const h24 = Number(match[1]); const min = Number(match[2]);
    setPeriod(h24 >= 12 ? 'PM' : 'AM');
    setHour12(h24 % 12 === 0 ? 12 : h24 % 12);
    setMinute(min === 0 ? '' : String(min).padStart(2, '0'));
  };

  const newMedCurrentTime24 = useMemo(() => {
    let h24 = newMedHour12 % 12;
    if (newMedPeriod === 'PM') h24 += 12;
    const clampedMin = Math.max(0, Math.min(59, Math.round(Number(newMedMinute) || 0)));
    return `${String(h24).padStart(2, '0')}:${String(clampedMin).padStart(2, '0')}`;
  }, [newMedHour12, newMedMinute, newMedPeriod]);

  const newEventConflict = useMemo(() => {
    if (!newEventModalOpen) return { hasConflict: false, warnings: [] as string[], suggestedTime24: null, suggestedTime12Ar: null };
    return checkSmartScheduleConflict({
      time24: newEventTime24, durationMinutes: Math.max(0, Math.min(480, Math.round(newEvDuration ?? 0))),
      dateIso: newEvDate, prayers: props.prayers, plan: props.dailyRhythmPlan, profile: props.lifeProfile,
      occupiedBlocks: newEvDate === todayCairoIso ? timelineModelData.activeBlocks : [],
    });
  }, [newEventModalOpen, newEventTime24, newEvDuration, newEvDate, props.prayers, props.dailyRhythmPlan, props.lifeProfile, todayCairoIso, timelineModelData.activeBlocks]);

  const newMedConflict = useMemo(() => {
    if (!showAddMedForm) return { hasConflict: false, warnings: [] as string[], suggestedTime24: null, suggestedTime12Ar: null };
    const timesToCheck = newMedTimes24.length > 0 ? newMedTimes24 : [newMedCurrentTime24];
    const allWarnings: string[] = []; let firstSuggested24: string | null = null; let firstSuggested12: string | null = null;
    for (const t24 of timesToCheck) {
      const res = checkSmartScheduleConflict({
        time24: t24, durationMinutes: 15, daysOfWeek: newMedDaysOfWeek, isOralMedication: true,
        prayers: props.prayers, plan: props.dailyRhythmPlan, profile: props.lifeProfile, occupiedBlocks: timelineModelData.activeBlocks,
      });
      if (res.hasConflict) {
        for (const w of res.warnings) {
          const prefixed = timesToCheck.length > 1 ? `(${formatTime24To12h(t24, props.language)}) ${w}` : w;
          if (!allWarnings.includes(prefixed)) allWarnings.push(prefixed);
        }
        if (!firstSuggested24 && res.suggestedTime24) { firstSuggested24 = res.suggestedTime24; firstSuggested12 = res.suggestedTime12Ar; }
      }
    }
    return { hasConflict: allWarnings.length > 0, warnings: allWarnings, suggestedTime24: firstSuggested24, suggestedTime12Ar: firstSuggested12 };
  }, [showAddMedForm, newMedTimes24, newMedCurrentTime24, newMedDaysOfWeek, props.prayers, props.dailyRhythmPlan, props.lifeProfile, timelineModelData.activeBlocks, props.language]);

  const handleConfirmCreateGoogleEvent = async () => {
    if (!newEvTitle.trim()) return;
    setSyncLoading(true);
    try {
      await props.onExecuteCalendarActions([{
        operation: 'create', calendarId: 'primary', title: newEvTitle.trim(), dateIso: newEvDate,
        startTime24: newEventTime24, durationMinutes: newEvDuration, description: 'تم الإنشاء عبر لوحة إيقاع اليوم | DayRhythm',
      }]);
      setNewEventModalOpen(false); setNewEvConfirmStep(false); setNewEvTitle(''); setNewEvDuration(0);
    } finally { setSyncLoading(false); }
  };

  const handleConfirmDeleteGoogleEvent = async () => {
    if (!confirmDeleteGoogleEv) return;
    setSyncLoading(true);
    try {
      await props.onExecuteCalendarActions([{ operation: 'delete', eventId: confirmDeleteGoogleEv.id, calendarId: confirmDeleteGoogleEv.calendarId ?? 'primary', title: confirmDeleteGoogleEv.summary }]);
      setConfirmDeleteGoogleEv(null);
    } finally { setSyncLoading(false); }
  };

  const handleConfirmTaskMutation = async () => {
    if (!pendingTaskConfirmation) return;
    setSyncLoading(true);
    try {
      await props.onExecuteTaskActions([pendingTaskConfirmation]);
      if (pendingTaskConfirmation.operation === 'create') { setNewTaskTitle(''); setNewTaskDueIso(''); setNewTaskTime24(''); }
      setPendingTaskConfirmation(null);
    } finally { setSyncLoading(false); }
  };

  const handleConfirmAddGmailEvent = async () => {
    if (!pendingGmailEventConfirm) return;
    setSyncLoading(true);
    try {
      await props.onExecuteCalendarActions([pendingGmailEventConfirm.suggestedAction]);
      setAddedGmailIds((prev) => ({ ...prev, [pendingGmailEventConfirm.id]: true }));
      setPendingGmailEventConfirm(null);
    } finally { setSyncLoading(false); }
  };

  const handleConfirmScheduleCreative = async () => {
    if (!pendingCreativeCalendarConfirm) return;
    setSyncLoading(true);
    try { await props.onScheduleCreativeInCalendar(pendingCreativeCalendarConfirm); setPendingCreativeCalendarConfirm(null); } finally { setSyncLoading(false); }
  };

  const cardSurface = 'bg-[var(--bg-card)] border-[var(--border-subtle)] transition-colors duration-200 focus-within:border-[var(--border-active)]';

  return {
    ...props,
    activeTimeZone, todayCairoIso, cardSurface,
    showTrash, setShowTrash, autoPlacedBlockStarts, setAutoPlacedBlockStarts, unplacedLocalBlockIds, setUnplacedLocalBlockIds,
    isSyncingAutoPlace, setIsSyncingAutoPlace, showSilentInbox, setShowSilentInbox, confirmCancelSanctuary, setConfirmCancelSanctuary,
    showGmailDrawer, setShowGmailDrawer, showTaskScheduleRow, setShowTaskScheduleRow, creatingTaskNow, setCreatingTaskNow,
    showAllCreative, setShowAllCreative, showPlannedHabits, setShowPlannedHabits, habitModalOpen, setHabitModalOpen,
    editingHabitId, setEditingHabitId, habitTitle, setHabitTitle, habitStatus, setHabitStatus, habitAnchor, setHabitAnchor,
    habitDurationMin, setHabitDurationMin, habitDaysOfWeek, setHabitDaysOfWeek, habitSkipOnFasting, setHabitSkipOnFasting,
    showHydrationSchedule, setShowHydrationSchedule, meetingPickerOpen, setMeetingPickerOpen, showWaterChart, setShowWaterChart,
    showMedChart, setShowMedChart, pendingDeleteMed, setPendingDeleteMed, deleteMedStep, setDeleteMedStep,
    deleteMedConfirmed, setDeleteMedConfirmed, showSleepCheckinEdit, setShowSleepCheckinEdit, scheduleCardMode, setScheduleCardMode,
    confirmHeroCompleteId, setConfirmHeroCompleteId, timelineFilter, setTimelineFilter, selectedTaskListId, setSelectedTaskListId,
    syncLoading, setSyncLoading, confirmDeleteGoogleEv, setConfirmDeleteGoogleEv, pendingTaskConfirmation, setPendingTaskConfirmation,
    pendingGmailEventConfirm, setPendingGmailEventConfirm, pendingCreativeCalendarConfirm, setPendingCreativeCalendarConfirm,
    addedGmailIds, setAddedGmailIds, newEventModalOpen, setNewEventModalOpen, newEvTitle, setNewEvTitle,
    newEvDate, setNewEvDate, newEvHour12, setNewEvHour12, newEvMinute, setNewEvMinute, newEvPeriod, setNewEvPeriod,
    newEvDuration, setNewEvDuration, newEvConfirmStep, setNewEvConfirmStep, newTaskTitle, setNewTaskTitle,
    newTaskDueIso, setNewTaskDueIso, newTaskTime24, setNewTaskTime24, showAddMedForm, setShowAddMedForm,
    showMedAdvanced, setShowMedAdvanced, showEditMedAdvanced, setShowEditMedAdvanced, editingMedId, setEditingMedId,
    editMedName, setEditMedName, editMedHour12, setEditMedHour12, editMedMinute, setEditMedMinute, editMedPeriod, setEditMedPeriod,
    editMedTimes24, setEditMedTimes24, editMedDaysOfWeek, setEditMedDaysOfWeek, editMedFastingPolicy, setEditMedFastingPolicy,
    editMedNote, setEditMedNote, editMedCourseEnd, setEditMedCourseEnd, editMedRemainingDoses, setEditMedRemainingDoses,
    editMedRefillAlertDays, setEditMedRefillAlertDays, newMedName, setNewMedName, newMedHour12, setNewMedHour12,
    newMedMinute, setNewMedMinute, newMedPeriod, setNewMedPeriod, newMedTimes24, setNewMedTimes24,
    newMedDaysOfWeek, setNewMedDaysOfWeek, newMedFastingPolicy, setNewMedFastingPolicy, newMedNote, setNewMedNote,
    newMedCourseEnd, setNewMedCourseEnd, newMedRemainingDoses, setNewMedRemainingDoses, newMedRefillAlertDays, setNewMedRefillAlertDays,
    newMedSyncCalendar, setNewMedSyncCalendar, editingStockMedId, setEditingStockMedId, editStockDosesInput, setEditStockDosesInput,
    editStockAlertDays, setEditStockAlertDays, purchaseMedId, setPurchaseMedId, purchaseAddDoses, setPurchaseAddDoses,
    purchaseMode, setPurchaseMode, purchaseAlertDays, setPurchaseAlertDays,
    openPurchaseRestockForm, newEventTime24, applyTime24To12hPicker, newMedCurrentTime24, newEventConflict, newMedConflict,
    handleConfirmCreateGoogleEvent, handleConfirmDeleteGoogleEvent, handleConfirmTaskMutation,
    handleConfirmAddGmailEvent, handleConfirmScheduleCreative,
    ...medSummary, ...timelineModelData, ...timelineMoves, ...heroAndWater,
  };
}

export type DashboardController = ReturnType<typeof useDashboardController>;
