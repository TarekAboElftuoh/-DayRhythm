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
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

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
    public static final String EXTRA_WS_PAYLOAD = "ws_payload";
    public static final String EXTRA_UPDATE_TAG = "update_tag";
    public static final String EXTRA_UPDATE_URL = "update_url";

    private static final int NOTIF_KEEPALIVE_ID = 1001;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private OkHttpClient wsClient;
    private WebSocket activeWebSocket;
    private long wsBackoffMs = 3000L;
    private volatile boolean isDestroyed = false;

    private final Runnable wsReconnectRunnable = this::connectBackgroundWebSocket;

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
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = buildKeepAliveNotification("يعمل 24/7 في الخلفية · مزامنة لحظية وتحديث تلقائي نشط");
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
        handler.removeCallbacks(wsReconnectRunnable);
        if (activeWebSocket != null) {
            try {
                activeWebSocket.close(1000, "service_stopped");
            } catch (Exception ignored) {
            }
            activeWebSocket = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
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
            updateKeepAliveNotification("يعمل 24/7 في الخلفية · مزامنة Firestore لحظية نشطة");
            return;
        }

        if (activeWebSocket != null) {
            try {
                activeWebSocket.cancel();
            } catch (Exception ignored) {
            }
            activeWebSocket = null;
        }

        Request request = new Request.Builder().url(wsUrl).build();
        activeWebSocket = wsClient.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(@NonNull WebSocket webSocket, @NonNull Response response) {
                wsBackoffMs = 3000L;
                updateKeepAliveNotification("متصل لحظياً عبر WebSocket · OnePlus 12R ⇄ الكمبيوتر");
            }

            @Override
            public void onMessage(@NonNull WebSocket webSocket, @NonNull String text) {
                Intent syncIntent = new Intent(ACTION_WS_SYNC_MESSAGE);
                syncIntent.setPackage(getPackageName());
                syncIntent.putExtra(EXTRA_WS_PAYLOAD, text);
                sendBroadcast(syncIntent);
            }

            @Override
            public void onClosed(@NonNull WebSocket webSocket, int code, @NonNull String reason) {
                scheduleWsReconnect();
            }

            @Override
            public void onFailure(@NonNull WebSocket webSocket, @NonNull Throwable t, Response response) {
                updateKeepAliveNotification("يعمل في الخلفية · جاري إعادة ربط WebSocket...");
                scheduleWsReconnect();
            }
        });
    }

    private void scheduleWsReconnect() {
        if (isDestroyed) return;
        handler.removeCallbacks(wsReconnectRunnable);
        handler.postDelayed(wsReconnectRunnable, wsBackoffMs);
        wsBackoffMs = Math.min(wsBackoffMs * 2L, 45000L);
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
