import React, { useMemo, useState } from 'react';
import { X, MapPin, Check } from 'lucide-react';
import {
  GeoLocation,
  ScheduleBlock,
  TravelDurationMode,
  TravelState,
} from '../types/dayrhythm';
import {
  HOME_LOCATION,
  PRESET_LOCATIONS,
  calculateEgyptianPrayerTimes,
  formatMinutes12h,
  haversineDistanceKm,
} from '../engines/prayerEngine';

interface TravelModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  travelState: TravelState;
  scheduleBlocks: ScheduleBlock[];
  onApplyTravel: (nextState: TravelState) => void;
  onDisableTravel: () => void;
}

export const TravelModeModal: React.FC<TravelModeModalProps> = ({
  isOpen,
  onClose,
  travelState,
  scheduleBlocks,
  onApplyTravel,
  onDisableTravel,
}) => {
  const [selectedLoc, setSelectedLoc] = useState<GeoLocation>(
    travelState.location.id === HOME_LOCATION.id
      ? PRESET_LOCATIONS[2]
      : travelState.location
  );
  const [durationMode, setDurationMode] = useState<TravelDurationMode>(
    travelState.durationMode
  );
  const [postponedIds, setPostponedIds] = useState<string[]>(
    travelState.postponedTaskIds.length > 0
      ? travelState.postponedTaskIds
      : scheduleBlocks.filter((b) => b.travelGroup === 'A_FIXED').map((b) => b.id)
  );
  const [enabledWorkIds, setEnabledWorkIds] = useState<string[]>(
    travelState.enabledWorkTaskIds.length > 0
      ? travelState.enabledWorkTaskIds
      : scheduleBlocks.filter((b) => b.travelGroup === 'B_WORK').map((b) => b.id)
  );

  const distanceKm = useMemo(
    () => haversineDistanceKm(HOME_LOCATION, selectedLoc),
    [selectedLoc]
  );

  const homePrayers = useMemo(() => calculateEgyptianPrayerTimes(HOME_LOCATION), []);
  const travelPrayers = useMemo(() => calculateEgyptianPrayerTimes(selectedLoc), [selectedLoc]);

  const groupABlocks = useMemo(
    () => scheduleBlocks.filter((b) => b.travelGroup === 'A_FIXED' && !b.deleted),
    [scheduleBlocks]
  );
  const groupBBlocks = useMemo(
    () => scheduleBlocks.filter((b) => b.travelGroup === 'B_WORK' && !b.deleted),
    [scheduleBlocks]
  );
  const groupCBlocks = useMemo(
    () => scheduleBlocks.filter((b) => b.travelGroup === 'C_PORTABLE' && !b.deleted),
    [scheduleBlocks]
  );

  if (!isOpen) return null;

  const togglePostponed = (id: string) => {
    setPostponedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleWork = (id: string) => {
    setEnabledWorkIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    onApplyTravel({
      active: true,
      location: selectedLoc,
      distanceKm,
      durationMode,
      postponedTaskIds: postponedIds,
      enabledWorkTaskIds: enabledWorkIds,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="وضع السفر الذكي"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#0A0D12] p-6 text-zinc-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white">🧳 وضع السفر الذكي</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              إعادة معايرة مواقيت الصلاة (-3 دقائق) وتصنيف المهام حسب قابلية التنقل
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: GPS Auto-Detection & Prayer Delta */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#7FFFD4]" />
              1. الموقع الجغرافي وفارق المواقيت
            </h3>
            <span className="font-mono-tabular text-xs text-[#7FFFD4]">
              {distanceKm} كم من الموقع الأساسي
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_LOCATIONS.filter((l) => l.id !== HOME_LOCATION.id).map((loc) => {
              const active = selectedLoc.id === loc.id;
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => setSelectedLoc(loc)}
                  className={`px-3 py-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                    active
                      ? 'border-[#7FFFD4] bg-[#7FFFD4]/10 text-white'
                      : 'border-white/10 bg-black/50 text-zinc-400 hover:border-white/25'
                  }`}
                >
                  <div className="text-xs font-semibold truncate">{loc.nameAr.split('·')[0].trim()}</div>
                  <div className="font-mono-tabular text-[11px] text-zinc-500 mt-0.5">
                    {haversineDistanceKm(HOME_LOCATION, loc)} km
                  </div>
                </button>
              );
            })}
          </div>

          {/* Prayer Delta Preview */}
          <div className="mt-3 rounded-xl border border-white/10 bg-black/60 p-3.5">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
              <span>مقارنة منبهات الصلاة (-3 د قبل الأذان)</span>
              <span className="font-mono-tabular text-zinc-300">
                {distanceKm > 15 ? 'تحديث تلقائي مفعّل (> 15 كم)' : 'نطاق محلي'}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center">
              {travelPrayers
                .filter((p) => p.isObligatory)
                .map((tp) => {
                  const hp = homePrayers.find((x) => x.id === tp.id)!;
                  const delta = tp.alarmMinutes - hp.alarmMinutes;
                  return (
                    <div key={tp.id} className="rounded-lg bg-white/[0.03] p-2">
                      <div className="text-[11px] text-zinc-400">{tp.nameAr}</div>
                      <div className="font-mono-tabular text-xs font-semibold text-white mt-0.5">
                        {formatMinutes12h(tp.alarmMinutes)}
                      </div>
                      <div
                        className={`font-mono-tabular text-[10px] mt-0.5 ${
                          delta === 0
                            ? 'text-zinc-500'
                            : delta > 0
                              ? 'text-[#7FFFD4]'
                              : 'text-amber-400'
                        }`}
                      >
                        {delta === 0 ? '±0د' : delta > 0 ? `+${delta}د` : `${delta}د`}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Section 2: 3-Group Task Matrix */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-zinc-200 mb-3">
            2. مصفوفة تصنيف المهام الثلاثية
          </h3>

          <div className="space-y-3">
            {/* Group A: Fixed Place */}
            <div className="rounded-xl border border-white/10 bg-black/50 p-3.5">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold text-amber-300">المجموعة أ · مهام مرتبطة بالمكان</span>
                <span className="text-zinc-500">تؤجَّل تلقائياً لتاريخ العودة</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {groupABlocks.map((b) => {
                  const checked = postponedIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => togglePostponed(b.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'border-amber-400/50 bg-amber-400/10 text-amber-200'
                          : 'border-white/10 text-zinc-400'
                      }`}
                    >
                      <span className="w-4 h-4 rounded flex items-center justify-center border border-current">
                        {checked && <Check className="w-3 h-3" />}
                      </span>
                      <span>{b.emojiPair}</span>
                      {(() => {
                        const ep = b.emojiPair.trim();
                        const rawTitle = b.categoryAr.trim();
                        const cleanTitle = rawTitle.startsWith(ep)
                          ? rawTitle.slice(ep.length).trim()
                          : rawTitle;
                        return cleanTitle ? <span className="text-zinc-400">· {cleanTitle}</span> : null;
                      })()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Group B: Work & Workout Toggleable */}
            <div className="rounded-xl border border-white/10 bg-black/50 p-3.5">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold text-[#7FFFD4]">المجموعة ب · العمل واللياقة</span>
                <span className="text-zinc-500">اختر ما يستمر معك في السفر</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {groupBBlocks.map((b) => {
                  const enabled = enabledWorkIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => toggleWork(b.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        enabled
                          ? 'border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-white'
                          : 'border-white/10 text-zinc-500'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{b.emojiPair}</span>
                        {(() => {
                          const ep = b.emojiPair.trim();
                          const rawTitle = b.categoryAr.trim();
                          const cleanTitle = rawTitle.startsWith(ep)
                            ? rawTitle.slice(ep.length).trim()
                            : rawTitle;
                          return cleanTitle ? <span>{cleanTitle}</span> : null;
                        })()}
                      </span>
                      <span className="text-[11px]">
                        {enabled ? 'مفعّل' : 'مؤجل'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Group C: Portable Habits */}
            <div className="rounded-xl border border-white/10 bg-black/50 p-3.5">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold text-[#4ADE80]">المجموعة ج · الثوابت المتنقلة</span>
                <span className="text-zinc-500">محفوظة 100% أينما كنت</span>
              </div>
              <div className="text-xs text-zinc-400 leading-relaxed">
                الصلوات الخمس (-3 د) · {groupCBlocks.slice(0, 6).map((b) => b.emojiPair).join(' · ')} · هدف الترطيب اليومي
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Duration Chips */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-zinc-200 mb-2.5">
            3. مدة تفعيل وضع السفر
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'today', label: 'اليوم فقط' },
                { id: 'tomorrow', label: 'غداً أيضاً' },
                { id: 'manual', label: 'حتى الإيقاف اليدوي' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDurationMode(opt.id)}
                className={`py-2.5 px-3 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                  durationMode === opt.id
                    ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4]'
                    : 'border-white/10 bg-black/50 text-zinc-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          {travelState.active ? (
            <button
              type="button"
              onClick={() => {
                onDisableTravel();
                onClose();
              }}
              className="px-4 py-2.5 rounded-xl border border-rose-500/40 text-rose-300 text-xs font-semibold hover:bg-rose-500/10 cursor-pointer"
            >
              إنهاء وضع السفر والعودة للضهرية
            </button>
          ) : (
            <span className="text-xs text-zinc-500">
              يتم تحديث المواقيت ومزامنتها تلقائياً
            </span>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className="px-6 py-2.5 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] cursor-pointer"
          >
            تفعيل وضع السفر وتحديث المواقيت
          </button>
        </div>
      </div>
    </div>
  );
};
