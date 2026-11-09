package app.attendwise.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.attendwise.R
import app.attendwise.data.Derived
import app.attendwise.domain.calendar.DayInfo
import app.attendwise.domain.model.DayType
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.schedule.ClassOccurrence
import app.attendwise.domain.schedule.hourRange
import app.attendwise.domain.schedule.layoutDay
import app.attendwise.domain.schedule.mondayOf
import app.attendwise.domain.schedule.weekDates
import app.attendwise.ui.AppViewModel
import app.attendwise.ui.components.AppIcon
import app.attendwise.ui.components.DayFmt
import app.attendwise.ui.components.TimeFmt
import app.attendwise.ui.theme.LocalStatusColors
import app.attendwise.ui.theme.courseColor
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private val HourHeight = 56.dp
private val Gutter = 48.dp
private val DayMonth = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)

private fun weekLabel(days: List<LocalDate>): String {
    val a = days.first()
    val b = days.last()
    return if (a.month == b.month) "${a.dayOfMonth} to ${b.format(DayMonth)}" else "${a.format(DayMonth)} to ${b.format(DayMonth)}"
}

private fun noClassTitle(type: DayType): String = when (type) {
    DayType.HOLIDAY -> "Holiday"
    DayType.EXAM -> "Exam day"
    DayType.MID_SEM_BREAK -> "Mid-semester exams"
    DayType.END_SEM_BREAK -> "End-semester exams"
    DayType.RESCHEDULE -> "No classes"
}

private fun hourLabel(h: Int): String = "${if (h % 12 == 0) 12 else h % 12} ${if (h < 12) "am" else "pm"}"

private fun statusText(o: ClassOccurrence, planned: Boolean): String = when (o.mark?.status) {
    MarkStatus.PRESENT -> "Present"
    MarkStatus.ABSENT -> if (planned) "Planned skip" else "Absent"
    MarkStatus.CANCELLED -> "Cancelled"
    MarkStatus.ON_DUTY -> "On duty"
    null -> "Not marked"
}

private fun kindText(o: ClassOccurrence): String = o.kind.name.lowercase().replaceFirstChar { it.uppercase() }

/** The weekly timetable: one column per day, hours down the side, each class at its real time and length. */
@Composable
fun WeekView(vm: AppViewModel, d: Derived, modifier: Modifier = Modifier) {
    val c = LocalStatusColors.current
    var monday by remember { mutableStateOf(mondayOf(d.now.date)) }
    var editing by remember { mutableStateOf<ClassOccurrence?>(null) }
    val byDate = remember(d) { d.schedule.occurrences.groupBy { it.date } }
    val days = weekDates(monday) { byDate[it].orEmpty().isNotEmpty() }
    val range = hourRange(days.flatMap { byDate[it].orEmpty() })
    val hours = range.to - range.from
    val gridHeight = HourHeight * hours
    val isThisWeek = monday == mondayOf(d.now.date)
    val nowMinutes = d.now.time.hour * 60 + d.now.time.minute

    Column(modifier) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(weekLabel(days), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
            if (!isThisWeek) TextButton(onClick = { monday = mondayOf(d.now.date) }) { Text("Today") }
            TextButton(onClick = { monday = monday.minusWeeks(1) }) { AppIcon(R.drawable.ic_back, "Previous week", size = 20.dp) }
            TextButton(onClick = { monday = monday.plusWeeks(1) }) { AppIcon(R.drawable.ic_chevron_right, "Next week", size = 20.dp) }
        }
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
            val colWidth = maxOf(118.dp, (maxWidth - Gutter) / days.size)
            val horizontal = rememberScrollState()
            val line = MaterialTheme.colorScheme.outlineVariant
            Column(Modifier.fillMaxSize().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceContainer).border(1.dp, line, RoundedCornerShape(20.dp))) {
                // Day headers, scrolling sideways together with the grid.
                Row(Modifier.horizontalScroll(horizontal)) {
                    Spacer(Modifier.width(Gutter))
                    days.forEach { date ->
                        val info = d.dayInfo(date)
                        val today = date == d.now.date
                        Column(
                            Modifier.width(colWidth).height(72.dp).background(if (today) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainer)
                                .padding(top = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).uppercase(), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("${date.dayOfMonth}", fontSize = 20.sp, color = if (today) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                            if (info is DayInfo.Swapped) {
                                Text(
                                    "↻ " + info.follows.getDisplayName(TextStyle.SHORT, Locale.ENGLISH), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = c.tightFg,
                                    modifier = Modifier.clip(RoundedCornerShape(50)).background(c.tightBg).padding(horizontal = 7.dp, vertical = 1.dp),
                                )
                            }
                        }
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(line))
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                    Row(Modifier.horizontalScroll(horizontal)) {
                        Box(Modifier.width(Gutter).height(gridHeight)) {
                            for (h in range.from until range.to) {
                                Text(
                                    hourLabel(h), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.align(Alignment.TopEnd).offset(y = HourHeight * (h - range.from) - (if (h == range.from) 0.dp else 8.dp)).padding(end = 6.dp),
                                )
                            }
                        }
                        days.forEach { date ->
                            val info = d.dayInfo(date)
                            val today = date == d.now.date
                            Box(
                                Modifier.width(colWidth).height(gridHeight)
                                    .background(if (today) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f) else androidx.compose.ui.graphics.Color.Transparent)
                                    .drawBehind {
                                        val hourPx = HourHeight.toPx()
                                        for (i in 0 until hours) drawLine(line, Offset(0f, i * hourPx), Offset(size.width, i * hourPx), 1.dp.toPx())
                                        drawLine(line, Offset(0f, 0f), Offset(0f, size.height), 1.dp.toPx())
                                    },
                            ) {
                                if (info is DayInfo.NoClasses) {
                                    Column(Modifier.fillMaxSize().background(c.swapBg).padding(horizontal = 8.dp, vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(noClassTitle(info.type), color = c.swapFg, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                        if (!info.description.isNullOrBlank()) Text(info.description!!, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                                    }
                                }
                                layoutDay(byDate[date].orEmpty()).forEach { placed ->
                                    val occ = placed.occurrence
                                    val startMin = occ.start.hour * 60 + occ.start.minute
                                    val endMin = occ.end.hour * 60 + occ.end.minute
                                    val laneWidth = colWidth / placed.lanes
                                    val planned = d.isPlannedSkip(occ)
                                    val status = occ.mark?.status
                                    val off = status?.isNeutral == true
                                    val accent = if (off) MaterialTheme.colorScheme.outline else courseColor(d.data.color(occ.courseId))
                                    val name = d.data.courseInfo[occ.courseId]?.name ?: d.data.code(occ.courseId)
                                    val height = maxOf(HourHeight * ((endMin - startMin) / 60f) - 2.dp, 22.dp)
                                    val shape = RoundedCornerShape(8.dp)
                                    Row(
                                        Modifier.offset(x = laneWidth * placed.lane + 2.dp, y = HourHeight * ((startMin - range.from * 60) / 60f) + 1.dp)
                                            .width(laneWidth - 4.dp).height(height).clip(shape)
                                            .background(accent.copy(alpha = if (off) 0.14f else 0.18f).compositeOver(MaterialTheme.colorScheme.surfaceContainer))
                                            .then(if (planned) Modifier.border(1.5.dp, c.riskFg, shape) else Modifier)
                                            .clickable { editing = occ }
                                            .semantics { contentDescription = "$name, ${occ.start.format(TimeFmt)} to ${occ.end.format(TimeFmt)}, ${statusText(occ, planned)}" },
                                    ) {
                                        Box(Modifier.width(4.dp).fillMaxHeight().background(accent))
                                        Box(Modifier.weight(1f).fillMaxHeight()) {
                                            Column(Modifier.padding(start = 6.dp, end = 16.dp, top = 4.dp)) {
                                                Text(
                                                    name, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, lineHeight = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                                                    color = if (off) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                                                    textDecoration = if (status == MarkStatus.CANCELLED) TextDecoration.LineThrough else null,
                                                )
                                                Text(kindText(occ), fontSize = 10.5.sp, lineHeight = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                            val glyph = when {
                                                status == MarkStatus.PRESENT && occ.hasStarted(d.now) -> "✓" to c.present
                                                status == MarkStatus.ABSENT && occ.hasStarted(d.now) -> "✕" to c.riskFg
                                                status == null && occ.hasEnded(d.now) -> "?" to c.tightFg
                                                else -> null
                                            }
                                            if (glyph != null) Text(glyph.first, color = glyph.second, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.TopEnd).padding(top = 3.dp, end = 5.dp))
                                        }
                                    }
                                }
                                if (today && nowMinutes in (range.from * 60)..(range.to * 60)) {
                                    Box(Modifier.offset(y = HourHeight * ((nowMinutes - range.from * 60) / 60f)).fillMaxWidth().height(2.dp).background(c.riskFg))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    editing?.let { occ ->
        val planned = d.isPlannedSkip(occ)
        MarkDialog(
            title = d.data.courseInfo[occ.courseId]?.name ?: d.data.code(occ.courseId),
            current = occ.mark?.status,
            onPick = { vm.mark(occ.key, occ.end, it); editing = null },
            onDismiss = { editing = null },
            details = {
                Column(Modifier.padding(bottom = 10.dp)) {
                    Row { Text(d.data.code(occ.courseId), fontWeight = FontWeight.Bold); Text("  " + kindText(occ), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    Text("${occ.date.format(DayFmt)}, ${occ.start.format(TimeFmt)} to ${occ.end.format(TimeFmt)}")
                    if (!occ.room.isNullOrBlank()) Text(occ.room!!, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(statusText(occ, planned), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
        )
    }
}
