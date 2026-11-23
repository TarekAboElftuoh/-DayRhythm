package app.dayrhythm.mobile;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * High-visibility Lock Screen Alert Card tailored for OnePlus 12R (1.5K 19.8:9 ProXDR AMOLED).
 * Replicates the exact visual design of the PC desktop alert card (SecondaryScreenAlert):
 * - AMOLED Pure Black canvas
 * - Breathing aqua / coral pulsing ring around the category emoji
 * - Category badge with live 12h time
 * - Clean bold title and description
 * - Live elapsed stopwatch ("بدأ من 00:15")
 * - Big primary action button ("شربت كوب ماء" / "أخذت الجرعة" / "تم")
 * - 3-tier Snooze row (5m, 10m, 15m)
 * - Dismiss-only action
 */
public class AlarmActivity extends Activity {
    public static final String ACTION_CLOSE_ALARM_UI = "app.dayrhythm.mobile.ACTION_CLOSE_ALARM_UI";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long startedAtMs = 0L;
    private TextView elapsedView = null;
    private ObjectAnimator pulseAnim = null;
    private ObjectAnimator cardAlphaAnim = null;
    private ObjectAnimator cardScaleXAnim = null;
    private ObjectAnimator cardScaleYAnim = null;
    private PowerManager.WakeLock activityWakeLock = null;

    private final Runnable elapsedRunnable = new Runnable() {
        @Override
        public void run() {
            if (isFinishing() || isDestroyed()) return;
            if (elapsedView != null && startedAtMs > 0L) {
                long sec = Math.max(0L, (System.currentTimeMillis() - startedAtMs) / 1000L);
                long m = sec / 60L;
                long s = sec % 60L;
                String timeStr = String.format(Locale.US, "%02d:%02d", m, s);
                elapsedView.setText("بدأ من " + timeStr);
            }
            handler.postDelayed(this, 1000L);
        }
    };

    private final BroadcastReceiver closeReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            finish();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setVolumeControlStream(android.media.AudioManager.STREAM_ALARM);

        // Turn on screen and show over lock screen (unconditionally on OnePlus OxygenOS / Android)
        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                        | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                        | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            try {
                android.app.KeyguardManager km = (android.app.KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                if (km != null) {
                    km.requestDismissKeyguard(this, null);
                }
            } catch (Exception ignored) {
            }
        }

        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                activityWakeLock = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                                | PowerManager.ACQUIRE_CAUSES_WAKEUP
                                | PowerManager.ON_AFTER_RELEASE,
                        "DayRhythm:AlarmActivityWakeLock"
                );
                activityWakeLock.acquire(60_000L);
            }
        } catch (Exception ignored) {
        }

        // Auto-dismiss safety timeout after 120s
        handler.postDelayed(() -> {
            if (!isFinishing()) {
                ReminderAlarmReceiver.stopRinging();
                finish();
            }
        }, 120_000L);

        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);

        startedAtMs = System.currentTimeMillis();

        Intent src = getIntent();
        String title = src != null ? src.getStringExtra(ReminderAlarmReceiver.EXTRA_TITLE) : "";
        String body = src != null ? src.getStringExtra(ReminderAlarmReceiver.EXTRA_BODY) : "";
        String kind = src != null ? src.getStringExtra(ReminderAlarmReceiver.EXTRA_KIND) : "general";
        if (kind == null) kind = "general";

        boolean isMed = "medication".equals(kind);
        boolean isWater = "water".equals(kind);
        boolean isCharge = "charge".equals(kind);
        int accentColor = isMed ? 0xFFFB7185 : isCharge ? 0xFF4ADE80 : 0xFF7FFFD4; // Rose for meds, Emerald for battery, Aqua for others

        // Extract emoji and clean title
        String emoji = isWater ? "💧" : isMed ? "💊" : isCharge ? "🔋" : "prayer".equals(kind) ? "🕌" : "general".equals(kind) ? "🔔" : "📅";
        String cleanTitle = title == null ? "" : title.trim();
        if (!cleanTitle.isEmpty()) {
            int cp = cleanTitle.codePointAt(0);
            if (Character.getType(cp) == Character.OTHER_SYMBOL || Character.isSurrogate(cleanTitle.charAt(0))) {
                int end = cleanTitle.indexOf(' ');
                if (end > 0) {
                    emoji = cleanTitle.substring(0, end);
                    cleanTitle = cleanTitle.substring(end + 1).trim();
                }
            }
        }
        if (cleanTitle.isEmpty()) {
            cleanTitle = isWater ? "موعد شرب كوب ماء" : isMed ? "موعد تناول العلاج" : isCharge ? "وصل شحن البطارية للحد المحدد" : "تنبيه إيقاع اليوم";
        }

        String sourceLabel = isWater
                ? "ترطيب يومي"
                : isMed
                    ? "العلاجات والأدوية"
                    : isCharge
                        ? "حماية البطارية الذكية"
                        : "prayer".equals(kind)
                            ? "مواقيت الصلاة"
                            : "calendar".equals(kind) || "event".equals(kind)
                                ? "تقويم Google"
                                : "task".equals(kind)
                                    ? "مهام اليوم"
                                    : "إيقاع اليوم";

        String timeNow12h = new SimpleDateFormat("hh:mm a", new Locale("ar")).format(new Date());

        // Root container: Full screen pure AMOLED black
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);

        // Center card container
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        card.setPadding(dp(22), dp(26), dp(22), dp(24));

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(0xFF0B0E14); // Dark obsidian glass
        cardBg.setCornerRadius(dp(30));
        cardBg.setStroke(dp(2), accentColor);
        card.setBackground(cardBg);

        FrameLayout.LayoutParams cardLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
        );
        cardLp.leftMargin = dp(18);
        cardLp.rightMargin = dp(18);
        card.setLayoutParams(cardLp);

        // Eye-catching breathing & pulsing animation for OnePlus 12R lock screen ("تبداء تظهر وتطفي")
        cardAlphaAnim = ObjectAnimator.ofFloat(card, "alpha", 0.72f, 1.0f);
        cardAlphaAnim.setDuration(750);
        cardAlphaAnim.setRepeatMode(ValueAnimator.REVERSE);
        cardAlphaAnim.setRepeatCount(ValueAnimator.INFINITE);
        cardAlphaAnim.start();

        cardScaleXAnim = ObjectAnimator.ofFloat(card, "scaleX", 0.985f, 1.015f);
        cardScaleXAnim.setDuration(750);
        cardScaleXAnim.setRepeatMode(ValueAnimator.REVERSE);
        cardScaleXAnim.setRepeatCount(ValueAnimator.INFINITE);
        cardScaleXAnim.start();

        cardScaleYAnim = ObjectAnimator.ofFloat(card, "scaleY", 0.985f, 1.015f);
        cardScaleYAnim.setDuration(750);
        cardScaleYAnim.setRepeatMode(ValueAnimator.REVERSE);
        cardScaleYAnim.setRepeatCount(ValueAnimator.INFINITE);
        cardScaleYAnim.start();

        // 1. Emoji Breathing Glow Ring
        FrameLayout ringContainer = new FrameLayout(this);
        LinearLayout.LayoutParams ringContainerLp = new LinearLayout.LayoutParams(dp(108), dp(108));
        ringContainerLp.bottomMargin = dp(16);
        ringContainer.setLayoutParams(ringContainerLp);

        // Outer pulsing glow
        View outerGlow = new View(this);
        GradientDrawable glowBg = new GradientDrawable();
        glowBg.setShape(GradientDrawable.OVAL);
        glowBg.setColor(accentColor & 0x28FFFFFF);
        outerGlow.setBackground(glowBg);
        FrameLayout.LayoutParams glowLp = new FrameLayout.LayoutParams(dp(108), dp(108), Gravity.CENTER);
        ringContainer.addView(outerGlow, glowLp);

        pulseAnim = ObjectAnimator.ofFloat(outerGlow, "alpha", 0.35f, 0.95f);
        pulseAnim.setDuration(1200);
        pulseAnim.setRepeatMode(ValueAnimator.REVERSE);
        pulseAnim.setRepeatCount(ValueAnimator.INFINITE);
        pulseAnim.start();

        // Inner solid circle
        TextView emojiView = new TextView(this);
        emojiView.setText(emoji);
        emojiView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 44);
        emojiView.setGravity(Gravity.CENTER);
        GradientDrawable innerRing = new GradientDrawable();
        innerRing.setShape(GradientDrawable.OVAL);
        innerRing.setColor(Color.BLACK);
        innerRing.setStroke(dp(2), accentColor & 0xAAFFFFFF);
        emojiView.setBackground(innerRing);
        FrameLayout.LayoutParams innerRingLp = new FrameLayout.LayoutParams(dp(86), dp(86), Gravity.CENTER);
        ringContainer.addView(emojiView, innerRingLp);

        card.addView(ringContainer);

        // 2. Source Badge (e.g., ترطيب يومي · 06:30 م)
        TextView sourceView = new TextView(this);
        sourceView.setText(sourceLabel + " · " + timeNow12h);
        sourceView.setTextColor(accentColor);
        sourceView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        sourceView.setTypeface(Typeface.DEFAULT_BOLD);
        sourceView.setGravity(Gravity.CENTER);
        card.addView(sourceView);

        // 3. Title
        TextView titleView = new TextView(this);
        titleView.setText(cleanTitle);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 25);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        titleLp.topMargin = dp(8);
        card.addView(titleView, titleLp);

        // 4. Description (body)
        if (body != null && !body.trim().isEmpty()) {
            TextView bodyView = new TextView(this);
            bodyView.setText(body.trim());
            bodyView.setTextColor(0xFFD4D4D8);
            bodyView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            bodyView.setGravity(Gravity.CENTER);
            bodyView.setLineSpacing(dp(3), 1.0f);
            LinearLayout.LayoutParams bodyLp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            bodyLp.topMargin = dp(6);
            card.addView(bodyView, bodyLp);
        }

        // 5. Elapsed Counter ("بدأ من 00:00")
        elapsedView = new TextView(this);
        elapsedView.setText("بدأ من 00:00");
        elapsedView.setTextColor(0xFF71717A);
        elapsedView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        elapsedView.setTypeface(Typeface.MONOSPACE);
        elapsedView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams elapsedLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        elapsedLp.topMargin = dp(12);
        card.addView(elapsedView, elapsedLp);

        // 6. Big Primary Action Button
        String primaryLabel = isWater ? "شربت كوب ماء" : isMed ? "أخذت الجرعة" : isCharge ? "فصلت الشاحن" : "تم";
        TextView primaryBtn = new TextView(this);
        primaryBtn.setText(primaryLabel);
        primaryBtn.setGravity(Gravity.CENTER);
        primaryBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        primaryBtn.setTypeface(Typeface.DEFAULT_BOLD);
        primaryBtn.setTextColor(Color.BLACK);
        GradientDrawable pBg = new GradientDrawable();
        pBg.setCornerRadius(dp(18));
        pBg.setColor(accentColor);
        primaryBtn.setBackground(pBg);
        primaryBtn.setOnClickListener(v -> sendDoneAction());

        LinearLayout.LayoutParams pLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(54));
        pLp.topMargin = dp(24);
        card.addView(primaryBtn, pLp);

        // 7. Snooze Row (5m, 10m, 15m)
        LinearLayout snoozeRow = new LinearLayout(this);
        snoozeRow.setOrientation(LinearLayout.HORIZONTAL);
        snoozeRow.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        LinearLayout.LayoutParams sRowLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sRowLp.topMargin = dp(10);
        snoozeRow.setLayoutParams(sRowLp);

        int[] snoozeOptions = new int[]{5, 10, 15};
        for (int i = 0; i < snoozeOptions.length; i++) {
            final int sMin = snoozeOptions[i];
            TextView sBtn = new TextView(this);
            sBtn.setText("تأجيل " + sMin + " د");
            sBtn.setGravity(Gravity.CENTER);
            sBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            sBtn.setTypeface(Typeface.DEFAULT_BOLD);
            sBtn.setTextColor(0xFFE4E4E7);

            GradientDrawable sBg = new GradientDrawable();
            sBg.setCornerRadius(dp(14));
            sBg.setColor(0xFF181B22);
            sBg.setStroke(dp(1), 0x33FFFFFF);
            sBtn.setBackground(sBg);
            sBtn.setOnClickListener(v -> sendSnoozeAction(sMin));

            LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(
                    0, dp(44), 1.0f);
            if (i > 0) {
                btnLp.rightMargin = dp(6);
            }
            snoozeRow.addView(sBtn, btnLp);
        }
        card.addView(snoozeRow);

        // 8. Dismiss Only Link
        TextView dismissBtn = new TextView(this);
        dismissBtn.setText("إيقاف التنبيه فقط");
        dismissBtn.setGravity(Gravity.CENTER);
        dismissBtn.setTextColor(0xFF71717A);
        dismissBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        dismissBtn.setPadding(dp(12), dp(10), dp(12), dp(6));
        dismissBtn.setOnClickListener(v -> sendDismissAction());

        LinearLayout.LayoutParams disLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        disLp.topMargin = dp(6);
        card.addView(dismissBtn, disLp);

        root.addView(card);
        setContentView(root);

        // Start live elapsed timer
        handler.post(elapsedRunnable);

        // Register close broadcast listener
        IntentFilter f = new IntentFilter(ACTION_CLOSE_ALARM_UI);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(closeReceiver, f, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(closeReceiver, f);
        }
    }

    private void sendDoneAction() {
        Intent src = getIntent();
        Intent i = new Intent(this, ReminderAlarmReceiver.class);
        i.setAction(ReminderAlarmReceiver.ACTION_MARK_DONE);
        if (src != null) i.putExtras(src);
        sendBroadcast(i);
        finish();
    }

    private void sendSnoozeAction(int minutes) {
        Intent src = getIntent();
        Intent i = new Intent(this, ReminderAlarmReceiver.class);
        i.setAction(ReminderAlarmReceiver.ACTION_SNOOZE);
        if (src != null) i.putExtras(src);
        i.putExtra(ReminderAlarmReceiver.EXTRA_SNOOZE_MIN, minutes);
        sendBroadcast(i);
        finish();
    }

    private void sendDismissAction() {
        Intent src = getIntent();
        Intent i = new Intent(this, ReminderAlarmReceiver.class);
        i.setAction(ReminderAlarmReceiver.ACTION_DISMISS);
        if (src != null) i.putExtras(src);
        sendBroadcast(i);
        finish();
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(elapsedRunnable);
        if (pulseAnim != null && pulseAnim.isRunning()) pulseAnim.cancel();
        if (cardAlphaAnim != null && cardAlphaAnim.isRunning()) cardAlphaAnim.cancel();
        if (cardScaleXAnim != null && cardScaleXAnim.isRunning()) cardScaleXAnim.cancel();
        if (cardScaleYAnim != null && cardScaleYAnim.isRunning()) cardScaleYAnim.cancel();
        if (activityWakeLock != null && activityWakeLock.isHeld()) {
            try {
                activityWakeLock.release();
            } catch (Exception ignored) {
            }
            activityWakeLock = null;
        }
        try {
            unregisterReceiver(closeReceiver);
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }
}
