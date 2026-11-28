import React from 'react';
import { Check, Loader2, X } from 'lucide-react';
import type {
  AppLanguage,
  AppSettingsPatch,
  CalendarActionProposal,
  CreativeActivityActionProposal,
  HabitActionProposal,
  LifeProfile,
  MedicationActionProposal,
  MemoryActionProposal,
  PersistedChatMessage,
  SettingsPatchProposal,
  SettingsSnapshotContext,
  TaskActionProposal,
} from '../../types/dayrhythm';

type PendingProposal = NonNullable<PersistedChatMessage['pendingProposal']>;
import { validateAndNormalizeSettingsPatch } from '../../utils/settingsPatchValidator';
import { ProposalActionLists } from './ProposalActionLists';

export const ProposalConfirmBlock: React.FC<{
  msgId: string;
  proposal: PendingProposal;
  lifeProfile: LifeProfile;
  currentSettingsSnapshot?: SettingsSnapshotContext;
  needsAuth: boolean;
  language: AppLanguage;
  executingProposalId: string | null;
  onConfirm: (
    msgId: string,
    actions: CalendarActionProposal[],
    taskActions: TaskActionProposal[],
    medicationActions: MedicationActionProposal[],
    creativeActions: CreativeActivityActionProposal[],
    profileUpdates?: Partial<LifeProfile>,
    memoryActions?: MemoryActionProposal[],
    appSettings?: AppSettingsPatch,
    settingsPatchProposal?: SettingsPatchProposal,
    habitActions?: HabitActionProposal[]
  ) => void;
  onCancel: (msgId: string) => void;
}> = ({
  msgId,
  proposal,
  lifeProfile,
  currentSettingsSnapshot,
  needsAuth,
  language,
  executingProposalId,
  onConfirm,
  onCancel,
}) => {
  const hasSettingsInput = Boolean(
    proposal.settingsPatchProposal || proposal.profileUpdates || proposal.appSettings
  );
  const settingsValidation = hasSettingsInput
    ? validateAndNormalizeSettingsPatch(
        lifeProfile,
        proposal.settingsPatchProposal?.patch ?? {
          ...(proposal.profileUpdates ?? {}),
          ...(proposal.appSettings ?? {}),
        },
        currentSettingsSnapshot
      )
    : null;
  const displayedDiffs =
    proposal.settingsPatchProposal?.diffs && proposal.settingsPatchProposal.diffs.length > 0
      ? proposal.settingsPatchProposal.diffs
      : settingsValidation?.diffs ?? [];
  const displayedWarnings =
    proposal.settingsPatchProposal?.warnings ?? settingsValidation?.warnings ?? [];
  const displayedErrors =
    proposal.settingsPatchProposal?.errors ?? settingsValidation?.errors ?? [];
  const totalProposalCount =
    proposal.actions.length +
    (proposal.taskActions?.length ?? 0) +
    (proposal.medicationActions?.length ?? 0) +
    (proposal.creativeActions?.length ?? 0) +
    (displayedDiffs.length > 0 ? displayedDiffs.length : proposal.profileUpdates || proposal.appSettings ? 1 : 0) +
    (proposal.memoryActions?.length ?? 0);

  return (
    <div dir="rtl" className="mt-3 pt-3 border-t border-[#7FFFD4]/30 space-y-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-[#7FFFD4]">
          {hasSettingsInput ? 'تأكيد تعديل الإعدادات' : 'تأكيد التعديلات'} ({totalProposalCount})
        </span>
        <span
          className={`text-[11px] font-medium ${
            proposal.status === 'confirmed'
              ? 'text-[#4ADE80]'
              : proposal.status === 'cancelled'
                ? 'text-zinc-500'
                : 'text-zinc-400'
          }`}
        >
          {proposal.status === 'confirmed'
            ? hasSettingsInput
              ? 'تم التطبيق ✓'
              : 'تم التنفيذ ✓'
            : proposal.status === 'cancelled'
              ? 'تم الإلغاء'
              : 'بانتظار موافقتك'}
        </span>
      </div>

      <p className="text-xs text-zinc-300">{proposal.summaryAr}</p>

      {hasSettingsInput && (
        <div className="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 space-y-2 text-[11px]">
          {displayedDiffs.length > 0 ? (
            <ul className="divide-y divide-white/[0.06]">
              {displayedDiffs.map((diff) => (
                <li key={diff.key} className="py-1.5 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-zinc-200 font-medium">{diff.labelAr}:</span>
                  <span className="inline-flex items-center gap-1.5 font-mono-tabular">
                    <span className="text-zinc-400 line-through decoration-zinc-500/60">{diff.beforeDisplay}</span>
                    <span className="text-zinc-500">←</span>
                    <span className="text-[#7FFFD4] font-semibold">{diff.afterDisplay}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-zinc-400">لا توجد تغييرات فعلية جديدة لتطبيقها.</div>
          )}
          {displayedWarnings.length > 0 && (
            <div className="pt-1 border-t border-amber-400/20 text-amber-300 space-y-0.5">
              {displayedWarnings.map((w, idx) => <div key={`warn-${idx}`}>⚠️ {w}</div>)}
            </div>
          )}
          {displayedErrors.length > 0 && (
            <div className="pt-1 border-t border-rose-400/20 text-rose-300 space-y-0.5">
              {displayedErrors.map((errMsg, idx) => <div key={`err-${idx}`}>⛔ {errMsg}</div>)}
            </div>
          )}
        </div>
      )}

      {needsAuth && proposal.status === 'pending' && proposal.actions.length > 0 && (
        <p className="text-[11px] text-amber-300">
          ملاحظة: لتعديل Google Calendar الفعلي، سجّل الدخول بحساب Google أولاً.
        </p>
      )}

      <ProposalActionLists proposal={proposal} language={language} />

      {proposal.status === 'pending' && (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            disabled={
              executingProposalId === msgId ||
              (hasSettingsInput &&
                displayedErrors.length > 0 &&
                displayedDiffs.length === 0 &&
                proposal.actions.length === 0 &&
                (proposal.taskActions?.length ?? 0) === 0 &&
                (proposal.medicationActions?.length ?? 0) === 0 &&
                (proposal.creativeActions?.length ?? 0) === 0 &&
                (proposal.habitActions?.length ?? 0) === 0 &&
                (proposal.memoryActions?.length ?? 0) === 0)
            }
            onClick={() =>
              onConfirm(
                msgId,
                proposal.actions,
                proposal.taskActions ?? [],
                proposal.medicationActions ?? [],
                proposal.creativeActions ?? [],
                proposal.profileUpdates,
                proposal.memoryActions ?? [],
                proposal.appSettings,
                proposal.settingsPatchProposal,
                proposal.habitActions ?? []
              )
            }
            className="flex-1 min-h-[44px] sm:min-h-[40px] py-2 px-4 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#66eec2] cursor-pointer disabled:opacity-50 transition-colors"
          >
            {executingProposalId === msgId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span>
              {hasSettingsInput || (proposal.habitActions?.length ?? 0) > 0 ? 'تطبيق التغييرات' : 'تأكيد وتنفيذ'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onCancel(msgId)}
            className="min-h-[44px] sm:min-h-[40px] py-2 px-4 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] text-xs text-zinc-300 hover:bg-white/[0.06] flex items-center gap-1 cursor-pointer transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>إلغاء</span>
          </button>
        </div>
      )}
    </div>
  );
};
