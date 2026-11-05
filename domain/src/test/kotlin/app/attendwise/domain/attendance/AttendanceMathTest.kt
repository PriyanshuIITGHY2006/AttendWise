package app.attendwise.domain.attendance

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.random.Random

class AttendanceMathTest {

    private fun stats(a: Int, m: Int, r: Int, p: Int = 75, planned: Int = 0, strict: Boolean = false) =
        AttendanceMath.stats(AttendanceCounts(a, m, r, plannedSkips = planned), p, strict)

    @Test
    fun `brand new course with nothing scheduled`() {
        val s = stats(0, 0, 0)
        assertNull(s.currentPercent)
        assertNull(s.currentPercentFloor)
        assertNull(s.projectedIfAttendAll)
        assertEquals(0, s.maxSafeSkips)
        assertTrue(s.canReachThreshold)
        assertFalse(s.belowThreshold)
        assertEquals(CourseStatus.SAFE, s.status)
    }

    @Test
    fun `fresh semester with 40 classes ahead allows a quarter of them`() {
        val s = stats(0, 0, 40)
        assertEquals(10, s.maxSafeSkips)
        assertEquals(10, s.safeSkipsLeft)
        assertEquals(CourseStatus.SAFE, s.status)
    }

    @Test
    fun `exactly at the requirement is not below it`() {
        val s = stats(3, 1, 0)
        assertEquals(75.0, s.currentPercent)
        assertFalse(s.belowThreshold)
        assertNull(s.recoveryClasses)
    }

    @Test
    fun `74_9 percent displays as 74 and counts as below`() {
        val s = stats(749, 251, 0)
        assertEquals(74, s.currentPercentFloor)
        assertTrue(s.belowThreshold)
        assertEquals(CourseStatus.AT_RISK, s.status)
    }

    @Test
    fun `mockup EE 203 - below now, recoverable, with skips after recovery`() {
        val s = stats(14, 6, 18)
        assertEquals(70, s.currentPercentFloor)
        assertTrue(s.belowThreshold)
        assertEquals(4, s.recoveryClasses)
        assertEquals(3, s.maxSafeSkips)
        assertEquals(84, s.projectedIfAttendAll!!.toInt())
        assertEquals(CourseStatus.AT_RISK, s.status)
    }

    @Test
    fun `mockup CS 201 - planned skips use up the whole budget`() {
        val s = stats(19, 6, 12, planned = 3)
        assertEquals(3, s.maxSafeSkips)
        assertEquals(0, s.safeSkipsLeft)
        assertEquals(0, s.overBudget)
        assertEquals(CourseStatus.TIGHT, s.status)
        assertEquals(75, (s.projectedIfPlanFollowed!!).toInt())
    }

    @Test
    fun `planning beyond the budget is at risk`() {
        val s = stats(19, 6, 12, planned = 4)
        assertEquals(1, s.overBudget)
        assertEquals(CourseStatus.AT_RISK, s.status)
        assertTrue(s.projectedIfPlanFollowed!! < 75.0)
    }

    @Test
    fun `zero-tolerance course never offers skips but is not flagged tight`() {
        val s = stats(8, 0, 6, strict = true)
        assertEquals(0, s.safeSkipsLeft)
        assertTrue(s.maxSafeSkips > 0)
        assertEquals(CourseStatus.SAFE, s.status)
    }

    @Test
    fun `100 percent requirement after one miss is unreachable and unrecoverable`() {
        val s = stats(10, 1, 20, p = 100)
        assertFalse(s.canReachThreshold)
        assertNull(s.recoveryClasses)
        assertEquals(0, s.maxSafeSkips)
        assertEquals(CourseStatus.AT_RISK, s.status)
    }

    @Test
    fun `100 percent requirement with a clean record is tight`() {
        val s = stats(10, 0, 20, p = 100)
        assertEquals(0, s.maxSafeSkips)
        assertEquals(CourseStatus.TIGHT, s.status)
    }

    @Test
    fun `0 percent requirement makes everything skippable`() {
        val s = stats(0, 10, 20, p = 0)
        assertEquals(20, s.maxSafeSkips)
        assertFalse(s.belowThreshold)
    }

    @Test
    fun `safe skips never exceed the classes left`() {
        assertEquals(5, stats(100, 0, 5).maxSafeSkips)
    }

    @Test
    fun `semester over and above the requirement is safe, not tight`() {
        assertEquals(CourseStatus.SAFE, stats(30, 5, 0).status)
    }

    @Test
    fun `cannot reach the requirement even attending everything`() {
        val s = stats(5, 10, 3)
        assertFalse(s.canReachThreshold)
        assertEquals(0, s.maxSafeSkips)
        assertEquals(CourseStatus.AT_RISK, s.status)
    }

    @Test
    fun `invalid input is rejected`() {
        assertThrows<IllegalArgumentException> { stats(1, 1, 1, p = 101) }
        assertThrows<IllegalArgumentException> { stats(1, 1, 1, p = -1) }
        assertThrows<IllegalArgumentException> { AttendanceCounts(-1, 0, 0) }
        assertThrows<IllegalArgumentException> { AttendanceCounts(0, 0, 2, plannedSkips = 2, unmarkedPast = 1) }
    }

    @Test
    fun `huge counts do not overflow`() {
        val s = stats(20_000_000, 0, 20_000_000)
        assertEquals(10_000_000, s.maxSafeSkips)
    }

    /** Compares the closed-form answers with brute force over many random courses. */
    @Test
    fun `closed-form rules match brute force`() {
        val rnd = Random(20261105)
        repeat(20_000) {
            val a = rnd.nextInt(0, 60)
            val m = a + rnd.nextInt(0, 30)
            val r = rnd.nextInt(0, 50)
            val planned = rnd.nextInt(0, r + 1)
            val p = listOf(0, 50, 60, 65, 70, 75, 80, 85, 90, 99, 100, rnd.nextInt(0, 101)).random(rnd)
            val s = stats(a, m - a, r, p, planned)
            val total = m + r

            val bruteMax = (r downTo 0).firstOrNull { k -> 100L * (a + r - k) >= p.toLong() * total } ?: 0
            assertEquals(bruteMax, s.maxSafeSkips, "maxSafe a=$a m=$m r=$r p=$p")
            assertEquals(100L * (a + r) >= p.toLong() * total, s.canReachThreshold, "canReach a=$a m=$m r=$r p=$p")
            assertEquals(maxOf(0, bruteMax - planned), s.safeSkipsLeft)
            assertEquals(maxOf(0, planned - bruteMax), s.overBudget)

            val below = m > 0 && 100L * a < p.toLong() * m
            assertEquals(below, s.belowThreshold)
            val bruteRecovery = if (!below) null else (0..100_000).firstOrNull { k -> 100L * (a + k) >= p.toLong() * (m + k) }
            assertEquals(bruteRecovery, s.recoveryClasses, "recovery a=$a m=$m p=$p")

            if (m > 0) assertEquals((100L * a / m).toInt(), s.currentPercentFloor)
        }
    }
}
