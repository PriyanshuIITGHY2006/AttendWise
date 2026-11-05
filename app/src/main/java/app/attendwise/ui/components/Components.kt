package app.attendwise.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.attendwise.R
import app.attendwise.data.Derived
import app.attendwise.domain.attendance.AttendanceStats
import app.attendwise.domain.attendance.CourseStatus
import app.attendwise.domain.calendar.DayInfo
import app.attendwise.domain.model.DayType
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.schedule.ClassOccurrence
import app.attendwise.ui.theme.LocalStatusColors
import app.attendwise.ui.theme.courseColor
import kotlinx.coroutines.launch
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

val TimeFmt: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
val DayFmt: DateTimeFormatter = DateTimeFormatter.ofPattern("EEE d MMM")
val LongDayFmt: DateTimeFormatter = DateTimeFormatter.ofPattern("EEEE, d MMM")

@Composable
fun AppIcon(id: Int, contentDescription: String?, modifier: Modifier = Modifier, tint: Color = MaterialTheme.colorScheme.onSurface, size: Dp = 22.dp) =
    Icon(painterResource(id), contentDescription, modifier.size(size), tint = tint)

@Composable
fun Panel(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable () -> Unit) {
    val shape = RoundedCornerShape(20.dp)
    val base = modifier.clip(shape).background(MaterialTheme.colorScheme.surfaceContainer)
        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
    Box(if (onClick != null) base.clickable(onClick = onClick) else base) { content() }
}

@Composable
fun Chip(text: String, fg: Color, bg: Color, icon: Int? = null, modifier: Modifier = Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 9.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (icon != null) AppIcon(icon, null, tint = fg, size = 14.dp)
        Text(text, color = fg, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
fun CourseDot(hex: String, size: Dp = 10.dp) =
    Box(Modifier.size(size).clip(RoundedCornerShape(3.dp)).background(courseColor(hex)))

@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        trailing()
    }
}

/** Attendance ring. [percent] null draws an empty ring. */
@Composable
fun Ring(percent: Double?, color: Color, size: Dp, stroke: Dp, modifier: Modifier = Modifier, thresholdPercent: Int? = null, center: @Composable () -> Unit = {}) {
    val track = MaterialTheme.colorScheme.surfaceVariant
    val tick = MaterialTheme.colorScheme.onSurface
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.matchParentSize()) {
            val w = stroke.toPx()
            val inset = w / 2
            val arcSize = Size(this.size.width - w, this.size.height - w)
            drawArc(track, 0f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(w))
            val sweep = ((percent ?: 0.0) / 100.0 * 360.0).toFloat().coerceIn(0f, 360f)
            if (sweep > 0f) drawArc(color, -90f, sweep, false, Offset(inset, inset), arcSize, style = Stroke(w, cap = StrokeCap.Round))
            if (thresholdPercent != null) {
                val angle = Math.toRadians(thresholdPercent / 100.0 * 360.0 - 90.0)
                val r = this.size.width / 2
                val c = Offset(r, r)
                val outer = Offset((c.x + r * kotlin.math.cos(angle)).toFloat(), (c.y + r * kotlin.math.sin(angle)).toFloat())
                val inner = Offset((c.x + (r - w * 1.4f) * kotlin.math.cos(angle)).toFloat(), (c.y + (r - w * 1.4f) * kotlin.math.sin(angle)).toFloat())
                drawLine(tick, inner, outer, strokeWidth = 2.5.dp.toPx())
            }
        }
        center()
    }
}

/** Short status text for a course, as on the mockups. */
fun statusLine(s: AttendanceStats): String = when {
    s.strictNoSkip && s.status != CourseStatus.AT_RISK -> "Zero-tolerance · never skip"
    s.status == CourseStatus.AT_RISK && !s.canReachThreshold -> "Can't reach ${s.thresholdPercent}% this semester"
    s.status == CourseStatus.AT_RISK && s.overBudget > 0 -> "Over budget by ${s.overBudget}"
    s.status == CourseStatus.AT_RISK && s.recoveryClasses != null -> "At risk · attend ${s.recoveryClasses} to recover"
    s.status == CourseStatus.AT_RISK -> "At risk"
    s.status == CourseStatus.TIGHT -> "No skips left" + if (s.counts.plannedSkips > 0) " · ${s.counts.plannedSkips} planned" else ""
    s.counts.marked == 0 && s.counts.remaining == 0 -> "No classes yet"
    else -> "${s.safeSkipsLeft} safe skip${if (s.safeSkipsLeft == 1) "" else "s"}" + if (s.counts.plannedSkips > 0) " · ${s.counts.plannedSkips} planned" else ""
}

@Composable
fun StatusChip(s: AttendanceStats, modifier: Modifier = Modifier) {
    val c = LocalStatusColors.current
    if (s.strictNoSkip && s.status != CourseStatus.AT_RISK) {
        Chip(statusLine(s), c.neutralFg, c.neutralBg, R.drawable.ic_lock, modifier)
    } else {
        val icon = when (s.status) { CourseStatus.SAFE -> R.drawable.ic_check; CourseStatus.TIGHT -> null; CourseStatus.AT_RISK -> R.drawable.ic_alert }
        Chip(statusLine(s), c.fg(s.status), c.bg(s.status), icon, modifier)
    }
}

@Composable
fun DayBanner(info: DayInfo, modifier: Modifier = Modifier) {
    val c = LocalStatusColors.current
    val (title, sub) = when (info) {
        is DayInfo.Swapped -> "Day swap: ${info.follows.name.lowercase().replaceFirstChar { it.uppercase() }}'s timetable today" to info.description
        is DayInfo.NoClasses -> when (info.type) {
            DayType.HOLIDAY -> "Holiday"
            DayType.EXAM -> "Exam day"
            DayType.MID_SEM_BREAK -> "Mid-semester exams"
            DayType.END_SEM_BREAK -> "End-semester exams"
            DayType.RESCHEDULE -> "No classes"
        } to info.description
        is DayInfo.Regular -> return
    }
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(c.swapBg).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AppIcon(R.drawable.ic_swap, null, tint = c.swapFg)
        Spacer(Modifier.width(12.dp))
        Column {
            Text(title, color = c.swapFg, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            if (!sub.isNullOrBlank()) Text(sub, color = c.swapFg, fontSize = 12.sp)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MarkButtons(onAbsent: () -> Unit, onPresent: () -> Unit) {
    val c = LocalStatusColors.current
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Surface(
            onClick = onAbsent, shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainer,
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier.size(44.dp).semantics { contentDescription = "Mark absent" },
        ) { Box(contentAlignment = Alignment.Center) { AppIcon(R.drawable.ic_close, null, tint = c.riskFg, size = 20.dp) } }
        Surface(
            onClick = onPresent, shape = RoundedCornerShape(14.dp), color = c.present,
            modifier = Modifier.size(44.dp).semantics { contentDescription = "Mark present" },
        ) { Box(contentAlignment = Alignment.Center) { AppIcon(R.drawable.ic_check, null, tint = c.onPresent, size = 20.dp) } }
    }
}

/** The chip shown on a class that already has a mark. */
@Composable
fun MarkChip(occ: ClassOccurrence, derived: Derived) {
    val c = LocalStatusColors.current
    when (occ.mark?.status) {
        MarkStatus.PRESENT -> Chip(if (occ.hasStarted(derived.now)) "Present" else "Going", c.safeFg, c.safeBg, R.drawable.ic_check)
        MarkStatus.ABSENT -> Chip(if (occ.hasStarted(derived.now)) "Absent" else "Planned skip", c.riskFg, c.riskBg, R.drawable.ic_close)
        MarkStatus.CANCELLED -> Chip("Cancelled", c.neutralFg, c.neutralBg)
        MarkStatus.ON_DUTY -> Chip("On duty", c.tightFg, c.tightBg)
        null -> {}
    }
}

/**
 * A class row. Swipe right marks present, left marks absent; long-press opens
 * more options. Unmarked classes also show explicit buttons.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ClassCard(
    occ: ClassOccurrence,
    derived: Derived,
    onMark: (MarkStatus?) -> Unit,
    onMore: () -> Unit,
    showDate: Boolean = false,
) {
    val c = LocalStatusColors.current
    val data = derived.data
    val offset = remember(occ.key) { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val threshold = with(LocalDensity.current) { 96.dp.toPx() }
    val now = derived.now
    val inProgress = occ.hasStarted(now) && !occ.hasEnded(now)
    val shape = RoundedCornerShape(16.dp)

    Box(Modifier.fillMaxWidth().clip(shape)) {
        // Revealed behind the card while swiping.
        val swipeColor = if (offset.value >= 0) c.present else Color(0xFFC2261A)
        Box(Modifier.matchParentSize().background(if (offset.value == 0f) Color.Transparent else swipeColor).padding(horizontal = 24.dp)) {
            Text(
                if (offset.value >= 0) "Present" else "Absent",
                color = Color.White, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.align(if (offset.value >= 0) Alignment.CenterStart else Alignment.CenterEnd),
            )
        }
        Row(
            Modifier
                .offset { IntOffset(offset.value.roundToInt(), 0) }
                .fillMaxWidth()
                .clip(shape)
                .background(MaterialTheme.colorScheme.surfaceContainer)
                .border(if (inProgress) 2.dp else 1.dp, if (inProgress) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, shape)
                .pointerInput(occ.key) {
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            scope.launch {
                                val v = offset.value
                                if (v > threshold) { haptics.performHapticFeedback(HapticFeedbackType.LongPress); onMark(MarkStatus.PRESENT) }
                                if (v < -threshold) { haptics.performHapticFeedback(HapticFeedbackType.LongPress); onMark(MarkStatus.ABSENT) }
                                offset.animateTo(0f)
                            }
                        },
                        onDragCancel = { scope.launch { offset.animateTo(0f) } },
                        onHorizontalDrag = { change, amount ->
                            change.consume()
                            scope.launch { offset.snapTo((offset.value + amount).coerceIn(-threshold * 1.6f, threshold * 1.6f)) }
                        },
                    )
                }
                .combinedClickable(onClick = onMore, onLongClick = onMore)
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.width(52.dp)) {
                if (inProgress) Text("NOW", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                else if (showDate) Text(occ.date.format(DayFmt), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                Text(occ.start.format(TimeFmt), fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                if (!inProgress) Text(occ.end.format(TimeFmt), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CourseDot(data.color(occ.courseId))
                    Text(data.code(occ.courseId), fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    val meta = listOfNotNull(occ.kind.name.lowercase().replaceFirstChar { it.uppercase() }.takeIf { occ.kind.name != "LECTURE" }, occ.room).joinToString(" · ")
                    if (meta.isNotEmpty()) Text("· $meta", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (occ.mark == null) derived.stats[occ.courseId]?.let { StatusChip(it) }
            }
            if (occ.mark == null) {
                MarkButtons(onAbsent = { onMark(MarkStatus.ABSENT) }, onPresent = { onMark(MarkStatus.PRESENT) })
            } else {
                MarkChip(occ, derived)
            }
        }
    }
}

@Composable
fun StatTile(value: String, label: String, modifier: Modifier = Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceContainer)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp)).padding(12.dp),
    ) {
        Text(value, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun Dot(color: Color, size: Dp = 6.dp, ring: Boolean = false) =
    Box(
        Modifier.size(size).clip(CircleShape).then(
            if (ring) Modifier.border(1.5.dp, color, CircleShape) else Modifier.background(color),
        ),
    )
