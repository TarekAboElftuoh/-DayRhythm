import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Plane,
  MapPin,
  Droplets,
  Sun,
  Calendar,
  CheckSquare,
  Pill,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Clock,
} from 'lucide-react';
import { Drawer } from 'vaul';
import {
  GeoLocation,
  MedicationItem,
  ScheduleBlock,
  TravelDeferrableCategory,
  TravelDurationMode,
  TravelState,
} from '../../types/dayrhythm';
import { HOME_LOCATION } from '../../engines/prayerEngine';


export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export interface TravelModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  travelState: TravelState;
  scheduleBlocks: ScheduleBlock[];
  medications?: MedicationItem[];
  currentLocation?: GeoLocation;
  adhanLeadMinutes?: number;
  todayIso?: string;
  onApplyTravel: (nextState: TravelState) => void;
  onDisableTravel: () => void;
}

export const CATEGORY_ITEMS: ReadonlyArray<{
  id: TravelDeferrableCategory;
  labelAr: string;
  descAr: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'water', labelAr: 'الماية', descAr: 'تنبيهات أكواب الماء', Icon: Droplets },
  { id: 'sunlight', labelAr: 'الأشعة المفيدة', descAr: 'جلسات التعرّض للشمس', Icon: Sun },
  { id: 'calendar', labelAr: 'التقويم', descAr: 'مواعيد تقويم Google', Icon: Calendar },
  { id: 'tasks', labelAr: 'المهام', descAr: 'مهام Google المجدولة', Icon: CheckSquare },
];

export const DURATION_CHIPS: ReadonlyArray<{ id: TravelDurationMode; label: string }> = [
  { id: 'until_return', label: 'مفتوح (لحد ما أرجع)' },
  { id: '1d', label: 'يوم' },
  { id: '2d', label: 'يومين' },
  { id: '7d', label: 'أسبوع' },
  { id: '14d', label: 'أسبوعين' },
  { id: 'custom_date', label: 'تاريخ محدد 📅' },
];

export function addDaysIso(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function normalizeDurationMode(mode: TravelDurationMode): TravelDurationMode {
  if (
    mode === 'until_return' ||
    mode === '1d' ||
    mode === '2d' ||
    mode === '7d' ||
    mode === '14d' ||
    mode === 'custom_date'
  ) {
    return mode;
  }
  if (mode === 'today') return '1d';
  if (mode === 'tomorrow') return '2d';
  return 'until_return';
}

