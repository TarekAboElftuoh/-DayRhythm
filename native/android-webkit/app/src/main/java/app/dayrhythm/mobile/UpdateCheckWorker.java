package app.dayrhythm.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

public class UpdateCheckWorker extends Worker {
    public static final String WORK_NAME = "dayrhythm_github_update_check";
    public static final String CHANNEL_UPDATES = "dayrhythm_updates";
    private static final int NOTIF_UPDATE_ID = 2002;

    public UpdateCheckWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    public static void schedulePeriodicCheck(Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                UpdateCheckWorker.class,
                1,
                TimeUnit.HOURS
        )
                .setConstraints(constraints)
                .build();

        WorkManager.getInstance(context.getApplicationContext()).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
        );
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        GitHubUpdater.UpdateInfo info = GitHubUpdater.checkLatestRelease(ctx);
        if (info != null && info.hasUpdate) {
            ensureUpdateChannel(ctx);
            String bestUrl = (info.webOtaZipUrl != null && !info.webOtaZipUrl.isEmpty())
                    ? info.webOtaZipUrl
                    : info.apkDownloadUrl;

            Intent broadcast = new Intent(DayRhythmSyncService.ACTION_UPDATE_AVAILABLE);
            broadcast.setPackage(ctx.getPackageName());
            broadcast.putExtra(DayRhythmSyncService.EXTRA_UPDATE_TAG, info.latestTag);
            broadcast.putExtra(DayRhythmSyncService.EXTRA_UPDATE_URL, bestUrl);
            ctx.sendBroadcast(broadcast);

            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                Intent openIntent = new Intent(ctx, MainActivity.class);
                openIntent.putExtra("trigger_update", true);
                openIntent.putExtra(DayRhythmSyncService.EXTRA_UPDATE_TAG, info.latestTag);
                openIntent.putExtra(DayRhythmSyncService.EXTRA_UPDATE_URL, bestUrl);
                openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

                PendingIntent pi = PendingIntent.getActivity(
                        ctx,
                        2,
                        openIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );

                Notification notif = new NotificationCompat.Builder(ctx, CHANNEL_UPDATES)
                        .setContentTitle("🚀 يتوفر تحديث فوري لإيقاع اليوم (" + info.latestTag + ")")
                        .setContentText("اضغط للتحديث السريع داخل التطبيق بدون تنزيل APK جديد")
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setAutoCancel(true)
                        .setContentIntent(pi)
                        .build();
                nm.notify(NOTIF_UPDATE_ID, notif);
            }
        }
        return Result.success();
    }

    private static void ensureUpdateChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_UPDATES,
                    "تحديثات إيقاع اليوم التلقائية",
                    NotificationManager.IMPORTANCE_HIGH
            );
            nm.createNotificationChannel(channel);
        }
    }
}
