import React, { useState } from 'react';
import { Brain, Plus } from 'lucide-react';
import { MemoryItemCard } from '../MemoryItemCard';
import { SunlightSettingsSection } from '../SunlightSettingsSection';
import type { MemoryCategory, MemoryItem, SunlightSettings } from '../../types/dayrhythm';
import { MEMORY_CATEGORY_LABELS } from '../../engines/lifeRhythmEngine';

export const SanctuaryGpsMemorySection: React.FC<{
  sunlightSettings?: SunlightSettings;
  onUpdateSunlightSettings?: (next: SunlightSettings) => void;
  memories: MemoryItem[];
  onAddMemory: (input: { category: MemoryCategory; ruleText: string }) => void;
  onUpdateMemory?: (id: string, patch: { category: MemoryCategory; ruleText: string }) => void;
  onDeleteMemory: (id: string) => void;
}> = ({
  sunlightSettings,
  onUpdateSunlightSettings,
  memories,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
}) => {
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryCategory>('priority');
  const [newMemoryText, setNewMemoryText] = useState('');

  const handleAddMemorySubmit = () => {
    const trimmed = newMemoryText.trim();
    if (!trimmed) return;
    onAddMemory({ category: newMemoryCategory, ruleText: trimmed });
    setNewMemoryText('');
  };

  return (
    <>
      {sunlightSettings && onUpdateSunlightSettings && (
        <SunlightSettingsSection settings={sunlightSettings} onChange={onUpdateSunlightSettings} />
      )}

      <section className="rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#7FFFD4]" />
            <span>ذاكرة Gemini الدائمة ({memories.length} قواعد محفوظة)</span>
          </h3>
          <span className="text-[11px] text-zinc-400">يقرؤها Gemini في كل محادثة ويضيف إليها ما تعلّمه له</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={newMemoryCategory}
            onChange={(e) => setNewMemoryCategory(e.target.value as MemoryCategory)}
            className="rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-2.5 py-2 text-zinc-200 focus:outline-none focus:border-[#7FFFD4]"
          >
            {(Object.keys(MEMORY_CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
              <option key={cat} value={cat}>{MEMORY_CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
          <input
            type="text" maxLength={320} value={newMemoryText}
            onChange={(e) => setNewMemoryText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddMemorySubmit(); } }}
            placeholder="اكتب أي قاعدة جديدة تريد أن يتذكرها Gemini دائماً..."
            className="flex-1 rounded-lg border border-white/[0.08] bg-[var(--bg-card)] px-3 py-2 text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
          />
          <button
            type="button" onClick={handleAddMemorySubmit} disabled={!newMemoryText.trim()}
            className="px-3 py-2 rounded-lg bg-[#7FFFD4]/15 border border-[#7FFFD4]/45 text-[#7FFFD4] font-semibold hover:bg-[#7FFFD4]/25 disabled:opacity-40 flex items-center justify-center gap-1 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>حفظ</span>
          </button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
          {memories.map((mem) => (
            <MemoryItemCard key={mem.id} memory={mem} onSave={onUpdateMemory} onDelete={onDeleteMemory} variant="modal" />
          ))}
        </div>
      </section>
    </>
  );
};
