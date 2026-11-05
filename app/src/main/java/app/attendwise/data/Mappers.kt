package app.attendwise.data

import app.attendwise.data.db.CalendarEntity
import app.attendwise.data.db.CourseEntity
import app.attendwise.data.db.ExtraClassEntity
import app.attendwise.data.db.MarkEntity
import app.attendwise.data.db.NotificationSettingsEntity
import app.attendwise.data.db.SemesterEntity
import app.attendwise.data.db.SlotEntity
import app.attendwise.domain.model.Audience
import app.attendwise.domain.model.ClassKey
import app.attendwise.domain.model.Course
import app.attendwise.domain.model.DayType
import app.attendwise.domain.model.ExtraClass
import app.attendwise.domain.model.InstituteDay
import app.attendwise.domain.model.Mark
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.model.Semester
import app.attendwise.domain.model.SlotKind
import app.attendwise.domain.model.Term
import app.attendwise.domain.model.TimetableSlot
import app.attendwise.domain.notify.NotificationSettings
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime

fun Long.toDate(): LocalDate = LocalDate.ofEpochDay(this)
fun Int.toTime(): LocalTime = LocalTime.ofSecondOfDay(this.toLong())
fun LocalTime.toSec(): Int = toSecondOfDay()

private inline fun <reified E : Enum<E>> enumOf(text: String?, default: E): E =
    text?.let { t -> enumValues<E>().firstOrNull { it.name.equals(t, ignoreCase = true) } } ?: default

fun termOf(text: String) = enumOf(text, Term.FULL)
fun kindOf(text: String) = enumOf(text, SlotKind.LECTURE)
fun statusOf(text: String): MarkStatus? = enumValues<MarkStatus>().firstOrNull { it.name.equals(text, ignoreCase = true) }
fun Term.wire(): String = name.lowercase()
fun SlotKind.wire(): String = name.lowercase()
fun MarkStatus.wire(): String = name.lowercase()

fun SemesterEntity.toDomain() = Semester(name, startDay.toDate(), endDay.toDate(), midStartDay?.toDate(), midEndDay?.toDate())

fun CourseEntity.toDomain() = Course(id, code, name, thresholdPercent, strictNoSkip, termOf(term), archived)

fun SlotEntity.toDomain() = TimetableSlot(
    id = id, courseId = courseId, dayOfWeek = DayOfWeek.of(dayOfWeek.coerceIn(1, 7)),
    start = startSec.toTime(), end = endSec.toTime(), room = room, kind = kindOf(kind),
    validFrom = validFromDay?.toDate(), validTo = validToDay?.toDate(),
)

fun ExtraClassEntity.toDomain() = ExtraClass(courseId, day.toDate(), startSec.toTime(), endSec.toTime(), room, kindOf(kind))

fun MarkEntity.toDomain(): Mark? = statusOf(status)?.let { s ->
    Mark(ClassKey(courseId, day.toDate(), startSec.toTime()), s, planId, endSec?.toTime())
}

fun CalendarEntity.toDomain(): InstituteDay? {
    val type = enumValues<DayType>().firstOrNull { it.name.equals(dayType, ignoreCase = true) } ?: return null
    return InstituteDay(
        date = day.toDate(), type = type, description = description,
        followsDayOfWeek = followsDayOfWeek?.takeIf { it in 1..7 }?.let { DayOfWeek.of(it) },
        audience = if (audience.equals("first_year_ug", ignoreCase = true)) Audience.FIRST_YEAR_UG else Audience.ALL,
    )
}

fun NotificationSettingsEntity?.toDomain(): NotificationSettings {
    val s = this ?: return NotificationSettings()
    return NotificationSettings(
        muted = s.muted, classReminders = s.classReminders, leadTimeMinutes = s.leadTimeMinutes.coerceIn(0, 180),
        markPrompts = s.markPrompts, dailyDigest = s.dailyDigest, digestTime = s.digestSec.toTime(),
        plannedSkipReminders = s.plannedSkipReminders,
        quietStart = s.quietStartSec?.toTime(), quietEnd = s.quietEndSec?.toTime(),
    )
}
