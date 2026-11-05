package app.attendwise.notify

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.attendwise.data.Derived
import app.attendwise.data.toDomain
import app.attendwise.domain.attendance.CourseStatus
import app.attendwise.domain.model.ClassKey
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.notify.NotificationEvent
import app.attendwise.domain.notify.notificationsBetween
import app.attendwise.domain.time.Now
import app.attendwise.graph
import app.attendwise.widget.Widgets
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/**
 * Turns the domain's notification plan into Android alarms. Everything is
 * re-planned from scratch after every data change, at boot, on time-zone
 * changes and once a day, so alarms can never drift from the data.
 */
object AlarmScheduler {
    private const val ACTION_EVENT = "app.attendwise.EVENT"
    private const val ACTION_TICK = "app.attendwise.TICK"
    private val HORIZON: Duration = Duration.ofHours(36)

    suspend fun replan(context: Context) {
        val graph = context.graph
        val prefs = context.getSharedPreferences("alarms", Context.MODE_PRIVATE)
        val previous = prefs.getStringSet("ids", emptySet()).orEmpty()
        val wanted = mutableMapOf<String, Pair<LocalDateTime, Intent>>()

        if (graph.api.userId != null) {
            val data = graph.repo.snapshot()
            val now = Now.of(LocalDateTime.now())
            val derived = Derived(data, now)
            checkThresholds(context, derived)

            val events = notificationsBetween(derived.schedule, data.settings.toDomain(), now.dateTime, now.dateTime.plus(HORIZON))
            for (e in events) wanted[e.id] = e.at to eventIntent(context, e)

            // Widget refresh points: each class start and end, and midnight.
            derived.schedule.occurrences
                .filter { !it.date.isBefore(now.date) && it.date.isBefore(now.date.plusDays(2)) }
                .flatMap { listOf(it.date.atTime(it.start), it.date.atTime(it.end)) }
                .plus(now.date.plusDays(1).atStartOfDay())
                .filter { it.isAfter(now.dateTime) }
                .distinct()
                .forEach { t -> wanted["tick:$t"] = t to Intent(context, AlarmReceiver::class.java).setAction(ACTION_TICK).putExtra("id", "tick:$t") }
        }

        val am = context.getSystemService(AlarmManager::class.java)
        for (id in previous - wanted.keys) {
            pending(context, id, Intent(context, AlarmReceiver::class.java).setAction(if (id.startsWith("tick:")) ACTION_TICK else ACTION_EVENT), PendingIntent.FLAG_NO_CREATE)
                ?.let { am.cancel(it); it.cancel() }
        }
        val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        for ((id, value) in wanted) {
            val (at, intent) = value
            val pi = pending(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT) ?: continue
            val millis = at.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            if (exact && !id.startsWith("tick:")) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, millis, pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, millis, pi)
            }
        }
        prefs.edit().putStringSet("ids", wanted.keys).apply()
    }

    private fun pending(context: Context, id: String, intent: Intent, flags: Int): PendingIntent? =
        PendingIntent.getBroadcast(context, id.hashCode(), intent, flags or PendingIntent.FLAG_IMMUTABLE)

    private fun eventIntent(context: Context, e: NotificationEvent): Intent {
        val i = Intent(context, AlarmReceiver::class.java).setAction(ACTION_EVENT).putExtra("id", e.id)
        when (e) {
            is NotificationEvent.ClassReminder -> i.putKey("reminder", e.key)
            is NotificationEvent.MarkPrompt -> i.putKey("mark", e.key)
            is NotificationEvent.DailyDigest -> i.putExtra("type", "digest").putExtra("day", e.date.toEpochDay())
            is NotificationEvent.PlannedSkipReminder -> i.putExtra("type", "planned").putExtra("day", e.date.toEpochDay())
        }
        return i
    }

    private fun Intent.putKey(type: String, key: ClassKey): Intent =
        putExtra("type", type).putExtra("course", key.courseId).putExtra("day", key.date.toEpochDay()).putExtra("start", key.start.toSecondOfDay())

    /** Fires one event, re-checking it against current data first. */
    suspend fun fire(context: Context, intent: Intent) {
        val graph = context.graph
        if (graph.api.userId == null) return
        val data = graph.repo.snapshot()
        val now = Now.of(LocalDateTime.now())
        val derived = Derived(data, now)
        val voice = data.humor
        val id = (intent.getStringExtra("id") ?: return).hashCode()
        val day = LocalDate.ofEpochDay(intent.getLongExtra("day", 0))
        when (intent.getStringExtra("type")) {
            "reminder", "mark" -> {
                val key = ClassKey(intent.getStringExtra("course") ?: return, day, LocalTime.ofSecondOfDay(intent.getIntExtra("start", 0).toLong()))
                val occ = derived.schedule.occurrences.firstOrNull { it.key == key } ?: return
                val code = data.code(key.courseId)
                val room = occ.room?.let { " · $it" } ?: ""
                if (intent.getStringExtra("type") == "reminder") {
                    if (occ.mark?.status == MarkStatus.ABSENT || occ.mark?.status?.isNeutral == true) return
                    val minutes = Duration.between(now.dateTime, occ.date.atTime(occ.start)).toMinutes().toInt().coerceAtLeast(0)
                    Notifier.classReminder(context, id, "$code at ${occ.start}$room", Copy.classSoon(code, minutes, voice, key.toString()), key, occ.end)
                } else {
                    if (occ.mark != null) return
                    Notifier.markPrompt(context, id, "$code · ${occ.start}–${occ.end}", Copy.markPrompt(code, voice, key.toString()), key, occ.end)
                }
            }
            "digest" -> {
                val unmarked = derived.schedule.on(day).count { it.mark == null && it.hasEnded(now) }
                if (unmarked > 0) Notifier.alert(context, id, Copy.digestTitle(voice), Copy.unmarked(unmarked, voice, day.toString()), "today")
            }
            "planned" -> {
                val skips = derived.schedule.on(day).filter { derived.isPlannedSkip(it) }
                if (skips.isNotEmpty()) {
                    val names = skips.map { data.code(it.courseId) }.distinct().joinToString(", ")
                    Notifier.alert(context, id, "Planned skips tomorrow", Copy.plannedSkip(names, voice, day.toString()), "plan")
                }
            }
        }
    }

    /** Alerts once when a course gets worse (safe to tight, or anything to at risk). */
    private fun checkThresholds(context: Context, derived: Derived) {
        val prefs = context.getSharedPreferences("thresholds", Context.MODE_PRIVATE)
        val muted = derived.data.settings?.muted == true
        val edit = prefs.edit()
        for ((courseId, s) in derived.stats) {
            val before = prefs.getString(courseId, null)?.let { runCatching { CourseStatus.valueOf(it) }.getOrNull() }
            val now = s.status
            if (before != null && now.ordinal > before.ordinal && !muted && s.counts.marked > 0) {
                val code = derived.data.code(courseId)
                Notifier.alert(
                    context, "threshold:$courseId".hashCode(), code,
                    Copy.threshold(code, s.currentPercentFloor ?: 0, now == CourseStatus.AT_RISK, derived.data.humor, "$courseId${derived.now.date}"),
                    "course/$courseId",
                )
            }
            edit.putString(courseId, now.name)
        }
        edit.apply()
    }

    fun scheduleDailyReplan(context: Context) {
        val work = PeriodicWorkRequestBuilder<ReplanWorker>(12, TimeUnit.HOURS).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("replan", ExistingPeriodicWorkPolicy.KEEP, work)
    }

    internal fun isTick(intent: Intent) = intent.action == ACTION_TICK
}

class ReplanWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        applicationContext.graph.afterDataChanged()
        return Result.success()
    }
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        CoroutineScope(Dispatchers.Default).launch {
            try {
                if (!AlarmScheduler.isTick(intent)) AlarmScheduler.fire(context, intent)
                Widgets.updateAll(context)
                AlarmScheduler.replan(context)
            } finally {
                pending.finish()
            }
        }
    }
}

class MarkActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        CoroutineScope(Dispatchers.Default).launch {
            try {
                val course = intent.getStringExtra(EXTRA_COURSE) ?: return@launch
                val key = ClassKey(
                    course,
                    LocalDate.ofEpochDay(intent.getLongExtra(EXTRA_DAY, 0)),
                    LocalTime.ofSecondOfDay(intent.getIntExtra(EXTRA_START, 0).toLong()),
                )
                val end = LocalTime.ofSecondOfDay(intent.getIntExtra(EXTRA_END, 0).toLong())
                val status = runCatching { MarkStatus.valueOf(intent.getStringExtra(EXTRA_STATUS) ?: "") }.getOrNull() ?: return@launch
                context.graph.repo.mark(key, end, status)
                Notifier.cancel(context, intent.getIntExtra(EXTRA_NOTIFICATION, 0))
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val EXTRA_COURSE = "course"
        const val EXTRA_DAY = "day"
        const val EXTRA_START = "start"
        const val EXTRA_END = "end"
        const val EXTRA_STATUS = "status"
        const val EXTRA_NOTIFICATION = "notification"
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        CoroutineScope(Dispatchers.Default).launch {
            try {
                context.graph.afterDataChanged()
            } finally {
                pending.finish()
            }
        }
    }
}
