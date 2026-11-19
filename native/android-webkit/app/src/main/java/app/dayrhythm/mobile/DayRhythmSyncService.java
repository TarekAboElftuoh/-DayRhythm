package app.dayrhythm.mobile;

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
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import java.util.Random;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class DayRhythmSyncService extends Service {
    public static final String CHANNEL_KEEPALIVE = "dayrhythm_keepalive";
    public static final String ACTION_WS_SYNC_MESSAGE = "app.dayrhythm.mobile.WS_SYNC_MESSAGE";
    public static final String ACTION_UPDATE_AVAILABLE = "app.dayrhythm.mobile.UPDATE_AVAILABLE";
    public static final String ACTION_NETWORK_RECOVERED = "app.dayrhythm.mobile.NETWORK_RECOVERED";
    public static final String EXTRA_WS_PAYLOAD = "ws_payload";
    public static final String EXTRA_UPDATE_TAG = "update_tag";
    public static final String EXTRA_UPDATE_URL = "update_url";

    private static final int NOTIF_KEEPALIVE_ID = 1001;
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

    private final Runnable wsReconnectRunnable = this::connectBackgroundWebSocket;

    private final Runnable pongWatchdogRunnable = () -> {
        if (isDestroyed) return;
        teardownActiveWebSocket("pong_timeout");
        updateKeepAliveNotification("يعمل في الخلفية · استعادة الاتصال المتعطل...");
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
            // Avoid crash if system temporarily defers background service launch
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
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
        Notification notification = buildKeepAliveNotification("يعمل 24/7 في الخلفية · مزامنة لحظية واستعادة تلقائية نشطة");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_KEEPALIVE_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIF_KEEPALIVE_ID, notification);
        }

        connectBackgroundWebSocket();
        return START_STICKY;
    }

    @Override
    public void onTimeout(int startId) {
        stopSelf(startId);
    }

    @Override
    public void onDestroy() {
        isDestroyed = true;
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
                        updateKeepAliveNotification("بانتظار عودة الشبكة · الاستعادة التلقائية جاهزة");
                    });
                }
            };
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception ignored) {
            // Gracefully ignore on restricted OEM ROMs
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
            try {
                ws.close(4000, reason);
            } catch (Exception ignored) {
            }
            try {
                ws.cancel();
            } catch (Exception ignored) {
            }
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
            updateKeepAliveNotification("يعمل 24/7 في الخلفية · مزامنة Firestore مع استعادة تلقائية");
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
                    updateKeepAliveNotification("متصل لحظياً عبر WebSocket · OnePlus 12R ⇄ الكمبيوتر");
                    handler.removeCallbacks(heartbeatPingRunnable);
                    handler.postDelayed(heartbeatPingRunnable, PING_INTERVAL_MS);
                    if (recoveredFromDrop) {
                        broadcastNetworkRecovered();
                    }
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
                    updateKeepAliveNotification("يعمل في الخلفية · جاري استعادة WebSocket تلقائياً...");
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

    private void updateKeepAliveNotification(String subtitle) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.notify(NOTIF_KEEPALIVE_ID, buildKeepAliveNotification(subtitle));
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;

            NotificationChannel keepAlive = new NotificationChannel(
                    CHANNEL_KEEPALIVE,
                    "تشغيل إيقاع اليوم في الخلفية",
                    NotificationManager.IMPORTANCE_MIN
            );
            keepAlive.setShowBadge(false);
            keepAlive.setSound(null, null);
            nm.createNotificationChannel(keepAlive);
        }
    }

    private Notification buildKeepAliveNotification(String subtitle) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_KEEPALIVE)
                .setContentTitle("إيقاع اليوم | DayRhythm")
                .setContentText(subtitle)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setContentIntent(pi)
                .build();
    }
}
