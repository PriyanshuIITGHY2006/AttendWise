package app.attendwise.data

import android.content.Context
import androidx.room.withTransaction
import app.attendwise.data.db.AppDatabase
import app.attendwise.data.db.CalendarEntity
import app.attendwise.data.db.CourseEntity
import app.attendwise.data.db.ExtraClassEntity
import app.attendwise.data.db.MarkEntity
import app.attendwise.data.db.NotificationSettingsEntity
import app.attendwise.data.db.ProfileEntity
import app.attendwise.data.db.SemesterEntity
import app.attendwise.data.db.SlotEntity
import app.attendwise.data.remote.SupabaseClient
import app.attendwise.domain.calendar.DayResolver
import app.attendwise.domain.model.ClassKey
import app.attendwise.domain.model.Course
import app.attendwise.domain.model.ExtraClass
import app.attendwise.domain.model.InstituteDay
import app.attendwise.domain.model.Mark
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.model.Semester
import app.attendwise.domain.model.TimetableSlot
import app.attendwise.domain.schedule.Schedule
import app.attendwise.domain.schedule.buildSchedule
import app.attendwise.domain.time.Now
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import java.time.LocalTime
import java.util.UUID

/** Everything the UI, widgets and notifications need, for the active semester. */
data class AppData(
    val semesterEntity: SemesterEntity?,
    val courses: List<Course>,
    val courseInfo: Map<String, CourseEntity>,
    val slots: List<TimetableSlot>,
    val slotEntities: List<SlotEntity>,
    val extras: List<ExtraClass>,
    val marks: List<Mark>,
    val calendar: List<InstituteDay>,
    val profile: ProfileEntity?,
    val settings: NotificationSettingsEntity?,
) {
    val semester: Semester? get() = semesterEntity?.toDomain()
    val isFirstYearUg: Boolean get() = profile?.isFirstYearUg ?: false
    val humor: String get() = profile?.humorLevel ?: "roast"
    val activeCourses: List<Course> get() = courses.filterNot { it.archived }

    fun dayResolver(): DayResolver = DayResolver(calendar, isFirstYearUg)

    fun schedule(now: Now): Schedule {
        val sem = semester ?: return Schedule(emptyList(), emptyList())
        return buildSchedule(sem, courses, slots, dayResolver(), marks, now, extras)
    }

    fun color(courseId: String): String = courseInfo[courseId]?.color ?: "#2463EB"
    fun code(courseId: String): String = courseInfo[courseId]?.code ?: "?"

    companion object {
        val EMPTY = AppData(null, emptyList(), emptyMap(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), null, null)
    }
}

private data class Core(
    val semesters: List<SemesterEntity>,
    val courses: List<CourseEntity>,
    val slots: List<SlotEntity>,
    val extras: List<ExtraClassEntity>,
    val marks: List<MarkEntity>,
)

private data class Rest(
    val calendar: List<CalendarEntity>,
    val profile: ProfileEntity?,
    val settings: NotificationSettingsEntity?,
)

/**
 * The single place that reads and writes app data. Every write marks rows
 * dirty with a new version and then calls [onWrite], which queues a sync and
 * refreshes widgets and alarms.
 */
class AppRepository(
    private val context: Context,
    private val db: AppDatabase,
    private val api: SupabaseClient,
    private val onWrite: suspend () -> Unit,
) {
    private val dao = db.dao()

    val data: Flow<AppData> = combine(
        combine(dao.semesters(), dao.courses(), dao.slots(), dao.extras(), dao.marks()) { a, b, c, d, e -> Core(a, b, c, d, e) },
        combine(dao.calendar(), dao.profile(), dao.notificationSettings()) { a, b, c -> Rest(a, b, c) },
    ) { core, rest -> assemble(core, rest) }

    suspend fun snapshot(): AppData = assemble(
        Core(dao.semestersNow(), dao.coursesNow(), dao.slotsNow(), dao.extrasNow(), dao.marksNow()),
        Rest(dao.calendarNow(), dao.profileNow(), dao.notificationSettingsNow()),
    )

    private fun assemble(core: Core, rest: Rest): AppData {
        val semester = core.semesters.filter { it.isActive }.maxByOrNull { it.startDay }
        val courses = core.courses.filter { it.semesterId == semester?.id }
        val ids = courses.map { it.id }.toSet()
        val slots = core.slots.filter { it.courseId in ids }
        return AppData(
            semesterEntity = semester,
            courses = courses.map { it.toDomain() }.sortedBy { it.code },
            courseInfo = courses.associateBy { it.id },
            slots = slots.map { it.toDomain() },
            slotEntities = slots,
            extras = core.extras.filter { it.courseId in ids }.map { it.toDomain() },
            marks = core.marks.filter { it.courseId in ids }.mapNotNull { it.toDomain() },
            calendar = rest.calendar.mapNotNull { it.toDomain() },
            profile = rest.profile,
            settings = rest.settings,
        )
    }

    private fun stamp(): Long = System.nanoTime()

    // Marks --------------------------------------------------------------------

    /** Sets (or with null, clears) the mark for one class. */
    suspend fun mark(key: ClassKey, end: LocalTime?, status: MarkStatus?, planId: String? = null) = markAll(listOf(Triple(key, end, status)), planId)

    suspend fun markAll(items: List<Triple<ClassKey, LocalTime?, MarkStatus?>>, planId: String? = null) {
        if (items.isEmpty()) return
        db.withTransaction {
            val rows = items.map { (key, end, status) ->
                val existing = dao.mark(key.courseId, key.date.toEpochDay(), key.start.toSec())
                MarkEntity(
                    courseId = key.courseId, day = key.date.toEpochDay(), startSec = key.start.toSec(),
                    endSec = end?.toSec() ?: existing?.endSec,
                    status = status?.wire() ?: existing?.status ?: MarkStatus.PRESENT.wire(),
                    planId = if (status == null) existing?.planId else planId,
                    deleted = status == null, dirty = true, version = stamp(),
                )
            }
            dao.upsertMarks(rows)
        }
        onWrite()
    }

    suspend fun applyPlan(marks: List<Mark>) {
        markAll(marks.map { Triple(it.key, it.end, it.status) }, marks.firstOrNull()?.planId)
    }

    suspend fun clearMarks(keys: List<ClassKey>) = markAll(keys.map { Triple(it, null, null) })

    // Profile and settings -------------------------------------------------------

    suspend fun saveProfile(fullName: String?, firstYear: Boolean, humor: String) {
        val id = api.userId ?: return
        dao.upsertProfile(ProfileEntity(id, fullName?.trim()?.ifBlank { null }, firstYear, humor, dirty = true, version = stamp()))
        onWrite()
    }

    suspend fun saveSettings(update: (NotificationSettingsEntity) -> NotificationSettingsEntity) {
        val id = api.userId ?: return
        val current = dao.notificationSettingsNow() ?: NotificationSettingsEntity(userId = id)
        dao.upsertSettings(update(current).copy(userId = id, dirty = true, version = stamp()))
        onWrite()
    }

    /** Creates default profile and settings rows after the first pull, if the account has none. */
    suspend fun ensureDefaults(displayName: String?) {
        val id = api.userId ?: return
        if (dao.profileNow() == null) dao.upsertProfile(ProfileEntity(id, displayName, false, "roast", dirty = true, version = stamp()))
        if (dao.notificationSettingsNow() == null) dao.upsertSettings(NotificationSettingsEntity(userId = id, dirty = true, version = stamp()))
    }

    // Semesters ------------------------------------------------------------------

    suspend fun saveSemester(entity: SemesterEntity): String {
        db.withTransaction {
            if (entity.isActive) {
                dao.semestersNow().filter { it.isActive && it.id != entity.id }
                    .forEach { dao.upsertSemesters(listOf(it.copy(isActive = false, dirty = true, version = stamp()))) }
            }
            dao.upsertSemesters(listOf(entity.copy(dirty = true, version = stamp())))
        }
        onWrite()
        return entity.id
    }

    // Courses and timetable ----------------------------------------------------------

    /**
     * Saves a course and its timetable. [slotsToSave] are complete rows (new or
     * changed); [slotIdsToDelete] are removed. History-preserving edits are
     * worked out by the caller with TimetableEdits.
     */
    suspend fun saveCourse(course: CourseEntity, slotsToSave: List<SlotEntity>, slotIdsToDelete: List<String>) {
        db.withTransaction {
            dao.upsertCourses(listOf(course.copy(dirty = true, version = stamp())))
            if (slotsToSave.isNotEmpty()) dao.upsertSlots(slotsToSave.map { it.copy(courseId = course.id, dirty = true, version = stamp()) })
            slotIdsToDelete.forEach { id ->
                dao.slot(id)?.let { dao.upsertSlots(listOf(it.copy(deleted = true, dirty = true, version = stamp()))) }
            }
        }
        onWrite()
    }

    suspend fun setArchived(courseId: String, archived: Boolean) {
        dao.course(courseId)?.let { dao.upsertCourses(listOf(it.copy(archived = archived, dirty = true, version = stamp()))) }
        onWrite()
    }

    suspend fun deleteCourse(courseId: String) {
        db.withTransaction {
            dao.course(courseId)?.let { dao.upsertCourses(listOf(it.copy(deleted = true, dirty = true, version = stamp()))) }
            dao.slotsFor(courseId).forEach { dao.upsertSlots(listOf(it.copy(deleted = true, dirty = true, version = stamp()))) }
        }
        onWrite()
    }

    suspend fun addExtraClass(extra: ExtraClass) {
        dao.upsertExtras(
            listOf(
                ExtraClassEntity(
                    id = newId(), courseId = extra.courseId, day = extra.date.toEpochDay(),
                    startSec = extra.start.toSec(), endSec = extra.end.toSec(), room = extra.room,
                    kind = extra.kind.wire(), dirty = true, version = stamp(),
                ),
            ),
        )
        onWrite()
    }

    suspend fun slotsFor(courseId: String): List<SlotEntity> = dao.slotsFor(courseId)
    suspend fun course(courseId: String): CourseEntity? = dao.course(courseId)

    companion object {
        fun newId(): String = UUID.randomUUID().toString()
    }
}
