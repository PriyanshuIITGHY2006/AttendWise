package app.attendwise.data.sync

import android.content.Context
import androidx.room.withTransaction
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.attendwise.AttendWiseApp
import app.attendwise.data.db.AppDatabase
import app.attendwise.data.remote.ApiException
import app.attendwise.data.remote.SupabaseClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import java.io.IOException
import java.time.Duration
import java.time.OffsetDateTime
import java.util.concurrent.TimeUnit

/** Sync status shown in Profile. */
data class SyncState(val running: Boolean = false, val lastSuccessMillis: Long? = null, val lastError: String? = null)

/**
 * Two-way sync between Room and the v2 tables.
 *
 * Push first (parents before children, so foreign keys hold), then pull every
 * table changed since its cursor. Conflicts: the last write wins; a row with
 * unpushed local changes is never overwritten by a pull. Pull cursors step back
 * two minutes to cover rows committed late with an earlier timestamp; applying
 * the same row twice is harmless.
 */
class SyncEngine(
    private val context: Context,
    private val db: AppDatabase,
    private val api: SupabaseClient,
) {
    private val dao = db.dao()
    private val prefs = context.getSharedPreferences("sync", Context.MODE_PRIVATE)
    private val mutex = Mutex()
    private val _state = MutableStateFlow(SyncState(lastSuccessMillis = prefs.getLong("last_success", 0).takeIf { it > 0 }))
    val state: StateFlow<SyncState> = _state

    /** True once at least one full pull has completed for the signed-in user. */
    val hasPulledOnce: Boolean get() = prefs.getBoolean("pulled_once", false)

    suspend fun sync(): Result<Unit> = mutex.withLock {
        val userId = api.userId ?: return Result.failure(IllegalStateException("Not signed in"))
        _state.value = _state.value.copy(running = true, lastError = null)
        val result = runCatching {
            push(userId)
            pull()
            prefs.edit().putBoolean("pulled_once", true).putLong("last_success", System.currentTimeMillis()).apply()
        }
        _state.value = SyncState(
            running = false,
            lastSuccessMillis = if (result.isSuccess) System.currentTimeMillis() else _state.value.lastSuccessMillis,
            lastError = result.exceptionOrNull()?.let { friendly(it) },
        )
        result
    }

    /** Wipes local data and cursors (sign-out or account switch). */
    suspend fun reset() {
        db.withTransaction {
            dao.clearMarks(); dao.clearExtras(); dao.clearSlots(); dao.clearCourses(); dao.clearSemesters()
            dao.clearProfile(); dao.clearSettings()
        }
        prefs.edit().clear().apply()
        _state.value = SyncState()
    }

    private suspend fun push(userId: String) {
        dao.dirtySemesters().let { rows ->
            api.upsert("semesters", rows.map { it.toJson(userId) }, "id")
            rows.forEach { dao.cleanSemester(it.id, it.version) }
        }
        dao.dirtyCourses().let { rows ->
            api.upsert("courses", rows.map { it.toJson(userId) }, "id")
            rows.forEach { dao.cleanCourse(it.id, it.version) }
        }
        dao.dirtySlots().let { rows ->
            api.upsert("timetable_slots", rows.map { it.toJson(userId) }, "id")
            rows.forEach { dao.cleanSlot(it.id, it.version) }
        }
        dao.dirtyExtras().let { rows ->
            api.upsert("extra_classes", rows.map { it.toJson(userId) }, "id")
            rows.forEach { dao.cleanExtra(it.id, it.version) }
        }
        dao.dirtyMarks().chunked(500).forEach { rows ->
            api.upsert("marks", rows.map { it.toJson(userId) }, "user_id,course_id,date,start_time")
            rows.forEach { dao.cleanMark(it.courseId, it.day, it.startSec, it.version) }
        }
        dao.dirtyProfile().forEach { row ->
            api.upsert("profiles", listOf(row.toJson()), "id")
            dao.cleanProfile(row.id, row.version)
        }
        dao.dirtySettings().forEach { row ->
            api.upsert("notification_settings", listOf(row.toJson()), "user_id")
            dao.cleanSettings(row.userId, row.version)
        }
    }

    private suspend fun pull() {
        pullTable("institute_calendar") { rows ->
            dao.upsertCalendar(rows.map(::calendarFrom))
        }
        pullTable("semesters") { rows ->
            val local = dao.dirtySemesters().map { it.id }.toSet()
            dao.upsertSemesters(rows.map(::semesterFrom).filter { it.id !in local })
        }
        pullTable("courses") { rows ->
            val local = dao.dirtyCourses().map { it.id }.toSet()
            dao.upsertCourses(rows.map(::courseFrom).filter { it.id !in local })
        }
        pullTable("timetable_slots") { rows ->
            val local = dao.dirtySlots().map { it.id }.toSet()
            dao.upsertSlots(rows.map(::slotFrom).filter { it.id !in local })
        }
        pullTable("extra_classes") { rows ->
            val local = dao.dirtyExtras().map { it.id }.toSet()
            dao.upsertExtras(rows.map(::extraFrom).filter { it.id !in local })
        }
        pullTable("marks") { rows ->
            val local = dao.dirtyMarks().map { Triple(it.courseId, it.day, it.startSec) }.toSet()
            dao.upsertMarks(rows.map(::markFrom).filter { Triple(it.courseId, it.day, it.startSec) !in local })
        }
        pullTable("profiles") { rows ->
            if (dao.dirtyProfile().isEmpty()) rows.map(::profileFrom).forEach { dao.upsertProfile(it) }
        }
        pullTable("notification_settings") { rows ->
            if (dao.dirtySettings().isEmpty()) rows.map(::settingsFrom).forEach { dao.upsertSettings(it) }
        }
    }

    private suspend fun pullTable(table: String, apply: suspend (List<JsonObject>) -> Unit) {
        val key = "cursor_$table"
        var cursor = prefs.getString(key, null)
        while (true) {
            val params = buildMap {
                put("select", "*")
                put("order", "updated_at.asc")
                put("limit", PAGE.toString())
                cursor?.let { c ->
                    val from = OffsetDateTime.parse(c).minus(OVERLAP).toString()
                    put("updated_at", "gt.$from")
                }
            }
            val rows = api.select(table, params).map { it.jsonObject }
            if (rows.isEmpty()) break
            db.withTransaction { apply(rows) }
            val newest = rows.mapNotNull { updatedAt(it) }.maxByOrNull { OffsetDateTime.parse(it) } ?: break
            if (cursor != null && !OffsetDateTime.parse(newest).isAfter(OffsetDateTime.parse(cursor))) break
            cursor = newest
            prefs.edit().putString(key, newest).apply()
            if (rows.size < PAGE) break
        }
    }

    private fun friendly(e: Throwable): String = when (e) {
        is ApiException -> e.message ?: "Server error"
        is IOException -> "No connection. Changes are saved on this phone and will sync later."
        else -> e.message ?: "Sync failed"
    }

    companion object {
        private const val PAGE = 1000
        private val OVERLAP: Duration = Duration.ofMinutes(2)
        private const val ONE_OFF = "sync-now"
        private const val PERIODIC = "sync-periodic"

        private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        /** Queue a sync soon (coalesces bursts of edits). */
        fun request(context: Context, delaySeconds: Long = 3) {
            val work = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(online)
                .setInitialDelay(delaySeconds, TimeUnit.SECONDS)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(ONE_OFF, ExistingWorkPolicy.REPLACE, work)
        }

        fun schedulePeriodic(context: Context) {
            val work = PeriodicWorkRequestBuilder<SyncWorker>(6, TimeUnit.HOURS).setConstraints(online).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, work)
        }
    }
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val graph = (applicationContext as AttendWiseApp).graph
        if (graph.api.userId == null) return Result.success()
        return if (graph.sync.sync().isSuccess) {
            graph.afterDataChanged()
            Result.success()
        } else {
            Result.retry()
        }
    }
}
