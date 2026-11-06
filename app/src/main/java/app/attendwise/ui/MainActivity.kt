package app.attendwise.ui

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.attendwise.R
import app.attendwise.graph
import app.attendwise.ui.screens.AuthScreen
import app.attendwise.ui.screens.CalendarScreen
import app.attendwise.ui.screens.CourseDetailScreen
import app.attendwise.ui.screens.CourseEditor
import app.attendwise.ui.screens.CoursesScreen
import app.attendwise.ui.screens.LoadingScreen
import app.attendwise.ui.screens.OnboardingScreen
import app.attendwise.ui.screens.PlanScreen
import app.attendwise.ui.screens.ProfileScreen
import app.attendwise.ui.screens.SemesterForm
import app.attendwise.ui.screens.StepTitle
import app.attendwise.ui.screens.TodayScreen
import androidx.compose.foundation.background
import app.attendwise.ui.theme.AttendWiseTheme
import app.attendwise.ui.theme.LocalDarkTheme
import app.attendwise.ui.theme.backdrop
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Arrangement

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()
    private var pendingRoute by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        handle(intent)
        setContent {
            val theme by vm.theme.collectAsState()
            AttendWiseTheme(themePref = theme) {
                Surface(
                    Modifier.fillMaxSize().background(backdrop(LocalDarkTheme.current)),
                    color = androidx.compose.ui.graphics.Color.Transparent,
                ) {
                    Root(vm, pendingRoute, onRouteConsumed = { pendingRoute = null }, onGoogle = ::openGoogle)
                }
            }
        }
    }

    override fun onStop() {
        super.onStop()
        IconSwitcher.apply(this, vm.derived.value)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        val data: Uri? = intent?.data
        if (data != null && data.scheme == "in.ac.iitg.attendwise") {
            vm.completeOAuth(data)
            return
        }
        intent?.getStringExtra(EXTRA_ROUTE)?.let { pendingRoute = it }
    }

    private fun openGoogle() {
        runCatching { CustomTabsIntent.Builder().build().launchUrl(this, vm.googleUrl()) }
            .onFailure { startActivity(Intent(Intent.ACTION_VIEW, vm.googleUrl())) }
    }

    companion object {
        const val EXTRA_ROUTE = "route"
    }
}

private data class Tab(val route: String, val label: String, val icon: Int)

private val tabs = listOf(
    Tab("today", "Today", R.drawable.ic_today),
    Tab("courses", "Courses", R.drawable.ic_courses),
    Tab("plan", "Plan", R.drawable.ic_plan),
    Tab("calendar", "Calendar", R.drawable.ic_calendar),
    Tab("profile", "Profile", R.drawable.ic_profile),
)

@Composable
private fun Root(vm: AppViewModel, pendingRoute: String?, onRouteConsumed: () -> Unit, onGoogle: () -> Unit) {
    val boot by vm.boot.collectAsState()
    val onboarded by vm.onboarded.collectAsState()
    val derived by vm.derived.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        vm.messages.collect { m ->
            val result = snackbar.showSnackbar(m.text, actionLabel = m.actionLabel, withDismissAction = true, duration = SnackbarDuration.Short)
            if (result == SnackbarResult.ActionPerformed) m.action?.invoke()
        }
    }

    Box(Modifier.fillMaxSize()) {
        when {
            boot == Boot.SIGNED_OUT -> AuthScreen(vm, onGoogle)
            boot == Boot.LOADING -> LoadingScreen("Getting your data…")
            boot == Boot.OFFLINE_FIRST_RUN -> LoadingScreen(
                "Couldn't reach the server. Connect to the internet to load your account.",
                onRetry = { vm.bootstrap() }, onContinue = { vm.continueOffline() },
            )
            derived == null -> LoadingScreen("Loading…")
            !onboarded || derived!!.data.semesterEntity == null -> OnboardingScreen(vm)
            else -> MainScaffold(vm, snackbar, pendingRoute, onRouteConsumed)
        }
        if (boot != Boot.READY || !onboarded) {
            SnackbarHost(snackbar, Modifier.align(androidx.compose.ui.Alignment.BottomCenter).systemBarsPadding())
        }
    }
}

@Composable
private fun MainScaffold(vm: AppViewModel, snackbar: SnackbarHostState, pendingRoute: String?, onRouteConsumed: () -> Unit) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val current = entry?.destination?.route?.substringBefore('?')
    val derived by vm.derived.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 && !vm.prefs.askedNotificationPermission) {
            vm.prefs.askedNotificationPermission = true
            permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        context.graph.afterDataChanged()
    }
    LaunchedEffect(pendingRoute) {
        pendingRoute?.let { route -> navigateTo(nav, route); onRouteConsumed() }
    }

    Scaffold(
        containerColor = androidx.compose.ui.graphics.Color.Transparent,
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            if (tabs.any { it.route == current } || current == null) {
              Column {
                UpdateBar(vm)
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = current == tab.route,
                            onClick = { navigateTo(nav, tab.route) },
                            icon = { Icon(painterResource(tab.icon), contentDescription = null) },
                            label = { Text(tab.label) },
                        )
                    }
                }
              }
            }
        },
    ) { padding ->
        val d = derived ?: return@Scaffold
        NavHost(nav, startDestination = "today") {
            composable("today") { TodayScreen(vm, d, padding, onPlan = { navigateTo(nav, "plan?today=true") }) }
            composable("courses") { CoursesScreen(d, padding, onOpen = { nav.navigate("course/$it") }, onAdd = { nav.navigate("edit/new") }) }
            composable("plan?today={today}", arguments = listOf(navArgument("today") { defaultValue = "false" })) {
                PlanScreen(vm, d, padding, preselectToday = it.arguments?.getString("today") == "true")
            }
            composable("calendar") { CalendarScreen(vm, d, padding) }
            composable("profile") { ProfileScreen(vm, d, padding, onSemester = { nav.navigate("semester") }) }
            composable("course/{id}") { back ->
                val id = back.arguments?.getString("id") ?: return@composable
                CourseDetailScreen(vm, d, id, padding, onBack = { nav.popBackStack() }, onEdit = { nav.navigate("edit/$id") })
            }
            composable("edit/{id}") { back ->
                val id = back.arguments?.getString("id")?.takeIf { it != "new" }
                val semester = d.data.semesterEntity ?: return@composable
                Column(
                    Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    StepTitle(semester.name, if (id == null) "Add a course" else "Edit course")
                    CourseEditor(vm, semester, d.data.courses.size, id, onDone = { nav.popBackStack() }, onCancel = { nav.popBackStack() })
                }
            }
            composable("semester") {
                Column(
                    Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    StepTitle("Profile", "Semester")
                    SemesterForm(existing = d.data.semesterEntity, onSave = { vm.saveSemester(it) { nav.popBackStack() } })
                }
            }
        }
    }
}

private fun navigateTo(nav: NavHostController, route: String) {
    when {
        route.startsWith("course/") -> nav.navigate(route)
        else -> nav.navigate(route) {
            popUpTo("today") { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }
}

/** Shown above the tabs while a newer build is available, downloading or ready to install. */
@Composable
private fun UpdateBar(vm: AppViewModel) {
    val state by vm.update.collectAsState()
    val (text, button, progress) = when (val s = state) {
        is AppViewModel.UpdateState.Available -> Triple("Build ${s.update.build} is available", "Update", null)
        is AppViewModel.UpdateState.Downloading -> Triple("Downloading build ${s.update.build}", null, s.progress)
        is AppViewModel.UpdateState.Ready -> Triple("Build ${s.update.build} is ready", "Install", null)
        else -> return
    }
    androidx.compose.material3.Surface(color = MaterialTheme.colorScheme.secondaryContainer) {
        Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 6.dp, bottom = 6.dp)) {
            androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(
                    text, modifier = Modifier.weight(1f),
                    color = MaterialTheme.colorScheme.onSecondaryContainer, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                )
                if (button != null) {
                    androidx.compose.material3.TextButton(onClick = { vm.installUpdate() }) { Text(button) }
                } else if (progress != null) {
                    Text("${(progress * 100).toInt()}%", color = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.padding(end = 12.dp, top = 12.dp, bottom = 12.dp))
                }
            }
            if (progress != null) {
                androidx.compose.material3.LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp))
            }
        }
    }
}
