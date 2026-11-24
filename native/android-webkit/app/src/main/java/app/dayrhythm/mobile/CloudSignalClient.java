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
    private static final ScheduledExecutorService WATCH_EXEC = Executors.newSingleThreadScheduledExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static volatile String idToken;
    private static volatile long idTokenExpiresAtMs;
    private static ScheduledFuture<?> watchFuture;
    private static volatile long lastScheduledAlarmsUpdateMs = 0L;

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

    /** Phone stopped/snoozed the alert → tell the PC instantly (<100ms). */
    public static void sendAlarmDismiss(Context context, String action) {
        final Context app = context.getApplicationContext();
        stopWatching();
        EXEC.execute(() -> {
            try {
                JSONObject auth = readAuth(app);
                if (auth == null) return;
                String token = getIdToken(app, auth);
                long now = System.currentTimeMillis();
                String opId = "nat_dism_" + Long.toString(now, 36);

                JSONObject sigFields = new JSONObject()
                        .put("opId", new JSONObject().put("stringValue", opId))
                        .put("clientId", new JSONObject().put("stringValue", CLIENT_ID))
                        .put("scope", new JSONObject().put("stringValue", "alarm_dismiss"))
                        .put("action", new JSONObject().put("stringValue", action == null || action.isEmpty() ? "native_dismiss" : action))
                        .put("timestampMs", new JSONObject().put("integerValue", String.valueOf(now)));
                JSONObject write1 = new JSONObject()
                        .put("update", new JSONObject()
                                .put("name", docName(auth))
                                .put("fields", new JSONObject().put("syncSignal",
                                        new JSONObject().put("mapValue", new JSONObject().put("fields", sigFields)))))
                        .put("updateMask", new JSONObject().put("fieldPaths", new JSONArray().put("syncSignal")));

                JSONObject liveFields = new JSONObject()
                        .put("opId", new JSONObject().put("stringValue", opId))
                        .put("clientId", new JSONObject().put("stringValue", CLIENT_ID))
                        .put("status", new JSONObject().put("stringValue", "dismissed"))
                        .put("dismissedBy", new JSONObject().put("stringValue", CLIENT_ID))
                        .put("dismissedAtMs", new JSONObject().put("integerValue", String.valueOf(now)))
                        .put("type", new JSONObject().put("stringValue", "alarm_dismiss"))
                        .put("action", new JSONObject().put("stringValue", action == null || action.isEmpty() ? "native_dismiss" : action))
                        .put("timestampMs", new JSONObject().put("integerValue", String.valueOf(now)));
                JSONObject write2 = new JSONObject()
                        .put("update", new JSONObject()
                                .put("name", docName(auth) + "/sync/live")
                                .put("fields", liveFields))
                        .put("updateMask", new JSONObject().put("fieldPaths", new JSONArray()
                                .put("opId").put("clientId").put("status").put("dismissedBy").put("dismissedAtMs").put("type").put("action").put("timestampMs")));

                JSONObject body = new JSONObject().put("writes", new JSONArray().put(write1).put(write2));

                Request req = new Request.Builder()
                        .url("https://firestore.googleapis.com/v1/projects/" + auth.getString("projectId")
                                + "/databases/" + auth.getString("databaseId") + "/documents:commit")
                        .header("Authorization", "Bearer " + token)
                        .post(RequestBody.create(body.toString(), JSON))
                        .build();
                try (Response res = HTTP.newCall(req).execute()) {
                    android.util.Log.d("CloudSignalClient", "sendAlarmDismiss status=" + res.code());
                }
            } catch (Exception e) {
                android.util.Log.e("CloudSignalClient", "sendAlarmDismiss error", e);
            }
        });
    }

    /** Phone fired an exact native alarm → tell the PC to show its card in the exact same millisecond (<100ms). */
    public static void sendAlarmTrigger(Context context, String title, String bodyText, String kind, int snoozeMinutes) {
        final Context app = context.getApplicationContext();
        EXEC.execute(() -> {
            try {
                JSONObject auth = readAuth(app);
                if (auth == null) return;
                String token = getIdToken(app, auth);
                long now = System.currentTimeMillis();
                String opId = "nat_trig_" + Long.toString(now, 36);

                JSONObject sigFields = new JSONObject()
                        .put("opId", new JSONObject().put("stringValue", opId))
                        .put("clientId", new JSONObject().put("stringValue", CLIENT_ID))
                        .put("scope", new JSONObject().put("stringValue", "alarm_trigger"))
                        .put("action", new JSONObject().put("stringValue", "trigger"))
                        .put("timestampMs", new JSONObject().put("integerValue", String.valueOf(now)));
                JSONObject write1 = new JSONObject()
                        .put("update", new JSONObject()
                                .put("name", docName(auth))
                                .put("fields", new JSONObject().put("syncSignal",
                                        new JSONObject().put("mapValue", new JSONObject().put("fields", sigFields)))))
                        .put("updateMask", new JSONObject().put("fieldPaths", new JSONArray().put("syncSignal")));

                JSONObject extraFields = new JSONObject()
                        .put("title", new JSONObject().put("stringValue", title != null ? title : "تنبيه إيقاع اليوم"))
                        .put("body", new JSONObject().put("stringValue", bodyText != null ? bodyText : ""))
                        .put("kind", new JSONObject().put("stringValue", kind != null ? kind : "general"))
                        .put("snoozeMinutes", new JSONObject().put("integerValue", String.valueOf(snoozeMinutes)));

                JSONObject liveFields = new JSONObject()
                        .put("opId", new JSONObject().put("stringValue", opId))
                        .put("sessionId", new JSONObject().put("stringValue", opId))
                        .put("clientId", new JSONObject().put("stringValue", CLIENT_ID))
                        .put("originClientId", new JSONObject().put("stringValue", CLIENT_ID))
                        .put("status", new JSONObject().put("stringValue", "ringing"))
                        .put("title", new JSONObject().put("stringValue", title != null ? title : "تنبيه إيقاع اليوم"))
                        .put("body", new JSONObject().put("stringValue", bodyText != null ? bodyText : ""))
                        .put("kind", new JSONObject().put("stringValue", kind != null ? kind : "general"))
                        .put("startedAtMs", new JSONObject().put("integerValue", String.valueOf(now)))
                        .put("type", new JSONObject().put("stringValue", "alarm_trigger"))
                        .put("action", new JSONObject().put("stringValue", "trigger"))
                        .put("timestampMs", new JSONObject().put("integerValue", String.valueOf(now)))
                        .put("extra", new JSONObject().put("mapValue", new JSONObject().put("fields", extraFields)));
                JSONObject write2 = new JSONObject()
                        .put("update", new JSONObject()
                                .put("name", docName(auth) + "/sync/live")
                                .put("fields", liveFields));

                JSONObject body = new JSONObject().put("writes", new JSONArray().put(write1).put(write2));

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

    /** Alert started on the phone → stop it here as soon as another device dismisses it (<500ms). */
    public static synchronized void watchForRemoteDismiss(Context context, long firedAtMs) {
        final Context app = context.getApplicationContext();
        stopWatching();
        final long deadline = firedAtMs + 3 * 60_000L;
        watchFuture = WATCH_EXEC.scheduleWithFixedDelay(() -> {
            try {
                if (System.currentTimeMillis() > deadline) {
                    stopWatching();
                    return;
                }
                JSONObject auth = readAuth(app);
                if (auth == null) {
                    stopWatching();
                    return;
                }
                String token = getIdToken(app, auth);
                long now = System.currentTimeMillis();

                // 1. Fast-path check users/{uid}/sync/live (<100ms dismissal) — Spotify Connect Session
                Request reqLive = new Request.Builder()
                        .url("https://firestore.googleapis.com/v1/" + docName(auth) + "/sync/live")
                        .header("Authorization", "Bearer " + token)
                        .get()
                        .build();
                try (Response res = HTTP.newCall(reqLive).execute()) {
                    if (res.isSuccessful() && res.body() != null) {
                        JSONObject doc = new JSONObject(res.body().string());
                        JSONObject docFields = doc.optJSONObject("fields");
                        if (docFields != null) {
                            String status = getFirestoreString(docFields, "status", "");
                            String type = getFirestoreString(docFields, "type", "");
                            String client = getFirestoreString(docFields, "clientId", "");
                            String dismissedBy = getFirestoreString(docFields, "dismissedBy", "");
                            long ts = getFirestoreLong(docFields, "timestampMs", 0L);
                            if (ts == 0L) ts = getFirestoreLong(docFields, "dismissedAtMs", 0L);

                            boolean isDismissed = "dismissed".equals(status) || "alarm_dismiss".equals(type);
                            boolean isFromRemote = !CLIENT_ID.equals(client) && !CLIENT_ID.equals(dismissedBy);

                            if (isDismissed && isFromRemote) {
                                if (ts == 0L || Math.abs(now - ts) <= 300_000L || Math.abs(ts - firedAtMs) <= 300_000L) {
                                    android.util.Log.d("CloudSignalClient", "Spotify Connect: Remote dismiss received from live bus, stopping phone alarm");
                                    stopWatching();
                                    MAIN.post(() -> ReminderAlarmReceiver.cancelAllActiveAlarms(app));
                                    return;
                                }
                            }
                        }
                    }
                } catch (Throwable t) {
                    android.util.Log.w("CloudSignalClient", "watchForRemoteDismiss live poll failed: " + t.getMessage());
                }

                // 2. Secondary check users/{uid}?mask.fieldPaths=syncSignal
                Request req = new Request.Builder()
                        .url("https://firestore.googleapis.com/v1/" + docName(auth) + "?mask.fieldPaths=syncSignal")
                        .header("Authorization", "Bearer " + token)
                        .get()
                        .build();
                try (Response res = HTTP.newCall(req).execute()) {
                    if (res.isSuccessful() && res.body() != null) {
                        JSONObject doc = new JSONObject(res.body().string());
                        JSONObject fields = doc.optJSONObject("fields");
                        JSONObject sig = fields == null ? null : fields.optJSONObject("syncSignal");
                        JSONObject sf = sig == null ? null
                                : (sig.optJSONObject("mapValue") == null ? null : sig.optJSONObject("mapValue").optJSONObject("fields"));
                        if (sf != null) {
                            String scope = getFirestoreString(sf, "scope", "");
                            String client = getFirestoreString(sf, "clientId", "");
                            long ts = getFirestoreLong(sf, "timestampMs", 0L);
                            if ("alarm_dismiss".equals(scope) && !CLIENT_ID.equals(client)) {
                                if (ts == 0L || Math.abs(now - ts) <= 300_000L || Math.abs(ts - firedAtMs) <= 300_000L) {
                                    android.util.Log.d("CloudSignalClient", "Remote dismiss received from syncSignal, stopping phone alarm");
                                    stopWatching();
                                    MAIN.post(() -> ReminderAlarmReceiver.cancelAllActiveAlarms(app));
                                }
                            }
                        }
                    }
                } catch (Throwable t) {
                    android.util.Log.w("CloudSignalClient", "watchForRemoteDismiss syncSignal poll failed: " + t.getMessage());
                }
            } catch (Throwable t) {
                android.util.Log.e("CloudSignalClient", "watchForRemoteDismiss error", t);
            }
        }, 100, 500, TimeUnit.MILLISECONDS);
    }

    public static synchronized void stopWatching() {
        if (watchFuture != null) {
            watchFuture.cancel(false);
            watchFuture = null;
        }
    }

    private static volatile String lastHandledOpId = null;
    private static volatile long lastHandledTriggerMs = 0L;

    private static String getFirestoreString(JSONObject fields, String key, String fallback) {
        if (fields == null) return fallback;
        JSONObject v = fields.optJSONObject(key);
        if (v == null) return fallback;
        return v.optString("stringValue", fallback);
    }

    private static int getFirestoreInt(JSONObject fields, String key, int fallback) {
        if (fields == null) return fallback;
        JSONObject v = fields.optJSONObject(key);
        if (v == null) return fallback;
        String s = v.optString("integerValue", null);
        if (s != null && !s.isEmpty()) {
            try {
                return Integer.parseInt(s);
            } catch (Exception ignored) {}
        }
        if (v.has("doubleValue")) {
            return (int) v.optDouble("doubleValue", fallback);
        }
        if (v.has("stringValue")) {
            try {
                return Integer.parseInt(v.optString("stringValue"));
            } catch (Exception ignored) {}
        }
        return fallback;
    }

    private static long getFirestoreLong(JSONObject fields, String key, long fallback) {
        if (fields == null) return fallback;
        JSONObject v = fields.optJSONObject(key);
        if (v == null) return fallback;
        String s = v.optString("integerValue", null);
        if (s != null && !s.isEmpty()) {
            try {
                return Long.parseLong(s);
            } catch (Exception ignored) {}
        }
        if (v.has("doubleValue")) {
            return (long) v.optDouble("doubleValue", fallback);
        }
        if (v.has("stringValue")) {
            try {
                return Long.parseLong(v.optString("stringValue"));
            } catch (Exception ignored) {}
        }
        return fallback;
    }

    /**
     * Periodic background check for real-time alarm triggers, dismissals, and PC-scheduled alarms.
     * Invoked periodically by DayRhythmSyncService so alerts ring immediately even when WebView is frozen.
     */
    public static void pollRemoteSignals(Context context) {
        final Context app = context.getApplicationContext();
        EXEC.execute(() -> {
            try {
                JSONObject auth = readAuth(app);
                if (auth == null) return;
                String token = getIdToken(app, auth);
                long now = System.currentTimeMillis();

                // Priority 1: Check users/{uid}/sync/live (fast-path bus carrying rich metadata)
                Request reqLive = new Request.Builder()
                        .url("https://firestore.googleapis.com/v1/" + docName(auth) + "/sync/live")
                        .header("Authorization", "Bearer " + token)
                        .get()
                        .build();
                boolean handledFromLive = false;
                try (Response res = HTTP.newCall(reqLive).execute()) {
                    if (res.isSuccessful() && res.body() != null) {
                        JSONObject doc = new JSONObject(res.body().string());
                        JSONObject docFields = doc.optJSONObject("fields");
                        if (docFields != null) {
                            String status = getFirestoreString(docFields, "status", "");
                            String type = getFirestoreString(docFields, "type", "");
                            String client = getFirestoreString(docFields, "clientId", "");
                            String originClientId = getFirestoreString(docFields, "originClientId", client);
                            String dismissedBy = getFirestoreString(docFields, "dismissedBy", client);
                            String opId = getFirestoreString(docFields, "opId", "");
                            String sessionId = getFirestoreString(docFields, "sessionId", opId);
                            long ts = getFirestoreLong(docFields, "timestampMs", 0L);
                            if (ts == 0L) ts = getFirestoreLong(docFields, "startedAtMs", 0L);
                            if (ts == 0L) ts = getFirestoreLong(docFields, "dismissedAtMs", 0L);

                            boolean isDismissed = "dismissed".equals(status) || "alarm_dismiss".equals(type);
                            boolean isRinging = "ringing".equals(status) || "alarm_trigger".equals(type);
                            boolean isFromRemote = !CLIENT_ID.equals(client) && !CLIENT_ID.equals(originClientId) && !CLIENT_ID.equals(dismissedBy);

                            if (isFromRemote) {
                                if (isRinging) {
                                    handledFromLive = true;
                                    boolean isRecent = (ts == 0L || Math.abs(now - ts) <= 300_000L);
                                    if (isRecent && !sessionId.equals(lastHandledOpId)) {
                                        lastHandledOpId = sessionId;
                                        lastHandledTriggerMs = ts > 0L ? ts : now;

                                        String rawTitle = getFirestoreString(docFields, "title", "");
                                        String emoji = getFirestoreString(docFields, "privacyEmoji", "");
                                        String body = getFirestoreString(docFields, "body", "");
                                        String kind = getFirestoreString(docFields, "kind", "general");
                                        int snoozeMin = getFirestoreInt(docFields, "snoozeMinutes", 5);

                                        if (rawTitle.isEmpty()) {
                                            JSONObject extraMap = docFields.optJSONObject("extra");
                                            JSONObject packetFields = extraMap != null && extraMap.optJSONObject("mapValue") != null
                                                    ? extraMap.optJSONObject("mapValue").optJSONObject("fields") : null;
                                            JSONObject payloadFields = packetFields;
                                            if (packetFields != null && packetFields.optJSONObject("extra") != null
                                                    && packetFields.optJSONObject("extra").optJSONObject("mapValue") != null) {
                                                payloadFields = packetFields.optJSONObject("extra").optJSONObject("mapValue").optJSONObject("fields");
                                            }
                                            rawTitle = getFirestoreString(payloadFields, "title", "تنبيه إيقاع اليوم");
                                            emoji = getFirestoreString(payloadFields, "privacyEmoji", "");
                                            body = getFirestoreString(payloadFields, "body", "");
                                            kind = getFirestoreString(payloadFields, "kind", "general");
                                            snoozeMin = getFirestoreInt(payloadFields, "snoozeMinutes", 5);
                                        }

                                        String title = !emoji.isEmpty() && !rawTitle.contains(emoji) ? emoji + " " + rawTitle : rawTitle;

                                        final String fTitle = title;
                                        final String fBody = body;
                                        final String fKind = kind;
                                        final int fSnooze = snoozeMin;
                                        MAIN.post(() -> ReminderAlarmReceiver.triggerImmediateNativeAlarm(
                                                app,
                                                fTitle,
                                                fBody,
                                                fKind,
                                                true,
                                                fSnooze
                                        ));
                                    }
                                } else if (isDismissed) {
                                    handledFromLive = true;
                                    MAIN.post(() -> ReminderAlarmReceiver.cancelAllActiveAlarms(app));
                                }
                            }
                        }
                    }
                } catch (Throwable ignored) {
                }

                // Priority 2: Fallback check users/{uid}?mask.fieldPaths=syncSignal
                if (!handledFromLive) {
                    Request reqSig = new Request.Builder()
                            .url("https://firestore.googleapis.com/v1/" + docName(auth) + "?mask.fieldPaths=syncSignal")
                            .header("Authorization", "Bearer " + token)
                            .get()
                            .build();
                    try (Response res = HTTP.newCall(reqSig).execute()) {
                        if (res.isSuccessful() && res.body() != null) {
                            JSONObject doc = new JSONObject(res.body().string());
                            JSONObject fields = doc.optJSONObject("fields");
                            JSONObject sig = fields == null ? null : fields.optJSONObject("syncSignal");
                            JSONObject sf = sig == null ? null
                                    : (sig.optJSONObject("mapValue") == null ? null : sig.optJSONObject("mapValue").optJSONObject("fields"));
                            if (sf != null) {
                                String scope = getFirestoreString(sf, "scope", "");
                                String client = getFirestoreString(sf, "clientId", "");
                                String opId = getFirestoreString(sf, "opId", "");
                                long ts = getFirestoreLong(sf, "timestampMs", 0L);

                                if (!CLIENT_ID.equals(client)) {
                                    if ("alarm_trigger".equals(scope)) {
                                        boolean isRecent = (ts == 0L || Math.abs(now - ts) <= 300_000L);
                                        if (isRecent && !opId.equals(lastHandledOpId)) {
                                            lastHandledOpId = opId;
                                            lastHandledTriggerMs = ts > 0L ? ts : now;
                                            MAIN.post(() -> ReminderAlarmReceiver.triggerImmediateNativeAlarm(
                                                    app,
                                                    "🔔 تنبيه متزامن",
                                                    "مزامنة سحابية من جهازك الآخر",
                                                    "general",
                                                    true,
                                                    5
                                            ));
                                        }
                                    } else if ("alarm_dismiss".equals(scope)) {
                                        if (ts == 0L || Math.abs(now - ts) <= 300_000L) {
                                            MAIN.post(() -> ReminderAlarmReceiver.cancelAllActiveAlarms(app));
                                        }
                                    }
                                }
                            }
                        }
                    } catch (Throwable ignored) {
                    }
                }

                // Priority 3: Check users/{uid}/sync/scheduled_alarms (Syncs exact alarms scheduled from PC)
                Request reqAlarms = new Request.Builder()
                        .url("https://firestore.googleapis.com/v1/" + docName(auth) + "/sync/scheduled_alarms")
                        .header("Authorization", "Bearer " + token)
                        .get()
                        .build();
                try (Response res = HTTP.newCall(reqAlarms).execute()) {
                    if (res.isSuccessful() && res.body() != null) {
                        JSONObject doc = new JSONObject(res.body().string());
                        JSONObject fields = doc.optJSONObject("fields");
                        if (fields != null) {
                            String alarmsJson = getFirestoreString(fields, "alarmsJson", "");
                            long updatedAt = getFirestoreLong(fields, "updatedAtMs", 0L);
                            if (!alarmsJson.isEmpty() && updatedAt > lastScheduledAlarmsUpdateMs) {
                                lastScheduledAlarmsUpdateMs = updatedAt;
                                android.util.Log.d("CloudSignalClient", "Applying scheduled alarms synced from PC");
                                ReminderAlarmReceiver.scheduleBatchFromJson(app, alarmsJson);
                            }
                        }
                    }
                } catch (Throwable ignored) {
                }
            } catch (Throwable ignored) {
            }
        });
    }

}
