import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { AppLanguage } from '../types/dayrhythm';

interface OfflineIndicatorProps {
  language: AppLanguage;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ language }) => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-amber-400/45 bg-black/95 px-4 py-2 text-xs font-semibold text-amber-200 shadow-2xl backdrop-blur-md"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-300 shrink-0" />
      <span>
        {language === 'ar'
          ? 'أنت غير متصل — المواقيت والترطيب والعلاجات تعمل أوفلاين بالكامل'
          : 'Offline — Prayer times, hydration & meds continue working locally'}
      </span>
    </div>
  );
};
