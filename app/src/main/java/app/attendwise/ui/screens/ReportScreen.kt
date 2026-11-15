package app.attendwise.ui.screens

import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.attendwise.R
import app.attendwise.data.Derived
import app.attendwise.data.PickedImage
import app.attendwise.data.prepareReportImage
import app.attendwise.data.remote.ReportDraft
import app.attendwise.data.remote.ReportFile
import app.attendwise.data.remote.sendReport
import app.attendwise.ui.AppViewModel
import app.attendwise.ui.components.AppIcon
import app.attendwise.ui.components.Panel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.Locale

private const val MAX_FILES = 5
private const val MAX_MESSAGE = 4000
private const val MIN_MESSAGE = 10

private data class Kind(val id: String, val title: String, val hint: String, val icon: Int)
private data class Area(val id: String?, val label: String, val hint: String, val icon: Int)

private val KINDS = listOf(
    Kind("bug", "Something is wrong", "A bug, a wrong number, a crash", R.drawable.ic_alert),
    Kind("idea", "I have an idea", "A feature or a change you would like", R.drawable.ic_trend_up),
    Kind("other", "Something else", "Anything that fits nowhere else", R.drawable.ic_edit),
)

private val AREAS = listOf(
    Area(null, "Not sure", "Skip this, I will explain below", R.drawable.ic_close),
    Area("today", "Today", "Home screen and class cards", R.drawable.ic_today),
    Area("courses", "Courses", "Course list, details and editing", R.drawable.ic_courses),
    Area("plan", "Plan", "Skip planner and what-ifs", R.drawable.ic_plan),
    Area("calendar", "Calendar", "Week and month views", R.drawable.ic_calendar),
    Area("profile", "Profile", "Streaks, badges and avatar", R.drawable.ic_profile),
    Area("sign_in", "Sign in", "Login, account and sync", R.drawable.ic_lock),
    Area("widgets", "Widgets", "Home screen widgets", R.drawable.ic_sync),
    Area("notifications", "Notifications", "Reminders", R.drawable.ic_alert),
    Area("other", "Other", "Anything that fits nowhere else", R.drawable.ic_edit),
)

/** Report a problem or an idea, with up to five optional screenshots. */
@Composable
fun ReportScreen(vm: AppViewModel, d: Derived, padding: PaddingValues, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val theme by vm.theme.collectAsState()
    val colors = MaterialTheme.colorScheme
    val session by vm.api.session.collectAsState()
    val name = d.data.profile?.fullName ?: session?.user?.displayName ?: ""
    val email = session?.user?.email ?: ""
    val versionName = remember { runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "" }

    var kind by rememberSaveable { mutableStateOf("bug") }
    var area by rememberSaveable { mutableStateOf<String?>(null) }
    var message by rememberSaveable { mutableStateOf("") }
    var withDevice by rememberSaveable { mutableStateOf(true) }
    val files = remember { mutableStateListOf<PickedImage>() }
    var busy by remember { mutableStateOf(false) }
    var progress by remember { mutableFloatStateOf(0f) }
    var error by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf<String?>(null) }
    var sent by remember { mutableStateOf(false) }
    var areaOpen by remember { mutableStateOf(false) }

    val deviceText = remember(theme) {
        "${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE}, $theme theme, ${Locale.getDefault().toLanguageTag()}"
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(MAX_FILES)) { uris ->
        scope.launch {
            note = null
            val room = MAX_FILES - files.size
            for (uri in uris.take(room)) {
                val img = prepareReportImage(context, uri)
                if (img != null) files.add(img) else note = "One picture could not be added."
            }
            if (uris.size > room) note = "Only $MAX_FILES pictures fit, the rest were left out."
        }
    }

    val length = message.trim().length
    val ready = length in MIN_MESSAGE..MAX_MESSAGE && !busy

    if (sent) {
        Column(
            Modifier.fillMaxWidth().padding(top = padding.calculateTopPadding() + 80.dp, start = 24.dp, end = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(84.dp).clip(CircleShape).background(colors.primaryContainer), contentAlignment = Alignment.Center) {
                AppIcon(R.drawable.ic_check, null, tint = colors.onPrimaryContainer, size = 40.dp)
            }
            Text("Thank you, it reached me.", style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
            Text("I read every report. If I need more detail I will use the email on your account.", color = colors.onSurfaceVariant, textAlign = TextAlign.Center)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 8.dp)) {
                OutlinedButton(onClick = { kind = "bug"; area = null; message = ""; files.clear(); error = null; note = null; sent = false }) { Text("Send another") }
                Button(onClick = onBack) { Text("Done") }
            }
        }
        return
    }

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 20.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) { AppIcon(R.drawable.ic_back, "Back", size = 24.dp) }
                Text("Report a problem or idea", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            }
        }
        item { Text("Tell me what happened or what you would like. Pictures help a lot and are optional.", color = colors.onSurfaceVariant) }

        KINDS.forEach { k ->
            item(key = k.id) {
                val selected = kind == k.id
                val shape = RoundedCornerShape(18.dp)
                Row(
                    Modifier.fillMaxWidth().clip(shape)
                        .background(if (selected) colors.primaryContainer else colors.surfaceContainer)
                        .border(if (selected) BorderStroke(2.dp, colors.primary) else BorderStroke(1.dp, colors.outlineVariant), shape)
                        .clickable { kind = k.id }.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AppIcon(k.icon, null, tint = if (selected) colors.primary else colors.onSurfaceVariant, size = 26.dp)
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text(k.title, fontWeight = FontWeight.SemiBold)
                        Text(k.hint, fontSize = 12.sp, color = colors.onSurfaceVariant)
                    }
                }
            }
        }

        item { Caption("Where (optional)") }
        item {
            val current = AREAS.first { it.id == area }
            Box {
                Panel(onClick = { areaOpen = true }) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(36.dp).clip(RoundedCornerShape(12.dp)).background(colors.primaryContainer), contentAlignment = Alignment.Center) {
                            AppIcon(current.icon, null, tint = colors.primary, size = 20.dp)
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            if (area == null) {
                                Text("Choose where it happened", color = colors.onSurfaceVariant)
                            } else {
                                Text(current.label, fontWeight = FontWeight.SemiBold)
                                Text(current.hint, fontSize = 12.sp, color = colors.onSurfaceVariant)
                            }
                        }
                        AppIcon(R.drawable.ic_chevron_right, null, tint = colors.onSurfaceVariant)
                    }
                }
                DropdownMenu(expanded = areaOpen, onDismissRequest = { areaOpen = false }) {
                    AREAS.forEach { a ->
                        DropdownMenuItem(
                            text = {
                                Column {
                                    Text(a.label, fontWeight = FontWeight.SemiBold)
                                    Text(a.hint, fontSize = 12.sp, color = colors.onSurfaceVariant)
                                }
                            },
                            leadingIcon = { AppIcon(a.icon, null, tint = if (a.id == area) colors.primary else colors.onSurfaceVariant, size = 20.dp) },
                            trailingIcon = { if (a.id == area) AppIcon(R.drawable.ic_check, null, tint = colors.primary, size = 20.dp) },
                            onClick = { area = a.id; areaOpen = false },
                        )
                    }
                }
            }
        }

        item { Caption("Details") }
        item {
            OutlinedTextField(
                message, { message = it.take(MAX_MESSAGE) }, modifier = Modifier.fillMaxWidth(), minLines = 5, maxLines = 12,
                placeholder = { Text(if (kind == "idea") "What would you like to see, and what would it help you do?" else "What did you do, what did you expect, and what happened instead?") },
                supportingText = {
                    Row(Modifier.fillMaxWidth()) {
                        Text(if (length < MIN_MESSAGE) "Write at least $MIN_MESSAGE characters" else "", modifier = Modifier.weight(1f))
                        Text("${message.length} / $MAX_MESSAGE")
                    }
                },
            )
        }

        item { Caption("Screenshots (optional, up to $MAX_FILES)") }
        item {
            Panel {
                if (files.isEmpty()) {
                    Column(
                        Modifier.fillMaxWidth().clickable { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }.padding(vertical = 22.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        AppIcon(R.drawable.ic_add, null, tint = colors.primary, size = 28.dp)
                        Text("Add screenshots", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
                        Text("Choose one or several pictures", fontSize = 12.sp, color = colors.onSurfaceVariant)
                    }
                } else {
                    LazyRow(contentPadding = PaddingValues(10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        itemsIndexed(files) { index, img ->
                            Box(Modifier.size(104.dp).clip(RoundedCornerShape(14.dp)).background(colors.surfaceContainerHigh)) {
                                Image(img.thumb, "Screenshot ${index + 1}", Modifier.size(104.dp), contentScale = ContentScale.Crop)
                                Box(
                                    Modifier.align(Alignment.TopEnd).padding(6.dp).size(28.dp).clip(CircleShape).background(colors.scrim.copy(alpha = 0.7f))
                                        .clickable { files.removeAt(index) },
                                    contentAlignment = Alignment.Center,
                                ) { AppIcon(R.drawable.ic_close, "Remove screenshot ${index + 1}", tint = colors.surface, size = 16.dp) }
                            }
                        }
                        if (files.size < MAX_FILES) {
                            item {
                                Box(
                                    Modifier.size(104.dp).clip(RoundedCornerShape(14.dp)).border(1.5.dp, colors.outline, RoundedCornerShape(14.dp))
                                        .clickable { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                                    contentAlignment = Alignment.Center,
                                ) { AppIcon(R.drawable.ic_add, "Add another picture", tint = colors.primary, size = 26.dp) }
                            }
                        }
                    }
                }
            }
        }
        if (note != null) item { Text(note!!, fontSize = 13.sp, color = colors.tertiary) }

        item {
            Panel {
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Include device details")
                            Text("Helps me reproduce it. Nothing personal beyond what you see below.", fontSize = 12.sp, color = colors.onSurfaceVariant)
                        }
                        Switch(withDevice, { withDevice = it })
                    }
                    if (withDevice) Text(deviceText, fontSize = 12.sp, color = colors.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                }
            }
        }
        item {
            Text(
                "Sent as ${name.ifBlank { "you" }}${if (email.isNotBlank()) ", $email" else ""}. Only the developer can read it.",
                fontSize = 12.sp, color = colors.onSurfaceVariant, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
            )
        }
        if (error != null) item { Text(error!!, color = colors.error) }
        item {
            Button(
                onClick = {
                    scope.launch {
                        busy = true; error = null; progress = 0f
                        val device = if (withDevice) buildJsonObject {
                            put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
                            put("android", Build.VERSION.RELEASE)
                            put("sdk", Build.VERSION.SDK_INT)
                            put("theme", theme)
                            put("language", Locale.getDefault().toLanguageTag())
                        } else null
                        val draft = ReportDraft(kind, area, message, device, versionName, name, email, files.mapIndexed { i, f -> ReportFile("screenshot-${i + 1}.jpg", f.bytes) })
                        val err = vm.api.sendReport(draft) { done, total -> progress = done.toFloat() / total }
                        busy = false
                        if (err == null) sent = true else error = err
                    }
                },
                enabled = ready,
                modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(16.dp),
            ) { Text(if (busy) "Sending…" else "Send report", fontWeight = FontWeight.SemiBold) }
        }
        if (busy) item { LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth()) }
    }
}
