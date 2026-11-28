import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  GripVertical,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { AppLanguage } from '../../types/dayrhythm';
import { formatMinutes12h } from '../../engines/prayerEngine';
import {
  formatDurationAr,
  type DayTimelineGhostSlot,
  type DayTimelinePlacedItem,
  type SnapToFreeWindowResult,
} from '../../engines/lifeRhythmEngine';
import {
  toPlacementTargetFromPlaced,
  type PlacementTarget,
  type TimelineRenderNode,
} from './types';
import { TimelineGhostNode, TimelineLockedNode } from './TimelineStaticNodes';

export const TimelineNodes: React.FC<{
  timelineRef: React.RefObject<HTMLDivElement | null>;
  nodes: TimelineRenderNode[];
  language: AppLanguage;
  nowMinutes: number;
  placementTarget: PlacementTarget | null;
  dragState: { target: PlacementTarget; snapped: SnapToFreeWindowResult | null } | null;
  swipePreview: { id: string; dx: number } | null;
  gestureRef: React.MutableRefObject<{
    active: boolean;
    mode: 'idle' | 'pending' | 'drag' | 'swipe';
    pointerId: number;
    startX: number;
    startY: number;
    item: DayTimelinePlacedItem;
    suppressNextClick: boolean;
  } | null>;
  onSelectGhostSlot: (ghost: DayTimelineGhostSlot) => void;
  onCardPointerDown: (e: React.PointerEvent<HTMLDivElement>, item: DayTimelinePlacedItem, fromHandle?: boolean) => void;
  onCardPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onFinishPointerGesture: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSelectPlacementTarget: (updater: (prev: PlacementTarget | null) => PlacementTarget | null) => void;
  onToggleMovable: (item: DayTimelinePlacedItem) => void;
  onTriggerAlert?: (title: string, emoji: string) => void;
  onDeleteEventBlock?: (item: DayTimelinePlacedItem) => void;
}> = ({
  timelineRef,
  nodes,
  language,
  nowMinutes,
  placementTarget,
  dragState,
  swipePreview,
  gestureRef,
  onSelectGhostSlot,
  onCardPointerDown,
  onCardPointerMove,
  onFinishPointerGesture,
  onSelectPlacementTarget,
  onToggleMovable,
  onTriggerAlert,
  onDeleteEventBlock,
}) => (
  <div ref={timelineRef} className="relative pr-4 sm:pr-5 space-y-2.5">
    <div
      aria-hidden="true"
      className="absolute right-[7px] sm:right-[9px] top-3 bottom-3 w-px bg-[var(--border-subtle)]"
    />

    {nodes.map((node) => {
      if (node.kind === 'ghost') {
        return (
          <TimelineGhostNode
            key={node.data.id}
            ghost={node.data}
            language={language}
            dragState={dragState}
            onSelectGhostSlot={onSelectGhostSlot}
          />
        );
      }

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
      const isPlacementSelected = placementTarget?.id === item.id;
      const isDraggingThis = dragState?.target.id === item.id;
      const swipeDx = swipePreview?.id === item.id ? swipePreview.dx : 0;

      return (
        <div key={item.id} className="relative flex items-stretch gap-3">
          <span
            aria-hidden="true"
            className={`relative z-10 mt-4 -mr-[19px] sm:-mr-[21px] h-2.5 w-2.5 rounded-full border shrink-0 transition-colors ${
              item.completed
                ? 'bg-[#4ADE80] border-[#4ADE80]'
                : isNow || isPlacementSelected || isDraggingThis
                  ? 'bg-[#7FFFD4] border-[#7FFFD4] shadow-[0_0_10px_rgba(127,255,212,0.55)]'
                  : 'bg-[var(--bg-card)] border-[#7FFFD4]/45'
            }`}
          />

          <div
            onPointerDown={(e) => onCardPointerDown(e, item, false)}
            onPointerMove={onCardPointerMove}
            onPointerUp={onFinishPointerGesture}
            onPointerCancel={onFinishPointerGesture}
            onClick={(e) => {
              const targetEl = e.target as HTMLElement | null;
              if (targetEl?.closest('button, a')) return;
              if (gestureRef.current?.suppressNextClick) {
                gestureRef.current.suppressNextClick = false;
                return;
              }
              onSelectPlacementTarget((prev) =>
                prev?.id === item.id ? null : toPlacementTargetFromPlaced(item)
              );
            }}
            style={{
              transform:
                swipeDx !== 0
                  ? `translateX(${swipeDx}px)`
                  : isDraggingThis
                    ? 'scale(1.03)'
                    : undefined,
            }}
            className={`relative flex-1 rounded-2xl border px-3 py-2.5 touch-pan-y select-none transition-[border-color,background-color,box-shadow,transform] duration-150 flex items-center justify-between gap-2 cursor-pointer ${
              isDraggingThis
                ? 'border-[#7FFFD4] bg-[var(--bg-card-elevated,var(--bg-card))] shadow-[0_0_24px_rgba(127,255,212,0.28)] z-20'
                : isPlacementSelected
                  ? 'border-[#7FFFD4] bg-[rgba(127,255,212,0.10)] ring-1 ring-[#7FFFD4]/35'
                  : isNow
                    ? 'border-[var(--border-active)] bg-[var(--bg-card-elevated,var(--bg-card))] ring-1 ring-[#7FFFD4]/20'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-active)]'
            } ${item.completed ? 'opacity-55' : ''}`}
          >
            {Math.abs(swipeDx) > 20 && (
              <span
                className={`pointer-events-none absolute top-1.5 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold flex items-center gap-1 ${
                  swipeDx > 0
                    ? 'bg-[#7FFFD4]/20 text-[#7FFFD4] border border-[#7FFFD4]/40'
                    : 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                }`}
              >
                {swipeDx > 0 ? (
                  <>
                    <ArrowRight className="w-3 h-3" />
                    <span>النافذة التالية</span>
                  </>
                ) : (
                  <>
                    <ArrowLeft className="w-3 h-3" />
                    <span>تحتاج توظيف</span>
                  </>
                )}
              </span>
            )}

            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onToggleMovable(item)}
                aria-label={item.completed ? `إعادة فتح ${item.title}` : `إتمام ${item.title}`}
                className="min-h-[44px] min-w-[44px] -ms-1 flex items-center justify-center rounded-xl text-zinc-400 hover:text-[#7FFFD4] hover:bg-white/[0.04] cursor-pointer shrink-0 transition-colors"
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

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onPointerDown={(e) => {
                  const cardEl = e.currentTarget.closest('[class*="rounded-2xl"]') as HTMLDivElement | null;
                  if (cardEl) {
                    onCardPointerDown(
                      { ...e, currentTarget: cardEl } as React.PointerEvent<HTMLDivElement>,
                      item,
                      true
                    );
                  }
                }}
                aria-label={`سحب ${item.title} إلى نافذة أخرى`}
                title="سحب مغناطيسي لنافذة فراغ"
                className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] touch-none flex items-center justify-center rounded-xl text-zinc-500 hover:text-[#7FFFD4] hover:bg-white/[0.04] cursor-grab active:cursor-grabbing transition-colors"
              >
                <GripVertical className="w-4 h-4" />
              </button>
              {onTriggerAlert && (
                <button
                  type="button"
                  onClick={() => onTriggerAlert(item.title, item.emoji)}
                  aria-label={`تجربة تنبيه ${item.title}`}
                  className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-[#7FFFD4] hover:bg-white/[0.04] cursor-pointer transition-colors"
                  title="تجربة التنبيه"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              )}
              {item.googleHtmlLink && (
                <a
                  href={item.googleHtmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`فتح ${item.title} في Google Calendar`}
                  className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-[#4ADE80] hover:bg-white/[0.04] transition-colors"
                  title="فتح في Google Calendar"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              {item.kind === 'event' && onDeleteEventBlock && (
                <button
                  type="button"
                  onClick={() => onDeleteEventBlock(item)}
                  aria-label={`حذف ${item.title}`}
                  className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      );
    })}
  </div>
);
