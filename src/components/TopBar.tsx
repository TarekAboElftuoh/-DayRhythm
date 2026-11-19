import React from 'react';
import {
  Globe,
  LayoutDashboard,
  Smartphone,
  Monitor,
  MessageSquare,
  Cpu,
} from 'lucide-react';
import { ActiveTab, AppLanguage } from '../types/dayrhythm';
import { t } from '../engines/i18n';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenCatchUp: () => void;
  language: AppLanguage;
  onToggleLanguage: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onOpenCatchUp,
  language,
  onToggleLanguage,
}) => {
  const navItems: Array<{
    id: ActiveTab;
    label: string;
    mobileLabel: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'dashboard',
      label: t(language, 'navDashboard'),
      mobileLabel: language === 'ar' ? 'اليوم' : 'Today',
      Icon: LayoutDashboard,
    },
    {
      id: 'mobile',
      label: t(language, 'navMobile'),
      mobileLabel: language === 'ar' ? 'الموبايل' : 'Phone',
      Icon: Smartphone,
    },
    {
      id: 'overlay',
      label: t(language, 'navOverlay'),
      mobileLabel: language === 'ar' ? 'ويندوز' : 'Desktop',
      Icon: Monitor,
    },
    {
      id: 'assistant',
      label: t(language, 'navAssistant'),
      mobileLabel: 'Gemini',
      Icon: MessageSquare,
    },
    {
      id: 'blueprint',
      label: t(language, 'navBlueprint'),
      mobileLabel: language === 'ar' ? 'النظام' : 'System',
      Icon: Cpu,
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-2 sm:gap-6 px-3 sm:px-6 py-2.5 sm:py-3">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => onSelectTab('dashboard')}
            className="text-sm sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-[#7FFFD4] transition-colors cursor-pointer min-h-[38px] flex items-center"
          >
            <span className="sm:hidden">
              {language === 'ar' ? 'إيقاع اليوم' : 'DayRhythm'}
            </span>
            <span className="hidden sm:inline">{t(language, 'brand')}</span>
          </button>

          {/* Zone 2: Single-line navigation links (Desktop) */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`relative py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'text-[#7FFFD4]'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-0 -bottom-[13px] h-0.5 bg-[#7FFFD4]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: PWA Install + Language Switcher + Primary Action */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <PWAInstallButton language={language} />

            <button
              type="button"
              onClick={onToggleLanguage}
              className="min-h-[38px] px-2 sm:px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-white/15 bg-white/[0.04] text-zinc-200 hover:border-[#7FFFD4]/50 hover:text-[#7FFFD4] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              title="تبديل فوري عربي ↔ English"
            >
              <Globe className="w-3.5 h-3.5 text-[#7FFFD4] shrink-0" />
              <span className="sm:hidden">{language === 'ar' ? 'EN' : 'ع'}</span>
              <span className="hidden sm:inline">{t(language, 'langSwitchLabel')}</span>
            </button>

            <button
              type="button"
              onClick={onOpenCatchUp}
              className="min-h-[38px] px-2.5 sm:px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#7FFFD4] text-black hover:bg-[#66eec2] active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="sm:hidden">{language === 'ar' ? 'تدارك' : 'Catch-Up'}</span>
              <span className="hidden sm:inline">{t(language, 'ctaCatchUp')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Thumb-Zone Navigation (Calibrated for OnePlus 12R 1264×2780 / 412px CSS viewport) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/12 bg-black/95 backdrop-blur-xl px-1.5 pt-1 pb-[max(0.45rem,env(safe-area-inset-bottom))]"
      >
        <div className="grid grid-cols-5 gap-1">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`min-h-[50px] px-1 py-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                <span className="text-[10px] leading-none truncate max-w-full">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
