package app.attendwise.domain.attendance

import app.attendwise.domain.model.Course
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.schedule.ClassOccurrence
import app.attendwise.domain.schedule.Schedule
import app.attendwise.domain.time.Now

/**
 * Tallies one course's classes at [now].
 *
 * A mark on a class that has started is a fact; a mark on a class that has not
 * started yet is a plan. So an "absent" for a 5 pm class marked at 9 am is a
 * planned skip until 5 pm, then becomes a real absence.
 *
 * - Neutral marks (cancelled, on duty) count nowhere, at any time.
 * - Started + present / absent: attended / missed.
 * - Not started + absent: remaining and a planned skip.
 * - Not started + present: remaining (the student intends to go).
 * - No mark and ended: remaining and unmarked-past.
 * - No mark otherwise (upcoming or in progress): remaining.
 */
public fun countAttendance(occurrences: Iterable<ClassOccurrence>, now: Now): AttendanceCounts {
    var attended = 0
    var missed = 0
    var remaining = 0
    var planned = 0
    var unmarkedPast = 0
    var neutral = 0
    for (occ in occurrences) {
        val status = occ.mark?.status
        when {
            status != null && status.isNeutral -> neutral++
            status == MarkStatus.PRESENT && occ.hasStarted(now) -> attended++
            status == MarkStatus.ABSENT && occ.hasStarted(now) -> missed++
            status == MarkStatus.ABSENT -> { remaining++; planned++ }
            status == MarkStatus.PRESENT -> remaining++
            occ.hasEnded(now) -> { remaining++; unmarkedPast++ }
            else -> remaining++
        }
    }
    return AttendanceCounts(attended, missed, remaining, planned, unmarkedPast, neutral)
}

/** Stats for [course] from the semester [schedule]. */
public fun courseStats(course: Course, schedule: Schedule, now: Now): AttendanceStats =
    AttendanceMath.stats(countAttendance(schedule.forCourse(course.id), now), course.thresholdPercent, course.strictNoSkip)

/** Attendance across all active courses: total attended over total marked. */
public data class OverallAttendance(val attended: Int, val marked: Int) {
    val percent: Double? get() = AttendanceMath.percent(attended.toLong(), marked.toLong())
    val percentFloor: Int? get() = AttendanceMath.floorPercent(attended.toLong(), marked.toLong())
}

public fun overallAttendance(courses: List<Course>, schedule: Schedule, now: Now): OverallAttendance {
    val active = courses.filterNot { it.archived }.map { it.id }.toSet()
    val counts = countAttendance(schedule.occurrences.filter { it.courseId in active }, now)
    return OverallAttendance(counts.attended, counts.marked)
}
