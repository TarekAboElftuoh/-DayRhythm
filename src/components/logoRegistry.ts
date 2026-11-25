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
