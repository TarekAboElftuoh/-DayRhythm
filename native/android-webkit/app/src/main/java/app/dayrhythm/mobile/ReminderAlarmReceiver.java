package app.dayrhythm.mobile;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Native Android Exact Alarm Receiver for DayRhythm (Prayers, Water Cups, Medications).
 * Fires reliably even when the screen is locked or the app process is killed, and offers
 * interactive notification quick actions: "✓ تم التنفيذ" and "⏰ تأجيل 15 د".
 */
public class ReminderAlarmReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "dayrhythm_exact_alarms_v1";
    public static final String ACTION_FIRE_ALARM = "app.dayrhythm.mobile.ACTION_FIRE_ALARM";
    public static final String ACTION_MARK_DONE = "app.dayrhythm.mobile.ACTION_MARK_DONE";
    public static final String ACTION_SNOOZE_15 = "app.dayrhythm.mobile.ACTION_SNOOZE_15";
    public static final String ACTION_PENDING_QUEUE_UPDATED = "app.dayrhythm.mobile.ACTION_PENDING_QUEUE_UPDATED";

    public static final String EXTRA_ALARM_ID = "alarm_id";
    public static final String EXTRA_NOTIF_ID = "notif_id";
    public static final String EXTRA_KIND = "kind";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_MED_ID = "med_id";
    public static final String EXTRA_DOSE_TIME = "dose_time";

    private static final String PREFS_ALARMS = "dayrhythm_exact_alarms_prefs";
    private static final String KEY_SCHEDULED_IDS = "scheduled_request_codes";
    private static final String KEY_ACTIVE_NOTIF_IDS = "active_notif_ids";
    private static final String KEY_PENDING_ACTIONS = "pending_quick_actions_json";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        if (action == null) return;

        int notifId = intent.getIntExtra(EXTRA_NOTIF_ID, 4001);
        String alarmId = intent.getStringExtra(EXTRA_ALARM_ID);
        String kind = intent.getStringExtra(EXTRA_KIND);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        String medId = intent.getStringExtra(EXTRA_MED_ID);
        String doseTime = intent.getStringExtra(EXTRA_DOSE_TIME);

        if (ACTION_SNOOZE_15.equals(action)) {
            cancelNotification(context, notifId);
            long snoozeAtMs = System.currentTimeMillis() + 15L * 60_000L;
            scheduleSingleExactAlarm(
                    context,
                    notifId,
                    alarmId != null ? alarmId : ("snooze_" + notifId),
                    kind != null ? kind : "general",
                    title != null ? title : "تذكير مؤجّل · إيقاع اليوم",
                    body != null ? body : "مرّت 15 دقيقة — حان وقت التنفيذ",
                    medId != null ? medId : "",
                    doseTime != null ? doseTime : "",
                    snoozeAtMs
            );
            // Also notify live WebView so PC stops ringing immediately when snoozed from phone!
            enqueuePendingQuickAction(context, "snooze_dismiss", alarmId, medId, doseTime);
            Intent notifyIntent = new Intent(ACTION_PENDING_QUEUE_UPDATED);
            notifyIntent.setPackage(context.getPackageName());
            context.sendBroadcast(notifyIntent);
            return;
        }

        if (ACTION_MARK_DONE.equals(action)) {
            cancelNotification(context, notifId);
            enqueuePendingQuickAction(context, kind, alarmId, medId, doseTime);
            // Notify live MainActivity if foreground/background WebView is alive
            Intent notifyIntent = new Intent(ACTION_PENDING_QUEUE_UPDATED);
            notifyIntent.setPackage(context.getPackageName());
            context.sendBroadcast(notifyIntent);
            return;
        }

        if (ACTION_FIRE_ALARM.equals(action)) {
            showInteractiveNotification(context, notifId, alarmId, kind, title, body, medId, doseTime);
        }
    }

    public static void scheduleBatchFromJson(Context context, String jsonArrayStr) {
        if (context == null || jsonArrayStr == null) return;
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        // Cancel previously scheduled alarms first so changes stay clean & duplicate-free
        SharedPreferences prefs = context.getSharedPreferences(PREFS_ALARMS, Context.MODE_PRIVATE);
        String prevCsv = prefs.getString(KEY_SCHEDULED_IDS, "");
        if (prevCsv != null && !prevCsv.isEmpty()) {
            for (String token : prevCsv.split(",")) {
                try {
                    int reqCode = Integer.parseInt(token.trim());
                    Intent cancelIntent = new Intent(context, ReminderAlarmReceiver.class);
                    cancelIntent.setAction(ACTION_FIRE_ALARM);
                    PendingIntent pi = PendingIntent.getBroadcast(
                            context,
                            reqCode,
                            cancelIntent,
                            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
                    );
                    if (pi != null) {
                        am.cancel(pi);
                        pi.cancel();
                    }
                } catch (Exception ignored) {
                }
            }
        }

        StringBuilder newIds = new StringBuilder();
        long nowMs = System.currentTimeMillis();
        try {
            JSONArray arr = new JSONArray(jsonArrayStr);
            int maxItems = Math.min(arr.length(), 60);
            for (int i = 0; i < maxItems; i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item == null) continue;
                long triggerAtMs = item.optLong("triggerAtMs", 0L);
                if (triggerAtMs <= nowMs + 5_000L) continue;

                String alarmId = item.optString("id", "alarm_" + i);
                String kind = item.optString("kind", "general");
                String title = item.optString("title", "تنبيه إيقاع اليوم");
                String body = item.optString("body", "");
                String medId = item.optString("medicationId", "");
                String doseTime = item.optString("doseTime24", "");
                int reqCode = 5000 + Math.abs(alarmId.hashCode() % 40000);

                scheduleSingleExactAlarm(
                        context,
                        reqCode,
                        alarmId,
                        kind,
                        title,
                        body,
                        medId,
                        doseTime,
                        triggerAtMs
                );
                if (newIds.length() > 0) newIds.append(",");
                newIds.append(reqCode);
            }
        } catch (Exception ignored) {
        }
        prefs.edit().putString(KEY_SCHEDULED_IDS, newIds.toString()).apply();
    }

    public static void scheduleSingleExactAlarm(
            Context context,
            int requestCode,
            String alarmId,
            String kind,
            String title,
            String body,
            String medId,
            String doseTime,
            long triggerAtMs
    ) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent fireIntent = new Intent(context, ReminderAlarmReceiver.class);
        fireIntent.setAction(ACTION_FIRE_ALARM);
        fireIntent.putExtra(EXTRA_NOTIF_ID, requestCode);
        fireIntent.putExtra(EXTRA_ALARM_ID, alarmId);
        fireIntent.putExtra(EXTRA_KIND, kind);
        fireIntent.putExtra(EXTRA_TITLE, title);
        fireIntent.putExtra(EXTRA_BODY, body);
        fireIntent.putExtra(EXTRA_MED_ID, medId);
        fireIntent.putExtra(EXTRA_DOSE_TIME, doseTime);

        PendingIntent pi = PendingIntent.getBroadcast(
                context,
                requestCode,
                fireIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (am.canScheduleExactAlarms()) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
            }
        } catch (SecurityException se) {
            am.set(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
        }
    }

    private static void showInteractiveNotification(
            Context context,
            int notifId,
            String alarmId,
            String kind,
            String title,
            String body,
            String medId,
            String doseTime
    ) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "منبهات إيقاع اليوم الدقيقة",
                    NotificationManager.IMPORTANCE_HIGH
            );
            ch.setDescription("تنبيهات الصلاة وشرب الماء والعلاجات والمهام بدقة حتى مع قفل الشاشة");
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
        }

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(
                context,
                notifId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Quick Action 1: Done (Water / Medication / Task / Calendar)
        Intent doneIntent = new Intent(context, ReminderAlarmReceiver.class);
        doneIntent.setAction(ACTION_MARK_DONE);
        doneIntent.putExtra(EXTRA_NOTIF_ID, notifId);
        doneIntent.putExtra(EXTRA_ALARM_ID, alarmId);
        doneIntent.putExtra(EXTRA_KIND, kind);
        doneIntent.putExtra(EXTRA_MED_ID, medId);
        doneIntent.putExtra(EXTRA_DOSE_TIME, doseTime);
        PendingIntent donePi = PendingIntent.getBroadcast(
                context,
                notifId + 100_000,
                doneIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Quick Action 2: Snooze 15m
        Intent snoozeIntent = new Intent(context, ReminderAlarmReceiver.class);
        snoozeIntent.setAction(ACTION_SNOOZE_15);
        snoozeIntent.putExtra(EXTRA_NOTIF_ID, notifId);
        snoozeIntent.putExtra(EXTRA_ALARM_ID, alarmId);
        snoozeIntent.putExtra(EXTRA_KIND, kind);
        snoozeIntent.putExtra(EXTRA_TITLE, title);
        snoozeIntent.putExtra(EXTRA_BODY, body);
        snoozeIntent.putExtra(EXTRA_MED_ID, medId);
        snoozeIntent.putExtra(EXTRA_DOSE_TIME, doseTime);
        PendingIntent snoozePi = PendingIntent.getBroadcast(
                context,
                notifId + 200_000,
                snoozeIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String doneLabel = "water".equals(kind)
                ? "✓ شربت الآن"
                : "medication".equals(kind)
                    ? "✓ أخذت الجرعة"
                    : "✓ تم / إغلاق";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title != null && !title.isEmpty() ? title : "تنبيه إيقاع اليوم")
                .setContentText(body != null && !body.isEmpty() ? body : "حان وقت مهمتك الآن")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setContentIntent(contentPi)
                .addAction(0, doneLabel, donePi)
                .addAction(0, "⏰ تأجيل 15 د", snoozePi);

        try {
            nm.notify(notifId, builder.build());
            trackActiveNotifId(context, notifId);
        } catch (SecurityException ignored) {
        }
    }

    private static void trackActiveNotifId(Context context, int notifId) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_ALARMS, Context.MODE_PRIVATE);
            String csv = prefs.getString(KEY_ACTIVE_NOTIF_IDS, "");
            String token = String.valueOf(notifId);
            if (csv == null || csv.isEmpty()) {
                prefs.edit().putString(KEY_ACTIVE_NOTIF_IDS, token).apply();
            } else if (!("," + csv + ",").contains("," + token + ",")) {
                prefs.edit().putString(KEY_ACTIVE_NOTIF_IDS, csv + "," + token).apply();
            }
        } catch (Exception ignored) {
        }
    }

    public static void cancelAllActiveAlarms(Context context) {
        if (context == null) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_ALARMS, Context.MODE_PRIVATE);
        String csv = prefs.getString(KEY_ACTIVE_NOTIF_IDS, "");
        if (nm != null && csv != null && !csv.isEmpty()) {
            for (String token : csv.split(",")) {
                try {
                    nm.cancel(Integer.parseInt(token.trim()));
                } catch (Exception ignored) {
                }
            }
        }
        prefs.edit().putString(KEY_ACTIVE_NOTIF_IDS, "").apply();
    }

    private static void cancelNotification(Context context, int notifId) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(notifId);
        }
    }

    private static void enqueuePendingQuickAction(
            Context context,
            String kind,
            String alarmId,
            String medId,
            String doseTime
    ) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_ALARMS, Context.MODE_PRIVATE);
            String existing = prefs.getString(KEY_PENDING_ACTIONS, "[]");
            JSONArray arr = new JSONArray(existing != null ? existing : "[]");
            JSONObject obj = new JSONObject();
            obj.put("kind", kind != null ? kind : "general");
            obj.put("alarmId", alarmId != null ? alarmId : "");
            obj.put("medicationId", medId != null ? medId : "");
            obj.put("doseTime24", doseTime != null ? doseTime : "");
            obj.put("timestampMs", System.currentTimeMillis());
            arr.put(obj);
            prefs.edit().putString(KEY_PENDING_ACTIONS, arr.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    public static String consumePendingQuickActionsJson(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_ALARMS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_PENDING_ACTIONS, "[]");
        if (raw != null && !raw.equals("[]")) {
            prefs.edit().putString(KEY_PENDING_ACTIONS, "[]").apply();
            return raw;
        }
        return "[]";
    }
}
