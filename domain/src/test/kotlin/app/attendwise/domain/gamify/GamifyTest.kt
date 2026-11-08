package app.attendwise.domain.gamify

import app.attendwise.domain.attendance.courseStats
import app.attendwise.domain.key
import app.attendwise.domain.model.Course
import app.attendwise.domain.model.Mark
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.model.MarkStatus.ABSENT
import app.attendwise.domain.model.MarkStatus.CANCELLED
import app.attendwise.domain.model.MarkStatus.ON_DUTY
import app.attendwise.domain.model.MarkStatus.PRESENT
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

class GamifyTest {
    private val at = now("2026-11-06", "18:00")
    private val course = Course(id = "c", code = "C", name = "C")

    private fun occ(date: String, start: String, status: MarkStatus?, kind: SlotKind = SlotKind.LECTURE): ClassOccurrence {
        val k = key("c", date, start)
        val end = t(start).plusMinutes(55)
        return ClassOccurrence(k, end, null, kind, null, OccurrenceSource.TIMETABLE, status?.let { Mark(k, it) })
    }

    private fun schedule(vararg list: ClassOccurrence) =
        Schedule(list.sortedWith(compareBy({ it.date }, { it.start })), emptyList())

    private fun days(n: Int, status: MarkStatus? = PRESENT, start: String = "10:00") =
        (1..n).map { occ("2026-10-%02d".format(it), start, status) }

    private fun badges(list: List<ClassOccurrence>): Map<String, Badge> {
        val s = Schedule(list.sortedWith(compareBy({ it.date }, { it.start })), emptyList())
        val stats = mapOf(course.id to courseStats(course, s, at))
        return evaluateBadges(s, listOf(course), stats, at).associateBy { it.id }
    }

    @Test
    fun `streak counts classes attended in a row and resets on an absence`() {
        val s = schedule(
            occ("2026-10-01", "10:00", PRESENT), occ("2026-10-02", "10:00", PRESENT), occ("2026-10-03", "10:00", ABSENT),
            occ("2026-10-04", "10:00", PRESENT), occ("2026-10-05", "10:00", PRESENT), occ("2026-10-06", "10:00", PRESENT),
        )
        assertEquals(Streak(3, 3), classStreak(s, at))
    }

    @Test
    fun `streak keeps the best after it is broken`() {
        val s = Schedule(days(5) + listOf(occ("2026-10-10", "10:00", ABSENT), occ("2026-10-11", "10:00", PRESENT)), emptyList())
        assertEquals(Streak(1, 5), classStreak(s, at))
    }

    @Test
    fun `cancelled, on-duty and unmarked classes do not break it`() {
        val s = schedule(
            occ("2026-10-01", "10:00", PRESENT), occ("2026-10-02", "10:00", CANCELLED), occ("2026-10-03", "10:00", null),
            occ("2026-10-04", "10:00", ON_DUTY), occ("2026-10-05", "10:00", PRESENT),
        )
        assertEquals(2, classStreak(s, at).current)
    }

    @Test
    fun `classes that have not started are ignored`() {
        val s = schedule(occ("2026-10-01", "10:00", PRESENT), occ("2026-11-06", "19:00", ABSENT), occ("2026-11-09", "10:00", PRESENT))
        assertEquals(Streak(1, 1), classStreak(s, at))
    }

    @Test
    fun `no marks gives no streak`() = assertEquals(Streak(0, 0), classStreak(schedule(), at))

    @Test
    fun `there are nine badges with unique ids`() = assertEquals(9, badges(emptyList()).size)

    @Test
    fun `Day One unlocks with the first attended class`() {
        assertFalse(badges(emptyList()).getValue("day-one").unlocked)
        assertTrue(badges(listOf(occ("2026-10-01", "10:00", PRESENT))).getValue("day-one").unlocked)
    }

    @Test
    fun `streak badges unlock at 5, 15 and 30 and show progress before that`() {
        val b = badges(days(7))
        assertTrue(b.getValue("hot-streak").unlocked)
        assertFalse(b.getValue("unstoppable").unlocked)
        assertEquals(7, b.getValue("unstoppable").value)
        assertEquals(15, b.getValue("unstoppable").goal)
        val long = (0 until 30).map { occ("2026-09-%02d".format((it % 28) + 1), "%02d:00".format(8 + it / 28), PRESENT) }
        assertTrue(badges(long).getValue("legend").unlocked)
    }

    @Test
    fun `Early Bird needs 5 attended classes before 9`() {
        assertEquals(4, badges(days(4, PRESENT, "08:00")).getValue("early-bird").value)
        assertTrue(badges(days(5, PRESENT, "08:00")).getValue("early-bird").unlocked)
        assertFalse(badges(days(5, PRESENT, "09:00")).getValue("early-bird").unlocked)
    }

    @Test
    fun `Lab Regular needs 10 attended lab classes`() {
        fun labs(n: Int) = (1..n).map { occ("2026-10-%02d".format(it), "14:00", PRESENT, SlotKind.LAB) }
        assertFalse(badges(labs(9)).getValue("lab-regular").unlocked)
        assertTrue(badges(labs(10)).getValue("lab-regular").unlocked)
    }

    @Test
    fun `Perfect Week needs a full week of at least 4 classes all attended`() {
        fun week(last: MarkStatus?) = listOf("2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08")
            .mapIndexed { i, date -> occ(date, "10:00", if (i == 3) last else PRESENT) }
        assertTrue(badges(week(PRESENT)).getValue("perfect-week").unlocked)
        assertFalse(badges(week(ABSENT)).getValue("perfect-week").unlocked)
        assertFalse(badges(week(null)).getValue("perfect-week").unlocked)
        assertFalse(badges(week(PRESENT).take(3)).getValue("perfect-week").unlocked)
    }

    @Test
    fun `Full Marks needs 100 percent after 10 classes`() {
        assertFalse(badges(days(9)).getValue("full-marks").unlocked)
        assertTrue(badges(days(10)).getValue("full-marks").unlocked)
        assertFalse(badges(days(10) + occ("2026-10-20", "10:00", ABSENT)).getValue("full-marks").unlocked)
    }

    @Test
    fun `Comeback Kid needs a course that dropped below the requirement and is back above it`() {
        val slump = listOf(occ("2026-10-01", "10:00", PRESENT), occ("2026-10-02", "10:00", ABSENT), occ("2026-10-03", "10:00", ABSENT), occ("2026-10-04", "10:00", ABSENT))
        assertFalse(badges(slump).getValue("comeback").unlocked)
        val recover = slump + (0 until 12).map { occ("2026-10-%02d".format(10 + it), "10:00", PRESENT) }
        assertTrue(badges(recover).getValue("comeback").unlocked)
    }

    @Test
    fun `avatars are twelve with unique ids and found by id`() {
        assertEquals(12, AVATARS.size)
        assertEquals(12, AVATARS.map { it.id }.toSet().size)
        assertEquals("Sleepyhead", avatarById("sleepyhead")?.title)
        assertNull(avatarById("nope"))
        assertNull(avatarById(null))
    }

    private fun unlocked(vararg ids: String) =
        ids.map { Badge(it, it, "", Tier.BRONZE, unlocked = true, value = 1, goal = 1) } + Badge("locked", "locked", "", Tier.BRONZE, false, 0, 1)

    @Test
    fun `the first run only records the current state`() {
        val r = newMoments(null, unlocked("a"), 12)
        assertTrue(r.moments.isEmpty())
        assertEquals(Seen(setOf("a"), 7), r.next)
    }

    @Test
    fun `a newly unlocked badge is announced once`() {
        val badges = unlocked("a", "b")
        val r = newMoments(Seen(setOf("a"), 0), badges, 3)
        assertEquals(listOf<Moment>(Moment.BadgeUnlocked(badges[1])), r.moments)
        assertTrue(newMoments(r.next, badges, 3).moments.isEmpty())
    }

    @Test
    fun `the highest streak milestone crossed is announced, not every one`() {
        val r = newMoments(Seen(emptySet(), 0), emptyList(), 16)
        assertEquals(listOf<Moment>(Moment.StreakReached(14)), r.moments)
        assertTrue(newMoments(r.next, emptyList(), 16).moments.isEmpty())
        assertEquals(listOf<Moment>(Moment.StreakReached(21)), newMoments(r.next, emptyList(), 21).moments)
    }
}
