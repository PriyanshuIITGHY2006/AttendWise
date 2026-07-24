package in.ac.iitg.attendwise;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

// Shows the next upcoming class today: course name + time/room.
public class NextClassWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(context, mgr, id);
    }

    static void render(Context ctx, AppWidgetManager mgr, int id) {
        JSONObject p = WidgetCommon.readPayload(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_next);
        v.setTextViewText(R.id.next_title, WidgetCommon.field(p, "nextTitle", "Open AttendWise"));
        v.setTextViewText(R.id.next_meta, WidgetCommon.field(p, "nextMeta", "Tap to sync"));
        v.setTextViewText(R.id.next_updated, WidgetCommon.field(p, "updated", ""));
        v.setOnClickPendingIntent(R.id.widget_root, WidgetCommon.launchApp(ctx));
        mgr.updateAppWidget(id, v);
    }
}
