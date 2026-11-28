import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BatteryCharging,
  MapPin,
  BellRing,
  CheckCircle2,
  Cloud,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Clock,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import {
  AppLanguage,
  BatteryGuardState,
  GeoLocation,
  HydrationDayLog,
  PhoneBatteryTelemetry,
  PrayerTimeItem,
  QuietModeType,
  ScheduleBlock,
  TravelState,
} from '../../types/dayrhythm';
import { LiveAlertsLeadMinutes, OnePlusDeviceSettings } from '../../firebase';
import { QUIET_MODE_LABELS } from '../../engines/i18n';
import { AndroidPermissionsCard } from '../AndroidPermissionsCard';
import {
  type AndroidPermissionsStatus,
  getAndroidPermissionsStatus,
  isAndroidNative,
  openLiveAlertSettings,
} from '../../services/androidPermissions';

export interface MobilePreviewViewProps {
  language: AppLanguage;
  prayers: PrayerTimeItem[];
  blocks: ScheduleBlock[];
  hydrationToday: HydrationDayLog;
  onLogWaterCup: () => void;
  quietMode: QuietModeType;
  quietRemainingSec: number;
  adhanOverrideSilent: boolean;
  onTestAdhanChime: () => void;
  travelState: TravelState;
  batteryGuard: BatteryGuardState;
  onSimulateCharge90: () => void;
  onSimulatePowerDisconnect: () => void;
  onSimulateBedtimeLowBattery: () => void;
  onToggleBypassCharging: (limit: number | null) => void;
  hasShakeUndoActive: boolean;
  onTriggerShakeUndo: () => void;
  alarmRinging: boolean;
  onTriggerRing?: () => void;
  onDismissTwoWay: () => void;
  deviceSettings: OnePlusDeviceSettings;
  onUpdateDeviceSettings: (patch: Partial<OnePlusDeviceSettings>) => void;
  firestoreSynced: boolean;
  activeTimeZone?: string;
  activeLocation?: GeoLocation;
  onRefreshGps?: () => void;
  gpsSyncing?: boolean;
  phoneBattery?: PhoneBatteryTelemetry | null;
  phoneChargeLimitPct?: number;
  onUpdatePhoneChargeLimit?: (limitPct: number) => void;
  smartChargeAlertEnabled?: boolean;
  onToggleSmartChargeAlertEnabled?: () => void;
  upcomingPreview?: {
    emoji: string;
    title: string;
    countdownText: string;
    statusLabel?: string;
    clockLabel?: string;
    nextUpText?: string;
  } | null;
}

const LEAD_MINUTE_OPTIONS: LiveAlertsLeadMinutes[] = [5, 10, 15, 20, 30];

