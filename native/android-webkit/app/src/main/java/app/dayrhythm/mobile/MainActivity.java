package app.dayrhythm.mobile;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.Dialog;
import android.app.DownloadManager;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.os.PowerManager;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import org.json.JSONObject;
import java.util.ArrayList;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

import android.webkit.JavascriptInterface;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    public static final String PREFS_NAME = "dayrhythm_mobile_prefs";
    public static final String KEY_REMOTE_WS_URL = "remote_ws_url";
    public static volatile MainActivity activeInstance = null;
    private static final String KEY_BATTERY_PROMPTED = "battery_prompted_once";
    private static final String APP_HOST = "gen-lang-client-0625331922.web.app";
    private static final String APP_ORIGIN = "https://gen-lang-client-0625331922.web.app/index.html";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private LinearLayout updateBar;
    private TextView updateBarText;
    private String pendingUpdateTag = "";
    private String pendingUpdateUrl = "";
    private String pendingOtaZipUrl = "";
    private long activeDownloadId = -1L;

    private final BroadcastReceiver nativeEventsReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || intent.getAction() == null) return;
            String action = intent.getAction();

            if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(action)) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                if (id != -1L && id == activeDownloadId) {
                    Toast.makeText(context, "اكتمل تنزيل التحديث — جاري فتح المثبّت", Toast.LENGTH_LONG).show();
                    GitHubUpdater.installDownloadedApk(context);
                }
            } else if (DayRhythmSyncService.ACTION_UPDATE_AVAILABLE.equals(action)) {
                String tag = intent.getStringExtra(DayRhythmSyncService.EXTRA_UPDATE_TAG);
                String url = intent.getStringExtra(DayRhythmSyncService.EXTRA_UPDATE_URL);
                if (tag != null && url != null && !url.isEmpty()) {
                    showUpdateBanner(tag, url);
                }
            } else if (DayRhythmSyncService.ACTION_WS_SYNC_MESSAGE.equals(action)) {
                String payload = intent.getStringExtra(DayRhythmSyncService.EXTRA_WS_PAYLOAD);
                if (payload != null && webView != null) {
                    String escaped = payload.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "");
                    webView.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('dayrhythm:ws-sync',{detail:'" + escaped + "'}));",
                            null
                    );
                }
            } else if (DayRhythmSyncService.ACTION_NETWORK_RECOVERED.equals(action)) {
                if (webView != null) {
                    webView.evaluateJavascript(
                            "window.dispatchEvent(new Event('dayrhythm:network-recovered'));",
                            null
                    );
                }
            } else if (ReminderAlarmReceiver.ACTION_PENDING_QUEUE_UPDATED.equals(action)) {
                dispatchPendingQuickActionsToWebView();
            } else if (Intent.ACTION_BATTERY_CHANGED.equals(action)) {
                dispatchBatteryIntentToWebView(intent);
            }
        }
    };

    private int computeChargeTimeRemainingMinutes(boolean charging, int pct) {
        if (!charging) return -1;
        if (pct >= 100) return 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                BatteryManager bm = (BatteryManager) getSystemService(BATTERY_SERVICE);
                if (bm != null) {
                    long ms = bm.computeChargeTimeRemaining();
                    if (ms >= 0L) {
                        return (int) Math.max(1L, Math.min(1440L, Math.round(ms / 60_000.0)));
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return -1;
    }

    private String buildBatterySnapshotJson(Intent batteryIntent) {
        if (batteryIntent == null) return "";
        int level = batteryIntent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = batteryIntent.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        int status = batteryIntent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        if (level < 0 || scale <= 0) return "";
        int pct = Math.max(0, Math.min(100, Math.round((level * 100f) / scale)));
        boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING
                || status == BatteryManager.BATTERY_STATUS_FULL;
        int etaMin = computeChargeTimeRemainingMinutes(charging, pct);
        String model = (Build.MODEL != null && !Build.MODEL.trim().isEmpty())
                ? Build.MODEL.replace("\\", "").replace("'", "").replace("\"", "")
                : "OnePlus 12R";
        return "{\"levelPct\":" + pct
                + ",\"charging\":" + (charging ? "true" : "false")
                + ",\"chargeTimeRemainingMin\":" + etaMin
                + ",\"deviceLabel\":\"" + model + "\"}";
    }

    private void dispatchBatteryIntentToWebView(Intent batteryIntent) {
        if (webView == null) return;
        Intent resolved = batteryIntent != null
                ? batteryIntent
                : registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        String json = buildBatterySnapshotJson(resolved);
        if (json.isEmpty()) return;
        String js = "window.__dayRhythmNativeBattery=" + json + ";"
                + "window.dispatchEvent(new CustomEvent('dayrhythm:native-battery',{detail:window.__dayRhythmNativeBattery}));";
        webView.evaluateJavascript(js, null);
    }

    private void dispatchPendingQuickActionsToWebView() {
        if (webView == null) return;
        try {
            String pending = ReminderAlarmReceiver.consumePendingQuickActionsJson(MainActivity.this);
            if (pending != null && !pending.equals("[]")) {
                webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('dayrhythm:native-quick-actions', { detail: " + pending + " }));",
                        null
                );
            }
        } catch (Exception ignored) {
        }
    }

    public void evaluateJavascriptInWebView(String script) {
        if (webView != null && script != null) {
            webView.post(() -> {
                try {
                    webView.evaluateJavascript(script, null);
                } catch (Exception ignored) {
                }
            });
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        activeInstance = this;
        super.onCreate(savedInstanceState);
        ReminderAlarmReceiver.stopRinging();
        setVolumeControlStream(android.media.AudioManager.STREAM_ALARM);

        // 1. Clean stale OTA folders & configure official AndroidX WebViewAssetLoader
        GitHubUpdater.cleanupOldOtaReleases(this);
        assetLoader = buildSpaAssetLoader();

        // 2. Start 24/7 Special-Use Foreground Service + schedule hourly WorkManager GitHub update checks
        DayRhythmSyncService.startServiceCompat(this);
        UpdateCheckWorker.schedulePeriodicCheck(this);

        // 3. Request Android 13+ notification permission + OnePlus 12R battery optimization whitelist
        requestEssentialPermissions();
        promptBatteryWhitelistOnce();
        promptFullScreenAlertsOnce();

        // 4. Register receiver for APK downloads, update banners, background WebSocket events, notification actions, and live battery telemetry
        IntentFilter filter = new IntentFilter();
        filter.addAction(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        filter.addAction(DayRhythmSyncService.ACTION_UPDATE_AVAILABLE);
        filter.addAction(DayRhythmSyncService.ACTION_WS_SYNC_MESSAGE);
        filter.addAction(DayRhythmSyncService.ACTION_NETWORK_RECOVERED);
        filter.addAction(ReminderAlarmReceiver.ACTION_PENDING_QUEUE_UPDATED);
        filter.addAction(Intent.ACTION_BATTERY_CHANGED);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(nativeEventsReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(nativeEventsReceiver, filter);
        }

        purgeStaleOtaIfApkUpdated();
        buildWebViewUi();

        handleIncomingUpdateIntent(getIntent());
        checkUpdatesOnLaunch();
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    private WebViewAssetLoader buildSpaAssetLoader() {
        return new WebViewAssetLoader.Builder()
                .setDomain(APP_HOST)
                .addPathHandler("/", path -> {
                    String clean = path == null ? "" : path.replaceFirst("^/+", "").replace("..", "");
                    if (clean.isEmpty()) clean = "index.html";

                    Map<String, String> headers = new HashMap<>();
                    headers.put("Cross-Origin-Opener-Policy", "same-origin-allow-popups");

                    if ("api/health".equals(clean)) {
                        byte[] json = ("{\"ok\":true,\"mode\":\"android_webkit_assetloader\",\"version\":\""
                                + BuildConfig.VERSION_NAME + "\"}").getBytes(StandardCharsets.UTF_8);
                        return new WebResourceResponse(
                                "application/json",
                                "UTF-8",
                                200,
                                "OK",
                                headers,
                                new ByteArrayInputStream(json)
                        );
                    }

                    String resolved = clean;
                    InputStream stream = tryOpenOtaOrAsset(clean);
                    if (stream == null) {
                        resolved = "index.html";
                        stream = tryOpenOtaOrAsset("index.html");
                    }

                    if (stream == null) {
                        byte[] fallback = "<!doctype html><html dir=\"rtl\" lang=\"ar\"><body style=\"background:#000;color:#fff;font-family:sans-serif;padding:32px;text-align:center\"><h2>جاري تحميل إيقاع اليوم...</h2></body></html>"
                                .getBytes(StandardCharsets.UTF_8);
                        return new WebResourceResponse(
                                "text/html",
                                "UTF-8",
                                200,
                                "OK",
                                headers,
                                new ByteArrayInputStream(fallback)
                        );
                    }

                    if (resolved.endsWith(".html")) {
                        headers.put("Cache-Control", "no-cache, no-store, must-revalidate");
                    }
                    return new WebResourceResponse(
                            guessMime(resolved),
                            "UTF-8",
                            200,
                            "OK",
                            headers,
                            stream
                    );
                })
                .build();
    }

    private void purgeStaleOtaIfApkUpdated() {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String otaVer = prefs.getString(GitHubUpdater.KEY_OTA_VERSION, "");
            String baseVer = BuildConfig.VERSION_NAME;
            if (otaVer != null && !otaVer.trim().isEmpty() && !GitHubUpdater.isVersionNewer(otaVer, baseVer)) {
                prefs.edit().remove(GitHubUpdater.KEY_OTA_VERSION).remove(GitHubUpdater.KEY_OTA_ACTIVE_DIR).apply();
                GitHubUpdater.cleanupOldOtaReleases(this);
            }
        } catch (Exception ignored) {
        }
    }

    private InputStream tryOpenOtaOrAsset(String relativePath) {
        try {
            if (GitHubUpdater.hasNewerOtaVersion(this)) {
                File otaRoot = GitHubUpdater.getOtaWwwDir(this);
                File otaFile = new File(otaRoot, relativePath);
                if (otaFile.exists() && otaFile.isFile()) {
                    return new FileInputStream(otaFile);
                }
            }
        } catch (Exception ignored) {
        }
        return tryOpenAsset("www/" + relativePath);
    }

    private InputStream tryOpenAsset(String assetPath) {
        try {
            return getAssets().open(assetPath);
        } catch (IOException e) {
            return null;
        }
    }

    private static String guessMime(String name) {
        String lower = name.toLowerCase();
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".webmanifest")) return "application/manifest+json";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        return "application/octet-stream";
    }

    // ── Home-screen widget + native voice input ─────────────────────────────────────
    public static final String EXTRA_WIDGET_ACTION = "dayrhythm_widget_action";
    private static final int REQ_VOICE_INPUT = 4401;

    private static String readWidgetAction(Intent intent) {
        if (intent == null) return null;
        String a = intent.getStringExtra(EXTRA_WIDGET_ACTION);
        return ("chat".equals(a) || "voice".equals(a)) ? a : null;
    }

    /** App already open: switch to the chat (and start voice) without reloading the page. */
    private void handleWidgetIntent(Intent intent, boolean appAlreadyRunning) {
        String action = readWidgetAction(intent);
        if (action == null || webView == null || !appAlreadyRunning) return;
        intent.removeExtra(EXTRA_WIDGET_ACTION);
        boolean voice = "voice".equals(action);
        webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('dayrhythm:open-assistant',{detail:{voice:" + voice + "}}));",
                null
        );
    }

    private void launchVoiceRecognizer(String lang) {
        try {
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang == null || lang.isEmpty() ? "ar-EG" : lang);
            i.putExtra(RecognizerIntent.EXTRA_PROMPT, "قول أمرك لـ Gemini");
            i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            startActivityForResult(i, REQ_VOICE_INPUT);
        } catch (Exception e) {
            dispatchVoiceResult(null, "الإدخال الصوتي مش متاح على الجهاز ده.");
        }
    }

    private void dispatchVoiceResult(String text, String error) {
        if (webView == null) return;
        try {
            JSONObject detail = new JSONObject();
            if (text != null) detail.put("text", text);
            if (error != null) detail.put("error", error);
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('dayrhythm:voice-result',{detail:" + detail + "}));",
                    null
            );
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_VOICE_INPUT) return;
        if (resultCode == Activity.RESULT_OK && data != null) {
            ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            String text = results != null && !results.isEmpty() ? results.get(0) : null;
            dispatchVoiceResult(text, text == null ? "مسمعتش حاجة — جرّب تاني." : null);
        } else {
            dispatchVoiceResult(null, null);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingUpdateIntent(intent);
        handleWidgetIntent(intent, true);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onDestroy() {
        if (activeInstance == this) activeInstance = null;
        CookieManager.getInstance().flush();
        try {
            unregisterReceiver(nativeEventsReceiver);
        } catch (Exception ignored) {
        }
        executor.shutdownNow();
        super.onDestroy();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Immediately silence any background looping ringtone/vibration when the user opens/resumes the app
        ReminderAlarmReceiver.stopRinging();
        ReminderAlarmReceiver.cancelAllActiveAlarms(this);
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('dayrhythm:permissions-changed'));",
                    null
            );
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('dayrhythm:permissions-changed'));",
                    null
            );
        }
    }

    private void requestEssentialPermissions() {
        java.util.List<String> needed = new java.util.ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(
                    this,
                    needed.toArray(new String[0]),
                    201
            );
        }
    }

    /**
     * Android 14+: full-screen alerts need "Full screen notifications" access; without it the alarm is
     * downgraded to a banner even on the lock screen. Ask once.
     */
    private void promptFullScreenAlertsOnce() {
        if (Build.VERSION.SDK_INT < 34) return;
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (prefs.getBoolean("full_screen_alerts_prompted", false)) return;
        try {
            android.app.NotificationManager nm =
                    (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null && !nm.canUseFullScreenIntent()) {
                prefs.edit().putBoolean("full_screen_alerts_prompted", true).apply();
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                i.setData(Uri.parse("package:" + getPackageName()));
                startActivity(i);
            }
        } catch (Exception ignored) {
        }
    }

    private void promptBatteryWhitelistOnce() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (prefs.getBoolean(KEY_BATTERY_PROMPTED, false)) return;
        prefs.edit().putBoolean(KEY_BATTERY_PROMPTED, true).apply();

        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            }
        } catch (Exception ignored) {
            // Optional on devices without battery optimization dialog
        }
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    private static String sanitizeUserAgent(String rawUa) {
        if (rawUa == null || rawUa.isEmpty()) {
            return "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
        }
        return rawUa
                .replace("; wv)", ")")
                .replace("; wv;", ";")
                .replaceAll("Version/\\d+\\.\\d+\\s*", "");
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void buildWebViewUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        // Remove WebView markers ("; wv" & "Version/4.0") so Google OAuth never rejects with 403 disallowed_useragent
        settings.setUserAgentString(sanitizeUserAgent(settings.getUserAgentString()));

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        // Expose lightweight JS bridge for OTA updates, Android Exact Alarms, and Notification Quick Actions
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void checkForUpdates() {
                dispatchUpdateStatusToWebView("checking", GitHubUpdater.getEffectiveLocalVersion(MainActivity.this), "");
                executor.execute(() -> {
                    GitHubUpdater.UpdateInfo info = GitHubUpdater.checkLatestRelease(MainActivity.this);
                    if (info != null && info.hasUpdate) {
                        if (info.webOtaZipUrl != null && !info.webOtaZipUrl.isEmpty()) {
                            dispatchUpdateStatusToWebView("downloading", info.latestTag, "");
                            boolean ok = GitHubUpdater.downloadAndApplyWebOta(
                                    MainActivity.this,
                                    info.webOtaZipUrl,
                                    info.latestTag
                            );
                            if (ok) {
                                dispatchUpdateStatusToWebView("applied", info.latestTag, "");
                                runOnUiThread(() -> {
                                    if (updateBar != null) updateBar.setVisibility(View.GONE);
                                    if (webView != null) {
                                        webView.clearCache(true);
                                        webView.loadUrl(APP_ORIGIN + "?ota=" + System.currentTimeMillis());
                                    }
                                });
                                return;
                            }
                        }
                        if (info.apkDownloadUrl != null && !info.apkDownloadUrl.isEmpty()) {
                            dispatchUpdateStatusToWebView("downloading", info.latestTag, "");
                            runOnUiThread(() -> {
                                pendingUpdateTag = info.latestTag;
                                pendingUpdateUrl = info.apkDownloadUrl;
                                pendingOtaZipUrl = "";
                                startApkFallbackDownload();
                            });
                        } else {
                            dispatchUpdateStatusToWebView("error", "", "تعذر تنزيل التحديث حالياً.");
                        }
                    } else {
                        String curVer = GitHubUpdater.getEffectiveLocalVersion(MainActivity.this);
                        dispatchUpdateStatusToWebView("up_to_date", curVer, "");
                    }
                });
            }

            @JavascriptInterface
            public void triggerNativeAlarm(String title, String body, String kind, boolean continuous, int snoozeMinutes) {
                executor.execute(() -> ReminderAlarmReceiver.triggerImmediateNativeAlarm(
                        MainActivity.this,
                        title,
                        body,
                        kind,
                        continuous,
                        snoozeMinutes
                ));
            }

            @JavascriptInterface
            public void setCloudAuth(String authJson) {
                CloudSignalClient.saveAuth(MainActivity.this, authJson);
            }

            @JavascriptInterface
            public void startVoiceInput(String lang) {
                runOnUiThread(() -> launchVoiceRecognizer(lang));
            }

            @JavascriptInterface
            public void setChargeLimit(int limitPct, boolean enabled) {
                DayRhythmSyncService.saveChargeLimitSettings(MainActivity.this, limitPct, enabled);
            }

            @JavascriptInterface
            public void stopNativeAlarmSound() {
                ReminderAlarmReceiver.stopRinging();
            }

            @JavascriptInterface
            public void scheduleExactAlarms(String alarmsJson) {
                executor.execute(() -> ReminderAlarmReceiver.scheduleBatchFromJson(MainActivity.this, alarmsJson));
            }

            @JavascriptInterface
            public void dismissActiveAlerts() {
                executor.execute(() -> ReminderAlarmReceiver.cancelAllActiveAlarms(MainActivity.this));
            }

            @JavascriptInterface
            public void updateLiveStatus(String statusJson) {
                executor.execute(() -> {
                    try {
                        org.json.JSONObject obj = new org.json.JSONObject(statusJson);
                        String emoji = obj.optString("emoji", "📅");
                        String title = obj.optString("title", "");
                        String statusLabel = obj.optString("statusLabel", "المهمة القادمة");
                        long targetEpochMs = obj.optLong("targetEpochMs", 0L);
                        boolean liveEnabled = obj.optBoolean("liveAlertsEnabled", true);
                        int leadMin = obj.optInt("liveAlertsLeadMinutes", 10);
                        boolean persistentNotif = obj.optBoolean("persistentCountdownNotif", true);
                        DayRhythmSyncService.pushLiveStatus(
                                MainActivity.this,
                                emoji,
                                title,
                                statusLabel,
                                targetEpochMs,
                                liveEnabled,
                                leadMin,
                                persistentNotif
                        );
                    } catch (Exception ignored) {
                    }
                });
            }

            @JavascriptInterface
            public void updateCapsule(String emoji, String title, String countdown, String statusLabel) {
                // Legacy 4-arg fallback mapped to persistent notification
                executor.execute(() -> DayRhythmSyncService.pushLiveStatus(
                        MainActivity.this,
                        emoji,
                        title,
                        statusLabel,
                        0L,
                        true,
                        10,
                        true
                ));
            }

            @JavascriptInterface
            public String getBatterySnapshotJson() {
                try {
                    Intent sticky = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                    return buildBatterySnapshotJson(sticky);
                } catch (Exception ignored) {
                    return "";
                }
            }

            @JavascriptInterface
            public String consumePendingNativeActions() {
                return ReminderAlarmReceiver.consumePendingQuickActionsJson(MainActivity.this);
            }

            @JavascriptInterface
            public String getPermissionsStatusJson() {
                try {
                    JSONObject obj = new JSONObject();

                    // 1. Notifications (Android 13+ / SDK 33)
                    boolean notif = true;
                    if (Build.VERSION.SDK_INT >= 33) {
                        notif = ContextCompat.checkSelfPermission(
                                MainActivity.this,
                                Manifest.permission.POST_NOTIFICATIONS
                        ) == PackageManager.PERMISSION_GRANTED;
                    }
                    obj.put("notifications", notif);

                    // 2. Exact Alarm (Android 12+ / SDK 31)
                    boolean exact = true;
                    if (Build.VERSION.SDK_INT >= 31) {
                        AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
                        exact = (am != null && am.canScheduleExactAlarms());
                    }
                    obj.put("exactAlarm", exact);

                    // 3. Battery Optimizations (Unrestricted)
                    boolean battery = false;
                    try {
                        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                        battery = (pm != null && pm.isIgnoringBatteryOptimizations(getPackageName()));
                    } catch (Exception ignored) {
                        battery = true;
                    }
                    obj.put("batteryOptimization", battery);

                    // 4. Full Screen Intent (Android 14+ / SDK 34)
                    boolean fsi = true;
                    if (Build.VERSION.SDK_INT >= 34) {
                        NotificationManager nm =
                                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                        fsi = (nm != null && nm.canUseFullScreenIntent());
                    }
                    obj.put("fullScreenIntent", fsi);

                    // 5. DND / Notification Policy Access
                    boolean dnd = false;
                    try {
                        NotificationManager nm =
                                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                        dnd = (nm != null && nm.isNotificationPolicyAccessGranted());
                    } catch (Exception ignored) {
                        dnd = false;
                    }
                    obj.put("dndPolicy", dnd);

                    // 6. Location
                    boolean loc = ContextCompat.checkSelfPermission(
                            MainActivity.this,
                            Manifest.permission.ACCESS_FINE_LOCATION
                    ) == PackageManager.PERMISSION_GRANTED;
                    obj.put("location", loc);

                    return obj.toString();
                } catch (Exception e) {
                    return "{}";
                }
            }

            @JavascriptInterface
            public void requestEssentialPermissions() {
                runOnUiThread(() -> MainActivity.this.requestEssentialPermissions());
            }

            @JavascriptInterface
            public void openExactAlarmSettings() {
                runOnUiThread(() -> {
                    if (Build.VERSION.SDK_INT >= 31) {
                        try {
                            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                            intent.setData(Uri.parse("package:" + getPackageName()));
                            startActivity(intent);
                        } catch (Exception e) {
                            openAppSystemSettings();
                        }
                    } else {
                        openAppSystemSettings();
                    }
                });
            }

            @JavascriptInterface
            public void openBatteryOptimizationSettings() {
                runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                    } catch (Exception e) {
                        openAppSystemSettings();
                    }
                });
            }

            @JavascriptInterface
            public void openFullScreenIntentSettings() {
                runOnUiThread(() -> {
                    if (Build.VERSION.SDK_INT >= 34) {
                        try {
                            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                            intent.setData(Uri.parse("package:" + getPackageName()));
                            startActivity(intent);
                        } catch (Exception e) {
                            openAppSystemSettings();
                        }
                    } else {
                        openAppSystemSettings();
                    }
                });
            }

            @JavascriptInterface
            public void openDndSettings() {
                runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
                        startActivity(intent);
                    } catch (Exception e) {
                        openAppSystemSettings();
                    }
                });
            }

            @JavascriptInterface
            public void openLiveAlertSettings() {
                runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                        startActivity(intent);
                    } catch (Exception e) {
                        openAppSystemSettings();
                    }
                });
            }

            @JavascriptInterface
            public void openAppSystemSettings() {
                runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                    } catch (Exception ignored) {
                    }
                });
            }
        }, "DayRhythmNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                dispatchPendingQuickActionsToWebView();
                dispatchBatteryIntentToWebView(null);
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && "https".equalsIgnoreCase(uri.getScheme())
                        && APP_HOST.equalsIgnoreCase(uri.getHost())) {
                    String p = uri.getPath();
                    if (p == null || !p.startsWith("/__/")) {
                        return assetLoader.shouldInterceptRequest(uri);
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";
                if (host.equals(APP_HOST)
                        || host.equals("localhost")
                        || host.equals("127.0.0.1")
                        || host.endsWith("google.com")
                        || host.endsWith("googleapis.com")
                        || host.endsWith("googleusercontent.com")
                        || host.endsWith("gstatic.com")
                        || host.endsWith("firebaseapp.com")
                        || host.endsWith("web.app")) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(
                            MainActivity.this,
                            new String[]{
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                            },
                            202
                    );
                }
                callback.invoke(origin, true, true);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView popupWebView = new WebView(MainActivity.this);
                popupWebView.setBackgroundColor(Color.parseColor("#09090B"));
                WebSettings pSettings = popupWebView.getSettings();
                pSettings.setJavaScriptEnabled(true);
                pSettings.setDomStorageEnabled(true);
                pSettings.setDatabaseEnabled(true);
                pSettings.setSupportMultipleWindows(true);
                pSettings.setJavaScriptCanOpenWindowsAutomatically(true);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    pSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
                }
                pSettings.setUserAgentString(sanitizeUserAgent(pSettings.getUserAgentString()));

                CookieManager popupCm = CookieManager.getInstance();
                popupCm.setAcceptCookie(true);
                popupCm.setAcceptThirdPartyCookies(popupWebView, true);

                LinearLayout dialogContainer = new LinearLayout(MainActivity.this);
                dialogContainer.setOrientation(LinearLayout.VERTICAL);
                dialogContainer.setBackgroundColor(Color.parseColor("#09090B"));
                dialogContainer.setLayoutParams(new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                ));

                // Compact top bar with close button so the user is never trapped on OAuth screens
                LinearLayout topBar = new LinearLayout(MainActivity.this);
                topBar.setOrientation(LinearLayout.HORIZONTAL);
                topBar.setGravity(Gravity.CENTER_VERTICAL);
                topBar.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
                topBar.setBackgroundColor(Color.parseColor("#0D1117"));
                topBar.setPadding(dp(14), dp(8), dp(14), dp(8));

                TextView titleTv = new TextView(MainActivity.this);
                titleTv.setText("تسجيل الدخول بحساب Google");
                titleTv.setTextColor(Color.parseColor("#E4E4E7"));
                titleTv.setTextSize(14f);
                topBar.addView(titleTv, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

                Dialog dialog = new Dialog(MainActivity.this, android.R.style.Theme_DeviceDefault_NoActionBar);

                Button closeBtn = new Button(MainActivity.this);
                closeBtn.setText("إغلاق");
                closeBtn.setAllCaps(false);
                closeBtn.setTextColor(Color.parseColor("#A1A1AA"));
                closeBtn.setBackgroundColor(Color.TRANSPARENT);
                closeBtn.setOnClickListener(v -> dialog.dismiss());
                topBar.addView(closeBtn, new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        dp(36)
                ));

                dialogContainer.addView(topBar, new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                ));
                dialogContainer.addView(popupWebView, new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        0,
                        1f
                ));

                dialog.setContentView(dialogContainer);
                if (dialog.getWindow() != null) {
                    dialog.getWindow().setLayout(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                    );
                }

                dialog.setOnDismissListener(d -> {
                    CookieManager.getInstance().flush();
                    try {
                        popupWebView.stopLoading();
                        popupWebView.destroy();
                    } catch (Exception ignored) {
                    }
                });

                popupWebView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        CookieManager.getInstance().flush();
                        if (dialog.isShowing()) {
                            dialog.dismiss();
                        }
                    }
                });
                popupWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                        Uri uri = req.getUrl();
                        if (uri != null && "https".equalsIgnoreCase(uri.getScheme())
                                && APP_HOST.equalsIgnoreCase(uri.getHost())) {
                            String p = uri.getPath();
                            if (p == null || !p.startsWith("/__/")) {
                                return assetLoader.shouldInterceptRequest(uri);
                            }
                        }
                        return super.shouldInterceptRequest(v, req);
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                        return false;
                    }
                });

                dialog.show();

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popupWebView);
                resultMsg.sendToTarget();
                return true;
            }
        });

        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // Floating sleek Arabic Auto-Update Banner (hidden until GitHub has a newer release)
        updateBar = new LinearLayout(this);
        updateBar.setOrientation(LinearLayout.HORIZONTAL);
        updateBar.setGravity(Gravity.CENTER_VERTICAL);
        updateBar.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        updateBar.setPadding(dp(14), dp(10), dp(14), dp(10));
        GradientDrawable barBg = new GradientDrawable();
        barBg.setColor(Color.parseColor("#06281E"));
        barBg.setStroke(dp(1), Color.parseColor("#10B981"));
        barBg.setCornerRadius(dp(14));
        updateBar.setBackground(barBg);
        updateBar.setVisibility(View.GONE);

        updateBarText = new TextView(this);
        updateBarText.setTextColor(Color.parseColor("#ECFDF5"));
        updateBarText.setTextSize(13f);
        LinearLayout.LayoutParams txtLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        updateBar.addView(updateBarText, txtLp);

        Button installBtn = new Button(this);
        installBtn.setText("تثبيت");
        installBtn.setAllCaps(false);
        installBtn.setTextColor(Color.parseColor("#022C22"));
        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(Color.parseColor("#10B981"));
        btnBg.setCornerRadius(dp(10));
        installBtn.setBackground(btnBg);
        installBtn.setOnClickListener(v -> startPendingUpdateDownload());
        LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(dp(76), dp(36));
        btnLp.setMarginStart(dp(8));
        updateBar.addView(installBtn, btnLp);

        FrameLayout.LayoutParams barLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
        );
        barLp.setMargins(dp(12), dp(42), dp(12), 0);
        root.addView(updateBar, barLp);

        setContentView(root);
        String widgetAction = readWidgetAction(getIntent());
        webView.loadUrl(widgetAction != null ? APP_ORIGIN + "?action=" + widgetAction : APP_ORIGIN);
    }

    private void handleIncomingUpdateIntent(Intent intent) {
        if (intent == null || !intent.getBooleanExtra("trigger_update", false)) return;
        String tag = intent.getStringExtra(DayRhythmSyncService.EXTRA_UPDATE_TAG);
        String url = intent.getStringExtra(DayRhythmSyncService.EXTRA_UPDATE_URL);
        if (tag != null && url != null && !url.isEmpty()) {
            showUpdateBanner(tag, url);
            startPendingUpdateDownload();
        }
    }

    private void checkUpdatesOnLaunch() {
        executor.execute(() -> {
            GitHubUpdater.UpdateInfo info = GitHubUpdater.checkLatestRelease(MainActivity.this);
            if (info != null && info.hasUpdate) {
                // Automatic Silent Hot Update on launch when lightweight Web OTA zip is available!
                if (info.webOtaZipUrl != null && !info.webOtaZipUrl.isEmpty()) {
                    boolean hotOk = GitHubUpdater.downloadAndApplyWebOta(
                            MainActivity.this,
                            info.webOtaZipUrl,
                            info.latestTag
                    );
                    if (hotOk) {
                        final String appliedTag = info.latestTag;
                        runOnUiThread(() -> {
                            if (updateBar != null) updateBar.setVisibility(View.GONE);
                            Toast.makeText(
                                    MainActivity.this,
                                    "🚀 تم تطبيق التحديث الفوري تلقائياً (" + appliedTag + ") ✓",
                                    Toast.LENGTH_LONG
                            ).show();
                            if (webView != null) {
                                webView.clearCache(true);
                                webView.loadUrl(APP_ORIGIN + "?hot=" + System.currentTimeMillis());
                            }
                        });
                        return;
                    }
                }
                runOnUiThread(() -> showUpdateBanner(info.latestTag, info.apkDownloadUrl, info.webOtaZipUrl));
            }
        });
    }

    private void showUpdateBanner(String tag, String url) {
        if (url != null && url.toLowerCase().endsWith(".zip")) {
            showUpdateBanner(tag, "", url);
        } else {
            showUpdateBanner(tag, url, "");
        }
    }

    private void showUpdateBanner(String tag, String apkUrl, String otaZipUrl) {
        pendingUpdateTag = tag;
        pendingUpdateUrl = apkUrl != null ? apkUrl : "";
        pendingOtaZipUrl = otaZipUrl != null ? otaZipUrl : "";
        if (updateBarText != null) {
            boolean isInstantOta = !pendingOtaZipUrl.isEmpty();
            updateBarText.setText(isInstantOta
                    ? "🚀 تحديث فوري جاهز (" + tag + ") — بدون APK"
                    : "🚀 يتوفر إصدار جديد لإيقاع اليوم (" + tag + ")");
        }
        if (updateBar != null) {
            updateBar.setVisibility(View.VISIBLE);
        }
    }

    private void startPendingUpdateDownload() {
        // Fast Path: Instant 2-second Web OTA update inside filesDir/ota_www (NO APK download or reinstall!)
        if (pendingOtaZipUrl != null && !pendingOtaZipUrl.isEmpty()) {
            final String zipUrl = pendingOtaZipUrl;
            final String tag = pendingUpdateTag;
            Toast.makeText(this, "جاري تطبيق التحديث الفوري " + tag + "...", Toast.LENGTH_SHORT).show();
            executor.execute(() -> {
                boolean ok = GitHubUpdater.downloadAndApplyWebOta(MainActivity.this, zipUrl, tag);
                runOnUiThread(() -> {
                    if (ok) {
                        if (updateBar != null) updateBar.setVisibility(View.GONE);
                        Toast.makeText(MainActivity.this, "تم التحديث بنجاح إلى " + tag + " ✓", Toast.LENGTH_LONG).show();
                        if (webView != null) {
                            webView.clearCache(true);
                            webView.loadUrl(APP_ORIGIN + "?ota=" + System.currentTimeMillis());
                        }
                    } else if (pendingUpdateUrl != null && !pendingUpdateUrl.isEmpty()) {
                        startApkFallbackDownload();
                    } else {
                        Toast.makeText(MainActivity.this, "تعذر تنزيل التحديث الفوري — حاول مرة أخرى", Toast.LENGTH_LONG).show();
                    }
                });
            });
            return;
        }
        startApkFallbackDownload();
    }

    private void dispatchUpdateStatusToWebView(String status, String version, String message) {
        runOnUiThread(() -> {
            if (webView == null) return;
            try {
                org.json.JSONObject obj = new org.json.JSONObject();
                obj.put("status", status != null ? status : "");
                obj.put("version", version != null ? version : "");
                obj.put("message", message != null ? message : "");
                webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('dayrhythm:update-status',{detail:" + obj.toString() + "}));",
                        null
                );
            } catch (Exception ignored) {
            }
        });
    }

    private void startApkFallbackDownload() {
        if (pendingUpdateUrl == null || pendingUpdateUrl.isEmpty()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(this, "اسمح بتثبيت التحديثات لإيقاع اليوم ثم أعد الضغط", Toast.LENGTH_LONG).show();
            Intent permIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            permIntent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(permIntent);
            return;
        }
        activeDownloadId = GitHubUpdater.enqueueApkDownload(this, pendingUpdateUrl, pendingUpdateTag);
        Toast.makeText(this, "جاري تنزيل التحديث " + pendingUpdateTag + "...", Toast.LENGTH_LONG).show();
    }
}
