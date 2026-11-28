import React from 'react';
import { Download, X } from 'lucide-react';
import type { AppLanguage } from '../types/dayrhythm';
import type { UpdateCheckResult } from '../services/updateCheckService';

export const TopBarUpdateBanner: React.FC<{
  language: AppLanguage;
  availableUpdate: UpdateCheckResult;
  isMobileEnv: boolean;
  onDismissUpdate?: () => void;
}> = ({ language, availableUpdate, isMobileEnv, onDismissUpdate }) => (
  <div
    dir={language === 'ar' ? 'rtl' : 'ltr'}
    className="border-b border-[#7FFFD4]/25 bg-[#7FFFD4]/[0.07] backdrop-blur-md"
  >
    <div className="mx-auto flex max-w-[1380px] flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span className="px-2 py-0.5 rounded-full bg-[#7FFFD4]/15 border border-[#7FFFD4]/30 font-mono text-[11px] font-bold text-[#7FFFD4] shrink-0">
          {availableUpdate.latestVersion}
        </span>
        <span className="text-zinc-200 truncate">
          {language === 'ar'
            ? `يتوفر إصدار جديد من إيقاع اليوم (الحالي ${availableUpdate.currentVersion})`
            : `New DayRhythm release available (current ${availableUpdate.currentVersion})`}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <a
          href={availableUpdate.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[32px] px-3 py-1 rounded-lg bg-[#7FFFD4] text-black font-bold hover:bg-[#66eec2] transition-colors inline-flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          <span>
            {isMobileEnv && availableUpdate.apkUrl
              ? language === 'ar'
                ? 'تحميل APK'
                : 'Download APK'
              : !isMobileEnv && availableUpdate.exeUrl
                ? language === 'ar'
                  ? 'تحميل EXE'
                  : 'Download EXE'
                : language === 'ar'
                  ? 'تحميل التحديث'
                  : 'Download Update'}
          </span>
        </a>
        {onDismissUpdate && (
          <button
            type="button"
            onClick={onDismissUpdate}
            aria-label={language === 'ar' ? 'إغلاق إشعار التحديث' : 'Dismiss update notice'}
            className="min-w-[32px] min-h-[32px] rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  </div>
);
