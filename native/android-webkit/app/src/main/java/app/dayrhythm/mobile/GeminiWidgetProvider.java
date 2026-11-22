package app.dayrhythm.mobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * Home-screen widget: a "type to Gemini" field and a mic button.
 * Android widgets can't host a real text box, so tapping the field opens the chat with the
 * keyboard ready, and the mic opens the chat straight into voice input (sent automatically).
 */
public class GeminiWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_gemini);
            views.setOnClickPendingIntent(R.id.widget_gemini_input, openAppIntent(context, "chat", 7101));
            views.setOnClickPendingIntent(R.id.widget_gemini_mic, openAppIntent(context, "voice", 7102));
            manager.updateAppWidget(id, views);
        }
    }

    private static PendingIntent openAppIntent(Context context, String action, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra(MainActivity.EXTRA_WIDGET_ACTION, action);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
