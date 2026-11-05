package app.attendwise.domain.schedule

import app.attendwise.domain.Monsoon2026
import app.attendwise.domain.calendar.DayResolver
import app.attendwise.domain.d
import app.attendwise.domain.key
import app.attendwise.domain.mark
import app.attendwise.domain.model.Course
import app.attendwise.domain.model.ExtraClass
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.model.Term
import app.attendwise.domain.now
import app.attendwise.domain.slot
import app.attendwise.domain.t
import app.attendwise.domain.time.days
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.DayOfWeek
import java.time.DayOfWeek.FRIDAY
import java.time.DayOfWeek.MONDAY
import java.time.DayOfWeek.WEDNESDAY
import java.time.LocalDate

class ScheduleTest {

    private val sem = Monsoon2026.semester
    private val early = now("2026-07-01")

    private fun build(
        courses: List<Course> = listOf(Monsoon2026.ee203, Monsoon2026.ma201, Monsoon2026.lab),
        slots: List<app.attendwise.domain.model.TimetableSlot> = Monsoon2026.slots,
        firstYear: Boolean = false,
        marks: List<app.attendwise.domain.model.Mark> = emptyList(),
        at: app.attendwise.domain.time.Now = early,
        extras: List<ExtraClass> = emptyList(),
        window: ClosedRange<LocalDate>? = null,
        days: DayResolver = Monsoon2026.resolver(firstYear),
    ) = buildSchedule(sem, courses, slots, days, marks, at, extras, window)

    private fun Schedule.dates(course: String) = forCourse(course).map { it.date }

    @Test
    fun `EE 203 over the whole semester follows every swap, holiday and exam`() {
        val ee = build().dates("ee203")
        val plainMwf = (sem.start..sem.end).days().count { it.dayOfWeek in setOf(MONDAY, WEDNESDAY, FRIDAY) }
        // minus mid-sem 14, 16, 18 Sep and the 2 Oct holiday; plus 27 Aug (Wed timetable) and 1 Oct (Fri timetable).
        assertEquals(plainMwf - 4 + 2, ee.size)
        assertTrue(d("2026-08-27") in ee)
        assertTrue(d("2026-10-01") in ee)
        assertFalse(d("2026-10-02") in ee)
        listOf("2026-09-14", "2026-09-16", "2026-09-18").forEach { assertFalse(d(it) in ee, it) }
        assertEquals(ee.sorted(), ee)
    }

    @Test
    fun `a swapped class records which weekday it follows`() {
        val oct1 = build().on(d("2026-10-01"))
        assertEquals(setOf("ee203", "cs221"), oct1.map { it.courseId }.toSet())
        assertTrue(oct1.all { it.swappedFrom == FRIDAY })
        assertEquals("ee-fri", oct1.first { it.courseId == "ee203" }.slotId)
    }

    @Test
    fun `Thursday course loses its class when Thursday runs another day`() {
        val ma = build().dates("ma201")
        assertFalse(d("2026-08-27") in ma)
        assertFalse(d("2026-10-01") in ma)
        assertTrue(d("2026-08-20") in ma)
    }

    @Test
    fun `Wednesday running Monday swaps the slot used`() {
        val nov11 = build().forCourse("ee203").single { it.date == d("2026-11-11") }
        assertEquals("ee-mon", nov11.slotId)
        assertEquals(MONDAY, nov11.swappedFrom)
    }

    @Test
    fun `first-year Saturday swap only for first years`() {
        assertFalse(d("2026-08-08") in build(firstYear = false).dates("ma201"))
        assertTrue(d("2026-08-08") in build(firstYear = true).dates("ma201"))
        assertTrue(d("2026-08-22") in build(firstYear = true).dates("ee203"))
    }

    @Test
    fun `half-semester courses stay inside their half`() {
        val pre = Monsoon2026.ee203.copy(id = "pre", term = Term.PRE_MID)
        val post = Monsoon2026.ee203.copy(id = "post", term = Term.POST_MID)
        val slots = listOf(slot("p1", "pre", MONDAY, "10:00", "10:55"), slot("p2", "post", MONDAY, "10:00", "10:55"))
        val s = build(courses = listOf(pre, post), slots = slots)
        assertTrue(s.dates("pre").all { it <= d("2026-09-12") })
        assertEquals(d("2026-07-27"), s.dates("pre").first())
        assertTrue(s.dates("post").all { it >= d("2026-09-21") })
        assertEquals(d("2026-09-21"), s.dates("post").first())
        // 11 Nov is a Wednesday running Monday's timetable.
        assertEquals(d("2026-11-11"), s.dates("post").last())
    }

    @Test
    fun `half course without mid-sem dates falls back to the whole semester`() {
        val pre = Monsoon2026.ee203.copy(term = Term.PRE_MID)
        val s = buildSchedule(sem.copy(midSemStart = null, midSemEnd = null), listOf(pre), Monsoon2026.slots, Monsoon2026.resolver(), emptyList(), early)
        assertEquals(d("2026-11-11"), s.dates("ee203").last())
    }

    @Test
    fun `editing a timetable mid-semester keeps the old classes`() {
        val slots = listOf(
            slot("wed-old", "ee203", WEDNESDAY, "11:00", "11:55", to = "2026-09-30"),
            slot("wed-new", "ee203", WEDNESDAY, "15:00", "15:55", from = "2026-10-01"),
        )
        val s = build(courses = listOf(Monsoon2026.ee203), slots = slots)
        assertEquals(t("11:00"), s.forCourse("ee203").single { it.date == d("2026-09-30") }.start)
        assertEquals(t("15:00"), s.forCourse("ee203").single { it.date == d("2026-10-07") }.start)
    }

    @Test
    fun `a swap never revives a retired slot`() {
        val slots = listOf(slot("wed", "ee203", WEDNESDAY, "11:00", "11:55", to = "2026-08-01"))
        assertFalse(d("2026-08-27") in build(courses = listOf(Monsoon2026.ee203), slots = slots).dates("ee203"))
    }

    @Test
    fun `duplicate and invalid slots`() {
        val slots = listOf(
            slot("b", "ee203", MONDAY, "11:00", "11:55"),
            slot("a", "ee203", MONDAY, "11:00", "12:30"),
            slot("bad", "ee203", MONDAY, "13:00", "13:00"),
        )
        val monday = build(courses = listOf(Monsoon2026.ee203), slots = slots).on(d("2026-08-03"))
        assertEquals(1, monday.size)
        assertEquals("a", monday.single().slotId)
    }

    @Test
    fun `marks attach to their class`() {
        val s = build(marks = listOf(mark("ee203", "2026-08-03", "11:00", MarkStatus.PRESENT)))
        assertEquals(MarkStatus.PRESENT, s.forCourse("ee203").first { it.date == d("2026-08-03") }.mark?.status)
        assertNull(s.forCourse("ee203").first { it.date == d("2026-08-05") }.mark)
    }

    @Test
    fun `past mark with no class is kept as orphaned, future one is stale`() {
        val marks = listOf(
            mark("ee203", "2026-09-14", "11:00", MarkStatus.PRESENT),
            mark("ee203", "2026-10-02", "11:00", MarkStatus.ABSENT, plan = "trip"),
        )
        val s = build(marks = marks, at = now("2026-10-01", "10:00"))
        val orphan = s.forCourse("ee203").single { it.date == d("2026-09-14") }
        assertEquals(OccurrenceSource.ORPHANED, orphan.source)
        assertEquals(listOf(key("ee203", "2026-10-02", "11:00")), s.staleMarks.map { it.key })
        assertFalse(d("2026-10-02") in s.dates("ee203"))
    }

    @Test
    fun `extra classes, including on holidays`() {
        val extras = listOf(
            ExtraClass("ee203", d("2026-10-02"), t("10:00"), t("11:00")),
            ExtraClass("ee203", d("2026-08-03"), t("11:00"), t("11:55")),
            ExtraClass("gone", d("2026-08-03"), t("08:00"), t("09:00")),
            ExtraClass("ee203", d("2026-08-04"), t("09:00"), t("08:00")),
        )
        val s = build(extras = extras)
        val oct2 = s.forCourse("ee203").single { it.date == d("2026-10-02") }
        assertEquals(OccurrenceSource.EXTRA, oct2.source)
        assertEquals(OccurrenceSource.TIMETABLE, s.forCourse("ee203").single { it.date == d("2026-08-03") }.source)
        assertTrue(s.forCourse("gone").isEmpty())
        assertFalse(d("2026-08-04") in s.dates("ee203"))
    }

    @Test
    fun `archived courses produce nothing and their marks are ignored`() {
        val archived = Monsoon2026.ee203.copy(archived = true)
        val s = build(courses = listOf(archived), marks = listOf(mark("ee203", "2026-10-02", "11:00", MarkStatus.ABSENT)))
        assertTrue(s.occurrences.isEmpty())
        assertTrue(s.staleMarks.isEmpty())
    }

    @Test
    fun `window limits the dates`() {
        val s = build(window = d("2026-10-01")..d("2026-10-04"))
        assertEquals(setOf(d("2026-10-01")), s.occurrences.map { it.date }.toSet())
    }

    @Test
    fun `classes are ordered by date then time then course`() {
        val s = build()
        val sorted = s.occurrences.sortedWith(compareBy({ it.date }, { it.start }, { it.courseId }))
        assertEquals(sorted, s.occurrences)
    }

    @Test
    fun `started and ended use device-local time`() {
        val occ = build().forCourse("ee203").first { it.date == d("2026-10-01") }
        assertFalse(occ.hasStarted(now("2026-10-01", "10:59")))
        assertTrue(occ.hasStarted(now("2026-10-01", "11:00")))
        assertFalse(occ.hasEnded(now("2026-10-01", "11:54")))
        assertTrue(occ.hasEnded(now("2026-10-01", "11:55")))
        assertTrue(occ.hasEnded(now("2026-10-02", "00:00")))
    }

    @Test
    fun `semester with no matching weekdays yields nothing`() {
        val slots = listOf(slot("sun", "ee203", DayOfWeek.SUNDAY, "11:00", "11:55"))
        val s = buildSchedule(
            sem.copy(start = d("2026-08-03"), end = d("2026-08-07")),
            listOf(Monsoon2026.ee203), slots, Monsoon2026.resolver(), emptyList(), early,
        )
        assertTrue(s.occurrences.isEmpty())
    }
}
