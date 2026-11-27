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
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;

import androidx.annotation.NonNull;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Random;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

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
    public static final String ACTION_RECONNECT_WS = "app.dayrhythm.mobile.RECONNECT_WS";
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
    public static final String EXTRA_LIVE_ALWAYS_ON = "live_always_on";
    public static final String EXTRA_LIVE_SHOW_CHARGING = "live_show_charging";
    public static final String EXTRA_PERSISTENT_NOTIF_ENABLED = "persistent_notif_enabled";
    public static final String EXTRA_LIVE_DESC = "live_description";
    public static final String EXTRA_LIVE_CLOCK_LABEL = "live_clock_label";
    public static final String EXTRA_LIVE_NEXT_UP = "live_next_up";
    public static final String EXTRA_LIVE_HYDRATION = "live_hydration";
    public static final String EXTRA_SCHED_EMOJI = "sched_emoji";
    public static final String EXTRA_SCHED_TITLE = "sched_title";
    public static final String EXTRA_SCHED_STATUS_LABEL = "sched_status_label";
    public static final String EXTRA_SCHED_DESC = "sched_description";
    public static final String EXTRA_SCHED_CLOCK_LABEL = "sched_clock_label";
    public static final String EXTRA_SCHED_TARGET_MS = "sched_target_ms";
    public static final String EXTRA_SCHED_NEXT_UP = "sched_next_up";

    private static final String DEFAULT_SPIRC_BROKER_WSS = "wss://dayrhythm-spirc-broker.tarek13us.workers.dev";
    private static final String PREFS_LIVE = "dayrhythm_live_state_prefs";
    public static final int NOTIF_UNIFIED_ID = 1001;
    private static final int NOTIF_KEEPALIVE_ID = NOTIF_UNIFIED_ID;
    private static final int NOTIF_LIVE_ALERT_ID = 1002;
    private static final long BASE_BACKOFF_MS = 1500L;
    private static final long MAX_BACKOFF_MS = 45000L;
    private static final long PING_INTERVAL_MS = 20000L;
    private static final long PONG_TIMEOUT_MS = 10000L;

    private static volatile DayRhythmSyncService instance = null;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Random jitterRandom = new Random();

    private OkHttpClient wsClient;
    private volatile WebSocket activeWebSocket;
    private volatile String connectedWsUrl = "";
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private int backoffAttempt = 0;
    private boolean hadNetworkLoss = false;
    private volatile boolean isDestroyed = false;
    private long spircLamportSeq = 0L;

    private String liveEmoji = "📅";
    private String liveTitle = "";
    private String liveStatusLabel = "المهمة القادمة";
    private String liveKind = "general";
    private long liveTargetEpochMs = 0L;
    private boolean liveAlertsEnabled = true;
    private int liveAlertsLeadMinutes = 10;
    private boolean liveAlertsAlwaysOn = false;
    private boolean liveAlertsShowCharging = true;
    private boolean persistentCountdownEnabled = true;
    private String liveDescription = "";
    private String liveClockLabel = "";
    private String liveNextUpSummary = "";
    private String liveHydrationSummary = "";
    private String schedEmoji = "📅";
    private String schedTitle = "";
    private String schedStatusLabel = "لا مواعيد مجدولة متبقية";
    private String schedDescription = "";
    private String schedClockLabel = "";
    private long schedTargetEpochMs = 0L;
    private String schedNextUpSummary = "";
    private boolean liveIslandCurrentlyShown = false;
    private String syncSubtitle = "مزامنة لحظية نشطة 24/7";
    private String lastNotifStateKey = "";
    private long lastNotifPostMs = 0L;

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

    private static boolean isEmojiBaseCodePoint(int cp) {
        int type = Character.getType(cp);
        return (cp >= 0x1F300 && cp <= 0x1FAFF)
                || (cp >= 0x2600 && cp <= 0x27BF)
                || (cp >= 0x2300 && cp <= 0x23FF)
                || (cp >= 0x1F1E6 && cp <= 0x1F1FF)
                || type == Character.OTHER_SYMBOL;
    }

    private static String emojiGroup(String norm) {
        if ("☀".equals(norm) || "🌞".equals(norm)) return "sun";
        if ("🌅".equals(norm) || "🌄".equals(norm)) return "sunrise";
        if ("🌇".equals(norm) || "🌆".equals(norm)) return "sunset";
        if ("🕌".equals(norm) || "🕋".equals(norm) || "📿".equals(norm)) return "prayer";
        if ("💧".equals(norm) || "💦".equals(norm) || "🥤".equals(norm)) return "water";
        if ("💊".equals(norm) || "💉".equals(norm)) return "med";
        if ("📅".equals(norm) || "📆".equals(norm) || "🗓".equals(norm)) return "cal";
        if ("☑".equals(norm) || "✅".equals(norm) || "✔".equals(norm)) return "check";
        if ("⚡".equals(norm) || "🔋".equals(norm)) return "charge";
        return norm;
    }

    public static String sanitizeEmojis(String text, int maxCount) {
        if (text == null || text.isEmpty()) return "";
        StringBuilder out = new StringBuilder(text.length());
        java.util.HashSet<String> seen = new java.util.HashSet<>();
        String lastGroup = "";
        int kept = 0;
        int i = 0;
        int len = text.length();
        while (i < len) {
            int cp = text.codePointAt(i);
            int cc = Character.charCount(cp);
            if (isEmojiBaseCodePoint(cp)) {
                int start = i;
                i += cc;
                while (i < len) {
                    int nextCp = text.codePointAt(i);
                    if (nextCp == 0xFE0F || nextCp == 0xFE0E || (nextCp >= 0x1F3FB && nextCp <= 0x1F3FF) || nextCp == 0x20E3) {
                        i += Character.charCount(nextCp);
                    } else if (nextCp == 0x200D) {
                        i += Character.charCount(nextCp);
                        if (i < len) {
                            int joined = text.codePointAt(i);
                            i += Character.charCount(joined);
                        }
                    } else {
                        break;
                    }
                }
                String cluster = text.substring(start, i);
                if (maxCount > 0 && kept < maxCount) {
                    String norm = cluster.replace("\uFE0F", "");
                    String grp = emojiGroup(norm);
                    if (!seen.contains(norm) && (lastGroup.isEmpty() || !grp.equals(lastGroup))) {
                        seen.add(norm);
                        lastGroup = grp;
                        kept++;
                        out.append(cluster);
                    }
                }
            } else {
                out.append(text, i, i + cc);
                i += cc;
            }
        }
        return out.toString()
                .replaceAll("[^\\S\\r\\n]{2,}", " ")
                .replaceAll("[^\\S\\r\\n]*\\n[^\\S\\r\\n]*", "\n")
                .trim();
    }

    private static int resolveEmojiAccentColor(String emoji) {
        String single = sanitizeEmojis(emoji, 1).replace("\uFE0F", "");
        switch (single) {
            case "💧":
            case "💦":
            case "🥤":
                return 0xFF38BDF8;
            case "☀":
            case "🌅":
            case "🌄":
            case "🌞":
                return 0xFFF59E0B;
            case "🌇":
            case "🌆":
                return 0xFFF97316;
            case "🕌":
            case "📿":
            case "🕋":
            case "🌙":
            case "🤲":
                return 0xFF10B981;
            case "🏃":
            case "💪":
            case "🏋":
            case "🚶":
                return 0xFF22C55E;
            case "💊":
            case "🩺":
            case "💉":
                return 0xFFEC4899;
            case "📅":
            case "📆":
            case "🗓":
            case "☑":
            case "✅":
                return 0xFF6366F1;
            case "⚡":
            case "🔋":
                return 0xFF4ADE80;
            default:
                return 0xFF38BDF8;
        }
    }

    public static String formatChipText(String emoji, long remainingMs) {
        String safeEmoji = sanitizeEmojis(emoji, 1);
        if (safeEmoji.isEmpty()) safeEmoji = "📅";
        String label;
        if (remainingMs <= 0L) {
            label = "0ث";
        } else if (remainingMs <= 60_000L) {
            long secs = Math.max(1L, Math.min(60L, (remainingMs + 999L) / 1000L));
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
        return "\u200F" + safeEmoji + " " + label;
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

            if (liveTargetEpochMs > 0L) {
                long now = System.currentTimeMillis();
                long remainingMs = liveTargetEpochMs - now;
                Long explicitTagSec = parseLeadTagSeconds(liveTitle);
                if (explicitTagSec == null) {
                    explicitTagSec = parseLeadTagSeconds(liveStatusLabel);
                }

                if (explicitTagSec != null && remainingMs > explicitTagSec * 1000L) {
                    // Tagged event: sleep until entering tag window (max 10 min checks)
                    long waitMs = (remainingMs - explicitTagSec * 1000L) + 50L;
                    handler.postDelayed(this, Math.max(1000L, Math.min(waitMs, 600_000L)));
                } else if (remainingMs > 60_000L && (liveAlertsEnabled || persistentCountdownEnabled)) {
                    // SystemUI Chronometer draws live seconds at 0% CPU.
                    // Wake strictly on minute boundary OR exact entry into the Live Alert lead window.
                    long timeToNextMin = (remainingMs % 60_000L);
                    if (timeToNextMin <= 250L) timeToNextMin = 60_000L;
                    long timeToSixtySec = remainingMs - 60_000L + 50L;
                    long leadWindowMs = getEffectiveLeadWindowMs();
                    long timeToLeadEdge = (!liveAlertsAlwaysOn && liveAlertsEnabled && remainingMs > leadWindowMs)
                            ? (remainingMs - leadWindowMs + 80L)
                            : Long.MAX_VALUE;
                    long nextWake = Math.min(Math.min(timeToNextMin, timeToSixtySec), timeToLeadEdge);
                    handler.postDelayed(this, Math.max(1000L, nextWake));
                } else if (remainingMs > 0L && remainingMs <= 60_000L && (liveAlertsEnabled || persistentCountdownEnabled)) {
                    // Final 60s: update every 1s smoothly (60 -> 59 -> ... -> 1 -> 0) aligned to whole-second boundaries.
                    long modMs = remainingMs % 1000L;
                    long nextWake = (modMs >= 140L) ? modMs + 25L : (modMs + 1025L);
                    nextWake = Math.min(nextWake, remainingMs + 40L);
                    handler.postDelayed(this, Math.max(250L, nextWake));
                } else if (remainingMs <= 0L) {
                    // Just reached 0: advance to next scheduled event
                    boolean advanced = advanceToNextScheduledEvent();
                    if (!advanced) {
                        handler.postDelayed(this, 60_000L);
                    }
                }
            }
        }
    };

    private final Runnable cloudSignalPollRunnable = new Runnable() {
        @Override
        public void run() {
            if (isDestroyed) return;
            boolean hasWs = activeWebSocket != null;
            boolean screenOn = true;
            try {
                android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null) screenOn = pm.isInteractive();
            } catch (Exception ignored) {
            }

            // When WebSocket push is active, avoid spamming Firestore REST (safety poll every 5m only).
            // When offline from WS, poll every 30s with screen on or 120s with screen off.
            if (!hasWs) {
                try {
                    CloudSignalClient.pollRemoteSignals(DayRhythmSyncService.this);
                } catch (Exception ignored) {
                }
            }
            long nextDelay = hasWs ? 300_000L : (screenOn ? 30_000L : 120_000L);
            handler.postDelayed(this, nextDelay);
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
                sent = ws.send("ping");
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
        pushLiveStatus(
                context,
                emoji,
                title,
                statusLabel,
                "general",
                targetEpochMs,
                liveAlertsEnabled,
                leadMinutes,
                false,
                true,
                persistentNotifEnabled,
                "",
                "",
                "",
                ""
        );
    }

    public static void pushLiveStatus(
            Context context,
            String emoji,
            String title,
            String statusLabel,
            String kind,
            long targetEpochMs,
            boolean liveAlertsEnabled,
            int leadMinutes,
            boolean liveAlertsAlwaysOn,
            boolean liveAlertsShowCharging,
            boolean persistentNotifEnabled,
            String description,
            String clockLabel,
            String nextUpSummary,
            String hydrationSummary
    ) {
        pushLiveStatus(
                context,
                emoji,
                title,
                statusLabel,
                kind,
                targetEpochMs,
                liveAlertsEnabled,
                leadMinutes,
                liveAlertsAlwaysOn,
                liveAlertsShowCharging,
                persistentNotifEnabled,
                description,
                clockLabel,
                nextUpSummary,
                hydrationSummary,
                "",
                "",
                "",
                "",
                "",
                0L,
                ""
        );
    }

    public static void pushLiveStatus(
            Context context,
            String emoji,
            String title,
            String statusLabel,
            String kind,
            long targetEpochMs,
            boolean liveAlertsEnabled,
            int leadMinutes,
            boolean liveAlertsAlwaysOn,
            boolean liveAlertsShowCharging,
            boolean persistentNotifEnabled,
            String description,
            String clockLabel,
            String nextUpSummary,
            String hydrationSummary,
            String scheduleEmoji,
            String scheduleTitle,
            String scheduleStatusLabel,
            String scheduleDescription,
            String scheduleClockLabel,
            long scheduleTargetEpochMs,
            String scheduleNextUpSummary
    ) {
        if (context == null) return;
        Intent intent = new Intent(context, DayRhythmSyncService.class);
        intent.setAction(ACTION_UPDATE_LIVE_STATUS);
        intent.putExtra(EXTRA_LIVE_EMOJI, emoji != null ? emoji : "📅");
        intent.putExtra(EXTRA_LIVE_TITLE, title != null ? title : "");
        intent.putExtra(EXTRA_LIVE_STATUS_LABEL, statusLabel != null ? statusLabel : "المهمة القادمة");
        intent.putExtra(EXTRA_LIVE_KIND, kind != null && !kind.isEmpty() ? kind : "general");
        intent.putExtra(EXTRA_LIVE_TARGET_MS, targetEpochMs);
        intent.putExtra(EXTRA_LIVE_ALERTS_ENABLED, liveAlertsEnabled);
        intent.putExtra(EXTRA_LIVE_LEAD_MINUTES, leadMinutes);
        intent.putExtra(EXTRA_LIVE_ALWAYS_ON, liveAlertsAlwaysOn);
        intent.putExtra(EXTRA_LIVE_SHOW_CHARGING, liveAlertsShowCharging);
        intent.putExtra(EXTRA_PERSISTENT_NOTIF_ENABLED, persistentNotifEnabled);
        intent.putExtra(EXTRA_LIVE_DESC, description != null ? description : "");
        intent.putExtra(EXTRA_LIVE_CLOCK_LABEL, clockLabel != null ? clockLabel : "");
        intent.putExtra(EXTRA_LIVE_NEXT_UP, nextUpSummary != null ? nextUpSummary : "");
        intent.putExtra(EXTRA_LIVE_HYDRATION, hydrationSummary != null ? hydrationSummary : "");
        intent.putExtra(EXTRA_SCHED_EMOJI, scheduleEmoji != null ? scheduleEmoji : "");
        intent.putExtra(EXTRA_SCHED_TITLE, scheduleTitle != null ? scheduleTitle : "");
        intent.putExtra(EXTRA_SCHED_STATUS_LABEL, scheduleStatusLabel != null ? scheduleStatusLabel : "");
        intent.putExtra(EXTRA_SCHED_DESC, scheduleDescription != null ? scheduleDescription : "");
        intent.putExtra(EXTRA_SCHED_CLOCK_LABEL, scheduleClockLabel != null ? scheduleClockLabel : "");
        intent.putExtra(EXTRA_SCHED_TARGET_MS, scheduleTargetEpochMs);
        intent.putExtra(EXTRA_SCHED_NEXT_UP, scheduleNextUpSummary != null ? scheduleNextUpSummary : "");
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception ignored) {
        }
    }

    public static void reconnectWebSocketIfNeeded(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent(context, DayRhythmSyncService.class);
            intent.setAction(ACTION_RECONNECT_WS);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception ignored) {
        }
    }

    public static void sendSpircDismiss(Context context, String action, String alertId) {
        DayRhythmSyncService svc = instance;
        if (svc == null) return;
        WebSocket ws = svc.activeWebSocket;
        if (ws == null) return;
        try {
            long now = System.currentTimeMillis();
            long seq = svc.nextLamportSeq(now);
            String opId = "mob_dism_" + Long.toString(now, 36);
            JSONObject body = new JSONObject();
            body.put("action", (action != null && !action.isEmpty()) ? action : "native_dismiss");
            body.put("alertId", (alertId != null && !alertId.isEmpty()) ? alertId : "all");
            body.put("clientId", CloudSignalClient.CLIENT_ID);
            body.put("dismissedBy", CloudSignalClient.CLIENT_ID);
            body.put("timestampMs", now);
            byte[] frameBytes = SpircWireCodec.encodeFrame(
                    SpircWireCodec.ACTION_DISMISS_ALARM,
                    SpircWireCodec.ENTITY_ALARM,
                    "alarm_dismiss",
                    CloudSignalClient.CLIENT_ID,
                    opId,
                    seq,
                    now,
                    false,
                    body.toString().getBytes(StandardCharsets.UTF_8)
            );
            ws.send(ByteString.of(frameBytes));
        } catch (Exception ignored) {
        }
    }

    public static void sendSpircTrigger(Context context, String title, String bodyText, String kind, int snoozeMinutes, long startedAtMs) {
        DayRhythmSyncService svc = instance;
        if (svc == null) return;
        WebSocket ws = svc.activeWebSocket;
        if (ws == null) return;
        try {
            long now = startedAtMs > 0L ? startedAtMs : System.currentTimeMillis();
            long seq = svc.nextLamportSeq(now);
            String opId = "mob_trig_" + Long.toString(now, 36);
            JSONObject payload = new JSONObject();
            payload.put("scope", "alarm_trigger");
            payload.put("action", "trigger");
            payload.put("title", title != null ? title : "تنبيه إيقاع اليوم");
            payload.put("body", bodyText != null ? bodyText : "");
            payload.put("kind", kind != null ? kind : "general");
            payload.put("snoozeMinutes", snoozeMinutes);
            payload.put("startedAtMs", now);
            payload.put("clientId", CloudSignalClient.CLIENT_ID);
            byte[] frameBytes = SpircWireCodec.encodeFrame(
                    SpircWireCodec.ACTION_UPSERT,
                    SpircWireCodec.ENTITY_ALARM,
                    "alarm_trigger",
                    CloudSignalClient.CLIENT_ID,
                    opId,
                    seq,
                    now,
                    false,
                    payload.toString().getBytes(StandardCharsets.UTF_8)
            );
            ws.send(ByteString.of(frameBytes));
        } catch (Exception ignored) {
        }
    }

    private synchronized long nextLamportSeq(long nowMs) {
        spircLamportSeq = Math.max(spircLamportSeq + 1L, nowMs);
        return spircLamportSeq;
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

    private static boolean isScheduleKind(String kind) {
        return "prayer".equals(kind) || "event".equals(kind) || "calendar".equals(kind);
    }

    public synchronized boolean advanceToNextScheduledEvent() {
        try {
            SharedPreferences prefs = getSharedPreferences(ReminderAlarmReceiver.PREFS_ALARMS, MODE_PRIVATE);
            String scheduleJson = prefs.getString(ReminderAlarmReceiver.KEY_CACHED_SCHEDULE, "");
            if (scheduleJson == null || scheduleJson.isEmpty()) return false;

            JSONArray arr = new JSONArray(scheduleJson);
            long nowMs = System.currentTimeMillis();
            JSONObject nextItem = null;
            JSONObject afterItem = null;
            JSONObject nextSchedItem = null;
            JSONObject afterSchedItem = null;

            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item == null) continue;
                long triggerAtMs = item.optLong("triggerAtMs", 0L);
                if (triggerAtMs > nowMs + 1000L) {
                    if (nextItem == null) {
                        nextItem = item;
                    } else if (afterItem == null) {
                        afterItem = item;
                    }
                    String k = item.optString("kind", "general");
                    if (isScheduleKind(k)) {
                        if (nextSchedItem == null) {
                            nextSchedItem = item;
                        } else if (afterSchedItem == null) {
                            afterSchedItem = item;
                        }
                    }
                }
            }

            if (nextSchedItem != null) {
                schedTargetEpochMs = nextSchedItem.optLong("triggerAtMs", 0L);
                String sRawTitle = nextSchedItem.optString("title", "موعد قادم");
                String sKind = nextSchedItem.optString("kind", "event");
                String sBody = nextSchedItem.optString("body", "");
                schedEmoji = sanitizeEmojis(extractEmoji(sRawTitle, sKind), 1);
                if (schedEmoji.isEmpty()) schedEmoji = "📅";
                schedTitle = sanitizeEmojis(cleanEmojiPrefix(sRawTitle), 2);
                schedStatusLabel = sanitizeEmojis(getStatusLabelForKind(sKind, sBody), 2);
                schedDescription = sanitizeEmojis(sBody != null ? sBody.trim() : "", 2);
                schedClockLabel = new SimpleDateFormat("hh:mm a", new Locale("ar")).format(new Date(schedTargetEpochMs));
                if (afterSchedItem != null) {
                    long st2 = afterSchedItem.optLong("triggerAtMs", 0L);
                    String stitle2 = afterSchedItem.optString("title", "").trim();
                    String sclock2 = st2 > 0L ? new SimpleDateFormat("hh:mm a", new Locale("ar")).format(new Date(st2)) : "";
                    schedNextUpSummary = sanitizeEmojis(!stitle2.isEmpty() ? (stitle2 + (sclock2.isEmpty() ? "" : " (" + sclock2 + ")")) : "", 2);
                } else {
                    schedNextUpSummary = "";
                }
            } else {
                schedTargetEpochMs = 0L;
                schedEmoji = "📅";
                schedTitle = "";
                schedStatusLabel = "لا مواعيد مجدولة متبقية";
                schedDescription = "";
                schedClockLabel = "";
                schedNextUpSummary = "";
            }

            if (nextItem != null) {
                liveTargetEpochMs = nextItem.optLong("triggerAtMs", 0L);
                String rawTitle = nextItem.optString("title", "المهمة القادمة");
                String kind = nextItem.optString("kind", "general");
                String body = nextItem.optString("body", "");

                liveKind = kind;
                liveEmoji = sanitizeEmojis(extractEmoji(rawTitle, kind), 1);
                if (liveEmoji.isEmpty()) liveEmoji = "📅";
                liveTitle = sanitizeEmojis(cleanEmojiPrefix(rawTitle), 2);
                liveStatusLabel = sanitizeEmojis(getStatusLabelForKind(kind, body), 2);
                liveDescription = sanitizeEmojis(body != null ? body.trim() : "", 2);
                liveClockLabel = new SimpleDateFormat("hh:mm a", new Locale("ar")).format(new Date(liveTargetEpochMs));
                if (afterItem != null) {
                    long t2 = afterItem.optLong("triggerAtMs", 0L);
                    String title2 = afterItem.optString("title", "").trim();
                    String clock2 = t2 > 0L ? new SimpleDateFormat("hh:mm a", new Locale("ar")).format(new Date(t2)) : "";
                    liveNextUpSummary = sanitizeEmojis(!title2.isEmpty() ? (title2 + (clock2.isEmpty() ? "" : " (" + clock2 + ")")) : "", 2);
                } else {
                    liveNextUpSummary = "";
                }
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
                liveDescription = "";
                liveClockLabel = "";
                liveNextUpSummary = "";
                persistLiveState();
                refreshPersistentNotification();
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private void startForegroundCompat(Notification notif) {
        lastNotifStateKey = computeNotifStateKey();
        lastNotifPostMs = System.currentTimeMillis();
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
            liveAlertsAlwaysOn = sp.getBoolean(EXTRA_LIVE_ALWAYS_ON, false);
            liveAlertsShowCharging = sp.getBoolean(EXTRA_LIVE_SHOW_CHARGING, true);
            persistentCountdownEnabled = sp.getBoolean(EXTRA_PERSISTENT_NOTIF_ENABLED, true);
            liveDescription = sp.getString(EXTRA_LIVE_DESC, "");
            liveClockLabel = sp.getString(EXTRA_LIVE_CLOCK_LABEL, "");
            liveNextUpSummary = sp.getString(EXTRA_LIVE_NEXT_UP, "");
            liveHydrationSummary = sp.getString(EXTRA_LIVE_HYDRATION, "");
            schedEmoji = sp.getString(EXTRA_SCHED_EMOJI, "📅");
            schedTitle = sp.getString(EXTRA_SCHED_TITLE, "");
            schedStatusLabel = sp.getString(EXTRA_SCHED_STATUS_LABEL, "لا مواعيد مجدولة متبقية");
            schedDescription = sp.getString(EXTRA_SCHED_DESC, "");
            schedClockLabel = sp.getString(EXTRA_SCHED_CLOCK_LABEL, "");
            schedTargetEpochMs = sp.getLong(EXTRA_SCHED_TARGET_MS, 0L);
            schedNextUpSummary = sp.getString(EXTRA_SCHED_NEXT_UP, "");
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
                    .putBoolean(EXTRA_LIVE_ALWAYS_ON, liveAlertsAlwaysOn)
                    .putBoolean(EXTRA_LIVE_SHOW_CHARGING, liveAlertsShowCharging)
                    .putBoolean(EXTRA_PERSISTENT_NOTIF_ENABLED, persistentCountdownEnabled)
                    .putString(EXTRA_LIVE_DESC, liveDescription)
                    .putString(EXTRA_LIVE_CLOCK_LABEL, liveClockLabel)
                    .putString(EXTRA_LIVE_NEXT_UP, liveNextUpSummary)
                    .putString(EXTRA_LIVE_HYDRATION, liveHydrationSummary)
                    .putString(EXTRA_SCHED_EMOJI, schedEmoji)
                    .putString(EXTRA_SCHED_TITLE, schedTitle)
                    .putString(EXTRA_SCHED_STATUS_LABEL, schedStatusLabel)
                    .putString(EXTRA_SCHED_DESC, schedDescription)
                    .putString(EXTRA_SCHED_CLOCK_LABEL, schedClockLabel)
                    .putLong(EXTRA_SCHED_TARGET_MS, schedTargetEpochMs)
                    .putString(EXTRA_SCHED_NEXT_UP, schedNextUpSummary)
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
        cancelLiveAlertCapsule();
        UpdateCheckWorker.schedulePeriodicCheck(this);

        wsClient = new OkHttpClient.Builder()
                .pingInterval(25, TimeUnit.SECONDS)
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .retryOnConnectionFailure(true)
                .build();

        registerNetworkRecoveryCallback();
        registerChargeLimitWatcher();
        handler.postDelayed(cloudSignalPollRunnable, 3000L);
    }

    // ── Charge-limit alert & Live Battery LAN Sync (works with the app closed) ─────
    // Keeping a Li-ion battery at 100% on the charger shortens its life, so ring once per
    // charging session when the level reaches the user's limit (default 90%).
    // Instantly silences the alarm on both phone and PC when the charger is unplugged!
    public static final String PREFS_CHARGE = "dayrhythm_charge_limit_prefs";
    public static final String KEY_CHARGE_LIMIT = "charge_limit_pct";
    public static final String KEY_CHARGE_ALERT_ENABLED = "charge_alert_enabled";
    private static final long CHARGE_LOOP_CYCLE_MS = 6L * 60_000L; // 1m ring + 5m wait
    private BroadcastReceiver chargeLimitReceiver;
    private boolean chargeAlertFiredThisSession = false;
    private long chargeSessionStartMs = 0L;
    private int chargeSessionStartLevel = -1;
    private int lastBroadcastBatteryLevel = -1;
    private boolean lastBroadcastCharging = false;
    private int lastBroadcastEtaMinutes = -1;
    private int lastBroadcastLimit = 90;

    private final Runnable chargeLoopRunnable = new Runnable() {
        @Override
        public void run() {
            if (isDestroyed || !chargeAlertFiredThisSession) return;
            try {
                Intent sticky = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (sticky == null) return;
                int level = sticky.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = sticky.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
                int status = sticky.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                int plugged = sticky.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
                boolean charging = plugged != 0 && (status == BatteryManager.BATTERY_STATUS_CHARGING
                        || status == BatteryManager.BATTERY_STATUS_FULL);
                int pct = (level >= 0 && scale > 0) ? Math.round(level * 100f / scale) : lastBroadcastBatteryLevel;
                SharedPreferences sp = getSharedPreferences(PREFS_CHARGE, MODE_PRIVATE);
                int limit = sp.getInt(KEY_CHARGE_LIMIT, 90);
                boolean enabled = sp.getBoolean(KEY_CHARGE_ALERT_ENABLED, true);

                if (charging && enabled && pct >= limit) {
                    ReminderAlarmReceiver.triggerImmediateNativeAlarm(
                            DayRhythmSyncService.this,
                            "🔋 الشحن وصل " + pct + "%",
                            "افصل الشاحن لحماية البطارية",
                            "charge",
                            true,
                            5
                    );
                    handler.postDelayed(this, CHARGE_LOOP_CYCLE_MS);
                } else if (!charging) {
                    chargeAlertFiredThisSession = false;
                }
            } catch (Exception ignored) {
            }
        }
    };

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
                    handler.removeCallbacks(chargeLoopRunnable);
                    chargeSessionStartMs = 0L;
                    chargeSessionStartLevel = -1;
                    if (chargeAlertFiredThisSession) {
                        chargeAlertFiredThisSession = false; // re-arm for next charge
                        // Instantly silence phone and close lockscreen alarm card!
                        ReminderAlarmReceiver.cancelAllActiveAlarms(DayRhythmSyncService.this);
                        // Instantly notify PC to silence smart charge alert and close popup!
                        CloudSignalClient.sendAlarmDismiss(DayRhythmSyncService.this, "unplugged");
                    }
                    if (lastBroadcastCharging || lastBroadcastBatteryLevel != pct) {
                        lastBroadcastCharging = false;
                        lastBroadcastBatteryLevel = pct;
                        lastBroadcastEtaMinutes = -1;
                        broadcastBatteryTelemetry(pct, false, 0, limit);
                        refreshPersistentNotification();
                    }
                    return;
                }

                // 2. When charging: only recompute & notify when %, charging state, or limit actually changed
                if (pct == lastBroadcastBatteryLevel && lastBroadcastCharging && limit == lastBroadcastLimit) {
                    return;
                }

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
                lastBroadcastBatteryLevel = pct;
                lastBroadcastCharging = true;

                // 3. Broadcast live battery telemetry to PC and refresh charging capsule
                broadcastBatteryTelemetry(pct, true, etaMinutes, limit);
                refreshPersistentNotification();

                // 4. Trigger alert when reaching limit (default 90%) — 1m ring / 5m wait loop until unplugged
                if (enabled && pct >= limit && !chargeAlertFiredThisSession) {
                    chargeAlertFiredThisSession = true;
                    handler.removeCallbacks(chargeLoopRunnable);
                    ReminderAlarmReceiver.triggerImmediateNativeAlarm(
                            DayRhythmSyncService.this,
                            "🔋 الشحن وصل " + pct + "%",
                            "افصل الشاحن لحماية البطارية",
                            "charge",
                            true,
                            5
                    );
                    handler.postDelayed(chargeLoopRunnable, CHARGE_LOOP_CYCLE_MS);
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

            // Publish to Firestore REST so PC gets live telemetry even with app closed & screen off
            CloudSignalClient.publishBatteryTelemetry(this, level, charging, etaMinutes, limit);

            // Push low-latency binary Spirc frame if WebSocket is connected
            WebSocket ws = activeWebSocket;
            if (ws != null) {
                try {
                    long now = System.currentTimeMillis();
                    byte[] batFrame = SpircWireCodec.encodeFrame(
                            SpircWireCodec.ACTION_BATTERY_TELEMETRY,
                            SpircWireCodec.ENTITY_STATE_V3,
                            "phone_battery",
                            CloudSignalClient.CLIENT_ID,
                            "bat_" + Long.toString(now, 36),
                            nextLamportSeq(now),
                            now,
                            false,
                            packet.toString().getBytes(StandardCharsets.UTF_8)
                    );
                    ws.send(ByteString.of(batFrame));
                } catch (Exception ignored) {
                }
            }

            // Broadcast internal intent for local web view
            Intent syncIntent = new Intent(ACTION_WS_SYNC_MESSAGE);
            syncIntent.setPackage(getPackageName());
            syncIntent.putExtra(EXTRA_WS_PAYLOAD, packet.toString());
            sendBroadcast(syncIntent);
        } catch (Exception ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_REFRESH_NOTIF.equals(intent.getAction())) {
            startForegroundCompat(buildPersistentNotification());
            return START_STICKY;
        }

        if (intent != null && ACTION_RECONNECT_WS.equals(intent.getAction())) {
            String targetUrl = resolveSyncWsUrl();
            if (activeWebSocket == null || !targetUrl.equals(connectedWsUrl)) {
                connectBackgroundWebSocket();
            }
            return START_STICKY;
        }

        if (intent != null && (ACTION_SCHEDULE_UPDATED.equals(intent.getAction()) || ACTION_ADVANCE_SCHEDULE.equals(intent.getAction()))) {
            advanceToNextScheduledEvent();
            return START_STICKY;
        }

        if (intent != null && ACTION_UPDATE_LIVE_STATUS.equals(intent.getAction())) {
            liveEmoji = sanitizeEmojis(intent.getStringExtra(EXTRA_LIVE_EMOJI), 1);
            if (liveEmoji.isEmpty()) liveEmoji = "📅";
            String rawLiveTitle = intent.getStringExtra(EXTRA_LIVE_TITLE);
            liveTitle = rawLiveTitle != null ? sanitizeEmojis(rawLiveTitle, 2) : "";
            String rawLiveStatus = intent.getStringExtra(EXTRA_LIVE_STATUS_LABEL);
            liveStatusLabel = (rawLiveStatus != null && !rawLiveStatus.trim().isEmpty())
                    ? sanitizeEmojis(rawLiveStatus, 2)
                    : "المهمة القادمة";
            String incomingKind = intent.getStringExtra(EXTRA_LIVE_KIND);
            if (incomingKind != null && !incomingKind.trim().isEmpty()) {
                liveKind = incomingKind.trim();
            }
            liveTargetEpochMs = intent.getLongExtra(EXTRA_LIVE_TARGET_MS, 0L);
            liveAlertsEnabled = intent.getBooleanExtra(EXTRA_LIVE_ALERTS_ENABLED, true);
            liveAlertsLeadMinutes = Math.max(1, Math.min(60, intent.getIntExtra(EXTRA_LIVE_LEAD_MINUTES, 10)));
            liveAlertsAlwaysOn = intent.getBooleanExtra(EXTRA_LIVE_ALWAYS_ON, false);
            liveAlertsShowCharging = intent.getBooleanExtra(EXTRA_LIVE_SHOW_CHARGING, true);
            persistentCountdownEnabled = intent.getBooleanExtra(EXTRA_PERSISTENT_NOTIF_ENABLED, true);
            String desc = intent.getStringExtra(EXTRA_LIVE_DESC);
            liveDescription = desc != null ? sanitizeEmojis(desc.trim(), 2) : "";
            String clock = intent.getStringExtra(EXTRA_LIVE_CLOCK_LABEL);
            liveClockLabel = clock != null ? clock.trim() : "";
            String nextUp = intent.getStringExtra(EXTRA_LIVE_NEXT_UP);
            liveNextUpSummary = nextUp != null ? sanitizeEmojis(nextUp.trim(), 2) : "";
            liveHydrationSummary = "";

            String sEmoji = sanitizeEmojis(intent.getStringExtra(EXTRA_SCHED_EMOJI), 1);
            schedEmoji = sEmoji.isEmpty() ? "📅" : sEmoji;
            String sTitle = intent.getStringExtra(EXTRA_SCHED_TITLE);
            schedTitle = sTitle != null ? sanitizeEmojis(sTitle.trim(), 2) : "";
            String sStatus = intent.getStringExtra(EXTRA_SCHED_STATUS_LABEL);
            schedStatusLabel = (sStatus != null && !sStatus.trim().isEmpty())
                    ? sanitizeEmojis(sStatus.trim(), 2)
                    : "لا مواعيد مجدولة متبقية";
            String sDesc = intent.getStringExtra(EXTRA_SCHED_DESC);
            schedDescription = sDesc != null ? sanitizeEmojis(sDesc.trim(), 2) : "";
            String sClock = intent.getStringExtra(EXTRA_SCHED_CLOCK_LABEL);
            schedClockLabel = sClock != null ? sClock.trim() : "";
            schedTargetEpochMs = intent.getLongExtra(EXTRA_SCHED_TARGET_MS, 0L);
            String sNextUp = intent.getStringExtra(EXTRA_SCHED_NEXT_UP);
            schedNextUpSummary = sNextUp != null ? sanitizeEmojis(sNextUp.trim(), 2) : "";

            if (liveTargetEpochMs <= System.currentTimeMillis() + 1000L && !"none".equals(liveKind) && !"done".equals(liveKind)) {
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
        handler.removeCallbacks(cloudSignalPollRunnable);
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
                        connectBackgroundWebSocket();
                        handler.removeCallbacks(cloudSignalPollRunnable);
                        handler.post(cloudSignalPollRunnable);
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
        connectedWsUrl = "";
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
        String uid = CloudSignalClient.getSavedUid(this);
        String base = saved != null ? saved.trim() : "";
        if (base.isEmpty() || (!base.startsWith("ws://") && !base.startsWith("wss://"))) {
            if (uid != null && !uid.isEmpty()) {
                return DEFAULT_SPIRC_BROKER_WSS + "/ws?uid=" + Uri.encode(uid);
            }
            return "";
        }
        if (uid != null && !uid.isEmpty() && !base.contains("uid=")) {
            return base + (base.contains("?") ? "&" : "?") + "uid=" + Uri.encode(uid);
        }
        return base;
    }

    private void connectBackgroundWebSocket() {
        if (isDestroyed || wsClient == null) return;
        String wsUrl = resolveSyncWsUrl();
        if (wsUrl.isEmpty() || (!wsUrl.startsWith("ws://") && !wsUrl.startsWith("wss://"))) {
            syncSubtitle = "مزامنة سحابية نشطة 24/7";
            refreshPersistentNotification();
            return;
        }

        clearWsTimers();
        teardownActiveWebSocket("replace_stale_socket");
        connectedWsUrl = wsUrl;

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
            public void onMessage(@NonNull WebSocket webSocket, @NonNull ByteString bytes) {
                byte[] raw = bytes.toByteArray();
                SpircWireCodec.SpircFrame frame = SpircWireCodec.decodeFrame(raw);
                handler.post(() -> {
                    if (isDestroyed || activeWebSocket != webSocket) return;
                    handler.removeCallbacks(pongWatchdogRunnable);
                    if (CloudSignalClient.CLIENT_ID.equals(frame.clientId)) return;
                    if (frame.lamportSeq > spircLamportSeq) {
                        spircLamportSeq = frame.lamportSeq;
                    }

                    if (frame.action == SpircWireCodec.ACTION_DISMISS_ALARM) {
                        long dTs = frame.timestampMs > 0L ? frame.timestampMs : System.currentTimeMillis();
                        CloudSignalClient.markRemoteDismissReceived(dTs);
                        ReminderAlarmReceiver.cancelAllActiveAlarms(DayRhythmSyncService.this);
                        if (MainActivity.activeInstance != null) {
                            MainActivity.activeInstance.evaluateJavascriptInWebView(
                                    "window.dispatchEvent(new CustomEvent('dayrhythm:alert-dismissed', { detail: { remote: true } }));"
                            );
                        }
                        return;
                    }

                    if (frame.action == SpircWireCodec.ACTION_UPSERT && frame.entityKind == SpircWireCodec.ENTITY_ALARM) {
                        try {
                            String jsonText = frame.payloadAsUtf8();
                            if (jsonText.isEmpty()) return;
                            JSONObject json = new JSONObject(jsonText);
                            String title = json.optString("title", "تنبيه إيقاع اليوم");
                            String body = json.optString("body", "");
                            String kind = json.optString("kind", "general");
                            int snoozeMin = json.optInt("snoozeMinutes", 5);
                            long nowMs = System.currentTimeMillis();
                            long startedAtMs = frame.timestampMs > 0L ? frame.timestampMs : json.optLong("startedAtMs", nowMs);
                            if (Math.abs(nowMs - startedAtMs) > 300_000L) return;

                            boolean bypassSanctuary = json.optBoolean("bypassSanctuary", false)
                                    || "test_ring".equals(json.optString("action", ""));
                            if (MainActivity.isInForeground && MainActivity.activeInstance != null && !MainActivity.activeInstance.isFinishing()) {
                                JSONObject detail = new JSONObject()
                                        .put("title", title)
                                        .put("body", body)
                                        .put("kind", kind)
                                        .put("bypassSanctuary", bypassSanctuary);
                                MainActivity.activeInstance.evaluateJavascriptInWebView(
                                        "window.dispatchEvent(new CustomEvent('dayrhythm:cloud-alert-trigger', { detail: " + detail.toString() + " }));"
                                );
                            } else {
                                ReminderAlarmReceiver.triggerImmediateNativeAlarm(
                                        DayRhythmSyncService.this,
                                        title,
                                        body,
                                        kind,
                                        true,
                                        snoozeMin
                                );
                            }
                        } catch (Exception ignored) {
                        }
                    }
                });
            }

            @Override
            public void onMessage(@NonNull WebSocket webSocket, @NonNull String text) {
                handler.post(() -> {
                    if (isDestroyed || activeWebSocket != webSocket) return;
                    handler.removeCallbacks(pongWatchdogRunnable);
                    String trimmed = text.trim();
                    if ("pong".equals(trimmed) || trimmed.contains("\"pong\"")) return;

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
                            CloudSignalClient.markRemoteDismissReceived(System.currentTimeMillis());
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

    private String computeNotifStateKey() {
        long nowMs = System.currentTimeMillis();
        long remainingMs = liveTargetEpochMs - nowMs;
        boolean hasUpcoming = liveTargetEpochMs > nowMs + 1000L;
        long bucketSec = 0L;
        if (hasUpcoming) {
            bucketSec = (remainingMs <= 60_000L)
                    ? ((remainingMs + 999L) / 1000L)
                    : (1000L + ((remainingMs + 59_999L) / 60_000L));
        }
        long schedRemainingMs = schedTargetEpochMs - nowMs;
        long schedBucketSec = (schedTargetEpochMs > nowMs + 1000L)
                ? ((schedRemainingMs <= 60_000L)
                ? ((schedRemainingMs + 999L) / 1000L)
                : (1000L + ((schedRemainingMs + 59_999L) / 60_000L)))
                : 0L;
        return bucketSec + "|" + schedBucketSec + "|" + liveEmoji + "|" + liveTitle + "|" + liveStatusLabel + "|" + liveKind
                + "|" + liveTargetEpochMs + "|" + liveAlertsEnabled + "|" + liveAlertsLeadMinutes
                + "|" + liveAlertsAlwaysOn + "|" + liveAlertsShowCharging + "|" + liveDescription
                + "|" + liveClockLabel + "|" + liveNextUpSummary
                + "|" + schedEmoji + "|" + schedTitle + "|" + schedStatusLabel + "|" + schedDescription
                + "|" + schedClockLabel + "|" + schedTargetEpochMs + "|" + schedNextUpSummary
                + "|" + persistentCountdownEnabled + "|" + lastBroadcastCharging + "|" + lastBroadcastBatteryLevel
                + "|" + lastBroadcastLimit + "|" + lastBroadcastEtaMinutes + "|" + syncSubtitle;
    }

    private void refreshPersistentNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        long nowMs = System.currentTimeMillis();
        String nextKey = computeNotifStateKey();
        if (nextKey.equals(lastNotifStateKey) && nowMs - lastNotifPostMs < 55_000L) {
            return;
        }
        try {
            Notification notif = buildPersistentNotification();
            lastNotifStateKey = nextKey;
            lastNotifPostMs = nowMs;
            nm.notify(NOTIF_KEEPALIVE_ID, notif);
        } catch (SecurityException ignored) {
        }
    }

    private static String formatRemainingDetailedAr(long remainingMs) {
        if (remainingMs <= 0L) return "0 ثانية";
        long totalSec = (remainingMs + 999L) / 1000L;
        if (totalSec <= 60L) {
            return totalSec + " ثانية";
        }
        long mins = (remainingMs + 59_999L) / 60_000L;
        if (mins < 60L) {
            return mins + " دقيقة";
        }
        long hrs = mins / 60L;
        long remM = mins % 60L;
        if (remM > 0L) {
            return hrs + " س و " + remM + " د";
        }
        return hrs + " ساعة";
    }

    private static void applyPlatformLiveAlertFlags(
            Notification.Builder nb,
            Bundle extras,
            boolean shouldPromote,
            String shortPillText,
            int accentColor
    ) {
        if (shouldPromote) {
            String safeChip = shortPillText != null ? shortPillText.trim() : "";
            extras.putBoolean("android.requestPromotedOngoing", true);
            extras.putBoolean("android.promotedOngoing", true);
            extras.putBoolean("oplus.live_alert.enable", true);
            extras.putBoolean("oplus.livealert.enable", true);
            extras.putInt("oplus.live_alert_state", 1);
            extras.putInt("oplus.live_alert.color", accentColor);
            extras.putInt("oplus.live_alert.bg_color", accentColor);
            extras.putInt("oplus.live_alert.accent_color", accentColor);
            if (!safeChip.isEmpty()) {
                extras.putString("android.shortCriticalText", safeChip);
                extras.putCharSequence("android.shortCriticalText", safeChip);
                extras.putString("oplus.live_alert.text", safeChip);
                extras.putString("oplus.live_alert.title", safeChip);
            }
            try {
                Method mReq = Notification.Builder.class.getMethod("setRequestPromotedOngoing", boolean.class);
                mReq.invoke(nb, true);
            } catch (Throwable ignored) {
            }
            if (!safeChip.isEmpty()) {
                try {
                    Method mShort = Notification.Builder.class.getMethod("setShortCriticalText", CharSequence.class);
                    mShort.invoke(nb, safeChip);
                } catch (Throwable ignored) {
                }
            }
        } else {
            extras.putBoolean("android.requestPromotedOngoing", false);
            extras.putBoolean("oplus.live_alert.enable", false);
            extras.putBoolean("oplus.livealert.enable", false);
            try {
                Method mReq = Notification.Builder.class.getMethod("setRequestPromotedOngoing", boolean.class);
                mReq.invoke(nb, false);
            } catch (Throwable ignored) {
            }
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

        boolean hasUpcoming = liveTargetEpochMs > nowMs + 1000L;
        long leadWindowMs = getEffectiveLeadWindowMs();
        boolean inLeadWindow = liveAlertsEnabled && hasUpcoming && (
                liveAlertsAlwaysOn ||
                (explicitTagSec != null ? remainingMs <= explicitTagSec * 1000L : remainingMs <= leadWindowMs)
        );
        boolean isChargingNow = lastBroadcastCharging && lastBroadcastBatteryLevel >= 0;
        boolean chargePromote = liveAlertsEnabled && liveAlertsShowCharging && isChargingNow;

        int smallIcon = getSmallIconForKind(
                (!inLeadWindow && chargePromote) ? "charge" : liveKind
        );

        // Android 16 / OxygenOS 16 Promoted Ongoing requires platform Notification.Builder,
        // eligible style (BigTextStyle), setOngoing(true), setContentTitle, NO setColorized(true), NO RemoteViews.
        Notification.Builder builder = new Notification.Builder(this, CHANNEL_LIVE_ALERTS)
                .setSmallIcon(smallIcon)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(pi);

        Bundle liveExtras = new Bundle();
        String chargeTag = "";
        if (isChargingNow) {
            String etaStr = lastBroadcastEtaMinutes > 0
                    ? (lastBroadcastEtaMinutes + "د")
                    : (lastBroadcastBatteryLevel >= lastBroadcastLimit ? "افصل الشاحن" : "يشحن");
            chargeTag = "⚡ " + lastBroadcastBatteryLevel + "% · " + etaStr;
        }

        String capsuleEmoji = sanitizeEmojis(liveEmoji, 1);
        if (capsuleEmoji.isEmpty()) capsuleEmoji = "📅";
        int accentColor = resolveEmojiAccentColor(capsuleEmoji);

        if (hasUpcoming && inLeadWindow) {
            String compactPill = formatChipText(capsuleEmoji, remainingMs);
            applyPlatformLiveAlertFlags(builder, liveExtras, true, compactPill, accentColor);
        } else if (chargePromote) {
            String chargeEmoji = lastBroadcastBatteryLevel >= lastBroadcastLimit ? "🔋" : "⚡";
            int chargeColor = resolveEmojiAccentColor(chargeEmoji);
            String compactPill = "\u200F" + chargeEmoji + " " + lastBroadcastBatteryLevel + "%";
            applyPlatformLiveAlertFlags(builder, liveExtras, true, compactPill, chargeColor);
            if (!hasUpcoming) accentColor = chargeColor;
        } else {
            applyPlatformLiveAlertFlags(builder, liveExtras, false, "", accentColor);
        }

        // Persistent Notification Body (Schedule ONLY: Calendar events, Prayers, Sunrise/Sunset/Sunlight)
        boolean hasUpcomingSchedule = schedTargetEpochMs > nowMs + 1000L;
        if (hasUpcomingSchedule && persistentCountdownEnabled) {
            long schedRemMs = schedTargetEpochMs - nowMs;
            String schedRemDetailed = formatRemainingDetailedAr(schedRemMs);
            String cleanSched = cleanDisplayTitle(schedTitle.isEmpty() ? schedStatusLabel : schedTitle);
            if (cleanSched.isEmpty()) cleanSched = schedTitle.isEmpty() ? schedStatusLabel : schedTitle;
            String safeSchedEmoji = sanitizeEmojis(schedEmoji, 1);
            String displaySchedTitle = sanitizeEmojis((safeSchedEmoji.isEmpty() ? "" : safeSchedEmoji + " ") + cleanSched, 2);
            String targetClock = !schedClockLabel.isEmpty()
                    ? schedClockLabel
                    : new SimpleDateFormat("hh:mm a", new Locale("ar")).format(new Date(schedTargetEpochMs));

            String titleLine = sanitizeEmojis(targetClock.isEmpty() ? displaySchedTitle : (displaySchedTitle + " · " + targetClock), 2);
            String safeDesc = sanitizeEmojis(schedDescription, 2);
            String compactSummaryLine = sanitizeEmojis(
                    "⏳ متبقي " + schedRemDetailed + (!safeDesc.isEmpty() ? (" · " + safeDesc) : ""),
                    2
            );
            String summaryPill = !targetClock.isEmpty() ? targetClock : sanitizeEmojis(schedStatusLabel, 2);

            StringBuilder bigSb = new StringBuilder();
            bigSb.append(!safeDesc.isEmpty() ? safeDesc : sanitizeEmojis(schedStatusLabel, 2));
            bigSb.append("\n");
            if (!targetClock.isEmpty()) {
                bigSb.append("🕒 ").append(targetClock).append(" · ");
            }
            bigSb.append("⏳ متبقي ").append(schedRemDetailed);
            if (!schedNextUpSummary.isEmpty()) {
                bigSb.append("\n⏭ ").append(sanitizeEmojis(schedNextUpSummary, 2));
            }
            String bigBody = sanitizeEmojis(bigSb.toString(), 2);

            boolean showSecChrono = (inLeadWindow ? remainingMs : schedRemMs) <= 60_000L;
            if (inLeadWindow && remainingMs <= 60_000L) {
                liveExtras.putBoolean("android.showChronometer", true);
                liveExtras.putBoolean("android.chronometerCountdown", true);
            }

            builder.setContentTitle(titleLine)
                    .setContentText(compactSummaryLine)
                    .setSubText(summaryPill)
                    .setShowWhen(true)
                    .setWhen(inLeadWindow ? liveTargetEpochMs : schedTargetEpochMs)
                    .setUsesChronometer(showSecChrono)
                    .setChronometerCountDown(showSecChrono)
                    .setColor(accentColor)
                    .setCategory(Notification.CATEGORY_EVENT)
                    .setStyle(new Notification.BigTextStyle()
                            .setBigContentTitle(titleLine)
                            .setSummaryText(summaryPill)
                            .bigText(bigBody))
                    .addExtras(liveExtras);
        } else if (chargePromote) {
            int chargeColor = lastBroadcastBatteryLevel >= lastBroadcastLimit ? 0xFF4ADE80 : accentColor;
            StringBuilder bigSb = new StringBuilder();
            if (lastBroadcastBatteryLevel >= lastBroadcastLimit) {
                bigSb.append("🔋 وصل للحد (").append(lastBroadcastLimit).append("%) — افصل الشاحن");
            } else if (lastBroadcastEtaMinutes > 0) {
                bigSb.append("⚡ ").append(lastBroadcastBatteryLevel).append("% من ").append(lastBroadcastLimit).append("% · متبقي ~").append(lastBroadcastEtaMinutes).append(" د");
            } else {
                bigSb.append("⚡ الشحن ").append(lastBroadcastBatteryLevel).append("% / ").append(lastBroadcastLimit).append("%");
            }
            String safeChargeTitle = sanitizeEmojis(chargeTag, 2);
            String shortSub = "حد الشحن " + lastBroadcastLimit + "%";

            builder.setContentTitle(safeChargeTitle)
                    .setContentText(shortSub)
                    .setSubText(lastBroadcastBatteryLevel + "%")
                    .setShowWhen(false)
                    .setUsesChronometer(false)
                    .setColor(chargeColor)
                    .setCategory(Notification.CATEGORY_PROGRESS)
                    .setStyle(new Notification.BigTextStyle()
                            .setBigContentTitle(safeChargeTitle)
                            .bigText(sanitizeEmojis(bigSb.toString(), 2)))
                    .addExtras(liveExtras);

            if (lastBroadcastBatteryLevel >= lastBroadcastLimit) {
                Intent dismissChargeIntent = new Intent(this, ReminderAlarmReceiver.class);
                dismissChargeIntent.setAction(ReminderAlarmReceiver.ACTION_DISMISS);
                dismissChargeIntent.putExtra(ReminderAlarmReceiver.EXTRA_NOTIF_ID, NOTIF_KEEPALIVE_ID);
                PendingIntent dismissPi = PendingIntent.getBroadcast(
                        this,
                        9105,
                        dismissChargeIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                builder.addAction(new Notification.Action.Builder(
                        android.graphics.drawable.Icon.createWithResource(this, R.drawable.ic_notif_charge),
                        "✓ فصلت الشاحن",
                        dismissPi
                ).build());
            }
        } else {
            String idleTitle = sanitizeEmojis("📅 جدول اليوم", 2);
            String idleBody = "لا مواعيد مجدولة متبقية";

            builder.setContentTitle(idleTitle)
                    .setContentText(idleBody)
                    .setShowWhen(false)
                    .setUsesChronometer(false)
                    .setColor(accentColor)
                    .setCategory(Notification.CATEGORY_STATUS)
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
