package app.dayrhythm.mobile;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
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

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import java.util.Locale;
import java.util.Random;
import java.util.concurrent.TimeUnit;

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
    public static final String CHANNEL_LIVE_ALERTS = "dayrhythm_live_alerts_v1";
    public static final String ACTION_WS_SYNC_MESSAGE = "app.dayrhythm.mobile.WS_SYNC_MESSAGE";
    public static final String ACTION_UPDATE_AVAILABLE = "app.dayrhythm.mobile.UPDATE_AVAILABLE";
    public static final String ACTION_NETWORK_RECOVERED = "app.dayrhythm.mobile.NETWORK_RECOVERED";
    public static final String ACTION_UPDATE_LIVE_STATUS = "app.dayrhythm.mobile.UPDATE_LIVE_STATUS";
    public static final String EXTRA_WS_PAYLOAD = "ws_payload";
    public static final String EXTRA_UPDATE_TAG = "update_tag";
    public static final String EXTRA_UPDATE_URL = "update_url";

    public static final String EXTRA_LIVE_EMOJI = "live_emoji";
    public static final String EXTRA_LIVE_TITLE = "live_title";
    public static final String EXTRA_LIVE_STATUS_LABEL = "live_status_label";
    public static final String EXTRA_LIVE_TARGET_MS = "live_target_ms";
    public static final String EXTRA_LIVE_ALERTS_ENABLED = "live_alerts_enabled";
    public static final String EXTRA_LIVE_LEAD_MINUTES = "live_lead_minutes";
    public static final String EXTRA_PERSISTENT_NOTIF_ENABLED = "persistent_notif_enabled";

    private static final String PREFS_LIVE = "dayrhythm_live_state_prefs";
    private static final int NOTIF_KEEPALIVE_ID = 1001;
    private static final int NOTIF_LIVE_ALERT_ID = 1002;
    private static final long BASE_BACKOFF_MS = 1500L;
    private static final long MAX_BACKOFF_MS = 45000L;
    private static final long PING_INTERVAL_MS = 20000L;
    private static final long PONG_TIMEOUT_MS = 10000L;

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
    private long liveTargetEpochMs = 0L;
    private boolean liveAlertsEnabled = true;
    private int liveAlertsLeadMinutes = 10;
    private boolean persistentCountdownEnabled = true;
    private boolean liveIslandCurrentlyShown = false;
    private String syncSubtitle = "مزامنة لحظية نشطة 24/7";

    private final Runnable wsReconnectRunnable = this::connectBackgroundWebSocket;

    private final Runnable liveCountdownTickRunnable = new Runnable() {
        @Override
        public void run() {
            if (isDestroyed) return;
            refreshLiveAlertCapsule();
            if (liveTargetEpochMs > 0L) {
                long remainingMs = liveTargetEpochMs - System.currentTimeMillis();
                long leadMs = Math.max(1, liveAlertsLeadMinutes) * 60_000L;
                if (remainingMs > 0 && remainingMs <= leadMs && liveAlertsEnabled) {
                    handler.postDelayed(this, 1000L);
                } else if (remainingMs > leadMs && liveAlertsEnabled) {
                    long waitMs = Math.min(remainingMs - leadMs + 100L, 15_000L);
                    handler.postDelayed(this, Math.max(1000L, waitMs));
                }
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
        restorePersistedLiveState();
        createNotificationChannels();
        UpdateCheckWorker.schedulePeriodicCheck(this);

        wsClient = new OkHttpClient.Builder()
                .pingInterval(25, TimeUnit.SECONDS)
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .retryOnConnectionFailure(true)
                .build();

        registerNetworkRecoveryCallback();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
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
            persistLiveState();

            startForegroundCompat(buildPersistentNotification());
            handler.removeCallbacks(liveCountdownTickRunnable);
            handler.post(liveCountdownTickRunnable);
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
        handler.removeCallbacks(liveCountdownTickRunnable);
        cancelLiveAlertCapsule();
        unregisterNetworkRecoveryCallback();
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
                });
            }

            @Override
            public void onMessage(@NonNull WebSocket webSocket, @NonNull String text) {
                handler.post(() -> {
                    if (isDestroyed || activeWebSocket != webSocket) return;
                    handler.removeCallbacks(pongWatchdogRunnable);
                    if (text.contains("\"pong\"")) return;
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

            NotificationChannel keepAlive = new NotificationChannel(
                    CHANNEL_KEEPALIVE,
                    "العد التنازلي الثابت للمهمة القادمة",
                    NotificationManager.IMPORTANCE_LOW
            );
            keepAlive.setDescription("إشعار ثابت صامت يعرض العد التنازلي للحدث أو المهمة القادمة");
            keepAlive.setShowBadge(false);
            keepAlive.setSound(null, null);
            keepAlive.enableVibration(false);
            nm.createNotificationChannel(keepAlive);

            NotificationChannel liveAlerts = new NotificationChannel(
                    CHANNEL_LIVE_ALERTS,
                    "كبسولة Dynamic Island (Live Alerts)",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            liveAlerts.setDescription("تظهر تلقائياً قبل التنبيه بـ 5 أو 10 دقائق مع الثواني والإيموجي");
            liveAlerts.setShowBadge(false);
            liveAlerts.setSound(null, null);
            liveAlerts.enableVibration(false);
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
        boolean hasUpcoming = persistentCountdownEnabled && liveTargetEpochMs > nowMs + 1000L;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_KEEPALIVE)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setColor(0xFF7FFFD4)
                .setContentIntent(pi);

        if (hasUpcoming) {
            String headerTitle = liveEmoji + " " + (liveTitle.isEmpty() ? liveStatusLabel : liveTitle);
            builder.setContentTitle(headerTitle)
                    .setContentText(liveStatusLabel)
                    .setShowWhen(true)
                    .setWhen(liveTargetEpochMs)
                    .setUsesChronometer(true)
                    .setChronometerCountDown(true);
        } else {
            builder.setContentTitle("إيقاع اليوم | DayRhythm")
                    .setContentText(syncSubtitle)
                    .setShowWhen(false)
                    .setUsesChronometer(false);
        }

        return builder.build();
    }

    private void refreshLiveAlertCapsule() {
        long nowMs = System.currentTimeMillis();
        long remainingMs = liveTargetEpochMs - nowMs;
        long leadMs = Math.max(1, liveAlertsLeadMinutes) * 60_000L;

        if (!liveAlertsEnabled || liveTargetEpochMs <= 0L || remainingMs <= 0L || remainingMs > leadMs) {
            if (liveIslandCurrentlyShown) {
                cancelLiveAlertCapsule();
            }
            return;
        }

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;

        long totalSec = Math.max(0L, (remainingMs + 500L) / 1000L);
        long mins = totalSec / 60L;
        long secs = totalSec % 60L;
        String mmss = String.format(Locale.US, "%02d:%02d", mins, secs);
        String compactPill = liveEmoji + " " + mmss;

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                this,
                1002,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Bundle liveExtras = new Bundle();
        liveExtras.putBoolean("android.requestPromotedOngoing", true);
        liveExtras.putBoolean("oplus.live_alert.enable", true);
        liveExtras.putString("android.shortCriticalText", compactPill);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_LIVE_ALERTS)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(compactPill)
                .setContentText(liveTitle.isEmpty() ? liveStatusLabel : liveTitle)
                .setSubText(liveStatusLabel)
                .setOngoing(true)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(true)
                .setWhen(liveTargetEpochMs)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setColor(totalSec <= 60 ? 0xFFFF6B6B : 0xFF7FFFD4)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setCategory(NotificationCompat.CATEGORY_EVENT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addExtras(liveExtras)
                .setContentIntent(pi);

        try {
            nm.notify(NOTIF_LIVE_ALERT_ID, builder.build());
            liveIslandCurrentlyShown = true;
        } catch (SecurityException ignored) {
        }
    }

    private void cancelLiveAlertCapsule() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(NOTIF_LIVE_ALERT_ID);
        }
        liveIslandCurrentlyShown = false;
    }
}
