package in.ac.iitg.attendwise;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

// Shows the single class that's safest to skip today.
public class SkipWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(context, mgr, id);
    }

    static void render(Context ctx, AppWidgetManager mgr, int id) {
        JSONObject p = WidgetCommon.readPayload(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_skip);
        v.setTextViewText(R.id.skip_main, WidgetCommon.field(p, "skipMain", "—"));
        v.setOnClickPendingIntent(R.id.widget_root, WidgetCommon.launchApp(ctx));
        mgr.updateAppWidget(id, v);
    }
}
