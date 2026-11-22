import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Pencil, RotateCcw, Save, Trash2 } from 'lucide-react';
import { MemoryCategory, MemoryItem } from '../types/dayrhythm';
import { MEMORY_CATEGORY_LABELS } from '../engines/lifeRhythmEngine';

const MEMORY_CATEGORIES: MemoryCategory[] = [
  'priority',
  'sleep',
  'fasting',
  'hydration',
  'work_devops',
  'travel',
  'general',
];

interface MemoryItemCardProps {
  memory: MemoryItem;
  onSave?: (id: string, patch: { category: MemoryCategory; ruleText: string }) => void;
  onDelete: (id: string) => void;
  variant?: 'sidebar' | 'modal';
}

export const MemoryItemCard: React.FC<MemoryItemCardProps> = ({
  memory,
  onSave,
  onDelete,
  variant = 'sidebar',
}) => {
  const [draftText, setDraftText] = useState(memory.ruleText);
  const [draftCategory, setDraftCategory] = useState<MemoryCategory>(memory.category);
  const [isFocused, setIsFocused] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  // Sync local draft when upstream memory updates (e.g., from Firestore cross-device sync)
  useEffect(() => {
    setDraftText(memory.ruleText);
    setDraftCategory(memory.category);
  }, [memory.id, memory.ruleText, memory.category]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  // Auto-resize inline textarea smoothly to match content height
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(el.scrollHeight, 26)}px`;
  }, [draftText, isFocused]);

  const trimmedDraft = draftText.trim();
  const hasChanges =
    trimmedDraft !== memory.ruleText.trim() || draftCategory !== memory.category;
  const canSave = Boolean(onSave && hasChanges && trimmedDraft.length > 0);
  const isEditable = Boolean(onSave);

  const handleSave = () => {
    if (!canSave || !onSave) return;
    onSave(memory.id, {
      category: draftCategory,
      ruleText: trimmedDraft.slice(0, 320),
    });
    setIsFocused(false);
    textareaRef.current?.blur();
    setJustSaved(true);
    if (savedTimerRef.current !== null) {
      window.clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = window.setTimeout(() => {
      setJustSaved(false);
    }, 1800);
  };

  const handleRevert = () => {
    setDraftText(memory.ruleText);
    setDraftCategory(memory.category);
    setIsFocused(false);
    textareaRef.current?.blur();
  };

  const focusEditor = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      // ignore selection error
    }
  };

  const sourceLabel =
    memory.source === 'gemini'
      ? 'محفوظ من الشات'
      : memory.source === 'system_seed'
        ? 'قاعدة أساسية'
        : 'يدوي';

  const containerClass =
    variant === 'modal'
      ? `rounded-xl border transition-colors px-3 py-2.5 space-y-2 ${
          hasChanges || isFocused
            ? 'border-[#7FFFD4]/55 bg-[#7FFFD4]/[0.05]'
            : 'border-white/10 bg-white/[0.03] hover:border-white/20'
        }`
      : `py-2.5 first:pt-0 space-y-1.5 rounded-lg transition-colors ${
          hasChanges || isFocused ? 'px-2 bg-[#7FFFD4]/[0.05] -mx-1' : ''
        }`;

  return (
    <div className={containerClass}>
      {/* Header Row: Category (editable on focus/change) + Source + Quick Focus/Delete */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          {isEditable && (isFocused || hasChanges) ? (
            <select
              value={draftCategory}
              onChange={(e) => setDraftCategory(e.target.value as MemoryCategory)}
              aria-label="تصنيف القاعدة"
              className="rounded-md border border-[#7FFFD4]/35 bg-black px-2 py-0.5 text-[11px] text-[#7FFFD4] focus:outline-none focus:border-[#7FFFD4]"
            >
              {MEMORY_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {MEMORY_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[11px] font-semibold text-[#7FFFD4]">
              {MEMORY_CATEGORY_LABELS[draftCategory] ?? 'قواعد عامة'}
            </span>
          )}

          {variant === 'modal' && (
            <span className="text-[11px] text-zinc-500">· {sourceLabel}</span>
          )}

          {justSaved && !hasChanges && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#4ADE80]">
              <Check className="w-3 h-3" />
              <span>تم الحفظ</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {isEditable && !hasChanges && (
            <button
              type="button"
              onClick={focusEditor}
              aria-label="تحرير نص القاعدة"
              title="تحرير نص القاعدة مباشرة"
              className="p-1 rounded-md text-zinc-500 hover:text-[#7FFFD4] hover:bg-[#7FFFD4]/10 transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(memory.id)}
            aria-label="حذف القاعدة"
            title="حذف القاعدة"
            className="p-1 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Directly Editable Inline Memory Text */}
      <textarea
        ref={textareaRef}
        rows={1}
        maxLength={320}
        readOnly={!isEditable}
        value={draftText}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          // Keep editing chrome visible if there are unsaved changes
          if (!hasChanges) {
            setIsFocused(false);
          }
        }}
        onChange={(e) => setDraftText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSave();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            handleRevert();
          }
        }}
        aria-label="نص قاعدة الذاكرة"
        placeholder="اكتب نص القاعدة..."
        className={`w-full resize-none overflow-hidden rounded-lg text-xs leading-relaxed transition-colors focus:outline-none ${
          isEditable
            ? hasChanges || isFocused
              ? 'border border-[#7FFFD4]/45 bg-black/80 px-2.5 py-1.5 text-white'
              : 'border border-transparent bg-transparent px-1 py-0.5 -mx-1 text-zinc-200 hover:border-white/15 hover:bg-white/[0.03] cursor-text'
            : 'border border-transparent bg-transparent text-zinc-200'
        }`}
      />

      {/* Explicit Save & Revert Actions whenever text or category is modified */}
      {isEditable && (hasChanges || isFocused) && (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px] text-zinc-500 font-mono-tabular">
            {trimmedDraft.length}/320
            {hasChanges ? ' · تعديل غير محفوظ' : ' · اضغط لتحرير النص'}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasChanges && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleRevert}
                className="px-2 py-1 rounded-md border border-white/15 text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>تراجع</span>
              </button>
            )}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              disabled={!canSave}
              onClick={handleSave}
              className="px-2.5 py-1 rounded-md bg-[#7FFFD4] text-black text-[11px] font-bold hover:bg-[#66eec2] disabled:opacity-35 flex items-center gap-1 cursor-pointer transition-opacity"
            >
              <Save className="w-3 h-3" />
              <span>حفظ</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
