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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.attendwise.R
import app.attendwise.data.Derived
import app.attendwise.domain.gamify.AVATARS
import app.attendwise.domain.gamify.Badge
import app.attendwise.domain.gamify.avatarById
import app.attendwise.domain.model.MarkStatus
import app.attendwise.ui.AppViewModel
import app.attendwise.ui.components.AppIcon
import app.attendwise.ui.components.AvatarImage
import app.attendwise.ui.components.BadgeImage
import app.attendwise.ui.components.Panel
import app.attendwise.ui.theme.LocalStatusColors

/** You: avatar, class streak and badges. Everything you set up lives in [SettingsScreen]. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileScreen(vm: AppViewModel, d: Derived, padding: PaddingValues, onSettings: () -> Unit) {
    val profile = d.data.profile
    val c = LocalStatusColors.current
    val name = profile?.fullName ?: vm.api.session.value?.user?.displayName ?: ""
    val email = vm.api.session.value?.user?.email ?: ""
    val avatar = avatarById(profile?.avatar)
    val unlocked = d.badges.count { it.unlocked }
    val next = d.badges.filterNot { it.unlocked }.maxByOrNull { it.value.toFloat() / it.goal }
    var picking by remember { mutableStateOf(false) }
    var detail by remember { mutableStateOf<Badge?>(null) }

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 20.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            val shape = RoundedCornerShape(28.dp)
            Column(
                Modifier.fillMaxWidth().clip(shape)
                    .background(Brush.verticalGradient(listOf(MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.surfaceContainer)))
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
                    .padding(horizontal = 16.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.clickable { picking = true }, contentAlignment = Alignment.BottomCenter) {
                    AvatarImage(profile?.avatar, name.ifBlank { email }, 104.dp)
                    Text(
                        "Change", color = MaterialTheme.colorScheme.onPrimary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary).padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
                Spacer(Modifier.height(14.dp))
                Text(name.ifBlank { "Add your name" }, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
                Text(
                    if (avatar != null) "${avatar.title}. ${avatar.line}" else "Pick an avatar that fits you.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, textAlign = TextAlign.Center,
                )
                val percent = d.overall.percentFloor
                Text(
                    (if (percent != null) "$percent% attendance" else "No classes marked yet") + "  /  $unlocked of ${d.badges.size} badges",
                    color = MaterialTheme.colorScheme.onPrimaryContainer, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }

        item {
            Panel {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(48.dp).clip(RoundedCornerShape(16.dp)).background(if (d.streak.current > 0) c.tightBg else c.neutralBg),
                            contentAlignment = Alignment.Center,
                        ) {
                            AppIcon(R.drawable.ic_flame, null, tint = if (d.streak.current > 0) c.ring(app.attendwise.domain.attendance.CourseStatus.TIGHT) else c.neutralFg, size = 28.dp)
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.Bottom) {
                                Text("${d.streak.current}", fontSize = 26.sp, fontWeight = FontWeight.Bold)
                                Text(" in a row", fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 2.dp))
                            }
                            Text(
                                if (d.streak.current == 0) "Attend your next class to start one." else "Classes attended without a miss. Cancelled and on-duty classes do not break it.",
                                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("${d.streak.best}", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                            Text("best", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    val recent = d.schedule.occurrences
                        .filter { it.hasStarted(d.now) && (it.mark?.status == MarkStatus.PRESENT || it.mark?.status == MarkStatus.ABSENT) }
                        .takeLast(16)
                    if (recent.isNotEmpty()) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            recent.forEach { o ->
                                val present = o.mark?.status == MarkStatus.PRESENT
                                Box(
                                    Modifier.size(14.dp).clip(RoundedCornerShape(5.dp))
                                        .background(if (present) c.present else c.riskBg)
                                        .then(if (present) Modifier else Modifier.border(1.5.dp, c.riskFg, RoundedCornerShape(5.dp))),
                                )
                            }
                        }
                    }
                }
            }
        }

        item { Caption("Badges, $unlocked of ${d.badges.size}") }
        if (next != null) {
            item {
                Panel(onClick = { detail = next }) {
                    Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            BadgeImage(next.id, locked = true, size = 44.dp)
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text("Next up: ${next.title}", fontWeight = FontWeight.Bold)
                                Text(next.how, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                            Box(Modifier.fillMaxWidth(next.value.toFloat() / next.goal).height(6.dp).clip(RoundedCornerShape(50)).background(MaterialTheme.colorScheme.primary))
                        }
                    }
                }
            }
        }
        d.badges.chunked(3).forEach { row ->
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { b ->
                        Panel(Modifier.weight(1f), onClick = { detail = b }) {
                            Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                BadgeImage(b.id, locked = !b.unlocked, size = 64.dp)
                                Text(b.title, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
                                Text(if (b.unlocked) "Unlocked" else "${b.value} of ${b.goal}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }

        item {
            Panel(onClick = onSettings) {
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Settings", style = MaterialTheme.typography.bodyLarge)
                        Text("Name, semester, voice, notifications, appearance and sign out", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    AppIcon(R.drawable.ic_chevron_right, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }

    if (picking) {
        AlertDialog(
            onDismissRequest = { picking = false },
            title = { Text("Choose your avatar") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    AVATARS.chunked(2).forEach { pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            pair.forEach { a ->
                                val chosen = profile?.avatar == a.id
                                val shape = RoundedCornerShape(18.dp)
                                Column(
                                    Modifier.weight(1f).clip(shape)
                                        .background(if (chosen) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainer)
                                        .border(2.dp, if (chosen) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, shape)
                                        .clickable { vm.saveAvatar(a.id); picking = false }
                                        .padding(horizontal = 6.dp, vertical = 10.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    AvatarImage(a.id, a.title, 64.dp)
                                    Text(a.title, fontSize = 13.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp))
                                    Text(a.line, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                                }
                            }
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { picking = false }) { Text("Close") } },
        )
    }
    detail?.let { b ->
        AlertDialog(
            onDismissRequest = { detail = null },
            title = { Text(b.title) },
            text = {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    BadgeImage(b.id, locked = !b.unlocked, size = 96.dp)
                    Text(b.how, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(if (b.unlocked) "Unlocked" else "Progress ${b.value} of ${b.goal}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            confirmButton = { TextButton(onClick = { detail = null }) { Text("Close") } },
        )
    }
}
