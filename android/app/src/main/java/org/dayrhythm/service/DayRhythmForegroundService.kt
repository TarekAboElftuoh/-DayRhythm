package org.dayrhythm.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import org.dayrhythm.core.DayRhythmNativeCore

class DayRhythmForegroundService : Service() {

    private val CHANNEL_ID = "dayrhythm_persistent_sync"
    private val NOTIF_ID = 1001

    private var nativeCore: DayRhythmNativeCore? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        val notif = buildPersistentNotification("إيقاع اليوم متصل 24/7 (Spotify Spirc Core)")
        startForeground(NOTIF_ID, notif)

        // Initialize C++ Core
        val dbPath = getDatabasePath("dayrhythm_v2.db").absolutePath
        val deviceId = "android_${Build.MODEL}_${Build.ID}"
        val userId = "BLzoZhXVNXQv8nQEvaQItWDqDmJ2"

        nativeCore = DayRhythmNativeCore(dbPath, deviceId, userId)
        nativeCore?.initialize()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == "ACTION_DISMISS_ALERT") {
            val alertId = intent.getStringExtra("alert_id") ?: ""
            if (alertId.isNotEmpty()) {
                nativeCore?.dismissAlert(alertId)
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        nativeCore?.destroy()
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "DayRhythm Persistent Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "مزامنة لحظية فائقة السرعة مع الحاسوب"
                setShowBadge(false)
            }
            val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            mgr.createNotificationChannel(channel)
        }
    }

    private fun buildPersistentNotification(contentText: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("DayRhythm Connect")
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
