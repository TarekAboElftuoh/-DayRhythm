import React from 'react';
import type { PrayerTimeItem } from '../../types/dayrhythm';
import type { DashboardController } from './useDashboardController';

export const CreateEventTimePicker: React.FC<{ d: DashboardController; setEvMinutesOfDay: (totalMin: number) => void; shiftEvMinutes: (deltaMin: number) => void; upcomingPrayer?: PrayerTimeItem }> = ({ d, setEvMinutesOfDay, shiftEvMinutes, upcomingPrayer }) => {
  const {
    todayCairoIso, setNewEvDate, newEvHour12, setNewEvHour12, newEvMinute, setNewEvMinute, newEvPeriod, setNewEvPeriod, newEvDuration, setNewEvDuration, nowMinutes,
  } = d;
  return (
    <>
                    {/* Quick Time Presets + Stepper + Compact 12h Picker */}
                    <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/40 p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setNewEvDate(todayCairoIso);
                            setEvMinutesOfDay(nowMinutes + 30);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-zinc-300 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4] cursor-pointer"
                        >
                          +30 د
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNewEvDate(todayCairoIso);
                            setEvMinutesOfDay(nowMinutes + 60);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-zinc-300 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4] cursor-pointer"
                        >
                          +1 س
                        </button>
                        {upcomingPrayer && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewEvDate(todayCairoIso);
                              setEvMinutesOfDay(upcomingPrayer.adhanMinutes + 25);
                            }}
                            className="px-2.5 py-1 rounded-lg border border-[#7FFFD4]/30 bg-[#7FFFD4]/[0.08] text-[11px] text-[#7FFFD4] hover:bg-[#7FFFD4]/15 cursor-pointer"
                          >
                            بعد {upcomingPrayer.nameAr}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEvMinutesOfDay(20 * 60)}
                          className="px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-zinc-300 hover:border-[#7FFFD4]/45 hover:text-[#7FFFD4] cursor-pointer"
                        >
                          8 م
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => shiftEvMinutes(-15)}
                          className="px-2.5 py-2 rounded-lg border border-white/12 bg-white/[0.03] text-zinc-200 hover:border-[#7FFFD4]/45 font-mono-tabular text-xs font-bold cursor-pointer"
                        >
                          -15د
                        </button>
                        <div className="flex-1 grid grid-cols-3 gap-1.5">
                          <select
                            value={newEvHour12}
                            onChange={(e) => setNewEvHour12(Number(e.target.value))}
                            className="rounded-lg border border-white/15 bg-black/75 px-2 py-2 text-center text-white font-mono-tabular text-sm font-bold"
                            aria-label="الساعة"
                          >
                            {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                              <option key={h} value={h}>
                                {String(h).padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={2}
                            value={newEvMinute}
                            placeholder="mm"
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              if (val === '') {
                                setNewEvMinute('');
                                return;
                              }
                              const v = Number(val);
                              setNewEvMinute(Number.isFinite(v) ? (v > 59 ? '59' : val.slice(0, 2)) : '');
                            }}
                            className="rounded-lg border border-white/15 bg-black/75 px-2 py-2 text-center text-white placeholder:text-zinc-500 placeholder:font-normal font-mono-tabular text-sm font-bold focus:outline-none focus:border-[#7FFFD4]"
                            aria-label="الدقائق"
                          />
                          <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-lg border border-white/15 bg-black/75">
                            <button
                              type="button"
                              onClick={() => setNewEvPeriod('AM')}
                              className={`rounded-md text-xs font-bold cursor-pointer ${
                                newEvPeriod === 'AM' ? 'bg-[#7FFFD4] text-black' : 'text-zinc-400'
                              }`}
                            >
                              ص
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewEvPeriod('PM')}
                              className={`rounded-md text-xs font-bold cursor-pointer ${
                                newEvPeriod === 'PM' ? 'bg-[#7FFFD4] text-black' : 'text-zinc-400'
                              }`}
                            >
                              م
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => shiftEvMinutes(15)}
                          className="px-2.5 py-2 rounded-lg border border-white/12 bg-white/[0.03] text-zinc-200 hover:border-[#7FFFD4]/45 font-mono-tabular text-xs font-bold cursor-pointer"
                        >
                          +15د
                        </button>
                      </div>

                      {/* Clean Duration Pills */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-zinc-400">المدة</span>
                        <div className="flex flex-wrap items-center gap-1">
                          {[0, 5, 15, 30, 45, 60, 90].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setNewEvDuration(preset)}
                              className={`px-2 py-1 rounded-lg border text-[11px] font-mono-tabular cursor-pointer ${
                                newEvDuration === preset
                                  ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                                  : 'border-white/10 text-zinc-400 hover:text-white'
                              }`}
                            >
                              {preset === 0 ? 'بدون مدة' : `${preset}د`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
    </>
  );
};
