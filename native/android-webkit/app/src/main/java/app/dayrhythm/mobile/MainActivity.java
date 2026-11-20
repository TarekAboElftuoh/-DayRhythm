package app.dayrhythm.mobile;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Dialog;
import android.app.DownloadManager;
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
            } else if (Intent.ACTION_BATTERY_CHANGED.equals(action)) {
                int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
                int status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                if (level >= 0 && scale > 0 && webView != null) {
                    int pct = Math.max(0, Math.min(100, Math.round((level * 100f) / scale)));
                    boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING
                            || status == BatteryManager.BATTERY_STATUS_FULL;
                    String model = (Build.MODEL != null && !Build.MODEL.trim().isEmpty())
                            ? Build.MODEL.replace("\\", "").replace("'", "").replace("\"", "")
                            : "Android";
                    String js = "window.__dayRhythmNativeBattery={levelPct:" + pct
                            + ",charging:" + (charging ? "true" : "false")
                            + ",deviceLabel:'" + model + "'};"
                            + "window.dispatchEvent(new CustomEvent('dayrhythm:native-battery',{detail:window.__dayRhythmNativeBattery}));";
                    webView.evaluateJavascript(js, null);
                }
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Official AndroidX WebViewAssetLoader serving APK assets over Firebase-authorized
        //    https://gen-lang-client-0625331922.web.app/ (zero 404, zero unauthorized-domain!)
        assetLoader = buildSpaAssetLoader();

        // 2. Start 24/7 Foreground Service + schedule hourly WorkManager GitHub update checks
        DayRhythmSyncService.startServiceCompat(this);
        UpdateCheckWorker.schedulePeriodicCheck(this);

        // 3. Request Android 13+ notification permission + OnePlus 12R battery optimization whitelist
        requestEssentialPermissions();
        promptBatteryWhitelistOnce();

        // 4. Register receiver for APK downloads, update banners, background WebSocket events, and live battery telemetry
        IntentFilter filter = new IntentFilter();
        filter.addAction(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        filter.addAction(DayRhythmSyncService.ACTION_UPDATE_AVAILABLE);
        filter.addAction(DayRhythmSyncService.ACTION_WS_SYNC_MESSAGE);
        filter.addAction(DayRhythmSyncService.ACTION_NETWORK_RECOVERED);
        filter.addAction(Intent.ACTION_BATTERY_CHANGED);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(nativeEventsReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(nativeEventsReceiver, filter);
        }

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

    private InputStream tryOpenOtaOrAsset(String relativePath) {
        try {
            File otaRoot = GitHubUpdater.getOtaWwwDir(this);
            File otaFile = new File(otaRoot, relativePath);
            if (otaFile.exists() && otaFile.isFile()) {
                return new FileInputStream(otaFile);
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

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingUpdateIntent(intent);
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
        CookieManager.getInstance().flush();
        try {
            unregisterReceiver(nativeEventsReceiver);
        } catch (Exception ignored) {
        }
        executor.shutdownNow();
        super.onDestroy();
    }

    private void requestEssentialPermissions() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                        this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        201
                );
            }
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

        // Expose lightweight JS bridge so in-app Settings can trigger instant GitHub OTA checks
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void checkForUpdates() {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "جاري فحص تحديثات GitHub...", Toast.LENGTH_SHORT).show());
                executor.execute(() -> {
                    GitHubUpdater.UpdateInfo info = GitHubUpdater.checkLatestRelease(MainActivity.this);
                    if (info != null && info.hasUpdate) {
                        runOnUiThread(() -> showUpdateBanner(info.latestTag, info.apkDownloadUrl, info.webOtaZipUrl));
                    } else {
                        runOnUiThread(() -> Toast.makeText(
                                MainActivity.this,
                                "التطبيق محدّث بالفعل (v" + GitHubUpdater.getEffectiveLocalVersion(MainActivity.this) + ") ✓",
                                Toast.LENGTH_SHORT
                        ).show());
                    }
                });
            }
        }, "DayRhythmNative");

        webView.setWebViewClient(new WebViewClient() {
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
                callback.invoke(origin, true, false);
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
        webView.loadUrl(APP_ORIGIN);
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
                runOnUiThread(() -> showUpdateBanner(info.latestTag, info.apkDownloadUrl, info.webOtaZipUrl));
            }
        });
    }

    private void showUpdateBanner(String tag, String url) {
        showUpdateBanner(tag, url, "");
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
