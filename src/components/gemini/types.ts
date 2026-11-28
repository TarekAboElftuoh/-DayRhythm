import type React from 'react';
import type { User } from 'firebase/auth';
import type {
  AppLanguage,
  AppSettingsPatch,
  CalendarActionProposal,
  CalendarExecutionResult,
  CreativeActivityActionProposal,
  CreativeActivityPlacement,
  CreativeExecutionResult,
  DynamicHabit,
  GeoLocation,
  GoogleCalendarEventItem,
  GoogleTaskItem,
  HabitActionProposal,
  HabitExecutionResult,
  LifeProfile,
  MedicationActionProposal,
  MedicationExecutionResult,
  MedicationItem,
  MemoryActionProposal,
  MemoryCategory,
  MemoryItem,
  PersistedChatMessage,
  ResolvedHabitPlacement,
  SettingsSnapshotContext,
  TaskActionProposal,
  TaskExecutionResult,
  UnifiedSettingsPatch,
} from '../../types/dayrhythm';

export type AssistantMode = 'chat' | 'maps' | 'search';
export type SidebarTab = 'memories' | 'events' | 'tasks';

export interface GeminiAssistantViewProps {
  isActive: boolean;
  language: AppLanguage;
  activeLocation: GeoLocation;
  contextSummary: string;
  needsAuth: boolean;
  authUser: User | null;
  isLoggingIn: boolean;
  calendarEvents: GoogleCalendarEventItem[];
  googleTasks: GoogleTaskItem[];
  medications: MedicationItem[];
  creativePlacements: CreativeActivityPlacement[];
  habits?: DynamicHabit[];
  resolvedHabits?: ResolvedHabitPlacement[];
  loadingEvents: boolean;
  loadingTasks: boolean;
  messages: PersistedChatMessage[];
  onChangeMessages: React.Dispatch<React.SetStateAction<PersistedChatMessage[]>>;
  onResetChat: (targetMode: AssistantMode) => void;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onRefreshWorkspace: () => Promise<void>;
  onExecuteCalendarActions: (
    actions: CalendarActionProposal[]
  ) => Promise<{ googleSynced: boolean; results: CalendarExecutionResult[]; queued?: boolean }>;
  onExecuteTaskActions: (
    taskActions: TaskActionProposal[]
  ) => Promise<{ googleSynced: boolean; results: TaskExecutionResult[]; queued?: boolean }>;
  onExecuteMedicationActions: (
    medicationActions: MedicationActionProposal[],
    linkedCalendarIds?: Record<string, string>
  ) => Promise<MedicationExecutionResult[]>;
  onExecuteCreativeActions: (
    creativeActions: CreativeActivityActionProposal[],
    linkedCalendarIds?: Record<string, string>
  ) => Promise<CreativeExecutionResult[]>;
  onExecuteHabitActions?: (habitActions: HabitActionProposal[]) => Promise<HabitExecutionResult[]>;
  onApplyProfileUpdates: (patch: Partial<LifeProfile>) => void;
  onApplyAppSettings?: (patch: AppSettingsPatch) => void;
  onApplySettingsPatch?: (patch: UnifiedSettingsPatch) => Promise<void> | void;
  currentSettingsSnapshot?: SettingsSnapshotContext;
  onExecuteMemoryActions: (memoryActions: MemoryActionProposal[]) => void;
  onOpenLifeProfile: () => void;
  initialPrompt?: string | null;
  onConsumeInitialPrompt?: () => void;
  autoStartVoice?: boolean;
  onConsumeAutoStartVoice?: () => void;
  memoryCount: number;
  memories: MemoryItem[];
  lifeProfile: LifeProfile;
  firestoreSynced: boolean;
  onAddMemory: (input: {
    category: MemoryCategory;
    ruleText: string;
    source?: MemoryItem['source'];
  }) => void;
  onUpdateMemory: (id: string, patch: { category: MemoryCategory; ruleText: string }) => void;
  onDeleteMemory: (id: string) => void;
  onSaveCloudApiUrl?: (url: string) => void;
}

export interface QueuedChatMessage {
  id: string;
  text: string;
  mode: AssistantMode;
}

export interface QuickActionChip {
  label: string;
  emoji: string;
  prompt: string;
}

export const SUGGESTED_PROMPTS: Record<AssistantMode, string[]> = {
  chat: [
    'راجع جدولي المتبقي اليوم وفق دستوري ونبهني لو فيه أي تضارب',
    'عاوز أضيف علاج أو مكمل جديد — ناقش معايا أنسب ميعاد علمي وجدولي واحجزه في التقويم',
    'وزني اتغيّر — عدّل الوزن في الدستور وأعد حساب أكواب المياه اليومية',
  ],
  maps: [
    'أقرب المساجد المفتوحة لصلاة الجماعة بالقرب من موقعي الحالي',
    'أقرب أماكن استراحة ووجبات صحية خفيفة في طريقي',
    'أقرب صيدلية بالقرب من موقعي الآن',
  ],
  search: [
    'حالة الطقس اليوم في موقعي وتأثيرها على احتياج شرب المياه',
    'مواقيت الصلاة اليوم في مدينتي',
    'أفضل الأوقات العلمية لتناول الفيتامينات والمكملات اليومية',
  ],
};

export const QUICK_ACTION_CHIPS: QuickActionChip[] = [
  {
    label: 'أنا مرهق — رتّب يومي',
    emoji: '🛌',
    prompt: 'أنا مرهق وطاقتي قليلة، نظّم باقي يومي بهدوء وخفف المهام غير الضرورية',
  },
  {
    label: 'جدولة المكملات',
    emoji: '💊',
    prompt: 'افحص مواعيد المكملات والعلاجات الحالية وجدولها في التقويم بدون تعارض مع الصيام والصلوات',
  },
  {
    label: 'فحص التعارضات',
    emoji: '🕌',
    prompt: 'افحص جدول اليوم بالكامل وتأكد من عدم وجود تعارض مع الصلوات والنوم',
  },
  {
    label: 'قيلولة تعويضية',
    emoji: '⏱️',
    prompt: 'احجز لي قيلولة تعويضية لمدة 25 دقيقة بعيداً عن أوقات الصلاة',
  },
];

export const MEMORY_CATEGORIES: MemoryCategory[] = [
  'priority',
  'sleep',
  'fasting',
  'hydration',
  'work_devops',
  'travel',
  'general',
];
