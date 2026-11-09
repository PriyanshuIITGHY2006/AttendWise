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
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

private val HourHeight = 56.dp
private val Gutter = 44.dp
private val LaneGap = 10.dp
private val HeaderHeight = 86.dp
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
    val haptics = LocalHapticFeedback.current

    Column(modifier) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(weekLabel(days), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
            if (!isThisWeek) TextButton(onClick = { monday = mondayOf(d.now.date) }) { Text("Today") }
            TextButton(onClick = { monday = monday.minusWeeks(1) }) { AppIcon(R.drawable.ic_back, "Previous week", size = 20.dp) }
            TextButton(onClick = { monday = monday.plusWeeks(1) }) { AppIcon(R.drawable.ic_chevron_right, "Next week", size = 20.dp) }
        }
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)) {
            val colWidth = maxOf(132.dp, (maxWidth - Gutter - LaneGap * (days.size - 1)) / days.size)
            val horizontal = rememberScrollState()
            val density = LocalDensity.current
            // On a phone the week is wider than the screen, so bring today's column into view.
            LaunchedEffect(monday, colWidth) {
                val index = days.indexOf(d.now.date)
                val target = if (index >= 0) with(density) { ((colWidth + LaneGap) * index).roundToPx() } else 0
                withTimeoutOrNull(300) { snapshotFlow { horizontal.maxValue }.first { it > 0 } }
                horizontal.animateScrollTo(target)
            }
            val line = MaterialTheme.colorScheme.outlineVariant
            val laneShape = RoundedCornerShape(22.dp)
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                Row {
                    Column(Modifier.width(Gutter)) {
                        Spacer(Modifier.height(HeaderHeight))
                        Box(Modifier.fillMaxWidth().height(gridHeight)) {
                            for (h in range.from until range.to) {
                                Text(
                                    hourLabel(h), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.align(Alignment.TopEnd).offset(y = HourHeight * (h - range.from) - (if (h == range.from) 0.dp else 8.dp)).padding(end = 2.dp),
                                )
                            }
                        }
                    }
                    Row(Modifier.weight(1f).horizontalScroll(horizontal), horizontalArrangement = Arrangement.spacedBy(LaneGap)) {
                    days.forEach { date ->
                        val info = d.dayInfo(date)
                        val today = date == d.now.date
                        Column(
                            Modifier.width(colWidth).clip(laneShape)
                                .background(if (today) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.7f) else MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.55f))
                                .border(1.dp, if (today) MaterialTheme.colorScheme.primary.copy(alpha = 0.4f) else line, laneShape),
                        ) {
                            Column(Modifier.fillMaxWidth().height(HeaderHeight).padding(top = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).uppercase(), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Box(
                                    Modifier.defaultMinSize(minWidth = 34.dp).height(34.dp).clip(RoundedCornerShape(50))
                                        .background(if (today) MaterialTheme.colorScheme.primary else androidx.compose.ui.graphics.Color.Transparent),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text("${date.dayOfMonth}", fontSize = 21.sp, color = if (today) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(horizontal = 6.dp))
                                }
                                if (info is DayInfo.Swapped) {
                                    Text(
                                        "↻ " + info.follows.getDisplayName(TextStyle.SHORT, Locale.ENGLISH), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = c.tightFg,
                                        modifier = Modifier.padding(top = 2.dp).clip(RoundedCornerShape(50)).background(c.tightBg).padding(horizontal = 8.dp, vertical = 1.dp),
                                    )
                                }
                            }
                            Box(
                                Modifier.fillMaxWidth().height(gridHeight).drawBehind {
                                    val hourPx = HourHeight.toPx()
                                    for (i in 0 until hours) drawLine(line, Offset(10.dp.toPx(), i * hourPx), Offset(size.width - 10.dp.toPx(), i * hourPx), 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
                                },
                            ) {
                                if (info is DayInfo.NoClasses) {
                                    Column(Modifier.fillMaxSize().background(c.swapBg.copy(alpha = 0.6f)).padding(horizontal = 8.dp, vertical = 22.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(noClassTitle(info.type), color = c.swapFg, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                        if (!info.description.isNullOrBlank()) Text(info.description!!, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, textAlign = TextAlign.Center)
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
                                    val height = maxOf(HourHeight * ((endMin - startMin) / 60f) - 4.dp, 24.dp)
                                    val shape = RoundedCornerShape(14.dp)
                                    val muted = MaterialTheme.colorScheme.onSurfaceVariant
                                    Column(
                                        Modifier.offset(x = laneWidth * placed.lane + 6.dp, y = HourHeight * ((startMin - range.from * 60) / 60f) + 2.dp)
                                            .width(laneWidth - 12.dp).height(height).clip(shape)
                                            .background(if (off) MaterialTheme.colorScheme.surfaceVariant else if (planned) c.riskBg.copy(alpha = 0.55f).compositeOver(MaterialTheme.colorScheme.surfaceContainer) else accent.copy(alpha = 0.08f).compositeOver(MaterialTheme.colorScheme.surfaceContainer))
                                            .border(if (planned) 1.5.dp else 1.dp, if (planned) c.riskFg else line, shape)
                                            .clickable { editing = occ }
                                            .padding(horizontal = 9.dp, vertical = 6.dp)
                                            .semantics { contentDescription = "$name, ${occ.start.format(TimeFmt)} to ${occ.end.format(TimeFmt)}, ${statusText(occ, planned)}" },
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Box(Modifier.size(9.dp).clip(RoundedCornerShape(3.dp)).background(accent))
                                            Spacer(Modifier.width(6.dp))
                                            Text(
                                                d.data.code(occ.courseId), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, lineHeight = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                                color = if (off) muted else MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f, fill = false),
                                                textDecoration = if (status == MarkStatus.CANCELLED) TextDecoration.LineThrough else null,
                                            )
                                            Spacer(Modifier.weight(1f))
                                            val glyph = when {
                                                planned -> "SKIP" to c.riskFg
                                                status == MarkStatus.PRESENT && occ.hasStarted(d.now) -> "✓" to c.present
                                                status == MarkStatus.ABSENT && occ.hasStarted(d.now) -> "✕" to c.riskFg
                                                status == null && occ.hasEnded(d.now) -> "?" to c.tightFg
                                                else -> null
                                            }
                                            if (glyph != null) Text(glyph.first, color = glyph.second, fontSize = if (glyph.first == "SKIP") 10.sp else 12.sp, fontWeight = FontWeight.Bold)
                                        }
                                        if (height >= 44.dp) Text(name, fontSize = 11.5.sp, lineHeight = 14.sp, color = muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        if (height >= 74.dp) Text("${occ.start.format(TimeFmt)} to ${occ.end.format(TimeFmt)}", fontSize = 11.sp, lineHeight = 14.sp, color = muted, maxLines = 1)
                                        if (height >= 96.dp) Text(listOfNotNull(kindText(occ), occ.room?.takeIf { it.isNotBlank() }).joinToString(", "), fontSize = 11.sp, lineHeight = 14.sp, color = muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                }
                                if (today && nowMinutes in (range.from * 60)..(range.to * 60)) {
                                    Box(Modifier.offset(y = HourHeight * ((nowMinutes - range.from * 60) / 60f)).padding(horizontal = 4.dp).fillMaxWidth().height(2.dp).clip(RoundedCornerShape(50)).background(c.riskFg))
                                }
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
            onPick = { haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove); vm.mark(occ.key, occ.end, it); editing = null },
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
