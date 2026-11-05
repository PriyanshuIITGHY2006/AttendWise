package app.attendwise.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.attendwise.R
import app.attendwise.data.AppRepository
import app.attendwise.data.db.CourseEntity
import app.attendwise.data.db.SemesterEntity
import app.attendwise.data.db.SlotEntity
import app.attendwise.data.kindOf
import app.attendwise.data.termOf
import app.attendwise.data.toDomain
import app.attendwise.data.toSec
import app.attendwise.data.toTime
import app.attendwise.data.wire
import app.attendwise.domain.model.Course
import app.attendwise.domain.model.SlotKind
import app.attendwise.domain.model.Term
import app.attendwise.domain.model.TimetableSlot
import app.attendwise.domain.schedule.TimetableEdits
import app.attendwise.domain.validation.Validation
import app.attendwise.domain.validation.findClashes
import app.attendwise.ui.AppViewModel
import app.attendwise.ui.components.AppIcon
import app.attendwise.ui.components.TimeField
import app.attendwise.ui.theme.CoursePalette
import app.attendwise.ui.theme.LocalStatusColors
import app.attendwise.ui.theme.courseColor
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime

private data class SlotDraft(
    val key: Int,
    val original: SlotEntity?,
    val day: Int,
    val start: LocalTime,
    val end: LocalTime,
    val room: String,
    val kind: SlotKind,
) {
    fun differsFrom(o: SlotEntity) =
        o.dayOfWeek != day || o.startSec != start.toSec() || o.endSec != end.toSec() || (o.room ?: "") != room.trim() || kindOf(o.kind) != kind
}

private val dayNames = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

/**
 * Add or edit a course with its weekly timetable. When editing a course in a
 * semester that has started, changes apply from today by default, so earlier
 * classes and their marks stay exactly as they were.
 */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun CourseEditor(vm: AppViewModel, semester: SemesterEntity, existingCount: Int, courseId: String?, onDone: () -> Unit, onCancel: () -> Unit) {
    val today = LocalDate.now()
    var loaded by remember { mutableStateOf(courseId == null) }
    var original by remember { mutableStateOf<CourseEntity?>(null) }
    var code by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var color by remember { mutableStateOf(CoursePalette[existingCount % CoursePalette.size]) }
    var threshold by remember { mutableStateOf(75) }
    var customThreshold by remember { mutableStateOf("") }
    var term by remember { mutableStateOf(Term.FULL) }
    var strict by remember { mutableStateOf(false) }
    val drafts = remember { mutableStateListOf<SlotDraft>() }
    val originals = remember { mutableStateListOf<SlotEntity>() }
    var nextKey by remember { mutableStateOf(0) }
    var fromToday by remember { mutableStateOf(true) }

    LaunchedEffect(courseId) {
        if (courseId != null) {
            vm.course(courseId)?.let { c ->
                original = c; code = c.code; name = c.name; color = c.color; threshold = c.thresholdPercent
                term = termOf(c.term); strict = c.strictNoSkip
            }
            val current = vm.slotsFor(courseId).filter { it.validToDay == null || it.validToDay >= today.toEpochDay() }
            originals.clear(); originals.addAll(current)
            drafts.clear()
            current.sortedWith(compareBy({ it.dayOfWeek }, { it.startSec })).forEach {
                drafts += SlotDraft(nextKey++, it, it.dayOfWeek, it.startSec.toTime(), it.endSec.toTime(), it.room ?: "", kindOf(it.kind))
            }
            loaded = true
        }
    }
    if (!loaded) return

    val semesterStarted = today.toEpochDay() > semester.startDay
    val editingExisting = original != null
    val keepHistory = editingExisting && semesterStarted && fromToday

    val courseIssues = Validation.course(Course("x", code, name, threshold, strict, term))
    val slotProblems = drafts.filter { !it.end.isAfter(it.start) }.map { it.key }.toSet()
    val clashes = findClashes(drafts.map { TimetableSlot(it.key.toString(), "c", DayOfWeek.of(it.day), it.start, it.end) })
    val canSave = courseIssues.isEmpty() && slotProblems.isEmpty()
    val status = LocalStatusColors.current

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(
                code, { code = it.take(Validation.MAX_TEXT) }, label = { Text("Code") }, singleLine = true,
                modifier = Modifier.width(120.dp),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            )
            OutlinedTextField(
                name, { name = it.take(Validation.MAX_TEXT) }, label = { Text("Name") }, singleLine = true,
                modifier = Modifier.weight(1f),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
            )
        }

        Text("Colour", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CoursePalette.forEach { hex ->
                val selected = hex.equals(color, ignoreCase = true)
                Box(
                    Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(courseColor(hex))
                        .then(if (selected) Modifier.border(3.dp, MaterialTheme.colorScheme.onSurface, RoundedCornerShape(12.dp)) else Modifier)
                        .clickable { color = hex }
                        .semantics { contentDescription = "Colour $hex" + if (selected) ", selected" else "" },
                )
            }
        }

        Text("Attendance needed", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        var askCustom by remember { mutableStateOf(false) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(75, 80, 85, 100).forEach { p ->
                FilterChip(selected = threshold == p && customThreshold.isEmpty(), onClick = { threshold = p; customThreshold = "" }, label = { Text("$p%") })
            }
            FilterChip(
                selected = customThreshold.isNotEmpty(), onClick = { askCustom = true },
                label = { Text(if (customThreshold.isNotEmpty()) "Custom, $threshold%" else "Custom", maxLines = 1) },
            )
        }
        if (askCustom) {
            var value by remember { mutableStateOf(customThreshold) }
            val parsed = value.toIntOrNull()?.takeIf { it in 1..100 }
            AlertDialog(
                onDismissRequest = { askCustom = false },
                title = { Text("Attendance needed") },
                text = {
                    OutlinedTextField(
                        value, { v -> value = v.filter { it.isDigit() }.take(3) },
                        label = { Text("Percent") }, suffix = { Text("%") }, singleLine = true,
                        isError = value.isNotEmpty() && parsed == null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                },
                confirmButton = {
                    TextButton(enabled = parsed != null, onClick = { threshold = parsed!!; customThreshold = "$parsed"; askCustom = false }) { Text("Set") }
                },
                dismissButton = { TextButton(onClick = { askCustom = false }) { Text("Cancel") } },
            )
        }

        Text("Runs for", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        val terms = listOf(Term.FULL to "Full sem", Term.PRE_MID to "First half", Term.POST_MID to "Second half")
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            terms.forEachIndexed { i, (t, label) ->
                SegmentedButton(
                    selected = term == t, onClick = { term = t },
                    shape = SegmentedButtonDefaults.itemShape(i, terms.size), icon = {},
                ) { Text(label, maxLines = 1, softWrap = false) }
            }
        }
        if (term != Term.FULL && (semester.midStartDay == null || semester.midEndDay == null)) {
            Text("Add mid-semester exam dates to your semester so half-semester courses split correctly.", color = status.tightFg, style = MaterialTheme.typography.bodySmall)
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Never skip", style = MaterialTheme.typography.bodyLarge)
                Text("Labs and strict profs", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Switch(checked = strict, onCheckedChange = { strict = it })
        }

        Text("Weekly timetable", style = MaterialTheme.typography.titleMedium)
        drafts.forEachIndexed { index, draft ->
            SlotRow(
                draft = draft,
                invalid = draft.key in slotProblems,
                onChange = { drafts[index] = it },
                onRemove = { drafts.removeAt(index) },
            )
        }
        OutlinedButton(onClick = {
            val last = drafts.lastOrNull()
            drafts += SlotDraft(nextKey++, null, last?.day?.let { if (it < 6) it + 1 else 1 } ?: 1, last?.start ?: LocalTime.of(9, 0), last?.end ?: LocalTime.of(9, 55), last?.room ?: "", SlotKind.LECTURE)
        }) {
            AppIcon(R.drawable.ic_add, null, tint = MaterialTheme.colorScheme.primary, size = 18.dp)
            Spacer(Modifier.width(6.dp))
            Text("Add class time")
        }
        if (clashes.isNotEmpty()) Text("Two of these times overlap. Check the timetable.", color = status.tightFg, style = MaterialTheme.typography.bodySmall)

        if (editingExisting && semesterStarted) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Changes apply from today", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        if (fromToday) "Past classes and marks stay as they were." else "The new timetable is used for the whole semester.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = fromToday, onCheckedChange = { fromToday = it })
            }
        }

        if (courseIssues.isNotEmpty()) {
            Text("Add a course code and name.", color = status.riskFg, style = MaterialTheme.typography.bodySmall)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(16.dp)) { Text("Cancel") }
            Button(
                enabled = canSave,
                onClick = {
                    val id = original?.id ?: AppRepository.newId()
                    val entity = (original ?: CourseEntity(id, semester.id, "", "", color, 75, false, "full", false)).copy(
                        code = code.trim(), name = name.trim(), color = color, thresholdPercent = threshold.coerceIn(0, 100),
                        strictNoSkip = strict, term = term.wire(),
                    )
                    val (save, delete) = planSlotChanges(id, drafts, originals, keepHistory, today)
                    vm.saveCourse(entity, save, delete, onDone)
                },
                modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(16.dp),
            ) { Text("Save course", fontWeight = FontWeight.SemiBold) }
        }
    }
}

@Composable
private fun SlotRow(draft: SlotDraft, invalid: Boolean, onChange: (SlotDraft) -> Unit, onRemove: () -> Unit) {
    var dayMenu by remember { mutableStateOf(false) }
    var kindMenu by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(16.dp)
    Column(
        Modifier.fillMaxWidth().clip(shape).background(MaterialTheme.colorScheme.surfaceContainer)
            .border(1.dp, if (invalid) LocalStatusColors.current.riskFg else MaterialTheme.colorScheme.outlineVariant, shape).padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box {
                TextButton(onClick = { dayMenu = true }) { Text(dayNames[draft.day - 1], fontWeight = FontWeight.SemiBold) }
                DropdownMenu(expanded = dayMenu, onDismissRequest = { dayMenu = false }) {
                    dayNames.forEachIndexed { i, n -> DropdownMenuItem(text = { Text(n) }, onClick = { onChange(draft.copy(day = i + 1)); dayMenu = false }) }
                }
            }
            TimeField(draft.start, { t -> onChange(draft.copy(start = t, end = if (!draft.end.isAfter(t)) t.plusMinutes(55) else draft.end)) })
            Text("–")
            TimeField(draft.end, { onChange(draft.copy(end = it)) })
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onRemove) { AppIcon(R.drawable.ic_close, "Remove class time", tint = MaterialTheme.colorScheme.onSurfaceVariant, size = 18.dp) }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(draft.room, { onChange(draft.copy(room = it.take(40))) }, label = { Text("Room") }, singleLine = true, modifier = Modifier.weight(1f))
            Box {
                OutlinedButton(onClick = { kindMenu = true }) { Text(draft.kind.name.lowercase().replaceFirstChar { it.uppercase() }) }
                DropdownMenu(expanded = kindMenu, onDismissRequest = { kindMenu = false }) {
                    SlotKind.entries.forEach { k ->
                        DropdownMenuItem(text = { Text(k.name.lowercase().replaceFirstChar { it.uppercase() }) }, onClick = { onChange(draft.copy(kind = k)); kindMenu = false })
                    }
                }
            }
        }
        if (invalid) Text("End time must be after the start.", color = LocalStatusColors.current.riskFg, style = MaterialTheme.typography.bodySmall)
    }
}

/** Works out which slot rows to save and delete for an edit. */
private fun planSlotChanges(
    courseId: String,
    drafts: List<SlotDraft>,
    originals: List<SlotEntity>,
    keepHistory: Boolean,
    today: LocalDate,
): Pair<List<SlotEntity>, List<String>> {
    val save = mutableListOf<SlotEntity>()
    val delete = mutableListOf<String>()
    fun draftSlot(d: SlotDraft, id: String) = TimetableSlot(id, courseId, DayOfWeek.of(d.day), d.start, d.end, d.room.trim().ifBlank { null }, d.kind)
    fun TimetableSlot.toEntity() = SlotEntity(
        id = id, courseId = courseId, dayOfWeek = dayOfWeek.value, startSec = start.toSec(), endSec = end.toSec(),
        room = room, kind = kind.wire(), validFromDay = validFrom?.toEpochDay(), validToDay = validTo?.toEpochDay(),
    )

    for (d in drafts) {
        val o = d.original
        when {
            o == null -> save += draftSlot(d, AppRepository.newId()).copy(validFrom = if (keepHistory) today else null).toEntity()
            !d.differsFrom(o) -> {}
            keepHistory -> {
                val change = TimetableEdits.change(o.toDomain(), draftSlot(d, o.id), today, AppRepository.newId())
                save += change.updated.map { it.toEntity() } + change.added.map { it.toEntity() }
            }
            else -> save += draftSlot(d, o.id).copy(validFrom = o.validFromDay?.let { LocalDate.ofEpochDay(it) }, validTo = o.validToDay?.let { LocalDate.ofEpochDay(it) }).toEntity()
        }
    }
    val kept = drafts.mapNotNull { it.original?.id }.toSet()
    for (o in originals.filter { it.id !in kept }) {
        if (!keepHistory) {
            delete += o.id
        } else {
            val retired = TimetableEdits.retire(o.toDomain(), today)
            if (retired == null) delete += o.id else save += retired.toEntity()
        }
    }
    return save to delete
}
