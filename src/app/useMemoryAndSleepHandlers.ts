import { useCallback } from 'react';
import type React from 'react';
import type {
  ActiveTab,
  DailyRhythmPlan,
  LifeProfile,
  MemoryActionProposal,
  MemoryCategory,
  MemoryItem,
  PersistedChatMessage,
  SoundRepeatSetting,
  TaskSoundCategory,
} from '../types/dayrhythm';
import type { TasksVaultPayload } from '../types/appTypes';
import { sanitizeMemoryId, sanitizeMemoryItem, sanitizeSoundRepeats } from '../firebase';
import { DEFAULT_SOUND_REPEATS, TASK_SOUND_META } from '../engines/audioEngine';
import { triggerHapticWaveform } from '../engines/hapticsEngine';
import { getDateIsoInTimeZone } from '../engines/prayerEngine';
import { MEMORIES_STORAGE_KEY, WELCOME_MESSAGE } from '../utils/appHelpers';
import { sanitizeLifeProfile } from './sanitizers';

export interface UseMemoryAndSleepHandlersParams {
  activeTimeZone: string;
  lifeProfile: LifeProfile;
  dailyRhythmPlan: DailyRhythmPlan;
  memories: MemoryItem[];
  updateLifeProfileLocal: (updater: (prev: LifeProfile) => LifeProfile) => void;
  setPendingAssistantPrompt: React.Dispatch<React.SetStateAction<string | null>>;
  handleSelectTab: (tab: ActiveTab) => void;
  setMemories: React.Dispatch<React.SetStateAction<MemoryItem[]>>;
  setChatMessages: React.Dispatch<React.SetStateAction<PersistedChatMessage[]>>;
  pushToTasksVaultImmediately: (patch?: Partial<TasksVaultPayload>) => Promise<void>;
  pushFullCloudBackupImmediately: () => Promise<boolean>;
  showToast: (msg: string) => void;
}

export function useMemoryAndSleepHandlers(p: UseMemoryAndSleepHandlersParams) {
  const handleUpdateSoundRepeat = useCallback(
    (category: TaskSoundCategory, setting: SoundRepeatSetting) => {
      p.updateLifeProfileLocal((prev) => {
        const nextRepeats = sanitizeSoundRepeats({ ...(prev.soundRepeats ?? DEFAULT_SOUND_REPEATS), [category]: setting });
        return sanitizeLifeProfile({ ...prev, soundRepeats: nextRepeats });
      });
      const label = TASK_SOUND_META[category].labelAr;
      p.showToast(setting === 'continuous' ? `🔊 «${label}»: رنين مستمر حتى الإيقاف ✓` : `🔊 «${label}»: تكرار الرنين ${setting}× ✓`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.showToast]
  );

  const handleLogSleepQuality = useCallback(
    (mode: 'good' | 'short_30' | 'short_60' | 'reset') => {
      const todayIso = getDateIsoInTimeZone(p.activeTimeZone);
      if (mode === 'reset') {
        p.updateLifeProfileLocal((prev) => sanitizeLifeProfile({ ...prev, sleepDebtMinutes: 0, sleepDebtLogDateKey: todayIso }));
        triggerHapticWaveform('water_cup');
        p.showToast('😴 تم تصفير رصيد النوم — نومك متوازن الآن ✓');
        return;
      }
      if (mode === 'good') {
        const currentDebt = p.lifeProfile.sleepDebtMinutes;
        const paidBack = currentDebt > 0 ? Math.min(currentDebt, Math.max(p.dailyRhythmPlan.nightlyRecoveryMin, 30)) : 0;
        const nextDebt = Math.max(0, currentDebt - paidBack);
        p.updateLifeProfileLocal((prev) => sanitizeLifeProfile({ ...prev, sleepDebtMinutes: nextDebt, sleepDebtLogDateKey: todayIso }));
        triggerHapticWaveform('water_cup');
        p.showToast(
          paidBack > 0
            ? nextDebt === 0
              ? '✨ ممتاز! تم تعويض رصيد النوم بالكامل وعاد نومك لوضعه الطبيعي ✓'
              : `✨ ممتاز! تم تعويض ${paidBack} د من رصيد النوم — المتبقي ${nextDebt} د`
            : '✨ ممتاز! نومك متوازن اليوم (صفر عجز) ✓'
        );
        return;
      }
      const addMin = mode === 'short_60' ? 60 : 30;
      const nextDebt = Math.min(480, p.lifeProfile.sleepDebtMinutes + addMin);
      p.updateLifeProfileLocal((prev) => sanitizeLifeProfile({ ...prev, sleepDebtMinutes: nextDebt, sleepDebtLogDateKey: todayIso }));
      triggerHapticWaveform('water_cup');
      p.showToast(`🌙 سُجّل نقص ${addMin} د (الإجمالي ${nextDebt} د) — سيُبكّر موعد نوم الليلة تلقائياً للتعويض بهدوء`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.activeTimeZone, p.dailyRhythmPlan.nightlyRecoveryMin, p.lifeProfile.sleepDebtMinutes, p.showToast]
  );

  const handleOpenAssistantWithPrompt = useCallback(
    (prompt: string) => {
      p.setPendingAssistantPrompt(prompt);
      p.handleSelectTab('assistant');
    },
    [p.handleSelectTab, p.setPendingAssistantPrompt]
  );

  const handleAddMemory = useCallback(
    (input: { category: MemoryCategory; ruleText: string; source?: MemoryItem['source'] }) => {
      const trimmed = input.ruleText.trim();
      if (!trimmed) return;
      const item = sanitizeMemoryItem({
        id: sanitizeMemoryId(`mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
        category: input.category,
        ruleText: trimmed,
        source: input.source ?? 'user',
      });
      p.setMemories((prev) => {
        const next = [item, ...prev];
        void p.pushToTasksVaultImmediately({ memories: next });
        void p.pushFullCloudBackupImmediately();
        try { localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      p.showToast('🧠 تم حفظ القاعدة في ذاكرة Gemini الدائمة (Google Cloud) ✓');
    },
    [p.pushFullCloudBackupImmediately, p.pushToTasksVaultImmediately, p.setMemories, p.showToast]
  );

  const handleDeleteMemory = useCallback(
    (id: string) => {
      p.setMemories((prev) => {
        const next = prev.filter((m) => m.id !== id);
        void p.pushToTasksVaultImmediately({ memories: next });
        void p.pushFullCloudBackupImmediately();
        try { localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      p.showToast('تم حذف القاعدة من ذاكرة Gemini الدائمة');
    },
    [p.pushFullCloudBackupImmediately, p.pushToTasksVaultImmediately, p.setMemories, p.showToast]
  );

  const handleUpdateMemory = useCallback(
    (id: string, patch: { category: MemoryCategory; ruleText: string }) => {
      const trimmed = patch.ruleText.trim();
      if (!trimmed) return;
      const existing = p.memories.find((m) => m.id === id);
      if (!existing) return;
      const updatedItem = sanitizeMemoryItem({ ...existing, category: patch.category, ruleText: trimmed });
      p.setMemories((prev) => {
        const next = prev.map((m) => (m.id === id ? updatedItem : m));
        void p.pushToTasksVaultImmediately({ memories: next });
        void p.pushFullCloudBackupImmediately();
        try { localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      p.showToast('✏️ تم حفظ تعديل القاعدة في ذاكرة Gemini الدائمة ✓');
    },
    [p.memories, p.pushFullCloudBackupImmediately, p.pushToTasksVaultImmediately, p.setMemories, p.showToast]
  );

  const handleResetChatMode = useCallback(
    (targetMode: 'chat' | 'maps' | 'search') => {
      p.setChatMessages((prev) => {
        const preserved = prev.filter((m) => m.mode !== targetMode);
        if (targetMode === 'chat') return [WELCOME_MESSAGE, ...preserved];
        return preserved.some((m) => m.mode === 'chat') ? preserved : [WELCOME_MESSAGE, ...preserved];
      });
    },
    [p.setChatMessages]
  );

  const handleExecuteMemoryActions = useCallback(
    (memoryActions: MemoryActionProposal[]) => {
      p.setMemories((prev) => {
        let next = [...prev];
        for (const act of memoryActions) {
          if (act.operation === 'remove') {
            const target = next.find((m) => (act.memoryId && m.id === act.memoryId) || m.ruleText.trim() === act.ruleText.trim());
            if (target) next = next.filter((m) => m.id !== target.id);
          } else if (act.operation === 'update' && act.memoryId) {
            const targetIdx = next.findIndex((m) => m.id === act.memoryId);
            if (targetIdx >= 0) {
              next[targetIdx] = sanitizeMemoryItem({ ...next[targetIdx], category: act.category, ruleText: act.ruleText });
            }
          } else {
            const existing = next.find((m) => m.ruleText.trim() === act.ruleText.trim());
            if (!existing) {
              next = [
                sanitizeMemoryItem({
                  id: sanitizeMemoryId(act.memoryId || `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`),
                  category: act.category,
                  ruleText: act.ruleText,
                  source: 'gemini',
                }),
                ...next,
              ];
            }
          }
        }
        void p.pushToTasksVaultImmediately({ memories: next });
        void p.pushFullCloudBackupImmediately();
        try { localStorage.setItem(MEMORIES_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    },
    [p.pushFullCloudBackupImmediately, p.pushToTasksVaultImmediately, p.setMemories]
  );

  return {
    handleUpdateSoundRepeat,
    handleLogSleepQuality,
    handleOpenAssistantWithPrompt,
    handleAddMemory,
    handleDeleteMemory,
    handleUpdateMemory,
    handleResetChatMode,
    handleExecuteMemoryActions,
  };
}
