package app.attendwise.domain.schedule

import app.attendwise.domain.d
import app.attendwise.domain.key
import app.attendwise.domain.model.SlotKind
import app.attendwise.domain.t
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class WeekGridTest {
    private fun occ(start: String, end: String, course: String = "c") =
        ClassOccurrence(key(course, "2026-11-09", start), t(end), null, SlotKind.LECTURE, null, OccurrenceSource.TIMETABLE, null)

    @Test
    fun `the Monday of any day in the week`() {
        assertEquals(d("2026-11-09"), mondayOf(d("2026-11-09")))
        assertEquals(d("2026-11-09"), mondayOf(d("2026-11-12")))
        assertEquals(d("2026-11-09"), mondayOf(d("2026-11-15")))
    }

    @Test
    fun `Monday to Saturday, and Sunday only with a class`() {
        assertEquals(6, weekDates(d("2026-11-09")) { false }.size)
        val days = weekDates(d("2026-11-09")) { it == d("2026-11-15") }
        assertEquals(7, days.size)
        assertEquals(d("2026-11-15"), days.last())
    }

    @Test
    fun `hours run from 8 to 6 pm and widen only when a class needs it`() {
        assertEquals(HourRange(8, 18), hourRange(emptyList()))
        assertEquals(HourRange(8, 18), hourRange(listOf(occ("09:00", "09:55"))))
        assertEquals(HourRange(7, 20), hourRange(listOf(occ("07:30", "08:25"), occ("17:00", "19:30"))))
    }

    @Test
    fun `classes that do not overlap share one lane`() {
        val p = layoutDay(listOf(occ("09:00", "09:55", "a"), occ("10:00", "10:55", "b")))
        assertTrue(p.all { it.lane == 0 && it.lanes == 1 })
    }

    @Test
    fun `overlapping classes sit side by side`() {
        val p = layoutDay(listOf(occ("09:00", "10:00", "a"), occ("09:30", "10:30", "b")))
        val a = p.first { it.occurrence.key.courseId == "a" }
        val b = p.first { it.occurrence.key.courseId == "b" }
        assertEquals(0 to 2, a.lane to a.lanes)
        assertEquals(1 to 2, b.lane to b.lanes)
    }

    @Test
    fun `back to back classes are separate groups`() {
        val p = layoutDay(listOf(occ("09:00", "10:00", "a"), occ("10:00", "11:00", "b")))
        assertTrue(p.all { it.lane == 0 && it.lanes == 1 })
    }

    @Test
    fun `a lane is reused once its class is over`() {
        val p = layoutDay(listOf(occ("09:00", "11:00", "a"), occ("09:30", "10:00", "b"), occ("10:15", "10:45", "c")))
        val c = p.first { it.occurrence.key.courseId == "c" }
        assertEquals(1 to 2, c.lane to c.lanes)
    }
}
