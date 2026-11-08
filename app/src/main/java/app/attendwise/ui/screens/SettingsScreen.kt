package app.attendwise.ui.screens

import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.attendwise.data.Derived
import app.attendwise.data.UpdateChecker
import app.attendwise.data.toSec
import app.attendwise.data.toTime
import app.attendwise.notify.Copy
import app.attendwise.ui.AppViewModel
import app.attendwise.R
import app.attendwise.ui.components.AppIcon
import app.attendwise.ui.components.AvatarImage
import app.attendwise.ui.components.Panel
import app.attendwise.ui.components.TimeField
import app.attendwise.ui.components.DayFmt
import kotlinx.coroutines.launch
import java.time.LocalTime
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(vm: AppViewModel, d: Derived, padding: PaddingValues, onBack: () -> Unit, onSemester: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val profile = d.data.profile
    val settings = d.data.settings
    val sync by vm.syncState.collectAsState()
    val theme by vm.theme.collectAsState()
    var editingName by remember { mutableStateOf(false) }
    var confirmSignOut by remember { mutableStateOf(false) }
    val name = profile?.fullName ?: vm.api.session.value?.user?.displayName ?: ""
    val email = vm.api.session.value?.user?.email ?: ""
    val versionCode = remember {
        runCatching {
            val info = context.packageManager.getPackageInfo(context.packageName, 0)
            if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
        }.getOrDefault(0L)
    }
    val versionName = remember { runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "" }
    val humor = d.data.humor
    val firstYear = d.data.isFirstYearUg

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 20.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) { AppIcon(R.drawable.ic_back, "Back", size = 24.dp) }
                Text("Settings", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            }
        }

        item { Caption("Account") }
        item {
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 8.dp)) {
                    AvatarImage(profile?.avatar, name.ifBlank { email }, 44.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(name.ifBlank { "Add your name" }, style = MaterialTheme.typography.bodyLarge)
                        Text(email, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    TextButton(onClick = { editingName = true }) { Text("Edit name") }
                }
            }
        }

        item { Caption("Semester") }
        item {
            Panel(onClick = onSemester) {
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    val sem = d.data.semester
                    Text(sem?.name ?: "No semester", style = MaterialTheme.typography.bodyLarge)
                    if (sem != null) Text("${sem.start.format(DayFmt)} – ${sem.end.format(DayFmt)}, ${d.data.activeCourses.size} courses", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        item {
            Panel {
                Box(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                    ToggleRow("First-year UG", "Follow first-year-only day swaps", firstYear) { vm.saveProfile(profile?.fullName, it, humor) }
                }
            }
        }

        item { Caption("Voice") }
        item {
            Panel {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    val voices = listOf("roast" to "Roast", "plain" to "Plain", "kuchupuchu" to "Kuchupuchu")
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        voices.forEachIndexed { i, (key, label) ->
                            SegmentedButton(
                                selected = humor == key,
                                onClick = { vm.saveProfile(profile?.fullName, firstYear, key) },
                                shape = SegmentedButtonDefaults.itemShape(i, voices.size),
                                icon = {},
                            ) { Text(label, maxLines = 1, softWrap = false) }
                        }
                    }
                    Text("“" + Copy.threshold("EE 203", 70, true, humor, "preview") + "”", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        item { Caption("Notifications") }
        item {
            Panel {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                    val s = settings
                    ToggleRow("Mute everything", null, s?.muted ?: false) { v -> vm.saveSettings { it.copy(muted = v) } }
                    if (s?.muted != true) {
                        ToggleRow("Class reminders", "${s?.leadTimeMinutes ?: 10} min before each class", s?.classReminders ?: true) { v -> vm.saveSettings { it.copy(classReminders = v) } }
                        if (s?.classReminders != false) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                listOf(5, 10, 15, 30).forEach { m ->
                                    FilterChip(selected = (s?.leadTimeMinutes ?: 10) == m, onClick = { vm.saveSettings { it.copy(leadTimeMinutes = m) } }, label = { Text("$m min") })
                                }
                            }
                        }
                        ToggleRow("Mark prompts", "Present / Absent buttons right after class", s?.markPrompts ?: true) { v -> vm.saveSettings { it.copy(markPrompts = v) } }
                        ToggleRow("Daily digest", "Unmarked classes, at ${(s?.digestSec ?: 75600).toTime().format(HHmm)}", s?.dailyDigest ?: true) { v -> vm.saveSettings { it.copy(dailyDigest = v) } }
                        if (s?.dailyDigest != false) {
                            TimeField((s?.digestSec ?: 75600).toTime(), { t -> vm.saveSettings { it.copy(digestSec = t.toSec()) } }, label = "Digest at")
                        }
                        ToggleRow("Planned-skip reminders", "The evening before", s?.plannedSkipReminders ?: true) { v -> vm.saveSettings { it.copy(plannedSkipReminders = v) } }
                        val quietOn = s?.quietStartSec != null && s.quietEndSec != null
                        ToggleRow("Quiet hours", if (quietOn) "${s!!.quietStartSec!!.toTime().format(HHmm)} – ${s.quietEndSec!!.toTime().format(HHmm)}" else "Off", quietOn) { v ->
                            vm.saveSettings { if (v) it.copy(quietStartSec = LocalTime.of(23, 0).toSec(), quietEndSec = LocalTime.of(7, 0).toSec()) else it.copy(quietStartSec = null, quietEndSec = null) }
                        }
                        if (quietOn) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 8.dp)) {
                                TimeField(s!!.quietStartSec!!.toTime(), { t -> vm.saveSettings { it.copy(quietStartSec = t.toSec()) } }, label = "From")
                                TimeField(s.quietEndSec!!.toTime(), { t -> vm.saveSettings { it.copy(quietEndSec = t.toSec()) } }, label = "To")
                            }
                        }
                    }
                }
            }
        }

        item { Caption("Appearance") }
        item {
            val options = listOf("system" to "System", "light" to "Light", "dark" to "Dark")
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                options.forEachIndexed { i, (key, label) ->
                    SegmentedButton(selected = theme == key, onClick = { vm.setTheme(key) }, shape = SegmentedButtonDefaults.itemShape(i, options.size), icon = {}) { Text(label, maxLines = 1, softWrap = false) }
                }
            }
        }

        item { Caption("Sync") }
        item {
            Panel {
                Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 8.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text("Sync", style = MaterialTheme.typography.bodyLarge)
                            Text(
                                when {
                                    sync.running -> "Syncing…"
                                    sync.lastError != null -> sync.lastError!!
                                    sync.lastSuccessMillis != null -> "Last synced " + java.time.Instant.ofEpochMilli(sync.lastSuccessMillis!!).atZone(java.time.ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("d MMM, HH:mm"))
                                    else -> "Not synced yet"
                                },
                                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        TextButton(onClick = { vm.syncNow() }, enabled = !sync.running) { Text("Sync now") }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 8.dp)) {
                        Text("Version $versionName", modifier = Modifier.weight(1f), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        val up by vm.update.collectAsState()
                        TextButton(
                            onClick = { vm.checkForUpdate(userAsked = true) },
                            enabled = up is AppViewModel.UpdateState.Idle || up is AppViewModel.UpdateState.Available,
                        ) { Text(if (up is AppViewModel.UpdateState.Checking) "Checking…" else "Check for updates") }
                    }
                    TextButton(onClick = { confirmSignOut = true }, modifier = Modifier.padding(horizontal = 0.dp)) {
                        Text("Sign out", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }

    if (editingName) {
        var value by remember { mutableStateOf(name) }
        AlertDialog(
            onDismissRequest = { editingName = false },
            title = { Text("Your name") },
            text = { OutlinedTextField(value, { value = it.take(120) }, singleLine = true) },
            confirmButton = { TextButton(onClick = { vm.saveProfile(value, firstYear, humor); editingName = false }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { editingName = false }) { Text("Cancel") } },
        )
    }
    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            title = { Text("Sign out?") },
            text = { Text("Changes not yet synced on this phone will be lost. Everything synced stays in your account.") },
            confirmButton = { TextButton(onClick = { confirmSignOut = false; vm.signOut() }) { Text("Sign out", color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { confirmSignOut = false }) { Text("Cancel") } },
        )
    }
}

private val HHmm: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

@Composable
internal fun Caption(text: String) =
    Text(text.uppercase(), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 8.dp, top = 6.dp))
