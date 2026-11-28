import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Plane,
  MapPin,
  Droplets,
  Sun,
  Calendar,
  CheckSquare,
  Pill,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Clock,
} from 'lucide-react';
import { Drawer } from 'vaul';
import {
  GeoLocation,
  MedicationItem,
  ScheduleBlock,
  TravelDeferrableCategory,
  TravelDurationMode,
  TravelState,
} from '../types/dayrhythm';
import { HOME_LOCATION } from '../engines/prayerEngine';

import { CATEGORY_ITEMS, DURATION_CHIPS, addDaysIso, normalizeDurationMode, useIsMobileViewport, type TravelModeModalProps } from './travel/constants';
import { TravelSections } from './travel/TravelSections';

export const TravelModeModal: React.FC<TravelModeModalProps> = ({
  isOpen,
  onClose,
  travelState,
  medications = [],
  currentLocation,
  adhanLeadMinutes = 0,
  todayIso,
  onApplyTravel,
  onDisableTravel,
}) => {
  const isMobile = useIsMobileViewport();
  const resolvedTodayIso = useMemo(
    () => todayIso || new Date().toISOString().slice(0, 10),
    [todayIso]
  );

  const [durationMode, setDurationMode] = useState<TravelDurationMode>(() =>
    normalizeDurationMode(travelState.durationMode)
  );
  const [customDate, setCustomDate] = useState<string>(
    travelState.returnDate || addDaysIso(resolvedTodayIso, 3)
  );
  const [deferredCategories, setDeferredCategories] = useState<TravelDeferrableCategory[]>(
    travelState.deferredCategories ?? []
  );
  const [deferredMedIds, setDeferredMedIds] = useState<string[]>(
    travelState.deferredMedIds ?? []
  );

  useEffect(() => {
    if (!isOpen) return;
    setDurationMode(normalizeDurationMode(travelState.durationMode));
    setCustomDate(travelState.returnDate || addDaysIso(resolvedTodayIso, 3));
    setDeferredCategories(travelState.deferredCategories ?? []);
    setDeferredMedIds(travelState.deferredMedIds ?? []);
  }, [isOpen, travelState, resolvedTodayIso]);

  const activeLoc = currentLocation || travelState.location || HOME_LOCATION;

  const computedReturnDate = (() => {
    if (durationMode === '1d') return addDaysIso(resolvedTodayIso, 1);
    if (durationMode === '2d') return addDaysIso(resolvedTodayIso, 2);
    if (durationMode === '7d') return addDaysIso(resolvedTodayIso, 7);
    if (durationMode === '14d') return addDaysIso(resolvedTodayIso, 14);
    if (durationMode === 'custom_date') return customDate || addDaysIso(resolvedTodayIso, 1);
    return undefined;
  })();

  const toggleCategory = (cat: TravelDeferrableCategory) => {
    setDeferredCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleMed = (medId: string) => {
    setDeferredMedIds((prev) =>
      prev.includes(medId) ? prev.filter((id) => id !== medId) : [...prev, medId]
    );
  };

  const activeCategories = CATEGORY_ITEMS.filter((c) => !deferredCategories.includes(c.id));
  const pausedCategories = CATEGORY_ITEMS.filter((c) => deferredCategories.includes(c.id));

  const activeMeds = medications.filter((m) => !deferredMedIds.includes(m.id));
  const pausedMeds = medications.filter((m) => deferredMedIds.includes(m.id));

  const totalDeferredCount = pausedCategories.length + pausedMeds.length;

  const handleConfirm = () => {
    onApplyTravel({
      ...travelState,
      active: true,
      location: activeLoc,
      durationMode,
      returnDate: computedReturnDate,
      deferredCategories,
      deferredMedIds,
      updatedAt: Date.now(),
    });
    onClose();
  };

  const handleReturnNow = () => {
    onDisableTravel();
    onClose();
  };

  const renderBody = (headerTitle: React.ReactNode) => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
              travelState.active
                ? 'border-[#7FFFD4]/45 bg-[#7FFFD4]/15 text-[#7FFFD4]'
                : 'border-white/[0.06] bg-[var(--bg-surface)] text-zinc-300'
            }`}
          >
            <Plane className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            {headerTitle}
            <p className="text-xs text-zinc-400 mt-0.5">
              {travelState.active
                ? 'مفعّل حالياً — اختر ما يستمر وما يؤجّل مؤقتاً'
                : 'أدِر تنبيهاتك وعلاجاتك بمرونة أثناء السفر'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer shrink-0"
          aria-label="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* One-Tap Return Banner when active */}
      {travelState.active && (
        <div className="mt-4 rounded-2xl border border-[#7FFFD4]/30 bg-[#7FFFD4]/[0.07] p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs space-y-0.5">
            <div className="font-semibold text-[#7FFFD4]">أنت الآن في وضع السفر</div>
            <div className="text-zinc-300 font-mono-tabular">
              {travelState.returnDate
                ? `ينتهي تلقائياً بتاريخ ${travelState.returnDate}`
                : 'مفتوح حتى تضغط رجعت من السفر'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleReturnNow}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#4ADE80] text-black text-xs font-bold hover:bg-[#3ccf71] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>رجعت من السفر</span>
          </button>
        </div>
      )}

      {/* GPS Auto Prayer Sync Info (no preset cities, no -3m text) */}
      <div className="mt-4 rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 text-zinc-300">
          <MapPin className="w-4 h-4 text-[#7FFFD4] shrink-0" />
          <span>
            الموقع الحالي:{' '}
            <strong className="text-white font-semibold">{activeLoc.nameAr}</strong>
          </span>
        </span>
        <span className="font-mono-tabular text-[11px] text-zinc-400">
          {adhanLeadMinutes > 0
            ? `مواقيت GPS · تنبيه -${adhanLeadMinutes} د`
            : 'مواقيت GPS دقيقة'}
        </span>
      </div>

      <TravelSections
        durationMode={durationMode}
        setDurationMode={setDurationMode}
        customDate={customDate}
        setCustomDate={setCustomDate}
        resolvedTodayIso={resolvedTodayIso}
        deferredCategories={deferredCategories}
        toggleCategory={toggleCategory}
        medications={medications}
        deferredMedIds={deferredMedIds}
        toggleMed={toggleMed}
      />
      {/* Footer CTA */}
      <div className="mt-6 pt-4 border-t border-white/[0.06] flex flex-wrap items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] text-xs font-medium text-zinc-300 hover:bg-white/[0.06] cursor-pointer transition-colors"
        >
          إلغاء
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="min-h-[44px] px-6 py-2 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] transition-colors cursor-pointer"
        >
          {travelState.active ? 'حفظ التعديلات' : 'تفعيل وضع السفر'}
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        direction="bottom"
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md" />
          <Drawer.Content
            dir="rtl"
            aria-describedby={undefined}
            aria-label="وضع السفر"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-x border-white/[0.08] bg-[var(--bg-card)] text-zinc-100 shadow-2xl outline-none"
          >
            <div className="pt-3 pb-1 flex justify-center shrink-0">
              <Drawer.Handle className="h-1.5 w-11 rounded-full bg-white/20" />
            </div>
            <div className="overflow-y-auto px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {renderBody(
                <Drawer.Title className="text-base font-bold text-white">وضع السفر</Drawer.Title>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  if (!isOpen) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-label="وضع السفر"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-5 text-zinc-100 shadow-2xl">
        {renderBody(<h2 className="text-lg font-bold text-white">وضع السفر</h2>)}
      </div>
    </div>
  );
};


