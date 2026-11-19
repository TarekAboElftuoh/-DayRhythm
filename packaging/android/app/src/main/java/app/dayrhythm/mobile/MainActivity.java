package app.dayrhythm.mobile;

import android.Manifest;
import android.app.Activity;
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
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    public static final String PREFS_NAME = "dayrhythm_mobile_prefs";
    public static final String KEY_APP_URL = "saved_app_url";

    private final ExecutorService executor = Executors.newCachedThreadPool();
    private TextView statusText;
    private TextView updateBannerText;
    private Button updateButton;
    private EditText urlInput;
    private AutoUpdateManager.UpdateInfo pendingUpdate;
    private long activeDownloadId = -1L;
    private boolean hasLaunchedWebOnce = false;

    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
            if (id != -1L && id == activeDownloadId) {
                Toast.makeText(context, "اكتمل تنزيل التحديث — جاري فتح المثبّت", Toast.LENGTH_LONG).show();
                AutoUpdateManager.installDownloadedApk(context);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Start 24/7 background keep-alive service immediately
        DayRhythmKeepAliveService.startServiceCompat(this);

        // Request Android 13+ notification permission
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                        this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        200
                );
            }
        }

        // Register download completion receiver cleanly (Android 14+ compliant)
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(downloadReceiver, filter);
        }

        buildAmoledUi();

        boolean fromUpdateNotification = getIntent() != null && getIntent().getBooleanExtra("trigger_update", false);
        checkUpdatesAsync(fromUpdateNotification);
        if (!fromUpdateNotification) {
            probeAndLaunch(getSavedUrl(), true);
        }
    }

    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(downloadReceiver);
        } catch (Exception ignored) {
        }
        executor.shutdownNow();
        super.onDestroy();
    }

    private String getSavedUrl() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String saved = prefs.getString(KEY_APP_URL, BuildConfig.DEFAULT_APP_URL);
        return normalizeUrl(saved);
    }

    private void saveUrl(String raw) {
        String clean = normalizeUrl(raw);
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString(KEY_APP_URL, clean)
                .apply();
    }

    private String normalizeUrl(String raw) {
        String s = raw == null ? "" : raw.trim().replaceAll("/+$", "");
        if (s.isEmpty()) return BuildConfig.DEFAULT_APP_URL;
        if (!s.startsWith("http://") && !s.startsWith("https://")) {
            return "https://" + s;
        }
        return s;
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    private GradientDrawable roundedBg(int fillColor, int strokeColor, int radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fillColor);
        d.setCornerRadius(dp(radiusDp));
        if (strokeColor != 0) {
            d.setStroke(dp(1), strokeColor);
        }
        return d;
    }

    private void buildAmoledUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.BLACK);
        scroll.setFillViewport(true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_VERTICAL);
        root.setPadding(dp(20), dp(42), dp(20), dp(32));
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(roundedBg(Color.parseColor("#0B0B0D"), Color.parseColor("#27272A"), 20));
        card.setPadding(dp(20), dp(22), dp(20), dp(22));

        TextView badge = new TextView(this);
        badge.setText("إيقاع اليوم · OnePlus 12R (يعمل 24/7 في الخلفية)");
        badge.setTextColor(Color.parseColor("#34D399"));
        badge.setTextSize(12);
        badge.setPadding(dp(10), dp(5), dp(10), dp(5));
        badge.setBackground(roundedBg(Color.parseColor("#07261C"), Color.parseColor("#10B981"), 10));
        card.addView(badge);

        TextView title = new TextView(this);
        title.setText("إيقاع اليوم | DayRhythm");
        title.setTextColor(Color.WHITE);
        title.setTextSize(21);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        titleLp.topMargin = dp(14);
        card.addView(title, titleLp);

        TextView versionLabel = new TextView(this);
        versionLabel.setText("الإصدار الحالي: v" + BuildConfig.VERSION_NAME + " · تحديث تلقائي عبر GitHub");
        versionLabel.setTextColor(Color.parseColor("#A1A1AA"));
        versionLabel.setTextSize(12.5f);
        LinearLayout.LayoutParams verLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        verLp.topMargin = dp(4);
        card.addView(versionLabel, verLp);

        statusText = new TextView(this);
        statusText.setText("جاري فحص الاتصال بالسحابة...");
        statusText.setTextColor(Color.parseColor("#E4E4E7"));
        statusText.setTextSize(13.5f);
        statusText.setPadding(dp(12), dp(12), dp(12), dp(12));
        statusText.setBackground(roundedBg(Color.parseColor("#141418"), Color.parseColor("#27272A"), 12));
        LinearLayout.LayoutParams statusLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        statusLp.topMargin = dp(16);
        card.addView(statusText, statusLp);

        updateBannerText = new TextView(this);
        updateBannerText.setVisibility(View.GONE);
        updateBannerText.setTextColor(Color.parseColor("#6EE7B7"));
        updateBannerText.setTextSize(13f);
        updateBannerText.setPadding(dp(12), dp(10), dp(12), dp(10));
        updateBannerText.setBackground(roundedBg(Color.parseColor("#06281E"), Color.parseColor("#10B981"), 12));
        LinearLayout.LayoutParams bannerLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bannerLp.topMargin = dp(12);
        card.addView(updateBannerText, bannerLp);

        updateButton = new Button(this);
        updateButton.setVisibility(View.GONE);
        updateButton.setText("تنزيل وتثبيت التحديث التلقائي الآن");
        updateButton.setAllCaps(false);
        updateButton.setTextColor(Color.BLACK);
        updateButton.setBackground(roundedBg(Color.parseColor("#10B981"), 0, 12));
        updateButton.setOnClickListener(v -> startPendingUpdateDownload());
        LinearLayout.LayoutParams updBtnLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(46));
        updBtnLp.topMargin = dp(10);
        card.addView(updateButton, updBtnLp);

        TextView urlLabel = new TextView(this);
        urlLabel.setText("رابط السحابة الدائم (بعد النشر عبر Deploy / Share):");
        urlLabel.setTextColor(Color.parseColor("#D4D4D8"));
        urlLabel.setTextSize(12.5f);
        LinearLayout.LayoutParams lblLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lblLp.topMargin = dp(18);
        card.addView(urlLabel, lblLp);

        urlInput = new EditText(this);
        urlInput.setText(getSavedUrl());
        urlInput.setTextColor(Color.WHITE);
        urlInput.setHintTextColor(Color.parseColor("#71717A"));
        urlInput.setHint("https://your-app.run.app");
        urlInput.setTextSize(13.5f);
        urlInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        urlInput.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        urlInput.setPadding(dp(12), dp(11), dp(12), dp(11));
        urlInput.setBackground(roundedBg(Color.parseColor("#141418"), Color.parseColor("#3F3F46"), 12));
        LinearLayout.LayoutParams inpLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        inpLp.topMargin = dp(6);
        card.addView(urlInput, inpLp);

        Button openBtn = new Button(this);
        openBtn.setText("حفظ الرابط وفتح إيقاع اليوم");
        openBtn.setAllCaps(false);
        openBtn.setTextColor(Color.parseColor("#022C22"));
        openBtn.setBackground(roundedBg(Color.parseColor("#10B981"), 0, 12));
        openBtn.setOnClickListener(v -> {
            String entered = urlInput.getText().toString();
            saveUrl(entered);
            probeAndLaunch(getSavedUrl(), false);
        });
        LinearLayout.LayoutParams openLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        openLp.topMargin = dp(12);
        card.addView(openBtn, openLp);

        Button batteryBtn = new Button(this);
        batteryBtn.setText("تثبيت العمل 24/7 في الخلفية (تجاوز بطارية OnePlus)");
        batteryBtn.setAllCaps(false);
        batteryBtn.setTextColor(Color.parseColor("#E4E4E7"));
        batteryBtn.setBackground(roundedBg(Color.parseColor("#18181B"), Color.parseColor("#3F3F46"), 12));
        batteryBtn.setOnClickListener(v -> requestIgnoreBatteryOptimization());
        LinearLayout.LayoutParams batLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(46));
        batLp.topMargin = dp(10);
        card.addView(batteryBtn, batLp);

        Button checkUpdateBtn = new Button(this);
        checkUpdateBtn.setText("فحص التحديثات الجديدة الآن (GitHub)");
        checkUpdateBtn.setAllCaps(false);
        checkUpdateBtn.setTextColor(Color.parseColor("#E4E4E7"));
        checkUpdateBtn.setBackground(roundedBg(Color.parseColor("#18181B"), Color.parseColor("#3F3F46"), 12));
        checkUpdateBtn.setOnClickListener(v -> checkUpdatesAsync(true));
        LinearLayout.LayoutParams chkLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(46));
        chkLp.topMargin = dp(10);
        card.addView(checkUpdateBtn, chkLp);

        root.addView(card);
        scroll.addView(root);
        setContentView(scroll);
    }

    private void requestIgnoreBatteryOptimization() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && pm.isIgnoringBatteryOptimizations(getPackageName())) {
                Toast.makeText(this, "العمل الدائم في الخلفية مفعّل بالفعل ✓", Toast.LENGTH_SHORT).show();
                return;
            }
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "افتح إعدادات البطارية للتطبيق واختر السماح بالعمل في الخلفية", Toast.LENGTH_LONG).show();
        }
    }

    private void checkUpdatesAsync(boolean showToastWhenUpToDate) {
        executor.execute(() -> {
            AutoUpdateManager.UpdateInfo info = AutoUpdateManager.checkLatestRelease(this);
            runOnUiThread(() -> {
                if (info != null && info.hasUpdate) {
                    pendingUpdate = info;
                    updateBannerText.setText("يتوفر تحديث جديد (" + info.latestTag + ") جاهز للتثبيت التلقائي على OnePlus 12R");
                    updateBannerText.setVisibility(View.VISIBLE);
                    updateButton.setVisibility(View.VISIBLE);
                } else if (showToastWhenUpToDate) {
                    Toast.makeText(this, "أنت تستخدم أحدث إصدار بالفعل (v" + BuildConfig.VERSION_NAME + ")", Toast.LENGTH_SHORT).show();
                }
            });
        });
    }

    private void startPendingUpdateDownload() {
        if (pendingUpdate == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(this, "اسمح بتثبيت التحديثات لهذا التطبيق ثم أعد الضغط", Toast.LENGTH_LONG).show();
            Intent permIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            permIntent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(permIntent);
            return;
        }
        activeDownloadId = AutoUpdateManager.enqueueApkDownload(this, pendingUpdate.apkDownloadUrl, pendingUpdate.latestTag);
        Toast.makeText(this, "جاري تنزيل التحديث " + pendingUpdate.latestTag + "...", Toast.LENGTH_LONG).show();
    }

    private void probeAndLaunch(String targetUrl, boolean autoLaunch) {
        statusText.setText("جاري التحقق من رابط السحابة...");
        executor.execute(() -> {
            int code = -1;
            String errMsg = "";
            HttpURLConnection conn = null;
            try {
                URL url = new URL(targetUrl + "/api/health");
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.setRequestMethod("GET");
                code = conn.getResponseCode();
            } catch (Exception e) {
                errMsg = e.getMessage() != null ? e.getMessage() : "لا يوجد اتصال";
            } finally {
                if (conn != null) conn.disconnect();
            }

            final int finalCode = code;
            final String finalErr = errMsg;
            runOnUiThread(() -> {
                if (finalCode >= 200 && finalCode < 400) {
                    statusText.setText("متصل بالسحابة بنجاح ✓ — جاري فتح إيقاع اليوم...");
                    if (!autoLaunch || !hasLaunchedWebOnce) {
                        hasLaunchedWebOnce = true;
                        openInAmoledCustomTab(targetUrl);
                    }
                } else if (finalCode == 404) {
                    statusText.setText(
                            "الرابط أعاد خطأ 404 (Page not found).\n"
                            + "تأكد من الضغط على Deploy / Share في AI Studio ثم الصق الرابط المنشور الدائم بالأسفل واضغط «حفظ الرابط وفتح إيقاع اليوم»."
                    );
                } else {
                    statusText.setText(
                            "تعذر الاتصال بالسحابة (" + (finalCode > 0 ? "HTTP " + finalCode : finalErr) + ").\n"
                            + "تأكد من الإنترنت أو ضع رابط النشر الدائم بالأسفل."
                    );
                }
            });
        });
    }

    private void openInAmoledCustomTab(String targetUrl) {
        CustomTabColorSchemeParams darkParams = new CustomTabColorSchemeParams.Builder()
                .setToolbarColor(Color.BLACK)
                .setNavigationBarColor(Color.BLACK)
                .setNavigationBarDividerColor(Color.BLACK)
                .build();

        CustomTabsIntent customTabsIntent = new CustomTabsIntent.Builder()
                .setDefaultColorSchemeParams(darkParams)
                .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
                .setShowTitle(false)
                .setUrlBarHidingEnabled(true)
                .build();

        customTabsIntent.launchUrl(this, Uri.parse(targetUrl));
    }
}
