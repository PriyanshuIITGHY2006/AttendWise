package app.attendwise.domain.planner

import app.attendwise.domain.attendance.AttendanceMath
import app.attendwise.domain.attendance.AttendanceStats
import app.attendwise.domain.attendance.countAttendance
import app.attendwise.domain.model.ClassKey
import app.attendwise.domain.model.Course
import app.attendwise.domain.model.CourseId
import app.attendwise.domain.model.Mark
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.model.PlanId
import app.attendwise.domain.schedule.ClassOccurrence
import app.attendwise.domain.schedule.Schedule
import app.attendwise.domain.time.Now
import java.time.LocalDate

/** Verdict for skipping a course's classes on the chosen days. */
public enum class SkipVerdict {
    /** All of them can be skipped and the course stays at or above the requirement. */
    SAFE,

    /** The maths allows it, but the course is below the requirement right now. */
    RISKY,

    /** Only some can be skipped ([CoursePlanLine.budget] of them). */
    PARTIAL,

    /** No skips left: attend all of them. */
    MUST_ATTEND,

    /** Zero-tolerance course: never skipped by the planner. */
    LOCKED,

    /** The course has no plannable classes on those days. */
    NOTHING_TO_SKIP,
    ;

    public val isSkippable: Boolean get() = this == SAFE || this == RISKY
}

public enum class OverallVerdict {
    /** Every affected course can take the skips. */
    ALL_SKIPPABLE,

    /** Some courses can, some need attending. */
    PARTLY,

    /** None of the affected classes can be skipped. */
    NONE_SKIPPABLE,

    /** No plannable classes on those days at all. */
    NOTHING_TO_SKIP,
}

public data class CoursePlanLine(
    val course: Course,
    /** Classes on the chosen days that can still be planned, earliest first. */
    val candidates: List<ClassOccurrence>,
    /** How many more skips the course can take. */
    val budget: Int,
    val verdict: SkipVerdict,
    /** Stats before this plan. */
    val before: AttendanceStats,
)

public data class PlanProposal(
    /** One line per affected course, most constrained first. */
    val lines: List<CoursePlanLine>,
    val overall: OverallVerdict,
    /** Classes ticked by default: every class of every SAFE or RISKY course. */
    val defaultSelection: Set<ClassKey>,
)

/** Effect of a concrete selection of classes to skip. */
public data class SelectionOutcome(
    /** Stats per course if the selection is applied, for every course the selection touches. */
    val after: Map<CourseId, AttendanceStats>,
    /** Courses the selection pushes over budget, or that are zero-tolerance. */
    val violations: Set<CourseId>,
) {
    val isWithinBudget: Boolean get() = violations.isEmpty()
}

public sealed interface ApplyResult {
    /** Marks to save (insert or replace by key). */
    public data class Applied(val marks: List<Mark>) : ApplyResult

    /** Nothing saved: the listed classes cannot be planned, or the plan breaks a budget. */
    public data class Rejected(val unplannable: Set<ClassKey>, val violations: Set<CourseId>) : ApplyResult
}

/**
 * The single planner behind "plan a day off", trips, and "can I bunk today?".
 *
 * A class can be planned when it has not started yet and is unmarked or marked
 * present. Classes already planned as skips are not offered again, so two plans
 * never spend the same skip twice: the budget is always the course's skips left
 * after every existing plan.
 */
public object Planner {

    public fun propose(courses: List<Course>, schedule: Schedule, dates: Set<LocalDate>, now: Now): PlanProposal {
        val lines = courses.filterNot { it.archived }.mapNotNull { course ->
            val all = schedule.forCourse(course.id)
            val candidates = all.filter { it.date in dates && isPlannable(it, now) }
            if (candidates.isEmpty()) return@mapNotNull null
            val before = AttendanceMath.stats(countAttendance(all, now), course.thresholdPercent, course.strictNoSkip)
            val budget = before.safeSkipsLeft
            val verdict = when {
                course.strictNoSkip -> SkipVerdict.LOCKED
                budget == 0 -> SkipVerdict.MUST_ATTEND
                candidates.size > budget -> SkipVerdict.PARTIAL
                before.belowThreshold -> SkipVerdict.RISKY
                else -> SkipVerdict.SAFE
            }
            CoursePlanLine(course, candidates, budget, verdict, before)
        }.sortedWith(compareBy({ verdictOrder(it.verdict) }, { it.course.code }))

        val overall = when {
            lines.isEmpty() -> OverallVerdict.NOTHING_TO_SKIP
            lines.all { it.verdict.isSkippable } -> OverallVerdict.ALL_SKIPPABLE
            lines.none { it.verdict.isSkippable || it.verdict == SkipVerdict.PARTIAL } -> OverallVerdict.NONE_SKIPPABLE
            else -> OverallVerdict.PARTLY
        }
        val defaults = lines.filter { it.verdict.isSkippable }.flatMap { l -> l.candidates.map { it.key } }.toSet()
        return PlanProposal(lines, overall, defaults)
    }

    /** What happens if exactly [selection] is skipped on top of existing plans. */
    public fun evaluate(courses: List<Course>, schedule: Schedule, selection: Set<ClassKey>, now: Now): SelectionOutcome {
        val byId = courses.associateBy { it.id }
        val touched = selection.map { it.courseId }.toSet()
        val after = mutableMapOf<CourseId, AttendanceStats>()
        val violations = mutableSetOf<CourseId>()
        for (courseId in touched) {
            val course = byId[courseId] ?: continue
            val hypothetical = schedule.forCourse(courseId).map { occ ->
                if (occ.key in selection && isPlannable(occ, now)) occ.copy(mark = Mark(occ.key, MarkStatus.ABSENT)) else occ
            }
            val stats = AttendanceMath.stats(countAttendance(hypothetical, now), course.thresholdPercent, course.strictNoSkip)
            after[courseId] = stats
            if (course.strictNoSkip || stats.overBudget > 0) violations += courseId
        }
        return SelectionOutcome(after, violations)
    }

    /**
     * Turns [selection] into planned-skip marks tagged with [planId].
     * Rejects the whole plan if any class is not plannable or, unless
     * [allowOverBudget], if any course would go over budget.
     */
    public fun apply(
        courses: List<Course>,
        schedule: Schedule,
        selection: Set<ClassKey>,
        planId: PlanId,
        now: Now,
        allowOverBudget: Boolean = false,
    ): ApplyResult {
        val byKey = schedule.occurrences.associateBy { it.key }
        val active = courses.filterNot { it.archived }.map { it.id }.toSet()
        val unplannable = selection.filterTo(mutableSetOf()) { key ->
            val occ = byKey[key]
            occ == null || key.courseId !in active || !isPlannable(occ, now)
        }
        val outcome = evaluate(courses, schedule, selection - unplannable, now)
        val strictHits = outcome.violations.filterTo(mutableSetOf()) { id -> courses.first { it.id == id }.strictNoSkip }
        val blocking = if (allowOverBudget) strictHits else outcome.violations
        if (unplannable.isNotEmpty() || blocking.isNotEmpty()) return ApplyResult.Rejected(unplannable, blocking)
        val marks = selection.sortedWith(compareBy({ it.date }, { it.start }, { it.courseId }))
            .map { key -> Mark(key, MarkStatus.ABSENT, planId, byKey.getValue(key).end) }
        return ApplyResult.Applied(marks)
    }

    /**
     * Keys of the marks to delete to undo plan [planId]. Skips whose class has
     * already started are kept: by then they are real absences, not plans.
     */
    public fun undo(marks: List<Mark>, planId: PlanId, now: Now): List<ClassKey> =
        marks.filter { it.planId == planId && it.status == MarkStatus.ABSENT && !hasStarted(it.key, now) }.map { it.key }

    public fun isPlannable(occ: ClassOccurrence, now: Now): Boolean {
        if (occ.hasStarted(now)) return false
        val status = occ.mark?.status
        return status == null || status == MarkStatus.PRESENT
    }

    private fun hasStarted(key: ClassKey, now: Now): Boolean =
        key.date.isBefore(now.date) || (key.date == now.date && !key.start.isAfter(now.time))

    private fun verdictOrder(v: SkipVerdict): Int = when (v) {
        SkipVerdict.LOCKED -> 0
        SkipVerdict.MUST_ATTEND -> 1
        SkipVerdict.PARTIAL -> 2
        SkipVerdict.RISKY -> 3
        SkipVerdict.SAFE -> 4
        SkipVerdict.NOTHING_TO_SKIP -> 5
    }
}
