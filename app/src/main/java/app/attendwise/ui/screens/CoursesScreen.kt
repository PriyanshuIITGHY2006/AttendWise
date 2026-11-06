package app.attendwise.ui.screens

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
import androidx.compose.foundation.background
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.attendwise.R
import app.attendwise.data.Derived
import app.attendwise.domain.attendance.CourseStatus
import app.attendwise.ui.components.AppIcon
import app.attendwise.ui.components.CourseDot
import app.attendwise.ui.components.Panel
import app.attendwise.ui.components.Ring
import app.attendwise.ui.components.StatusText
import app.attendwise.ui.theme.LocalStatusColors

@Composable
fun CoursesScreen(d: Derived, padding: PaddingValues, onOpen: (String) -> Unit, onAdd: () -> Unit) {
    val c = LocalStatusColors.current
    var showArchived by rememberSaveable { mutableStateOf(false) }
    val active = d.data.activeCourses.sortedWith(
        compareBy({ d.stats[it.id]?.status?.let { s -> 2 - s.ordinal } ?: 3 }, { d.stats[it.id]?.currentPercent ?: 100.0 }),
    )
    val archived = d.data.courses.filter { it.archived }

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 20.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text("${active.size} course${if (active.size == 1) "" else "s"} in ${d.data.semester?.name ?: "this semester"}", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Courses", style = MaterialTheme.typography.headlineMedium)
                }
                FilledIconButton(onClick = onAdd, modifier = Modifier.size(48.dp), shape = RoundedCornerShape(16.dp)) {
                    AppIcon(R.drawable.ic_add, "Add course", tint = MaterialTheme.colorScheme.onPrimary)
                }
            }
        }
        item {
            val counts = d.stats.values.groupingBy { it.status }.eachCount()
            val risk = counts[CourseStatus.AT_RISK] ?: 0
            val tight = counts[CourseStatus.TIGHT] ?: 0
            if (active.isNotEmpty()) {
                val (text, color) = when {
                    risk > 0 -> "$risk course${if (risk == 1) " needs" else "s need"} attention" to c.riskFg
                    tight > 0 -> "$tight course${if (tight == 1) " has" else "s have"} no skips left" to c.tightFg
                    else -> "All courses are safe" to c.safeFg
                }
                Text(text, color = color, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 4.dp))
            }
        }
        if (active.isEmpty()) item { InfoCard("No courses yet", "Tap + to add a course and its timetable.") }
        items(active, key = { it.id }) { course ->
            val s = d.stats[course.id]
            Panel(onClick = { onOpen(course.id) }) {
                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Ring(s?.currentPercent, if (s != null) c.ring(s.status) else MaterialTheme.colorScheme.outline, 60.dp, 6.dp) {
                        Text(s?.currentPercentFloor?.let { "$it%" } ?: "—", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            CourseDot(d.data.color(course.id))
                            Text(course.code, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 20.sp)
                        }
                        Text(course.name, fontSize = 13.sp, lineHeight = 18.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        s?.let { StatusText(it) }
                    }
                    AppIcon(R.drawable.ic_chevron_right, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, size = 20.dp)
                }
            }
        }
        if (archived.isNotEmpty()) {
            item {
                TextButton(onClick = { showArchived = !showArchived }) { Text(if (showArchived) "Hide archived (${archived.size})" else "Show archived (${archived.size})") }
            }
            if (showArchived) {
                items(archived, key = { "a" + it.id }) { course ->
                    Panel(onClick = { onOpen(course.id) }) {
                        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            CourseDot(d.data.color(course.id))
                            Spacer(Modifier.width(8.dp))
                            Text("${course.code}  ${course.name}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

