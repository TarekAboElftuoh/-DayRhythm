import React from 'react';
import { useDashboardController } from './dashboard/useDashboardController';
import type { DashboardViewProps } from './dashboard/types';
import { ContextBar } from './dashboard/ContextBar';
import { QuickModesStrip } from './dashboard/QuickModesStrip';
import { PriorityAlertsStrip } from './dashboard/PriorityAlertsStrip';
import { LowStockAlertBanner } from './dashboard/LowStockAlertBanner';
import { FocalHeroCard } from './dashboard/FocalHeroCard';
import { ScheduleAndTasksCard } from './dashboard/ScheduleAndTasksCard';
import { HabitsSection } from './dashboard/HabitsSection';
import { CreativeAndGmailSection } from './dashboard/CreativeAndGmailSection';
import { HydrationCard } from './dashboard/HydrationCard';
import { MedicationsCard } from './dashboard/MedicationsCard';
import { SleepAndWeeklyReportCard } from './dashboard/SleepAndWeeklyReportCard';
import { CreateEventModal } from './dashboard/CreateEventModal';
import { ConfirmActionModals } from './dashboard/ConfirmActionModals';
import { DeleteMedModal } from './dashboard/DeleteMedModal';
import { HabitFormModal } from './dashboard/HabitFormModal';

export const DashboardView: React.FC<DashboardViewProps> = (props) => {
  const d = useDashboardController(props);

  return (
    <div className="mx-auto max-w-[1380px] px-3.5 sm:px-6 py-4 sm:py-6 pb-24 md:pb-8 space-y-4 overflow-x-hidden text-sm md:text-[15px]">
      <ContextBar d={d} />
      <QuickModesStrip d={d} />
      <PriorityAlertsStrip d={d} />
      <LowStockAlertBanner d={d} />
      <FocalHeroCard d={d} />

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        <div className="md:col-span-7 space-y-4">
          <ScheduleAndTasksCard d={d} />
          <HabitsSection d={d} />
          <CreativeAndGmailSection d={d} />
        </div>
        <div className="md:col-span-5 space-y-4">
          <HydrationCard d={d} />
          <MedicationsCard d={d} />
          <SleepAndWeeklyReportCard d={d} />
        </div>
      </div>

      <CreateEventModal d={d} />
      <ConfirmActionModals d={d} />
      <DeleteMedModal d={d} />
      <HabitFormModal d={d} />
    </div>
  );
};
