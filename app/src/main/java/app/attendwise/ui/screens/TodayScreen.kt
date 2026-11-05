package app.attendwise.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.attendwise.R
import app.attendwise.data.Derived
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.schedule.ClassOccurrence
import app.attendwise.ui.AppViewModel
import app.attendwise.ui.components.AppIcon
import app.attendwise.ui.components.ClassCard
import app.attendwise.ui.components.DayBanner
import app.attendwise.ui.components.DayFmt
import app.attendwise.ui.components.LongDayFmt
import app.attendwise.ui.components.SectionHeader
import app.attendwise.ui.components.TimeFmt
import app.attendwise.ui.theme.LocalStatusColors

@Composable
fun TodayScreen(vm: AppViewModel, d: Derived, padding: PaddingValues, onPlan: () -> Unit) {
    var editing by remember { mutableStateOf<ClassOccurrence?>(null) }
    val c = LocalStatusColors.current
    val markedToday = d.today.count { it.mark != null }
    val sem = d.data.semester

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 20.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text(
                        if (d.today.isEmpty()) "No classes" else "$markedToday of ${d.today.size} marked",
                        color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, fontWeight = FontWeight.Medium,
                    )
                    Text(d.now.date.format(LongDayFmt), style = MaterialTheme.typography.headlineMedium)
                }
                d.overall.percentFloor?.let { p ->
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Overall", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("$p%", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
        }
        if (sem != null && d.now.date.isBefore(sem.start)) {
            item { InfoCard("${sem.name} starts ${sem.start.format(DayFmt)}", "Your classes will appear here from then.") }
        } else if (sem != null && d.now.date.isAfter(sem.end)) {
            item { InfoCard("${sem.name} is over", "Start your next semester from Profile.") }
        }
        item { DayBanner(d.todayInfo) }
        if (d.inSemester) {
            item {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.primaryContainer)
                        .clickable(onClick = onPlan).padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.primary),
                        contentAlignment = Alignment.Center,
                    ) { AppIcon(R.drawable.ic_plan, null, tint = MaterialTheme.colorScheme.onPrimary) }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("CAN I BUNK TODAY?", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onPrimaryContainer)
                        Text(d.verdictLine(), color = MaterialTheme.colorScheme.onPrimaryContainer, fontSize = 14.sp)
                    }
                }
            }
        }
        if (d.today.isNotEmpty()) {
            item {
                SectionHeader("Classes") {
                    Text("Swipe right = present, left = absent", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            items(d.today, key = { "t" + it.key.toString() }) { occ ->
                ClassCard(occ, d, onMark = { vm.mark(occ.key, occ.end, it) }, onMore = { editing = occ })
            }
        }
        val pending = d.unmarkedPast.filter { it.date != d.now.date }
        if (pending.isNotEmpty()) {
            item {
                SectionHeader("Unmarked from earlier (${pending.size})") {
                    TextButton(onClick = { vm.markAll(pending.map { it.key to it.end }, MarkStatus.PRESENT) }) { Text("Mark all present") }
                }
            }
            items(pending.take(15), key = { "u" + it.key.toString() }) { occ ->
                ClassCard(occ, d, onMark = { vm.mark(occ.key, occ.end, it) }, onMore = { editing = occ }, showDate = true)
            }
            if (pending.size > 15) item { Text("…and ${pending.size - 15} more. Mark them from Calendar.", color = c.tightFg, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp)) }
        }
    }

    editing?.let { occ ->
        MarkDialog(
            title = "${d.data.code(occ.courseId)}, ${occ.date.format(DayFmt)} at ${occ.start.format(TimeFmt)}",
            current = occ.mark?.status,
            onPick = { vm.mark(occ.key, occ.end, it); editing = null },
            onDismiss = { editing = null },
        )
    }
}

@Composable
fun InfoCard(title: String, body: String) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceContainer).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Choose what happened in a class. */
@Composable
fun MarkDialog(title: String, current: MarkStatus?, onPick: (MarkStatus?) -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                listOf(
                    MarkStatus.PRESENT to "Present",
                    MarkStatus.ABSENT to "Absent (or skip it, if it's later)",
                    MarkStatus.CANCELLED to "Cancelled — doesn't count",
                    MarkStatus.ON_DUTY to "On duty — doesn't count",
                ).forEach { (s, label) ->
                    TextButton(onClick = { onPick(s) }, modifier = Modifier.fillMaxWidth()) {
                        Text((if (s == current) "✓  " else "") + label, modifier = Modifier.fillMaxWidth())
                    }
                }
                if (current != null) {
                    TextButton(onClick = { onPick(null) }, modifier = Modifier.fillMaxWidth()) {
                        Text("Clear mark", color = MaterialTheme.colorScheme.error, modifier = Modifier.fillMaxWidth())
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } },
    )
}
