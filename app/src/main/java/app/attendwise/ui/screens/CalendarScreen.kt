package app.attendwise.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.attendwise.R
import app.attendwise.data.Derived
import app.attendwise.domain.calendar.DayInfo
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.schedule.ClassOccurrence
import app.attendwise.ui.AppViewModel
import app.attendwise.ui.components.AppIcon
import app.attendwise.ui.components.ClassCard
import app.attendwise.ui.components.DayBanner
import app.attendwise.ui.components.DayFmt
import app.attendwise.ui.components.Dot
import app.attendwise.ui.components.MonthGrid
import app.attendwise.ui.components.Panel
import app.attendwise.ui.components.TimeFmt
import app.attendwise.ui.theme.LocalStatusColors
import java.time.YearMonth
import java.time.format.DateTimeFormatter

private val TitleFmt = DateTimeFormatter.ofPattern("MMMM")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalendarScreen(vm: AppViewModel, d: Derived, padding: PaddingValues) {
    var view by remember { mutableStateOf(vm.prefs.calendarView) }
    Column(Modifier.fillMaxSize().padding(top = padding.calculateTopPadding() + 20.dp)) {
        val options = listOf("week" to "Week", "month" to "Month")
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            options.forEachIndexed { i, (key, label) ->
                SegmentedButton(
                    selected = view == key,
                    onClick = { view = key; vm.prefs.calendarView = key },
                    shape = SegmentedButtonDefaults.itemShape(i, options.size),
                    icon = {},
                ) { Text(label, maxLines = 1, softWrap = false) }
            }
        }
        val bottom = PaddingValues(bottom = padding.calculateBottomPadding())
        if (view == "week") WeekView(vm, d, Modifier.weight(1f).padding(bottom = padding.calculateBottomPadding()))
        else MonthView(vm, d, bottom, Modifier.weight(1f))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MonthView(vm: AppViewModel, d: Derived, padding: PaddingValues, modifier: Modifier = Modifier) {
    val c = LocalStatusColors.current
    var month by remember { mutableStateOf(YearMonth.from(d.now.date)) }
    var selected by remember { mutableStateOf(d.now.date) }
    var editing by remember { mutableStateOf<ClassOccurrence?>(null) }
    val byDate = remember(d) { d.schedule.occurrences.groupBy { it.date } }
    val dayClasses = byDate[selected].orEmpty()

    LazyColumn(
        modifier,
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 12.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(month.format(TitleFmt) + if (month.year != d.now.date.year) " ${month.year}" else "", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
                TextButton(onClick = { month = month.minusMonths(1) }) { AppIcon(R.drawable.ic_back, "Previous month", size = 20.dp) }
                TextButton(onClick = { month = month.plusMonths(1) }) { AppIcon(R.drawable.ic_chevron_right, "Next month", size = 20.dp) }
            }
        }
        item {
            Panel {
                MonthGrid(month, Modifier.padding(10.dp)) { date, mod ->
                    if (date == null) {
                        Spacer(mod.height(50.dp))
                    } else {
                        val info = d.dayInfo(date)
                        val classes = byDate[date].orEmpty()
                        val started = classes.filter { it.hasStarted(d.now) }
                        val missed = started.any { it.mark?.status == MarkStatus.ABSENT }
                        val allPresent = started.isNotEmpty() && started.all { it.mark?.status == MarkStatus.PRESENT || it.mark?.status?.isNeutral == true }
                        val planned = classes.any { d.isPlannedSkip(it) }
                        val unmarked = classes.any { it.mark == null && it.hasEnded(d.now) }
                        val shape = RoundedCornerShape(12.dp)
                        Column(
                            mod.height(50.dp).clip(shape)
                                .background(
                                    when {
                                        date == selected -> MaterialTheme.colorScheme.primaryContainer
                                        info is DayInfo.NoClasses -> c.swapBg
                                        else -> Color.Transparent
                                    },
                                )
                                .then(if (date == d.now.date) Modifier.border(2.dp, MaterialTheme.colorScheme.primary, shape) else Modifier)
                                .clickable { selected = date }
                                .semantics { contentDescription = date.format(DayFmt) },
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Text(
                                "${date.dayOfMonth}",
                                fontWeight = if (date == d.now.date) FontWeight.Bold else FontWeight.Medium,
                                color = if (classes.isEmpty()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.height(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                when {
                                    missed -> Dot(c.riskFg)
                                    allPresent -> Dot(c.present)
                                    unmarked -> Dot(c.tightFg)
                                }
                                if (planned) Dot(c.riskFg, ring = true)
                                if (info is DayInfo.Swapped) Text("⇄", fontSize = 9.sp, color = c.swapFg, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
        item {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(horizontal = 6.dp)) {
                Legend({ Dot(c.present, 8.dp) }, "All present")
                Legend({ Dot(c.riskFg, 8.dp) }, "Missed one")
                Legend({ Dot(c.tightFg, 8.dp) }, "Unmarked")
                Legend({ Dot(c.riskFg, 8.dp, ring = true) }, "Planned skip")
                Legend({ Box(Modifier.width(12.dp).height(8.dp).clip(RoundedCornerShape(3.dp)).background(c.swapBg)) }, "No classes")
                Legend({ Text("⇄", color = c.swapFg, fontSize = 12.sp) }, "Day swap")
            }
        }
        item { DayBanner(d.dayInfo(selected)) }
        item {
            Text(
                (if (selected == d.now.date) "Today, " else "") + selected.format(DateTimeFormatter.ofPattern("EEEE d MMMM")),
                style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 4.dp),
            )
        }
        if (dayClasses.isEmpty()) item { Text("No classes.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 4.dp)) }
        items(dayClasses, key = { "c" + it.key.toString() }) { occ ->
            ClassCard(occ, d, onMark = { vm.mark(occ.key, occ.end, it) }, onMore = { editing = occ })
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
private fun Legend(mark: @Composable () -> Unit, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        mark()
        Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

