package app.attendwise.data.sync

import app.attendwise.data.db.CalendarEntity
import app.attendwise.data.db.CourseEntity
import app.attendwise.data.db.ExtraClassEntity
import app.attendwise.data.db.MarkEntity
import app.attendwise.data.db.NotificationSettingsEntity
import app.attendwise.data.db.ProfileEntity
import app.attendwise.data.db.SemesterEntity
import app.attendwise.data.db.SlotEntity
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

/*
 * Conversions between local rows and the JSON the v2 REST API speaks.
 * Dates travel as ISO dates, times as HH:mm:ss, and soft deletes as deleted_at.
 */

internal fun dayToIso(day: Long?): String? = day?.let { LocalDate.ofEpochDay(it).toString() }
internal fun isoToDay(text: String?): Long? = text?.let { LocalDate.parse(it).toEpochDay() }
internal fun secToIso(sec: Int?): String? = sec?.let { LocalTime.ofSecondOfDay(it.toLong()).toString().let { t -> if (t.length == 5) "$t:00" else t } }
internal fun isoToSec(text: String?): Int? = text?.let { LocalTime.parse(it).toSecondOfDay() }
private fun deletedAt(deleted: Boolean): String? = if (deleted) Instant.now().toString() else null

private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.takeUnless { it is JsonNull }?.contentOrNull
private fun JsonObject.req(key: String): String = str(key) ?: error("Missing $key")
private fun JsonObject.bool(key: String, default: Boolean = false): Boolean = (this[key] as? JsonPrimitive)?.booleanOrNull ?: default
private fun JsonObject.int(key: String): Int? = (this[key] as? JsonPrimitive)?.intOrNull
private fun JsonObject.isDeleted(): Boolean = str("deleted_at") != null

internal fun updatedAt(row: JsonObject): String? = row["updated_at"]?.jsonPrimitive?.contentOrNull

// Semesters

internal fun SemesterEntity.toJson(userId: String) = buildJsonObject {
    put("id", id); put("user_id", userId); put("name", name)
    put("start_date", dayToIso(startDay)); put("end_date", dayToIso(endDay))
    put("mid_sem_start", dayToIso(midStartDay)); put("mid_sem_end", dayToIso(midEndDay))
    put("is_active", isActive); put("deleted_at", deletedAt(deleted))
}

internal fun semesterFrom(j: JsonObject) = SemesterEntity(
    id = j.req("id"), name = j.req("name"),
    startDay = isoToDay(j.req("start_date"))!!, endDay = isoToDay(j.req("end_date"))!!,
    midStartDay = isoToDay(j.str("mid_sem_start")), midEndDay = isoToDay(j.str("mid_sem_end")),
    isActive = j.bool("is_active", true), deleted = j.isDeleted(),
)

// Courses

internal fun CourseEntity.toJson(userId: String) = buildJsonObject {
    put("id", id); put("user_id", userId); put("semester_id", semesterId)
    put("code", code); put("name", name); put("color", color)
    put("threshold_percent", thresholdPercent); put("strict_no_skip", strictNoSkip)
    put("term", term); put("archived", archived); put("deleted_at", deletedAt(deleted))
}

internal fun courseFrom(j: JsonObject) = CourseEntity(
    id = j.req("id"), semesterId = j.req("semester_id"), code = j.req("code"), name = j.req("name"),
    color = j.str("color") ?: "#2463EB", thresholdPercent = j.int("threshold_percent") ?: 75,
    strictNoSkip = j.bool("strict_no_skip"), term = j.str("term") ?: "full",
    archived = j.bool("archived"), deleted = j.isDeleted(),
)

// Timetable slots

internal fun SlotEntity.toJson(userId: String) = buildJsonObject {
    put("id", id); put("user_id", userId); put("course_id", courseId)
    put("day_of_week", dayOfWeek); put("start_time", secToIso(startSec)); put("end_time", secToIso(endSec))
    put("room", room); put("kind", kind)
    put("valid_from", dayToIso(validFromDay)); put("valid_to", dayToIso(validToDay))
    put("deleted_at", deletedAt(deleted))
}

internal fun slotFrom(j: JsonObject) = SlotEntity(
    id = j.req("id"), courseId = j.req("course_id"), dayOfWeek = j.int("day_of_week") ?: 1,
    startSec = isoToSec(j.req("start_time"))!!, endSec = isoToSec(j.req("end_time"))!!,
    room = j.str("room"), kind = j.str("kind") ?: "lecture",
    validFromDay = isoToDay(j.str("valid_from")), validToDay = isoToDay(j.str("valid_to")),
    deleted = j.isDeleted(),
)

// Extra classes

internal fun ExtraClassEntity.toJson(userId: String) = buildJsonObject {
    put("id", id); put("user_id", userId); put("course_id", courseId)
    put("date", dayToIso(day)); put("start_time", secToIso(startSec)); put("end_time", secToIso(endSec))
    put("room", room); put("kind", kind); put("deleted_at", deletedAt(deleted))
}

internal fun extraFrom(j: JsonObject) = ExtraClassEntity(
    id = j.req("id"), courseId = j.req("course_id"), day = isoToDay(j.req("date"))!!,
    startSec = isoToSec(j.req("start_time"))!!, endSec = isoToSec(j.req("end_time"))!!,
    room = j.str("room"), kind = j.str("kind") ?: "lecture", deleted = j.isDeleted(),
)

// Marks

internal fun MarkEntity.toJson(userId: String) = buildJsonObject {
    put("user_id", userId); put("course_id", courseId); put("date", dayToIso(day))
    put("start_time", secToIso(startSec)); put("end_time", secToIso(endSec))
    put("status", status); put("plan_id", planId); put("deleted_at", deletedAt(deleted))
}

internal fun markFrom(j: JsonObject) = MarkEntity(
    courseId = j.req("course_id"), day = isoToDay(j.req("date"))!!, startSec = isoToSec(j.req("start_time"))!!,
    endSec = isoToSec(j.str("end_time")), status = j.req("status"), planId = j.str("plan_id"),
    deleted = j.isDeleted(),
)

// Profile and settings

internal fun ProfileEntity.toJson() = buildJsonObject {
    put("id", id); put("full_name", fullName); put("is_first_year_ug", isFirstYearUg); put("humor_level", humorLevel); put("avatar", avatar)
}

internal fun profileFrom(j: JsonObject) = ProfileEntity(
    id = j.req("id"), fullName = j.str("full_name"), isFirstYearUg = j.bool("is_first_year_ug"),
    humorLevel = j.str("humor_level") ?: "roast", avatar = j.str("avatar"),
)

internal fun NotificationSettingsEntity.toJson() = buildJsonObject {
    put("user_id", userId); put("muted", muted); put("class_reminders", classReminders)
    put("lead_time_minutes", leadTimeMinutes); put("mark_prompts", markPrompts)
    put("daily_digest", dailyDigest); put("digest_time", secToIso(digestSec))
    put("planned_skip_reminders", plannedSkipReminders)
    put("quiet_start", secToIso(quietStartSec)); put("quiet_end", secToIso(quietEndSec))
}

internal fun settingsFrom(j: JsonObject) = NotificationSettingsEntity(
    userId = j.req("user_id"), muted = j.bool("muted"), classReminders = j.bool("class_reminders", true),
    leadTimeMinutes = j.int("lead_time_minutes") ?: 10, markPrompts = j.bool("mark_prompts", true),
    dailyDigest = j.bool("daily_digest", true), digestSec = isoToSec(j.str("digest_time")) ?: 21 * 3600,
    plannedSkipReminders = j.bool("planned_skip_reminders", true),
    quietStartSec = isoToSec(j.str("quiet_start")), quietEndSec = isoToSec(j.str("quiet_end")),
)

// Institute calendar

internal fun calendarFrom(j: JsonObject) = CalendarEntity(
    day = isoToDay(j.req("date"))!!, audience = j.str("audience") ?: "all", dayType = j.req("day_type"),
    description = j.str("description"), followsDayOfWeek = j.int("follows_day_of_week"),
)
