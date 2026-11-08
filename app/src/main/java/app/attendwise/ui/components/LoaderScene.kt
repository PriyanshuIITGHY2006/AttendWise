package app.attendwise.ui.components

import android.graphics.Paint
import android.provider.Settings
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.lerp as colorLerp
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.lerp
import app.attendwise.graph
import app.attendwise.ui.theme.LocalDarkTheme
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin

private var picked: Int? = null

/** One scene per launch, so it does not change while the app is still loading. */
private fun pickScene(context: android.content.Context): Int {
    picked?.let { return it }
    val prefs = context.graph.prefs
    val next = nextLoader(prefs.loaderScene, LOADER_SCENES, kotlin.random.Random.nextFloat())
    prefs.loaderScene = next
    picked = next
    return next
}

/** Seconds since the scene appeared, advanced every frame. Frozen when animations are turned off in system settings. */
@Composable
private fun rememberSeconds(): State<Float> {
    val context = LocalContext.current
    val animated = remember {
        runCatching { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) != 0f }.getOrDefault(true)
    }
    val seconds = remember { mutableFloatStateOf(if (animated) 0f else 1.5f) }
    LaunchedEffect(animated) {
        if (!animated) return@LaunchedEffect
        val start = withFrameNanos { it }
        while (true) withFrameNanos { seconds.floatValue = (it - start) / 1_000_000_000f }
    }
    return seconds
}

/** A small animated scene for the loading screen, drawn on a Canvas in a 240 by 160 space. */
@Composable
fun LoaderScene(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scene = remember { pickScene(context) }
    val seconds = rememberSeconds()
    val dark = LocalDarkTheme.current
    val colors = MaterialTheme.colorScheme
    val label = remember(colors.onSurfaceVariant) {
        Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 9f; textAlign = Paint.Align.CENTER; color = colors.onSurfaceVariant.toArgb(); isFakeBoldText = true }
    }
    val p = Palette(
        cloud = if (dark) Color(0xFFEEF3FF) else Color.White,
        shade = if (dark) Color(0xFF9DB3E6) else Color(0xFFCFDFFF),
        sea = colors.primary, sea2 = colors.secondaryContainer,
        card = colors.surfaceContainer, chip = colors.primaryContainer, ink = colors.onPrimaryContainer,
        muted = colors.onSurfaceVariant, ok = if (dark) Color(0xFF2E9E5E) else Color(0xFF1E7A46),
        outline = colors.outline,
        label = label,
    )
    Canvas(modifier.width(300.dp).aspectRatio(1.5f).clip(RoundedCornerShape(22.dp))) {
        val t = seconds.value
        scale(size.width / 240f, pivot = Offset.Zero) {
            when (scene) {
                0 -> boat(t, p)
                1 -> streak(t, p)
                2 -> plane(t, p)
                3 -> clock(t, p)
                else -> balloon(t, p)
            }
        }
    }
}

private class Palette(
    val cloud: Color, val shade: Color, val sea: Color, val sea2: Color, val card: Color,
    val chip: Color, val ink: Color, val muted: Color, val ok: Color, val outline: Color, val label: Paint,
)

private fun frac(x: Float): Float = x - floor(x)

/** 0 to 1 and back to 0 once every [period] seconds, smoothly. */
private fun swing(t: Float, period: Float): Float = (1f - cos(2f * PI.toFloat() * t / period)) / 2f

private fun DrawScope.cloud(x: Float, y: Float, size: Float, p: Palette) {
    translate(x, y) {
        scale(size * 0.8f, pivot = Offset.Zero) {
            drawCircle(p.cloud, 11f, Offset(17f, 23f))
            drawCircle(p.cloud, 15f, Offset(33f, 16f))
            drawCircle(p.cloud, 12f, Offset(51f, 22f))
            drawRoundRect(p.cloud, Offset(6f, 24f), Size(60f, 10f), CornerRadius(5f))
            drawRoundRect(p.shade.copy(alpha = 0.7f), Offset(8f, 31f), Size(56f, 3f), CornerRadius(1.5f))
        }
    }
}

/** A cloud drifting left to right once every [dur] seconds, starting [offset] seconds in. */
private fun DrawScope.driftingCloud(t: Float, x: Float, y: Float, size: Float, dur: Float, offset: Float, p: Palette) {
    val dx = -90f + frac((t + offset) / dur) * 360f
    cloud(x + dx, y, size, p)
}

/** A cloud falling top to bottom, for the balloon. */
private fun DrawScope.fallingCloud(t: Float, x: Float, size: Float, dur: Float, offset: Float, p: Palette) {
    val dy = -50f + frac((t + offset) / dur) * 240f
    cloud(x, dy, size, p)
}

private fun DrawScope.wave(t: Float, y0: Float, period: Float, amp: Float, seconds: Float, reverse: Boolean, color: Color) {
    val phase = frac(t / seconds) * period * (if (reverse) -1f else 1f)
    val path = Path()
    var x = 0f
    path.moveTo(0f, y0 - amp * sin(2f * PI.toFloat() * (x + phase) / period))
    while (x < 244f) {
        x += 4f
        path.lineTo(x, y0 - amp * sin(2f * PI.toFloat() * (x + phase) / period))
    }
    path.lineTo(244f, 170f); path.lineTo(0f, 170f); path.close()
    drawPath(path, color)
}

private fun polygon(vararg xy: Float): Path = Path().apply {
    moveTo(xy[0], xy[1])
    for (i in 2 until xy.size step 2) lineTo(xy[i], xy[i + 1])
    close()
}

// 1. Paper boat ---------------------------------------------------------------------------------

private fun DrawScope.boat(t: Float, p: Palette) {
    driftingCloud(t, 20f, 18f, 1f, 30f, 4f, p)
    driftingCloud(t, 150f, 40f, 0.7f, 38f, 14f, p)
    wave(t, 108f, 60f, 7f, 2.6f, false, p.sea2.copy(alpha = 0.9f))
    val u = swing(t, 2.6f)
    translate(120f, 114f) {
        scale(1.25f, pivot = Offset.Zero) {
            translate(0f, 1f - 4f * u) {
                rotate(-3.5f + 7f * u, pivot = Offset(0f, 10f)) {
                    drawPath(polygon(0f, -40f, 24f, -6f, 0f, -6f), p.cloud)
                    drawPath(polygon(0f, -40f, -20f, -6f, 0f, -6f), p.shade)
                    drawPath(polygon(-32f, -4f, 32f, -4f, 22f, 13f, -22f, 13f), p.cloud)
                    drawPath(polygon(-32f, -4f, 0f, -4f, -9f, 13f, -22f, 13f), p.shade)
                    drawLine(p.outline, Offset(0f, -40f), Offset(0f, -6f), strokeWidth = 1.2f, cap = StrokeCap.Round)
                }
            }
        }
    }
    wave(t, 122f, 40f, 5f, 1.7f, true, p.sea.copy(alpha = 0.75f))
}

// 2. Streak -------------------------------------------------------------------------------------

private val FlamePath: Path = PathParser()
    .parsePathString("M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z")
    .toPath()

private const val STREAK_SECONDS = 4.6f

private fun keyed(u: Float, vararg stops: Pair<Float, Float>): Float {
    if (u <= stops.first().first) return stops.first().second
    for (i in 1 until stops.size) {
        val (u1, v1) = stops[i]
        val (u0, v0) = stops[i - 1]
        if (u <= u1) return lerp(v0, v1, (u - u0) / (u1 - u0))
    }
    return stops.last().second
}

private fun DrawScope.streak(t: Float, p: Palette) {
    val u = frac(t / STREAK_SECONDS)
    val grow = keyed(u, 0f to 0.45f, 0.68f to 1.05f, 0.86f to 1f, 0.96f to 0.45f, 1f to 0.45f)
    val flick = swing(t, 1.1f)
    translate(120f, 56f) {
        scale(grow, pivot = Offset(0f, 14f)) {
            rotate(-1.5f + 3f * flick, pivot = Offset(0f, 14f)) {
                scale(2.6f * lerp(1f, 0.97f, flick), 2.6f * lerp(0.96f, 1.04f, flick), pivot = Offset.Zero) {
                    translate(-12f, -12f) {
                        drawPath(FlamePath, Color(0xFFE8870B), alpha = keyed(u, 0f to 0.5f, 0.68f to 1f, 0.96f to 0.5f, 1f to 0.5f), style = Fill)
                        drawPath(FlamePath, Color(0xFFC76A00), style = Stroke(width = 0.8f))
                    }
                }
            }
        }
    }
    val letters = "MTWTFSS"
    for (i in 0 until 7) {
        val x = 36f + i * 28f
        val d = frac((t - i * 0.42f) / STREAK_SECONDS + 1f)
        val fill = keyed(d, 0f to 0f, 0.06f to 1f, 0.84f to 1f, 0.94f to 0f, 1f to 0f)
        val pop = keyed(d, 0f to 0.85f, 0.06f to 1.2f, 0.11f to 1f, 0.84f to 1f, 0.94f to 0.85f, 1f to 0.85f)
        drawCircle(colorLerp(p.chip, p.ok, fill), 10f * pop, Offset(x, 126f))
        drawCircle(p.sea.copy(alpha = 0.35f), 10f * pop, Offset(x, 126f), style = Stroke(width = 1.5f))
        drawIntoCanvas { it.nativeCanvas.drawText(letters[i].toString(), x, 152f, p.label) }
    }
}

// 3. Paper plane --------------------------------------------------------------------------------

private val PlaneRoute: Path = Path().apply {
    moveTo(16f, 124f)
    cubicTo(60f, 52f, 104f, 150f, 146f, 92f)
    cubicTo(188f, 34f, 208f, 38f, 228f, 48f)
}
private val PlaneMeasure: PathMeasure = PathMeasure().apply { setPath(PlaneRoute, false) }

private fun DrawScope.plane(t: Float, p: Palette) {
    driftingCloud(t, 150f, 108f, 0.8f, 36f, 5f, p)
    driftingCloud(t, 14f, 22f, 0.7f, 44f, 20f, p)
    drawPath(
        PlaneRoute, p.ink.copy(alpha = 0.5f),
        style = Stroke(width = 1.6f, cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(1f, 6f), 14f - frac(t / 1.2f) * 14f)),
    )
    val u = frac(t / 4.4f)
    val eased = u * u * (3f - 2f * u)
    val at = PlaneMeasure.length * eased
    val pos = PlaneMeasure.getPosition(at)
    val tan = PlaneMeasure.getTangent(at)
    val alpha = keyed(u, 0f to 0f, 0.08f to 1f, 0.9f to 1f, 1f to 0f)
    translate(pos.x, pos.y) {
        rotate(atan2(tan.y, tan.x) * 180f / PI.toFloat(), pivot = Offset.Zero) {
            scale(1.7f, pivot = Offset.Zero) {
                drawPath(polygon(13f, 0f, -11f, -9f, -6f, 0f, -11f, 9f), p.cloud, alpha = alpha)
                drawPath(polygon(13f, 0f, -6f, 0f, -11f, 9f), p.shade, alpha = alpha)
                drawLine(p.outline.copy(alpha = alpha), Offset(13f, 0f), Offset(-6f, 0f), strokeWidth = 1.2f, cap = StrokeCap.Round)
            }
        }
    }
}

// 4. Class clock --------------------------------------------------------------------------------

private fun DrawScope.clock(t: Float, p: Palette) {
    val c = Offset(120f, 80f)
    drawCircle(p.card, 58f, c)
    drawCircle(p.sea, 58f, c, style = Stroke(width = 3f))
    drawArc(
        p.ok, startAngle = -90f + frac(t / 2.6f) * 360f, sweepAngle = 108f, useCenter = false,
        topLeft = Offset(c.x - 58f, c.y - 58f), size = Size(116f, 116f), style = Stroke(width = 3.5f, cap = StrokeCap.Round),
    )
    for (i in 0 until 12) {
        rotate(i * 30f, pivot = c) {
            drawLine(p.muted, Offset(c.x, c.y - 44f), Offset(c.x, c.y - if (i % 3 == 0) 37f else 40f), strokeWidth = 1.6f, cap = StrokeCap.Round)
        }
    }
    rotate(frac(t / 31.2f) * 360f, pivot = c) { drawLine(p.ink, c, Offset(c.x, c.y - 22f), strokeWidth = 3.4f, cap = StrokeCap.Round) }
    rotate(frac(t / 2.6f) * 360f, pivot = c) { drawLine(p.ink, c, Offset(c.x, c.y - 34f), strokeWidth = 2.4f, cap = StrokeCap.Round) }
    drawCircle(p.sea, 4f, c)
}

// 5. Balloon ------------------------------------------------------------------------------------

private val Envelope: Path = Path().apply {
    moveTo(0f, -50f); cubicTo(34f, -50f, 38f, -12f, 12f, 14f); lineTo(-12f, 14f); cubicTo(-38f, -12f, -34f, -50f, 0f, -50f); close()
}
private val Stripe: Path = Path().apply {
    moveTo(0f, -50f); cubicTo(14f, -40f, 14f, -8f, 6f, 14f); lineTo(-6f, 14f); cubicTo(-14f, -8f, -14f, -40f, 0f, -50f); close()
}

private fun DrawScope.balloon(t: Float, p: Palette) {
    fallingCloud(t, 18f, 1f, 7f, 1f, p)
    fallingCloud(t, 160f, 0.8f, 9f, 5f, p)
    fallingCloud(t, 96f, 0.6f, 11f, 8f, p)
    val u = swing(t, 3.2f)
    translate(120f, 74f) {
        translate(0f, 2f - 6f * u) {
            rotate(-3f + 6f * u, pivot = Offset(0f, 40f)) {
                drawPath(Envelope, p.sea)
                drawPath(Stripe, p.cloud, alpha = 0.85f)
                drawLine(p.ink, Offset(-10f, 14f), Offset(-6f, 30f), strokeWidth = 1.2f)
                drawLine(p.ink, Offset(10f, 14f), Offset(6f, 30f), strokeWidth = 1.2f)
                drawRoundRect(p.shade, Offset(-9f, 30f), Size(18f, 12f), CornerRadius(3f))
                drawRoundRect(p.ink, Offset(-9f, 30f), Size(18f, 12f), CornerRadius(3f), style = Stroke(width = 1f))
            }
        }
    }
}
