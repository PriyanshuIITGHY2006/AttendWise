package app.attendwise.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.attendwise.R
import app.attendwise.data.Derived
import app.attendwise.domain.calendar.DayInfo
import app.attendwise.domain.model.ClassKey
import app.attendwise.domain.planner.OverallVerdict
import app.attendwise.domain.planner.Planner
import app.attendwise.domain.planner.SkipVerdict
import app.attendwise.ui.AppViewModel
import app.attendwise.ui.components.AppIcon
import app.attendwise.ui.components.CourseDot
import app.attendwise.ui.components.Chip
import app.attendwise.ui.components.DayFmt
import app.attendwise.ui.components.MonthGrid
import app.attendwise.ui.components.Panel
import app.attendwise.ui.theme.LocalStatusColors
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter

private val MonthFmt = DateTimeFormatter.ofPattern("MMMM yyyy")

@Composable
fun PlanScreen(vm: AppViewModel, d: Derived, padding: PaddingValues, preselectToday: Boolean) {
    val c = LocalStatusColors.current
    val today = d.now.date
    var month by remember { mutableStateOf(YearMonth.from(today)) }
    var dates by remember { mutableStateOf(if (preselectToday) setOf(today) else emptySet<LocalDate>()) }
    var selection by remember { mutableStateOf(emptySet<ClassKey>()) }
    var showPlans by remember { mutableStateOf(false) }
    val proposal = remember(dates, d) { Planner.propose(d.data.courses, d.schedule, dates, d.now) }
    LaunchedEffect(dates) { selection = proposal.defaultSelection }
    val outcome = remember(selection, d) { Planner.evaluate(d.data.courses, d.schedule, selection, d.now) }
    val plans = d.data.marks.filter { it.planId != null && !it.key.date.isBefore(today) }.groupBy { it.planId!! }
    val classDays = remember(d) { d.schedule.occurrences.map { it.date }.toSet() }

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 20.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text("Pick days you want off", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Plan", style = MaterialTheme.typography.headlineMedium)
                }
                TextButton(onClick = { showPlans = true }) { Text("My plans (${plans.size})") }
            }
        }
        item {
            Panel {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = { month = month.minusMonths(1) }, enabled = month.isAfter(YearMonth.from(today))) {
                            AppIcon(R.drawable.ic_back, "Previous month", size = 18.dp)
                        }
                        Text(month.format(MonthFmt), fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Text(if (dates.isEmpty()) "Tap days" else "${dates.size} day${if (dates.size == 1) "" else "s"}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TextButton(onClick = { month = month.plusMonths(1) }) { AppIcon(R.drawable.ic_chevron_right, "Next month", size = 18.dp) }
                    }
                    MonthGrid(month) { date, mod ->
                        if (date == null) {
                            Spacer(mod.height(40.dp))
                        } else {
                            val selected = date in dates
                            val past = date.isBefore(today)
                            val info = d.dayInfo(date)
                            val shape = RoundedCornerShape(12.dp)
                            Box(
                                mod.height(40.dp).clip(shape)
                                    .background(
                                        when {
                                            selected -> MaterialTheme.colorScheme.primary
                                            info is DayInfo.NoClasses -> c.swapBg
                                            else -> androidx.compose.ui.graphics.Color.Transparent
                                        },
                                    )
                                    .then(if (date == today) Modifier.border(2.dp, MaterialTheme.colorScheme.primary, shape) else Modifier)
                                    .clickable(enabled = !past) { dates = if (selected) dates - date else dates + date }
                                    .semantics { contentDescription = date.format(DayFmt) + if (selected) ", selected" else "" },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    "${date.dayOfMonth}",
                                    color = when {
                                        selected -> MaterialTheme.colorScheme.onPrimary
                                        past -> MaterialTheme.colorScheme.outline
                                        date !in classDays -> MaterialTheme.colorScheme.onSurfaceVariant
                                        else -> MaterialTheme.colorScheme.onSurface
                                    },
                                    fontWeight = if (selected || date == today) FontWeight.Bold else FontWeight.Medium,
                                )
                            }
                        }
                    }
                }
            }
        }
        if (dates.isNotEmpty()) {
            item {
                val (title, sub, fg, bg) = when (proposal.overall) {
                    OverallVerdict.ALL_SKIPPABLE -> Quad("All clear", "Every class on those days can be skipped.", c.safeFg, c.safeBg)
                    OverallVerdict.PARTLY -> Quad("Mostly doable", "Some classes need you. Ticked ones are safe to skip.", c.tightFg, c.tightBg)
                    OverallVerdict.NONE_SKIPPABLE -> Quad("Not those days", "None of those classes can be skipped safely.", c.riskFg, c.riskBg)
                    OverallVerdict.NOTHING_TO_SKIP -> Quad("No classes", "Nothing to skip on those days.", c.neutralFg, c.neutralBg)
                }
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(bg).padding(14.dp)) {
                    Text(title, color = fg, fontWeight = FontWeight.SemiBold)
                    Text(sub, color = fg, fontSize = 12.sp)
                }
            }
            items(proposal.lines, key = { it.course.id }) { line ->
                val keys = line.candidates.map { it.key }
                val checked = keys.isNotEmpty() && keys.all { it in selection }
                val locked = line.verdict == SkipVerdict.LOCKED
                val after = outcome.after[line.course.id]
                val (label, fg, bg) = when (line.verdict) {
                    SkipVerdict.SAFE -> Triple("Safe", c.safeFg, c.safeBg)
                    SkipVerdict.RISKY -> Triple("Risky", c.tightFg, c.tightBg)
                    SkipVerdict.PARTIAL -> Triple("Only ${line.budget}", c.tightFg, c.tightBg)
                    SkipVerdict.MUST_ATTEND -> Triple("Go", c.riskFg, c.riskBg)
                    SkipVerdict.LOCKED -> Triple("Locked", c.neutralFg, c.neutralBg)
                    SkipVerdict.NOTHING_TO_SKIP -> Triple("—", c.neutralFg, c.neutralBg)
                }
                Panel {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = checked, enabled = !locked,
                            onCheckedChange = { on -> selection = if (on) selection + keys else selection - keys.toSet() },
                        )
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                CourseDot(d.data.color(line.course.id))
                                Text(line.course.code, fontWeight = FontWeight.SemiBold)
                                Text("${line.candidates.size} class${if (line.candidates.size == 1) "" else "es"}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(
                                when {
                                    locked -> "Never-skip course"
                                    checked && after != null && after.overBudget > 0 -> "Over budget by ${after.overBudget}"
                                    checked && after != null -> "${after.safeSkipsLeft} safe skips left after, ending at ${after.projectedIfPlanFollowed?.toInt() ?: 0}%"
                                    line.verdict == SkipVerdict.RISKY -> "Allowed, but you're below ${line.course.thresholdPercent}% now"
                                    line.verdict == SkipVerdict.MUST_ATTEND -> "No skips left" + if (line.before.counts.plannedSkips > 0) ", ${line.before.counts.plannedSkips} already planned" else ""
                                    else -> "${line.budget} safe skips available"
                                },
                                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Chip(label, fg, bg)
                    }
                }
            }
            val count = selection.size
            if (proposal.lines.isNotEmpty()) {
                item {
                    Button(
                        onClick = { vm.applyPlan(selection, allowOverBudget = !outcome.isWithinBudget); dates = emptySet() },
                        enabled = count > 0 && outcome.violations.none { id -> d.data.courses.firstOrNull { it.id == id }?.strictNoSkip == true },
                        modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(16.dp),
                    ) {
                        Text(
                            if (!outcome.isWithinBudget) "Plan $count skips anyway" else "Plan $count skip${if (count == 1) "" else "s"}",
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }

    if (showPlans) {
        AlertDialog(
            onDismissRequest = { showPlans = false },
            title = { Text("My plans") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (plans.isEmpty()) Text("No upcoming plans.")
                    plans.forEach { (planId, marks) ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                val first = marks.minOf { it.key.date }
                                val last = marks.maxOf { it.key.date }
                                Text(if (first == last) first.format(DayFmt) else "${first.format(DayFmt)} – ${last.format(DayFmt)}", fontWeight = FontWeight.SemiBold)
                                Text(marks.map { d.data.code(it.key.courseId) }.distinct().joinToString(", ") + ": ${marks.size} skip${if (marks.size == 1) "" else "s"}", fontSize = 12.sp)
                            }
                            TextButton(onClick = { vm.undoPlan(planId) }) { Text("Remove") }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showPlans = false }) { Text("Close") } },
        )
    }
}

private data class Quad<A, B, C, D>(val a: A, val b: B, val c: C, val d: D)
