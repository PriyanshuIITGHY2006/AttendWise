package in.ac.iitg.attendwise;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Bridges JS -> native: the web app hands over a fresh glance snapshot; we
// persist it to our own SharedPreferences file (read by the widgets) and then
// redraw every home-screen widget instance. No extra storage plugin needed.
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridge extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        String payload = call.getString("payload", "");
        Context ctx = getContext().getApplicationContext();

        ctx.getSharedPreferences(WidgetCommon.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(WidgetCommon.KEY, payload)
                .apply();

        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        redraw(ctx, mgr, NextClassWidget.class);
        redraw(ctx, mgr, AttendanceWidget.class);
        redraw(ctx, mgr, DeadlinesWidget.class);
        redraw(ctx, mgr, SkipWidget.class);
        call.resolve();
    }

    private void redraw(Context ctx, AppWidgetManager mgr, Class<? extends AppWidgetProvider> cls) {
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, cls));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) {
            if (cls == NextClassWidget.class) NextClassWidget.render(ctx, mgr, id);
            else if (cls == AttendanceWidget.class) AttendanceWidget.render(ctx, mgr, id);
            else if (cls == DeadlinesWidget.class) DeadlinesWidget.render(ctx, mgr, id);
            else if (cls == SkipWidget.class) SkipWidget.render(ctx, mgr, id);
        }
    }
}
