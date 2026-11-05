package app.attendwise.domain.planner

import app.attendwise.domain.model.Course
import app.attendwise.domain.model.CourseId
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.schedule.ClassOccurrence
import app.attendwise.domain.schedule.Schedule
import app.attendwise.domain.time.Now
import java.time.Duration

/** The "Can I bunk today?" answer. */
public data class TodayVerdict(
    val kind: Kind,
    /** Courses whose remaining classes today can all be skipped. */
    val skippable: List<CourseId>,
    /** Courses that can take some but not all of today's remaining classes. */
    val partly: List<CourseId>,
    /** Courses that need every remaining class today (including zero-tolerance ones). */
    val mustAttend: List<CourseId>,
) {
    public enum class Kind {
        /** No classes scheduled today. */
        NO_CLASSES_TODAY,

        /** Today had classes but none are left to plan. */
        DAY_DONE,

        ALL_SKIPPABLE,
        SOME_SKIPPABLE,
        NONE_SKIPPABLE,
    }
}

public fun todayVerdict(courses: List<Course>, schedule: Schedule, now: Now): TodayVerdict {
    val todays = schedule.on(now.date).filter { it.mark?.status?.isNeutral != true }
    if (todays.isEmpty()) return TodayVerdict(TodayVerdict.Kind.NO_CLASSES_TODAY, emptyList(), emptyList(), emptyList())
    val proposal = Planner.propose(courses, schedule, setOf(now.date), now)
    if (proposal.lines.isEmpty()) return TodayVerdict(TodayVerdict.Kind.DAY_DONE, emptyList(), emptyList(), emptyList())
    val skippable = proposal.lines.filter { it.verdict.isSkippable }.map { it.course.id }
    val partly = proposal.lines.filter { it.verdict == SkipVerdict.PARTIAL }.map { it.course.id }
    val must = proposal.lines.filter { it.verdict == SkipVerdict.MUST_ATTEND || it.verdict == SkipVerdict.LOCKED }.map { it.course.id }
    val kind = when (proposal.overall) {
        OverallVerdict.ALL_SKIPPABLE -> TodayVerdict.Kind.ALL_SKIPPABLE
        OverallVerdict.PARTLY -> TodayVerdict.Kind.SOME_SKIPPABLE
        OverallVerdict.NONE_SKIPPABLE -> TodayVerdict.Kind.NONE_SKIPPABLE
        OverallVerdict.NOTHING_TO_SKIP -> TodayVerdict.Kind.DAY_DONE
    }
    return TodayVerdict(kind, skippable, partly, must)
}

/** The class the "Next class" widget shows. */
public data class NextClass(
    val occurrence: ClassOccurrence,
    /** True while the class is running. */
    val inProgress: Boolean,
    /** Time until it starts; zero once in progress. */
    val startsIn: Duration,
)

/**
 * The class happening now or next, skipping cancelled / on-duty classes and,
 * unless [includePlannedSkips], classes the student plans to skip.
 * Null when nothing is left in the schedule.
 */
public fun nextClass(schedule: Schedule, now: Now, includePlannedSkips: Boolean = false): NextClass? {
    val occ = schedule.occurrences.firstOrNull { o ->
        val status = o.mark?.status
        !o.hasEnded(now) &&
            status?.isNeutral != true &&
            (includePlannedSkips || status != MarkStatus.ABSENT)
    } ?: return null
    val inProgress = occ.hasStarted(now)
    val startsIn = if (inProgress) Duration.ZERO else Duration.between(now.dateTime, occ.date.atTime(occ.start))
    return NextClass(occ, inProgress, startsIn)
}
