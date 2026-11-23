import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Globe,
  LayoutDashboard,
  Smartphone,
  Monitor,
  MessageSquare,
  RefreshCw,
  Sun,
  Moon,
} from 'lucide-react';
import { ActiveTab, AppLanguage, APP_VERSION } from '../types/dayrhythm';
import { t } from '../engines/i18n';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenCatchUp: () => void;
  language: AppLanguage;
  onToggleLanguage: () => void;
  brandLogoSrc?: string | null;
  onCheckAppUpdates?: () => void;
  isCheckingUpdates?: boolean;
  sunMode?: boolean;
  onToggleSunMode?: () => void;
}

import { isMobileDevice } from '../services/platform';

function detectIsMobileEnvironment(): boolean {
  return isMobileDevice();
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenCatchUp,
  language,
  onToggleLanguage,
  brandLogoSrc,
  onCheckAppUpdates,
  isCheckingUpdates = false,
  sunMode = false,
  onToggleSunMode,
}) => {
  const [isMobileEnv, setIsMobileEnv] = useState<boolean>(detectIsMobileEnvironment);

  useEffect(() => {
    const onResize = () => setIsMobileEnv(detectIsMobileEnvironment());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Platform-aware navigation: zero cross-platform clutter, zero technical architecture tab
  const navItems: Array<{
    id: ActiveTab;
    label: string;
    mobileLabel: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = isMobileEnv
    ? [
        {
          id: 'dashboard',
          label: t(language, 'navDashboard'),
          mobileLabel: language === 'ar' ? 'اليوم' : 'Today',
          Icon: LayoutDashboard,
        },
        {
          id: 'assistant',
          label: t(language, 'navAssistant'),
          mobileLabel: 'Gemini',
          Icon: MessageSquare,
        },
        {
          id: 'mobile',
          label: language === 'ar' ? 'الهاتف' : 'Phone',
          mobileLabel: language === 'ar' ? 'الهاتف' : 'Phone',
          Icon: Smartphone,
        },
      ]
    : [
        {
          id: 'dashboard',
          label: t(language, 'navDashboard'),
          mobileLabel: language === 'ar' ? 'اليوم' : 'Today',
          Icon: LayoutDashboard,
        },
        {
          id: 'assistant',
          label: t(language, 'navAssistant'),
          mobileLabel: 'Gemini',
          Icon: MessageSquare,
        },
        {
          id: 'overlay',
          label: language === 'ar' ? 'وضع الكمبيوتر' : 'Desktop',
          mobileLabel: language === 'ar' ? 'ويندوز' : 'Desktop',
          Icon: Monitor,
        },
      ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#070A0F]/92 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-2 sm:gap-6 px-3.5 sm:px-6 h-14">
          {/* Zone 1: Brand Lockup with subtle version badge */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSelectTab('dashboard')}
              className="text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-[#7FFFD4] transition-colors cursor-pointer min-h-[40px] flex items-center gap-2.5"
            >
              {brandLogoSrc && (
                <img
                  src={brandLogoSrc}
                  alt="شعار إيقاع اليوم"
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-lg object-cover ring-1 ring-white/15 shrink-0"
                />
              )}
              <span className="sm:hidden">
                {language === 'ar' ? 'إيقاع اليوم' : 'DayRhythm'}
              </span>
              <span className="hidden sm:inline">{t(language, 'brand')}</span>
            </button>
            <span
              className="text-[10px] font-mono tracking-wider text-zinc-500/70 select-none px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.06]"
              title={`إصدار التطبيق ${APP_VERSION}`}
            >
              {APP_VERSION}
            </span>
          </div>

          {/* Zone 2: Clean Single-Line Navigation (Desktop) with Motion Layout Pill */}
          <nav className="hidden md:flex items-center gap-1 text-[13px] font-medium" aria-label="Desktop navigation">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative px-3.5 py-2 rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer select-none ${
                    active
                      ? 'text-[#7FFFD4] font-semibold'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="activeTabPillDesktop"
                      className="absolute inset-0 rounded-lg bg-[#7FFFD4]/[0.09] border border-[#7FFFD4]/25 shadow-[0_0_12px_rgba(127,255,212,0.12)]"
                      transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action & Compact Utilities */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton language={language} />

            {onCheckAppUpdates && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={onCheckAppUpdates}
                disabled={isCheckingUpdates}
                className="w-9 h-9 rounded-lg text-zinc-500 hover:text-[#7FFFD4] hover:bg-white/[0.04] flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-60"
                title={language === 'ar' ? 'فحص التحديثات الآن' : 'Check for updates'}
                aria-label={language === 'ar' ? 'فحص التحديثات' : 'Check for updates'}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isCheckingUpdates ? 'animate-spin text-[#7FFFD4]' : ''}`}
                />
              </motion.button>
            )}

            {onToggleSunMode && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={onToggleSunMode}
                className="w-9 h-9 rounded-lg text-zinc-400 hover:text-[#7FFFD4] hover:bg-white/[0.04] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title={sunMode ? 'الرجوع للمود الليلي' : 'مود الشمس (للقراءة في النور)'}
                aria-label={sunMode ? 'المود الليلي' : 'مود الشمس'}
                aria-pressed={sunMode}
              >
                {sunMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </motion.button>
            )}

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={onToggleLanguage}
              className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-lg border border-white/[0.09] bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              title="عربي ↔ English"
            >
              <Globe className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="sm:hidden">{language === 'ar' ? 'EN' : 'ع'}</span>
              <span className="hidden sm:inline">{t(language, 'langSwitchLabel')}</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03, boxShadow: '0 0 16px rgba(127,255,212,0.3)' }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              type="button"
              onClick={onOpenCatchUp}
              className="min-h-[36px] px-3 sm:px-3.5 py-1.5 text-xs font-bold rounded-lg bg-[#7FFFD4] text-black hover:bg-[#66eec2] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="sm:hidden">{language === 'ar' ? 'تدارك' : 'Catch-Up'}</span>
              <span className="hidden sm:inline">{t(language, 'ctaCatchUp')}</span>
            </motion.button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Thumb-Zone Navigation */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/[0.08] bg-black/92 backdrop-blur-xl px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="grid grid-cols-3 gap-1">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            const Icon = item.Icon;
            return (
              <motion.button
                key={item.id}
                whileTap={{ scale: 0.93 }}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative min-h-[48px] px-2 py-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer select-none ${
                  active ? 'text-[#7FFFD4] font-bold' : 'text-zinc-500 hover:text-zinc-200'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="mobileActiveTabPill"
                    className="absolute inset-0 rounded-xl bg-[#7FFFD4]/12 border border-[#7FFFD4]/20"
                    transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                  />
                )}
                <Icon className="relative z-10 w-[19px] h-[19px] shrink-0" />
                <span className="relative z-10 text-[11px] leading-none truncate max-w-full">
                  {item.mobileLabel}
                </span>
              </motion.button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
