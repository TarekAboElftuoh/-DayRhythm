import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Clock,
  BatteryCharging,
  Maximize2,
  Volume2,
  MapPin,
  Calendar,
  Settings,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import {
  AndroidPermissionsStatus,
  checkAndroidPermissionsStatus,
  isAndroidNative,
  openAppSystemSettings,
  openBatteryOptimizationSettings,
  openDndSettings,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  requestBackgroundLocation,
  requestEssentialAndroidPermissions,
} from '../services/androidPermissions';

export const AndroidPermissionsCard: React.FC = () => {
  const [status, setStatus] = useState<AndroidPermissionsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const isNative = isAndroidNative();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await checkAndroidPermissionsStatus();
      setStatus(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    // Auto-refresh when user comes back from Android System Settings
    const handleFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [refresh]);

  const handleRequestAllEssential = async () => {
    setLoading(true);
    try {
      const res = await requestEssentialAndroidPermissions();
      setStatus(res);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestBackgroundLoc = async () => {
    setLoading(true);
    try {
      const res = await requestBackgroundLocation();
      setStatus(res);
    } finally {
      setLoading(false);
    }
  };

  const permissionItems = [
    {
      id: 'exactAlarm',
      title: '⏰ المنبه الدقيق (Exact Alarms)',
      subtitle: 'رنين المنبه بالثانية وتخطي تجميد نظام أندرويد (Doze Mode)',
      granted: status?.exactAlarm ?? false,
      action: openExactAlarmSettings,
      actionLabel: 'تفعيل المنبه الدقيق',
      icon: Clock,
      critical: true,
    },
    {
      id: 'batteryOptimization',
      title: '🔋 استثناء قيود البطارية (Unrestricted)',
      subtitle: 'منع نظام أندرويد وموفري الطاقة من قتل التطبيق في الخلفية',
      granted: status?.batteryOptimization ?? false,
      action: openBatteryOptimizationSettings,
      actionLabel: 'استثناء قيود البطارية',
      icon: BatteryCharging,
      critical: true,
    },
    {
      id: 'fullScreenIntent',
      title: '🖥️ الظهور فوق شاشة القفل (Full Screen Intent)',
      subtitle: 'فتح شاشة الرنين بملء الشاشة فجأة حتى لو كان الهاتف مقفلاً ومغلق الشاشة',
      granted: status?.fullScreenIntent ?? false,
      action: openFullScreenIntentSettings,
      actionLabel: 'تفعيل شاشة القفل',
      icon: Maximize2,
      critical: true,
    },
    {
      id: 'dndPolicy',
      title: '🔕 تجاوز وضع الصامت (DND Policy Access)',
      subtitle: 'إطلاق صوت الرنين للمنبهات الحرجة حتى لو كان الهاتف على وضع الصامت أو عدم الإزعاج',
      granted: status?.dndPolicy ?? false,
      action: openDndSettings,
      actionLabel: 'منح تجاوز الصامت',
      icon: Volume2,
      critical: false,
    },
    {
      id: 'notification',
      title: '🔔 إشعارات النظام (Post Notifications)',
      subtitle: 'إظهار التنبيهات والكبسولة وإشعارات الروتين بالخلفية (Android 13+)',
      granted: status?.notification ?? false,
      action: handleRequestAllEssential,
      actionLabel: 'تفعيل الإشعارات',
      icon: Bell,
      critical: true,
    },
    {
      id: 'fineLocation',
      title: '📍 الموقع الجغرافي (Fine Location)',
      subtitle: 'حساب مواقيت الصلاة والقبلة بدقة متناهية حسب إحداثيات مدينتك',
      granted: status?.fineLocation ?? false,
      action: handleRequestAllEssential,
      actionLabel: 'تحديد الموقع',
      icon: MapPin,
      critical: false,
    },
    {
      id: 'backgroundLocation',
      title: '🌍 الموقع في الخلفية (Travel Mode Background)',
      subtitle: 'تحديث المواقيت والسفر تلقائياً أثناء التنقل بدون فتح التطبيق',
      granted: status?.backgroundLocation ?? false,
      action: handleRequestBackgroundLoc,
      actionLabel: 'طلب موقع الخلفية',
      icon: MapPin,
      critical: false,
    },
    {
      id: 'calendar',
      title: '📅 التقويم المحلي (Local Calendar)',
      subtitle: 'قراءة وتعديل أحداث تقويم الجهاز والمزامنة المباشرة',
      granted: status?.calendar ?? false,
      action: handleRequestAllEssential,
      actionLabel: 'صلاحية التقويم',
      icon: Calendar,
      critical: false,
    },
  ];

  const totalGranted = permissionItems.filter((i) => i.granted).length;
  const allCriticalGranted = permissionItems.filter((i) => i.critical).every((i) => i.granted);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0A0D14] p-4 sm:p-5 space-y-4 text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#7FFFD4]/10 border border-[#7FFFD4]/30 flex items-center justify-center text-[#7FFFD4]">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>صلاحيات أندرويد الحديثة (Android 12 – 16)</span>
              {isNative ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono-tabular border border-emerald-500/30">
                  Android Native ✓
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-white/10">
                  نسخة الويب / المحاكي
                </span>
              )}
            </h3>
            <p className="text-[11px] text-zinc-400">
              الدليل الشامل للعمل الدائم في الخلفية وتجاوز قيود Doze Mode وشاشة القفل
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void refresh()}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white transition cursor-pointer disabled:opacity-50"
            title="تحديث حالة الصلاحيات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#7FFFD4]' : ''}`} />
          </button>
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-bold border font-mono-tabular ${
              allCriticalGranted
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
            }`}
          >
            {totalGranted} / {permissionItems.length} مفعلة
          </span>
        </div>
      </div>

      {/* Quick Action Banner */}
      {!allCriticalGranted && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-amber-200">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              هناك صلاحيات حساسة مطلوبة لضمان رنين المنبه في موعده بالثانية وعدم إغلاق التطبيق.
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleRequestAllEssential()}
            className="px-3.5 py-1.5 rounded-lg bg-amber-400 text-black font-bold text-xs hover:bg-amber-300 transition shrink-0 cursor-pointer"
          >
            طلب الصلاحيات الأساسية دفعة واحدة
          </button>
        </div>
      )}

      {/* Permission Matrix Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {permissionItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className={`p-3 rounded-xl border transition flex flex-col justify-between gap-2.5 ${
                item.granted
                  ? 'bg-emerald-950/20 border-emerald-500/25'
                  : 'bg-black/40 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      item.granted
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-white/5 text-zinc-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-bold text-zinc-100 flex items-center gap-1.5">
                      <span>{item.title}</span>
                      {item.critical && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          حساس
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                      {item.subtitle}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
                <span
                  className={`text-[11px] font-semibold flex items-center gap-1 ${
                    item.granted ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {item.granted ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>مفعل وممنوح ✓</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>غير مفعل</span>
                    </>
                  )}
                </span>

                {!item.granted && (
                  <button
                    type="button"
                    onClick={() => void item.action()}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition border border-white/10"
                  >
                    <span>{item.actionLabel}</span>
                    <ExternalLink className="w-3 h-3 opacity-70" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* OEM Specific / OnePlus / Xiaomi Notice */}
      <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-zinc-300">
        <div className="space-y-0.5 text-[11px]">
          <div className="font-bold text-zinc-200 flex items-center gap-1.5">
            <Settings className="w-3.5 h-3.5 text-[#7FFFD4]" />
            <span>لهواتف OnePlus و Xiaomi و Samsung: التشغيل التلقائي (Auto-Launch)</span>
          </div>
          <p className="text-zinc-400">
            تأكد من فتح صفحة التطبيق في الإعدادات وتفعيل <b>Auto-launch</b> و <b>Allow background activity</b> لضمان عمل المنبه حتى بعد إغلاق التطبيق.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void openAppSystemSettings()}
          className="px-3 py-1.5 rounded-lg bg-[#7FFFD4]/15 border border-[#7FFFD4]/30 text-[#7FFFD4] text-xs font-bold hover:bg-[#7FFFD4]/25 transition shrink-0 cursor-pointer flex items-center gap-1.5"
        >
          <span>فتح إعدادات النظام</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </section>
  );
};
