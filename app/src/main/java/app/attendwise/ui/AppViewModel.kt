package app.attendwise.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.attendwise.data.AppData
import app.attendwise.data.Derived
import app.attendwise.data.Update
import app.attendwise.data.UpdateChecker
import app.attendwise.data.db.CourseEntity
import app.attendwise.data.db.NotificationSettingsEntity
import app.attendwise.data.db.SemesterEntity
import app.attendwise.data.db.SlotEntity
import app.attendwise.data.remote.SignUpResult
import app.attendwise.domain.model.ClassKey
import app.attendwise.domain.model.ExtraClass
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.planner.ApplyResult
import app.attendwise.domain.planner.Planner
import app.attendwise.domain.time.Now
import app.attendwise.graph
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDateTime
import java.time.LocalTime
import java.util.UUID

/** A message for the snackbar, optionally with an action. */
data class UiMessage(val text: String, val actionLabel: String? = null, val action: (() -> Unit)? = null)

enum class Boot { SIGNED_OUT, LOADING, OFFLINE_FIRST_RUN, READY }

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val graph = app.graph
    val api = graph.api
    val prefs = graph.prefs
    val syncState = graph.sync.state

    private val ticker = flow {
        while (true) {
            emit(Now.of(LocalDateTime.now()))
            delay(30_000)
        }
    }

    /** Everything the screens show, recomputed on data changes and every 30 seconds. */
    val derived: StateFlow<Derived?> = combine(graph.repo.data, ticker) { data, now -> Derived(data, now) }
        .flowOn(Dispatchers.Default)
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private val _boot = MutableStateFlow(if (api.userId == null) Boot.SIGNED_OUT else Boot.LOADING)
    val boot: StateFlow<Boot> = _boot

    private val _onboarded = MutableStateFlow(prefs.onboarded)
    val onboarded: StateFlow<Boolean> = _onboarded

    private val _theme = MutableStateFlow(prefs.theme)
    val theme: StateFlow<String> = _theme

    private val _messages = MutableSharedFlow<UiMessage>(extraBufferCapacity = 4)
    val messages: SharedFlow<UiMessage> = _messages

    private val _authBusy = MutableStateFlow(false)
    val authBusy: StateFlow<Boolean> = _authBusy

    // Self-update ---------------------------------------------------------------

    sealed interface UpdateState {
        data object Idle : UpdateState
        data object Checking : UpdateState
        data class Available(val update: Update) : UpdateState
        data class Downloading(val update: Update, val progress: Float) : UpdateState
        data class Ready(val update: Update, val apk: java.io.File) : UpdateState
    }

    private val _update = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val update: StateFlow<UpdateState> = _update

    val currentBuild: Long = runCatching {
        val info = app.packageManager.getPackageInfo(app.packageName, 0)
        if (android.os.Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    }.getOrDefault(0L)

    /** Looks for a newer build. Quiet on launch; says the result when the user asked. */
    fun checkForUpdate(userAsked: Boolean) = viewModelScope.launch {
        val s = _update.value
        if (s is UpdateState.Checking || s is UpdateState.Downloading) return@launch
        if (!userAsked && s !is UpdateState.Idle) return@launch
        _update.value = UpdateState.Checking
        val found = runCatching { UpdateChecker.check(getApplication(), currentBuild) }
        _update.value = found.getOrNull()?.let { UpdateState.Available(it) } ?: UpdateState.Idle
        if (userAsked) when {
            found.isFailure -> say("Couldn't check for updates. Check your connection.")
            found.getOrNull() == null -> say("You're on the latest version.")
        }
    }

    /** Downloads the update in the app, then opens the system install prompt. */
    fun installUpdate() = viewModelScope.launch {
        val ctx = getApplication<Application>()
        val s = _update.value
        if (UpdateChecker.needsInstallPermission(ctx)) {
            say("Allow AttendWise to install updates, then tap Update again.")
            UpdateChecker.openInstallPermission(ctx)
            return@launch
        }
        when (s) {
            is UpdateState.Ready -> if (s.apk.exists()) UpdateChecker.install(ctx, s.apk) else _update.value = UpdateState.Available(s.update)
            is UpdateState.Available -> {
                _update.value = UpdateState.Downloading(s.update, 0f)
                runCatching {
                    UpdateChecker.download(ctx, s.update) { p -> _update.value = UpdateState.Downloading(s.update, p) }
                }.onSuccess { apk ->
                    _update.value = UpdateState.Ready(s.update, apk)
                    UpdateChecker.install(ctx, apk)
                }.onFailure {
                    _update.value = UpdateState.Available(s.update)
                    say("Download failed. Check your connection and try again.")
                }
            }
            else -> Unit
        }
    }

    init {
        checkForUpdate(userAsked = false)
        if (api.userId != null) bootstrap()
        // A session that expires for good (refresh rejected) sends the user back to sign-in.
        viewModelScope.launch {
            api.session.collect { if (it == null) _boot.value = Boot.SIGNED_OUT }
        }
    }

    fun say(text: String, actionLabel: String? = null, action: (() -> Unit)? = null) {
        _messages.tryEmit(UiMessage(text, actionLabel, action))
    }

    // Auth ---------------------------------------------------------------------

    fun signIn(email: String, password: String) = auth { api.signInWithPassword(email, password); bootstrap() }

    fun signUp(email: String, password: String, name: String) = auth {
        when (api.signUp(email, password, name)) {
            is SignUpResult.SignedIn -> bootstrap()
            SignUpResult.ConfirmEmail -> say("Check your inbox to confirm your email, then sign in.")
        }
    }

    fun resetPassword(email: String) = auth {
        api.sendPasswordReset(email)
        say("If that email has an account, a reset link is on its way.")
    }

    fun googleUrl(): Uri = api.googleSignInUrl()

    fun completeOAuth(uri: Uri) = auth { api.completeOAuth(uri); bootstrap() }

    private fun auth(block: suspend () -> Unit) {
        if (_authBusy.value) return
        viewModelScope.launch {
            _authBusy.value = true
            try {
                block()
            } catch (e: Exception) {
                say(e.message ?: "Something went wrong")
            } finally {
                _authBusy.value = false
            }
        }
    }

    /** After sign-in: switch accounts cleanly, pull the user's data, create defaults. */
    fun bootstrap() {
        val session = api.session.value ?: return
        viewModelScope.launch {
            if (prefs.lastUserId != session.user.id) {
                graph.sync.reset()
                prefs.lastUserId = session.user.id
                prefs.onboarded = false
                _onboarded.value = false
            }
            val firstRun = !graph.sync.hasPulledOnce
            if (firstRun) _boot.value = Boot.LOADING
            val result = graph.sync.sync()
            graph.repo.ensureDefaults(session.user.displayName)
            if (result.isFailure && firstRun) {
                _boot.value = Boot.OFFLINE_FIRST_RUN
                return@launch
            }
            val data = graph.repo.snapshot()
            if (!prefs.onboarded && data.semesterEntity != null && data.courses.isNotEmpty()) finishOnboarding()
            _boot.value = Boot.READY
            graph.afterDataChanged()
        }
    }

    fun continueOffline() {
        _boot.value = Boot.READY
    }

    fun signOut() = viewModelScope.launch {
        api.signOut()
        graph.sync.reset()
        prefs.lastUserId = null
        prefs.onboarded = false
        _onboarded.value = false
        _boot.value = Boot.SIGNED_OUT
        graph.afterDataChanged()
    }

    fun syncNow() = viewModelScope.launch {
        val r = graph.sync.sync()
        if (r.isSuccess) graph.afterDataChanged() else say(graph.sync.state.value.lastError ?: "Sync failed")
    }

    fun finishOnboarding() {
        prefs.onboarded = true
        _onboarded.value = true
    }

    fun setTheme(value: String) {
        prefs.theme = value
        _theme.value = value
    }

    // Marks ------------------------------------------------------------------------

    fun mark(key: ClassKey, end: LocalTime, status: MarkStatus?) = viewModelScope.launch {
        graph.repo.mark(key, end, status)
    }

    fun markAll(items: List<Pair<ClassKey, LocalTime>>, status: MarkStatus) = viewModelScope.launch {
        graph.repo.markAll(items.map { Triple(it.first, it.second, status) })
        say("Marked ${items.size} as ${status.name.lowercase().replace('_', ' ')}")
    }

    fun applyPlan(selection: Set<ClassKey>, allowOverBudget: Boolean = false) = viewModelScope.launch {
        val d = derived.value ?: return@launch
        val planId = UUID.randomUUID().toString()
        when (val r = Planner.apply(d.data.courses, d.schedule, selection, planId, d.now, allowOverBudget)) {
            is ApplyResult.Applied -> {
                graph.repo.applyPlan(r.marks)
                say("Planned ${r.marks.size} skip${if (r.marks.size == 1) "" else "s"}", "Undo") { undoPlan(planId) }
            }
            is ApplyResult.Rejected -> say(
                if (r.unplannable.isNotEmpty()) "Some of those classes can't be planned any more." else "That plan goes over budget for ${r.violations.joinToString { d.data.code(it) }}.",
            )
        }
    }

    fun undoPlan(planId: String) = viewModelScope.launch {
        val d = derived.value ?: return@launch
        val keys = Planner.undo(d.data.marks, planId, Now.of(LocalDateTime.now()))
        graph.repo.clearMarks(keys)
        say("Removed ${keys.size} planned skip${if (keys.size == 1) "" else "s"}")
    }

    // Profile, settings, semester, courses ------------------------------------------------

    fun saveProfile(name: String?, firstYear: Boolean, humor: String) = viewModelScope.launch {
        graph.repo.saveProfile(name, firstYear, humor)
    }

    fun saveAvatar(id: String?) = viewModelScope.launch { graph.repo.saveAvatar(id) }

    fun saveSettings(update: (NotificationSettingsEntity) -> NotificationSettingsEntity) = viewModelScope.launch {
        graph.repo.saveSettings(update)
    }

    fun saveSemester(entity: SemesterEntity, after: () -> Unit = {}) = viewModelScope.launch {
        graph.repo.saveSemester(entity)
        after()
    }

    fun saveCourse(course: CourseEntity, save: List<SlotEntity>, delete: List<String>, after: () -> Unit = {}) = viewModelScope.launch {
        graph.repo.saveCourse(course, save, delete)
        after()
    }

    fun setArchived(courseId: String, archived: Boolean) = viewModelScope.launch {
        graph.repo.setArchived(courseId, archived)
        say(if (archived) "Course archived" else "Course restored")
    }

    fun deleteCourse(courseId: String, after: () -> Unit) = viewModelScope.launch {
        graph.repo.deleteCourse(courseId)
        after()
        say("Course deleted")
    }

    fun addExtraClass(extra: ExtraClass) = viewModelScope.launch {
        graph.repo.addExtraClass(extra)
        say("Extra class added")
    }

    suspend fun slotsFor(courseId: String): List<SlotEntity> = graph.repo.slotsFor(courseId)
    suspend fun course(courseId: String): CourseEntity? = graph.repo.course(courseId)

    val data: AppData get() = derived.value?.data ?: AppData.EMPTY
}
