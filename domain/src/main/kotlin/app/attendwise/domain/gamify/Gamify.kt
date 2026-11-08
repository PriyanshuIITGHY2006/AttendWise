package app.attendwise.domain.gamify

import app.attendwise.domain.attendance.AttendanceStats
import app.attendwise.domain.model.Course
import app.attendwise.domain.model.CourseId
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.model.SlotKind
import app.attendwise.domain.schedule.ClassOccurrence
import app.attendwise.domain.schedule.Schedule
import app.attendwise.domain.time.Now
import java.time.LocalDate
import java.time.LocalTime

/** Classes attended in a row. */
public data class Streak(val current: Int, val best: Int)

/**
 * The class streak. Going through every class that has started, oldest first:
 * a present mark adds one, an absent mark resets to zero. Cancelled and
 * on-duty classes, and classes not marked yet, neither add nor break it.
 */
public fun classStreak(schedule: Schedule, now: Now): Streak {
    var run = 0
    var best = 0
    for (o in schedule.occurrences) {
        if (!o.hasStarted(now)) continue
        when (o.mark?.status) {
            MarkStatus.PRESENT -> { run++; if (run > best) best = run }
            MarkStatus.ABSENT -> run = 0
            else -> Unit
        }
    }
    return Streak(run, best)
}

public enum class Tier { BRONZE, SILVER, GOLD }

/** A badge, whether it is unlocked and how far along it is. */
public data class Badge(
    val id: String,
    val title: String,
    /** How to earn it. */
    val how: String,
    val tier: Tier,
    val unlocked: Boolean,
    /** Progress towards [goal]. */
    val value: Int,
    val goal: Int,
)

private class Spec(val id: String, val title: String, val how: String, val tier: Tier, val goal: Int)

private val SPECS = listOf(
    Spec("day-one", "Day One", "Mark your first class as present.", Tier.BRONZE, 1),
    Spec("hot-streak", "Hot Streak", "Attend 5 classes in a row.", Tier.BRONZE, 5),
    Spec("unstoppable", "Unstoppable", "Attend 15 classes in a row.", Tier.SILVER, 15),
    Spec("legend", "Legend", "Attend 30 classes in a row.", Tier.GOLD, 30),
    Spec("perfect-week", "Perfect Week", "Attend every class in a week that had at least 4.", Tier.SILVER, 1),
    Spec("early-bird", "Early Bird", "Attend 5 classes that start before 9:00.", Tier.BRONZE, 5),
    Spec("comeback", "Comeback Kid", "Climb back above the requirement in a course that had dropped below it.", Tier.SILVER, 1),
    Spec("lab-regular", "Lab Regular", "Attend 10 lab classes.", Tier.BRONZE, 10),
    Spec("full-marks", "Full Marks", "Reach 100% in a course after at least 10 classes.", Tier.GOLD, 1),
)

private val NINE = LocalTime.of(9, 0)

private fun weekStart(date: LocalDate): LocalDate = date.minusDays((date.dayOfWeek.value - 1).toLong())

/** True if some course dropped below its requirement after a few classes and is now back at or above it. */
private fun hasComeback(courses: List<Course>, occurrences: List<ClassOccurrence>, now: Now): Boolean {
    for (c in courses.filterNot { it.archived }) {
        var attended = 0
        var marked = 0
        var wasBelow = false
        for (o in occurrences) {
            if (o.courseId != c.id || !o.hasStarted(now)) continue
            val s = o.mark?.status
            if (s != MarkStatus.PRESENT && s != MarkStatus.ABSENT) continue
            marked++
            if (s == MarkStatus.PRESENT) attended++
            if (marked >= 4 && 100 * attended < c.thresholdPercent * marked) wasBelow = true
        }
        if (wasBelow && marked > 0 && 100 * attended >= c.thresholdPercent * marked) return true
    }
    return false
}

/** True if some week had at least 4 classes, all over, and every one of them attended. */
private fun hasPerfectWeek(occurrences: List<ClassOccurrence>, now: Now): Boolean =
    occurrences
        .filter { it.mark?.status?.isNeutral != true }
        .groupBy { weekStart(it.date) }
        .values
        .any { list -> list.size >= 4 && list.all { it.hasEnded(now) && it.mark?.status == MarkStatus.PRESENT } }

/** Every badge, with whether it is unlocked and how far along it is. Computed from the student's data, so nothing is stored. */
public fun evaluateBadges(
    schedule: Schedule,
    courses: List<Course>,
    stats: Map<CourseId, AttendanceStats>,
    now: Now,
): List<Badge> {
    val active = courses.filterNot { it.archived }.map { it.id }.toSet()
    val occ = schedule.occurrences.filter { it.courseId in active }
    val attended = occ.filter { it.hasStarted(now) && it.mark?.status == MarkStatus.PRESENT }
    val best = classStreak(Schedule(occ, emptyList()), now).best
    val fullMarks = stats.values.any { it.counts.attended + it.counts.missed >= 10 && it.counts.missed == 0 }

    val value = mapOf(
        "day-one" to minOf(1, attended.size),
        "hot-streak" to best,
        "unstoppable" to best,
        "legend" to best,
        "perfect-week" to if (hasPerfectWeek(occ, now)) 1 else 0,
        "early-bird" to attended.count { it.start.isBefore(NINE) },
        "comeback" to if (hasComeback(courses, occ, now)) 1 else 0,
        "lab-regular" to attended.count { it.kind == SlotKind.LAB },
        "full-marks" to if (fullMarks) 1 else 0,
    )
    return SPECS.map { s ->
        val v = value[s.id] ?: 0
        Badge(s.id, s.title, s.how, s.tier, unlocked = v >= s.goal, value = minOf(v, s.goal), goal = s.goal)
    }
}

/** Streak lengths that get a celebration the first time they are reached. */
public val STREAK_MILESTONES: List<Int> = listOf(7, 14, 21, 30, 50, 100)

/** What a person has already been congratulated for. */
public data class Seen(val badges: Set<String>, val streak: Int)

/** Something worth a celebration. */
public sealed interface Moment {
    public data class BadgeUnlocked(val badge: Badge) : Moment
    public data class StreakReached(val days: Int) : Moment
}

public data class Moments(val moments: List<Moment>, val next: Seen)

/**
 * Works out what is new since the last visit. The first run on a device ([seen]
 * is null) only records the current state, so nobody is greeted with old
 * achievements.
 */
public fun newMoments(seen: Seen?, badges: List<Badge>, bestStreak: Int): Moments {
    val unlocked = badges.filter { it.unlocked }
    val reached = STREAK_MILESTONES.lastOrNull { bestStreak >= it } ?: 0
    val nextStreak = maxOf(reached, seen?.streak ?: 0)
    if (seen == null) return Moments(emptyList(), Seen(unlocked.map { it.id }.toSet(), nextStreak))
    val moments = mutableListOf<Moment>()
    if (reached > seen.streak) moments += Moment.StreakReached(reached)
    for (b in unlocked) if (b.id !in seen.badges) moments += Moment.BadgeUnlocked(b)
    return Moments(moments, Seen(seen.badges + unlocked.map { it.id }, nextStreak))
}
