import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BatteryCharging } from 'lucide-react';
import type { PhoneBatteryTelemetry } from '../../types/dayrhythm';

export const BatteryTelemetryCard: React.FC<{
  phoneBattery?: PhoneBatteryTelemetry | null;
  batteryFresh: boolean;
  batteryAtLimit: boolean;
  batteryEtaLabel: string;
  onChangeChargeLimit?: (pct: number) => void;
}> = ({
  phoneBattery, batteryFresh, batteryAtLimit, batteryEtaLabel, onChangeChargeLimit,
}) => {
  return (
    <>
        {/* Card 2: Live Phone Battery & Charging ETA */}
        <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <BatteryCharging
                  className={`w-4 h-4 ${
                    batteryAtLimit
                      ? 'text-[#4ADE80]'
                      : batteryFresh && phoneBattery?.charging
                        ? 'text-amber-300'
                        : 'text-zinc-400'
                  }`}
                />
                <span>بطارية الهاتف المباشرة</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {phoneBattery?.deviceLabel
                  ? `متصل مع ${phoneBattery.deviceLabel}`
                  : 'تظهر النسبة ووقت الشحن المتبقي تلقائياً عند توصيل الهاتف بالشاحن'}
              </p>
            </div>
            {batteryFresh && phoneBattery && (
              <div className="text-left">
                <div
                  className={`font-mono-tabular text-2xl font-extrabold leading-none ${
                    batteryAtLimit
                      ? 'text-[#4ADE80]'
                      : phoneBattery.charging
                        ? 'text-amber-300'
                        : 'text-white'
                  }`}
                >
                  {phoneBattery.levelPct}%
                </div>
                <div className="font-mono-tabular text-[11px] text-zinc-400 mt-1">
                  {phoneBattery.charging
                    ? batteryEtaLabel || 'قيد الشحن الآن'
                    : 'غير موصول بالشاحن'}
                </div>
              </div>
            )}
          </div>

          {batteryFresh && phoneBattery ? (
            <div className="space-y-3">
              <div className="h-2 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    batteryAtLimit
                      ? 'bg-[#4ADE80]'
                      : phoneBattery.charging
                        ? 'bg-amber-400'
                        : 'bg-[#7FFFD4]'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, phoneBattery.levelPct))}%` }}
                />
              </div>

              <AnimatePresence>
                {batteryAtLimit && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="rounded-xl border border-[#4ADE80]/30 bg-[#4ADE80]/10 px-3 py-2 text-xs text-[#4ADE80] font-semibold font-mono-tabular"
                  >
                    وصل الهاتف إلى الحد المحدد ({phoneBattery.chargeLimitPct}%) — يمكنك فصله من الشاحن.
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] px-3.5 py-3 text-xs text-zinc-400 leading-relaxed">
              افتح التطبيق على هاتفك مرة واحدة بحساب Google نفسه — وستصل نسبة الشحن والوقت المتبقي هنا وفي الكبسولة تلقائياً.
            </div>
          )}

          {onChangeChargeLimit && (
            <div className="space-y-1.5 pt-3 border-t border-white/[0.06]">
              <div className="text-xs text-zinc-400">تنبيه اكتمال الشحن عند</div>
              <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-[var(--bg-surface)] border border-white/[0.06]">
                {[80, 85, 90, 95].map((pct) => {
                  const active = (phoneBattery?.chargeLimitPct ?? 90) === pct;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => onChangeChargeLimit(pct)}
                      className={`relative min-h-[44px] rounded-xl font-mono-tabular text-xs font-bold transition-colors cursor-pointer select-none ${
                        active ? 'text-[#7FFFD4]' : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="overlay-charge-limit"
                          transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                          className="absolute inset-0 rounded-xl bg-[#7FFFD4]/12 border border-[#7FFFD4]/25"
                        />
                      )}
                      <span className="relative z-10">{pct}%</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

    </>
  );
};
