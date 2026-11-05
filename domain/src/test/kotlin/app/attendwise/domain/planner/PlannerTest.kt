package app.attendwise.domain.planner

import app.attendwise.domain.d
import app.attendwise.domain.key
import app.attendwise.domain.model.ClassKey
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
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.LocalDate

class PlannerTest {

    private val at = now("2026-10-01", "08:00")

    /** Marked classes from 1 Aug, then [future] unmarked classes, one a day from 1 Oct. */
    private fun history(course: String, present: Int, absent: Int, future: Int, start: String = "10:00"): List<ClassOccurrence> {
        val out = mutableListOf<ClassOccurrence>()
        var day = d("2026-08-01")
        repeat(present) { out += occ(course, day, start, MarkStatus.PRESENT); day = day.plusDays(1) }
        repeat(absent) { out += occ(course, day, start, MarkStatus.ABSENT); day = day.plusDays(1) }
        var f = d("2026-10-01")
        repeat(future) { out += occ(course, f, start, null); f = f.plusDays(1) }
        return out
    }

    private fun occ(course: String, date: LocalDate, start: String, status: MarkStatus?): ClassOccurrence {
        val k = ClassKey(course, date, t(start))
        return ClassOccurrence(k, t(start).plusMinutes(55), null, SlotKind.LECTURE, null, OccurrenceSource.TIMETABLE, status?.let { Mark(k, it) })
    }

    private fun schedule(vararg parts: List<ClassOccurrence>) =
        Schedule(parts.flatMap { it }.sortedWith(compareBy({ it.date }, { it.start }, { it.courseId })), emptyList())

    private fun withMarks(s: Schedule, marks: List<Mark>): Schedule {
        val byKey = marks.associateBy { it.key }
        return s.copy(occurrences = s.occurrences.map { o -> byKey[o.key]?.let { o.copy(mark = it) } ?: o })
    }

    private fun dates(from: String, count: Int) = (0 until count).map { d(from).plusDays(it.toLong()) }.toSet()

    private val safe = Course("safe", "SAF 101", "Safe")
    private val broke = Course("broke", "BRK 101", "Broke")
    private val strict = Course("strict", "LAB 101", "Lab", strictNoSkip = true)
    private val low = Course("low", "LOW 101", "Low")

    // safe: 10/0 with 10 ahead -> 5 safe skips. broke: 6/2 with 0 spare -> must attend. low: 7/3 (70%) with 20 ahead -> 4.
    private val base = schedule(
        history("safe", 10, 0, 10, "09:00"),
        history("broke", 6, 2, 2, "10:00"),
        history("strict", 5, 0, 10, "11:00"),
        history("low", 7, 3, 20, "12:00"),
    )
    private val courses = listOf(safe, broke, strict, low)

    @Test
    fun `verdict per course for a two-day trip`() {
        val p = Planner.propose(courses, base, dates("2026-10-02", 2), at)
        val byId = p.lines.associateBy { it.course.id }
        assertEquals(SkipVerdict.SAFE, byId.getValue("safe").verdict)
        assertEquals(5, byId.getValue("safe").budget)
        assertEquals(SkipVerdict.MUST_ATTEND, byId.getValue("broke").verdict)
        assertEquals(SkipVerdict.LOCKED, byId.getValue("strict").verdict)
        assertEquals(SkipVerdict.RISKY, byId.getValue("low").verdict)
        assertEquals(OverallVerdict.PARTLY, p.overall)
        assertEquals(listOf(SkipVerdict.LOCKED, SkipVerdict.MUST_ATTEND, SkipVerdict.RISKY, SkipVerdict.SAFE), p.lines.map { it.verdict })
        assertEquals(4, p.defaultSelection.size)
        assertTrue(p.defaultSelection.all { it.courseId == "safe" || it.courseId == "low" })
    }

    @Test
    fun `too many days makes a course partial`() {
        val p = Planner.propose(listOf(safe), base, dates("2026-10-01", 8), at)
        val line = p.lines.single()
        assertEquals(SkipVerdict.PARTIAL, line.verdict)
        assertEquals(8, line.candidates.size)
        assertTrue(p.defaultSelection.isEmpty())
        assertEquals(OverallVerdict.PARTLY, p.overall)
    }

    @Test
    fun `no classes on those days`() {
        val p = Planner.propose(courses, base, setOf(d("2027-01-01")), at)
        assertEquals(OverallVerdict.NOTHING_TO_SKIP, p.overall)
        assertTrue(p.lines.isEmpty())
    }

    @Test
    fun `only courses that cannot skip`() {
        val p = Planner.propose(listOf(broke, strict), base, dates("2026-10-02", 1), at)
        assertEquals(OverallVerdict.NONE_SKIPPABLE, p.overall)
    }

    @Test
    fun `past and already-started classes are never offered`() {
        val midClass = now("2026-10-02", "09:30")
        val p = Planner.propose(listOf(safe), base, setOf(d("2026-10-01"), d("2026-10-02"), d("2026-10-03")), midClass)
        assertEquals(listOf(d("2026-10-03")), p.lines.single().candidates.map { it.date })
    }

    @Test
    fun `two plans never spend the same skip`() {
        val first = Planner.apply(courses, base, setOf(key("safe", "2026-10-02", "09:00"), key("safe", "2026-10-03", "09:00")), "trip", at)
        val marks = (first as ApplyResult.Applied).marks
        assertTrue(marks.all { it.status == MarkStatus.ABSENT && it.planId == "trip" })
        val after = withMarks(base, marks)

        val again = Planner.propose(listOf(safe), after, dates("2026-10-02", 2), at)
        assertTrue(again.lines.isEmpty(), "already planned classes are not offered again")

        val later = Planner.propose(listOf(safe), after, dates("2026-10-04", 1), at)
        assertEquals(3, later.lines.single().budget)
    }

    @Test
    fun `over-budget plans are rejected unless allowed, zero-tolerance always`() {
        val six = dates("2026-10-01", 6).map { ClassKey("safe", it, t("09:00")) }.toSet()
        val rejected = Planner.apply(courses, base, six, "p", at)
        assertEquals(ApplyResult.Rejected(emptySet(), setOf("safe")), rejected)
        assertTrue(Planner.apply(courses, base, six, "p", at, allowOverBudget = true) is ApplyResult.Applied)

        val lab = setOf(key("strict", "2026-10-02", "11:00"))
        assertEquals(ApplyResult.Rejected(emptySet(), setOf("strict")), Planner.apply(courses, base, lab, "p", at, allowOverBudget = true))
    }

    @Test
    fun `unknown or started classes reject the plan`() {
        val bogus = setOf(key("safe", "2026-10-02", "09:00"), key("safe", "2030-01-01", "09:00"), key("safe", "2026-08-01", "09:00"))
        val result = Planner.apply(courses, base, bogus, "p", at) as ApplyResult.Rejected
        assertEquals(setOf(key("safe", "2030-01-01", "09:00"), key("safe", "2026-08-01", "09:00")), result.unplannable)
    }

    @Test
    fun `evaluate shows the effect of a selection`() {
        val sel = dates("2026-10-01", 6).map { ClassKey("safe", it, t("09:00")) }.toSet()
        val out = Planner.evaluate(courses, base, sel, at)
        assertEquals(1, out.after.getValue("safe").overBudget)
        assertFalse(out.isWithinBudget)
        assertTrue(Planner.evaluate(courses, base, sel.take(5).toSet(), at).isWithinBudget)
    }

    @Test
    fun `undo only removes skips that have not happened yet`() {
        val marks = listOf(
            Mark(key("safe", "2026-10-02", "09:00"), MarkStatus.ABSENT, "trip"),
            Mark(key("safe", "2026-10-03", "09:00"), MarkStatus.ABSENT, "trip"),
            Mark(key("safe", "2026-10-04", "09:00"), MarkStatus.ABSENT, "other"),
        )
        assertEquals(listOf(key("safe", "2026-10-03", "09:00")), Planner.undo(marks, "trip", now("2026-10-02", "10:00")))
    }

    @Test
    fun `can I bunk today`() {
        val today = now("2026-10-02", "08:00")
        val v = todayVerdict(courses, base, today)
        assertEquals(TodayVerdict.Kind.SOME_SKIPPABLE, v.kind)
        assertEquals(setOf("safe", "low"), v.skippable.toSet())
        assertEquals(setOf("broke", "strict"), v.mustAttend.toSet())

        assertEquals(TodayVerdict.Kind.DAY_DONE, todayVerdict(courses, base, now("2026-10-02", "13:00")).kind)
        assertEquals(TodayVerdict.Kind.NO_CLASSES_TODAY, todayVerdict(courses, base, now("2027-01-01", "08:00")).kind)
        assertEquals(TodayVerdict.Kind.ALL_SKIPPABLE, todayVerdict(listOf(safe), base, today).kind)
    }

    @Test
    fun `next class`() {
        val n = nextClass(base, now("2026-10-02", "09:30"))!!
        assertTrue(n.inProgress)
        assertEquals("safe", n.occurrence.courseId)

        val gap = nextClass(base, now("2026-10-02", "09:56"))!!
        assertEquals("broke", gap.occurrence.courseId)
        assertEquals(Duration.ofMinutes(4), gap.startsIn)

        val skipped = withMarks(base, listOf(Mark(key("broke", "2026-10-02", "10:00"), MarkStatus.ABSENT), Mark(key("strict", "2026-10-02", "11:00"), MarkStatus.CANCELLED)))
        assertEquals("low", nextClass(skipped, now("2026-10-02", "09:56"))!!.occurrence.courseId)
        assertEquals("broke", nextClass(skipped, now("2026-10-02", "09:56"), includePlannedSkips = true)!!.occurrence.courseId)

        assertNull(nextClass(base, now("2027-01-01")))
    }
}
