package app.attendwise.domain.validation

import app.attendwise.domain.model.Course
import app.attendwise.domain.model.SlotId
import app.attendwise.domain.model.Term
import app.attendwise.domain.model.TimetableSlot
import app.attendwise.domain.model.Semester
import java.time.LocalDate

/** A problem the student must fix before saving. */
public enum class Issue {
    SEMESTER_ENDS_BEFORE_START,
    MID_SEM_INCOMPLETE,
    MID_SEM_REVERSED,
    MID_SEM_OUTSIDE_SEMESTER,
    HALF_COURSE_NEEDS_MID_SEM,
    COURSE_CODE_BLANK,
    COURSE_NAME_BLANK,
    COURSE_TEXT_TOO_LONG,
    THRESHOLD_OUT_OF_RANGE,
    SLOT_ENDS_BEFORE_START,
    SLOT_VALIDITY_REVERSED,
}

public object Validation {
    public const val MAX_TEXT: Int = 80

    public fun semester(s: Semester, courses: List<Course> = emptyList()): Set<Issue> = buildSet {
        if (s.end.isBefore(s.start)) add(Issue.SEMESTER_ENDS_BEFORE_START)
        val ms = s.midSemStart
        val me = s.midSemEnd
        if ((ms == null) != (me == null)) add(Issue.MID_SEM_INCOMPLETE)
        if (ms != null && me != null) {
            if (me.isBefore(ms)) add(Issue.MID_SEM_REVERSED)
            if (ms.isBefore(s.start) || me.isAfter(s.end)) add(Issue.MID_SEM_OUTSIDE_SEMESTER)
        }
        if ((ms == null || me == null) && courses.any { !it.archived && it.term != Term.FULL }) {
            add(Issue.HALF_COURSE_NEEDS_MID_SEM)
        }
    }

    public fun course(c: Course): Set<Issue> = buildSet {
        if (c.code.isBlank()) add(Issue.COURSE_CODE_BLANK)
        if (c.name.isBlank()) add(Issue.COURSE_NAME_BLANK)
        if (c.code.length > MAX_TEXT || c.name.length > MAX_TEXT) add(Issue.COURSE_TEXT_TOO_LONG)
        if (c.thresholdPercent !in 0..100) add(Issue.THRESHOLD_OUT_OF_RANGE)
    }

    public fun slot(s: TimetableSlot): Set<Issue> = buildSet {
        if (!s.end.isAfter(s.start)) add(Issue.SLOT_ENDS_BEFORE_START)
        val from = s.validFrom
        val to = s.validTo
        if (from != null && to != null && to.isBefore(from)) add(Issue.SLOT_VALIDITY_REVERSED)
    }
}

/** Two slots that overlap in time on the same weekday during overlapping validity. */
public data class Clash(val first: SlotId, val second: SlotId, val sameCourse: Boolean)

/**
 * Finds overlapping slots. A same-course overlap is almost always a typo; an
 * overlap between courses is a real timetable clash the student should know
 * about (both are allowed, the app only warns). Back-to-back slots
 * (one ends exactly when the next starts) do not clash.
 */
public fun findClashes(slots: List<TimetableSlot>): List<Clash> {
    val valid = slots.filter { it.end.isAfter(it.start) }.sortedBy { it.id }
    val result = mutableListOf<Clash>()
    for (i in valid.indices) {
        for (j in i + 1 until valid.size) {
            val a = valid[i]
            val b = valid[j]
            if (a.dayOfWeek != b.dayOfWeek) continue
            val timeOverlap = a.start.isBefore(b.end) && b.start.isBefore(a.end)
            if (timeOverlap && validityOverlaps(a, b)) result += Clash(a.id, b.id, a.courseId == b.courseId)
        }
    }
    return result
}

private fun validityOverlaps(a: TimetableSlot, b: TimetableSlot): Boolean {
    val aFrom = a.validFrom ?: LocalDate.MIN
    val aTo = a.validTo ?: LocalDate.MAX
    val bFrom = b.validFrom ?: LocalDate.MIN
    val bTo = b.validTo ?: LocalDate.MAX
    return !aFrom.isAfter(bTo) && !bFrom.isAfter(aTo)
}
