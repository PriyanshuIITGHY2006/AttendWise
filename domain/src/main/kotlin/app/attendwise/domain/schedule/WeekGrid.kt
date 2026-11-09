package app.attendwise.domain.schedule

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters

/** The Monday of the week a date is in. */
public fun mondayOf(date: LocalDate): LocalDate = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))

/** The days a week grid shows: Monday to Saturday, and Sunday only if it has a class. */
public fun weekDates(monday: LocalDate, hasClassOn: (LocalDate) -> Boolean): List<LocalDate> {
    val days = (0L until 6L).map { monday.plusDays(it) }
    val sunday = monday.plusDays(6)
    return if (hasClassOn(sunday)) days + sunday else days
}

/** The hours down the side of the grid. */
public data class HourRange(val from: Int, val to: Int)

/** From 8 am (earlier if a class starts earlier) to at least 6 pm (later if a class ends later). */
public fun hourRange(classes: List<ClassOccurrence>): HourRange {
    var from = 8
    var to = 18
    for (o in classes) {
        from = minOf(from, o.start.hour)
        val endMinutes = o.end.hour * 60 + o.end.minute
        to = maxOf(to, (endMinutes + 59) / 60)
    }
    return HourRange(from, to)
}

/** One class placed in a day, with the side-by-side lane it sits in. */
public data class PlacedClass(
    val occurrence: ClassOccurrence,
    /** Which lane the class sits in, from 0. */
    val lane: Int,
    /** How many lanes the group of overlapping classes needs. */
    val lanes: Int,
)

private fun minutes(t: java.time.LocalTime): Int = t.hour * 60 + t.minute

/**
 * Places one day's classes. Classes that overlap in time sit side by side, so a
 * clash is visible instead of one class hiding another.
 */
public fun layoutDay(classes: List<ClassOccurrence>): List<PlacedClass> {
    val sorted = classes.sortedWith(compareBy({ minutes(it.start) }, { minutes(it.end) }))
    val result = mutableListOf<PlacedClass>()
    var group = mutableListOf<PlacedClass>()
    var groupEnd = -1
    fun flush() {
        val lanes = group.maxOfOrNull { it.lane + 1 } ?: 1
        group.forEach { result += it.copy(lanes = lanes) }
        group = mutableListOf()
    }
    for (occ in sorted) {
        val start = minutes(occ.start)
        if (group.isNotEmpty() && start >= groupEnd) {
            flush()
            groupEnd = -1
        }
        val taken = group.filter { minutes(it.occurrence.end) > start }.map { it.lane }.toSet()
        var lane = 0
        while (lane in taken) lane++
        group += PlacedClass(occ, lane, 1)
        groupEnd = maxOf(groupEnd, minutes(occ.end))
    }
    flush()
    return result
}
