package app.attendwise

import android.app.Application
import android.content.Context
import app.attendwise.data.AppRepository
import app.attendwise.data.db.AppDatabase
import app.attendwise.data.remote.SupabaseClient
import app.attendwise.data.sync.SyncEngine
import app.attendwise.notify.AlarmScheduler
import app.attendwise.notify.Notifier
import app.attendwise.widget.Widgets
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class AttendWiseApp : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
        Notifier.createChannels(this)
        SyncEngine.schedulePeriodic(this)
        AlarmScheduler.scheduleDailyReplan(this)
        graph.scope.launch { graph.afterDataChanged() }
    }
}

/** Hand-wired dependencies for the whole app. */
class AppGraph(private val context: Context) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val db: AppDatabase = AppDatabase.create(context)
    val api = SupabaseClient(context)
    val sync = SyncEngine(context, db, api)
    val prefs = AppPrefs(context)
    val repo = AppRepository(context, db, api) {
        SyncEngine.request(context)
        scope.launch { afterDataChanged() }
    }

    /** Refreshes everything derived from data: widgets and scheduled notifications. */
    suspend fun afterDataChanged() {
        runCatching { Widgets.updateAll(context) }
        runCatching { AlarmScheduler.replan(context) }
    }
}

/** Small per-device preferences that are not synced. */
class AppPrefs(context: Context) {
    private val prefs = context.getSharedPreferences("app", Context.MODE_PRIVATE)

    /** "system", "light" or "dark". */
    var theme: String
        get() = prefs.getString("theme", "system") ?: "system"
        set(value) = prefs.edit().putString("theme", value).apply()

    var lastUserId: String?
        get() = prefs.getString("last_user", null)
        set(value) = prefs.edit().putString("last_user", value).apply()

    var onboarded: Boolean
        get() = prefs.getBoolean("onboarded", false)
        set(value) = prefs.edit().putBoolean("onboarded", value).apply()

    /** Badges this person has already been congratulated for, or null on the first run on this device. */
    fun seenBadges(userId: String): Set<String>? = prefs.getStringSet("seen_badges_$userId", null)?.toSet()

    fun seenStreak(userId: String): Int = prefs.getInt("seen_streak_$userId", 0)

    fun saveSeen(userId: String, badges: Set<String>, streak: Int) {
        prefs.edit().putStringSet("seen_badges_$userId", badges.toSet()).putInt("seen_streak_$userId", streak).apply()
    }

    var askedNotificationPermission: Boolean
        get() = prefs.getBoolean("asked_notif", false)
        set(value) = prefs.edit().putBoolean("asked_notif", value).apply()
}

val Context.graph: AppGraph get() = (applicationContext as AttendWiseApp).graph
