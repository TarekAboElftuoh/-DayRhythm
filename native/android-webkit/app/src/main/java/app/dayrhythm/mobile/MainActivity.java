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

import java.io.ByteArrayInputStream;
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
    private static final String APP_ORIGIN = "https://localhost/";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private LinearLayout updateBar;
    private TextView updateBarText;
    private String pendingUpdateTag = "";
    private String pendingUpdateUrl = "";
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
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Official AndroidX WebViewAssetLoader serving APK assets over https://localhost/
        //    (Zero TCP ports, zero cleartext HTTP, zero 404, 100% Firebase Auth authorized!)
        assetLoader = buildSpaAssetLoader();

        // 2. Start 24/7 Foreground Service + schedule hourly WorkManager GitHub update checks
        DayRhythmSyncService.startServiceCompat(this);
        UpdateCheckWorker.schedulePeriodicCheck(this);

        // 3. Request Android 13+ notification permission + OnePlus 12R battery optimization whitelist
        requestEssentialPermissions();
        promptBatteryWhitelistOnce();

        // 4. Register receiver for APK downloads, update banners, and background WebSocket events
        IntentFilter filter = new IntentFilter();
        filter.addAction(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        filter.addAction(DayRhythmSyncService.ACTION_UPDATE_AVAILABLE);
        filter.addAction(DayRhythmSyncService.ACTION_WS_SYNC_MESSAGE);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(nativeEventsReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(nativeEventsReceiver, filter);
        }

        buildWebViewUi();

        handleIncomingUpdateIntent(getIntent());
        checkUpdatesOnLaunch();
    }

    private WebViewAssetLoader buildSpaAssetLoader() {
        return new WebViewAssetLoader.Builder()
                .setDomain("localhost")
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
                    InputStream stream = tryOpenAsset("www/" + clean);
                    if (stream == null) {
                        resolved = "index.html";
                        stream = tryOpenAsset("www/index.html");
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

        // Strip "; wv)" from User-Agent so Google Sign-In works seamlessly
        String ua = settings.getUserAgentString();
        if (ua != null) {
            settings.setUserAgentString(ua.replace("; wv)", ")"));
        }

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && "https".equalsIgnoreCase(uri.getScheme())
                        && "localhost".equalsIgnoreCase(uri.getHost())) {
                    return assetLoader.shouldInterceptRequest(uri);
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() != null ? uri.getHost().toLowerCase() : "";
                if (host.equals("localhost")
                        || host.equals("127.0.0.1")
                        || host.endsWith("google.com")
                        || host.endsWith("googleapis.com")
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
                WebSettings pSettings = popupWebView.getSettings();
                pSettings.setJavaScriptEnabled(true);
                pSettings.setDomStorageEnabled(true);
                pSettings.setJavaScriptCanOpenWindowsAutomatically(true);
                String pUa = pSettings.getUserAgentString();
                if (pUa != null) {
                    pSettings.setUserAgentString(pUa.replace("; wv)", ")"));
                }
                CookieManager.getInstance().setAcceptThirdPartyCookies(popupWebView, true);

                Dialog dialog = new Dialog(MainActivity.this, android.R.style.Theme_DeviceDefault_NoActionBar);
                dialog.setContentView(popupWebView);
                popupWebView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        dialog.dismiss();
                    }
                });
                popupWebView.setWebViewClient(new WebViewClient() {
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
            GitHubUpdater.UpdateInfo info = GitHubUpdater.checkLatestRelease();
            if (info != null && info.hasUpdate) {
                runOnUiThread(() -> showUpdateBanner(info.latestTag, info.apkDownloadUrl));
            }
        });
    }

    private void showUpdateBanner(String tag, String url) {
        pendingUpdateTag = tag;
        pendingUpdateUrl = url;
        if (updateBarText != null) {
            updateBarText.setText("🚀 يتوفر إصدار جديد لإيقاع اليوم (" + tag + ")");
        }
        if (updateBar != null) {
            updateBar.setVisibility(View.VISIBLE);
        }
    }

    private void startPendingUpdateDownload() {
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
