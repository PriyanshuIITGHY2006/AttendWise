package app.attendwise.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.attendwise.R
import app.attendwise.data.AppData
import app.attendwise.data.Derived
import app.attendwise.domain.attendance.AttendanceStats
import app.attendwise.domain.attendance.CourseStatus
import app.attendwise.domain.calendar.DayInfo
import app.attendwise.domain.model.ClassKey
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.time.Now
import app.attendwise.graph
import app.attendwise.ui.MainActivity
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

object Widgets {
    suspend fun updateAll(context: Context) {
        TodayWidget().updateAll(context)
        NextClassWidget().updateAll(context)
        CourseRingWidget().updateAll(context)
        BunkWidget().updateAll(context)
        DangerWidget().updateAll(context)
    }

    internal suspend fun derived(context: Context): Derived? {
        val graph = context.graph
        if (graph.api.userId == null) return null
        val data = graph.repo.snapshot()
        if (data.semesterEntity == null) return null
        return Derived(data, Now.of(LocalDateTime.now()))
    }
}

// Shared look ----------------------------------------------------------------

private val SafeFg = ColorProvider(Color(0xFF1E6B3F))
private val SafeBg = ColorProvider(Color(0xFFE3F4EA))
private val TightFg = ColorProvider(Color(0xFF7A3E00))
private val TightBg = ColorProvider(Color(0xFFFDEFD9))
private val RiskFg = ColorProvider(Color(0xFFA1231B))
private val RiskBg = ColorProvider(Color(0xFFFBE4E1))
private val PresentBg = ColorProvider(Color(0xFF1E7A46))
private val White = ColorProvider(Color.White)

private fun hex(color: String): Color = runCatching { Color(android.graphics.Color.parseColor(color)) }.getOrDefault(Color(0xFF2463EB))

private fun fg(s: CourseStatus) = when (s) { CourseStatus.SAFE -> SafeFg; CourseStatus.TIGHT -> TightFg; CourseStatus.AT_RISK -> RiskFg }
private fun bg(s: CourseStatus) = when (s) { CourseStatus.SAFE -> SafeBg; CourseStatus.TIGHT -> TightBg; CourseStatus.AT_RISK -> RiskBg }

private fun open(context: Context, route: String) = actionStartActivity(
    Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_ROUTE, route).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
)

@Composable
private fun Card(context: Context, route: String, content: @Composable () -> Unit) {
    GlanceTheme {
        Box(
            modifier = GlanceModifier.fillMaxSize().cornerRadius(24.dp).background(GlanceTheme.colors.widgetBackground)
                .padding(14.dp).clickable(open(context, route)),
        ) { content() }
    }
}

@Composable
private fun Title(text: String) =
    Text(text, style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Bold))

@Composable
private fun Muted(text: String, size: Int = 12) =
    Text(text, style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = size.sp), maxLines = 2)

@Composable
private fun Empty(context: Context, text: String) = Card(context, "today") { Muted(text, 13) }

private fun statusLine(s: AttendanceStats): String = when {
    s.strictNoSkip -> "Never skip"
    s.status == CourseStatus.AT_RISK && s.recoveryClasses != null -> "Attend the next ${s.recoveryClasses}"
    s.status == CourseStatus.AT_RISK -> "At risk"
    s.status == CourseStatus.TIGHT -> "No skips left" + if (s.counts.plannedSkips > 0) ", ${s.counts.plannedSkips} planned" else ""
    else -> "${s.safeSkipsLeft} safe skips"
}

// Today -------------------------------------------------------------------------

class TodayWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val d = Widgets.derived(context)
        provideContent {
            if (d == null) Empty(context, "Open AttendWise to set up your semester.") else TodayContent(context, d)
        }
    }
}

@Composable
private fun TodayContent(context: Context, d: Derived) {
    Card(context, "today") {
        Column(modifier = GlanceModifier.fillMaxWidth()) {
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Title("Today")
                Spacer(GlanceModifier.width(8.dp))
                val info = d.todayInfo
                if (info is DayInfo.Swapped) Muted("${info.follows.name.lowercase().replaceFirstChar { it.uppercase() }} timetable")
            }
            Spacer(GlanceModifier.height(6.dp))
            val rows = d.todayRemaining.take(3)
            if (rows.isEmpty()) {
                Muted(if (d.today.isEmpty()) "No classes today." else "No classes left today.", 13)
            }
            rows.forEach { occ ->
                Row(modifier = GlanceModifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(GlanceModifier.width(6.dp).height(28.dp).cornerRadius(3.dp).background(ColorProvider(hex(d.data.color(occ.courseId))))) {}
                    Spacer(GlanceModifier.width(8.dp))
                    Column(modifier = GlanceModifier.defaultWeight()) {
                        Text(
                            d.data.code(occ.courseId) + (occ.room?.let { "  $it" } ?: ""),
                            style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium),
                            maxLines = 1,
                        )
                        Muted("${occ.start} – ${occ.end}" + when (occ.mark?.status) {
                            MarkStatus.PRESENT -> ", present"
                            MarkStatus.ABSENT -> ", skipping"
                            else -> ""
                        })
                    }
                    MarkButton(occ.key, occ.end, MarkStatus.ABSENT, R.drawable.ic_close, RiskBg, RiskFg)
                    Spacer(GlanceModifier.width(6.dp))
                    MarkButton(occ.key, occ.end, MarkStatus.PRESENT, R.drawable.ic_check, PresentBg, White)
                }
            }
            val more = d.todayRemaining.size - rows.size
            if (more > 0) Muted("+ $more more")
        }
    }
}

@Composable
private fun MarkButton(key: ClassKey, end: LocalTime, status: MarkStatus, icon: Int, bgColor: ColorProvider, tint: ColorProvider) {
    Box(
        modifier = GlanceModifier.size(40.dp).cornerRadius(12.dp).background(bgColor).clickable(
            actionRunCallback<MarkFromWidget>(
                actionParametersOf(
                    MarkFromWidget.Course to key.courseId,
                    MarkFromWidget.Day to key.date.toEpochDay(),
                    MarkFromWidget.Start to key.start.toSecondOfDay(),
                    MarkFromWidget.End to end.toSecondOfDay(),
                    MarkFromWidget.Status to status.name,
                ),
            ),
        ),
        contentAlignment = Alignment.Center,
    ) {
        Image(ImageProvider(icon), contentDescription = if (status == MarkStatus.PRESENT) "Present" else "Absent", colorFilter = ColorFilter.tint(tint))
    }
}

class MarkFromWidget : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val course = parameters[Course] ?: return
        val day = parameters[Day] ?: return
        val start = parameters[Start] ?: return
        val end = parameters[End] ?: return
        val status = parameters[Status]?.let { runCatching { MarkStatus.valueOf(it) }.getOrNull() } ?: return
        context.graph.repo.mark(
            ClassKey(course, LocalDate.ofEpochDay(day), LocalTime.ofSecondOfDay(start.toLong())),
            LocalTime.ofSecondOfDay(end.toLong()),
            status,
        )
    }

    companion object {
        val Course = ActionParameters.Key<String>("course")
        val Day = ActionParameters.Key<Long>("day")
        val Start = ActionParameters.Key<Int>("start")
        val End = ActionParameters.Key<Int>("end")
        val Status = ActionParameters.Key<String>("status")
    }
}

// Next class ----------------------------------------------------------------------

class NextClassWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val d = Widgets.derived(context)
        provideContent {
            val next = d?.next
            if (d == null || next == null) {
                Empty(context, "No more classes this semester.")
            } else {
                val occ = next.occurrence
                val stats = d.stats[occ.courseId]
                Card(context, "course/${occ.courseId}") {
                    Column {
                        Muted(if (next.inProgress) "NOW" else "NEXT, ${countdown(next.startsIn, occ.date, d.now.date)}")
                        Spacer(GlanceModifier.height(6.dp))
                        Text(d.data.code(occ.courseId), style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 22.sp, fontWeight = FontWeight.Bold))
                        Muted("${occ.start}" + (occ.room?.let { " in $it" } ?: ""), 13)
                        Spacer(GlanceModifier.height(8.dp))
                        if (stats != null) {
                            val skippable = !stats.strictNoSkip && stats.safeSkipsLeft > 0 && !stats.belowThreshold
                            Text(
                                if (skippable) "Safe to skip" else "Don't skip",
                                style = TextStyle(color = if (skippable) SafeFg else RiskFg, fontSize = 12.sp, fontWeight = FontWeight.Bold),
                                modifier = GlanceModifier.cornerRadius(10.dp).background(if (skippable) SafeBg else RiskBg).padding(horizontal = 8.dp, vertical = 3.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun countdown(d: Duration, date: LocalDate, today: LocalDate): String {
    if (date != today) return if (date == today.plusDays(1)) "tomorrow" else date.dayOfWeek.name.take(3).lowercase().replaceFirstChar { it.uppercase() }
    val m = d.toMinutes()
    return if (m < 60) "in $m min" else "in ${m / 60} h ${m % 60} min"
}

// Course ring -------------------------------------------------------------------------

class CourseRingWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val d = Widgets.derived(context)
        val widgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
        val chosen = CourseRingConfigActivity.courseFor(context, widgetId)
        provideContent {
            if (d == null || d.stats.isEmpty()) {
                Empty(context, "Add courses in AttendWise.")
            } else {
                val courseId = chosen?.takeIf { it in d.stats } ?: d.stats.minByOrNull { it.value.currentPercent ?: 100.0 }!!.key
                val s = d.stats.getValue(courseId)
                Card(context, "course/$courseId") {
                    Column(modifier = GlanceModifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalAlignment = Alignment.CenterVertically) {
                        Text(d.data.code(courseId), style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Bold))
                        Text(
                            s.currentPercentFloor?.let { "$it%" } ?: "—",
                            style = TextStyle(color = fg(s.status), fontSize = 34.sp, fontWeight = FontWeight.Bold),
                        )
                        Text(statusLine(s), style = TextStyle(color = fg(s.status), fontSize = 12.sp, fontWeight = FontWeight.Medium), maxLines = 2)
                    }
                }
            }
        }
    }
}

// Can I bunk today? -------------------------------------------------------------------------

class BunkWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val d = Widgets.derived(context)
        provideContent {
            Card(context, "plan") {
                Row(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = GlanceModifier.size(40.dp).cornerRadius(12.dp).background(GlanceTheme.colors.primary), contentAlignment = Alignment.Center) {
                        Image(ImageProvider(R.drawable.ic_plan), contentDescription = null, colorFilter = ColorFilter.tint(GlanceTheme.colors.onPrimary))
                    }
                    Spacer(GlanceModifier.width(10.dp))
                    Column {
                        Text("CAN I BUNK TODAY?", style = TextStyle(color = GlanceTheme.colors.primary, fontSize = 11.sp, fontWeight = FontWeight.Bold))
                        Text(
                            d?.verdictLine() ?: "Open AttendWise to set up your semester.",
                            style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 13.sp),
                            maxLines = 2,
                        )
                    }
                }
            }
        }
    }
}

// Needs attention ----------------------------------------------------------------------------

class DangerWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val d = Widgets.derived(context)
        provideContent {
            Card(context, "courses") {
                Column(modifier = GlanceModifier.fillMaxWidth()) {
                    Title("Needs attention")
                    Spacer(GlanceModifier.height(6.dp))
                    val list = d?.danger.orEmpty().take(3)
                    if (list.isEmpty()) Muted(if (d == null) "Open AttendWise to set up your semester." else "All courses are safe. Suspiciously well-behaved.", 13)
                    list.forEach { (courseId, s) -> DangerRow(d!!.data, courseId, s) }
                }
            }
        }
    }
}

@Composable
private fun DangerRow(data: AppData, courseId: String, s: AttendanceStats) {
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(vertical = 3.dp).cornerRadius(14.dp).background(bg(s.status)).padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(s.currentPercentFloor?.let { "$it%" } ?: "—", style = TextStyle(color = fg(s.status), fontSize = 16.sp, fontWeight = FontWeight.Bold), modifier = GlanceModifier.width(48.dp))
        Column {
            Text(data.code(courseId), style = TextStyle(color = fg(s.status), fontSize = 13.sp, fontWeight = FontWeight.Bold))
            Text(statusLine(s), style = TextStyle(color = fg(s.status), fontSize = 11.sp), maxLines = 1)
        }
    }
}

// Receivers --------------------------------------------------------------------------------

class TodayWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget: GlanceAppWidget = TodayWidget() }
class NextClassWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget: GlanceAppWidget = NextClassWidget() }
class CourseRingWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget: GlanceAppWidget = CourseRingWidget() }
class BunkWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget: GlanceAppWidget = BunkWidget() }
class DangerWidgetReceiver : GlanceAppWidgetReceiver() { override val glanceAppWidget: GlanceAppWidget = DangerWidget() }

internal fun appWidgetIdFrom(intent: Intent?): Int =
    intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) ?: AppWidgetManager.INVALID_APPWIDGET_ID
