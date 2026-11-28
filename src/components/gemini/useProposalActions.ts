import { useState } from 'react';
import type React from 'react';
import type {
  AppSettingsPatch,
  CalendarActionProposal,
  CalendarExecutionResult,
  CreativeActivityActionProposal,
  CreativeExecutionResult,
  HabitActionProposal,
  HabitExecutionResult,
  LifeProfile,
  MedicationActionProposal,
  MedicationExecutionResult,
  MemoryActionProposal,
  PersistedChatMessage,
  SettingsPatchProposal,
  SettingsSnapshotContext,
  TaskActionProposal,
  TaskExecutionResult,
  UnifiedSettingsPatch,
} from '../../types/dayrhythm';
import { validateAndNormalizeSettingsPatch } from '../../utils/settingsPatchValidator';
import { cleanDisplayMessageText } from '../../services/geminiClient';

interface UseProposalActionsArgs {
  lifeProfile: LifeProfile;
  currentSettingsSnapshot?: SettingsSnapshotContext;
  onApplySettingsPatch?: (patch: UnifiedSettingsPatch) => Promise<void> | void;
  onApplyAppSettings?: (patch: AppSettingsPatch) => void;
  onApplyProfileUpdates: (patch: Partial<LifeProfile>) => void;
  onExecuteMemoryActions: (memoryActions: MemoryActionProposal[]) => void;
  onExecuteCalendarActions: (
    actions: CalendarActionProposal[]
  ) => Promise<{ googleSynced: boolean; results: CalendarExecutionResult[]; queued?: boolean }>;
  onExecuteTaskActions: (
    taskActions: TaskActionProposal[]
  ) => Promise<{ googleSynced: boolean; results: TaskExecutionResult[]; queued?: boolean }>;
  onExecuteMedicationActions: (
    medicationActions: MedicationActionProposal[],
    linkedCalendarIds?: Record<string, string>
  ) => Promise<MedicationExecutionResult[]>;
  onExecuteCreativeActions: (
    creativeActions: CreativeActivityActionProposal[],
    linkedCalendarIds?: Record<string, string>
  ) => Promise<CreativeExecutionResult[]>;
  onExecuteHabitActions?: (habitActions: HabitActionProposal[]) => Promise<HabitExecutionResult[]>;
  onChangeMessages: React.Dispatch<React.SetStateAction<PersistedChatMessage[]>>;
}

export function useProposalActions({
  lifeProfile,
  currentSettingsSnapshot,
  onApplySettingsPatch,
  onApplyAppSettings,
  onApplyProfileUpdates,
  onExecuteMemoryActions,
  onExecuteCalendarActions,
  onExecuteTaskActions,
  onExecuteMedicationActions,
  onExecuteCreativeActions,
  onExecuteHabitActions,
  onChangeMessages,
}: UseProposalActionsArgs) {
  const [executingProposalId, setExecutingProposalId] = useState<string | null>(null);

  const handleConfirmProposal = async (
    msgId: string,
    actions: CalendarActionProposal[],
    taskActions: TaskActionProposal[] = [],
    medicationActions: MedicationActionProposal[] = [],
    creativeActions: CreativeActivityActionProposal[] = [],
    profileUpdates?: Partial<LifeProfile>,
    memoryActions: MemoryActionProposal[] = [],
    appSettings?: AppSettingsPatch,
    settingsPatchProposal?: SettingsPatchProposal,
    habitActions: HabitActionProposal[] = []
  ) => {
    setExecutingProposalId(msgId);
    try {
      const links: Array<{ title: string; htmlLink: string }> = [];
      const linkedCalendarIds: Record<string, string> = {};
      let queuedOffline = false;

      if (
        settingsPatchProposal ||
        (appSettings && Object.keys(appSettings).length > 0) ||
        (profileUpdates && Object.keys(profileUpdates).length > 0)
      ) {
        const rawCombined: Record<string, unknown> = {
          ...(profileUpdates ?? {}),
          ...(appSettings ?? {}),
          ...(settingsPatchProposal?.patch ?? {}),
        };
        const validated = validateAndNormalizeSettingsPatch(
          lifeProfile,
          rawCombined,
          currentSettingsSnapshot
        );
        if (validated.hasChanges) {
          if (onApplySettingsPatch) {
            await onApplySettingsPatch(validated.normalizedPatch);
          } else {
            if (Object.keys(validated.appSettingsPatch).length > 0) {
              onApplyAppSettings?.(validated.appSettingsPatch);
            }
            if (Object.keys(validated.profilePatch).length > 0) {
              onApplyProfileUpdates(validated.profilePatch);
            }
          }
        }
      }

      if (memoryActions.length > 0) {
        onExecuteMemoryActions(memoryActions);
      }

      if (actions.length > 0) {
        const calRes = await onExecuteCalendarActions(actions);
        if (calRes.queued) queuedOffline = true;
        calRes.results.forEach((r) => {
          if (r.htmlLink) links.push({ title: r.title, htmlLink: r.htmlLink });
          if (r.id) {
            for (const mAct of medicationActions) {
              if (r.title.includes(mAct.name)) linkedCalendarIds[mAct.name] = r.id;
            }
            for (const cAct of creativeActions) {
              if (r.title.includes(cAct.name)) linkedCalendarIds[cAct.name] = r.id;
            }
          }
        });
      }

      if (taskActions.length > 0) {
        const taskRes = await onExecuteTaskActions(taskActions);
        if (taskRes.queued) queuedOffline = true;
      }

      if (medicationActions.length > 0) {
        await onExecuteMedicationActions(medicationActions, linkedCalendarIds);
      }

      if (creativeActions.length > 0) {
        await onExecuteCreativeActions(creativeActions, linkedCalendarIds);
      }

      if (habitActions.length > 0 && onExecuteHabitActions) {
        await onExecuteHabitActions(habitActions);
      }

      const queuedNote = queuedOffline
        ? '\n\n⏳ مفيش إنترنت — التعديل محفوظ وهيتنفذ في Google لوحده أول ما النت يرجع.'
        : '';
      onChangeMessages((prev) =>
        prev.map((m): PersistedChatMessage => {
          if (m.id !== msgId) return m;
          const prop = m.pendingProposal;
          return {
            ...m,
            text: queuedNote
              ? `${cleanDisplayMessageText(m.text)}${queuedNote}`
              : cleanDisplayMessageText(m.text),
            pendingProposal: prop ? { ...prop, status: 'confirmed' as const } : m.pendingProposal,
            executionLinks: links.length > 0 ? links : m.executionLinks,
          };
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل تنفيذ التعديل.';
      onChangeMessages((prev) => [
        ...prev,
        { id: `exec-err-${Date.now()}`, role: 'model', mode: 'chat', text: msg, error: true },
      ]);
    } finally {
      setExecutingProposalId(null);
    }
  };

  const handleCancelProposal = (msgId: string) => {
    onChangeMessages((prev) =>
      prev.map((m): PersistedChatMessage => {
        if (m.id !== msgId) return m;
        const prop = m.pendingProposal;
        return {
          ...m,
          text: cleanDisplayMessageText(m.text),
          pendingProposal: prop ? { ...prop, status: 'cancelled' as const } : m.pendingProposal,
        };
      })
    );
  };

  return { executingProposalId, handleConfirmProposal, handleCancelProposal };
}
