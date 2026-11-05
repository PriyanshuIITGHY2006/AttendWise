package app.attendwise.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.attendwise.R
import app.attendwise.data.Derived
import app.attendwise.domain.model.ExtraClass
import app.attendwise.domain.schedule.ClassOccurrence
import app.attendwise.ui.AppViewModel
import app.attendwise.ui.components.AppIcon
import app.attendwise.ui.components.CourseDot
import app.attendwise.ui.components.DateField
import app.attendwise.ui.components.DayFmt
import app.attendwise.ui.components.MarkChip
import app.attendwise.ui.components.Panel
import app.attendwise.ui.components.Ring
import app.attendwise.ui.components.SectionHeader
import app.attendwise.ui.components.StatTile
import app.attendwise.ui.components.StatusChip
import app.attendwise.ui.components.TimeField
import app.attendwise.ui.components.TimeFmt
import app.attendwise.ui.theme.LocalStatusColors
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.TemporalAdjusters

@Composable
fun CourseDetailScreen(vm: AppViewModel, d: Derived, courseId: String, padding: PaddingValues, onBack: () -> Unit, onEdit: () -> Unit) {
    val course = d.data.courses.firstOrNull { it.id == courseId }
    if (course == null) {
        InfoCard("Course not found", "It may have been deleted.")
        return
    }
    val s = d.stats[courseId]
    val c = LocalStatusColors.current
    var editing by remember { mutableStateOf<ClassOccurrence?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    var addingExtra by remember { mutableStateOf(false) }
    val all = d.schedule.forCourse(courseId)
    val past = all.filter { it.hasStarted(d.now) }.sortedWith(compareByDescending<ClassOccurrence> { it.date }.thenByDescending { it.start })
    val upcomingSkips = all.filter { d.isPlannedSkip(it) }
    val today = d.now.date
    val slots = d.data.slots.filter { it.courseId == courseId && (it.validTo == null || !it.validTo!!.isBefore(today)) }
        .sortedWith(compareBy({ it.dayOfWeek }, { it.start }))

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) { AppIcon(R.drawable.ic_back, "Back", size = 24.dp) }
                Text(course.code, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                TextButton(onClick = onEdit) { AppIcon(R.drawable.ic_edit, "Edit course", size = 22.dp) }
            }
        }
        item {
            Panel {
                Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Ring(s?.currentPercent, s?.let { c.ring(it.status) } ?: MaterialTheme.colorScheme.outline, 128.dp, 12.dp, thresholdPercent = course.thresholdPercent) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(s?.currentPercentFloor?.let { "$it%" } ?: "—", fontSize = 30.sp, fontWeight = FontWeight.Bold)
                            Text("need ${course.thresholdPercent}%", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Spacer(Modifier.width(18.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            CourseDot(d.data.color(courseId), 12.dp)
                            Text("${slots.size} class${if (slots.size == 1) "" else "es"} a week", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(course.name, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        s?.let { StatusChip(it) }
                    }
                }
            }
        }
        if (s != null && s.belowThreshold) {
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(c.riskBg).padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (s.recoveryClasses != null && s.canReachThreshold) {
                        Text("Attend the next ${s.recoveryClasses} classes in a row", color = c.riskFg, fontWeight = FontWeight.SemiBold)
                        Text(
                            "That gets you back to ${course.thresholdPercent}%." + if (s.maxSafeSkips > 0) " After that, ${s.maxSafeSkips} safe skip${if (s.maxSafeSkips == 1) "" else "s"} open up." else "",
                            color = c.riskFg, fontSize = 13.sp,
                        )
                    } else {
                        Text("Can't reach ${course.thresholdPercent}% this semester", color = c.riskFg, fontWeight = FontWeight.SemiBold)
                        Text("Even attending every remaining class ends below the requirement. Talk to your instructor.", color = c.riskFg, fontSize = 13.sp)
                    }
                }
            }
        }
        if (s != null) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatTile("${s.counts.attended}", "Attended", Modifier.weight(1f))
                    StatTile("${s.counts.missed}", "Missed", Modifier.weight(1f))
                    StatTile("${s.counts.remaining}", "Left", Modifier.weight(1f))
                    StatTile("${s.counts.plannedSkips}", "Planned", Modifier.weight(1f))
                }
            }
            item {
                Panel {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row {
                            Text("End of semester", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                            d.data.semester?.let { Text("ends ${it.end.format(DayFmt)}", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                        ProjectionBar(s.currentPercent ?: 0.0, s.projectedIfAttendAll ?: 0.0, course.thresholdPercent, c.ring(s.status), c.present)
                        Text(
                            "Attend all ${s.counts.remaining} left → ${s.projectedIfAttendAll?.toInt() ?: 0}%" +
                                if (s.counts.plannedSkips > 0) "  ·  with your plans → ${s.projectedIfPlanFollowed?.toInt() ?: 0}%" else "",
                            fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (s.counts.unmarkedPast > 0) Text("${s.counts.unmarkedPast} past class${if (s.counts.unmarkedPast == 1) " is" else "es are"} unmarked and counted as attendable.", fontSize = 12.sp, color = c.tightFg)
                    }
                }
            }
        }
        item { SectionHeader("Timetable") { TextButton(onClick = onEdit) { Text("Edit") } } }
        item {
            Panel {
                Column(Modifier.fillMaxWidth()) {
                    if (slots.isEmpty()) Text("No class times yet.", modifier = Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    slots.forEach { slot ->
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                            Text(slot.dayOfWeek.name.take(3).lowercase().replaceFirstChar { it.uppercase() }, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(48.dp))
                            Text("${slot.start.format(TimeFmt)} – ${slot.end.format(TimeFmt)}", modifier = Modifier.weight(1f))
                            Text(listOfNotNull(slot.kind.name.lowercase().replaceFirstChar { it.uppercase() }, slot.room).joinToString(" · "), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
        item {
            OutlinedButton(onClick = { addingExtra = true }, modifier = Modifier.fillMaxWidth()) { Text("Add an extra class") }
        }
        if (upcomingSkips.isNotEmpty()) {
            item { SectionHeader("Planned skips (${upcomingSkips.size})") }
            items(upcomingSkips, key = { "p" + it.key.toString() }) { occ -> HistoryRow(occ, d) { editing = occ } }
        }
        item { SectionHeader("History") { Text("Tap a class to change it", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
        if (past.isEmpty()) item { Text("Nothing yet.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 4.dp)) }
        items(past.take(200), key = { "h" + it.key.toString() }) { occ -> HistoryRow(occ, d) { editing = occ } }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 8.dp)) {
                OutlinedButton(onClick = { vm.setArchived(courseId, !course.archived) }, modifier = Modifier.weight(1f)) { Text(if (course.archived) "Restore" else "Archive") }
                OutlinedButton(onClick = { confirmDelete = true }, modifier = Modifier.weight(1f)) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            }
        }
    }

    editing?.let { occ ->
        MarkDialog(
            title = "${course.code} · ${occ.date.format(DayFmt)} ${occ.start.format(TimeFmt)}",
            current = occ.mark?.status,
            onPick = { vm.mark(occ.key, occ.end, it); editing = null },
            onDismiss = { editing = null },
        )
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete ${course.code}?") },
            text = { Text("The course, its timetable and its marks disappear from all your devices. Archive it instead to keep the history.") },
            confirmButton = { TextButton(onClick = { confirmDelete = false; vm.deleteCourse(courseId, onBack) }) { Text("Delete", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
        )
    }
    if (addingExtra) ExtraClassDialog(courseId, onDismiss = { addingExtra = false }) { vm.addExtraClass(it); addingExtra = false }
}

@Composable
private fun HistoryRow(occ: ClassOccurrence, d: Derived, onClick: () -> Unit) {
    val c = LocalStatusColors.current
    Panel(onClick = onClick) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(occ.date.format(DayFmt), fontWeight = FontWeight.Medium)
                Text(
                    "${occ.start.format(TimeFmt)} – ${occ.end.format(TimeFmt)}" + when {
                        occ.swappedFrom != null -> " · ${occ.swappedFrom!!.name.lowercase().replaceFirstChar { it.uppercase() }} timetable"
                        occ.source.name == "EXTRA" -> " · extra class"
                        occ.source.name == "ORPHANED" -> " · no longer in timetable"
                        else -> ""
                    },
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (occ.mark == null) {
                Text(if (occ.hasEnded(d.now)) "Unmarked" else "Now", color = c.tightFg, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            } else {
                MarkChip(occ, d)
            }
        }
    }
}

@Composable
private fun ProjectionBar(now: Double, attendAll: Double, threshold: Int, nowColor: androidx.compose.ui.graphics.Color, gain: androidx.compose.ui.graphics.Color) {
    val track = MaterialTheme.colorScheme.surfaceVariant
    val tick = MaterialTheme.colorScheme.onSurface
    Box(Modifier.fillMaxWidth().height(14.dp)) {
        Box(Modifier.fillMaxWidth().height(12.dp).clip(RoundedCornerShape(6.dp)).background(track))
        Row(Modifier.fillMaxWidth().height(12.dp).clip(RoundedCornerShape(6.dp))) {
            val a = (now / 100).toFloat().coerceIn(0f, 1f)
            val b = ((attendAll - now).coerceAtLeast(0.0) / 100).toFloat().coerceIn(0f, 1f - a)
            if (a > 0f) Box(Modifier.weight(a).fillMaxHeight().background(nowColor))
            if (b > 0f) Box(Modifier.weight(b).fillMaxHeight().background(gain.copy(alpha = 0.45f)))
            val rest = 1f - a - b
            if (rest > 0f) Spacer(Modifier.weight(rest))
        }
        Row(Modifier.fillMaxWidth()) {
            val t = threshold / 100f
            if (t > 0f) Spacer(Modifier.weight(t))
            Box(Modifier.width(2.dp).height(14.dp).background(tick))
            if (t < 1f) Spacer(Modifier.weight(1f - t))
        }
    }
}

@Composable
private fun ExtraClassDialog(courseId: String, onDismiss: () -> Unit, onSave: (ExtraClass) -> Unit) {
    var date by remember { mutableStateOf(LocalDate.now().with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY))) }
    var start by remember { mutableStateOf(LocalTime.of(10, 0)) }
    var end by remember { mutableStateOf(LocalTime.of(10, 55)) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Extra class") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                DateField("Date", date, { date = it })
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    TimeField(start, { start = it; if (!end.isAfter(it)) end = it.plusMinutes(55) }, label = "From")
                    TimeField(end, { end = it }, label = "To")
                }
            }
        },
        confirmButton = {
            TextButton(enabled = end.isAfter(start), onClick = { onSave(ExtraClass(courseId, date, start, end)) }) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

