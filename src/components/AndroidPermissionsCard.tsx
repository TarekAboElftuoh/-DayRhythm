import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Bell,
  Clock,
  BatteryCharging,
  Maximize2,
  Volume2,
  MapPin,
  Settings,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import {
  type AndroidPermissionsStatus,
  getAndroidPermissionsStatus,
  isAndroidNative,
  openAppSystemSettings,
  openBatteryOptimizationSettings,
  openDndSettings,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  requestEssentialAndroidPermissions,
} from '../services/androidPermissions';

export const AndroidPermissionsCard: React.FC = () => {
  const [status, setStatus] = useState<AndroidPermissionsStatus | null>(() =>
    getAndroidPermissionsStatus()
  );

  const refreshStatus = useCallback(() => {
    const s = getAndroidPermissionsStatus();
    if (s) setStatus(s);
  }, []);

  useEffect(() => {
    refreshStatus();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshStatus();
      }
    };

    window.addEventListener('dayrhythm:permissions-changed', refreshStatus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('dayrhythm:permissions-changed', refreshStatus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshStatus]);

  if (!isAndroidNative() || !status) {
    return null;
  }

  const items = [
    {
      id: 'exactAlarm',
      title: 'المنبه الدقيق (Exact Alarms)',
      desc: 'رنين المنبه بالثانية وتخطي تجميد نظام أندرويد (Doze Mode)',
      granted: status.exactAlarm,
      icon: Clock,
      action: openExactAlarmSettings,
      actionLabel: 'تفعيل المنبه الدقيق',
    },
    {
      id: 'batteryOptimization',
      title: 'استثناء قيود البطارية (Unrestricted Battery)',
      desc: 'منع النظام من إيقاف الخدمة المستمرة في الخلفية ومزامنة الكبسولة',
      granted: status.batteryOptimization,
      icon: BatteryCharging,
      action: openBatteryOptimizationSettings,
      actionLabel: 'استثناء البطارية',
    },
    {
      id: 'fullScreenIntent',
      title: 'الظهور فوق شاشة القفل (Full-Screen Alert)',
      desc: 'إيقاظ الشاشة وفتح شاشة الرنين بملء الشاشة أثناء قفل الهاتف',
      granted: status.fullScreenIntent,
      icon: Maximize2,
      action: openFullScreenIntentSettings,
      actionLabel: 'تفعيل شاشة القفل',
    },
    {
      id: 'dndPolicy',
      title: 'تجاوز وضع الصامت (DND Policy Access)',
      desc: 'رنين الأذان والتنبيهات المصيرية حتى لو الهاتف في وضع الصامت',
      granted: status.dndPolicy,
      icon: Volume2,
      action: openDndSettings,
      actionLabel: 'إعدادات عدم الإزعاج',
    },
    {
      id: 'notifications',
      title: 'الإشعارات وتحديثات الحالة (Notifications)',
      desc: 'إشعار الكبسولة المستمر وتنبيهات الأدوية والصلوات',
      granted: status.notifications,
      icon: Bell,
      action: requestEssentialAndroidPermissions,
      actionLabel: 'منح الإذن',
    },
    {
      id: 'location',
      title: 'الموقع الجغرافي الدقيق (GPS Location)',
      desc: 'حساب مواقيت الصلاة واتجاه القبلة بدقة بحسب موقعك الحالي',
      granted: status.location,
      icon: MapPin,
      action: requestEssentialAndroidPermissions,
      actionLabel: 'منح إذن الموقع',
    },
  ];

  const grantedCount = items.filter((i) => i.granted).length;
  const allGranted = grantedCount === items.length;

  return (
    <section className="p-4 rounded-2xl border border-white/10 bg-black/40 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {allGranted ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          )}
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              صلاحيات أندرويد الحساسة
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  allGranted
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                }`}
              >
                {grantedCount} / {items.length} مفعلة
              </span>
            </h3>
            <p className="text-[11px] text-zinc-400">
              صلاحيات النظام الحقيقية لضمان عمل المنبه والكبسولة في الخلفية دون انقطاع
            </p>
          </div>
        </div>

        {!allGranted && (
          <button
            type="button"
            onClick={requestEssentialAndroidPermissions}
            className="px-3 py-1.5 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] cursor-pointer transition shrink-0"
          >
            طلب الأساسية
          </button>
        )}
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                item.granted
                  ? 'border-emerald-500/20 bg-emerald-950/10'
                  : 'border-amber-500/30 bg-amber-950/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-lg mt-0.5 ${
                    item.granted
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-amber-500/10 text-amber-400'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">
                      {item.title}
                    </span>
                    {item.granted ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        مفعل
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                        <AlertTriangle className="w-3 h-3" />
                        غير مفعل
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-snug">
                    {item.desc}
                  </p>
                </div>
              </div>

              {!item.granted && (
                <button
                  type="button"
                  onClick={item.action}
                  className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 text-xs font-medium cursor-pointer transition shrink-0 flex items-center gap-1"
                >
                  <span>{item.actionLabel}</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
        <span className="text-[11px] text-zinc-400">
          لهواتف OnePlus و Xiaomi: تأكد من تفعيل Auto-Launch والسماح بالنشاط في الخلفية
        </span>
        <button
          type="button"
          onClick={openAppSystemSettings}
          className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 text-xs font-medium cursor-pointer transition shrink-0 flex items-center gap-1.5"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>إعدادات التطبيق بالنظام</span>
        </button>
      </div>
    </section>
  );
};
