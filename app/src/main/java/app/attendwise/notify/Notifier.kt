package app.attendwise.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.attendwise.R
import app.attendwise.domain.model.ClassKey
import app.attendwise.domain.model.MarkStatus
import app.attendwise.ui.MainActivity
import java.time.LocalTime

object Notifier {
    const val CH_CLASSES = "classes"
    const val CH_MARKS = "marks"
    const val CH_ALERTS = "alerts"

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_CLASSES, "Class reminders", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Before each class starts"
        })
        nm.createNotificationChannel(NotificationChannel(CH_MARKS, "Mark attendance", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Present / Absent buttons after each class"
        })
        nm.createNotificationChannel(NotificationChannel(CH_ALERTS, "Attendance alerts", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Daily digest, planned skips and courses at risk"
        })
    }

    fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun openApp(context: Context, route: String?): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            route?.let { putExtra(MainActivity.EXTRA_ROUTE, it) }
        }
        return PendingIntent.getActivity(context, route.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun markAction(context: Context, notificationId: Int, key: ClassKey, end: LocalTime, status: MarkStatus): PendingIntent {
        val intent = Intent(context, MarkActionReceiver::class.java).apply {
            putExtra(MarkActionReceiver.EXTRA_COURSE, key.courseId)
            putExtra(MarkActionReceiver.EXTRA_DAY, key.date.toEpochDay())
            putExtra(MarkActionReceiver.EXTRA_START, key.start.toSecondOfDay())
            putExtra(MarkActionReceiver.EXTRA_END, end.toSecondOfDay())
            putExtra(MarkActionReceiver.EXTRA_STATUS, status.name)
            putExtra(MarkActionReceiver.EXTRA_NOTIFICATION, notificationId)
        }
        val code = (notificationId.toLong() * 7 + status.ordinal).toInt()
        return PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun base(context: Context, channel: String, title: String, text: String) =
        NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(0xFF2463EB.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)

    private fun post(context: Context, id: Int, builder: NotificationCompat.Builder) {
        if (!canPost(context)) return
        try {
            NotificationManagerCompat.from(context).notify(id, builder.build())
        } catch (_: SecurityException) {
            // Permission revoked between the check and the call.
        }
    }

    fun classReminder(context: Context, id: Int, title: String, text: String, key: ClassKey, end: LocalTime) {
        post(
            context, id,
            base(context, CH_CLASSES, title, text)
                .setContentIntent(openApp(context, "today"))
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setTimeoutAfter(30 * 60 * 1000L)
                .addAction(0, "Mark present", markAction(context, id, key, end, MarkStatus.PRESENT)),
        )
    }

    fun markPrompt(context: Context, id: Int, title: String, text: String, key: ClassKey, end: LocalTime) {
        post(
            context, id,
            base(context, CH_MARKS, title, text)
                .setContentIntent(openApp(context, "today"))
                .addAction(0, "Present", markAction(context, id, key, end, MarkStatus.PRESENT))
                .addAction(0, "Absent", markAction(context, id, key, end, MarkStatus.ABSENT))
                .addAction(0, "Cancelled", markAction(context, id, key, end, MarkStatus.CANCELLED)),
        )
    }

    fun alert(context: Context, id: Int, title: String, text: String, route: String?) {
        post(context, id, base(context, CH_ALERTS, title, text).setContentIntent(openApp(context, route)))
    }

    fun cancel(context: Context, id: Int) = NotificationManagerCompat.from(context).cancel(id)
}
