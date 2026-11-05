package app.attendwise.domain.time

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/*
 * Small date helpers. They deliberately avoid LocalDate.datesUntil(), which is
 * missing from the java.time available on older Android versions.
 */

/** Every date from [ClosedRange.start] to [ClosedRange.endInclusive], in order. Empty if reversed. */
public fun ClosedRange<LocalDate>.days(): Sequence<LocalDate> =
    if (start.isAfter(endInclusive)) {
        emptySequence()
    } else {
        generateSequence(start) { d -> d.plusDays(1).takeUnless { it.isAfter(endInclusive) } }
    }

/** Overlap of two date ranges, or null when they do not overlap. */
public fun ClosedRange<LocalDate>.intersect(other: ClosedRange<LocalDate>): ClosedRange<LocalDate>? {
    val from = maxOf(start, other.start)
    val to = minOf(endInclusive, other.endInclusive)
    return if (from.isAfter(to)) null else from..to
}

/** A device-local moment, split into the parts the rules care about. */
public data class Now(val date: LocalDate, val time: LocalTime) {
    public val dateTime: LocalDateTime get() = LocalDateTime.of(date, time)

    public companion object {
        public fun of(dateTime: LocalDateTime): Now = Now(dateTime.toLocalDate(), dateTime.toLocalTime())
    }
}
