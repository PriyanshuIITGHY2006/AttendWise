package app.attendwise.domain.attendance

import app.attendwise.domain.d
import app.attendwise.domain.key
import app.attendwise.domain.model.Course
import app.attendwise.domain.model.Mark
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.model.SlotKind
import app.attendwise.domain.now
import app.attendwise.domain.schedule.ClassOccurrence
import app.attendwise.domain.schedule.OccurrenceSource
import app.attendwise.domain.schedule.Schedule
import app.attendwise.domain.t
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class CourseStatsTest {

    private fun occ(date: String, start: String, end: String, status: MarkStatus? = null, course: String = "c") =
        key(course, date, start).let { k ->
            ClassOccurrence(k, t(end), null, SlotKind.LECTURE, null, OccurrenceSource.TIMETABLE, status?.let { Mark(k, it) })
        }

    @Test
    fun `every case of the counting rules at once`() {
        val at = now("2026-10-01", "12:00")
        val classes = listOf(
            occ("2026-09-30", "11:00", "11:55", MarkStatus.PRESENT), // attended
            occ("2026-09-30", "14:00", "14:55", MarkStatus.ABSENT), // missed
            occ("2026-09-29", "11:00", "11:55"), // unmarked past
            occ("2026-10-01", "11:30", "12:25"), // in progress, unmarked: remaining, not past
            occ("2026-10-01", "11:00", "11:55"), // ended today, unmarked: unmarked past
            occ("2026-10-01", "17:00", "17:55", MarkStatus.ABSENT), // later today: planned skip
            occ("2026-10-05", "11:00", "11:55", MarkStatus.PRESENT), // future pre-marked present: remaining
            occ("2026-10-06", "11:00", "11:55", MarkStatus.CANCELLED), // future cancelled: nowhere
            occ("2026-09-28", "11:00", "11:55", MarkStatus.ON_DUTY), // past on duty: nowhere
            occ("2026-10-07", "11:00", "11:55"), // upcoming
        )
        val c = countAttendance(classes, at)
        assertEquals(AttendanceCounts(attended = 1, missed = 1, remaining = 6, plannedSkips = 1, unmarkedPast = 2, neutral = 2), c)
    }

    @Test
    fun `a planned skip becomes a real absence once the class starts`() {
        val skip = listOf(occ("2026-10-01", "17:00", "17:55", MarkStatus.ABSENT))
        assertEquals(1, countAttendance(skip, now("2026-10-01", "16:59")).plannedSkips)
        assertEquals(1, countAttendance(skip, now("2026-10-01", "17:00")).missed)
    }

    @Test
    fun `course stats and overall attendance`() {
        val classes = listOf(
            occ("2026-09-30", "09:00", "09:55", MarkStatus.PRESENT, "a"),
            occ("2026-09-30", "10:00", "10:55", MarkStatus.ABSENT, "a"),
            occ("2026-09-30", "11:00", "11:55", MarkStatus.PRESENT, "b"),
            occ("2026-09-30", "12:00", "12:55", MarkStatus.PRESENT, "archived"),
        )
        val schedule = Schedule(classes, emptyList())
        val courses = listOf(Course("a", "A", "A"), Course("b", "B", "B"), Course("archived", "X", "X", archived = true))
        val at = now("2026-10-01")
        assertEquals(50.0, courseStats(courses[0], schedule, at).currentPercent)
        val overall = overallAttendance(courses, schedule, at)
        assertEquals(2, overall.attended)
        assertEquals(3, overall.marked)
        assertEquals(66, overall.percentFloor)
        assertEquals(d("2026-09-30"), classes.first().date)
    }
}
