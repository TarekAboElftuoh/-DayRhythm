import { useRef, useState } from 'react';
import type { PhoneBatteryTelemetry } from '../../types/dayrhythm';
import { formatChargeEtaShort, type CapsuleSize } from '../pip/types';

export function getCapsuleSizeTokens(size: CapsuleSize, isVertical: boolean) {
  if (size === 'sm') {
    return {
      shellPad: isVertical ? 'px-2.5 py-2' : 'px-3 py-1.5',
      shellGap: isVertical ? 'gap-1.5' : 'gap-2',
      emojiCls: 'text-sm leading-none shrink-0',
      clockCls: 'font-digits text-[11px] font-bold tracking-tight shrink-0',
    };
  }
  if (size === 'lg') {
    return {
      shellPad: isVertical ? 'px-4 py-3' : 'px-4 py-2.5',
      shellGap: isVertical ? 'gap-2.5' : 'gap-3',
      emojiCls: 'text-lg leading-none shrink-0',
      clockCls: 'font-digits text-sm font-bold tracking-tight shrink-0',
    };
  }
  return {
    shellPad: isVertical ? 'px-3 py-2.5' : 'px-3.5 py-2',
    shellGap: isVertical ? 'gap-2' : 'gap-2.5',
    emojiCls: 'text-[15px] leading-none shrink-0',
    clockCls: 'font-digits text-xs font-bold tracking-tight shrink-0',
  };
}

export function computePhoneBatteryBadge(phoneBattery: PhoneBatteryTelemetry | null | undefined) {
  const phoneBatteryFresh = Boolean(phoneBattery && Date.now() - phoneBattery.updatedAtMs < 30 * 60_000);
  const showPhoneChargingBadge = Boolean(phoneBatteryFresh && phoneBattery?.charging);
  const phoneReachedLimit = Boolean(
    showPhoneChargingBadge && phoneBattery && phoneBattery.levelPct >= phoneBattery.chargeLimitPct
  );
  const phoneEtaShort = showPhoneChargingBadge
    ? formatChargeEtaShort(phoneBattery?.chargeTimeRemainingMin)
    : '';
  const phoneBatteryBadge =
    phoneBatteryFresh && phoneBattery
      ? `${phoneBattery.charging ? '⚡' : '🔋'}${phoneBattery.levelPct}%${phoneEtaShort ? ` · ${phoneEtaShort}` : ''}`
      : '';

  return { phoneBatteryFresh, showPhoneChargingBadge, phoneReachedLimit, phoneEtaShort, phoneBatteryBadge };
}

export function useCapsuleDrag() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || e.button !== 0) return;
    dragStateRef.current = { active: true, startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    setOffset({
      x: dragStateRef.current.originX + (e.clientX - dragStateRef.current.startX),
      y: dragStateRef.current.originY + (e.clientY - dragStateRef.current.startY),
    });
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  return { offset, handlePointerDown, handlePointerMove, handlePointerUp };
}
