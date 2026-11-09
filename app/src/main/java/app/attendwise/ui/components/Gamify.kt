package app.attendwise.ui.components

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.attendwise.AppPrefs
import app.attendwise.R
import app.attendwise.domain.gamify.Badge
import app.attendwise.domain.gamify.Moment
import app.attendwise.domain.gamify.Seen
import app.attendwise.domain.gamify.avatarById
import app.attendwise.domain.gamify.newMoments

private val AVATAR_RES = mapOf(
    "sleepyhead" to R.drawable.avatar_sleepyhead,
    "latecomer" to R.drawable.avatar_latecomer,
    "front-bencher" to R.drawable.avatar_front_bencher,
    "back-bencher" to R.drawable.avatar_back_bencher,
    "chai-champion" to R.drawable.avatar_chai_champion,
    "night-owl" to R.drawable.avatar_night_owl,
    "last-minute" to R.drawable.avatar_last_minute,
    "strategist" to R.drawable.avatar_strategist,
    "lab-rat" to R.drawable.avatar_lab_rat,
    "comeback-kid" to R.drawable.avatar_comeback_kid,
    "perfect-streak" to R.drawable.avatar_perfect_streak,
    "notes-hoarder" to R.drawable.avatar_notes_hoarder,
)

private val BADGE_RES = mapOf(
    "day-one" to R.drawable.badge_day_one,
    "hot-streak" to R.drawable.badge_hot_streak,
    "unstoppable" to R.drawable.badge_unstoppable,
    "legend" to R.drawable.badge_legend,
    "perfect-week" to R.drawable.badge_perfect_week,
    "early-bird" to R.drawable.badge_early_bird,
    "comeback" to R.drawable.badge_comeback,
    "lab-regular" to R.drawable.badge_lab_regular,
    "full-marks" to R.drawable.badge_full_marks,
)

internal fun initialsOf(text: String): String =
    text.split(' ', '.', '@').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifBlank { "?" }

/** The chosen avatar, or the person's initials until they pick one. */
@Composable
fun AvatarImage(id: String?, name: String, size: Dp, modifier: Modifier = Modifier) {
    val res = id?.let { AVATAR_RES[it] }
    val shape = RoundedCornerShape(size * 0.3f)
    if (res != null) {
        Image(
            painterResource(res), contentDescription = avatarById(id)?.title,
            modifier = modifier.size(size).clip(shape), contentScale = ContentScale.Crop,
        )
    } else {
        Box(modifier.size(size).clip(shape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
            Text(initialsOf(name), color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.35f).sp)
        }
    }
}

private val GREY = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) })

/** A badge medal. Locked ones are grey and faded. */
@Composable
fun BadgeImage(id: String, locked: Boolean, size: Dp, modifier: Modifier = Modifier) {
    val res = BADGE_RES[id] ?: return
    Image(
        painterResource(res), contentDescription = null,
        modifier = modifier.size(size).graphicsLayer { alpha = if (locked) 0.4f else 1f },
        colorFilter = if (locked) GREY else null,
    )
}

private val CONFETTI = listOf(Color(0xFF2463EB), Color(0xFFF5B700), Color(0xFF1E7A46), Color(0xFFE0527A), Color(0xFF8A5CF6), Color(0xFFFF8A3D))

/** One burst of confetti falling from the top, then nothing. */
@Composable
private fun Confetti(modifier: Modifier = Modifier) {
    val t = remember { Animatable(0f) }
    LaunchedEffect(Unit) { t.animateTo(1f, tween(3400, easing = LinearEasing)) }
    Canvas(modifier) {
        val p = t.value
        for (i in 0 until 44) {
            val delay = ((i * 53) % 90) / 100f * 0.3f
            val local = ((p - delay) / 0.7f).coerceIn(0f, 1f)
            if (local <= 0f || local >= 1f) continue
            val x0 = ((i * 37) % 100) / 100f * size.width
            val drift = (((i * 17) % 60) - 30) / 100f * size.width
            val x = x0 + drift * local
            val y = -24f + local * (size.height + 48f)
            val w = 9.dp.toPx()
            val h = 14.dp.toPx()
            rotate(degrees = (240 + (i * 41) % 480) * local, pivot = Offset(x, y)) {
                drawRect(CONFETTI[i % CONFETTI.size], topLeft = Offset(x - w / 2, y - h / 2), size = Size(w, h))
            }
        }
    }
}

/** A slowly turning burst of rays behind the medal. */
@Composable
private fun Rays(modifier: Modifier = Modifier) {
    val turn by rememberInfiniteTransition(label = "rays").animateFloat(
        0f, 360f, infiniteRepeatable(tween(14000, easing = LinearEasing), RepeatMode.Restart), label = "turn",
    )
    Canvas(modifier) {
        val c = Offset(size.width / 2, size.height / 2)
        val r = size.minDimension / 2
        val brush = Brush.radialGradient(listOf(Color(0x73F5B700), Color.Transparent), center = c, radius = r)
        rotate(turn, pivot = c) {
            for (i in 0 until 15) {
                drawArc(brush, startAngle = i * 24f, sweepAngle = 9f, useCenter = true, topLeft = Offset(c.x - r, c.y - r), size = Size(r * 2, r * 2))
            }
        }
    }
}

@Composable
private fun CelebrationDialog(moment: Moment, more: Boolean, onNext: () -> Unit) {
    val context = LocalContext.current
    val calm = remember { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
    val pop = remember { Animatable(0.2f) }
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(moment) {
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        pop.snapTo(0.2f)
        pop.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessLow))
    }
    val (caption, title, line) = when (moment) {
        is Moment.BadgeUnlocked -> Triple("Badge unlocked", moment.badge.title, moment.badge.how)
        is Moment.StreakReached -> Triple("Streak milestone", "${moment.days} classes in a row", "You have not missed one since. Keep it going.")
    }
    Dialog(onDismissRequest = onNext, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            Modifier.fillMaxSize().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onNext),
            contentAlignment = Alignment.Center,
        ) {
            if (!calm) Confetti(Modifier.fillMaxSize())
            Column(
                Modifier.padding(24.dp).fillMaxWidth()
                    .clip(RoundedCornerShape(28.dp)).background(MaterialTheme.colorScheme.surfaceContainer)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = {})
                    .padding(horizontal = 22.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(Modifier.size(180.dp), contentAlignment = Alignment.Center) {
                    if (!calm) Rays(Modifier.fillMaxSize())
                    Box(Modifier.graphicsLayer { scaleX = pop.value; scaleY = pop.value; rotationZ = (1f - pop.value) * -25f }, contentAlignment = Alignment.Center) {
                        when (moment) {
                            is Moment.BadgeUnlocked -> BadgeImage(moment.badge.id, locked = false, size = 132.dp)
                            is Moment.StreakReached -> {
                                AppIcon(R.drawable.ic_flame, null, tint = Color(0xFFC76A00), size = 96.dp)
                                Text("${moment.days}", fontSize = 30.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 26.dp))
                            }
                        }
                    }
                }
                Text(caption.uppercase(), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(title, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
                Text(line, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                Button(onClick = onNext, modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) { Text(if (more) "Next" else "Nice") }
            }
        }
    }
}

/**
 * Shows a celebration when a badge unlocks or the streak reaches a milestone.
 * The first run on a device only records what you already have, so old
 * achievements are not announced. At most four are shown in a row.
 */
@Composable
fun CelebrationHost(userId: String?, badges: List<Badge>, bestStreak: Int, prefs: AppPrefs) {
    var queue by remember { mutableStateOf(emptyList<Moment>()) }
    LaunchedEffect(userId, badges, bestStreak) {
        if (userId == null) return@LaunchedEffect
        val stored = prefs.seenBadges(userId)
        val seen = stored?.let { Seen(it, prefs.seenStreak(userId)) }
        val result = newMoments(seen, badges, bestStreak)
        prefs.saveSeen(userId, result.next.badges, result.next.streak)
        if (result.moments.isNotEmpty()) queue = queue + result.moments.take(4)
    }
    val current = queue.firstOrNull() ?: return
    CelebrationDialog(current, more = queue.size > 1, onNext = { queue = queue.drop(1) })
}
