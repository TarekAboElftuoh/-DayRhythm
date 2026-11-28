import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BellRing,
  BatteryCharging,
  Columns2,
  Power,
  Rows2,
  Volume2,
  VolumeX,
  PictureInPicture2,
  Cloud,
} from 'lucide-react';
import {
  BatteryGuardState,
  CapsuleOrientation,
  CapsuleSize,
  GeoLocation,
  PhoneBatteryTelemetry,
  QuietModeType,
  ScheduleBlock,
} from '../../types/dayrhythm';
import { QUIET_MODE_LABELS } from '../../engines/i18n';
import { CapsulePrefs } from '../FloatingPiPCapsule';


export interface OverlaySimulatorViewProps {
  blocks: ScheduleBlock[];
  batteryGuard: BatteryGuardState;
  quietMode: QuietModeType;
  stealthAudioOnly: boolean;
  onToggleStealthAudioOnly: () => void;
  alarmRinging: boolean;
  onTriggerRing: () => void;
  onDismissTwoWay: () => void;
  onSimulateCharge90?: () => void;
  onSimulatePowerDisconnect?: () => void;
  onSimulateWindowsWake?: () => string;
  phoneBattery?: PhoneBatteryTelemetry | null;
  onChangeChargeLimit?: (limitPct: number) => void;
  capsulePrefs?: CapsulePrefs;
  onChangeCapsulePrefs?: (next: CapsulePrefs) => void;
  activeLocation?: GeoLocation;
  firestoreSynced?: boolean;
}

export function formatEtaAr(etaMin?: number): string {
  if (typeof etaMin !== 'number' || !Number.isFinite(etaMin) || etaMin < 0) return '';
  if (etaMin === 0) return 'مكتمل الشحن';
  if (etaMin >= 60) {
    const h = Math.floor(etaMin / 60);
    const m = etaMin % 60;
    return m > 0 ? `متبقي ~${h} س و ${m} د` : `متبقي ~${h} ساعة`;
  }
  return `متبقي ~${etaMin} دقيقة`;
}

