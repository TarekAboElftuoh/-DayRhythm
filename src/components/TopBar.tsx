import React from 'react';
import { Globe } from 'lucide-react';
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
  const navItems: Array<{ id: ActiveTab; label: string }> = [
    { id: 'dashboard', label: t(language, 'navDashboard') },
    { id: 'mobile', label: t(language, 'navMobile') },
    { id: 'overlay', label: t(language, 'navOverlay') },
    { id: 'assistant', label: t(language, 'navAssistant') },
    { id: 'blueprint', label: t(language, 'navBlueprint') },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-4 sm:gap-6 px-4 sm:px-6 py-3">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => onSelectTab('dashboard')}
            className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-[#7FFFD4] transition-colors cursor-pointer"
          >
            {t(language, 'brand')}
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
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <PWAInstallButton language={language} />

            <button
              type="button"
              onClick={onToggleLanguage}
              className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-white/15 bg-white/[0.04] text-zinc-200 hover:border-[#7FFFD4]/50 hover:text-[#7FFFD4] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="تبديل فوري عربي ↔ English"
            >
              <Globe className="w-3.5 h-3.5 text-[#7FFFD4]" />
              <span>{t(language, 'langSwitchLabel')}</span>
            </button>

            <button
              type="button"
              onClick={onOpenCatchUp}
              className="min-h-[38px] px-3.5 sm:px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#7FFFD4] text-black hover:bg-[#66eec2] active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t(language, 'ctaCatchUp')}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Thumb-Zone Navigation (OnePlus 12R 163.3×75.3mm one-hand ergonomics) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/15 bg-black/95 backdrop-blur-xl px-1.5 py-1 pb-[max(0.35rem,env(safe-area-inset-bottom))]"
      >
        <div className="grid grid-cols-5 gap-1">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`min-h-[46px] px-1 rounded-xl flex flex-col items-center justify-center text-[11px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#7FFFD4]/15 text-[#7FFFD4] font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className="truncate max-w-full">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
