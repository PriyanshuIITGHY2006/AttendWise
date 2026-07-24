package in.ac.iitg.attendwise;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONObject;

// Shared plumbing for the home-screen widgets. Each widget reads the same
// glance snapshot the web app writes via @capacitor/preferences (stored in the
// "CapacitorStorage" SharedPreferences file) and paints just its own slice.
final class WidgetCommon {
    private WidgetCommon() {}

    static JSONObject readPayload(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String raw = prefs.getString("widget_payload", null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    static String field(JSONObject payload, String key, String fallback) {
        if (payload == null) return fallback;
        String v = payload.optString(key, fallback);
        return (v == null || v.isEmpty()) ? fallback : v;
    }

    // Tapping any widget opens the app.
    static PendingIntent launchApp(Context ctx) {
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch == null) launch = new Intent();
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                ctx, 0, launch,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
