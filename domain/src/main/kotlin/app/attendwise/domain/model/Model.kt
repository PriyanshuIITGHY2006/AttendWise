package app.attendwise.domain.model

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime

/*
 * Core data the attendance rules work on. Everything here is plain, immutable
 * and free of Android or database types, so the rules can be tested exhaustively
 * on the JVM. All dates and times are device-local wall-clock values: "today"
 * always means the student's own calendar day, never UTC.
 */

public typealias CourseId = String
public typealias SlotId = String
public typealias PlanId = String

/** Which part of the semester a course runs in. */
public enum class Term {
    /** The whole semester. */
    FULL,

    /** Only before the mid-semester exams (a half-semester course). */
    PRE_MID,

    /** Only after the mid-semester exams (a half-semester course). */
    POST_MID,
}

public enum class SlotKind { LECTURE, TUTORIAL, LAB }

/**
 * What the student recorded for one class.
 *
 * [CANCELLED] and [ON_DUTY] are neutral: they count toward neither attended nor
 * missed, and they no longer count as a class still to come.
 */
public enum class MarkStatus {
    PRESENT,
    ABSENT,
    CANCELLED,
    ON_DUTY,
    ;

    public val isNeutral: Boolean get() = this == CANCELLED || this == ON_DUTY
}

/** Kinds of entries in the institute's academic calendar. */
public enum class DayType {
    HOLIDAY,
    MID_SEM_BREAK,
    END_SEM_BREAK,
    EXAM,

    /** A working day that runs another weekday's timetable (a "day swap"). */
    RESCHEDULE,
    ;

    /** True when no regular classes are held on such a day. */
    public val isNoClassDay: Boolean get() = this != RESCHEDULE
}

/** Who an institute calendar entry applies to. */
public enum class Audience { ALL, FIRST_YEAR_UG }

public data class Semester(
    val name: String,
    val start: LocalDate,
    val end: LocalDate,
    /** First day of the mid-semester exam period, used to split half-semester courses. */
    val midSemStart: LocalDate? = null,
    /** Last day of the mid-semester exam period. */
    val midSemEnd: LocalDate? = null,
)

public data class Course(
    val id: CourseId,
    val code: String,
    val name: String,
    /** Required attendance in whole percent, 0..100. */
    val thresholdPercent: Int = 75,
    /** Zero-tolerance course: the app never suggests skipping it. */
    val strictNoSkip: Boolean = false,
    val term: Term = Term.FULL,
    val archived: Boolean = false,
)

/**
 * One weekly timetable slot. Slots are versioned: editing a timetable closes
 * the old slot ([validTo]) and opens a new one ([validFrom]), so classes that
 * already happened never change retroactively. Null bounds are open-ended.
 */
public data class TimetableSlot(
    val id: SlotId,
    val courseId: CourseId,
    val dayOfWeek: DayOfWeek,
    val start: LocalTime,
    val end: LocalTime,
    val room: String? = null,
    val kind: SlotKind = SlotKind.LECTURE,
    val validFrom: LocalDate? = null,
    val validTo: LocalDate? = null,
) {
    public fun isValidOn(date: LocalDate): Boolean =
        (validFrom == null || !date.isBefore(validFrom)) && (validTo == null || !date.isAfter(validTo))
}

/** A one-off class outside the timetable (makeup, extra lecture). */
public data class ExtraClass(
    val courseId: CourseId,
    val date: LocalDate,
    val start: LocalTime,
    val end: LocalTime,
    val room: String? = null,
    val kind: SlotKind = SlotKind.LECTURE,
)

/** One entry of the institute's academic calendar. */
public data class InstituteDay(
    val date: LocalDate,
    val type: DayType,
    val description: String? = null,
    /** For [DayType.RESCHEDULE]: the weekday whose timetable runs on [date]. */
    val followsDayOfWeek: DayOfWeek? = null,
    val audience: Audience = Audience.ALL,
)

/**
 * Identity of a single class: a course, a date and a start time. Two devices
 * marking the same class produce the same key, so their marks merge.
 */
public data class ClassKey(
    val courseId: CourseId,
    val date: LocalDate,
    val start: LocalTime,
)

/** The student's record for one class. Future [MarkStatus.ABSENT] marks are planned skips. */
public data class Mark(
    val key: ClassKey,
    val status: MarkStatus,
    /** Set when the mark was created by the planner, so the whole plan can be undone. */
    val planId: PlanId? = null,
    /**
     * End time of the class when it was marked. Only used if the class later
     * disappears from the timetable, so the record can still be shown and counted.
     */
    val end: LocalTime? = null,
)
