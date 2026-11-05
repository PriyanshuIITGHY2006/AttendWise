package app.attendwise.data.db

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface AppDao {
    // Live queries for the UI and widgets -----------------------------------

    @Query("SELECT * FROM semesters WHERE deleted = 0")
    fun semesters(): Flow<List<SemesterEntity>>

    @Query("SELECT * FROM courses WHERE deleted = 0")
    fun courses(): Flow<List<CourseEntity>>

    @Query("SELECT * FROM slots WHERE deleted = 0")
    fun slots(): Flow<List<SlotEntity>>

    @Query("SELECT * FROM extra_classes WHERE deleted = 0")
    fun extras(): Flow<List<ExtraClassEntity>>

    @Query("SELECT * FROM marks WHERE deleted = 0")
    fun marks(): Flow<List<MarkEntity>>

    @Query("SELECT * FROM calendar")
    fun calendar(): Flow<List<CalendarEntity>>

    @Query("SELECT * FROM profile LIMIT 1")
    fun profile(): Flow<ProfileEntity?>

    @Query("SELECT * FROM notification_settings LIMIT 1")
    fun notificationSettings(): Flow<NotificationSettingsEntity?>

    // One-shot reads (sync, widgets, receivers) ------------------------------

    @Query("SELECT * FROM semesters WHERE deleted = 0") suspend fun semestersNow(): List<SemesterEntity>
    @Query("SELECT * FROM courses WHERE deleted = 0") suspend fun coursesNow(): List<CourseEntity>
    @Query("SELECT * FROM slots WHERE deleted = 0") suspend fun slotsNow(): List<SlotEntity>
    @Query("SELECT * FROM extra_classes WHERE deleted = 0") suspend fun extrasNow(): List<ExtraClassEntity>
    @Query("SELECT * FROM marks WHERE deleted = 0") suspend fun marksNow(): List<MarkEntity>
    @Query("SELECT * FROM calendar") suspend fun calendarNow(): List<CalendarEntity>
    @Query("SELECT * FROM profile LIMIT 1") suspend fun profileNow(): ProfileEntity?
    @Query("SELECT * FROM notification_settings LIMIT 1") suspend fun notificationSettingsNow(): NotificationSettingsEntity?

    @Query("SELECT * FROM semesters WHERE id = :id") suspend fun semester(id: String): SemesterEntity?
    @Query("SELECT * FROM courses WHERE id = :id") suspend fun course(id: String): CourseEntity?
    @Query("SELECT * FROM slots WHERE id = :id") suspend fun slot(id: String): SlotEntity?
    @Query("SELECT * FROM extra_classes WHERE id = :id") suspend fun extra(id: String): ExtraClassEntity?
    @Query("SELECT * FROM marks WHERE courseId = :courseId AND day = :day AND startSec = :startSec")
    suspend fun mark(courseId: String, day: Long, startSec: Int): MarkEntity?
    @Query("SELECT * FROM slots WHERE courseId = :courseId AND deleted = 0") suspend fun slotsFor(courseId: String): List<SlotEntity>
    @Query("SELECT * FROM marks WHERE planId = :planId AND deleted = 0") suspend fun marksForPlan(planId: String): List<MarkEntity>

    // Dirty rows for push ----------------------------------------------------

    @Query("SELECT * FROM semesters WHERE dirty = 1") suspend fun dirtySemesters(): List<SemesterEntity>
    @Query("SELECT * FROM courses WHERE dirty = 1") suspend fun dirtyCourses(): List<CourseEntity>
    @Query("SELECT * FROM slots WHERE dirty = 1") suspend fun dirtySlots(): List<SlotEntity>
    @Query("SELECT * FROM extra_classes WHERE dirty = 1") suspend fun dirtyExtras(): List<ExtraClassEntity>
    @Query("SELECT * FROM marks WHERE dirty = 1") suspend fun dirtyMarks(): List<MarkEntity>
    @Query("SELECT * FROM profile WHERE dirty = 1") suspend fun dirtyProfile(): List<ProfileEntity>
    @Query("SELECT * FROM notification_settings WHERE dirty = 1") suspend fun dirtySettings(): List<NotificationSettingsEntity>

    @Query("UPDATE semesters SET dirty = 0 WHERE id = :id AND version = :version") suspend fun cleanSemester(id: String, version: Long)
    @Query("UPDATE courses SET dirty = 0 WHERE id = :id AND version = :version") suspend fun cleanCourse(id: String, version: Long)
    @Query("UPDATE slots SET dirty = 0 WHERE id = :id AND version = :version") suspend fun cleanSlot(id: String, version: Long)
    @Query("UPDATE extra_classes SET dirty = 0 WHERE id = :id AND version = :version") suspend fun cleanExtra(id: String, version: Long)
    @Query("UPDATE marks SET dirty = 0 WHERE courseId = :courseId AND day = :day AND startSec = :startSec AND version = :version")
    suspend fun cleanMark(courseId: String, day: Long, startSec: Int, version: Long)
    @Query("UPDATE profile SET dirty = 0 WHERE id = :id AND version = :version") suspend fun cleanProfile(id: String, version: Long)
    @Query("UPDATE notification_settings SET dirty = 0 WHERE userId = :id AND version = :version") suspend fun cleanSettings(id: String, version: Long)

    @Query("SELECT COUNT(*) FROM semesters WHERE dirty = 1") fun pendingSemesters(): Flow<Int>

    // Writes -----------------------------------------------------------------

    @Upsert suspend fun upsertSemesters(rows: List<SemesterEntity>)
    @Upsert suspend fun upsertCourses(rows: List<CourseEntity>)
    @Upsert suspend fun upsertSlots(rows: List<SlotEntity>)
    @Upsert suspend fun upsertExtras(rows: List<ExtraClassEntity>)
    @Upsert suspend fun upsertMarks(rows: List<MarkEntity>)
    @Upsert suspend fun upsertCalendar(rows: List<CalendarEntity>)
    @Upsert suspend fun upsertProfile(row: ProfileEntity)
    @Upsert suspend fun upsertSettings(row: NotificationSettingsEntity)

    @Query("DELETE FROM calendar") suspend fun clearCalendar()
    @Query("DELETE FROM semesters") suspend fun clearSemesters()
    @Query("DELETE FROM courses") suspend fun clearCourses()
    @Query("DELETE FROM slots") suspend fun clearSlots()
    @Query("DELETE FROM extra_classes") suspend fun clearExtras()
    @Query("DELETE FROM marks") suspend fun clearMarks()
    @Query("DELETE FROM profile") suspend fun clearProfile()
    @Query("DELETE FROM notification_settings") suspend fun clearSettings()
}

@Database(
    entities = [
        SemesterEntity::class,
        CourseEntity::class,
        SlotEntity::class,
        ExtraClassEntity::class,
        MarkEntity::class,
        CalendarEntity::class,
        ProfileEntity::class,
        NotificationSettingsEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun dao(): AppDao

    companion object {
        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "attendwise.db").build()
    }
}
