import React from 'react';
import { CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import type { AppLanguage } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';
import {
  formatDurationAr,
  type DayTimelinePlacedItem,
} from '../../engines/lifeRhythmEngine';
import type { TimelineRenderNode } from './types';
import { TimelineLockedNode } from './TimelineStaticNodes';

export const TimelineNodes: React.FC<{
  nodes: TimelineRenderNode[];
  language: AppLanguage;
  nowMinutes: number;
  onToggleMovable: (item: DayTimelinePlacedItem) => void;
}> = ({ nodes, language, nowMinutes, onToggleMovable }) => (
  <div className="relative pr-4 sm:pr-5 space-y-2.5">
    <div
      aria-hidden="true"
      className="absolute right-[7px] sm:right-[9px] top-3 bottom-3 w-px bg-[var(--border-subtle)]"
    />

    {nodes.map((node) => {
      if (node.kind === 'ghost') return null;

      if (node.kind === 'locked') {
        return (
          <TimelineLockedNode
            key={node.data.id}
            blk={node.data}
            language={language}
            nowMinutes={nowMinutes}
          />
        );
      }

      const item = node.data;
      const isNow =
        !item.completed && nowMinutes >= item.startMin && nowMinutes < item.endMin;

      return (
        <div key={item.id} className="relative flex items-stretch gap-3">
          <span
            aria-hidden="true"
            className={`relative z-10 mt-4 -mr-[19px] sm:-mr-[21px] h-2.5 w-2.5 rounded-full border shrink-0 transition-colors ${
              item.completed
                ? 'bg-[#4ADE80] border-[#4ADE80]'
                : isNow
                  ? 'bg-[#7FFFD4] border-[#7FFFD4] shadow-[0_0_10px_rgba(127,255,212,0.55)]'
                  : 'bg-[var(--bg-card)] border-[#7FFFD4]/45'
            }`}
          />

          <div
            className={`relative flex-1 rounded-2xl border px-3 py-2.5 flex items-center justify-between gap-2 transition-colors ${
              isNow
                ? 'border-[var(--border-active)] bg-[var(--bg-card-elevated,var(--bg-card))] ring-1 ring-[#7FFFD4]/20'
                : 'border-[var(--border-subtle)] bg-[var(--bg-card)]'
            } ${item.completed ? 'opacity-55' : ''}`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onToggleMovable(item)}
                aria-label={item.completed ? `إعادة فتح ${item.title}` : `إتمام ${item.title}`}
                className="min-h-[40px] min-w-[40px] -ms-1 flex items-center justify-center rounded-xl text-zinc-400 hover:text-[#7FFFD4] hover:bg-white/[0.04] cursor-pointer shrink-0 transition-colors"
              >
                {item.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-[#4ADE80]" />
                ) : (
                  <Circle className="w-5 h-5" />
                )}
              </button>

              <span className="text-lg leading-none shrink-0" aria-hidden="true">
                {item.emoji}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-sm font-semibold break-words ${
                      item.completed ? 'line-through text-zinc-500' : 'text-zinc-100'
                    }`}
                  >
                    {item.title}
                  </span>
                  {isNow && (
                    <span className="text-[11px] font-bold text-[#4ADE80]">· الآن</span>
                  )}
                  {item.isTodayOverride && (
                    <span className="rounded-md bg-[#7FFFD4]/12 border border-[#7FFFD4]/25 px-1.5 py-0.2 text-[10px] text-[#7FFFD4]">
                      اليوم فقط
                    </span>
                  )}
                </div>
                <div className="font-mono-tabular text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[#7FFFD4]/90">
                    {formatMinutes12h(item.startMin, language)} –{' '}
                    {formatMinutes12h(item.endMin, language)}
                  </span>
                  <span className="text-zinc-500">· {formatDurationAr(item.durationMin)}</span>
                </div>
              </div>
            </div>

            {item.googleHtmlLink && (
              <a
                href={item.googleHtmlLink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`فتح ${item.title} في Google Calendar`}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-[#4ADE80] hover:bg-white/[0.04] transition-colors shrink-0"
                title="فتح في Google Calendar"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      );
    })}
  </div>
);
