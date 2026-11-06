package app.attendwise.ui.components

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.attendwise.domain.time.DayPeriod
import app.attendwise.ui.theme.LocalDarkTheme
import kotlin.math.cos
import kotlin.math.sin

/**
 * The top of the Today screen: a greeting and a small animated scene for the
 * time of day, drawn straight onto the app background with no card behind it.
 */
@Composable
fun TodayHeader(greeting: String, date: String, marked: String, period: DayPeriod, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().heightIn(min = 164.dp)) {
        DayScene(period, Modifier.align(Alignment.TopEnd).offset(x = 6.dp).size(230.dp, 170.dp))
        Column(Modifier.align(Alignment.BottomStart).fillMaxWidth(0.64f).padding(start = 4.dp, top = 40.dp)) {
            Text(marked, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(greeting, style = MaterialTheme.typography.headlineMedium)
            Text(date, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

private class ScenePalette(val dark: Boolean, val ink: Color) {
    val cloudTop = if (dark) Color(0xFFEEF3FF) else Color.White
    val cloudBottom = if (dark) Color(0xFF9DB3E6) else Color(0xFFCFDFFF)
    val moon = if (dark) Color(0xFFF1F5FF) else Color(0xFF5F7BD8)
    val moonGlow = if (dark) Color(0xFFBCD0FF) else Color(0xFF7C95E6)
    val star = if (dark) Color.White else Color(0xFF6B7FD0)
}

/** Looping values for the scene. They are read while drawing, so a frame never recomposes. */
private class SceneClock(
    val spin: State<Float>, val pulse: State<Float>, val drift: State<Float>, val drift2: State<Float>,
    val twinkle: State<Float>, val fly: State<Float>, val shoot: State<Float>, val sink: State<Float>,
    val sway: State<Float>, val bob: State<Float>, val rise: Animatable<Float, AnimationVector1D>,
)

@Composable
private fun rememberSceneClock(period: DayPeriod): SceneClock {
    val context = LocalContext.current
    val animated = remember {
        runCatching { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) != 0f }.getOrDefault(true)
    }
    val t = rememberInfiniteTransition(label = "scene")
    @Composable
    fun loop(ms: Int, mode: RepeatMode, easing: androidx.compose.animation.core.Easing): State<Float> {
        val s = t.animateFloat(0f, 1f, infiniteRepeatable(tween(ms, easing = easing), mode), label = "v$ms")
        return if (animated) s else remember { object : State<Float> { override val value = 0.5f } }
    }
    val clock = SceneClock(
        spin = loop(40000, RepeatMode.Restart, LinearEasing),
        pulse = loop(5000, RepeatMode.Reverse, FastOutSlowInEasing),
        drift = loop(18000, RepeatMode.Reverse, FastOutSlowInEasing),
        drift2 = loop(24000, RepeatMode.Reverse, FastOutSlowInEasing),
        twinkle = loop(3200, RepeatMode.Restart, LinearEasing),
        fly = loop(10000, RepeatMode.Restart, LinearEasing),
        shoot = loop(8000, RepeatMode.Restart, LinearEasing),
        sink = loop(14000, RepeatMode.Reverse, FastOutSlowInEasing),
        sway = loop(9000, RepeatMode.Reverse, FastOutSlowInEasing),
        bob = loop(6000, RepeatMode.Reverse, FastOutSlowInEasing),
        rise = remember { Animatable(if (animated) 0f else 1f) },
    )
    LaunchedEffect(period) {
        if (animated) {
            clock.rise.snapTo(0f)
            clock.rise.animateTo(1f, tween(3500, easing = FastOutSlowInEasing))
        }
    }
    return clock
}

@Composable
private fun DayScene(period: DayPeriod, modifier: Modifier = Modifier) {
    val clock = rememberSceneClock(period)
    val palette = ScenePalette(LocalDarkTheme.current, MaterialTheme.colorScheme.onBackground)
    Canvas(modifier) {
        // Everything below is drawn on a 230 by 170 grid, then scaled to the box.
        scale(size.width / 230f, pivot = Offset.Zero) {
            when (period) {
                DayPeriod.MORNING -> morning(clock, palette)
                DayPeriod.AFTERNOON -> afternoon(clock, palette)
                DayPeriod.EVENING -> evening(clock, palette)
                DayPeriod.NIGHT -> night(clock, palette)
            }
        }
    }
}

private val SunCentre = Offset(150f, 62f)
private val Gold = Color(0xFFFFC24D)

private fun lerp(a: Float, b: Float, f: Float) = a + (b - a) * f

private fun DrawScope.glow(center: Offset, radius: Float, color: Color, strength: Float) {
    drawCircle(
        Brush.radialGradient(listOf(color.copy(alpha = strength), color.copy(alpha = 0f)), center, radius),
        radius, center,
    )
}

private fun DrawScope.sunDisc(center: Offset, radius: Float, colors: List<Color>) {
    drawCircle(
        Brush.radialGradient(colors, Offset(center.x - radius * 0.24f, center.y - radius * 0.3f), radius * 1.6f),
        radius, center,
    )
}

private fun DrawScope.cloud(x: Float, y: Float, size: Float, p: ScenePalette, alpha: Float = 1f) {
    translate(x, y) {
        scale(size, pivot = Offset.Zero) {
            val brush = Brush.verticalGradient(
                listOf(p.cloudTop.copy(alpha = alpha), p.cloudBottom.copy(alpha = alpha)), startY = 4f, endY = 36f,
            )
            drawCircle(brush, 11f, Offset(17f, 23f))
            drawCircle(brush, 15f, Offset(33f, 16f))
            drawCircle(brush, 12f, Offset(51f, 22f))
            drawCircle(brush, 8f, Offset(64f, 26f))
            drawRoundRect(brush, Offset(6f, 24f), Size(66f, 12f), CornerRadius(6f))
        }
    }
}

private val BirdPath = Path().apply {
    moveTo(0f, 0f); quadraticTo(5f, -7f, 10f, 0f); quadraticTo(15f, -7f, 20f, 0f)
}

private fun DrawScope.birds(fly: Float, ink: Color, count: Int, baseX: Float, baseY: Float) {
    for (i in 0 until count) {
        val f = (fly + i * 0.34f) % 1f
        val fade = minOf(1f, minOf(f / 0.15f, (1f - f) / 0.15f))
        val s = 1f - i * 0.18f
        translate(baseX + lerp(46f, -96f, f) + i * 14f, baseY + lerp(10f, -16f, f) + i * 8f) {
            scale(s, pivot = Offset.Zero) {
                drawPath(BirdPath, ink.copy(alpha = fade), style = Stroke(1.8f / s, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }
    }
}

private val SparklePath = Path().apply {
    moveTo(0f, -4f); lineTo(1f, -1f); lineTo(4f, 0f); lineTo(1f, 1f); lineTo(0f, 4f); lineTo(-1f, 1f); lineTo(-4f, 0f); lineTo(-1f, -1f); close()
}

private fun DrawScope.sparkle(x: Float, y: Float, size: Float, color: Color, twinkle: Float, phase: Float) {
    val q = (twinkle + phase) % 1f
    val alpha = 1f - 0.8f * (if (q < 0.5f) q * 2f else (1f - q) * 2f)
    translate(x, y) { scale(size, pivot = Offset.Zero) { drawPath(SparklePath, color.copy(alpha = alpha)) } }
}

private fun DrawScope.dot(x: Float, y: Float, r: Float, color: Color, twinkle: Float, phase: Float) {
    val q = (twinkle + phase) % 1f
    val alpha = 1f - 0.8f * (if (q < 0.5f) q * 2f else (1f - q) * 2f)
    drawCircle(color.copy(alpha = alpha), r, Offset(x, y))
}

private fun DrawScope.morning(c: SceneClock, p: ScenePalette) {
    val sway = lerp(-2.5f, 2.5f, c.sway.value)
    rotate(sway, SunCentre) {
        val beam = Brush.linearGradient(listOf(Color(0x8CFFE9A8), Color(0x00FFE9A8)), SunCentre, Offset(230f, 62f))
        listOf(
            listOf(Offset(150f, 62f), Offset(230f, 20f), Offset(230f, 44f)),
            listOf(Offset(150f, 62f), Offset(230f, 58f), Offset(230f, 82f)),
            listOf(Offset(150f, 62f), Offset(212f, 110f), Offset(192f, 122f)),
        ).forEach { pts ->
            drawPath(Path().apply { moveTo(pts[0].x, pts[0].y); lineTo(pts[1].x, pts[1].y); lineTo(pts[2].x, pts[2].y); close() }, beam)
        }
    }
    val rise = c.rise.value
    translate(0f, lerp(46f, 0f, rise) + lerp(0f, -3f, c.bob.value)) {
        glow(SunCentre, 58f * (1f + 0.07f * c.pulse.value), Color(0xFFFFD37A), 0.95f * rise)
        drawCircle(Gold.copy(alpha = 0.4f * rise), 33f, SunCentre, style = Stroke(1.4f))
        sunDisc(SunCentre, 23f, listOf(Color(0xFFFFF3BF), Gold, Color(0xFFFF9A3D)).map { it.copy(alpha = rise) })
    }
    cloud(62f + lerp(-12f, 14f, c.drift.value), 44f, 1f, p)
    cloud(180f + lerp(14f, -12f, c.drift2.value), 116f, 0.8f, p, 0.92f)
    cloud(172f + lerp(-12f, 14f, c.drift.value), 8f, 0.55f, p, 0.75f)
    birds(c.fly.value, p.ink, 3, 104f, 26f)
}

private fun DrawScope.afternoon(c: SceneClock, p: ScenePalette) {
    glow(SunCentre, 60f * (1f + 0.07f * c.pulse.value), Color(0xFFFFD37A), 0.95f)
    for (i in 0 until 12) {
        val a = Math.toRadians(30.0 * i + c.spin.value * 360.0)
        val r2 = if (i % 2 == 0) 42f else 37f
        drawLine(
            Color(0xFFFFC83D),
            Offset(SunCentre.x + 31f * cos(a).toFloat(), SunCentre.y + 31f * sin(a).toFloat()),
            Offset(SunCentre.x + r2 * cos(a).toFloat(), SunCentre.y + r2 * sin(a).toFloat()),
            strokeWidth = 3.2f, cap = StrokeCap.Round,
        )
    }
    sunDisc(SunCentre, 24f, listOf(Color(0xFFFFF3BF), Gold, Color(0xFFFF9A3D)))
    drawCircle(Color(0xFFFFE08A).copy(alpha = 0.45f), 3.2f, Offset(118f, 88f))
    drawCircle(Color(0xFFFFE08A).copy(alpha = 0.28f), 5.5f, Offset(100f, 102f))
    drawCircle(Color(0xFFFFE08A).copy(alpha = 0.4f), 2.6f, Offset(84f, 114f))
    cloud(58f + lerp(-12f, 14f, c.drift.value), 88f, 1f, p)
    cloud(150f + lerp(14f, -12f, c.drift2.value), 118f, 0.8f, p, 0.92f)
    cloud(168f + lerp(-12f, 14f, c.drift.value), 6f, 0.62f, p, 0.8f)
}

private fun DrawScope.evening(c: SceneClock, p: ScenePalette) {
    val sink = lerp(-6f, 16f, c.sink.value)
    val sun = Offset(150f, 84f)
    translate(0f, sink) {
        glow(sun, 64f * (1f + 0.07f * c.pulse.value), Color(0xFFFF9A6B), 0.9f)
        sunDisc(sun, 27f, listOf(Color(0xFFFFE0A0), Color(0xFFFF9D5C), Color(0xFFFF6F91)))
    }
    val d1 = lerp(-12f, 14f, c.drift.value)
    val d2 = lerp(14f, -12f, c.drift2.value)
    drawRoundRect(Color(0xFFFF8FA3).copy(alpha = 0.88f), Offset(92f + d1, 92f), Size(124f, 7f), CornerRadius(3.5f))
    drawRoundRect(Color(0xFFC77DFF).copy(alpha = 0.6f), Offset(118f + d1, 104f), Size(96f, 6f), CornerRadius(3f))
    drawRoundRect(Color(0xFFFF9A7A).copy(alpha = 0.55f), Offset(74f + d2, 116f), Size(132f, 5f), CornerRadius(2.5f))
    drawRoundRect(Color(0xFFFFB4A2).copy(alpha = 0.5f), Offset(132f + d2, 126f), Size(80f, 4f), CornerRadius(2f))
    val tw = c.twinkle.value
    sparkle(60f, 24f, 1.5f, p.star, tw, 0f)
    sparkle(108f, 44f, 1f, p.star, tw, 0.3f)
    sparkle(196f, 22f, 1.2f, p.star, tw, 0.6f)
    birds(c.fly.value, p.ink, 1, 76f, 58f)
}

private fun DrawScope.night(c: SceneClock, p: ScenePalette) {
    glow(SunCentre, 54f * (1f + 0.07f * c.pulse.value), p.moonGlow, 0.6f)
    translate(0f, lerp(0f, -3f, c.bob.value)) {
        val crescent = Path.combine(
            PathOperation.Difference,
            Path().apply { addOval(Rect(SunCentre, 24f)) },
            Path().apply { addOval(Rect(Offset(161f, 54f), 21f)) },
        )
        drawPath(crescent, p.moon)
        drawCircle(Color(0xFFC9D6F5).copy(alpha = 0.6f), 2.2f, Offset(132f, 70f))
        drawCircle(Color(0xFFC9D6F5).copy(alpha = 0.6f), 1.5f, Offset(139f, 56f))
    }
    val tw = c.twinkle.value
    sparkle(72f, 28f, 1.6f, p.star, tw, 0f)
    sparkle(196f, 30f, 1.2f, p.star, tw, 0.25f)
    sparkle(206f, 78f, 1f, p.star, tw, 0.5f)
    sparkle(52f, 64f, 1f, p.star, tw, 0.75f)
    dot(104f, 74f, 1.2f, p.star, tw, 0.15f)
    dot(206f, 96f, 1.2f, p.star, tw, 0.4f)
    dot(40f, 80f, 1.1f, p.star, tw, 0.65f)
    dot(170f, 120f, 1.2f, p.star, tw, 0.9f)
    dot(120f, 20f, 1.2f, p.star, tw, 0.05f)
    val wisp = lerp(-12f, 14f, c.drift2.value)
    drawRoundRect(p.moonGlow.copy(alpha = 0.22f), Offset(40f + wisp, 132f), Size(110f, 5f), CornerRadius(2.5f))
    drawRoundRect(p.moonGlow.copy(alpha = 0.22f), Offset(70f + wisp, 142f), Size(90f, 4f), CornerRadius(2f))
    // A shooting star crosses for a moment every eight seconds.
    val q = c.shoot.value
    if (q in 0.25f..0.37f) {
        val u = (q - 0.25f) / 0.12f
        val head = Offset(176f - 30f * u, 46f + 22f * u)
        val tail = Offset(head.x + 36f, head.y - 24f)
        drawLine(
            Brush.linearGradient(listOf(p.star.copy(alpha = 0f), p.star.copy(alpha = 1f - u)), tail, head),
            tail, head, strokeWidth = 2f, cap = StrokeCap.Round,
        )
    }
}
