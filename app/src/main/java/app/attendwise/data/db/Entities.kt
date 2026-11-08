package app.attendwise.data.db

import androidx.room.Entity
import androidx.room.Index

/*
 * Local mirror of the v2 tables. Dates are stored as epoch days and times as
 * seconds of the day, so keys compare exactly. Every syncable row carries:
 *  - dirty: changed locally and not yet pushed
 *  - version: bumped on every local write, so a push only clears `dirty` if the
 *    row did not change again while the push was in flight
 *  - deleted: soft delete, pushed as deleted_at
 */

@Entity(tableName = "semesters", primaryKeys = ["id"])
data class SemesterEntity(
    val id: String,
    val name: String,
    val startDay: Long,
    val endDay: Long,
    val midStartDay: Long?,
    val midEndDay: Long?,
    val isActive: Boolean,
    val deleted: Boolean = false,
    val dirty: Boolean = false,
    val version: Long = 0,
)

@Entity(tableName = "courses", primaryKeys = ["id"], indices = [Index("semesterId")])
data class CourseEntity(
    val id: String,
    val semesterId: String,
    val code: String,
    val name: String,
    val color: String,
    val thresholdPercent: Int,
    val strictNoSkip: Boolean,
    val term: String,
    val archived: Boolean,
    val deleted: Boolean = false,
    val dirty: Boolean = false,
    val version: Long = 0,
)

@Entity(tableName = "slots", primaryKeys = ["id"], indices = [Index("courseId")])
data class SlotEntity(
    val id: String,
    val courseId: String,
    /** ISO day of week, 1 = Monday. */
    val dayOfWeek: Int,
    val startSec: Int,
    val endSec: Int,
    val room: String?,
    val kind: String,
    val validFromDay: Long?,
    val validToDay: Long?,
    val deleted: Boolean = false,
    val dirty: Boolean = false,
    val version: Long = 0,
)

@Entity(tableName = "extra_classes", primaryKeys = ["id"], indices = [Index("courseId")])
data class ExtraClassEntity(
    val id: String,
    val courseId: String,
    val day: Long,
    val startSec: Int,
    val endSec: Int,
    val room: String?,
    val kind: String,
    val deleted: Boolean = false,
    val dirty: Boolean = false,
    val version: Long = 0,
)

@Entity(tableName = "marks", primaryKeys = ["courseId", "day", "startSec"])
data class MarkEntity(
    val courseId: String,
    val day: Long,
    val startSec: Int,
    val endSec: Int?,
    val status: String,
    val planId: String?,
    val deleted: Boolean = false,
    val dirty: Boolean = false,
    val version: Long = 0,
)

@Entity(tableName = "calendar", primaryKeys = ["day", "audience", "dayType"])
data class CalendarEntity(
    val day: Long,
    val audience: String,
    val dayType: String,
    val description: String?,
    /** ISO day of week, 1 = Monday. */
    val followsDayOfWeek: Int?,
)

@Entity(tableName = "profile", primaryKeys = ["id"])
data class ProfileEntity(
    val id: String,
    val fullName: String?,
    val isFirstYearUg: Boolean,
    val humorLevel: String,
    /** The chosen profile picture, an id from the avatar list. */
    val avatar: String? = null,
    val dirty: Boolean = false,
    val version: Long = 0,
)

@Entity(tableName = "notification_settings", primaryKeys = ["userId"])
data class NotificationSettingsEntity(
    val userId: String,
    val muted: Boolean = false,
    val classReminders: Boolean = true,
    val leadTimeMinutes: Int = 10,
    val markPrompts: Boolean = true,
    val dailyDigest: Boolean = true,
    val digestSec: Int = 21 * 3600,
    val plannedSkipReminders: Boolean = true,
    val quietStartSec: Int? = null,
    val quietEndSec: Int? = null,
    val dirty: Boolean = false,
    val version: Long = 0,
)
