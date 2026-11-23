package com.dayrhythm.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * معالج فحص وطلب كافة صلاحيات أندرويد العادية والخاصة
 * لنظام DayRhythm المتزامن (Android 12 – 16).
 */
@CapacitorPlugin(
    name = "AndroidPermissions",
    permissions = {
        @Permission(
            strings = { Manifest.permission.POST_NOTIFICATIONS },
            alias = "notifications"
        ),
        @Permission(
            strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION },
            alias = "location"
        ),
        @Permission(
            strings = { Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR },
            alias = "calendar"
        ),
        @Permission(
            strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION },
            alias = "backgroundLocation"
        )
    }
)
public class PermissionWizardPlugin extends Plugin {

    // ==============================================================
    // دوال الفحص (Checkers)
    // ==============================================================

    public boolean isNotificationGranted() {
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    public boolean isExactAlarmGranted() {
        if (Build.VERSION.SDK_INT >= 31) {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            return am != null && am.canScheduleExactAlarms();
        }
        return true;
    }

    public boolean isIgnoringBatteryOptimizations() {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    public boolean isFullScreenIntentGranted() {
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            return nm != null && nm.canUseFullScreenIntent();
        }
        return true;
    }

    public boolean isDndPolicyAccessGranted() {
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.isNotificationPolicyAccessGranted();
    }

    public boolean isFineLocationGranted() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    public boolean isBackgroundLocationGranted() {
        if (Build.VERSION.SDK_INT >= 29) {
            return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
        }
        return isFineLocationGranted();
    }

    public boolean isCalendarGranted() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED &&
               ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    // ==============================================================
    // Plugin Methods exposed to Web / UI
    // ==============================================================

    @PluginMethod
    public void checkPermissionsStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("notification", isNotificationGranted());
        ret.put("exactAlarm", isExactAlarmGranted());
        ret.put("batteryOptimization", isIgnoringBatteryOptimizations());
        ret.put("fullScreenIntent", isFullScreenIntentGranted());
        ret.put("dndPolicy", isDndPolicyAccessGranted());
        ret.put("fineLocation", isFineLocationGranted());
        ret.put("backgroundLocation", isBackgroundLocationGranted());
        ret.put("calendar", isCalendarGranted());
        ret.put("isAndroid", true);
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestEssentialPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissionForAliases(new String[] { "notifications", "location", "calendar" }, call, "essentialCallback");
        } else {
            requestPermissionForAliases(new String[] { "location", "calendar" }, call, "essentialCallback");
        }
    }

    @PermissionCallback
    private void essentialCallback(PluginCall call) {
        checkPermissionsStatus(call);
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception e) {
                openAppSystemSettings(call);
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void openBatteryOptimizationSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
            } catch (Exception ex) {
                openAppSystemSettings(call);
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void openFullScreenIntentSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 34) {
            try {
                Intent intent = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT");
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception e) {
                openAppSystemSettings(call);
                return;
            }
        } else {
            openAppSystemSettings(call);
        }
        call.resolve();
    }

    @PluginMethod
    public void openDndSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            openAppSystemSettings(call);
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void requestBackgroundLocation(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 29) {
            requestPermissionForAlias("backgroundLocation", call, "backgroundLocCallback");
        } else {
            call.resolve();
        }
    }

    @PermissionCallback
    private void backgroundLocCallback(PluginCall call) {
        checkPermissionsStatus(call);
    }

    @PluginMethod
    public void openAppSystemSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            // Ignore
        }
        call.resolve();
    }
}
