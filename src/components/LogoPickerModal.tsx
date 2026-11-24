import React from 'react';
import { Check, Monitor, Smartphone, X } from 'lucide-react';
import logoV2HorizonSun from '../assets/images/logo_v2_horizon_sun_1795272760719.jpg';
import logoV2PrismHourglass from '../assets/images/logo_v2_prism_hourglass_1795272783863.jpg';
import logoV2MonolithArc from '../assets/images/logo_v2_monolith_arc_1795272759601.jpg';
import logoV2ArabicRibbon from '../assets/images/logo_v2_arabic_calligraphy_1795272762796.jpg';
import logoV2TitaniumCompass from '../assets/images/logo_v2_liquid_compass_1795272759955.jpg';

export interface LogoConceptOption {
  id: string;
  number: number;
  titleAr: string;
  subtitleEn: string;
  descriptionAr: string;
  src: string;
}

export const LOGO_CONCEPTS: LogoConceptOption[] = [
  {
    id: 'v2-horizon-sun',
    number: 1,
    titleAr: 'أفق الشروق الزجاجي',
    subtitleEn: 'Frosted Horizon Dome',
    descriptionAr:
      'قبة شروق زجاجية مضيئة بلون لؤلؤي وحافة نعناعية رقيقة فوق خط أفق هادئ — بساطة فاخرة ترمز لبداية اليوم واتزانه.',
    src: logoV2HorizonSun,
  },
  {
    id: 'v2-prism-hourglass',
    number: 2,
    titleAr: 'الساعة الرملية البلاتينية',
    subtitleEn: 'Platinum Time Ribbon',
    descriptionAr:
      'شريط هندسي منحوت من المعدن الفضي والزجاج النعناعي يشكّل ساعة رملية ولانهاية، يرمز لإدارة الوقت وانسيابيته.',
    src: logoV2PrismHourglass,
  },
  {
    id: 'v2-monolith-arc',
    number: 3,
    titleAr: 'الكسوف السويسري',
    subtitleEn: 'Swiss Eclipse Geometry',
    descriptionAr:
      'تداخل دائري نقي بين الأبيض والأخضر الزمردي مع نقطة مركزية ذهبية دقيقة — تصميم جرافيكي خالد شديد الوضوح في كل المقاسات.',
    src: logoV2MonolithArc,
  },
  {
    id: 'v2-arabic-ribbon',
    number: 4,
    titleAr: 'الشريط الانسيابي العربي',
    subtitleEn: 'Fluid Calligraphic Wave',
    descriptionAr:
      'منحنى خطّي تجريدي متصل يجمع بين انسيابية الموجة وجمال الهلال بملمس فضي مائل للنعناعي على خلفية داكنة عميقة.',
    src: logoV2ArabicRibbon,
  },
  {
    id: 'v2-titanium-compass',
    number: 5,
    titleAr: 'بوصلة التيتانيوم',
    subtitleEn: 'Tactile Titanium Compass',
    descriptionAr:
      'قرص معدني تيتانيوم داكن بإبرة بوصلة زمردية فضية حادة — هوية فخمة ترمز لتوجيه يومك وقبلتك وأولوياتك بدقة.',
    src: logoV2TitaniumCompass,
  },
];

export const SELECTED_LOGO_STORAGE_KEY = 'dayrhythm_selected_logo_id_v1';
export const DEFAULT_LOGO_ID = 'v2-horizon-sun';

export function getLogoConceptById(id?: string | null): LogoConceptOption {
  if (id) {
    const found = LOGO_CONCEPTS.find((c) => c.id === id);
    if (found) return found;
  }
  return LOGO_CONCEPTS.find((c) => c.id === DEFAULT_LOGO_ID) ?? LOGO_CONCEPTS[0];
}

interface LogoPickerModalProps {
  isOpen: boolean;
  selectedLogoId: string;
  onSelectLogo: (id: string) => void;
  onResetDefault: () => void;
  onClose: () => void;
}

export const LogoPickerModal: React.FC<LogoPickerModalProps> = ({
  isOpen,
  selectedLogoId,
  onSelectLogo,
  onResetDefault,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="تغيير شعار برنامج إيقاع اليوم"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#080B10] p-4 sm:p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3.5">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              شعار برنامج «إيقاع اليوم»
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              الشعار الافتراضي هو «أفق الشروق الزجاجي (#1)»، ويمكنك التبديل إلى أي تصميم آخر في أي وقت.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LOGO_CONCEPTS.map((logo) => {
            const isSelected = selectedLogoId === logo.id;
            return (
              <div
                key={logo.id}
                className={`rounded-2xl border p-3.5 flex flex-col justify-between gap-3 transition-colors ${
                  isSelected
                    ? 'border-[#7FFFD4] bg-[#7FFFD4]/[0.07]'
                    : 'border-white/10 bg-black/60 hover:border-white/25'
                }`}
              >
                <div className="space-y-3">
                  {/* Large Logo Preview */}
                  <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
                    <img
                      src={logo.src}
                      alt={logo.titleAr}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-2.5 right-2.5 rounded-lg bg-black/80 border border-white/15 px-2 py-0.5 font-digits text-xs font-bold text-[#7FFFD4]">
                      #{logo.number}
                    </span>
                    {isSelected && (
                      <span className="absolute top-2.5 left-2.5 rounded-lg bg-[#7FFFD4] px-2 py-0.5 text-[11px] font-bold text-black flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>نشط</span>
                      </span>
                    )}
                  </div>

                  {/* Title & Concept */}
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">
                      {logo.number}. {logo.titleAr}
                    </h3>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      {logo.descriptionAr}
                    </p>
                  </div>

                  {/* Real Mobile & Desktop Size Preview */}
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <img
                        src={logo.src}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-[11px] object-cover border border-white/15 shadow-md shrink-0"
                      />
                      <div className="text-[11px] text-zinc-400 leading-tight">
                        <div className="flex items-center gap-1 text-zinc-200 font-semibold">
                          <Smartphone className="w-3 h-3 text-[#7FFFD4]" />
                          <span>الموبايل</span>
                        </div>
                        <span>أيقونة الشاشة</span>
                      </div>
                    </div>

                    <span className="h-7 w-px bg-white/10" />

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 rounded-md bg-zinc-900 border border-white/15 px-2 py-1.5">
                        <img
                          src={logo.src}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-5 h-5 rounded object-cover"
                        />
                        <span className="h-1 w-2 rounded-full bg-[#7FFFD4]" />
                      </div>
                      <div className="text-[11px] text-zinc-400 leading-tight">
                        <div className="flex items-center gap-1 text-zinc-200 font-semibold">
                          <Monitor className="w-3 h-3 text-sky-300" />
                          <span>ويندوز</span>
                        </div>
                        <span>شريط المهام</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectLogo(logo.id)}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#7FFFD4] text-black'
                      : 'border border-[#7FFFD4]/40 bg-[#7FFFD4]/10 text-[#7FFFD4] hover:bg-[#7FFFD4] hover:text-black'
                  }`}
                >
                  {isSelected
                    ? logo.id === DEFAULT_LOGO_ID
                      ? '✓ الشعار الافتراضي النشط'
                      : `✓ الشعار النشط (#${logo.number})`
                    : `تفعيل التصميم #${logo.number}`}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs">
          <span className="text-zinc-400">
            الشعار الرسمي الافتراضي هو «أفق الشروق الزجاجي (#1)»، ويمكنك التبديل لأي تصميم آخر هنا في أي وقت.
          </span>
          <div className="flex items-center gap-2">
            {selectedLogoId !== DEFAULT_LOGO_ID && (
              <button
                type="button"
                onClick={onResetDefault}
                className="px-3 py-1.5 rounded-lg border border-white/15 text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                العودة للافتراضي (#1)
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-white/10 text-white font-semibold hover:bg-white/20 cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
