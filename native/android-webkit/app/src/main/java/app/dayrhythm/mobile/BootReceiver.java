package app.dayrhythm.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    private static final String ACTION_QUICKBOOT_POWERON = "android.intent.action.QUICKBOOT_POWERON";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null || intent.getAction() == null) return;
        String action = intent.getAction();

        boolean isBootOrUpgrade = Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || ACTION_QUICKBOOT_POWERON.equals(action);
        boolean isTimeOrZoneChange = Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action);

        if (!isBootOrUpgrade && !isTimeOrZoneChange) {
            return;
        }

        if (isBootOrUpgrade) {
            DayRhythmSyncService.startServiceCompat(context);
            UpdateCheckWorker.schedulePeriodicCheck(context);
        } else {
            DayRhythmSyncService.restartIfActive(context);
        }

        final Context appContext = context.getApplicationContext();
        final PendingResult pendingResult = goAsync();
        new Thread(() -> {
            try {
                ReminderAlarmReceiver.rescheduleFromPrefs(appContext);
            } catch (Throwable ignored) {
            } finally {
                pendingResult.finish();
            }
        }, "DayRhythmBootReschedule").start();
    }
}
