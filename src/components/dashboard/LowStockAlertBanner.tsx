import React from 'react';
import { Leaf, AlertCircle, ShoppingBag } from 'lucide-react';
import { t } from '../../engines/i18n';
import type { DashboardController } from './useDashboardController';

export const LowStockAlertBanner: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    onRefillMedication, onOpenAssistantWithPrompt, tomorrowAlert, lowEnergyActive, onToggleLowEnergyToday, purchaseMedId, setPurchaseMedId, purchaseAddDoses, setPurchaseAddDoses, purchaseMode, setPurchaseMode, purchaseAlertDays, setPurchaseAlertDays, openPurchaseRestockForm, lowStockMedications,
  } = d;
  return (
    <>
      {/* Single Authoritative Low-Stock Medications Alert (No duplicate warning inside Meds card) */}
      {lowStockMedications.length > 0 && (
        <div className="rounded-xl border border-amber-400/35 bg-amber-400/[0.06] px-4 py-3 text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-200 font-semibold">
              <AlertCircle className="w-4 h-4 text-amber-300 shrink-0" />
              <span>مخزون قارب على النفاد ({lowStockMedications.length})</span>
            </div>
          </div>
          <div className="divide-y divide-amber-400/15">
            {lowStockMedications.map(({ med, remainingDoses, daysLeftRounded, dailyRate, defaultPackSize }) => {
              const isOpen = purchaseMedId === med.id;
              const enteredQty = Math.max(0, Math.min(500, Math.round(Number(purchaseAddDoses) || 0)));
              const previewTotal =
                purchaseMode === 'add'
                  ? Math.min(500, remainingDoses + enteredQty)
                  : enteredQty;
              const previewDays = Math.ceil(previewTotal / Math.max(0.14, dailyRate));
              return (
                <div key={`top-low-${med.id}`} className="py-2 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-white truncate">{med.name}</span>
                      <span
                        className={`font-mono-tabular text-[11px] shrink-0 ${
                          remainingDoses === 0 ? 'text-rose-300 font-bold' : 'text-amber-200/90'
                        }`}
                      >
                        ·{' '}
                        {remainingDoses === 0
                          ? 'نفد المخزون'
                          : `متبقٍ ${remainingDoses} (~${daysLeftRounded} ${daysLeftRounded === 1 ? 'يوم' : 'أيام'})`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onRefillMedication(med.id, defaultPackSize, med.refillAlertDays ?? 3);
                          if (purchaseMedId === med.id) setPurchaseMedId(null);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-[#4ADE80]/40 bg-[#4ADE80]/10 text-[#4ADE80] text-[11px] font-semibold hover:bg-[#4ADE80]/20 cursor-pointer"
                        title={`تعبئة عبوة جديدة (${defaultPackSize} جرعة)`}
                      >
                        عبوة جديدة ({defaultPackSize})
                      </button>
                      <button
                        type="button"
                        onClick={() => openPurchaseRestockForm(med)}
                        className="px-2.5 py-1 rounded-lg bg-[#7FFFD4] text-black text-[11px] font-bold hover:bg-[#66eec2] flex items-center gap-1 cursor-pointer"
                      >
                        <ShoppingBag className="w-3 h-3" />
                        <span>شراء</span>
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="rounded-lg border border-[#7FFFD4]/30 bg-black/75 p-2.5 space-y-2 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-zinc-400">الكمية:</span>
                        {[14, 20, 30, 60].map((qty) => (
                          <button
                            key={qty}
                            type="button"
                            onClick={() => setPurchaseAddDoses(String(qty))}
                            className={`px-2 py-0.5 rounded-md border font-mono-tabular text-[11px] cursor-pointer ${
                              purchaseAddDoses === String(qty)
                                ? 'border-[#7FFFD4] bg-[#7FFFD4]/20 text-[#7FFFD4] font-bold'
                                : 'border-white/10 text-zinc-400 hover:text-white'
                            }`}
                          >
                            +{qty}
                          </button>
                        ))}
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={purchaseAddDoses}
                          onChange={(e) => setPurchaseAddDoses(e.target.value)}
                          className="w-18 rounded-lg border border-white/15 bg-black px-2 py-0.5 text-white font-mono-tabular focus:outline-none focus:border-[#7FFFD4]"
                          aria-label="عدد الجرعات المشتراة"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPurchaseMode('add')}
                            className={`px-2 py-0.5 rounded-md border text-[11px] cursor-pointer ${
                              purchaseMode === 'add'
                                ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                                : 'border-white/10 text-zinc-400'
                            }`}
                          >
                            إضافة ({remainingDoses} + {enteredQty})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPurchaseMode('set')}
                            className={`px-2 py-0.5 rounded-md border text-[11px] cursor-pointer ${
                              purchaseMode === 'set'
                                ? 'border-[#7FFFD4] bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                                : 'border-white/10 text-zinc-400'
                            }`}
                          >
                            تعيين إجمالي
                          </button>
                        </div>
                        <span className="font-mono-tabular text-[11px] text-[#4ADE80]">
                          الرصيد: {previewTotal} (~{previewDays} ي)
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/10">
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                          <span>تنبيه قبل:</span>
                          {[2, 3, 5].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setPurchaseAlertDays(d)}
                              className={`px-1.5 py-0.5 rounded border cursor-pointer ${
                                purchaseAlertDays === d
                                  ? 'border-[#7FFFD4] bg-[#7FFFD4]/20 text-[#7FFFD4] font-bold'
                                  : 'border-white/10 text-zinc-400'
                              }`}
                            >
                              {d} ي
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPurchaseMedId(null)}
                            className="px-2.5 py-1 rounded-lg text-zinc-400 hover:text-white cursor-pointer"
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            disabled={previewTotal <= 0}
                            onClick={() => {
                              onRefillMedication(med.id, previewTotal, purchaseAlertDays);
                              setPurchaseMedId(null);
                            }}
                            className="px-3 py-1 rounded-lg bg-[#4ADE80] text-black font-bold hover:bg-emerald-300 disabled:opacity-40 cursor-pointer"
                          >
                            حفظ ✓
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {lowEnergyActive && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-100/90">
          <div className="flex items-center gap-2">
            <Leaf className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>وضع اليوم الهادئ مفعّل — الأولوية للصلاة والنوم فقط.</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                onOpenAssistantWithPrompt(
                  'أنا في وضع اليوم الهادئ (طاقتي منخفضة النهاردة) — راجع جدولي ومهامي واقترح عليّ إيه يتأجل لبكرة بهدوء مع حماية الصلاة والنوم.'
                )
              }
              className="text-[#7FFFD4] hover:underline font-medium cursor-pointer"
            >
              تخفيف مع Gemini
            </button>
            <button
              type="button"
              onClick={onToggleLowEnergyToday}
              className="text-zinc-400 hover:text-white cursor-pointer"
            >
              إنهاء
            </button>
          </div>
        </div>
      )}

      {tomorrowAlert && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 text-cyan-300 shrink-0" />
            <div className="min-w-0 truncate">
              <span className="font-semibold text-white">{tomorrowAlert.headlineAr}</span>
              <span className="text-zinc-400"> · {tomorrowAlert.detailAr}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenAssistantWithPrompt(
                `غداً ${tomorrowAlert.weekdayAr} (${tomorrowAlert.tomorrowIso}) عندي: ${tomorrowAlert.detailAr} — ساعدني أرتّب جدول غداً مسبقاً بدون ما يضغط على الصلاة أو النوم.`
              )
            }
            className="text-[#7FFFD4] font-semibold hover:underline cursor-pointer shrink-0 whitespace-nowrap"
          >
            رتّب غداً ←
          </button>
        </div>
      )}
    </>
  );
};
