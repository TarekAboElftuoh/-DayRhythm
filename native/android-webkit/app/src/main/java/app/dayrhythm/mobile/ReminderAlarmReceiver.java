package app.dayrhythm.mobile;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Native Android Exact Alarm Receiver & Loud Audio Engine for DayRhythm (OnePlus 12R OxygenOS):
 * - Uses AlarmManager.setAlarmClock() so OxygenOS Doze NEVER defers or kills alarms.
 * - Uses dayrhythm_exact_alarms_v2 channel with explicit USAGE_ALARM sound + vibration + DND bypass.
 * - Plays loud native Ringtone + Vibrator with brief PARTIAL_WAKE_LOCK even when WebView is suspended.
 * - Supports configurable Snooze (5/10/15m, default 5) and clean single "تم" action.
 */
public class ReminderAlarmReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "dayrhythm_fullscreen_alarms_v4";
    private static final String LEGACY_CHANNEL_ID = "dayrhythm_exact_alarms_v2";
    public static final String ACTION_FIRE_ALARM = "app.dayrhythm.mobile.ACTION_FIRE_ALARM";
    public static final String ACTION_MARK_DONE = "app.dayrhythm.mobile.ACTION_MARK_DONE";
    public static final String ACTION_SNOOZE = "app.dayrhythm.mobile.ACTION_SNOOZE";
    /** Notification swiped away / "stop" without marking anything done. */
    public static final String ACTION_DISMISS = "app.dayrhythm.mobile.ACTION_DISMISS";
    public static final String ACTION_PENDING_QUEUE_UPDATED = "app.dayrhythm.mobile.ACTION_PENDING_QUEUE_UPDATED";

    public static final String EXTRA_ALARM_ID = "alarm_id";
    public static final String EXTRA_NOTIF_ID = "notif_id";
    public static final String EXTRA_KIND = "kind";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_MED_ID = "med_id";
    public static final String EXTRA_DOSE_TIME = "dose_time";
    public static final String EXTRA_SNOOZE_MIN = "snooze_min";

    private static final String PREFS_ALARMS = "dayrhythm_exact_alarms_prefs";
    private static final String KEY_SCHEDULED_IDS = "scheduled_request_codes";
    private static final String KEY_ACTIVE_NOTIF_IDS = "active_notif_ids";
    private static final String KEY_PENDING_ACTIONS = "pending_quick_actions_json";
    private static final long[] VIBRATION_PATTERN = new long[]{0, 420, 220, 420, 220, 520};

    private static final Object AUDIO_LOCK = new Object();
    private static Ringtone activeRingtone = null;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static final Runnable autoStopRingtoneRunnable = ReminderAlarmReceiver::stopRinging;
    private static final java.util.Map<String, Long> RECENT_FIRED_KEYS = new java.util.concurrent.ConcurrentHashMap<>();

    private static boolean isRecentlyFired(String key) {
        if (key == null || key.isEmpty()) return false;
        long now = System.currentTimeMillis();
        Long prev = RECENT_FIRED_KEYS.get(key);
        if (prev != null && (now - prev) < 12_000L) {
            return true;
        }
        RECENT_FIRED_KEYS.put(key, now);
        if (RECENT_FIRED_KEYS.size() > 40) {
            RECENT_FIRED_KEYS.entrySet().removeIf(entry -> (now - entry.getValue()) > 60_000L);
        }
        return false;
    }

    // Each category repeats the app's own sound for it (see soundResForKind) until dismissed.
    private static Runnable pulseRunnable = null;

    // The status bar shrinks setSmallIcon to a plain monochrome silhouette, so a full-color
    // launcher icon reads as the same indistinct blob for every category — prayer, water, task
    // and medication all looked identical at a glance. Each category now gets its own simple
    // shape (crescent, droplet, cross, calendar, check, bolt) so they're tellable apart by sight
    // the same way per-category tones already made them tellable apart by ear.
    private static int smallIconForKind(String kind) {
        if (kind == null) return R.drawable.ic_notif_default;
        switch (kind) {
            case "prayer":
                return R.drawable.ic_notif_prayer;
            case "water":
                return R.drawable.ic_notif_water;
            case "medication":
                return R.drawable.ic_notif_medication;
            case "event":
            case "calendar":
                return R.drawable.ic_notif_calendar;
            case "task":
                return R.drawable.ic_notif_task;
            case "charge":
                return R.drawable.ic_notif_charge;
            default:
                return R.drawable.ic_notif_default;
        }
    }

    private static int pulsePeriodMsForKind(String kind) {
        if (kind == null) return 2200;
        switch (kind) {
            case "medication":
                return 1300; // most urgent: don't miss a dose
            case "water":
                return 2600;
            case "charge":
                return 3200; // least urgent: just unplug when convenient
            default:
                return 2000;
        }
    }

    private static int sanitizeSnoozeMinutes(int raw) {
        if (raw == 5 || raw == 10 || raw == 15) return raw;
        return 5;
    }

    public static void ensureAlarmChannel(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        try {
            nm.deleteNotificationChannel(LEGACY_CHANNEL_ID);
            nm.deleteNotificationChannel("dayrhythm_keepalive_v2");
            nm.deleteNotificationChannel("dayrhythm_reminders_v3");
        } catch (Exception ignored) {
        }

        NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;

        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                "تنبيهات إيقاع اليوم",
                NotificationManager.IMPORTANCE_HIGH
        );
        ch.setDescription("تنبيهات الصلاة وشرب الماء والعلاجات والمهام — بصوت التطبيق نفسه لكل نوع");
        ch.enableVibration(true);
        ch.setVibrationPattern(VIBRATION_PATTERN);
        // No channel sound: the app plays its own sound for each category (playNativeAlarmSound).
        ch.setSound(null, null);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setBypassDnd(true);
        nm.createNotificationChannel(ch);
    }

    /** Back-compat overload: no category known, falls back to the generic prompt tone. */
    public static void playNativeAlarmSound(Context context, boolean continuous) {
        playNativeAlarmSound(context, continuous, null);
    }

    public static void playNativeAlarmSound(Context context, boolean continuous, String kind) {
        if (context == null) return;
        stopRinging();

        try {
            // The app's own sound for this category — the exact signature the web app plays
            // (rendered from audioEngine.ts into res/raw), not a system tone or alarm ringtone.
            final int soundRes = soundResForKind(context, kind);
            final int periodMs = pulsePeriodMsForKind(kind);
            final Context app = context.getApplicationContext();
            final Object token = new Object();
            synchronized (AUDIO_LOCK) {
                activeSoundToken = token;
            }
            pulseRunnable = new Runnable() {
                @Override
                public void run() {
                    synchronized (AUDIO_LOCK) {
                        if (activeSoundToken != token) return; // stopped/replaced meanwhile
                    }
                    playSoundOnce(app, soundRes);
                    mainHandler.postDelayed(this, periodMs);
                }
            };
            mainHandler.post(pulseRunnable);
            mainHandler.removeCallbacks(autoStopRingtoneRunnable);
            mainHandler.postDelayed(autoStopRingtoneRunnable, continuous ? 45_000L : 8_000L);
        } catch (Exception ignored) {
        }

        try {
            Vibrator vib = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (vib != null && vib.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vib.vibrate(VibrationEffect.createWaveform(VIBRATION_PATTERN, -1));
                } else {
                    //noinspection deprecation
                    vib.vibrate(VIBRATION_PATTERN, -1);
                }
            }
        } catch (Exception ignored) {
        }
    }

    public static void stopRinging() {
        mainHandler.removeCallbacks(autoStopRingtoneRunnable);
        if (pulseRunnable != null) {
            mainHandler.removeCallbacks(pulseRunnable);
            pulseRunnable = null;
        }
        synchronized (AUDIO_LOCK) {
            if (activeRingtone != null) {
                try {
                    if (activeRingtone.isPlaying()) activeRingtone.stop();
                } catch (Exception ignored) {
                }
                activeRingtone = null;
            }
            activeSoundToken = null;
            if (activePlayer != null) {
                try {
                    activePlayer.release();
                } catch (Exception ignored) {
                }
                activePlayer = null;
            }
        }
    }

    private static Object activeSoundToken = null;
    private static MediaPlayer activePlayer = null;

    private static int soundResForKind(Context context, String kind) {
        String name;
        if (kind == null) {
            name = "general";
        } else {
            switch (kind) {
                case "event":
                case "calendar":
                    name = "meeting_event";
                    break;
                case "task":
                    name = "focus_work";
                    break;
                case "charge":
                    name = "walk_health";
                    break;
                default:
                    name = kind; // already one of the app's categories (prayer, water, ...)
            }
        }
        int id = context.getResources().getIdentifier("dr_" + name, "raw", context.getPackageName());
        return id != 0 ? id : R.raw.dr_general;
    }

    private static void playSoundOnce(Context app, int soundRes) {
        try {
            MediaPlayer mp = MediaPlayer.create(
                    app,
                    soundRes,
                    new AudioAttributes.Builder()
                            // Alarm usage so it is still heard when the ringer is on silent (the
                            // app's own meeting / prayer quiet modes decide that, not the slider).
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build(),
                    0
            );
            if (mp == null) return;
            synchronized (AUDIO_LOCK) {
                if (activePlayer != null) {
                    try {
                        activePlayer.release();
                    } catch (Exception ignored) {
                    }
                }
                activePlayer = mp;
            }
            mp.setOnCompletionListener(p -> {
                synchronized (AUDIO_LOCK) {
                    if (activePlayer == p) activePlayer = null;
                }
                p.release();
            });
            mp.start();
        } catch (Exception ignored) {
        }
    }

    public static void triggerImmediateNativeAlarm(
            Context context,
            String title,
            String body,
            String kind,
            boolean continuous,
            int snoozeMinutes
    ) {
        if (context == null) return;
        String dedupeKey = (title != null ? title : "") + ":" + (kind != null ? kind : "");
        if (isRecentlyFired(dedupeKey)) return;

        PowerManager.WakeLock wakeLock = null;
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                // Wake screen so the card / alert is immediately visible
                wakeLock = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                                | PowerManager.ACQUIRE_CAUSES_WAKEUP
                                | PowerManager.ON_AFTER_RELEASE,
                        "DayRhythm:ImmediateAlarmWakeLock"
                );
                wakeLock.acquire(8_000L);
            }
        } catch (Exception ignored) {
        }

        try {
            int notifId = 7100 + Math.abs((title != null ? title : "alarm").hashCode() % 1000);
            playNativeAlarmSound(context, continuous, kind);
            showInteractiveNotification(
                    context,
                    notifId,
                    "live_" + notifId,
                    kind != null ? kind : "general",
                    title != null ? title : "تنبيه إيقاع اليوم",
                    body != null ? body : "",
                    "",
                    "",
                    sanitizeSnoozeMinutes(snoozeMinutes)
            );
            launchAlarmCard(
                    context,
                    notifId,
                    "live_" + notifId,
                    kind != null ? kind : "general",
                    title != null ? title : "تنبيه إيقاع اليوم",
                    body != null ? body : "",
                    "",
                    "",
                    snoozeMinutes
            );
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                try { wakeLock.release(); } catch (Exception ignored) { }
            }
        }
    }

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
        int snoozeMin = sanitizeSnoozeMinutes(intent.getIntExtra(EXTRA_SNOOZE_MIN, 5));

        if (ACTION_DISMISS.equals(action)) {
            stopRinging();
            cancelNotification(context, notifId);
            closeAlarmUi(context);
            CloudSignalClient.sendAlarmDismiss(context, "native_dismiss");
            return;
        }

        if (ACTION_SNOOZE.equals(action)) {
            stopRinging();
            cancelNotification(context, notifId);
            closeAlarmUi(context);
            // Stopping here stops the PC too (and vice versa — see CloudSignalClient).
            CloudSignalClient.sendAlarmDismiss(context, "native_snooze");
            long snoozeAtMs = System.currentTimeMillis() + (long) snoozeMin * 60_000L;
            scheduleSingleExactAlarm(
                    context,
                    notifId,
                    alarmId != null ? alarmId : ("snooze_" + notifId),
                    kind != null ? kind : "general",
                    title != null ? title : "تذكير مؤجّل · إيقاع اليوم",
                    body != null ? body : ("مرّت " + snoozeMin + " دقائق — حان وقت التنفيذ"),
                    medId != null ? medId : "",
                    doseTime != null ? doseTime : "",
                    snoozeAtMs,
                    snoozeMin
            );
            enqueuePendingQuickAction(context, "snooze_dismiss", alarmId, medId, doseTime);
            Intent notifyIntent = new Intent(ACTION_PENDING_QUEUE_UPDATED);
            notifyIntent.setPackage(context.getPackageName());
            context.sendBroadcast(notifyIntent);
            return;
        }

        if (ACTION_MARK_DONE.equals(action)) {
            stopRinging();
            cancelNotification(context, notifId);
            closeAlarmUi(context);
            CloudSignalClient.sendAlarmDismiss(context, "native_done");
            enqueuePendingQuickAction(context, kind, alarmId, medId, doseTime);
            Intent notifyIntent = new Intent(ACTION_PENDING_QUEUE_UPDATED);
            notifyIntent.setPackage(context.getPackageName());
            context.sendBroadcast(notifyIntent);
            return;
        }

        if (ACTION_FIRE_ALARM.equals(action)) {
            String dedupeKey = (title != null ? title : "") + ":" + (kind != null ? kind : "");
            if (isRecentlyFired(dedupeKey)) return;

            PowerManager.WakeLock wakeLock = null;
            try {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(
                            PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                                    | PowerManager.ACQUIRE_CAUSES_WAKEUP
                                    | PowerManager.ON_AFTER_RELEASE,
                            "DayRhythm:AlarmWakeLock"
                    );
                    wakeLock.acquire(10_000L);
                }
            } catch (Exception ignored) {
            }
            try {
                // Play distinct per-category sound once with vibration; no infinite alarm takeover
                boolean isContinuous = false;
                playNativeAlarmSound(context, isContinuous, kind);
                showInteractiveNotification(context, notifId, alarmId, kind, title, body, medId, doseTime, snoozeMin);

                // Launch desktop-style AlarmActivity card over lock screen
                launchAlarmCard(context, notifId, alarmId, kind, title, body, medId, doseTime, snoozeMin);

                // Sub-second instantaneous sync: notify PC over active WebSocket so desktop card pops up simultaneously!
                DayRhythmSyncService.broadcastAlarmTrigger(title, body, kind, snoozeMin);

                // If the PC (or another device) stops this alert, stop it here too.
                CloudSignalClient.watchForRemoteDismiss(context, System.currentTimeMillis());
            } finally {
                if (wakeLock != null && wakeLock.isHeld()) {
                    try { wakeLock.release(); } catch (Exception ignored) { }
                }
            }
        }
    }

    public static void launchAlarmCard(
            Context context,
            int notifId,
            String alarmId,
            String kind,
            String title,
            String body,
            String medId,
            String doseTime,
            int snoozeMin
    ) {
        if (context == null) return;
        try {
            Intent fsIntent = new Intent(context, AlarmActivity.class);
            fsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP
                    | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            fsIntent.putExtra(EXTRA_NOTIF_ID, notifId);
            fsIntent.putExtra(EXTRA_ALARM_ID, alarmId != null ? alarmId : ("live_" + notifId));
            fsIntent.putExtra(EXTRA_KIND, kind != null ? kind : "general");
            fsIntent.putExtra(EXTRA_TITLE, title != null ? title : "تنبيه إيقاع اليوم");
            fsIntent.putExtra(EXTRA_BODY, body != null ? body : "");
            fsIntent.putExtra(EXTRA_MED_ID, medId != null ? medId : "");
            fsIntent.putExtra(EXTRA_DOSE_TIME, doseTime != null ? doseTime : "");
            fsIntent.putExtra(EXTRA_SNOOZE_MIN, sanitizeSnoozeMinutes(snoozeMin));

            if (Build.VERSION.SDK_INT >= 34) {
                android.app.ActivityOptions options = android.app.ActivityOptions.makeBasic();
                options.setPendingIntentBackgroundActivityStartMode(
                        android.app.ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                );
                context.startActivity(fsIntent, options.toBundle());
            } else {
                context.startActivity(fsIntent);
            }
        } catch (Exception ignored) {
        }
    }

    public static void scheduleBatchFromJson(Context context, String jsonArrayStr) {
        if (context == null || jsonArrayStr == null) return;
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

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
                if (triggerAtMs <= nowMs + 1_000L) continue;

                String alarmId = item.optString("id", "alarm_" + i);
                String kind = item.optString("kind", "general");
                String title = item.optString("title", "تنبيه إيقاع اليوم");
                String body = item.optString("body", "");
                String medId = item.optString("medicationId", "");
                String doseTime = item.optString("doseTime24", "");
                int snoozeMin = sanitizeSnoozeMinutes(item.optInt("snoozeMinutes", 5));
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
                        triggerAtMs,
                        snoozeMin
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
            long triggerAtMs,
            int snoozeMinutes
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
        fireIntent.putExtra(EXTRA_SNOOZE_MIN, sanitizeSnoozeMinutes(snoozeMinutes));

        PendingIntent pi = PendingIntent.getBroadcast(
                context,
                requestCode,
                fireIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent showIntent = new Intent(context, MainActivity.class);
        showIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent showPi = PendingIntent.getActivity(
                context,
                requestCode + 300_000,
                showIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        try {
            // setAlarmClock() bypasses OnePlus OxygenOS Doze & background throttling reliably!
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (am.canScheduleExactAlarms()) {
                    am.setAlarmClock(new AlarmManager.AlarmClockInfo(triggerAtMs, showPi), pi);
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
                }
            } else {
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(triggerAtMs, showPi), pi);
            }
        } catch (SecurityException se) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
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
            String doseTime,
            int snoozeMin
    ) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        ensureAlarmChannel(context);

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(
                context,
                notifId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

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

        Intent snoozeIntent = new Intent(context, ReminderAlarmReceiver.class);
        snoozeIntent.setAction(ACTION_SNOOZE);
        snoozeIntent.putExtra(EXTRA_NOTIF_ID, notifId);
        snoozeIntent.putExtra(EXTRA_ALARM_ID, alarmId);
        snoozeIntent.putExtra(EXTRA_KIND, kind);
        snoozeIntent.putExtra(EXTRA_TITLE, title);
        snoozeIntent.putExtra(EXTRA_BODY, body);
        snoozeIntent.putExtra(EXTRA_MED_ID, medId);
        snoozeIntent.putExtra(EXTRA_DOSE_TIME, doseTime);
        snoozeIntent.putExtra(EXTRA_SNOOZE_MIN, snoozeMin);
        PendingIntent snoozePi = PendingIntent.getBroadcast(
                context,
                notifId + 200_000,
                snoozeIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Locked / screen off → full-screen alert (AlarmActivity). Phone in use → Android shows a
        // heads-up banner from the top instead, never a full-screen takeover.
        Intent fsIntent = new Intent(context, AlarmActivity.class);
        fsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        fsIntent.putExtra(EXTRA_NOTIF_ID, notifId);
        fsIntent.putExtra(EXTRA_ALARM_ID, alarmId);
        fsIntent.putExtra(EXTRA_KIND, kind);
        fsIntent.putExtra(EXTRA_TITLE, title);
        fsIntent.putExtra(EXTRA_BODY, body);
        fsIntent.putExtra(EXTRA_MED_ID, medId);
        fsIntent.putExtra(EXTRA_DOSE_TIME, doseTime);
        fsIntent.putExtra(EXTRA_SNOOZE_MIN, snoozeMin);
        PendingIntent fullScreenPi = PendingIntent.getActivity(
                context,
                notifId + 300_000,
                fsIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent dismissIntent = new Intent(context, ReminderAlarmReceiver.class);
        dismissIntent.setAction(ACTION_DISMISS);
        dismissIntent.putExtra(EXTRA_NOTIF_ID, notifId);
        PendingIntent dismissPi = PendingIntent.getBroadcast(
                context,
                notifId + 400_000,
                dismissIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String doneLabel = "water".equals(kind)
                ? "شربت كوب ماء"
                : "medication".equals(kind)
                    ? "أخذت الجرعة"
                    : "تم";

        String shownBody = body != null && !body.isEmpty() ? body : "حان وقت مهمتك الآن";
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(smallIconForKind(kind))
                .setContentTitle(title != null && !title.isEmpty() ? title : "تنبيه إيقاع اليوم")
                .setContentText(shownBody)
                // The body now carries the event's description on its first line; BigText keeps it
                // readable in the heads-up banner instead of cutting it to one line.
                .setStyle(new NotificationCompat.BigTextStyle().bigText(shownBody))
                // Gone by itself after two minutes, same as the PC alert, instead of staying up.
                .setTimeoutAfter(120_000L)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setColor(0xFF7FFFD4)
                .setVibrate(VIBRATION_PATTERN)
                .setAutoCancel(true)
                .setFullScreenIntent(fullScreenPi, true)
                .setContentIntent(contentPi)
                .setDeleteIntent(dismissPi)
                .addAction(0, doneLabel, donePi)
                .addAction(0, "تأجيل " + snoozeMin + " د", snoozePi);

        try {
            // Update the single unified notification (ID 1001) so there are NEVER duplicate notifications!
            nm.notify(DayRhythmSyncService.NOTIF_UNIFIED_ID, builder.build());
            nm.cancel(1002);
            trackActiveNotifId(context, DayRhythmSyncService.NOTIF_UNIFIED_ID);
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

    private static void closeAlarmUi(Context context) {
        try {
            Intent close = new Intent(AlarmActivity.ACTION_CLOSE_ALARM_UI);
            close.setPackage(context.getPackageName());
            context.sendBroadcast(close);
        } catch (Exception ignored) {
        }
    }

    public static void cancelAllActiveAlarms(Context context) {
        stopRinging();
        CloudSignalClient.stopWatching();
        if (context == null) return;
        closeAlarmUi(context);
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(1002);
        }
        DayRhythmSyncService.refreshServiceNotification(context);
    }

    private static void cancelNotification(Context context, int notifId) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(1002);
            if (notifId != DayRhythmSyncService.NOTIF_UNIFIED_ID) {
                nm.cancel(notifId);
            }
        }
        DayRhythmSyncService.refreshServiceNotification(context);
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
