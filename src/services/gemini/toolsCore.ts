export const GEMINI_CORE_TOOLS = [
      {
        name: 'propose_calendar_actions',
        description: 'اقتراح إنشاء أو تعديل أو حذف أو ترحيل أحداث في Google Calendar API بناءً على أوامر المستخدم في شات Gemini.',
        parameters: {
          type: 'OBJECT',
          properties: {
            summaryAr: {
              type: 'STRING',
              description: 'ملخص عربي مختصر (بنظام 12 ساعة ص/م) للتغييرات المقترحة على Google Calendar.',
            },
            actions: {
              type: 'ARRAY',
              description:
                'قائمة جميع العمليات المقترحة للتنفيذ دفعة واحدة عبر Google Calendar API (عند طلب إضافة أو تعديل عدة أحداث، أدرج كل الأحداث في هذه المصفوفة في استدعاء واحد).',
              items: {
                type: 'OBJECT',
                properties: {
                  operation: { type: 'STRING', description: 'نوع العملية: create أو update أو delete أو shift' },
                  eventId: { type: 'STRING', description: 'معرف الحدث الفعلي في Google Calendar عند التعديل أو الحذف.' },
                  calendarId: { type: 'STRING', description: 'معرف التقويم المستهدف (افتراضياً primary).' },
                  title: {
                    type: 'STRING',
                    description:
                      'عنوان الحدث. الصيغة الإلزامية: إيموجي واحد أو اثنان كحد أقصى في البداية فقط ثم مسافة ثم النص — ' +
                      'ولا إيموجي آخر بعد كده في العنوان نهائياً، ولا نفس الإيموجي يتكرر. مثال صحيح: "🕌 الفجر (-3 د)" أو "💼 شغل 1". ' +
                      'مثال خاطئ تماماً (ممنوع): "🕌 🌌 🕌 الفجر (-3 د)" (الإيموجي الأول مكرر في الآخر) أو "🌴 🍽️ 🍋 🌴 🍽️ 💊 🍋 إفطار الصائم" ' +
                      '(كل إيموجي مكرر مرتين). خلي العنوان قصير (3 إلى 6 كلمات) وحط أي تفاصيل أو شرح إضافي في description بدل ما تحشيها في title.',
                  },
                  dateIso: { type: 'STRING', description: 'تاريخ الحدث بصيغة YYYY-MM-DD.' },
                  startTime24: { type: 'STRING', description: 'وقت البدء بصيغة HH:MM.' },
                  startInMinutes: {
                    type: 'NUMBER',
                    description:
                      'للتنبيهات النسبية فقط («بعد 5 دقايق»): عدد الدقايق من دلوقتي. لما تستخدمه متبعتش dateIso ولا startTime24 — التطبيق بيحسب الوقت من ساعة الجهاز.',
                  },
                  durationMinutes: { type: 'NUMBER', description: 'المدة بالدقائق (مثال: 0 للمواعيد اللحظية أو بدون مدة، أو 15 أو 30 أو 60).' },
                  description: { type: 'STRING', description: 'وصف مختصر للحدث في Google Calendar.' },
                  recurrenceRule: { type: 'STRING', description: 'قاعدة التكرار الاختيارية: DAILY أو WEEKLY.' },
                  byDays: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                    description: 'أيام التكرار الأسبوعي عند WEEKLY: SU, MO, TU, WE, TH, FR, SA.',
                  },
                  applyToAllDays: {
                    type: 'BOOLEAN',
                    description:
                      'عيّنها true إذا طلب المستخدم تعديل أو حذف أو تطبيق هذا التغيير على كل الأيام القادمة للسلسلة المتكررة (وليس لهذا اليوم فقط).',
                  },
                },
                required: ['operation', 'title'],
              },
            },
          },
          required: ['summaryAr', 'actions'],
        },
      },
      {
        name: 'propose_task_actions',
        description: 'اقتراح إنشاء أو تعديل أو إتمام أو إعادة فتح أو حذف مهام في Google Tasks API.',
        parameters: {
          type: 'OBJECT',
          properties: {
            summaryAr: { type: 'STRING', description: 'ملخص عربي مختصر للتغييرات المقترحة على مهام Google Tasks.' },
            taskActions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  operation: { type: 'STRING', description: 'create أو update أو complete أو reopen أو delete' },
                  taskId: { type: 'STRING', description: 'معرف المهمة الفعلي في Google Tasks.' },
                  taskListId: { type: 'STRING', description: 'معرف قائمة المهام (افتراضياً @default).' },
                  title: { type: 'STRING', description: 'عنوان المهمة.' },
                  notes: { type: 'STRING', description: 'ملاحظات إضافية للمهمة.' },
                  dueDateIso: { type: 'STRING', description: 'تاريخ الاستحقاق بصيغة YYYY-MM-DD.' },
                },
                required: ['operation', 'title'],
              },
            },
          },
          required: ['summaryAr', 'taskActions'],
        },
      },
      {
        name: 'propose_medication_actions',
        description: 'اقتراح إضافة أو تعديل أو حذف أو تسجيل تناول أي علاج أو فيتامين أو مكمل غذائي.',
        parameters: {
          type: 'OBJECT',
          properties: {
            summaryAr: { type: 'STRING', description: 'ملخص عربي مختصر لتعديل قائمة العلاجات والمكملات.' },
            medicationActions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  operation: { type: 'STRING', description: 'add أو update أو remove أو mark_taken' },
                  medicationId: { type: 'STRING', description: 'معرف العلاج الحالي عند التعديل أو الحذف.' },
                  name: { type: 'STRING', description: 'اسم العلاج أو المكمل.' },
                  time24: { type: 'STRING', description: 'ميعاد الجرعة الرئيسية بصيغة HH:MM.' },
                  times24: { type: 'ARRAY', items: { type: 'STRING' }, description: 'قائمة مواعيد الجرعات باليوم بصيغة HH:MM.' },
                  daysOfWeek: { type: 'ARRAY', items: { type: 'NUMBER' }, description: 'أيام الأسبوع المحددة (0=الأحد .. 6=السبت).' },
                  fastingPolicy: {
                    type: 'STRING',
                    enum: ['auto-nearest', 'before-fajr', 'after-maghrib', 'skip', 'unchanged'],
                    description: 'سياسة الجرعة النهارية في أيام الصيام.',
                  },
                  doseNote: { type: 'STRING', description: 'ملاحظة قصيرة للجرعة.' },
                  courseEndDate: { type: 'STRING', description: 'تاريخ انتهاء الكورس بصيغة YYYY-MM-DD.' },
                  remainingDoses: { type: 'NUMBER', description: 'عدد الجرعات المتبقية في العبوة.' },
                  totalDoses: { type: 'NUMBER', description: 'إجمالي الجرعات الأصلية في العبوة.' },
                  refillAlertDays: { type: 'NUMBER', description: 'أيام التنبيه قبل النفاد (الافتراضي 3).' },
                },
                required: ['operation', 'name'],
              },
            },
          },
          required: ['summaryAr', 'medicationActions'],
        },
      },
      {
        name: 'propose_creative_actions',
        description: 'اقتراح إضافة أو تعديل أو حذف أو تسجيل جلسة نشاط إبداعي أو هواية أو مشروع شخصي.',
        parameters: {
          type: 'OBJECT',
          properties: {
            summaryAr: { type: 'STRING', description: 'ملخص عربي مختصر للتعديل المقترح على الأنشطة الإبداعية.' },
            creativeActions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  operation: { type: 'STRING', description: 'add أو update أو remove أو log_session' },
                  activityId: { type: 'STRING', description: 'معرف النشاط.' },
                  name: { type: 'STRING', description: 'اسم الهواية أو المشروع.' },
                  emoji: { type: 'STRING', description: 'إيموجي مميز للنشاط.' },
                  cadence: { type: 'STRING', description: 'daily أو weekly أو monthly.' },
                  goalCount: { type: 'NUMBER', description: 'عدد الجلسات المستهدف.' },
                  weeklyGoalSessions: { type: 'NUMBER', description: 'الهدف الأسبوعي.' },
                  sessionMinutes: { type: 'NUMBER', description: 'مدة الجلسة بالدقائق.' },
                  scheduledTime24: { type: 'STRING', description: 'وقت اختياري مقترح بصيغة HH:MM.' },
                  expiresOnDate: { type: 'STRING', description: 'تاريخ انتهاء تلقائي بصيغة YYYY-MM-DD.' },
                },
                required: ['operation', 'name'],
              },
            },
          },
          required: ['summaryAr', 'creativeActions'],
        },
      },
      {
        name: 'propose_habit_actions',
        description:
          'اقتراح إضافة أو تعديل أو تفعيل عادة مستقبلية أو إيقاف عادة مؤقتاً أو حذفها أو تسجيل إنجازها اليوم في نظام العادات الديناميكية (دون إضافتها إلى Google Calendar).',
        parameters: {
          type: 'OBJECT',
          properties: {
            summaryAr: {
              type: 'STRING',
              description: 'ملخص عربي مختصر للتغييرات المقترحة على العادات اليومية.',
            },
            habitActions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  operation: {
                    type: 'STRING',
                    enum: ['add', 'update', 'pause', 'activate', 'remove', 'toggle_today'],
                    description:
                      'add (إضافة) أو update (تعديل) أو pause (إيقاف مؤقت / تحويل لمستقبلية) أو activate (تفعيل عادة مستقبلية) أو remove (حذف) أو toggle_today (تسجيل/إلغاء إنجاز اليوم).',
                  },
                  habitId: {
                    type: 'STRING',
                    description: 'معرف العادة الحالية عند التعديل أو التفعيل أو الإيقاف أو الحذف.',
                  },
                  title: { type: 'STRING', description: 'اسم العادة.' },
                  status: {
                    type: 'STRING',
                    enum: ['active', 'planned'],
                    description: 'حالية (active) أو مستقبلية (planned).',
                  },
                  anchor: {
                    type: 'STRING',
                    enum: [
                      'after-fajr',
                      'sunrise-light',
                      'duha',
                      'after-dhuhr',
                      'after-asr',
                      'pre-maghrib',
                      'after-maghrib',
                      'after-isha',
                      'any-free-slot',
                    ],
                    description: 'المرتكز الزمني الديناميكي للعادة.',
                  },
                  durationMin: {
                    type: 'NUMBER',
                    description: 'مدة العادة بالدقائق (الافتراضي 30).',
                  },
                  daysOfWeek: {
                    type: 'ARRAY',
                    items: { type: 'NUMBER' },
                    description: 'أيام التكرار (0=الأحد .. 6=السبت)، ويُترك فارغاً للعادات اليومية.',
                  },
                  skipOnFasting: {
                    type: 'BOOLEAN',
                    description: 'تخطي العادة تلقائياً في أيام الصيام.',
                  },
                },
                required: ['operation', 'title'],
              },
            },
          },
          required: ['summaryAr', 'habitActions'],
        },
      },
];
