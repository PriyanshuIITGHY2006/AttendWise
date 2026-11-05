package app.attendwise.domain.attendance

/**
 * Raw tallies for one course at one moment.
 *
 * [remaining] is every class still treated as attendable: upcoming classes,
 * classes in progress, classes that ended but are not marked yet
 * ([unmarkedPast]) and future classes already planned as skips ([plannedSkips]).
 * Unmarked past classes are counted as attendable until the student marks them,
 * which keeps the numbers optimistic but honest: the app nudges the student to
 * mark them.
 */
public data class AttendanceCounts(
    val attended: Int,
    val missed: Int,
    val remaining: Int,
    val plannedSkips: Int = 0,
    val unmarkedPast: Int = 0,
    val neutral: Int = 0,
) {
    init {
        require(attended >= 0 && missed >= 0 && remaining >= 0 && plannedSkips >= 0 && unmarkedPast >= 0 && neutral >= 0) {
            "Counts cannot be negative: $this"
        }
        require(plannedSkips + unmarkedPast <= remaining) { "Planned and unmarked classes are part of remaining: $this" }
    }

    /** Classes that already count toward the percentage. */
    val marked: Int get() = attended + missed

    /** Every class of the course that counts toward the final percentage. */
    val total: Int get() = attended + missed + remaining

    public companion object {
        public val EMPTY: AttendanceCounts = AttendanceCounts(0, 0, 0)
    }
}

public enum class CourseStatus {
    /** Above the requirement with skips to spare. */
    SAFE,

    /** Above the requirement but no skips left (or every spare skip already planned). */
    TIGHT,

    /** Below the requirement now, unable to reach it, or planning more skips than it can take. */
    AT_RISK,
}

/** Everything the app shows about a course's attendance. */
public data class AttendanceStats(
    val counts: AttendanceCounts,
    val thresholdPercent: Int,
    val strictNoSkip: Boolean,
    /** Current attendance, or null when nothing is marked yet. */
    val currentPercent: Double?,
    /** [currentPercent] rounded DOWN, for display, so 74.9% never shows as 75%. */
    val currentPercentFloor: Int?,
    /** Skips the course can absorb and still end at the requirement, ignoring plans. */
    val maxSafeSkips: Int,
    /** Skips still free after planned skips. Always 0 for zero-tolerance courses. */
    val safeSkipsLeft: Int,
    /** Planned skips beyond what the course can take. */
    val overBudget: Int,
    /** True if attending every remaining class ends at or above the requirement. */
    val canReachThreshold: Boolean,
    /** True when the current percentage is below the requirement. */
    val belowThreshold: Boolean,
    /**
     * Classes in a row needed to get back to the requirement, when below it.
     * Null when not below, or when recovery is impossible (e.g. a 100% requirement after a miss).
     */
    val recoveryClasses: Int?,
    /** Final percentage if every remaining class is attended. Null if the course has no classes. */
    val projectedIfAttendAll: Double?,
    /** Final percentage if planned skips happen and everything else is attended. */
    val projectedIfPlanFollowed: Double?,
    val status: CourseStatus,
)

/**
 * The attendance rules. All decisions use exact integer arithmetic: a course is
 * at or above a p% requirement exactly when `100 * attended >= p * total`, so
 * no floating-point rounding can flip a verdict.
 */
public object AttendanceMath {

    public fun stats(counts: AttendanceCounts, thresholdPercent: Int, strictNoSkip: Boolean = false): AttendanceStats {
        require(thresholdPercent in 0..100) { "Threshold must be 0..100, was $thresholdPercent" }
        val p = thresholdPercent.toLong()
        val a = counts.attended.toLong()
        val m = counts.marked.toLong()
        val r = counts.remaining.toLong()
        val t = counts.total.toLong()

        // Largest k with 100 * (a + r - k) >= p * t.
        val slack = 100 * (a + r) - p * t
        val canReach = slack >= 0
        val maxSafe = if (canReach) minOf(slack / 100, r).toInt() else 0
        val safeLeft = if (strictNoSkip) 0 else maxOf(0, maxSafe - counts.plannedSkips)
        val overBudget = maxOf(0, counts.plannedSkips - maxSafe)

        val below = m > 0 && 100 * a < p * m
        // Smallest k with 100 * (a + k) >= p * (m + k)  <=>  k * (100 - p) >= p * m - 100 * a.
        val recovery = when {
            !below -> null
            p == 100L -> null
            else -> ceilDiv(p * m - 100 * a, 100 - p).toInt()
        }

        val status = when {
            !canReach || below || overBudget > 0 -> CourseStatus.AT_RISK
            !strictNoSkip && safeLeft == 0 && counts.remaining > 0 -> CourseStatus.TIGHT
            else -> CourseStatus.SAFE
        }

        return AttendanceStats(
            counts = counts,
            thresholdPercent = thresholdPercent,
            strictNoSkip = strictNoSkip,
            currentPercent = percent(a, m),
            currentPercentFloor = floorPercent(a, m),
            maxSafeSkips = maxSafe,
            safeSkipsLeft = safeLeft,
            overBudget = overBudget,
            canReachThreshold = canReach,
            belowThreshold = below,
            recoveryClasses = recovery,
            projectedIfAttendAll = percent(a + r, t),
            projectedIfPlanFollowed = percent(a + r - counts.plannedSkips, t),
            status = status,
        )
    }

    /** `100 * part / whole` as a Double, or null when [whole] is 0. */
    public fun percent(part: Long, whole: Long): Double? = if (whole == 0L) null else 100.0 * part / whole

    /** `100 * part / whole` rounded down, computed exactly. Null when [whole] is 0. */
    public fun floorPercent(part: Long, whole: Long): Int? = if (whole == 0L) null else (100 * part / whole).toInt()

    private fun ceilDiv(a: Long, b: Long): Long = -Math.floorDiv(-a, b)
}
