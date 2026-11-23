package app.dayrhythm.mobile;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Enumeration;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * 24/7 Special-Use Foreground Service for OnePlus 12R (immune to Android 14/15 6-hour dataSync timeout):
 * 1. Persistent Ongoing Countdown Notification showing next Calendar/Task/Water/Prayer/Medication.
 * 2. Native OnePlus 12R Dynamic Island / OxygenOS Live Alerts capsule activating at T-5m or T-10m
 *    with Emoji + live MM:SS seconds countdown.
 * 3. Automatic self-revival onTaskRemoved + resilient background WebSocket & network recovery relay.
 */
public class DayRhythmSyncService extends Service {
    public static final String CHANNEL_KEEPALIVE = "dayrhythm_keepalive_v2";
    public static final String CHANNEL_LIVE_ALERTS = "dayrhythm_live_alerts_v2";
    public static final String ACTION_WS_SYNC_MESSAGE = "app.dayrhythm.mobile.WS_SYNC_MESSAGE";
    public static final String ACTION_UPDATE_AVAILABLE = "app.dayrhythm.mobile.UPDATE_AVAILABLE";
    public static final String ACTION_NETWORK_RECOVERED = "app.dayrhythm.mobile.NETWORK_RECOVERED";
    public static final String ACTION_UPDATE_LIVE_STATUS = "app.dayrhythm.mobile.UPDATE_LIVE_STATUS";
    public static final String ACTION_SCHEDULE_UPDATED = "app.dayrhythm.mobile.SCHEDULE_UPDATED";
    public static final String ACTION_ADVANCE_SCHEDULE = "app.dayrhythm.mobile.ADVANCE_SCHEDULE";
    public static final String ACTION_REFRESH_NOTIF = "app.dayrhythm.mobile.REFRESH_NOTIF";
    public static final String EXTRA_WS_PAYLOAD = "ws_payload";
    public static final String EXTRA_UPDATE_TAG = "update_tag";
    public static final String EXTRA_UPDATE_URL = "update_url";

    public static final String EXTRA_LIVE_EMOJI = "live_emoji";
    public static final String EXTRA_LIVE_TITLE = "live_title";
    public static final String EXTRA_LIVE_STATUS_LABEL = "live_status_label";
    public static final String EXTRA_LIVE_KIND = "live_kind";
    public static final String EXTRA_LIVE_TARGET_MS = "live_target_ms";
    public static final String EXTRA_LIVE_ALERTS_ENABLED = "live_alerts_enabled";
    public static final String EXTRA_LIVE_LEAD_MINUTES = "live_lead_minutes";
    public static final String EXTRA_PERSISTENT_NOTIF_ENABLED = "persistent_notif_enabled";

    private static final String PREFS_LIVE = "dayrhythm_live_state_prefs";
    public static final int NOTIF_UNIFIED_ID = 1001;
    private static final int NOTIF_KEEPALIVE_ID = NOTIF_UNIFIED_ID;
    private static final int NOTIF_LIVE_ALERT_ID = 1002;
    private static final long BASE_BACKOFF_MS = 1500L;
    private static final long MAX_BACKOFF_MS = 45000L;
    private static final long PING_INTERVAL_MS = 20000L;
    private static final long PONG_TIMEOUT_MS = 10000L;

    private static volatile DayRhythmSyncService instance = null;

    public static DayRhythmSyncService getInstance() {
        return instance;
    }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Random jitterRandom = new Random();

    private OkHttpClient wsClient;
    private WebSocket activeWebSocket;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private int backoffAttempt = 0;
    private boolean hadNetworkLoss = false;
    private volatile boolean isDestroyed = false;

    private String liveEmoji = "📅";
    private String liveTitle = "";
    private String liveStatusLabel = "المهمة القادمة";
    private String liveKind = "general";
    private long liveTargetEpochMs = 0L;
    private boolean liveAlertsEnabled = true;
    private int liveAlertsLeadMinutes = 10;
    private boolean persistentCountdownEnabled = true;
    private boolean liveIslandCurrentlyShown = false;
    private String syncSubtitle = "مزامنة لحظية نشطة 24/7";

    private final Runnable wsReconnectRunnable = this::connectBackgroundWebSocket;

    private static final Pattern LEAD_TAG_PATTERN = Pattern.compile(
            "(?:^|\\s)(?:#|\\[)(\\d{1,5})\\s*(ثانية|ث|دقيقة|دقائق|د|ساعة|س|s|m|h)\\]?",
            Pattern.CASE_INSENSITIVE
    );

    public static Long parseLeadTagSeconds(String text) {
        if (text == null || text.trim().isEmpty()) return null;
        Matcher matcher = LEAD_TAG_PATTERN.matcher(text);
        if (!matcher.find()) return null;
        try {
            long value = Long.parseLong(matcher.group(1));
            String unit = matcher.group(2).toLowerCase(Locale.ROOT);
            if (unit.startsWith("s") || unit.startsWith("ث")) {
                return value;
            } else if (unit.startsWith("h") || unit.startsWith("س")) {
                return value * 3600L;
            } else {
                return value * 60L;
            }
        } catch (Exception e) {
            return null;
        }
    }

    public static String formatChipText(String emoji, long remainingMs) {
        String safeEmoji = (emoji != null && !emoji.trim().isEmpty()) ? emoji.trim() : "📅";
        String label;
        if (remainingMs <= 0L) {
            label = "الآن";
        } else if (remainingMs < 60_000L) {
            long secs = Math.max(1L, Math.min(59L, (remainingMs + 500L) / 1000L));
            label = secs + "ث";
        } else if (remainingMs < 3_600_000L) {
            long mins = (remainingMs + 59_999L) / 60_000L;
            label = mins + "د";
        } else {
            long hrs = remainingMs / 3_600_000L;
            long remMins = (remainingMs % 3_600_000L) / 60_000L;
            if (remMins > 0) {
                label = hrs + "س" + remMins + "د";
            } else {
                label = hrs + "س";
            }
        }
        return safeEmoji + " " + label;
    }

    private long getEffectiveLeadWindowMs() {
        Long tagSeconds = parseLeadTagSeconds(liveTitle);
        if (tagSeconds == null) {
            tagSeconds = parseLeadTagSeconds(liveStatusLabel);
        }
        if (tagSeconds != null && tagSeconds > 0) {
            return tagSeconds * 1000L;
        }
        return Math.max(1, liveAlertsLeadMinutes) * 60_000L;
    }

    private String cleanDisplayTitle(String title) {
        if (title == null) return "";
        return LEAD_TAG_PATTERN.matcher(title).replaceAll("").trim();
    }

    private final Runnable liveCountdownTickRunnable = new Runnable() {
        @Override
        public void run() {
            if (isDestroyed) return;
            refreshPersistentNotification();
            cancelLiveAlertCapsule();

            // Periodic LAN battery broadcast heartbeat while charging (every 10 seconds)
            if (lastBroadcastCharging) {
                long now = System.currentTimeMillis();
                if (now - lastPeriodicLanBroadcastMs >= 10_000L) {
                    lastPeriodicLanBroadcastMs = now;
                    sendLanBatteryBroadcast(
                            lastBroadcastBatteryLevel,
                            true,
                            lastBroadcastEtaMinutes,
                            lastBroadcastLimit,
                            null
                    );
                }
            }

            if (liveTargetEpochMs > 0L) {
                long now = System.currentTimeMillis();
                long remainingMs = liveTargetEpochMs - now;
                Long explicitTagSec = parseLeadTagSeconds(liveTitle);
                if (explicitTagSec == null) {
                    explicitTagSec = parseLeadTagSeconds(liveStatusLabel);
                }

                if (explicitTagSec != null && remainingMs > explicitTagSec * 1000L) {
                    // Tagged event: sleep until the exact moment of entering the tag window
                    long waitMs = (remainingMs - explicitTagSec * 1000L) + 50L;
                    long maxWait = lastBroadcastCharging ? 10_000L : 300_000L;
                    handler.postDelayed(this, Math.max(1000L, Math.min(waitMs, maxWait)));
                } else if (remainingMs > 60_000L && liveAlertsEnabled) {
                    // Inside countdown (> 60s):
                    // SystemUI Chronometer renders seconds live with 0% CPU.
                    // We wake on minute boundary to refresh the shortCriticalText chip (e.g. 8د -> 7د),
                    // or when transitioning into the final 60 seconds.
                    long timeToNextMin = (remainingMs % 60_000L);
                    if (timeToNextMin <= 200L) timeToNextMin = 60_000L;
                    long timeToSixtySec = remainingMs - 60_000L + 50L;
                    long nextWake = Math.min(timeToNextMin, timeToSixtySec);
                    if (lastBroadcastCharging) nextWake = Math.min(nextWake, 10_000L);
                    handler.postDelayed(this, Math.max(1000L, nextWake));
                } else if (remainingMs > 0L && remainingMs <= 60_000L && liveAlertsEnabled) {
                    // Final 60 seconds:
                    // SystemUI Chronometer displays live seconds continuously.
                    // We tick every 2.5 seconds for shortCriticalText chip accuracy and schedule exact arrival at 0s!
                    long nextWake = Math.min(2500L, remainingMs + 50L);
                    if (lastBroadcastCharging) nextWake = Math.min(nextWake, 10_000L);
                    handler.postDelayed(this, Math.max(500L, nextWake));
                } else if (remainingMs <= 0L) {
                    // Just reached 0: Automatically advance to next scheduled event from schedule cache!
                    boolean advanced = advanceToNextScheduledEvent();
                    if (!advanced) {
                        handler.postDelayed(this, 30_000L);
                    }
                } else if (lastBroadcastCharging) {
                    handler.postDelayed(this, 10_000L);
                }
            } else if (lastBroadcastCharging) {
                handler.postDelayed(this, 10_000L);
            }
        }
    };

    private final Runnable pongWatchdogRunnable = () -> {
        if (isDestroyed) return;
        teardownActiveWebSocket("pong_timeout");
        syncSubtitle = "استعادة الاتصال التلقائي...";
        refreshPersistentNotification();
        scheduleWsReconnect();
    };

    private final Runnable heartbeatPingRunnable = new Runnable() {
        @Override
        public void run() {
            if (isDestroyed) return;
            WebSocket ws = activeWebSocket;
            if (ws == null) return;
            boolean sent = false;
            try {
                sent = ws.send("{\"type\":\"ping\"}");
            } catch (Exception ignored) {
            }
            if (!sent) {
                teardownActiveWebSocket("ping_send_failed");
                scheduleWsReconnect();
                return;
            }
            handler.removeCallbacks(pongWatchdogRunnable);
            handler.postDelayed(pongWatchdogRunnable, PONG_TIMEOUT_MS);
            handler.postDelayed(this, PING_INTERVAL_MS);
        }
    };

    public static void startServiceCompat(Context context) {
        Intent intent = new Intent(context, DayRhythmSyncService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception ignored) {
        }
    }

    public static void pushLiveStatus(
            Context context,
            String emoji,
            String title,
            String statusLabel,
            long targetEpochMs,
            boolean liveAlertsEnabled,
            int leadMinutes,
            boolean persistentNotifEnabled
    ) {
        if (context == null) return;
        Intent intent = new Intent(context, DayRhythmSyncService.class);
        intent.setAction(ACTION_UPDATE_LIVE_STATUS);
        intent.putExtra(EXTRA_LIVE_EMOJI, emoji != null ? emoji : "📅");
        intent.putExtra(EXTRA_LIVE_TITLE, title != null ? title : "");
        intent.putExtra(EXTRA_LIVE_STATUS_LABEL, statusLabel != null ? statusLabel : "المهمة القادمة");
        intent.putExtra(EXTRA_LIVE_TARGET_MS, targetEpochMs);
        intent.putExtra(EXTRA_LIVE_ALERTS_ENABLED, liveAlertsEnabled);
        intent.putExtra(EXTRA_LIVE_LEAD_MINUTES, leadMinutes);
        intent.putExtra(EXTRA_PERSISTENT_NOTIF_ENABLED, persistentNotifEnabled);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception ignored) {
        }
    }

    public static void refreshServiceNotification(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent(context, DayRhythmSyncService.class);
            intent.setAction(ACTION_REFRESH_NOTIF);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception ignored) {
        }
    }

    public static void onScheduleUpdated(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent(context, DayRhythmSyncService.class);
            intent.setAction(ACTION_SCHEDULE_UPDATED);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception ignored) {
        }
    }

    public static void advanceScheduleIfExpired(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent(context, DayRhythmSyncService.class);
            intent.setAction(ACTION_ADVANCE_SCHEDULE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception ignored) {
        }
    }

    public static int getSmallIconForKind(String kind) {
        if (kind == null) return R.drawable.ic_notif_default;
        switch (kind) {
            case "prayer":
                return R.drawable.ic_notif_prayer;
            case "water":
                return R.drawable.ic_notif_water;
            case "medication":
                return R.drawable.ic_notif_medication;
            case "task":
                return R.drawable.ic_notif_task;
            case "event":
            case "calendar":
                return R.drawable.ic_notif_calendar;
            case "charge":
                return R.drawable.ic_notif_charge;
            default:
                return R.drawable.ic_notif_default;
        }
    }

    private static String extractEmoji(String text, String kind) {
        if (text != null && !text.trim().isEmpty()) {
            String trimmed = text.trim();
            int codePoint = trimmed.codePointAt(0);
            int type = Character.getType(codePoint);
            if (type == Character.SURROGATE || type == Character.OTHER_SYMBOL || type == Character.MATH_SYMBOL ||
                    (codePoint >= 0x1F300 && codePoint <= 0x1FAFF) || (codePoint >= 0x2600 && codePoint <= 0x27BF)) {
                int charCount = Character.charCount(codePoint);
                return trimmed.substring(0, charCount);
            }
        }
        if (kind == null) return "📅";
        switch (kind) {
            case "prayer": return "🕌";
            case "water": return "💧";
            case "medication": return "💊";
            case "task": return "☑️";
            case "event":
            case "calendar": return "📅";
            case "charge": return "🔋";
            default: return "📅";
        }
    }

    private static String cleanEmojiPrefix(String title) {
        if (title == null) return "";
        String trimmed = title.trim();
        if (trimmed.isEmpty()) return "";
        int codePoint = trimmed.codePointAt(0);
        int type = Character.getType(codePoint);
        if (type == Character.SURROGATE || type == Character.OTHER_SYMBOL || type == Character.MATH_SYMBOL ||
                (codePoint >= 0x1F300 && codePoint <= 0x1FAFF) || (codePoint >= 0x2600 && codePoint <= 0x27BF)) {
            int charCount = Character.charCount(codePoint);
            return trimmed.substring(charCount).trim();
        }
        return trimmed;
    }

    private static String getStatusLabelForKind(String kind, String body) {
        if ("prayer".equals(kind)) return "أذان الصلاة";
        if ("water".equals(kind)) return "موعد شرب الماء";
        if ("medication".equals(kind)) return "موعد جرعة الدواء";
        if ("task".equals(kind)) return "مهمة مجدولة";
        if ("event".equals(kind) || "calendar".equals(kind)) return "موعد في التقويم";
        if (body != null && !body.isEmpty()) return body;
        return "المهمة القادمة";
    }

    public synchronized boolean advanceToNextScheduledEvent() {
        try {
            SharedPreferences prefs = getSharedPreferences(ReminderAlarmReceiver.PREFS_ALARMS, MODE_PRIVATE);
            String scheduleJson = prefs.getString(ReminderAlarmReceiver.KEY_CACHED_SCHEDULE, "");
            if (scheduleJson == null || scheduleJson.isEmpty()) return false;

            JSONArray arr = new JSONArray(scheduleJson);
            long nowMs = System.currentTimeMillis();
            JSONObject nextItem = null;

            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item == null) continue;
                long triggerAtMs = item.optLong("triggerAtMs", 0L);
                if (triggerAtMs > nowMs + 1000L) {
                    nextItem = item;
                    break;
                }
            }

            if (nextItem != null) {
                liveTargetEpochMs = nextItem.optLong("triggerAtMs", 0L);
                String rawTitle = nextItem.optString("title", "المهمة القادمة");
                String kind = nextItem.optString("kind", "general");
                String body = nextItem.optString("body", "");

                liveKind = kind;
                liveEmoji = extractEmoji(rawTitle, kind);
                liveTitle = cleanEmojiPrefix(rawTitle);
                liveStatusLabel = getStatusLabelForKind(kind, body);
                persistLiveState();
                refreshPersistentNotification();

                handler.removeCallbacks(liveCountdownTickRunnable);
                handler.post(liveCountdownTickRunnable);
                return true;
            } else {
                liveTargetEpochMs = 0L;
                liveTitle = "أنجزت جدول اليوم";
                liveEmoji = "✅";
                liveStatusLabel = "يوم هادئ ومكتمل";
                liveKind = "done";
                persistLiveState();
                refreshPersistentNotification();
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private void startForegroundCompat(Notification notif) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_KEEPALIVE_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIF_KEEPALIVE_ID, notif);
        }
    }

    private void restorePersistedLiveState() {
        try {
            SharedPreferences sp = getSharedPreferences(PREFS_LIVE, MODE_PRIVATE);
            liveEmoji = sp.getString(EXTRA_LIVE_EMOJI, "📅");
            liveTitle = sp.getString(EXTRA_LIVE_TITLE, "");
            liveStatusLabel = sp.getString(EXTRA_LIVE_STATUS_LABEL, "المهمة القادمة");
            liveKind = sp.getString(EXTRA_LIVE_KIND, "general");
            liveTargetEpochMs = sp.getLong(EXTRA_LIVE_TARGET_MS, 0L);
            liveAlertsEnabled = sp.getBoolean(EXTRA_LIVE_ALERTS_ENABLED, true);
            liveAlertsLeadMinutes = sp.getInt(EXTRA_LIVE_LEAD_MINUTES, 10);
            persistentCountdownEnabled = sp.getBoolean(EXTRA_PERSISTENT_NOTIF_ENABLED, true);
        } catch (Exception ignored) {
        }
    }

    private void persistLiveState() {
        try {
            getSharedPreferences(PREFS_LIVE, MODE_PRIVATE).edit()
                    .putString(EXTRA_LIVE_EMOJI, liveEmoji)
                    .putString(EXTRA_LIVE_TITLE, liveTitle)
                    .putString(EXTRA_LIVE_STATUS_LABEL, liveStatusLabel)
                    .putString(EXTRA_LIVE_KIND, liveKind)
                    .putLong(EXTRA_LIVE_TARGET_MS, liveTargetEpochMs)
                    .putBoolean(EXTRA_LIVE_ALERTS_ENABLED, liveAlertsEnabled)
                    .putInt(EXTRA_LIVE_LEAD_MINUTES, liveAlertsLeadMinutes)
                    .putBoolean(EXTRA_PERSISTENT_NOTIF_ENABLED, persistentCountdownEnabled)
                    .apply();
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        restorePersistedLiveState();
        if (liveTargetEpochMs <= System.currentTimeMillis() + 1000L) {
            advanceToNextScheduledEvent();
        }
        createNotificationChannels();
        UpdateCheckWorker.schedulePeriodicCheck(this);

        wsClient = new OkHttpClient.Builder()
                .pingInterval(25, TimeUnit.SECONDS)
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .retryOnConnectionFailure(true)
                .build();

        registerNetworkRecoveryCallback();
        registerChargeLimitWatcher();
    }

    // ── Charge-limit alert & Live Battery LAN Sync (works with the app closed) ─────
    // Keeping a Li-ion battery at 100% on the charger shortens its life, so ring once per
    // charging session when the level reaches the user's limit (default 90%).
    // Instantly silences the alarm on both phone and PC when the charger is unplugged!
    public static final String PREFS_CHARGE = "dayrhythm_charge_limit_prefs";
    public static final String KEY_CHARGE_LIMIT = "charge_limit_pct";
    public static final String KEY_CHARGE_ALERT_ENABLED = "charge_alert_enabled";
    private BroadcastReceiver chargeLimitReceiver;
    private boolean chargeAlertFiredThisSession = false;
    private long chargeSessionStartMs = 0L;
    private int chargeSessionStartLevel = -1;
    private int lastBroadcastBatteryLevel = -1;
    private boolean lastBroadcastCharging = false;
    private int lastBroadcastEtaMinutes = -1;
    private int lastBroadcastLimit = 90;
    private long lastPeriodicLanBroadcastMs = 0L;

    /** Called from the web app (JS bridge) whenever the limit or the on/off switch changes. */
    public static void saveChargeLimitSettings(Context context, int limitPct, boolean enabled) {
        int safe = Math.max(60, Math.min(100, limitPct));
        context.getSharedPreferences(PREFS_CHARGE, MODE_PRIVATE).edit()
                .putInt(KEY_CHARGE_LIMIT, safe)
                .putBoolean(KEY_CHARGE_ALERT_ENABLED, enabled)
                .apply();
        DayRhythmSyncService svc = instance;
        if (svc != null && svc.chargeLimitReceiver != null) {
            try {
                Intent sticky = svc.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (sticky != null) svc.chargeLimitReceiver.onReceive(svc, sticky);
            } catch (Exception ignored) {
            }
        }
    }

    private void registerChargeLimitWatcher() {
        chargeLimitReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null) return;
                int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
                int status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                int plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
                if (level < 0 || scale <= 0) return;
                int pct = Math.round(level * 100f / scale);

                String action = intent.getAction();
                boolean charging = plugged != 0 && (status == BatteryManager.BATTERY_STATUS_CHARGING
                        || status == BatteryManager.BATTERY_STATUS_FULL);
                if (Intent.ACTION_POWER_DISCONNECTED.equals(action)) {
                    charging = false;
                } else if (Intent.ACTION_POWER_CONNECTED.equals(action)) {
                    charging = true;
                }

                SharedPreferences sp = getSharedPreferences(PREFS_CHARGE, MODE_PRIVATE);
                int limit = sp.getInt(KEY_CHARGE_LIMIT, 90);
                boolean enabled = sp.getBoolean(KEY_CHARGE_ALERT_ENABLED, true);
                long nowMs = System.currentTimeMillis();

                // 1. When disconnected / unplugged:
                if (!charging) {
                    chargeSessionStartMs = 0L;
                    chargeSessionStartLevel = -1;
                    if (chargeAlertFiredThisSession) {
                        chargeAlertFiredThisSession = false; // re-arm for next charge
                        // Instantly silence phone and close lockscreen alarm card!
                        ReminderAlarmReceiver.cancelAllActiveAlarms(DayRhythmSyncService.this);
                        // Instantly notify PC to silence smart charge alert and close popup!
                        CloudSignalClient.sendAlarmDismiss(DayRhythmSyncService.this, "unplugged");
                        sendLanBatteryBroadcast(pct, false, 0, limit, "alarm_dismiss");
                    }
                    if (lastBroadcastCharging || lastBroadcastBatteryLevel != pct) {
                        lastBroadcastCharging = false;
                        lastBroadcastBatteryLevel = pct;
                        lastBroadcastEtaMinutes = -1;
                        broadcastBatteryTelemetry(pct, false, 0, limit);
                    }
                    return;
                }

                // 2. When charging: calculate charging speed & ETA to limit
                if (chargeSessionStartMs == 0L || chargeSessionStartLevel < 0 || pct < chargeSessionStartLevel) {
                    chargeSessionStartMs = nowMs;
                    chargeSessionStartLevel = pct;
                }

                int etaMinutes = -1;
                if (pct < limit) {
                    double rate = 3.5; // default estimate for OnePlus 12R SuperVOOC (%/min)
                    long elapsedMs = nowMs - chargeSessionStartMs;
                    int deltaPct = pct - chargeSessionStartLevel;
                    if (deltaPct >= 2 && elapsedMs >= 30_000L) {
                        double observed = (double) deltaPct / (elapsedMs / 60_000.0);
                        if (observed >= 0.5 && observed <= 15.0) {
                            rate = observed;
                        }
                    }
                    etaMinutes = Math.max(1, Math.min(240, (int) Math.ceil((limit - pct) / rate)));
                }

                lastBroadcastEtaMinutes = etaMinutes;
                lastBroadcastLimit = limit;

                // 3. Broadcast live battery telemetry to PC over LAN / WebSocket
                if (pct != lastBroadcastBatteryLevel || !lastBroadcastCharging) {
                    lastBroadcastBatteryLevel = pct;
                    lastBroadcastCharging = true;
                    broadcastBatteryTelemetry(pct, true, etaMinutes, limit);
                    handler.removeCallbacks(liveCountdownTickRunnable);
                    handler.post(liveCountdownTickRunnable);
                }

                // 4. Trigger alert when reaching limit (default 90%)
                if (enabled && pct >= limit && !chargeAlertFiredThisSession) {
                    chargeAlertFiredThisSession = true;
                    // Trigger continuous alarm with vibration on phone
                    ReminderAlarmReceiver.triggerImmediateNativeAlarm(
                            DayRhythmSyncService.this,
                            "🔋 الشحن وصل " + pct + "%",
                            "افصل الشاحن دلوقتي علشان تحافظ على عمر البطارية",
                            "charge",
                            true,
                            0
                    );
                    // Broadcast trigger to PC so desktop card pops up simultaneously
                    broadcastBatteryTelemetry(pct, true, 0, limit);
                }
            }
        };
        try {
            IntentFilter filter = new IntentFilter();
            filter.addAction(Intent.ACTION_BATTERY_CHANGED);
            filter.addAction(Intent.ACTION_POWER_CONNECTED);
            filter.addAction(Intent.ACTION_POWER_DISCONNECTED);
            Intent sticky = registerReceiver(chargeLimitReceiver, filter);
            if (sticky != null && chargeLimitReceiver != null) {
                chargeLimitReceiver.onReceive(this, sticky);
            }
        } catch (Exception ignored) {
        }
    }

    public void broadcastBatteryTelemetry(int level, boolean charging, int etaMinutes, int limit) {
        try {
            JSONObject packet = new JSONObject();
            packet.put("type", "battery");
            packet.put("levelPct", level);
            packet.put("charging", charging);
            packet.put("chargeLimitPct", limit);
            packet.put("chargeTimeRemainingMin", etaMinutes);
            packet.put("deviceLabel", "OnePlus 12R");
            packet.put("updatedAtMs", System.currentTimeMillis());

            // 1. Send over active WebSocket if connected (instant LAN sync to PC)
            WebSocket ws = activeWebSocket;
            if (ws != null) {
                try {
                    ws.send(packet.toString());
                } catch (Exception ignored) {
                }
            }

            // 2. Broadcast over local Wi-Fi LAN (UDP port 48721 + HTTP POST) for instant PC sync (< 5ms)
            sendLanBatteryBroadcast(level, charging, etaMinutes, limit, null);

            // 3. Publish to Firestore REST so PC gets live telemetry even with app closed & screen off
            CloudSignalClient.publishBatteryTelemetry(this, level, charging, etaMinutes, limit);

            // 4. Broadcast internal intent for local web view
            Intent syncIntent = new Intent(ACTION_WS_SYNC_MESSAGE);
            syncIntent.setPackage(getPackageName());
            syncIntent.putExtra(EXTRA_WS_PAYLOAD, packet.toString());
            sendBroadcast(syncIntent);
        } catch (Exception ignored) {
        }
    }

    public static final int LAN_PORT = 48721;
    private static volatile String lastDiscoveredPcIp = null;

    public void sendLanBatteryBroadcast(int level, boolean charging, int etaMinutes, int limit, String action) {
        new Thread(() -> {
            DatagramSocket socket = null;
            try {
                JSONObject json = new JSONObject();
                json.put("type", "battery");
                json.put("level", level);
                json.put("levelPct", level);
                json.put("is_charging", charging);
                json.put("charging", charging);
                json.put("eta_minutes_90", etaMinutes);
                json.put("chargeTimeRemainingMin", etaMinutes);
                json.put("limit", limit);
                json.put("chargeLimitPct", limit);
                json.put("source_device", "OnePlus 12R");
                json.put("deviceLabel", "OnePlus 12R");
                json.put("action", action != null ? action : (charging ? "charging" : "unplugged"));
                json.put("updatedAtMs", System.currentTimeMillis());

                byte[] data = json.toString().getBytes(StandardCharsets.UTF_8);
                socket = new DatagramSocket();
                socket.setBroadcast(true);

                // 1. Send to global subnet broadcast (255.255.255.255:48721)
                DatagramPacket globalPacket = new DatagramPacket(
                        data,
                        data.length,
                        InetAddress.getByName("255.255.255.255"),
                        LAN_PORT
                );
                socket.send(globalPacket);

                // 2. Also send to each interface's local broadcast (e.g. 192.168.1.255)
                try {
                    Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
                    while (interfaces.hasMoreElements()) {
                        NetworkInterface ni = interfaces.nextElement();
                        if (ni.isLoopback() || !ni.isUp()) continue;
                        for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                            InetAddress bcast = ia.getBroadcast();
                            if (bcast != null) {
                                DatagramPacket p = new DatagramPacket(data, data.length, bcast, LAN_PORT);
                                socket.send(p);
                            }
                        }
                    }
                } catch (Exception ignored) {
                }

                // 3. Direct HTTP POST if PC IP was previously recorded
                String targetIp = lastDiscoveredPcIp;
                if (targetIp != null && !targetIp.isEmpty()) {
                    try {
                        URL url = new URL("http://" + targetIp + ":" + LAN_PORT + "/api/v1/battery/update");
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                        conn.setRequestMethod("POST");
                        conn.setConnectTimeout(800);
                        conn.setReadTimeout(800);
                        conn.setDoOutput(true);
                        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                        conn.getOutputStream().write(data);
                        conn.getResponseCode();
                        conn.disconnect();
                    } catch (Exception ignored) {
                    }
                }

                // 4. Listen briefly for PC UDP response to record its IP address for future HTTP POSTs
                try {
                    socket.setSoTimeout(350);
                    byte[] buf = new byte[256];
                    DatagramPacket ack = new DatagramPacket(buf, buf.length);
                    socket.receive(ack);
                    InetAddress sender = ack.getAddress();
                    if (sender != null) {
                        lastDiscoveredPcIp = sender.getHostAddress();
                    }
                } catch (Exception ignored) {
                }
            } catch (Exception ignored) {
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (Exception ignored) {}
                }
            }
        }).start();
    }

    public void triggerLanDiscovery() {
        LanDiscoveryManager.discoverPcAsync(this, (pcName, wsUrl, restUrl) -> {
            handler.post(() -> {
                if (wsUrl != null && !wsUrl.isEmpty()) {
                    lastDiscoveredPcIp = wsUrl.replace("ws://", "").replaceAll(":[0-9]+.*", "");
                    SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS_NAME, MODE_PRIVATE);
                    prefs.edit()
                            .putString(MainActivity.KEY_REMOTE_WS_URL, wsUrl)
                            .putString("remote_rest_url", restUrl)
                            .apply();
                    connectBackgroundWebSocket();
                }
            });
        });
    }

    public void sendWebSocketMessageOrRest(String jsonPayload) {
        if (jsonPayload == null || jsonPayload.isEmpty()) return;
        WebSocket ws = activeWebSocket;
        if (ws != null) {
            try {
                if (ws.send(jsonPayload)) {
                    return;
                }
            } catch (Exception ignored) {
            }
        }
        SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS_NAME, MODE_PRIVATE);
        String restUrl = prefs.getString("remote_rest_url", "");
        if (restUrl.isEmpty() && lastDiscoveredPcIp != null) {
            restUrl = "http://" + lastDiscoveredPcIp + ":" + LAN_PORT + "/api/v1";
        }
        if (!restUrl.isEmpty()) {
            postSignedSettingsUpdateAsync(this, restUrl, jsonPayload);
        }
    }

    public static void postSignedSettingsUpdateAsync(Context context, String targetRestUrl, String jsonPayload) {
        new Thread(() -> {
            try {
                String path = "/api/v1/settings/update";
                String base = targetRestUrl.replaceAll("/+$", "");
                if (base.endsWith("/api/v1")) {
                    base = base.substring(0, base.length() - "/api/v1".length());
                }
                URL url = new URL(base + path);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(1500);
                conn.setReadTimeout(1500);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");

                Map<String, String> signedHeaders = LanSecurityManager.generateSignedHeaders(context, "POST", path, jsonPayload);
                for (Map.Entry<String, String> entry : signedHeaders.entrySet()) {
                    conn.setRequestProperty(entry.getKey(), entry.getValue());
                }

                byte[] bodyBytes = jsonPayload.getBytes(StandardCharsets.UTF_8);
                conn.getOutputStream().write(bodyBytes);
                conn.getResponseCode();
                conn.disconnect();
            } catch (Exception ignored) {
            }
        }, "DayRhythm-SignedRest").start();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_REFRESH_NOTIF.equals(intent.getAction())) {
            startForegroundCompat(buildPersistentNotification());
            return START_STICKY;
        }

        if (intent != null && (ACTION_SCHEDULE_UPDATED.equals(intent.getAction()) || ACTION_ADVANCE_SCHEDULE.equals(intent.getAction()))) {
            advanceToNextScheduledEvent();
            return START_STICKY;
        }

        if (intent != null && ACTION_UPDATE_LIVE_STATUS.equals(intent.getAction())) {
            liveEmoji = intent.getStringExtra(EXTRA_LIVE_EMOJI);
            if (liveEmoji == null || liveEmoji.trim().isEmpty()) liveEmoji = "📅";
            liveTitle = intent.getStringExtra(EXTRA_LIVE_TITLE);
            if (liveTitle == null) liveTitle = "";
            liveStatusLabel = intent.getStringExtra(EXTRA_LIVE_STATUS_LABEL);
            if (liveStatusLabel == null || liveStatusLabel.trim().isEmpty()) liveStatusLabel = "المهمة القادمة";
            liveTargetEpochMs = intent.getLongExtra(EXTRA_LIVE_TARGET_MS, 0L);
            liveAlertsEnabled = intent.getBooleanExtra(EXTRA_LIVE_ALERTS_ENABLED, true);
            liveAlertsLeadMinutes = Math.max(1, Math.min(30, intent.getIntExtra(EXTRA_LIVE_LEAD_MINUTES, 10)));
            persistentCountdownEnabled = intent.getBooleanExtra(EXTRA_PERSISTENT_NOTIF_ENABLED, true);

            if (liveTargetEpochMs <= System.currentTimeMillis() + 1000L) {
                advanceToNextScheduledEvent();
            } else {
                persistLiveState();
                startForegroundCompat(buildPersistentNotification());
                handler.removeCallbacks(liveCountdownTickRunnable);
                handler.post(liveCountdownTickRunnable);
            }
            return START_STICKY;
        }

        startForegroundCompat(buildPersistentNotification());
        handler.removeCallbacks(liveCountdownTickRunnable);
        handler.post(liveCountdownTickRunnable);
        connectBackgroundWebSocket();
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Keep background countdown & alarms alive even if the user swipes the app away from recents
        try {
            Intent restart = new Intent(getApplicationContext(), DayRhythmSyncService.class);
            PendingIntent pi = PendingIntent.getService(
                    getApplicationContext(),
                    9901,
                    restart,
                    PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
            );
            AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
            if (am != null) {
                am.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + 2000L, pi);
            }
        } catch (Exception ignored) {
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        isDestroyed = true;
        if (instance == this) instance = null;
        handler.removeCallbacks(liveCountdownTickRunnable);
        cancelLiveAlertCapsule();
        unregisterNetworkRecoveryCallback();
        try {
            if (chargeLimitReceiver != null) unregisterReceiver(chargeLimitReceiver);
        } catch (Exception ignored) {
        }
        clearWsTimers();
        teardownActiveWebSocket("service_stopped");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void registerNetworkRecoveryCallback() {
        try {
            connectivityManager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (connectivityManager == null) return;

            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(@NonNull Network network) {
                    if (isDestroyed) return;
                    handler.post(() -> {
                        if (isDestroyed) return;
                        boolean shouldBroadcastRecovery = hadNetworkLoss || activeWebSocket == null;
                        hadNetworkLoss = false;
                        backoffAttempt = 0;
                        handler.removeCallbacks(wsReconnectRunnable);
                        triggerLanDiscovery();
                        connectBackgroundWebSocket();
                        if (shouldBroadcastRecovery) {
                            broadcastNetworkRecovered();
                        }
                    });
                }

                @Override
                public void onLost(@NonNull Network network) {
                    if (isDestroyed) return;
                    handler.post(() -> {
                        if (isDestroyed) return;
                        hadNetworkLoss = true;
                        teardownActiveWebSocket("network_lost");
                        syncSubtitle = "بانتظار عودة الشبكة...";
                        refreshPersistentNotification();
                    });
                }
            };
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception ignored) {
        }
    }

    private void unregisterNetworkRecoveryCallback() {
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {
            }
            networkCallback = null;
        }
    }

    private void broadcastNetworkRecovered() {
        try {
            Intent intent = new Intent(ACTION_NETWORK_RECOVERED);
            intent.setPackage(getPackageName());
            sendBroadcast(intent);
        } catch (Exception ignored) {
        }
    }

    private void clearWsTimers() {
        handler.removeCallbacks(wsReconnectRunnable);
        handler.removeCallbacks(heartbeatPingRunnable);
        handler.removeCallbacks(pongWatchdogRunnable);
    }

    private void teardownActiveWebSocket(String reason) {
        handler.removeCallbacks(heartbeatPingRunnable);
        handler.removeCallbacks(pongWatchdogRunnable);
        WebSocket ws = activeWebSocket;
        activeWebSocket = null;
        if (ws != null) {
            try { ws.close(4000, reason); } catch (Exception ignored) { }
            try { ws.cancel(); } catch (Exception ignored) { }
        }
    }

    private long computeExponentialBackoffWithJitter() {
        int shift = Math.min(Math.max(0, backoffAttempt), 6);
        long exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * (1L << shift));
        int maxJitter = (int) Math.min(2000L, Math.round(exp * 0.3));
        long jitter = maxJitter > 0 ? jitterRandom.nextInt(maxJitter) : 0L;
        return Math.min(MAX_BACKOFF_MS, exp + jitter);
    }

    private String resolveSyncWsUrl() {
        SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS_NAME, MODE_PRIVATE);
        String saved = prefs.getString(MainActivity.KEY_REMOTE_WS_URL, BuildConfig.REMOTE_WS_URL);
        if (saved == null) return "";
        return saved.trim();
    }

    private void connectBackgroundWebSocket() {
        if (isDestroyed || wsClient == null) return;
        String wsUrl = resolveSyncWsUrl();
        if (wsUrl.isEmpty() || (!wsUrl.startsWith("ws://") && !wsUrl.startsWith("wss://"))) {
            syncSubtitle = "مزامنة لحظية نشطة 24/7";
            refreshPersistentNotification();
            triggerLanDiscovery();
            return;
        }

        clearWsTimers();
        teardownActiveWebSocket("replace_stale_socket");

        Request request = new Request.Builder().url(wsUrl).build();
        WebSocket ws = wsClient.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(@NonNull WebSocket webSocket, @NonNull Response response) {
                handler.post(() -> {
                    if (isDestroyed || activeWebSocket != webSocket) return;
                    boolean recoveredFromDrop = backoffAttempt > 0;
                    backoffAttempt = 0;
                    syncSubtitle = "متصل لحظياً مع الكمبيوتر";
                    refreshPersistentNotification();
                    handler.removeCallbacks(heartbeatPingRunnable);
                    handler.postDelayed(heartbeatPingRunnable, PING_INTERVAL_MS);
                    if (recoveredFromDrop) broadcastNetworkRecovered();
                    SharedPreferences sp = getSharedPreferences(PREFS_CHARGE, MODE_PRIVATE);
                    int limit = sp.getInt(KEY_CHARGE_LIMIT, 90);
                    if (lastBroadcastBatteryLevel >= 0) {
                        broadcastBatteryTelemetry(lastBroadcastBatteryLevel, lastBroadcastCharging, -1, limit);
                    }
                });
            }

            @Override
            public void onMessage(@NonNull WebSocket webSocket, @NonNull String text) {
                handler.post(() -> {
                    if (isDestroyed || activeWebSocket != webSocket) return;
                    handler.removeCallbacks(pongWatchdogRunnable);
                    if (text.contains("\"pong\"")) return;

                    // Direct native execution of sub-second cross-device alarm triggers & dismissals
                    try {
                        JSONObject json = new JSONObject(text);
                        String scope = json.optString("scope", "");
                        if ("alarm_trigger".equals(scope)) {
                            JSONObject extra = json.optJSONObject("extra");
                            String title = extra != null ? extra.optString("title", "") : json.optString("title", "");
                            if (title == null || title.isEmpty()) title = "تنبيه إيقاع اليوم";
                            String body = extra != null ? extra.optString("body", "") : json.optString("body", "");
                            String kind = extra != null ? extra.optString("kind", "") : json.optString("action", "general");
                            if (kind == null || kind.isEmpty()) kind = "general";
                            int snoozeMin = extra != null ? extra.optInt("snoozeMinutes", 5) : 5;
                            ReminderAlarmReceiver.triggerImmediateNativeAlarm(
                                    DayRhythmSyncService.this,
                                    title,
                                    body,
                                    kind,
                                    true,
                                    snoozeMin
                            );
                        } else if ("alarm_dismiss".equals(scope)) {
                            ReminderAlarmReceiver.cancelAllActiveAlarms(DayRhythmSyncService.this);
                        }
                    } catch (Exception ignored) {
                    }

                    Intent syncIntent = new Intent(ACTION_WS_SYNC_MESSAGE);
                    syncIntent.setPackage(getPackageName());
                    syncIntent.putExtra(EXTRA_WS_PAYLOAD, text);
                    sendBroadcast(syncIntent);
                });
            }

            @Override
            public void onClosed(@NonNull WebSocket webSocket, int code, @NonNull String reason) {
                handler.post(() -> {
                    if (isDestroyed || activeWebSocket != webSocket) return;
                    teardownActiveWebSocket("closed_by_remote");
                    scheduleWsReconnect();
                });
            }

            @Override
            public void onFailure(@NonNull WebSocket webSocket, @NonNull Throwable t, Response response) {
                handler.post(() -> {
                    if (isDestroyed || activeWebSocket != webSocket) return;
                    teardownActiveWebSocket("socket_failure");
                    syncSubtitle = "استعادة الاتصال تلقائياً...";
                    refreshPersistentNotification();
                    scheduleWsReconnect();
                });
            }
        });
        activeWebSocket = ws;
    }

    private void scheduleWsReconnect() {
        if (isDestroyed) return;
        handler.removeCallbacks(wsReconnectRunnable);
        long delayMs = computeExponentialBackoffWithJitter();
        backoffAttempt = Math.min(backoffAttempt + 1, 6);
        handler.postDelayed(wsReconnectRunnable, delayMs);
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;

            try {
                nm.deleteNotificationChannel("dayrhythm_live_alerts_v1");
                nm.deleteNotificationChannel(CHANNEL_KEEPALIVE);
                nm.cancel(NOTIF_LIVE_ALERT_ID);
            } catch (Exception ignored) {
            }

            NotificationChannel liveAlerts = new NotificationChannel(
                    CHANNEL_LIVE_ALERTS,
                    "العد التنازلي للمهمة القادمة (Live Alert)",
                    NotificationManager.IMPORTANCE_HIGH
            );
            liveAlerts.setDescription("يعرض اسم المهمة القادمة والعد التنازلي التفاعلي بجوار ثقب الكاميرا (OnePlus 12R)");
            liveAlerts.setShowBadge(false);
            liveAlerts.setSound(null, null);
            liveAlerts.enableVibration(false);
            liveAlerts.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(liveAlerts);

            // Ensure high-priority audio alarm channel is initialized up-front
            ReminderAlarmReceiver.ensureAlarmChannel(this);
        }
    }

    private void refreshPersistentNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        try {
            nm.notify(NOTIF_KEEPALIVE_ID, buildPersistentNotification());
        } catch (SecurityException ignored) {
        }
    }

    private void applyProgressStyleCompat(NotificationCompat.Builder builder, int progressPermille, int categoryColor) {
        // Standard fallback progress for all Android versions
        builder.setProgress(1000, progressPermille, false);

        // Android 15 (API 35) & Android 16 (API 36) / OxygenOS 14+ ProgressStyle support via reflection
        try {
            Class<?> progressStyleClass = Class.forName("android.app.Notification$ProgressStyle");
            Object styleInstance = progressStyleClass.getConstructor().newInstance();

            Method setStyledByProgress = progressStyleClass.getMethod("setStyledByProgress", boolean.class);
            setStyledByProgress.invoke(styleInstance, true);

            Method setProgress = progressStyleClass.getMethod("setProgress", int.class);
            setProgress.invoke(styleInstance, progressPermille);

            try {
                Class<?> segmentClass = Class.forName("android.app.Notification$ProgressStyle$Segment");
                Constructor<?> segmentCtor = segmentClass.getConstructor(int.class);
                Object segment = segmentCtor.newInstance(1000);
                Method setColor = segmentClass.getMethod("setColor", int.class);
                setColor.invoke(segment, categoryColor);

                Method addSegment = progressStyleClass.getMethod("addProgressSegment", segmentClass);
                addSegment.invoke(styleInstance, segment);
            } catch (Throwable ignored) {
            }
        } catch (Throwable ignored) {
        }
    }

    private Notification buildPersistentNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        long nowMs = System.currentTimeMillis();
        long remainingMs = liveTargetEpochMs - nowMs;
        Long explicitTagSec = parseLeadTagSeconds(liveTitle);
        if (explicitTagSec == null) {
            explicitTagSec = parseLeadTagSeconds(liveStatusLabel);
        }

        // Live alert is active whenever there is an upcoming or ongoing event,
        // respecting explicit tag (#45s, #30m) if set by user.
        boolean hasUpcoming = liveTargetEpochMs > nowMs + 1000L;
        boolean inLeadWindow = liveAlertsEnabled && hasUpcoming &&
                (explicitTagSec == null || remainingMs <= explicitTagSec * 1000L);

        int smallIcon = getSmallIconForKind(liveKind);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_LIVE_ALERTS)
                .setSmallIcon(smallIcon)
                .setOngoing(true)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(pi);

        Bundle liveExtras = new Bundle();

        if (inLeadWindow) {
            // ── Live Alerts Capsule active (OnePlus 12R punch hole & Android Promoted Ongoing) ──
            String compactPill = formatChipText(liveEmoji, remainingMs);
            int categoryColor = (remainingMs <= 60_000L) ? 0xFFFF6B6B : (remainingMs <= 300_000L ? 0xFFFFB020 : 0xFF7FFFD4);
            long leadRefMs = explicitTagSec != null ? explicitTagSec * 1000L : Math.max(1, liveAlertsLeadMinutes) * 60_000L;
            int progressPermille = (int) Math.max(0, Math.min(1000, ((leadRefMs - remainingMs) * 1000) / Math.max(1000L, leadRefMs)));

            // Keys specifically recognized by OxygenOS 14/15/16 Fluid Cloud & Android 16 Promoted Ongoing
            liveExtras.putBoolean("android.requestPromotedOngoing", true);
            liveExtras.putBoolean("android.promotedOngoing", true);
            liveExtras.putBoolean("oplus.live_alert.enable", true);
            liveExtras.putBoolean("oplus.livealert.enable", true);
            liveExtras.putInt("oplus.live_alert_state", 1);
            liveExtras.putString("android.shortCriticalText", compactPill);
            liveExtras.putCharSequence("android.shortCriticalText", compactPill);
            liveExtras.putString("oplus.live_alert.text", compactPill);
            liveExtras.putBoolean("android.showChronometer", true);
            liveExtras.putBoolean("android.chronometerCountdown", true);

            try {
                Method setShortTextMethod = builder.getClass().getMethod("setShortCriticalText", CharSequence.class);
                setShortTextMethod.invoke(builder, compactPill);
            } catch (Throwable ignored) {
            }

            try {
                Method setReqPromoted = builder.getClass().getMethod("setRequestPromotedOngoing", boolean.class);
                setReqPromoted.invoke(builder, true);
            } catch (Throwable ignored) {
            }

            String rawTitle = liveTitle.isEmpty() ? liveStatusLabel : liveTitle;
            String cleanTitle = cleanDisplayTitle(rawTitle);
            String displayTitle = (liveEmoji.isEmpty() ? "" : liveEmoji + " ") + (cleanTitle.isEmpty() ? rawTitle : cleanTitle);

            builder.setContentTitle(compactPill)
                    .setContentText(displayTitle)
                    .setSubText(liveStatusLabel)
                    .setShowWhen(true)
                    .setWhen(liveTargetEpochMs)
                    .setUsesChronometer(true)
                    .setChronometerCountDown(true)
                    .setColor(categoryColor)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_REMINDER)
                    .setProgress(1000, progressPermille, false)
                    .addExtras(liveExtras);

            applyProgressStyleCompat(builder, progressPermille, categoryColor);
        } else if (hasUpcoming && persistentCountdownEnabled) {
            // ── Waiting for explicit tag window: ongoing silent countdown ──
            String compactPill = formatChipText(liveEmoji, remainingMs);
            String rawTitle = liveTitle.isEmpty() ? liveStatusLabel : liveTitle;
            String cleanTitle = cleanDisplayTitle(rawTitle);
            String displayTitle = (liveEmoji.isEmpty() ? "" : liveEmoji + " ") + (cleanTitle.isEmpty() ? rawTitle : cleanTitle);

            liveExtras.putBoolean("oplus.live_alert.enable", false);
            liveExtras.putBoolean("android.requestPromotedOngoing", false);

            builder.setContentTitle(compactPill)
                    .setContentText(displayTitle + " • " + liveStatusLabel)
                    .setShowWhen(true)
                    .setWhen(liveTargetEpochMs)
                    .setUsesChronometer(true)
                    .setChronometerCountDown(true)
                    .setColor(0xFF7FFFD4)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setCategory(NotificationCompat.CATEGORY_EVENT)
                    .addExtras(liveExtras);
        } else {
            // ── Idle / Sync Status: Clean background ongoing notification ──
            liveExtras.putBoolean("oplus.live_alert.enable", false);
            liveExtras.putBoolean("android.requestPromotedOngoing", false);

            builder.setContentTitle("إيقاع اليوم | DayRhythm")
                    .setContentText(syncSubtitle)
                    .setShowWhen(false)
                    .setUsesChronometer(false)
                    .setColor(0xFF7FFFD4)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setCategory(NotificationCompat.CATEGORY_STATUS)
                    .addExtras(liveExtras);
        }

        return builder.build();
    }

    private void refreshLiveAlertCapsule() {
        // Countdown capsule notification disabled — keeping only the single persistent status notification
        cancelLiveAlertCapsule();
    }

    private void cancelLiveAlertCapsule() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(NOTIF_LIVE_ALERT_ID);
        }
        liveIslandCurrentlyShown = false;
    }
}
