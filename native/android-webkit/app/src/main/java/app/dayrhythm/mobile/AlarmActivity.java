package app.dayrhythm.mobile;

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
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Full-screen alert shown when the phone is locked / screen off (launched by the notification's
 * full-screen intent). When the phone is in use, Android shows the heads-up notification instead,
 * so you're never interrupted mid-screen. Same look as the app: AMOLED black, aqua accent.
 */
public class AlarmActivity extends Activity {
    public static final String ACTION_CLOSE_ALARM_UI = "app.dayrhythm.mobile.ACTION_CLOSE_ALARM_UI";

    private final BroadcastReceiver closeReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            finish();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);

        Intent src = getIntent();
        String title = src.getStringExtra(ReminderAlarmReceiver.EXTRA_TITLE);
        String body = src.getStringExtra(ReminderAlarmReceiver.EXTRA_BODY);
        String kind = src.getStringExtra(ReminderAlarmReceiver.EXTRA_KIND);
        int snoozeMin = src.getIntExtra(ReminderAlarmReceiver.EXTRA_SNOOZE_MIN, 5);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.BLACK);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        root.setPadding(dp(28), dp(28), dp(28), dp(28));

        String emoji = "🔔";
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

        TextView emojiView = new TextView(this);
        emojiView.setText(emoji);
        emojiView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 64);
        emojiView.setGravity(Gravity.CENTER);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(Color.BLACK);
        ring.setStroke(dp(2), 0x997FFFD4);
        emojiView.setBackground(ring);
        LinearLayout.LayoutParams emojiLp = new LinearLayout.LayoutParams(dp(150), dp(150));
        emojiLp.bottomMargin = dp(28);
        root.addView(emojiView, emojiLp);

        TextView titleView = new TextView(this);
        titleView.setText(cleanTitle.isEmpty() ? "تنبيه إيقاع اليوم" : cleanTitle);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 30);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setGravity(Gravity.CENTER);
        root.addView(titleView);

        if (body != null && !body.trim().isEmpty()) {
            TextView bodyView = new TextView(this);
            bodyView.setText(body.trim());
            bodyView.setTextColor(0xFFA1A1AA);
            bodyView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
            bodyView.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.topMargin = dp(10);
            root.addView(bodyView, lp);
        }

        String doneLabel = "water".equals(kind) ? "شربت كوب ماء" : "medication".equals(kind) ? "أخذت الجرعة" : "تم";
        TextView done = button(doneLabel, true);
        done.setOnClickListener(v -> sendAction(ReminderAlarmReceiver.ACTION_MARK_DONE));
        LinearLayout.LayoutParams doneLp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64));
        doneLp.topMargin = dp(48);
        root.addView(done, doneLp);

        TextView snooze = button("تأجيل " + snoozeMin + " د", false);
        snooze.setOnClickListener(v -> sendAction(ReminderAlarmReceiver.ACTION_SNOOZE));
        LinearLayout.LayoutParams snoozeLp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(58));
        snoozeLp.topMargin = dp(12);
        root.addView(snooze, snoozeLp);

        setContentView(root);

        IntentFilter f = new IntentFilter(ACTION_CLOSE_ALARM_UI);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(closeReceiver, f, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(closeReceiver, f);
        }
    }

    private TextView button(String label, boolean primary) {
        TextView b = new TextView(this);
        b.setText(label);
        b.setGravity(Gravity.CENTER);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, primary ? 20 : 17);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(18));
        if (primary) {
            bg.setColor(0xFF7FFFD4);
            b.setTextColor(Color.BLACK);
        } else {
            bg.setColor(0xFF0B0E14);
            bg.setStroke(dp(1), 0x33FFFFFF);
            b.setTextColor(0xFFE4E4E7);
        }
        b.setBackground(bg);
        return b;
    }

    /** Same actions as the notification buttons (they also tell the PC to stop). */
    private void sendAction(String action) {
        Intent src = getIntent();
        Intent i = new Intent(this, ReminderAlarmReceiver.class);
        i.setAction(action);
        i.putExtras(src);
        sendBroadcast(i);
        finish();
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(closeReceiver);
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }
}
