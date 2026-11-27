package app.dayrhythm.mobile;

import android.app.AlarmManager;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
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
    public static final String EXTRA_LOCAL_ONLY = "local_only";

    public static final String PREFS_ALARMS = "dayrhythm_exact_alarms_prefs";
    public static final String KEY_SCHEDULED_IDS = "scheduled_request_codes";
    public static final String KEY_CACHED_SCHEDULE = "cached_schedule_json";
    private static final String KEY_ACTIVE_NOTIF_IDS = "active_notif_ids";
    private static final String KEY_PENDING_ACTIONS = "pending_quick_actions_json";
    private static final long[] VIBRATION_PATTERN = new long[]{0, 420, 220, 420, 220, 520};

    private static final Object AUDIO_LOCK = new Object();
    private static Ringtone activeRingtone = null;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static final Runnable autoStopRingtoneRunnable = ReminderAlarmReceiver::stopRinging;
    private static AudioFocusRequest activeFocusRequest = null;
    private static final AudioManager.OnAudioFocusChangeListener focusChangeListener = focusChange -> {
        // Alarm audio takes priority; if transient loss occurs, alarm stream handles focus
    };
    private static final java.util.Map<String, Long> RECENT_FIRED_KEYS = new java.util.concurrent.ConcurrentHashMap<>();
    private static volatile Context lastAppContext = null;

    private static void requestAlarmAudioFocus(Context context) {
        if (context == null) return;
        try {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;

            AudioAttributes alarmAttrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
                    .build();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (activeFocusRequest == null) {
                    AudioFocusRequest.Builder reqBuilder =
                            new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                                    .setAudioAttributes(alarmAttrs)
                                    .setAcceptsDelayedFocusGain(false)
                                    .setWillPauseWhenDucked(false)
                                    .setOnAudioFocusChangeListener(focusChangeListener, mainHandler);
                    activeFocusRequest = reqBuilder.build();
                }
                am.requestAudioFocus(activeFocusRequest);
            } else {
                //noinspection deprecation
                am.requestAudioFocus(
                        focusChangeListener,
                        AudioManager.STREAM_ALARM,
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE
                );
            }
        } catch (Exception ignored) {
        }
    }

    private static void abandonAlarmAudioFocus(Context context) {
        if (context == null) return;
        try {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (activeFocusRequest != null) {
                    am.abandonAudioFocusRequest(activeFocusRequest);
                    activeFocusRequest = null;
                }
            } else {
                //noinspection deprecation
                am.abandonAudioFocus(focusChangeListener);
            }
        } catch (Exception ignored) {
        }
    }

    private static boolean isRecentlyFired(String key) {
        if (key == null || key.isEmpty()) return false;
        long now = System.currentTimeMillis();
        Long prev = RECENT_FIRED_KEYS.get(key);
        if (prev != null && (now - prev) < 10_000L) {
            return true;
        }
        RECENT_FIRED_KEYS.put(key, now);
        if (RECENT_FIRED_KEYS.size() > 40) {
            RECENT_FIRED_KEYS.entrySet().removeIf(entry -> (now - entry.getValue()) > 10_000L);
        }
        return false;
    }

    // Each category repeats smoothly after completion with a comfortable breathing pause.
    private static Runnable pulseRunnable = null;
    private static Runnable autoSnoozeRunnable = null;

    public static void cancelAutoSnooze() {
        if (autoSnoozeRunnable != null) {
            mainHandler.removeCallbacks(autoSnoozeRunnable);
            autoSnoozeRunnable = null;
        }
    }

    private static void scheduleUnattendedAutoSnooze(
            Context context,
            int notifId,
            String alarmId,
            String kind,
            String title,
            String body,
            String medId,
            String doseTime
    ) {
        cancelAutoSnooze();
        if (context == null || "charge".equals(kind)) return;
        final Context app = context.getApplicationContext();
        autoSnoozeRunnable = () -> {
            autoSnoozeRunnable = null;
            stopRinging();
            cancelNotification(app, notifId);
            closeAlarmUi(app);
            long retryAtMs = System.currentTimeMillis() + 5L * 60_000L;
            scheduleSingleExactAlarm(
                    app,
                    notifId,
                    alarmId != null ? alarmId : ("autosnooze_" + notifId),
                    kind != null ? kind : "general",
                    title != null ? title : "تذكير · إيقاع اليوم",
                    body != null ? body : "إعادة تنبيه تلقائية بعد 5 دقائق",
                    medId != null ? medId : "",
                    doseTime != null ? doseTime : "",
                    retryAtMs,
                    5
            );
        };
        mainHandler.postDelayed(autoSnoozeRunnable, 60_000L);
    }

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

    private static int postGapMsForKind(String kind) {
        if (kind == null) return 1800;
        switch (kind) {
            case "medication":
                return 1400; // prompt spacing after chime completes
            case "water":
                return 2000;
            case "charge":
                return 2400; // distinct unhurried battery chime pause
            case "prayer":
            case "sleep_suhoor":
                return 1900;
            default:
                return 1800;
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

    private static void vibrateOnce(Context context) {
        if (context == null) return;
        // Never vibrate if MainActivity is in foreground and user is looking at the screen
        if (MainActivity.activeInstance != null && !MainActivity.activeInstance.isFinishing()) {
            return;
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

    public static void playNativeAlarmSound(Context context, boolean continuous, String kind) {
        if (context == null) return;
        lastAppContext = context.getApplicationContext();
        stopRinging();

        try {
            // Request alarm audio focus so Android switches volume control to STREAM_ALARM,
            // ducks any other media, and guarantees audibility even if Media volume is 0.
            requestAlarmAudioFocus(lastAppContext);

            // The app's own sound for this category — the exact signature the web app plays
            // (rendered from audioEngine.ts into res/raw), strictly routed to STREAM_ALARM.
            final int soundRes = soundResForKind(context, kind);
            final int postGapMs = postGapMsForKind(kind);
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
                    playSoundOnce(app, soundRes, () -> {
                        synchronized (AUDIO_LOCK) {
                            if (activeSoundToken != token) return;
                        }
                        mainHandler.postDelayed(this, postGapMs);
                    });
                }
            };
            mainHandler.post(pulseRunnable);
            mainHandler.removeCallbacks(autoStopRingtoneRunnable);
            // Max 1 minute continuous audio per alert window before 5-minute snooze/wait cycle
            mainHandler.postDelayed(autoStopRingtoneRunnable, continuous ? 60_000L : 14_000L);
        } catch (Exception ignored) {
        }

        vibrateOnce(context);
    }

    public static void stopRinging() {
        RECENT_FIRED_KEYS.clear();
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
        if (lastAppContext != null) {
            abandonAlarmAudioFocus(lastAppContext);
            try {
                Vibrator vib = (Vibrator) lastAppContext.getSystemService(Context.VIBRATOR_SERVICE);
                if (vib != null) vib.cancel();
            } catch (Exception ignored) {
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
                    name = "task";
                    break;
                case "charge":
                    name = "charge";
                    break;
                default:
                    name = kind; // already one of the app's categories (prayer, water, medication, ...)
            }
        }
        int id = context.getResources().getIdentifier("dr_" + name, "raw", context.getPackageName());
        return id != 0 ? id : R.raw.dr_general;
    }

    private static void playSoundOnce(Context app, int soundRes, Runnable onCompleted) {
        if (app == null) return;
        try {
            AudioAttributes alarmAttrs = new AudioAttributes.Builder()
                    // Alarm usage so it is still heard when the media/ringer is on silent (the
                    // app's own meeting / prayer quiet modes decide that, not the volume sliders).
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
                    .build();

            AssetFileDescriptor afd = null;
            try {
                afd = app.getResources().openRawResourceFd(soundRes);
            } catch (Exception ignored) {
            }

            MediaPlayer mp;
            if (afd != null) {
                mp = new MediaPlayer();
                mp.setAudioAttributes(alarmAttrs);
                // Strict stream binding so Android/OxygenOS routes to Alarm volume, never Media
                //noinspection deprecation
                mp.setAudioStreamType(AudioManager.STREAM_ALARM);
                mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                afd.close();
                mp.prepare();
            } else {
                // Fallback to MediaPlayer.create if afd cannot be loaded directly
                mp = MediaPlayer.create(app, soundRes, alarmAttrs, 0);
                if (mp != null) {
                    //noinspection deprecation
                    mp.setAudioStreamType(AudioManager.STREAM_ALARM);
                }
            }

            if (mp == null) {
                // Fallback to system alarm ringtone on the alarm stream
                Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                if (alarmUri == null) {
                    alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                }
                if (alarmUri != null) {
                    Ringtone r = RingtoneManager.getRingtone(app, alarmUri);
                    if (r != null) {
                        r.setAudioAttributes(alarmAttrs);
                        //noinspection deprecation
                        r.setStreamType(AudioManager.STREAM_ALARM);
                        r.play();
                        synchronized (AUDIO_LOCK) {
                            activeRingtone = r;
                        }
                    }
                }
                if (onCompleted != null) {
                    mainHandler.postDelayed(onCompleted, 1400L);
                }
                return;
            }

            mp.setVolume(1.0f, 1.0f);

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
                if (onCompleted != null) onCompleted.run();
            });
            mp.start();
        } catch (Exception ignored) {
        }
    }

    private static boolean shouldShowFullScreenAlert(Context context) {
        if (context == null) return true;
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            boolean isInteractive = pm != null && pm.isInteractive();
            KeyguardManager km = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
            boolean isLocked = km != null && km.isKeyguardLocked();
            return !isInteractive || isLocked;
        } catch (Exception ignored) {
            return true;
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

        boolean fullScreen = shouldShowFullScreenAlert(context);
        if (fullScreen) {
            try {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    // Wake screen so the card / alert is immediately visible
                    PowerManager.WakeLock wakeLock = pm.newWakeLock(
                            PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                                    | PowerManager.ACQUIRE_CAUSES_WAKEUP
                                    | PowerManager.ON_AFTER_RELEASE,
                            "DayRhythm:ImmediateAlarmWakeLock"
                    );
                    wakeLock.acquire(15_000L);
                }
            } catch (Exception ignored) {
            }
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
                    sanitizeSnoozeMinutes(snoozeMinutes),
                    fullScreen
            );
            if (fullScreen) {
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
            }
            scheduleUnattendedAutoSnooze(
                    context,
                    notifId,
                    "live_" + notifId,
                    kind != null ? kind : "general",
                    title != null ? title : "تنبيه إيقاع اليوم",
                    body != null ? body : "",
                    "",
                    ""
            );
            CloudSignalClient.watchForRemoteDismiss(context, System.currentTimeMillis());
        } catch (Exception ignored) {
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
            cancelAllActiveAlarms(context);
            CloudSignalClient.sendAlarmDismiss(context, "native_dismiss");
            return;
        }

        if (ACTION_SNOOZE.equals(action)) {
            cancelAutoSnooze();
            stopRinging();
            cancelNotification(context, notifId);
            closeAlarmUi(context);
            if (!intent.getBooleanExtra(EXTRA_LOCAL_ONLY, false)) {
                CloudSignalClient.sendAlarmDismiss(context, "native_snooze");
            }
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
            cancelAutoSnooze();
            stopRinging();
            cancelNotification(context, notifId);
            closeAlarmUi(context);
            CloudSignalClient.sendAlarmDismiss(context, "native_done");
            enqueuePendingQuickAction(context, kind, alarmId, medId, doseTime);
            Intent notifyIntent = new Intent(ACTION_PENDING_QUEUE_UPDATED);
            notifyIntent.setPackage(context.getPackageName());
            context.sendBroadcast(notifyIntent);
            DayRhythmSyncService.advanceScheduleIfExpired(context);
            return;
        }

        if (ACTION_FIRE_ALARM.equals(action)) {
            String dedupeKey = (alarmId != null && !alarmId.isEmpty() ? alarmId : (title != null ? title : "")) + ":" + (kind != null ? kind : "");
            if (isRecentlyFired(dedupeKey)) return;

            boolean fullScreen = shouldShowFullScreenAlert(context);
            if (fullScreen) {
                try {
                    PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        PowerManager.WakeLock wakeLock = pm.newWakeLock(
                                PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                                        | PowerManager.ACQUIRE_CAUSES_WAKEUP
                                        | PowerManager.ON_AFTER_RELEASE,
                                "DayRhythm:AlarmWakeLock"
                        );
                        wakeLock.acquire(15_000L);
                    }
                } catch (Exception ignored) {
                }
            }
            try {
                // Play distinct per-category sound continuously with repeating vibration pulses
                boolean isContinuous = true;
                playNativeAlarmSound(context, isContinuous, kind);
                showInteractiveNotification(context, notifId, alarmId, kind, title, body, medId, doseTime, snoozeMin, fullScreen);

                // Launch desktop-style AlarmActivity card only when screen is off or device is locked
                if (fullScreen) {
                    launchAlarmCard(context, notifId, alarmId, kind, title, body, medId, doseTime, snoozeMin);
                }

                // If user does not acknowledge within 1 minute, automatically switch to 5-min snooze loop
                scheduleUnattendedAutoSnooze(context, notifId, alarmId, kind, title, body, medId, doseTime);

                // Spotify Connect: Ultra-low latency LAN broadcast + cloud trigger (<5ms local)
                CloudSignalClient.sendAlarmTrigger(context, title, body, kind, snoozeMin);

                // If the PC (or another device) stops this alert, stop it here too.
                CloudSignalClient.watchForRemoteDismiss(context, System.currentTimeMillis());

                // Immediately advance the background Live Alerts countdown to the next scheduled event
                DayRhythmSyncService.advanceScheduleIfExpired(context);
            } catch (Exception ignored) {
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
        String prevBatch = prefs.getString("last_batch_raw", "");
        if (jsonArrayStr.equals(prevBatch)) {
            return;
        }

        // Parse old signature map: reqCode -> signature (or seed legacy KEY_SCHEDULED_IDS once after upgrade)
        java.util.Map<Integer, String> prevMap = new java.util.HashMap<>();
        try {
            String prevMapJson = prefs.getString("scheduled_sigs_map", "{}");
            JSONObject prevObj = new JSONObject(prevMapJson != null ? prevMapJson : "{}");
            java.util.Iterator<String> keys = prevObj.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                try {
                    prevMap.put(Integer.parseInt(k), prevObj.optString(k, ""));
                } catch (Exception ignored) {
                }
            }
            if (prevMap.isEmpty()) {
                String legacyCsv = prefs.getString(KEY_SCHEDULED_IDS, "");
                if (legacyCsv != null && !legacyCsv.isEmpty()) {
                    for (String token : legacyCsv.split(",")) {
                        try {
                            prevMap.put(Integer.parseInt(token.trim()), "");
                        } catch (Exception ignored) {
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }

        java.util.Map<Integer, String> nextMap = new java.util.HashMap<>();
        StringBuilder newIds = new StringBuilder();
        JSONObject nextMapObj = new JSONObject();
        long nowMs = System.currentTimeMillis();
        boolean anyAlarmChanged = false;

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
                String sig = triggerAtMs + "|" + kind + "|" + title + "|" + body + "|" + medId + "|" + doseTime + "|" + snoozeMin;
                nextMap.put(reqCode, sig);
                nextMapObj.put(String.valueOf(reqCode), sig);
                if (newIds.length() > 0) newIds.append(",");
                newIds.append(reqCode);

                String oldSig = prevMap.get(reqCode);
                if (!sig.equals(oldSig)) {
                    anyAlarmChanged = true;
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
                }
            }
        } catch (Exception ignored) {
        }

        // Cancel only alarms removed from the new schedule (instead of wiping all 60 every time)
        for (Integer oldReqCode : prevMap.keySet()) {
            if (!nextMap.containsKey(oldReqCode)) {
                anyAlarmChanged = true;
                try {
                    Intent cancelIntent = new Intent(context, ReminderAlarmReceiver.class);
                    cancelIntent.setAction(ACTION_FIRE_ALARM);
                    PendingIntent pi = PendingIntent.getBroadcast(
                            context,
                            oldReqCode,
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

        prefs.edit()
                .putString("last_batch_raw", jsonArrayStr)
                .putString("scheduled_sigs_map", nextMapObj.toString())
                .putString(KEY_SCHEDULED_IDS, newIds.toString())
                .putString(KEY_CACHED_SCHEDULE, jsonArrayStr)
                .apply();
        if (anyAlarmChanged || prevMap.isEmpty()) {
            DayRhythmSyncService.onScheduleUpdated(context);
        }
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
            // It does not depend on SCHEDULE_EXACT_ALARM special access toggles.
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(triggerAtMs, showPi), pi);
        } catch (Throwable t) {
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
            } catch (Throwable ignored) {
            }
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
            int snoozeMin,
            boolean fullScreen
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
                ? "💧 شربت كوب ماء"
                : "medication".equals(kind)
                    ? "💊 أخذت الجرعة"
                    : "charge".equals(kind)
                        ? "🔋 فصلت الشاحن"
                        : "✓ تم";

        String kindLabelAr = "water".equals(kind)
                ? "ترطيب يومي"
                : "medication".equals(kind)
                    ? "العلاجات والأدوية"
                    : "charge".equals(kind)
                        ? "حماية البطارية"
                        : "prayer".equals(kind)
                            ? "مواقيت الصلاة"
                            : ("event".equals(kind) || "calendar".equals(kind))
                                ? "تقويم Google"
                                : "task".equals(kind)
                                    ? "مهام اليوم"
                                    : "إيقاع اليوم";

        String time12h = new java.text.SimpleDateFormat("hh:mm a", new java.util.Locale("ar")).format(new java.util.Date());
        String displayTitle = (title != null && !title.isEmpty()) ? title : "تنبيه إيقاع اليوم";
        String baseDesc = (body != null && !body.trim().isEmpty()) ? body.trim() : (kindLabelAr + " · " + time12h);
        String nextQueueHint = findNextScheduledSummary(context, alarmId);

        // Concise priority-ordered lines: 1) Core detail, 2) Next event
        StringBuilder richSb = new StringBuilder(baseDesc);
        if (doseTime != null && !doseTime.isEmpty() && "medication".equals(kind)) {
            richSb.append(" (").append(doseTime).append(")");
        }
        if (!nextQueueHint.isEmpty()) {
            richSb.append("\n⏭ ").append(nextQueueHint);
        }
        String shownBody = richSb.toString();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(smallIconForKind(kind))
                .setContentTitle(displayTitle)
                .setContentText(baseDesc)
                .setSubText(time12h)
                .setStyle(new NotificationCompat.BigTextStyle()
                        .setBigContentTitle(displayTitle)
                        .setSummaryText(kindLabelAr + " · " + time12h)
                        .bigText(shownBody))
                // 1 minute active notification window; auto-snooze re-rings in 5m if unhandled
                .setTimeoutAfter(60_000L)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setColor(0xFF7FFFD4)
                .setVibrate(VIBRATION_PATTERN)
                .setAutoCancel(true)
                .setContentIntent(dismissPi)
                .setDeleteIntent(dismissPi)
                .addAction(0, "🔕 إيقاف", dismissPi)
                .addAction(0, doneLabel, donePi)
                .addAction(0, "⏰ تأجيل " + snoozeMin + " د", snoozePi);
        if (fullScreen) {
            builder.setFullScreenIntent(fullScreenPi, true);
        }

        try {
            // Its own id, never the service's 1001: the service rewrites 1001 with the countdown
            // every few seconds, which wiped this alert (and its تم / تأجيل buttons) right away.
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

    private static void closeAlarmUi(Context context) {
        if (AlarmActivity.activeInstance != null) {
            try {
                AlarmActivity.activeInstance.finish();
            } catch (Exception ignored) {
            }
        }
        try {
            Intent close = new Intent(AlarmActivity.ACTION_CLOSE_ALARM_UI);
            close.setPackage(context.getPackageName());
            context.sendBroadcast(close);
        } catch (Exception ignored) {
        }
        if (MainActivity.activeInstance != null) {
            MainActivity.activeInstance.evaluateJavascriptInWebView(
                    "window.dispatchEvent(new CustomEvent('dayrhythm:alert-dismissed', { detail: { remote: true } }));"
            );
        }
    }

    public static String findNextScheduledSummary(Context context, String excludeAlarmId) {
        if (context == null) return "";
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_ALARMS, Context.MODE_PRIVATE);
            String raw = prefs.getString(KEY_CACHED_SCHEDULE, "");
            if (raw == null || raw.isEmpty()) return "";
            JSONArray arr = new JSONArray(raw);
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item == null) continue;
                String id = item.optString("id", "");
                if (excludeAlarmId != null && !excludeAlarmId.isEmpty() && excludeAlarmId.equals(id)) {
                    continue;
                }
                long tMs = item.optLong("triggerAtMs", 0L);
                if (tMs > now + 20_000L) {
                    String nextTitle = item.optString("title", "").trim();
                    if (nextTitle.isEmpty()) continue;
                    String clock = new java.text.SimpleDateFormat("hh:mm a", new java.util.Locale("ar")).format(new java.util.Date(tMs));
                    return nextTitle + " (" + clock + ")";
                }
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    public static void cancelAllActiveAlarms(Context context) {
        RECENT_FIRED_KEYS.clear();
        cancelAutoSnooze();
        stopRinging();
        CloudSignalClient.stopWatching();
        if (context == null) return;
        closeAlarmUi(context);
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
        DayRhythmSyncService.advanceScheduleIfExpired(context);
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
