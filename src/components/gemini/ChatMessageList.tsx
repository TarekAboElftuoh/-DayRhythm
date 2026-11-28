import React from 'react';
import { ExternalLink, Loader2, MapPin, RefreshCw } from 'lucide-react';
import type {
  AppLanguage,
  AppSettingsPatch,
  CalendarActionProposal,
  CreativeActivityActionProposal,
  GeoLocation,
  HabitActionProposal,
  LifeProfile,
  MedicationActionProposal,
  MemoryActionProposal,
  PersistedChatMessage,
  SettingsPatchProposal,
  SettingsSnapshotContext,
  TaskActionProposal,
} from '../../types/dayrhythm';
import { formatIsoTo12h } from '../../engines/prayerEngine';
import { cleanDisplayMessageText } from '../../services/geminiClient';
import { ProposalConfirmBlock } from './ProposalConfirmBlock';
import type { AssistantMode } from './types';

export const ChatMessageList: React.FC<{
  mode: AssistantMode;
  visibleMessages: PersistedChatMessage[];
  loading: boolean;
  streamingMsgId: string | null;
  streamStatusText: string;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  threadEndRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  language: AppLanguage;
  activeLocation: GeoLocation;
  lifeProfile: LifeProfile;
  currentSettingsSnapshot?: SettingsSnapshotContext;
  memoriesCount: number;
  needsAuth: boolean;
  userCoords: { lat: number; lng: number };
  executingProposalId: string | null;
  onRetryMessage: (prompt?: string, targetMode?: AssistantMode) => void;
  onConfirmProposal: (
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
  onCancelProposal: (msgId: string) => void;
}> = ({
  mode,
  visibleMessages,
  loading,
  streamingMsgId,
  streamStatusText,
  scrollContainerRef,
  threadEndRef,
  onScroll,
  language,
  activeLocation,
  lifeProfile,
  currentSettingsSnapshot,
  memoriesCount,
  needsAuth,
  userCoords,
  executingProposalId,
  onRetryMessage,
  onConfirmProposal,
  onCancelProposal,
}) => (
  <div
    ref={scrollContainerRef}
    onScroll={onScroll}
    className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4 max-sm:px-3 max-sm:py-3 max-sm:space-y-3"
  >
    {visibleMessages.length === 0 && (
      <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] p-4 text-xs text-zinc-300 space-y-1.5 leading-relaxed">
        <div className="font-bold text-white">
          {mode === 'maps'
            ? '📍 خرائط الأماكن القريبة (محادثة مستقلة)'
            : mode === 'search'
              ? '🔎 بحث الويب المباشر (محادثة مستقلة)'
              : '💬 شات إيقاع اليوم · Gemini'}
        </div>
        <p className="text-zinc-400">
          {mode === 'maps'
            ? 'اسأل عن أقرب مسجد، صيدلية، مطعم أو مكان حول موقعك الحالي — ستحصل على المسافات وروابط خرائط Google مباشرة بدون التأثير على شات المهام.'
            : mode === 'search'
              ? 'ابحث عن الطقس، مواقيت الصلاة، المكملات أو أي معلومة حية مع المصادر الموثقة في سجل مستقل تماماً عن شات التقويم.'
              : 'ابدأ محادثة جديدة مع Gemini لإدارة تقويمك، مهامك، علاجاتك ووزنك بسرعة فورية.'}
        </p>
      </div>
    )}

    {visibleMessages.map((m) => {
      const isStreamingThis = streamingMsgId === m.id;
      const displayProposal = m.pendingProposal;
      return (
        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
          <article
            className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed transition-colors ${
              m.role === 'user'
                ? 'bg-[#7FFFD4]/[0.08] border border-[#7FFFD4]/20 text-zinc-50'
                : m.error
                  ? 'bg-rose-500/10 border border-rose-500/30 text-rose-200'
                  : 'bg-[var(--bg-card)] border border-white/[0.06] text-zinc-100'
            }`}
          >
            <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500 mb-1.5">
              <span>
                {m.role === 'user'
                  ? 'أنت'
                  : m.mode === 'maps'
                    ? 'خرائط جوجل · Gemini'
                    : m.mode === 'search'
                      ? 'بحث الويب · Gemini'
                      : 'Gemini · إيقاع اليوم'}
              </span>
              {m.createdAtIso && (
                <span className="font-mono-tabular">
                  {formatIsoTo12h(m.createdAtIso, language, {
                    includeDate: false,
                    timeZone: activeLocation.timeZone || lifeProfile.currentTimeZone || 'Africa/Cairo',
                  })}
                </span>
              )}
            </div>

            <div className="whitespace-pre-wrap break-words">
              {cleanDisplayMessageText(m.text)}
              {isStreamingThis && (
                <span className="inline-block w-1.5 h-3.5 align-middle mr-1 bg-[#7FFFD4] animate-pulse" aria-hidden="true" />
              )}
            </div>

            {m.error && m.retryPrompt && (
              <div className="mt-2.5 pt-2 border-t border-rose-500/20 flex items-center justify-between gap-2">
                <span className="text-[11px] text-rose-300/80">يمكنك إعادة إرسال نفس الرسالة مباشرة</span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onRetryMessage(m.retryPrompt, m.mode)}
                  className="px-3 py-1 rounded-lg bg-rose-500/20 border border-rose-400/40 text-xs text-rose-100 font-semibold hover:bg-rose-500/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>إعادة المحاولة</span>
                </button>
              </div>
            )}

            {m.role === 'model' && !m.error && !isStreamingThis && m.id !== 'welcome-1' && (m.latencyMs || m.memoriesAppliedCount !== undefined || m.cached) && (
              <div className="mt-2 pt-1.5 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 font-mono-tabular">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span>معتمد على الدستور و {m.memoriesAppliedCount ?? memoriesCount} ذاكرة</span>
                  {m.cached ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#7FFFD4]">استجابة مؤقتة فورية</span>
                    </>
                  ) : typeof m.latencyMs === 'number' && m.latencyMs > 0 ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{(m.latencyMs / 1000).toFixed(1)} ث</span>
                    </>
                  ) : null}
                </div>
                {m.cached && m.retryPrompt && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onRetryMessage(m.retryPrompt, m.mode)}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-[#7FFFD4] cursor-pointer disabled:opacity-40"
                    title="توليد رد جديد وتجاوز الذاكرة المؤقتة"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>تحديث الرد</span>
                  </button>
                )}
              </div>
            )}

            {m.executionLinks && m.executionLinks.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap gap-2">
                {m.executionLinks.map((lnk, i) => (
                  <a key={i} href={lnk.htmlLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11px] text-[#4ADE80] hover:underline">
                    <span>فتح «{lnk.title}» في Google Calendar</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            )}

            {displayProposal && (
              <ProposalConfirmBlock
                msgId={m.id}
                proposal={displayProposal}
                lifeProfile={lifeProfile}
                currentSettingsSnapshot={currentSettingsSnapshot}
                needsAuth={needsAuth}
                language={language}
                executingProposalId={executingProposalId}
                onConfirm={onConfirmProposal}
                onCancel={onCancelProposal}
              />
            )}

            {m.places && m.places.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2.5">
                <div className="text-[11px] font-semibold text-[#7FFFD4]">الأماكن على خرائط جوجل:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {m.places.map((p, idx) => (
                    <a key={idx} href={p.uri} target="_blank" rel="noopener noreferrer" className="min-h-[44px] rounded-2xl border border-white/[0.06] bg-[var(--bg-surface)] p-3.5 hover:bg-[var(--bg-card)] hover:border-[#7FFFD4]/35 transition-colors block">
                      <div className="flex items-center justify-between gap-2 text-white font-semibold text-xs">
                        <span className="truncate">{p.title}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-[#7FFFD4] shrink-0" />
                      </div>
                      {p.snippets && p.snippets[0] && <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{p.snippets[0]}</p>}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {m.role === 'model' && m.mode === 'maps' && (() => {
              const msgIdx = visibleMessages.findIndex((item) => item.id === m.id);
              const prevUserMsg = msgIdx > 0 ? [...visibleMessages.slice(0, msgIdx)].reverse().find((item) => item.role === 'user') : undefined;
              const rawQuery = (m.retryPrompt || prevUserMsg?.text || m.text || '').trim();
              const isMosque = /(مسجد|مساجد|جامع|جوامع|زاوية|صلاة|الجماعة|mosque)/i.test(rawQuery);
              const fallbackKeyword = isMosque
                ? 'مسجد'
                : rawQuery.replace(/(أقرب|اقرب|في|بالقرب|من|موقعي|الحالي|المفتوحة|الآن|الان|طريقي)/g, ' ').replace(/\s+/g, ' ').trim() || 'أماكن قريبة';
              const gmapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(fallbackKeyword)}/@${userCoords.lat.toFixed(6)},${userCoords.lng.toFixed(6)},18z`;
              return (
                <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] flex justify-start" dir="rtl">
                  <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" className="min-h-[44px] sm:min-h-[34px] inline-flex items-center gap-1.5 rounded-xl border border-[#7FFFD4]/30 bg-[#7FFFD4]/10 px-3.5 py-1.5 text-xs font-semibold text-[#7FFFD4] hover:bg-[#7FFFD4]/18 transition-colors">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>{isMosque ? 'افتح أقرب مسجد على خرائط جوجل' : 'افتح على خرائط جوجل (شارعك)'}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
              );
            })()}

            {m.sources && m.sources.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-white/[0.06] space-y-1.5">
                <div className="text-[11px] font-semibold text-[#7FFFD4]">مصادر البحث الموثقة:</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {m.sources.map((s, idx) => (
                    <a key={idx} href={s.uri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-[#7FFFD4] underline underline-offset-4">
                      <span>{s.title}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </article>
        </div>
      );
    })}

    {loading && !streamingMsgId && (
      <div className="flex justify-end">
        <div className="rounded-2xl border border-white/[0.06] bg-[var(--bg-card)] px-4 py-3 text-xs text-zinc-300 flex items-center gap-2.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7FFFD4]" />
          <span>{streamStatusText || 'جارٍ الرد وفق دستوري وذاكرتي...'}</span>
        </div>
      </div>
    )}

    <div ref={threadEndRef} />
  </div>
);
