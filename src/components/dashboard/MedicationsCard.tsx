import React, { Suspense, lazy } from 'react';
import { Plus, ChevronDown, ChevronUp, BarChart3, Pill } from 'lucide-react';
import { ErrorBoundary } from '../ErrorBoundary';
import { ChartLoadingFallback } from './DashboardShared';
import { MedicationAddForm } from './MedicationAddForm';
import { MedicationItemCard } from './MedicationItemCard';
const MedicationConsumptionChart = lazy(() => import('../MedicationConsumptionChart').then((m) => ({ default: m.MedicationConsumptionChart })));
import type { DashboardController } from './useDashboardController';

export const MedicationsCard: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    medications, todayCairoIso, cardSurface, showMedChart, setShowMedChart, showAddMedForm, setShowAddMedForm, setShowMedAdvanced, medAdherenceSummary,
  } = d;
  return (
    <>
          {/* 2. Medications & Supplements (Clean Dedicated Card right below Water) */}
          <ErrorBoundary sectionTitle="العلاجات والمكملات" compact>
          <section className={`rounded-2xl border p-4 space-y-3 ${cardSurface}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.07]">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Pill className="w-4 h-4 text-[#7FFFD4]" />
                  <span>العلاجات والمكملات</span>
                </h2>
                {medications.length > 0 && (
                  <span className="font-mono-tabular text-xs text-zinc-400">
                    <span
                      className={
                        medAdherenceSummary.takenTodayCount >= medAdherenceSummary.dueTodayCount &&
                        medAdherenceSummary.dueTodayCount > 0
                          ? 'text-[#4ADE80] font-bold'
                          : 'text-amber-300 font-semibold'
                      }
                    >
                      {medAdherenceSummary.takenTodayCount}/{medAdherenceSummary.dueTodayCount}
                    </span>
                    <span> · التزام {medAdherenceSummary.adherencePct}%</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMedForm((v) => !v);
                    setShowMedAdvanced(false);
                  }}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-white/[0.1] bg-white/[0.02] text-xs font-medium text-zinc-200 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة</span>
                </button>
              </div>
            </div>

{showAddMedForm && <MedicationAddForm d={d} />}
            {medications.length === 0 ? (
              <div className="py-4 text-center text-xs text-zinc-500">
                لا توجد علاجات أو مكملات مضافة بعد.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
<MedicationItemCard d={d} />
</div>
)}
            {/* On-Demand 14-Day Consumption & Refill Forecast Analytics */}
            {medications.length > 0 && (
              <div className="pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowMedChart((v) => !v)}
                  className="text-[11px] text-zinc-400 hover:text-[#7FFFD4] flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>تحليل 14 يوم وتوقع الشراء</span>
                  {showMedChart ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
                {showMedChart && (
                  <Suspense fallback={<ChartLoadingFallback />}>
                    <MedicationConsumptionChart
                      medications={medications}
                      todayCairoIso={todayCairoIso}
                    />
                  </Suspense>
                )}
              </div>
            )}
          </section>
          </ErrorBoundary>
    </>
  );
};
