package app.attendwise.data

import app.attendwise.domain.attendance.AttendanceStats
import app.attendwise.domain.attendance.CourseStatus
import app.attendwise.domain.attendance.OverallAttendance
import app.attendwise.domain.attendance.courseStats
import app.attendwise.domain.attendance.overallAttendance
import app.attendwise.domain.calendar.DayInfo
import app.attendwise.domain.gamify.Badge
import app.attendwise.domain.gamify.Streak
import app.attendwise.domain.gamify.classStreak
import app.attendwise.domain.gamify.evaluateBadges
import app.attendwise.domain.model.CourseId
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.planner.NextClass
import app.attendwise.domain.planner.TodayVerdict
import app.attendwise.domain.planner.nextClass
import app.attendwise.domain.planner.todayVerdict
import app.attendwise.domain.schedule.ClassOccurrence
import app.attendwise.domain.schedule.Schedule
import app.attendwise.domain.time.Now
import app.attendwise.notify.Copy
import java.time.LocalDate

/**
 * Everything shown on screen, in widgets and in notifications, computed once
 * from the data and the current moment. All three surfaces use this, so they
 * can never disagree.
 */
class Derived(val data: AppData, val now: Now) {
    val schedule: Schedule = data.schedule(now)

    val stats: Map<CourseId, AttendanceStats> =
        data.activeCourses.associate { it.id to courseStats(it, schedule, now) }

    val overall: OverallAttendance = overallAttendance(data.courses, schedule, now)

    val inSemester: Boolean = data.semester?.let { !now.date.isBefore(it.start) && !now.date.isAfter(it.end) } ?: false

    fun dayInfo(date: LocalDate): DayInfo = data.dayResolver().resolve(date)

    val todayInfo: DayInfo = dayInfo(now.date)

    /** Today's classes, cancelled and on-duty ones included (they show as such). */
    val today: List<ClassOccurrence> = schedule.on(now.date)

    /** Today's classes that are not over yet and not cancelled. */
    val todayRemaining: List<ClassOccurrence> =
        today.filter { !it.hasEnded(now) && it.mark?.status?.isNeutral != true }

    /** Ended classes with no mark, newest first. */
    val unmarkedPast: List<ClassOccurrence> =
        schedule.occurrences.filter { it.mark == null && it.hasEnded(now) }.sortedWith(compareByDescending<ClassOccurrence> { it.date }.thenByDescending { it.start })

    val verdict: TodayVerdict = todayVerdict(data.activeCourses, schedule, now)

    val next: NextClass? = nextClass(schedule, now)

    /** Classes attended in a row, now and at best. */
    val streak: Streak = classStreak(schedule, now)

    /** Every badge with its progress. */
    val badges: List<Badge> = evaluateBadges(schedule, data.activeCourses, stats, now)

    /** Courses that are tight or at risk, worst first. */
    val danger: List<Pair<CourseId, AttendanceStats>> =
        stats.entries.filter { it.value.status != CourseStatus.SAFE }
            .sortedWith(compareBy({ if (it.value.status == CourseStatus.AT_RISK) 0 else 1 }, { it.value.currentPercent ?: 100.0 }))
            .map { it.key to it.value }

    fun verdictLine(): String {
        val must = verdict.mustAttend.sortedBy { if (stats[it]?.status == CourseStatus.AT_RISK) 0 else 1 }
        return Copy.todayVerdict(verdict.kind, verdict.skippable.map(data::code), must.map(data::code), data.humor, now.date.toString())
    }

    fun isPlannedSkip(occ: ClassOccurrence): Boolean = occ.mark?.status == MarkStatus.ABSENT && !occ.hasStarted(now)
}
