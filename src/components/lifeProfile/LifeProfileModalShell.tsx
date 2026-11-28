import React from 'react';
import { Drawer } from 'vaul';
import { Check, Sparkles } from 'lucide-react';
import { APP_VERSION } from '../../types/dayrhythm';

export const LifeProfileModalFooter: React.FC<{
  onCheckAppUpdates?: () => void;
  onClose: () => void;
}> = ({ onCheckAppUpdates, onClose }) => (
  <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
    <div className="flex items-center gap-2">
      {onCheckAppUpdates && (
        <button
          type="button"
          onClick={onCheckAppUpdates}
          className="min-h-[44px] px-3 py-2 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] text-xs text-zinc-400 hover:text-[#7FFFD4] hover:border-[#7FFFD4]/40 cursor-pointer"
        >
          فحص التحديثات
        </button>
      )}
      <span className="text-[10.5px] font-mono-tabular text-zinc-500/70 select-none px-2 py-1 rounded bg-white/[0.03] border border-white/[0.06]">
        {APP_VERSION}
      </span>
    </div>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClose}
        className="min-h-[44px] px-4 py-2 rounded-xl border border-white/[0.06] bg-[var(--bg-surface)] text-xs text-zinc-300 hover:text-white cursor-pointer"
      >
        إلغاء
      </button>
      <button
        type="submit"
        className="min-h-[44px] px-5 py-2 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] flex items-center gap-1.5 cursor-pointer"
      >
        <Check className="w-4 h-4" />
        <span>حفظ الثوابت ومزامنتها</span>
      </button>
    </div>
  </div>
);

export const LifeProfileModalShell: React.FC<{
  isOpen: boolean;
  isMobileViewport: boolean;
  onClose: () => void;
  renderFormContent: (headerTitle: React.ReactNode, isSheet: boolean) => React.ReactNode;
}> = ({ isOpen, isMobileViewport, onClose, renderFormContent }) => {
  if (isMobileViewport) {
    return (
      <Drawer.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }} direction="bottom">
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md" />
          <Drawer.Content
            dir="rtl"
            aria-describedby={undefined}
            aria-label="الدستور الشخصي وذاكرة Gemini الدائمة"
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-x border-white/[0.08] bg-[var(--bg-card)] text-zinc-100 shadow-2xl outline-none"
          >
            <div className="pt-3 pb-1 flex justify-center shrink-0">
              <Drawer.Handle className="h-1.5 w-11 rounded-full bg-white/20" />
            </div>
            {renderFormContent(
              <Drawer.Title className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#7FFFD4]" />
                <span>الإعدادات والثوابت وذاكرة Gemini</span>
              </Drawer.Title>,
              true
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  if (!isOpen) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-label="الدستور الشخصي وذاكرة Gemini الدائمة"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {renderFormContent(
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#7FFFD4]" />
          <span>الإعدادات والثوابت وذاكرة Gemini</span>
        </h2>,
        false
      )}
    </div>
  );
};
