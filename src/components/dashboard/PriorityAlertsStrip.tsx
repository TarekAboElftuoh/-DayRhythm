import React from 'react';
import { RotateCcw, VolumeX, X, BatteryCharging, BellOff } from 'lucide-react';
import { TASK_SOUND_META } from '../../engines/audioEngine';
import { formatMinutes12h } from '../../engines/prayerEngine';
import type { DashboardController } from './useDashboardController';

export const PriorityAlertsStrip: React.FC<{ d: DashboardController }> = ({ d }) => {
  const {
    language, lastDeletedBlock, shakeUndoSecondsLeft, onTriggerShakeUndo, onLogWaterCup, onSetQuietMode, batteryGuard, phoneBattery, phoneChargeLimitPct, phoneChargeAlertDismissed, onDismissPhoneChargeAlert, smartChargeAudioActive, activeSanctuary, onCancelActiveSanctuaryEarly, silentNotifications, onClearSilentNotifications, activeAudioAlert, hasPersistentAlert, onAcknowledgeAudioAlert, lastDeletedWorkspaceItem, onUndoWorkspaceDelete, onDismissWorkspaceUndo, showSilentInbox, setShowSilentInbox, confirmCancelSanctuary, setConfirmCancelSanctuary,
  } = d;
  return (
    <>
      {/* 2. PRIORITY ACTIONAL ALERTS ONLY (Rendered strictly when no floating persistent overlay is active to avoid duplicate cards) */}
      {activeAudioAlert && !hasPersistentAlert && (
        <div
          className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
            activeAudioAlert.isContinuous
              ? 'border-amber-400/50 bg-amber-400/12'
              : 'border-[#7FFFD4]/40 bg-[#7FFFD4]/10'
          }`}
        >
          <div className="flex items-center gap-2.5 text-sm">
            <span className="text-2xl leading-none">{activeAudioAlert.title || TASK_SOUND_META[activeAudioAlert.category].icon}</span>
            <span className="text-xs font-medium text-zinc-200">
              {activeAudioAlert.category === 'water'
                ? 'تأكيد شرب الكوب'
                : activeAudioAlert.isContinuous
                  ? 'رنين نشط'
                  : 'تنبيه'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {activeAudioAlert.category === 'water' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onLogWaterCup();
                    onAcknowledgeAudioAlert();
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] active:scale-95 transition-transform cursor-pointer"
                >
                  💧 شربت فعلاً ✓
                </button>
                <button
                  type="button"
                  onClick={onAcknowledgeAudioAlert}
                  className="px-3 py-1.5 rounded-lg border border-white/15 text-zinc-300 text-xs hover:text-white active:scale-95 transition-transform cursor-pointer"
                >
                  لاحقاً
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onAcknowledgeAudioAlert}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-transform cursor-pointer ${
                  activeAudioAlert.isContinuous
                    ? 'bg-amber-400 text-black hover:bg-amber-300'
                    : 'bg-[#7FFFD4] text-black hover:bg-[#66eec2]'
                }`}
              >
                {activeAudioAlert.isContinuous ? 'إيقاف ✓' : '✓ تم'}
              </button>
            )}
          </div>
        </div>
      )}

      {(smartChargeAudioActive ||
        (phoneBattery &&
          phoneBattery.charging &&
          phoneBattery.levelPct >= phoneBattery.chargeLimitPct &&
          !phoneChargeAlertDismissed)) && (
        <div className="rounded-xl border border-[#4ADE80]/45 bg-[#4ADE80]/10 px-4 py-2.5 text-xs text-emerald-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BatteryCharging className="w-4 h-4 text-[#4ADE80] shrink-0" />
            <span className="font-medium text-white">
              اكتمال الشحن ({phoneBattery?.levelPct ?? phoneChargeLimitPct}%) · افصل الشاحن عن{' '}
              {phoneBattery?.deviceLabel || 'الهاتف'}
            </span>
          </div>
          <button
            type="button"
            onClick={onDismissPhoneChargeAlert}
            className="px-3 py-1.5 rounded-lg bg-[#4ADE80] text-black font-bold text-xs hover:bg-emerald-300 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <BellOff className="w-3.5 h-3.5" />
            <span>إيقاف التنبيه</span>
          </button>
        </div>
      )}

      {batteryGuard.bedtimeGuardTriggered && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200 flex items-center justify-between gap-3">
          <span>
            🔋 بطارية الهاتف عند <strong className="font-mono-tabular">{batteryGuard.levelPct}%</strong> — اشحن الجهاز قبل النوم.
          </span>
        </div>
      )}

      {lastDeletedWorkspaceItem && (
        <div className="rounded-xl border border-[#7FFFD4]/35 bg-[#7FFFD4]/[0.07] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-zinc-100 min-w-0">
            <RotateCcw className="w-3.5 h-3.5 text-[#7FFFD4] shrink-0" />
            <span className="truncate">
              تم حذف «{lastDeletedWorkspaceItem.title}»
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void onUndoWorkspaceDelete()}
              className="px-3 py-1 rounded-lg bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2] cursor-pointer"
            >
              استعادة
            </button>
            <button
              type="button"
              onClick={onDismissWorkspaceUndo}
              className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              aria-label="إغلاق"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {lastDeletedBlock && shakeUndoSecondsLeft > 0 && (
        <div className="rounded-xl border border-[#7FFFD4]/35 bg-[#7FFFD4]/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-3.5 h-3.5 text-[#7FFFD4]" />
            <span className="text-white font-semibold">
              تم حذف {lastDeletedBlock.emojiPair} ({shakeUndoSecondsLeft} ث)
            </span>
          </div>
          <button
            type="button"
            onClick={onTriggerShakeUndo}
            className="px-3 py-1 rounded-lg bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2] cursor-pointer"
          >
            تراجع
          </button>
        </div>
      )}

      {activeSanctuary.type !== 'none' && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-2.5 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <VolumeX className="w-4 h-4 text-amber-300 shrink-0" />
            <span>
              <strong>{activeSanctuary.labelAr}</strong>
              {activeSanctuary.endsAtMin !== undefined
                ? ` · حتى ${formatMinutes12h(activeSanctuary.endsAtMin, language)}`
                : ''}
            </span>
          </div>
          {activeSanctuary.type === 'meeting' && (
            <button
              type="button"
              onClick={() => onSetQuietMode('normal', 0)}
              className="px-3 py-1 rounded-lg bg-amber-400 text-black font-bold text-[11px] cursor-pointer"
            >
              إنهاء
            </button>
          )}
          {(activeSanctuary.type === 'prayer' || activeSanctuary.type === 'sleep') && (
            <div dir="rtl" className="flex flex-wrap items-center gap-2">
              {!confirmCancelSanctuary ? (
                <button
                  type="button"
                  onClick={() => setConfirmCancelSanctuary(true)}
                  className="px-3 py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-100 font-semibold text-[11px] cursor-pointer transition-colors"
                >
                  إنهاء الصمت مبكراً
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/40 bg-black/40 px-2.5 py-1.5">
                  <span className="text-[11px] text-amber-100">
                    هل أنت متأكد أنك تريد إلغاء الصمت المؤقت الآن؟
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmCancelSanctuary(false);
                      onCancelActiveSanctuaryEarly?.();
                    }}
                    className="px-2.5 py-1 rounded-md bg-amber-400 text-black font-bold text-[11px] cursor-pointer"
                  >
                    نعم، إلغاء الصمت
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancelSanctuary(false)}
                    className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 text-slate-200 text-[11px] cursor-pointer"
                  >
                    تراجع
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showSilentInbox && silentNotifications.length > 0 && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white">
              الإشعارات الصامتة ({silentNotifications.length})
            </span>
            <button
              type="button"
              onClick={() => {
                onClearSilentNotifications();
                setShowSilentInbox(false);
              }}
              className="text-[11px] text-[#7FFFD4] hover:underline cursor-pointer"
            >
              مسح الكل
            </button>
          </div>
          <div className="divide-y divide-white/[0.07] max-h-48 overflow-y-auto">
            {silentNotifications.map((sn) => {
              const meta = TASK_SOUND_META[sn.soundCategory];
              const cleanTitle = (sn.title || '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D\s]/gu, '').length > 0
                ? sn.title
                : meta?.labelAr ?? 'تنبيه مجدول';
              const shortDesc = sn.description || sn.reasonAr;
              return (
                <div key={sn.id} className="py-2 flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span className="text-base leading-none mt-0.5 shrink-0">{meta?.icon ?? '🔔'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-zinc-100 truncate">{cleanTitle}</div>
                      {shortDesc && (
                        <div className="text-[11px] md:text-xs text-zinc-400 line-clamp-1 mt-0.5">
                          {shortDesc}
                          {sn.description && sn.reasonAr ? ` · ${sn.reasonAr}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-zinc-500 shrink-0 whitespace-nowrap mt-0.5">
                    {sn.time12h}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </>
  );
};
