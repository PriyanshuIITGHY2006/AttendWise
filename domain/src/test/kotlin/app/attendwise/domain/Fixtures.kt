package app.attendwise.domain

import app.attendwise.domain.calendar.DayResolver
import app.attendwise.domain.model.Audience
import app.attendwise.domain.model.ClassKey
import app.attendwise.domain.model.Course
import app.attendwise.domain.model.DayType
import app.attendwise.domain.model.InstituteDay
import app.attendwise.domain.model.Mark
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.model.Semester
import app.attendwise.domain.model.TimetableSlot
import app.attendwise.domain.time.Now
import app.attendwise.domain.time.days
import java.time.DayOfWeek
import java.time.DayOfWeek.FRIDAY
import java.time.DayOfWeek.MONDAY
import java.time.DayOfWeek.THURSDAY
import java.time.DayOfWeek.WEDNESDAY
import java.time.LocalDate
import java.time.LocalTime

internal fun d(text: String): LocalDate = LocalDate.parse(text)
internal fun t(text: String): LocalTime = LocalTime.parse(text)
internal fun now(date: String, time: String = "12:00"): Now = Now(d(date), t(time))

internal fun slot(
    id: String,
    course: String,
    day: DayOfWeek,
    start: String,
    end: String,
    from: String? = null,
    to: String? = null,
): TimetableSlot = TimetableSlot(id, course, day, t(start), t(end), validFrom = from?.let(::d), validTo = to?.let(::d))

internal fun mark(course: String, date: String, start: String, status: MarkStatus, plan: String? = null): Mark =
    Mark(ClassKey(course, d(date), t(start)), status, plan)

internal fun key(course: String, date: String, start: String): ClassKey = ClassKey(course, d(date), t(start))

/**
 * The real IIT Guwahati Monsoon 2026 calendar, as far as the app cares:
 * instruction 23 Jul - 12 Nov, mid-semester exams 13-20 Sep, and the day swaps.
 */
internal object Monsoon2026 {
    val semester = Semester(
        name = "Monsoon 2026",
        start = d("2026-07-23"),
        end = d("2026-11-12"),
        midSemStart = d("2026-09-13"),
        midSemEnd = d("2026-09-20"),
    )

    val calendar: List<InstituteDay> = buildList {
        add(InstituteDay(d("2026-08-27"), DayType.RESCHEDULE, "Thu runs Wed", WEDNESDAY))
        add(InstituteDay(d("2026-10-01"), DayType.RESCHEDULE, "Thu runs Fri", FRIDAY))
        add(InstituteDay(d("2026-11-11"), DayType.RESCHEDULE, "Wed runs Mon", MONDAY))
        add(InstituteDay(d("2026-08-08"), DayType.RESCHEDULE, "Sat runs Thu", THURSDAY, Audience.FIRST_YEAR_UG))
        add(InstituteDay(d("2026-08-22"), DayType.RESCHEDULE, "Sat runs Fri", FRIDAY, Audience.FIRST_YEAR_UG))
        add(InstituteDay(d("2026-10-02"), DayType.HOLIDAY, "Gandhi Jayanti"))
        (d("2026-09-13")..d("2026-09-20")).days().forEach { add(InstituteDay(it, DayType.EXAM, "Mid-semester exams")) }
    }

    fun resolver(firstYear: Boolean = false): DayResolver = DayResolver(calendar, firstYear)

    val ma201 = Course("ma201", "MA 201", "Mathematics III")
    val ee203 = Course("ee203", "EE 203", "Signals & Systems")
    val lab = Course("cs221", "CS 221", "Digital Design Lab", strictNoSkip = true)

    /** EE 203: Mon / Wed / Fri 11:00. MA 201: Tue / Thu 09:00. Lab: Fri 14:00-16:55. */
    val slots = listOf(
        slot("ee-mon", "ee203", MONDAY, "11:00", "11:55"),
        slot("ee-wed", "ee203", WEDNESDAY, "11:00", "11:55"),
        slot("ee-fri", "ee203", FRIDAY, "11:00", "11:55"),
        slot("ma-tue", "ma201", DayOfWeek.TUESDAY, "09:00", "09:55"),
        slot("ma-thu", "ma201", THURSDAY, "09:00", "09:55"),
        slot("lab-fri", "cs221", FRIDAY, "14:00", "16:55"),
    )
}
