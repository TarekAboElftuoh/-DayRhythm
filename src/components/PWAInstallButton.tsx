import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { AppLanguage } from '../types/dayrhythm';

interface PWAInstallButtonProps {
  language: AppLanguage;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ language }) => {
  const { canInstall, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (canInstall) {
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        className="min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#7FFFD4]/45 bg-[#7FFFD4]/12 text-[#7FFFD4] hover:bg-[#7FFFD4]/20 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
        title={
          language === 'ar'
            ? 'تثبيت إيقاع اليوم كتطبيق مستقل مع اختصارات الشاشة الرئيسية'
            : 'Install DayRhythm as an offline standalone app with home shortcuts'
        }
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="sm:hidden">{language === 'ar' ? 'تثبيت' : 'Install'}</span>
        <span className="hidden sm:inline">{language === 'ar' ? 'تثبيت التطبيق' : 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/15 bg-white/[0.04] text-zinc-200 hover:border-[#7FFFD4]/50 hover:text-[#7FFFD4] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-[#7FFFD4] shrink-0" />
          <span className="sm:hidden">{language === 'ar' ? 'تثبيت' : 'Install'}</span>
          <span className="hidden sm:inline">{language === 'ar' ? 'تثبيت التطبيق' : 'Install App'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl border border-[#7FFFD4]/40 bg-[#090C11] p-5 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-white">
                {language === 'ar' ? 'تثبيت إيقاع اليوم على iPhone / iPad' : 'Install on iPhone / iPad'}
              </h3>
              <p className="text-zinc-300 leading-relaxed">
                {language === 'ar'
                  ? '1. اضغط زر المشاركة (Share) أسفل متصفح Safari.\n2. اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).'
                  : '1. Tap the Share button in Safari.\n2. Tap Add to Home Screen.'}
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 rounded-xl bg-[#7FFFD4] text-black font-bold cursor-pointer"
              >
                {language === 'ar' ? 'حسناً' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
