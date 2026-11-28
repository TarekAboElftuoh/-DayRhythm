import React from 'react';
import { ARABIC_WEEKDAYS, DYNAMIC_HABIT_ANCHOR_LABELS, MEMORY_CATEGORY_LABELS } from '../../engines/lifeRhythmEngine';
import { formatTime24To12h } from '../../engines/prayerEngine';
import type { AppLanguage, PersistedChatMessage } from '../../types/dayrhythm';

type PendingProposal = NonNullable<PersistedChatMessage['pendingProposal']>;

export const ProposalActionLists: React.FC<{
  proposal: PendingProposal;
  language: AppLanguage;
}> = ({ proposal, language }) => (
  <>
    {proposal.actions.length > 0 && (
      <ul className="divide-y divide-white/10 text-xs">
        {proposal.actions.map((act, idx) => (
          <li key={`cal-${idx}`} className="py-1.5 flex items-center justify-between gap-2">
            <span className="text-white font-medium">📅 {act.title}</span>
            <span className="font-mono-tabular text-[#7FFFD4] shrink-0 text-[11px]">
              {act.operation === 'delete'
                ? 'حذف من التقويم'
                : act.operation === 'update' || act.operation === 'shift'
                  ? `تعديل ${act.dateIso ?? ''} · ${formatTime24To12h(act.startTime24, language)}`.trim()
                  : `${formatTime24To12h(act.startTime24 ?? '09:00', language)} (${act.durationMinutes ?? 30} د)`}
            </span>
          </li>
        ))}
      </ul>
    )}

    {proposal.medicationActions && proposal.medicationActions.length > 0 && (
      <ul className="divide-y divide-white/10 text-xs">
        {proposal.medicationActions.map((mAct, idx) => {
          const doseTimes = mAct.times24 && mAct.times24.length > 0 ? mAct.times24 : mAct.time24 ? [mAct.time24] : [];
          const daysLabel =
            mAct.daysOfWeek && mAct.daysOfWeek.length > 0
              ? mAct.daysOfWeek.map((d) => ARABIC_WEEKDAYS.find((w) => w.id === d)?.shortAr ?? '').filter(Boolean).join('، ')
              : '';
          return (
            <li key={`med-${idx}`} className="py-1.5 flex items-center justify-between gap-2">
              <span className="text-white font-medium">
                💊 {mAct.name}
                {daysLabel ? <span className="text-[11px] text-zinc-400 mr-1">({daysLabel})</span> : null}
              </span>
              <span className={`font-mono-tabular shrink-0 text-[11px] ${mAct.operation === 'remove' ? 'text-rose-400 font-bold' : 'text-[#4ADE80]'}`}>
                {mAct.operation === 'remove'
                  ? 'حذف نهائي'
                  : mAct.operation === 'mark_taken'
                    ? 'تم التناول ✓'
                    : doseTimes.length > 0
                      ? doseTimes.map((t24) => formatTime24To12h(t24, language)).join(' · ')
                      : 'بدون ميعاد ثابت'}
              </span>
            </li>
          );
        })}
      </ul>
    )}

    {proposal.creativeActions && proposal.creativeActions.length > 0 && (
      <ul className="divide-y divide-white/10 text-xs">
        {proposal.creativeActions.map((cAct, idx) => (
          <li key={`cr-${idx}`} className="py-1.5 flex items-center justify-between gap-2">
            <span className="text-white font-medium">{cAct.emoji ?? '🎨'} {cAct.name}</span>
            <span className="font-mono-tabular text-cyan-300 shrink-0 text-[11px]">
              {cAct.operation === 'remove' ? 'حذف نشاط' : `${cAct.goalCount ?? cAct.weeklyGoalSessions ?? 3}× · ${cAct.sessionMinutes ?? 30} د`}
            </span>
          </li>
        ))}
      </ul>
    )}

    {proposal.habitActions && proposal.habitActions.length > 0 && (
      <ul className="divide-y divide-white/10 text-xs">
        {proposal.habitActions.map((hAct, idx) => {
          const anchorMeta = hAct.anchor ? DYNAMIC_HABIT_ANCHOR_LABELS[hAct.anchor] : null;
          const opLabel =
            hAct.operation === 'remove'
              ? 'حذف عادة'
              : hAct.operation === 'pause'
                ? 'إيقاف مؤقت (مستقبلية)'
                : hAct.operation === 'activate'
                  ? 'تفعيل عادة'
                  : hAct.operation === 'toggle_today'
                    ? 'تحديث إنجاز اليوم'
                    : hAct.operation === 'update'
                      ? 'تعديل عادة'
                      : hAct.status === 'planned'
                        ? 'إضافة مستقبلية'
                        : 'إضافة حالية';
          return (
            <li key={`hab-${idx}`} className="py-1.5 flex items-center justify-between gap-2">
              <span className="text-white font-medium">
                {anchorMeta?.emoji ?? '✨'} {hAct.title}
                {anchorMeta ? <span className="text-zinc-400 font-normal"> · {anchorMeta.labelAr}</span> : null}
              </span>
              <span className="font-mono-tabular text-[#7FFFD4] shrink-0 text-[11px]">
                {opLabel}{hAct.durationMin ? ` · ${hAct.durationMin} د` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    )}

    {proposal.taskActions && proposal.taskActions.length > 0 && (
      <ul className="divide-y divide-white/10 text-xs">
        {proposal.taskActions.map((tAct, idx) => (
          <li key={`task-${idx}`} className="py-1.5 flex items-center justify-between gap-2">
            <span className="text-white font-medium">☑️ {tAct.title}</span>
            <span className="font-mono-tabular text-indigo-300 shrink-0 text-[11px]">
              {tAct.operation === 'delete' ? 'حذف مهمة' : tAct.operation === 'complete' ? 'تحديد كمكتملة' : tAct.operation === 'reopen' ? 'إعادة فتح' : tAct.operation === 'update' ? 'تعديل مهمة' : 'إضافة مهمة'}
            </span>
          </li>
        ))}
      </ul>
    )}

    {proposal.memoryActions && proposal.memoryActions.length > 0 && (
      <ul className="divide-y divide-white/10 text-xs">
        {proposal.memoryActions.map((memAct, idx) => (
          <li key={`mem-${idx}`} className="py-1.5 space-y-0.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-purple-300">
                {memAct.operation === 'remove' ? 'حذف من الذاكرة الدائمة' : 'حفظ في الذاكرة الدائمة'}
              </span>
              <span className="text-zinc-500">{MEMORY_CATEGORY_LABELS[memAct.category] ?? 'قواعد عامة'}</span>
            </div>
            <div className="text-zinc-100">{memAct.ruleText}</div>
          </li>
        ))}
      </ul>
    )}
  </>
);
