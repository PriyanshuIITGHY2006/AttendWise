package app.attendwise.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.attendwise.data.AppRepository
import app.attendwise.data.db.SemesterEntity
import app.attendwise.domain.model.Semester
import app.attendwise.domain.validation.Issue
import app.attendwise.domain.validation.Validation
import app.attendwise.ui.AppViewModel
import app.attendwise.ui.components.CourseDot
import app.attendwise.ui.components.DateField
import app.attendwise.ui.theme.LocalStatusColors
import java.time.LocalDate

@Composable
fun OnboardingScreen(vm: AppViewModel) {
    val derived by vm.derived.collectAsState()
    val data = derived?.data ?: return
    var step by rememberSaveable { mutableStateOf(if (data.semesterEntity != null) 2 else 0) }
    var addingCourse by rememberSaveable { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(3) { i ->
                Box(
                    Modifier.weight(1f).height(4.dp).clip(RoundedCornerShape(2.dp))
                        .background(if (i <= step) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline),
                )
            }
        }
        when (step) {
            0 -> {
                var name by rememberSaveable { mutableStateOf(data.profile?.fullName ?: "") }
                var firstYear by rememberSaveable { mutableStateOf(data.isFirstYearUg) }
                StepTitle("Step 1 of 3", "About you")
                OutlinedTextField(name, { name = it.take(120) }, label = { Text("Your name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                ToggleRow("First-year UG", "Follow the day swaps that apply only to first-year students.", firstYear) { firstYear = it }
                Button(onClick = { vm.saveProfile(name, firstYear, data.humor); step = 1 }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(16.dp)) {
                    Text("Next", fontWeight = FontWeight.SemiBold)
                }
            }
            1 -> {
                StepTitle("Step 2 of 3", "Your semester")
                SemesterForm(existing = data.semesterEntity, onSave = { entity -> vm.saveSemester(entity) { step = 2 } }, saveLabel = "Next")
            }
            else -> {
                val semester = data.semesterEntity
                StepTitle("Step 3 of 3", if (addingCourse) "Add a course" else "Your courses")
                if (semester == null) {
                    step = 1
                } else if (addingCourse) {
                    CourseEditor(vm, semester, data.courses.size, null, onDone = { addingCourse = false }, onCancel = { addingCourse = false })
                } else {
                    CourseChips(data.courses.map { it.code to data.color(it.id) })
                    Text(
                        if (data.courses.isEmpty()) "Add each course with its weekly class times. You can change everything later."
                        else "Add every course you attend. You can edit timetables any time.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedButton(onClick = { addingCourse = true }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(16.dp)) {
                        Text("Add a course")
                    }
                    Button(
                        onClick = { vm.finishOnboarding() }, enabled = data.courses.isNotEmpty(),
                        modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(16.dp),
                    ) { Text("Finish setup", fontWeight = FontWeight.SemiBold) }
                    OutlinedButton(onClick = { step = 1 }, modifier = Modifier.fillMaxWidth()) { Text("Change semester dates") }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CourseChips(items: List<Pair<String, String>>) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items.forEach { (code, color) -> AssistChip(onClick = {}, label = { Text(code) }, leadingIcon = { CourseDot(color) }) }
    }
}

@Composable
fun StepTitle(caption: String, title: String) {
    Column(Modifier.padding(horizontal = 4.dp)) {
        Text(caption, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelLarge)
        Text(title, style = MaterialTheme.typography.headlineMedium)
    }
}

@Composable
fun ToggleRow(title: String, subtitle: String?, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

/** Known semesters, used to pre-fill the form. */
private fun suggestion(today: LocalDate): SemesterEntity? {
    val monsoonEnd = LocalDate.of(2026, 11, 12)
    return if (!today.isAfter(monsoonEnd)) {
        SemesterEntity(
            id = "", name = "Monsoon 2026",
            startDay = LocalDate.of(2026, 7, 23).toEpochDay(), endDay = monsoonEnd.toEpochDay(),
            midStartDay = LocalDate.of(2026, 9, 13).toEpochDay(), midEndDay = LocalDate.of(2026, 9, 20).toEpochDay(),
            isActive = true,
        )
    } else {
        null
    }
}

@Composable
fun SemesterForm(existing: SemesterEntity?, onSave: (SemesterEntity) -> Unit, saveLabel: String = "Save") {
    val today = LocalDate.now()
    val seed = existing ?: suggestion(today)
    var name by remember { mutableStateOf(seed?.name ?: "") }
    var start by remember { mutableStateOf(seed?.startDay?.let(LocalDate::ofEpochDay) ?: today) }
    var end by remember { mutableStateOf(seed?.endDay?.let(LocalDate::ofEpochDay) ?: today.plusWeeks(16)) }
    var hasMid by remember { mutableStateOf(seed?.midStartDay != null) }
    var midStart by remember { mutableStateOf(seed?.midStartDay?.let(LocalDate::ofEpochDay)) }
    var midEnd by remember { mutableStateOf(seed?.midEndDay?.let(LocalDate::ofEpochDay)) }
    val status = LocalStatusColors.current

    val issues = Validation.semester(Semester(name, start, end, if (hasMid) midStart else null, if (hasMid) midEnd else null)) +
        (if (name.isBlank()) setOf(Issue.COURSE_NAME_BLANK) else emptySet())

    OutlinedTextField(name, { name = it.take(80) }, label = { Text("Name, e.g. Winter 2027") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        DateField("Classes start", start, { start = it }, Modifier.weight(1f))
        DateField("Classes end", end, { end = it }, Modifier.weight(1f))
    }
    ToggleRow("Mid-semester exams", "Needed for half-semester courses; no classes those days.", hasMid) { hasMid = it }
    if (hasMid) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            DateField("Exams start", midStart, { midStart = it }, Modifier.weight(1f))
            DateField("Exams end", midEnd, { midEnd = it }, Modifier.weight(1f))
        }
    }
    if (start.isBefore(today)) {
        Text(
            "Already under way? Past classes will show as unmarked. Mark them in bulk from Today, or set the start to today.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    issues.firstOrNull()?.let { issue ->
        Text(
            when (issue) {
                Issue.SEMESTER_ENDS_BEFORE_START -> "The end date must be after the start."
                Issue.MID_SEM_INCOMPLETE -> "Pick both exam dates."
                Issue.MID_SEM_REVERSED -> "Exam end must be after exam start."
                Issue.MID_SEM_OUTSIDE_SEMESTER -> "Exams must fall inside the semester."
                else -> "Give the semester a name."
            },
            color = status.riskFg, style = MaterialTheme.typography.bodySmall,
        )
    }
    Button(
        enabled = issues.isEmpty(),
        onClick = {
            onSave(
                SemesterEntity(
                    id = existing?.id ?: AppRepository.newId(), name = name.trim(),
                    startDay = start.toEpochDay(), endDay = end.toEpochDay(),
                    midStartDay = if (hasMid) midStart?.toEpochDay() else null,
                    midEndDay = if (hasMid) midEnd?.toEpochDay() else null,
                    isActive = true,
                ),
            )
        },
        modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(16.dp),
    ) { Text(saveLabel, fontWeight = FontWeight.SemiBold) }
}
