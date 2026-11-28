import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Calendar,
  CheckSquare,
  LogOut,
  Plus,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { WorkspaceSidebarLists } from './WorkspaceSidebarLists';
import type { User } from 'firebase/auth';
import { MemoryItemCard } from '../MemoryItemCard';
import type {
  AppLanguage,
  GeoLocation,
  GoogleCalendarEventItem,
  GoogleTaskItem,
  LifeProfile,
  MemoryCategory,
  MemoryItem,
} from '../../types/dayrhythm';
import { MEMORY_CATEGORY_LABELS } from '../../engines/lifeRhythmEngine';
import { formatIsoTo12h } from '../../engines/prayerEngine';
import { cleanCalendarText } from '../../services/apiClient';
import { MEMORY_CATEGORIES, type SidebarTab } from './types';

export const WorkspaceSidebar: React.FC<{
  sidebarTab: SidebarTab;
  setSidebarTab: (t: SidebarTab) => void;
  memories: MemoryItem[];
  calendarEvents: GoogleCalendarEventItem[];
  googleTasks: GoogleTaskItem[];
  pendingTasks: GoogleTaskItem[];
  lifeProfile: LifeProfile;
  activeLocation: GeoLocation;
  language: AppLanguage;
  firestoreSynced: boolean;
  needsAuth: boolean;
  authUser: User | null;
  isLoggingIn: boolean;
  loadingEvents: boolean;
  loadingTasks: boolean;
  onOpenLifeProfile: () => void;
  onAddMemory: (input: { category: MemoryCategory; ruleText: string; source?: MemoryItem['source'] }) => void;
  onUpdateMemory: (id: string, patch: { category: MemoryCategory; ruleText: string }) => void;
  onDeleteMemory: (id: string) => void;
  onSignInClick: () => void;
  onRefreshWorkspace: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
}> = ({
  sidebarTab,
  setSidebarTab,
  memories,
  calendarEvents,
  googleTasks,
  pendingTasks,
  lifeProfile,
  activeLocation,
  language,
  firestoreSynced,
  needsAuth,
  authUser,
  isLoggingIn,
  loadingEvents,
  loadingTasks,
  onOpenLifeProfile,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onSignInClick,
  onRefreshWorkspace,
  onGoogleSignOut,
}) => {
  const [newMemoryCat, setNewMemoryCat] = useState<MemoryCategory>('priority');
  const [newMemoryRule, setNewMemoryRule] = useState('');
  const [memorySearch, setMemorySearch] = useState('');

  const filteredMemories = useMemo(() => {
    const q = memorySearch.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter(
      (m) =>
        m.ruleText.toLowerCase().includes(q) ||
        MEMORY_CATEGORY_LABELS[m.category].toLowerCase().includes(q)
    );
  }, [memories, memorySearch]);

  const handleQuickAddMemory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMemoryRule.trim();
    if (!trimmed) return;
    onAddMemory({ category: newMemoryCat, ruleText: trimmed, source: 'user' });
    setNewMemoryRule('');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[var(--bg-surface)] border border-white/[0.06] text-xs">
        {(
          [
            { id: 'memories', label: `الذاكرة (${memories.length})`, Icon: BookOpen },
            { id: 'events', label: `التقويم (${calendarEvents.length})`, Icon: Calendar },
            { id: 'tasks', label: `المهام (${pendingTasks.length})`, Icon: CheckSquare },
          ] as const
        ).map(({ id, label, Icon }) => {
          const active = sidebarTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSidebarTab(id)}
              className={`relative min-h-[44px] sm:min-h-[36px] px-2 py-1.5 rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap select-none ${
                active ? 'text-[#7FFFD4] font-bold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="gemini-sidebar-tab-pill"
                  transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                  className="absolute inset-0 rounded-xl bg-[#7FFFD4]/12 border border-[#7FFFD4]/25"
                />
              )}
              <Icon className="relative z-10 w-3.5 h-3.5 shrink-0" />
              <span className="relative z-10 truncate font-mono-tabular">{label}</span>
            </button>
          );
        })}
      </div>

      {sidebarTab === 'memories' && (
        <div className="space-y-4">
          <div className="pb-3.5 border-b border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white">الدستور الشخصي النشط</span>
              <button
                type="button"
                onClick={onOpenLifeProfile}
                className="min-h-[44px] sm:min-h-[32px] px-2 -mx-2 rounded-lg text-[11px] text-[#7FFFD4] hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>تعديل الدستور</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-zinc-400 font-mono-tabular">
              <span>الوزن {lifeProfile.weightKg} كجم</span>
              <span aria-hidden="true">·</span>
              <span>الكوب {lifeProfile.cupSizeMl} مل</span>
              <span aria-hidden="true">·</span>
              <span>النوم {Math.round(lifeProfile.sleepTargetMinutes / 60)} س</span>
              <span aria-hidden="true">·</span>
              <span>{firestoreSynced ? 'متزامن سحابياً مع الحساب' : 'محفوظ محلياً'}</span>
            </div>
            {lifeProfile.priorityOrderAr && (
              <p className="text-[11px] text-zinc-300 leading-relaxed line-clamp-2">
                {lifeProfile.priorityOrderAr}
              </p>
            )}
          </div>

          <form onSubmit={handleQuickAddMemory} className="space-y-2 pb-3.5 border-b border-white/[0.06]">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="quick-mem-input" className="text-xs font-semibold text-zinc-200">
                إضافة قاعدة دائمة للذاكرة
              </label>
              <select
                value={newMemoryCat}
                onChange={(e) => setNewMemoryCat(e.target.value as MemoryCategory)}
                aria-label="تصنيف القاعدة"
                className="min-h-[36px] rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-[#7FFFD4]"
              >
                {MEMORY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{MEMORY_CATEGORY_LABELS[cat]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="quick-mem-input"
                type="text"
                value={newMemoryRule}
                onChange={(e) => setNewMemoryRule(e.target.value)}
                placeholder="مثال: لا تضع مهام ثقيلة بعد 9 مساءً..."
                maxLength={280}
                className="flex-1 min-w-0 min-h-[44px] sm:min-h-[38px] rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
              />
              <button
                type="submit"
                disabled={!newMemoryRule.trim()}
                aria-label="حفظ في الذاكرة"
                className="min-h-[44px] sm:min-h-[38px] px-3.5 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] disabled:opacity-40 flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>حفظ</span>
              </button>
            </div>
          </form>

          <div className="space-y-2.5">
            {memories.length > 4 && (
              <input
                type="search"
                value={memorySearch}
                onChange={(e) => setMemorySearch(e.target.value)}
                placeholder="بحث في قواعد الذاكرة..."
                className="w-full min-h-[40px] sm:min-h-[34px] rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7FFFD4]"
              />
            )}

            {filteredMemories.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">
                {memories.length === 0
                  ? 'لا توجد قواعد محفوظة بعد — أضف أول قاعدة ليعتمدها Gemini في كل رد.'
                  : 'لا توجد قواعد مطابقة للبحث.'}
              </p>
            ) : (
              <ul className="divide-y divide-white/[0.06] max-h-[340px] overflow-y-auto pl-1">
                {filteredMemories.map((mem) => (
                  <li key={mem.id}>
                    <MemoryItemCard memory={mem} onSave={onUpdateMemory} onDelete={onDeleteMemory} variant="sidebar" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {(sidebarTab === 'events' || sidebarTab === 'tasks') && (
        <div className="space-y-3">
          {needsAuth ? (
            <div className="space-y-3 text-xs text-zinc-400">
              <p className="leading-relaxed">سجّل الدخول بحساب Google ليقرأ الشات أحداثك الفعلية ومهامك ويعدّلها بعد تأكيدك.</p>
              <button
                type="button"
                onClick={onSignInClick}
                disabled={isLoggingIn}
                className="w-full min-h-[42px] flex items-center justify-center gap-3 rounded-lg border border-[#747775] bg-white px-4 py-2 text-sm font-medium text-[#1F1F1F] hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-60"
              >
                <span>{isLoggingIn ? 'جارٍ الاتصال...' : 'تسجيل الدخول بحساب Google'}</span>
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 text-[11px] pb-2 border-b border-white/[0.06]">
                <span className="text-[#4ADE80] truncate">{authUser?.email ?? 'حساب Google متصل'}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => void onRefreshWorkspace()} className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer" title="تحديث التقويم والمهام" aria-label="تحديث التقويم والمهام">
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingEvents || loadingTasks ? 'animate-spin' : ''}`} />
                  </button>
                  <button type="button" onClick={() => void onGoogleSignOut()} className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-white/[0.06] cursor-pointer" title="تسجيل الخروج" aria-label="تسجيل الخروج">
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <WorkspaceSidebarLists
                sidebarTab={sidebarTab}
                calendarEvents={calendarEvents}
                googleTasks={googleTasks}
                language={language}
                activeLocation={activeLocation}
                lifeProfile={lifeProfile}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};
