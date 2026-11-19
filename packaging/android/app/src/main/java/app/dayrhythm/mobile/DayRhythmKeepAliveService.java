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

import androidx.core.app.NotificationCompat;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class DayRhythmKeepAliveService extends Service {
    public static final String CHANNEL_KEEPALIVE = "dayrhythm_keepalive";
    public static final String CHANNEL_UPDATES = "dayrhythm_updates";
    private static final int NOTIF_KEEPALIVE_ID = 1001;
    private static final int NOTIF_UPDATE_ID = 1002;
    private static final long CHECK_INTERVAL_MS = 15 * 60 * 1000L; // 15 minutes

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private long lastUpdateCheckMs = 0L;

    private final Runnable periodicPulse = new Runnable() {
        @Override
        public void run() {
            executor.execute(() -> {
                pingCloudHealth();
                long now = System.currentTimeMillis();
                if (now - lastUpdateCheckMs > 3 * 60 * 60 * 1000L) {
                    lastUpdateCheckMs = now;
                    checkForGithubUpdate();
                }
            });
            handler.postDelayed(this, CHECK_INTERVAL_MS);
        }
    };

    public static void startServiceCompat(Context context) {
        Intent intent = new Intent(context, DayRhythmKeepAliveService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception ignored) {
            // Avoid crash if background restriction temporarily blocks launch
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = buildKeepAliveNotification("إيقاع اليوم يعمل في الخلفية · مزامنة لحظية مع الكمبيوتر");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_KEEPALIVE_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIF_KEEPALIVE_ID, notification);
        }

        handler.removeCallbacks(periodicPulse);
        handler.post(periodicPulse);
        return START_STICKY;
    }

    @Override
    public void onTimeout(int startId) {
        // Android 14/15/16 dataSync foreground timeout compliance: stop cleanly so OS doesn't crash app
        stopSelf(startId);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(periodicPulse);
        executor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannels() {
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

            NotificationChannel updates = new NotificationChannel(
                    CHANNEL_UPDATES,
                    "تحديثات إيقاع اليوم التلقائية",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            nm.createNotificationChannel(updates);
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

    private void pingCloudHealth() {
        HttpURLConnection conn = null;
        try {
            SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS_NAME, MODE_PRIVATE);
            String baseUrl = prefs.getString(MainActivity.KEY_APP_URL, BuildConfig.DEFAULT_APP_URL);
            if (baseUrl == null || baseUrl.trim().isEmpty()) return;
            String clean = baseUrl.trim().replaceAll("/+$", "");
            URL url = new URL(clean + "/api/health");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setRequestMethod("GET");
            conn.getResponseCode();
        } catch (Exception ignored) {
            // Silent keepalive probe
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void checkForGithubUpdate() {
        AutoUpdateManager.UpdateInfo info = AutoUpdateManager.checkLatestRelease(this);
        if (info == null || !info.hasUpdate) return;

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.putExtra("trigger_update", true);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                this,
                1,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_UPDATES)
                .setContentTitle("يتوفر تحديث جديد لإيقاع اليوم (" + info.latestTag + ")")
                .setContentText("اضغط هنا لتنزيل وتثبيت التحديث تلقائياً على OnePlus 12R")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();
        nm.notify(NOTIF_UPDATE_ID, notif);
    }
}
