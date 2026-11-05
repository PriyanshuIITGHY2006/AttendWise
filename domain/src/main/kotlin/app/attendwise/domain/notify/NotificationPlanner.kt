package app.attendwise.domain.notify

import app.attendwise.domain.model.ClassKey
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.schedule.ClassOccurrence
import app.attendwise.domain.schedule.Schedule
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

public data class NotificationSettings(
    val muted: Boolean = false,
    val classReminders: Boolean = true,
    /** Minutes before a class starts; 0 means at the start time. */
    val leadTimeMinutes: Int = 10,
    val markPrompts: Boolean = true,
    val dailyDigest: Boolean = true,
    val digestTime: LocalTime = LocalTime.of(21, 0),
    val plannedSkipReminders: Boolean = true,
    /** Time on the evening before a planned skip. */
    val plannedSkipReminderTime: LocalTime = LocalTime.of(21, 0),
    /** Quiet hours; null or equal start and end means none. May wrap past midnight. */
    val quietStart: LocalTime? = null,
    val quietEnd: LocalTime? = null,
) {
    init {
        require(leadTimeMinutes in 0..180) { "Lead time must be 0..180 minutes, was $leadTimeMinutes" }
    }
}

/** Something to schedule as an alarm. [id] is stable, so re-planning replaces instead of duplicating. */
public sealed interface NotificationEvent {
    public val at: LocalDateTime
    public val id: String

    /** "EE 203 in 10 min". */
    public data class ClassReminder(override val at: LocalDateTime, val key: ClassKey) : NotificationEvent {
        override val id: String get() = "reminder:${key.courseId}:${key.date}:${key.start}"
    }

    /** "Were you there?" with Present / Absent buttons, at the end of an unmarked class. */
    public data class MarkPrompt(override val at: LocalDateTime, val key: ClassKey) : NotificationEvent {
        override val id: String get() = "mark:${key.courseId}:${key.date}:${key.start}"
    }

    /** End-of-day summary for [date]. Its text is worked out when it fires, from fresh data. */
    public data class DailyDigest(override val at: LocalDateTime, val date: LocalDate) : NotificationEvent {
        override val id: String get() = "digest:$date"
    }

    /** Evening-before reminder of the skips planned on [date]. */
    public data class PlannedSkipReminder(
        override val at: LocalDateTime,
        val date: LocalDate,
        val keys: List<ClassKey>,
    ) : NotificationEvent {
        override val id: String get() = "planned:$date"
    }
}

/**
 * Works out which notifications fall in `[from, to)`.
 *
 * - Nothing at all when muted.
 * - Class reminders: for classes the student is expected at (unmarked or
 *   pre-marked present). Never for planned skips or cancelled classes. Dropped
 *   in quiet hours, since a late reminder is useless.
 * - Mark prompts: at the end of classes still unmarked. In quiet hours they are
 *   moved to the end of the quiet period instead of being lost.
 * - Daily digest: at the chosen time on days that have classes.
 * - Planned-skip reminders: the evening before a day with planned skips, moved
 *   out of quiet hours like mark prompts.
 *
 * The schedule must cover the window plus one day on each side (a reminder
 * for a 00:05 class falls on the previous evening).
 */
public fun notificationsBetween(
    schedule: Schedule,
    settings: NotificationSettings,
    from: LocalDateTime,
    to: LocalDateTime,
): List<NotificationEvent> {
    if (settings.muted || !from.isBefore(to)) return emptyList()
    val quiet = QuietHours(settings.quietStart, settings.quietEnd)
    val events = mutableListOf<NotificationEvent>()
    fun inWindow(t: LocalDateTime) = !t.isBefore(from) && t.isBefore(to)

    val live = schedule.occurrences.filter { it.mark?.status?.isNeutral != true }
    for (occ in live) {
        val status = occ.mark?.status
        val startAt = occ.date.atTime(occ.start)
        if (settings.classReminders && status != MarkStatus.ABSENT) {
            val at = startAt.minusMinutes(settings.leadTimeMinutes.toLong())
            if (inWindow(at) && !quiet.contains(at.toLocalTime())) events += NotificationEvent.ClassReminder(at, occ.key)
        }
        if (settings.markPrompts && status == null) {
            val at = quiet.deferOutside(endAt(occ))
            if (inWindow(at)) events += NotificationEvent.MarkPrompt(at, occ.key)
        }
    }

    if (settings.dailyDigest) {
        for (date in live.map { it.date }.distinct()) {
            val at = date.atTime(settings.digestTime)
            if (inWindow(at)) events += NotificationEvent.DailyDigest(at, date)
        }
    }

    if (settings.plannedSkipReminders) {
        live.filter { it.mark?.status == MarkStatus.ABSENT }
            .groupBy { it.date }
            .forEach { (date, skips) ->
                val at = quiet.deferOutside(date.minusDays(1).atTime(settings.plannedSkipReminderTime))
                // Never remind after the first skipped class has begun.
                val firstStart = skips.minOf { it.date.atTime(it.start) }
                if (inWindow(at) && at.isBefore(firstStart)) {
                    events += NotificationEvent.PlannedSkipReminder(at, date, skips.map { it.key })
                }
            }
    }

    return events.sortedWith(compareBy({ it.at }, { it.id }))
}

private fun endAt(occ: ClassOccurrence): LocalDateTime = occ.date.atTime(occ.end)

/** A daily quiet period [start, end), possibly wrapping past midnight. */
internal class QuietHours(private val start: LocalTime?, private val end: LocalTime?) {
    private val active = start != null && end != null && start != end

    fun contains(t: LocalTime): Boolean {
        if (!active) return false
        val s = start!!
        val e = end!!
        return if (s.isBefore(e)) !t.isBefore(s) && t.isBefore(e) else !t.isBefore(s) || t.isBefore(e)
    }

    /** [at] itself if outside quiet hours, otherwise the moment quiet hours end. */
    fun deferOutside(at: LocalDateTime): LocalDateTime {
        if (!contains(at.toLocalTime())) return at
        val e = end!!
        val sameDay = at.toLocalDate().atTime(e)
        return if (sameDay.isAfter(at)) sameDay else sameDay.plusDays(1)
    }
}
