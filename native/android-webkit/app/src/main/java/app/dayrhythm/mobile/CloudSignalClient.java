package app.dayrhythm.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import okhttp3.FormBody;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Phone ↔ PC "alarm dismissed" signal that works even when the app's WebView isn't running.
 *
 * - When an alert is stopped/snoozed on the phone, write users/{uid}.syncSignal
 *   {scope: alarm_dismiss} to Firestore (the PC app listens and stops its alert instantly).
 * - While an alert rings on the phone, poll that field every 3 s (max 5 min) and stop the phone's
 *   alert as soon as the PC (or another device) dismisses it.
 *
 * Auth: the web app hands over the Firebase refresh token (DayRhythmNative.setCloudAuth); an ID token
 * is minted from it via securetoken.googleapis.com. Firestore rules already allow a syncSignal-only update.
 */
public final class CloudSignalClient {
    private static final String PREFS = "dayrhythm_cloud_auth_prefs";
    private static final String KEY_AUTH = "auth_json";
    public static final String CLIENT_ID = "android-native";
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    private static final OkHttpClient HTTP = new OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .build();
    private static final ScheduledExecutorService EXEC = Executors.newSingleThreadScheduledExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static volatile String idToken;
    private static volatile long idTokenExpiresAtMs;
    private static ScheduledFuture<?> watchFuture;
    private static ScheduledFuture<?> bgWatchFuture;
    private static volatile String lastHandledOpId = null;
    private static volatile long lastHandledTimestampMs = 0L;

    private CloudSignalClient() {
    }

    /** {apiKey, projectId, databaseId, uid, refreshToken} from the web app. */
    public static void saveAuth(Context context, String json) {
        try {
            new JSONObject(json); // validate
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_AUTH, json).apply();
            idToken = null;
        } catch (Exception ignored) {
        }
    }

    private static JSONObject readAuth(Context context) {
        try {
            String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_AUTH, null);
            if (raw == null) return null;
            JSONObject o = new JSONObject(raw);
            if (o.optString("refreshToken").isEmpty() || o.optString("uid").isEmpty()) return null;
            return o;
        } catch (Exception e) {
            return null;
        }
    }

    private static String getIdToken(Context context, JSONObject auth) throws Exception {
        if (idToken != null && System.currentTimeMillis() < idTokenExpiresAtMs - 60_000L) return idToken;
        RequestBody form = new FormBody.Builder()
                .add("grant_type", "refresh_token")
                .add("refresh_token", auth.getString("refreshToken"))
                .build();
        Request req = new Request.Builder()
                .url("https://securetoken.googleapis.com/v1/token?key=" + auth.getString("apiKey"))
                .post(form)
                .build();
        try (Response res = HTTP.newCall(req).execute()) {
            if (!res.isSuccessful() || res.body() == null) throw new IllegalStateException("token " + res.code());
            JSONObject j = new JSONObject(res.body().string());
            idToken = j.getString("id_token");
            idTokenExpiresAtMs = System.currentTimeMillis() + j.optLong("expires_in", 3600) * 1000L;
            String newRefresh = j.optString("refresh_token", "");
            if (!newRefresh.isEmpty() && !newRefresh.equals(auth.optString("refreshToken"))) {
                auth.put("refreshToken", newRefresh);
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_AUTH, auth.toString()).apply();
            }
            return idToken;
        }
    }

    private static String docName(JSONObject auth) throws Exception {
        return "projects/" + auth.getString("projectId")
                + "/databases/" + auth.getString("databaseId")
                + "/documents/users/" + auth.getString("uid");
    }

    /** Phone stopped/snoozed the alert → tell the PC. */
    public static void sendAlarmDismiss(Context context, String action) {
        final Context app = context.getApplicationContext();
        stopWatching();
        EXEC.execute(() -> {
            try {
                JSONObject auth = readAuth(app);
                if (auth == null) return;
                String token = getIdToken(app, auth);
                long now = System.currentTimeMillis();

                JSONObject sigFields = new JSONObject()
                        .put("opId", new JSONObject().put("stringValue", "nat_" + Long.toString(now, 36)))
                        .put("clientId", new JSONObject().put("stringValue", CLIENT_ID))
                        .put("scope", new JSONObject().put("stringValue", "alarm_dismiss"))
                        .put("action", new JSONObject().put("stringValue", action == null || action.isEmpty() ? "native_dismiss" : action))
                        .put("timestampMs", new JSONObject().put("integerValue", String.valueOf(now)));
                JSONObject write = new JSONObject()
                        .put("update", new JSONObject()
                                .put("name", docName(auth))
                                .put("fields", new JSONObject().put("syncSignal",
                                        new JSONObject().put("mapValue", new JSONObject().put("fields", sigFields)))))
                        .put("updateMask", new JSONObject().put("fieldPaths", new JSONArray().put("syncSignal")))
                        .put("updateTransforms", new JSONArray().put(new JSONObject()
                                .put("fieldPath", "updatedAt")
                                .put("setToServerValue", "REQUEST_TIME")));
                JSONObject body = new JSONObject().put("writes", new JSONArray().put(write));

                Request req = new Request.Builder()
                        .url("https://firestore.googleapis.com/v1/projects/" + auth.getString("projectId")
                                + "/databases/" + auth.getString("databaseId") + "/documents:commit")
                        .header("Authorization", "Bearer " + token)
                        .post(RequestBody.create(body.toString(), JSON))
                        .build();
                try (Response ignored = HTTP.newCall(req).execute()) {
                    // best effort
                }
            } catch (Exception ignored) {
            }
        });
    }

    private static volatile String lastSentBatteryKey = null;
    private static volatile long lastBatteryCommitMs = 0L;

    /**
     * Publishes mobile battery telemetry to Firestore users/{uid}.phoneBattery via REST commit.
     * Keeps PC capsule and dashboard in sync live even when the phone app is closed and screen off.
     */
    public static void publishBatteryTelemetry(Context context, int level, boolean charging, int etaMinutes, int limit) {
        final Context app = context.getApplicationContext();
        final long now = System.currentTimeMillis();
        final String dedupeKey = level + ":" + (charging ? "1" : "0") + ":" + limit + ":" + (etaMinutes > 0 ? etaMinutes : 0);
        if (dedupeKey.equals(lastSentBatteryKey) && now - lastBatteryCommitMs < 45_000L) {
            return;
        }

        EXEC.execute(() -> {
            try {
                JSONObject auth = readAuth(app);
                if (auth == null) return;
                String token = getIdToken(app, auth);

                JSONObject batFields = new JSONObject()
                        .put("levelPct", new JSONObject().put("integerValue", String.valueOf(Math.max(0, Math.min(100, level)))))
                        .put("charging", new JSONObject().put("booleanValue", charging))
                        .put("chargeLimitPct", new JSONObject().put("integerValue", String.valueOf(Math.max(60, Math.min(100, limit)))))
                        .put("deviceLabel", new JSONObject().put("stringValue", "OnePlus 12R"))
                        .put("updatedAtMs", new JSONObject().put("integerValue", String.valueOf(now)));
                if (etaMinutes >= 0) {
                    batFields.put("chargeTimeRemainingMin", new JSONObject().put("integerValue", String.valueOf(etaMinutes)));
                }

                JSONObject write = new JSONObject()
                        .put("update", new JSONObject()
                                .put("name", docName(auth))
                                .put("fields", new JSONObject().put("phoneBattery",
                                        new JSONObject().put("mapValue", new JSONObject().put("fields", batFields)))))
                        .put("updateMask", new JSONObject().put("fieldPaths", new JSONArray().put("phoneBattery")))
                        .put("updateTransforms", new JSONArray().put(new JSONObject()
                                .put("fieldPath", "updatedAt")
                                .put("setToServerValue", "REQUEST_TIME")));
                JSONObject body = new JSONObject().put("writes", new JSONArray().put(write));

                Request req = new Request.Builder()
                        .url("https://firestore.googleapis.com/v1/projects/" + auth.getString("projectId")
                                + "/databases/" + auth.getString("databaseId") + "/documents:commit")
                        .header("Authorization", "Bearer " + token)
                        .post(RequestBody.create(body.toString(), JSON))
                        .build();
                try (Response res = HTTP.newCall(req).execute()) {
                    if (res.isSuccessful()) {
                        lastSentBatteryKey = dedupeKey;
                        lastBatteryCommitMs = now;
                    }
                }
            } catch (Exception ignored) {
            }
        });
    }

    /**
     * Phone battery reached limit (e.g. 90%) or alarm triggered locally → tell the PC to alert immediately.
     */
    public static void sendAlarmTrigger(Context context, String title, String body, String kind, int snoozeMinutes) {
        final Context app = context.getApplicationContext();
        EXEC.execute(() -> {
            try {
                JSONObject auth = readAuth(app);
                if (auth == null) return;
                String token = getIdToken(app, auth);
                long now = System.currentTimeMillis();

                String actionVal = (kind != null && !kind.isEmpty()) ? kind : "charge";
                if (actionVal.length() > 48) actionVal = actionVal.substring(0, 48);

                JSONObject sigFields = new JSONObject()
                        .put("opId", new JSONObject().put("stringValue", "nat_trig_" + Long.toString(now, 36)))
                        .put("clientId", new JSONObject().put("stringValue", CLIENT_ID))
                        .put("scope", new JSONObject().put("stringValue", "alarm_trigger"))
                        .put("action", new JSONObject().put("stringValue", actionVal))
                        .put("timestampMs", new JSONObject().put("integerValue", String.valueOf(now)));

                JSONObject write = new JSONObject()
                        .put("update", new JSONObject()
                                .put("name", docName(auth))
                                .put("fields", new JSONObject().put("syncSignal",
                                        new JSONObject().put("mapValue", new JSONObject().put("fields", sigFields)))))
                        .put("updateMask", new JSONObject().put("fieldPaths", new JSONArray().put("syncSignal")))
                        .put("updateTransforms", new JSONArray().put(new JSONObject()
                                .put("fieldPath", "updatedAt")
                                .put("setToServerValue", "REQUEST_TIME")));
                JSONObject reqBody = new JSONObject().put("writes", new JSONArray().put(write));

                Request req = new Request.Builder()
                        .url("https://firestore.googleapis.com/v1/projects/" + auth.getString("projectId")
                                + "/databases/" + auth.getString("databaseId") + "/documents:commit")
                        .header("Authorization", "Bearer " + token)
                        .post(RequestBody.create(reqBody.toString(), JSON))
                        .build();
                try (Response ignored = HTTP.newCall(req).execute()) {
                    // best effort
                }
            } catch (Exception ignored) {
            }
        });
    }

    /** Alert started on the phone → stop it here as soon as another device dismisses it. */
    public static synchronized void watchForRemoteDismiss(Context context, long firedAtMs) {
        final Context app = context.getApplicationContext();
        stopWatching();
        final long deadline = firedAtMs + 2 * 60_000L;
        watchFuture = EXEC.scheduleWithFixedDelay(() -> {
            if (System.currentTimeMillis() > deadline) {
                stopWatching();
                return;
            }
            try {
                JSONObject auth = readAuth(app);
                if (auth == null) {
                    stopWatching();
                    return;
                }
                String token = getIdToken(app, auth);
                Request req = new Request.Builder()
                        .url("https://firestore.googleapis.com/v1/" + docName(auth) + "?mask.fieldPaths=syncSignal")
                        .header("Authorization", "Bearer " + token)
                        .get()
                        .build();
                try (Response res = HTTP.newCall(req).execute()) {
                    if (!res.isSuccessful() || res.body() == null) return;
                    JSONObject doc = new JSONObject(res.body().string());
                    JSONObject fields = doc.optJSONObject("fields");
                    JSONObject sig = fields == null ? null : fields.optJSONObject("syncSignal");
                    JSONObject sf = sig == null ? null
                            : (sig.optJSONObject("mapValue") == null ? null : sig.optJSONObject("mapValue").optJSONObject("fields"));
                    if (sf == null) return;
                    String scope = sf.optJSONObject("scope") == null ? "" : sf.optJSONObject("scope").optString("stringValue");
                    String client = sf.optJSONObject("clientId") == null ? "" : sf.optJSONObject("clientId").optString("stringValue");
                    long ts = 0L;
                    JSONObject tsObj = sf.optJSONObject("timestampMs");
                    if (tsObj != null) {
                        try {
                            ts = Long.parseLong(tsObj.optString("integerValue", "0"));
                        } catch (NumberFormatException ignored) {
                        }
                    }
                    if ("alarm_dismiss".equals(scope) && !CLIENT_ID.equals(client) && ts >= firedAtMs - 2_000L) {
                        stopWatching();
                        MAIN.post(() -> ReminderAlarmReceiver.cancelAllActiveAlarms(app));
                    }
                }
            } catch (Exception ignored) {
            }
        }, 1, 2, TimeUnit.SECONDS);
    }

    public static synchronized void stopWatching() {
        if (watchFuture != null) {
            watchFuture.cancel(false);
            watchFuture = null;
        }
    }

    /**
     * 24/7 background watcher running inside DayRhythmSyncService.
     * Polls Firestore users/{uid}.syncSignal every 2.5 seconds.
     * Triggers the full-screen AMOLED card, screen wakeup, and alarm sound even when
     * the phone is locked, asleep, and the main app is closed.
     */
    public static synchronized void startBackgroundSyncSignalWatcher(Context context) {
        if (bgWatchFuture != null && !bgWatchFuture.isDone()) return;
        final Context app = context.getApplicationContext();

        bgWatchFuture = EXEC.scheduleWithFixedDelay(() -> {
            try {
                JSONObject auth = readAuth(app);
                if (auth == null) return;
                String token = getIdToken(app, auth);
                Request req = new Request.Builder()
                        .url("https://firestore.googleapis.com/v1/" + docName(auth) + "?mask.fieldPaths=syncSignal")
                        .header("Authorization", "Bearer " + token)
                        .get()
                        .build();
                try (Response res = HTTP.newCall(req).execute()) {
                    if (!res.isSuccessful() || res.body() == null) return;
                    JSONObject doc = new JSONObject(res.body().string());
                    JSONObject fields = doc.optJSONObject("fields");
                    JSONObject sig = fields == null ? null : fields.optJSONObject("syncSignal");
                    JSONObject sf = sig == null ? null
                            : (sig.optJSONObject("mapValue") == null ? null : sig.optJSONObject("mapValue").optJSONObject("fields"));
                    if (sf == null) return;

                    String opId = sf.optJSONObject("opId") == null ? "" : sf.optJSONObject("opId").optString("stringValue", "");
                    String scope = sf.optJSONObject("scope") == null ? "" : sf.optJSONObject("scope").optString("stringValue", "");
                    String client = sf.optJSONObject("clientId") == null ? "" : sf.optJSONObject("clientId").optString("stringValue", "");
                    String action = sf.optJSONObject("action") == null ? "" : sf.optJSONObject("action").optString("stringValue", "");

                    long ts = 0L;
                    JSONObject tsObj = sf.optJSONObject("timestampMs");
                    if (tsObj != null) {
                        try {
                            ts = Long.parseLong(tsObj.optString("integerValue", "0"));
                        } catch (NumberFormatException ignored) {
                        }
                    }

                    if (opId.isEmpty() || CLIENT_ID.equals(client)) return;
                    if (opId.equals(lastHandledOpId) && ts <= lastHandledTimestampMs) return;

                    long now = System.currentTimeMillis();
                    // Ignore signals older than 45 seconds to prevent re-firing stale alarms
                    if (ts < now - 45_000L) return;

                    lastHandledOpId = opId;
                    lastHandledTimestampMs = ts;

                    if ("alarm_trigger".equals(scope)) {
                        JSONObject extraField = sf.optJSONObject("extra");
                        JSONObject extraMap = extraField == null ? null
                                : (extraField.optJSONObject("mapValue") == null ? null : extraField.optJSONObject("mapValue").optJSONObject("fields"));

                        String title = "";
                        String body = "";
                        String kind = action;
                        int snoozeMin = 5;
                        if (extraMap != null) {
                            if (extraMap.optJSONObject("title") != null) title = extraMap.optJSONObject("title").optString("stringValue", "");
                            if (extraMap.optJSONObject("body") != null) body = extraMap.optJSONObject("body").optString("stringValue", "");
                            if (extraMap.optJSONObject("kind") != null) kind = extraMap.optJSONObject("kind").optString("stringValue", action);
                            if (extraMap.optJSONObject("snoozeMinutes") != null) {
                                try {
                                    snoozeMin = Integer.parseInt(extraMap.optJSONObject("snoozeMinutes").optString("integerValue", "5"));
                                } catch (Exception ignored) {
                                }
                            }
                        }
                        if (title == null || title.isEmpty()) title = "تنبيه إيقاع اليوم";
                        if (kind == null || kind.isEmpty()) kind = "general";

                        final String fTitle = title;
                        final String fBody = body != null ? body : "";
                        final String fKind = kind;
                        final int fSnooze = snoozeMin;
                        MAIN.post(() -> ReminderAlarmReceiver.triggerImmediateNativeAlarm(app, fTitle, fBody, fKind, true, fSnooze));
                    } else if ("alarm_dismiss".equals(scope)) {
                        MAIN.post(() -> ReminderAlarmReceiver.cancelAllActiveAlarms(app));
                    }
                }
            } catch (Exception ignored) {
            }
        }, 2, 2, TimeUnit.SECONDS);
    }

    public static synchronized void stopBackgroundSyncSignalWatcher() {
        if (bgWatchFuture != null) {
            bgWatchFuture.cancel(false);
            bgWatchFuture = null;
        }
    }
}
