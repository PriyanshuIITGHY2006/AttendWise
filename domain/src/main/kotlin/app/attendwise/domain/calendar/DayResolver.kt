package app.attendwise.domain.calendar

import app.attendwise.domain.model.Audience
import app.attendwise.domain.model.DayType
import app.attendwise.domain.model.InstituteDay
import java.time.DayOfWeek
import java.time.LocalDate

/** What kind of day a date is for one particular student. */
public sealed interface DayInfo {
    public val date: LocalDate

    /** The weekday whose timetable applies, or null when no regular classes run. */
    public val timetableDay: DayOfWeek?

    /** An ordinary day: its own weekday's timetable. */
    public data class Regular(override val date: LocalDate) : DayInfo {
        override val timetableDay: DayOfWeek get() = date.dayOfWeek
    }

    /** A day swap: [follows]' timetable runs on [date]. */
    public data class Swapped(
        override val date: LocalDate,
        val follows: DayOfWeek,
        val description: String?,
    ) : DayInfo {
        override val timetableDay: DayOfWeek get() = follows
    }

    /** Holiday, break or exam day: no regular classes. */
    public data class NoClasses(
        override val date: LocalDate,
        val type: DayType,
        val description: String?,
    ) : DayInfo {
        override val timetableDay: DayOfWeek? get() = null
    }
}

/**
 * Turns the institute calendar into per-day answers for one student.
 *
 * Resolution rules when several entries share a date:
 * 1. Entries for another audience are ignored (first-year-only entries apply
 *    only when [isFirstYearUg] is true).
 * 2. An audience-specific entry beats an entry for everyone, because it is the
 *    more precise statement for this student.
 * 3. Within the same audience, a no-class day beats a day swap: when the
 *    calendar contradicts itself, never invent classes.
 * 4. A day swap without a target weekday, or one pointing at the date's own
 *    weekday, is treated as a regular day.
 */
public class DayResolver(
    entries: Iterable<InstituteDay>,
    private val isFirstYearUg: Boolean,
) {
    private val byDate: Map<LocalDate, InstituteDay> =
        entries
            .filter { it.audience == Audience.ALL || (isFirstYearUg && it.audience == Audience.FIRST_YEAR_UG) }
            .groupBy { it.date }
            .mapValues { (_, sameDay) -> sameDay.minWith(precedence) }

    public fun resolve(date: LocalDate): DayInfo {
        val entry = byDate[date] ?: return DayInfo.Regular(date)
        return when {
            entry.type.isNoClassDay -> DayInfo.NoClasses(date, entry.type, entry.description)
            entry.followsDayOfWeek == null || entry.followsDayOfWeek == date.dayOfWeek -> DayInfo.Regular(date)
            else -> DayInfo.Swapped(date, entry.followsDayOfWeek, entry.description)
        }
    }

    private companion object {
        val precedence: Comparator<InstituteDay> =
            compareBy<InstituteDay>(
                { if (it.audience == Audience.ALL) 1 else 0 },
                { if (it.type.isNoClassDay) 0 else 1 },
                { it.type.ordinal },
            )
    }
}
