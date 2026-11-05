package app.attendwise.domain.schedule

import app.attendwise.domain.calendar.DayInfo
import app.attendwise.domain.calendar.DayResolver
import app.attendwise.domain.model.ClassKey
import app.attendwise.domain.model.Course
import app.attendwise.domain.model.CourseId
import app.attendwise.domain.model.ExtraClass
import app.attendwise.domain.model.Mark
import app.attendwise.domain.model.Semester
import app.attendwise.domain.model.SlotId
import app.attendwise.domain.model.SlotKind
import app.attendwise.domain.model.Term
import app.attendwise.domain.model.TimetableSlot
import app.attendwise.domain.time.Now
import app.attendwise.domain.time.days
import app.attendwise.domain.time.intersect
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime

/** Where a class in the schedule came from. */
public enum class OccurrenceSource {
    /** Generated from the weekly timetable. */
    TIMETABLE,

    /** A one-off class the student added. */
    EXTRA,

    /**
     * A past class the student marked that the timetable no longer produces
     * (timetable or calendar changed afterwards). Kept, because the student's
     * own record of the past wins; the app offers to remove it.
     */
    ORPHANED,
}

/** One concrete class, with the student's mark if there is one. */
public data class ClassOccurrence(
    val key: ClassKey,
    val end: LocalTime,
    val room: String?,
    val kind: SlotKind,
    val slotId: SlotId?,
    val source: OccurrenceSource,
    val mark: Mark?,
    /** Set when the class runs because of a day swap: the weekday whose timetable is followed. */
    val swappedFrom: DayOfWeek? = null,
) {
    val courseId: CourseId get() = key.courseId
    val date: LocalDate get() = key.date
    val start: LocalTime get() = key.start

    /** The class has begun (or is over) at [now]. Marks on started classes are real; on others, plans. */
    public fun hasStarted(now: Now): Boolean =
        date.isBefore(now.date) || (date == now.date && !start.isAfter(now.time))

    /** The class is over at [now]. */
    public fun hasEnded(now: Now): Boolean =
        date.isBefore(now.date) || (date == now.date && !end.isAfter(now.time))
}

/** The schedule for a date window. */
public data class Schedule(
    /** Every class, sorted by date, then start time, then course. */
    val occurrences: List<ClassOccurrence>,
    /**
     * Future marks that no longer match any class (a holiday was added, or the
     * timetable changed). They are excluded from all counts; the app should
     * delete them and tell the student which plans were dropped.
     */
    val staleMarks: List<Mark>,
) {
    public fun forCourse(courseId: CourseId): List<ClassOccurrence> = occurrences.filter { it.courseId == courseId }

    public fun on(date: LocalDate): List<ClassOccurrence> = occurrences.filter { it.date == date }
}

/** The dates a course actually runs, or null if it has no days at all. */
public fun Course.activeSpan(semester: Semester): ClosedRange<LocalDate>? {
    val span = when (term) {
        Term.FULL -> semester.start..semester.end
        // Without mid-semester dates a half course cannot be split; fall back to the
        // whole semester. Validation flags this so the student fixes the semester.
        Term.PRE_MID -> semester.start..(semester.midSemStart?.minusDays(1) ?: semester.end)
        Term.POST_MID -> (semester.midSemEnd?.plusDays(1) ?: semester.start)..semester.end
    }
    return if (span.start.isAfter(span.endInclusive)) null else span
}

/**
 * Builds the list of classes from the timetable, the institute calendar, extra
 * classes and the student's marks.
 *
 * Rules:
 * - Archived courses produce nothing, and their marks are ignored.
 * - A course only has classes inside its [activeSpan].
 * - No regular classes on holidays, breaks or exam days.
 * - On a day swap, the followed weekday's slots run. Slot validity is checked
 *   against the real date, so a swap never revives a retired slot.
 * - Slots whose end is not after their start are skipped (validation reports them).
 * - Two slots producing the same class key collapse into one (lowest slot id wins).
 * - An extra class that duplicates a timetable class is ignored; otherwise it is
 *   added even on a no-class day or outside the course span (the student said it happens).
 * - A mark matching no class: kept as [OccurrenceSource.ORPHANED] if the class
 *   would have started by [now], otherwise reported in [Schedule.staleMarks].
 *
 * @param window limit to these dates (inclusive). Null means the whole semester.
 */
public fun buildSchedule(
    semester: Semester,
    courses: List<Course>,
    slots: List<TimetableSlot>,
    days: DayResolver,
    marks: List<Mark>,
    now: Now,
    extras: List<ExtraClass> = emptyList(),
    window: ClosedRange<LocalDate>? = null,
): Schedule {
    val active = courses.filterNot { it.archived }.associateBy { it.id }
    val slotsByCourse = slots.groupBy { it.courseId }
    val markByKey = marks.associateBy { it.key }
    val generated = LinkedHashMap<ClassKey, ClassOccurrence>()

    for (course in active.values) {
        val span = course.activeSpan(semester) ?: continue
        val dates = (if (window == null) span else span.intersect(window)) ?: continue
        val courseSlots = slotsByCourse[course.id].orEmpty()
            .filter { it.end.isAfter(it.start) }
            .sortedWith(compareBy({ it.start }, { it.id }))
        if (courseSlots.isEmpty()) continue

        for (date in dates.days()) {
            val info = days.resolve(date)
            val weekday = info.timetableDay ?: continue
            val swappedFrom = (info as? DayInfo.Swapped)?.follows
            for (slot in courseSlots) {
                if (slot.dayOfWeek != weekday || !slot.isValidOn(date)) continue
                val key = ClassKey(course.id, date, slot.start)
                generated.putIfAbsent(
                    key,
                    ClassOccurrence(key, slot.end, slot.room, slot.kind, slot.id, OccurrenceSource.TIMETABLE, markByKey[key], swappedFrom),
                )
            }
        }
    }

    for (extra in extras) {
        if (extra.courseId !in active || !extra.end.isAfter(extra.start)) continue
        if (window != null && extra.date !in window) continue
        val key = ClassKey(extra.courseId, extra.date, extra.start)
        generated.putIfAbsent(
            key,
            ClassOccurrence(key, extra.end, extra.room, extra.kind, null, OccurrenceSource.EXTRA, markByKey[key]),
        )
    }

    val stale = mutableListOf<Mark>()
    for (mark in marks) {
        val key = mark.key
        if (key in generated || key.courseId !in active) continue
        if (window != null && key.date !in window) continue
        val started = key.date.isBefore(now.date) || (key.date == now.date && !key.start.isAfter(now.time))
        if (started) {
            val end = mark.end?.takeIf { it.isAfter(key.start) } ?: key.start
            generated[key] = ClassOccurrence(key, end, null, SlotKind.LECTURE, null, OccurrenceSource.ORPHANED, mark)
        } else {
            stale += mark
        }
    }

    val ordered = generated.values.sortedWith(compareBy({ it.date }, { it.start }, { it.courseId }))
    return Schedule(ordered, stale.sortedWith(compareBy({ it.key.date }, { it.key.start }, { it.key.courseId })))
}
