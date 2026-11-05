package app.attendwise.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.attendwise.domain.attendance.CourseStatus

private val Light = lightColorScheme(
    primary = Color(0xFF4F46E5),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE6E5FC),
    onPrimaryContainer = Color(0xFF231E7A),
    secondary = Color(0xFF565667),
    background = Color(0xFFF6F6FA),
    onBackground = Color(0xFF17171F),
    surface = Color(0xFFF6F6FA),
    onSurface = Color(0xFF17171F),
    surfaceVariant = Color(0xFFECECF3),
    onSurfaceVariant = Color(0xFF565667),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color.White,
    surfaceContainer = Color.White,
    surfaceContainerHigh = Color(0xFFF1F1F7),
    outline = Color(0xFFD4D4E0),
    outlineVariant = Color(0xFFE2E2EC),
    error = Color(0xFFB3261E),
)

private val Dark = darkColorScheme(
    primary = Color(0xFFA5A0FF),
    onPrimary = Color(0xFF16133F),
    primaryContainer = Color(0xFF2D2A63),
    onPrimaryContainer = Color(0xFFDCDAFF),
    secondary = Color(0xFFA6A6B8),
    background = Color(0xFF111117),
    onBackground = Color(0xFFECECF3),
    surface = Color(0xFF111117),
    onSurface = Color(0xFFECECF3),
    surfaceVariant = Color(0xFF26262F),
    onSurfaceVariant = Color(0xFFA6A6B8),
    surfaceContainerLowest = Color(0xFF1B1B23),
    surfaceContainerLow = Color(0xFF1B1B23),
    surfaceContainer = Color(0xFF1B1B23),
    surfaceContainerHigh = Color(0xFF24242E),
    outline = Color(0xFF3A3A48),
    outlineVariant = Color(0xFF2C2C38),
    error = Color(0xFFFF8A80),
)

/** Status colours: always paired with a label, never colour alone. */
@Immutable
data class StatusColors(
    val safeFg: Color, val safeBg: Color,
    val tightFg: Color, val tightBg: Color,
    val riskFg: Color, val riskBg: Color,
    val neutralFg: Color, val neutralBg: Color,
    val swapFg: Color, val swapBg: Color,
    val present: Color, val onPresent: Color,
) {
    fun fg(s: CourseStatus) = when (s) { CourseStatus.SAFE -> safeFg; CourseStatus.TIGHT -> tightFg; CourseStatus.AT_RISK -> riskFg }
    fun bg(s: CourseStatus) = when (s) { CourseStatus.SAFE -> safeBg; CourseStatus.TIGHT -> tightBg; CourseStatus.AT_RISK -> riskBg }
    fun ring(s: CourseStatus) = when (s) { CourseStatus.SAFE -> present; CourseStatus.TIGHT -> Color(0xFFC76A00); CourseStatus.AT_RISK -> Color(0xFFC2261A) }
}

private val LightStatus = StatusColors(
    safeFg = Color(0xFF1E6B3F), safeBg = Color(0xFFE3F4EA),
    tightFg = Color(0xFF7A3E00), tightBg = Color(0xFFFDEFD9),
    riskFg = Color(0xFFA1231B), riskBg = Color(0xFFFBE4E1),
    neutralFg = Color(0xFF3F3F52), neutralBg = Color(0xFFECECF3),
    swapFg = Color(0xFF6B3A00), swapBg = Color(0xFFFFF4E5),
    present = Color(0xFF1E7A46), onPresent = Color.White,
)

private val DarkStatus = StatusColors(
    safeFg = Color(0xFF7EDBA3), safeBg = Color(0xFF163322),
    tightFg = Color(0xFFFFC37A), tightBg = Color(0xFF3A2810),
    riskFg = Color(0xFFFF9C92), riskBg = Color(0xFF3D1714),
    neutralFg = Color(0xFFC9C9D6), neutralBg = Color(0xFF26262F),
    swapFg = Color(0xFFFFD9A8), swapBg = Color(0xFF33240F),
    present = Color(0xFF2E9E5E), onPresent = Color(0xFF08140D),
)

val LocalStatusColors = staticCompositionLocalOf { LightStatus }

private val AppTypography = Typography().let { t ->
    t.copy(
        headlineMedium = t.headlineMedium.copy(fontWeight = FontWeight.Bold, fontSize = 28.sp, letterSpacing = (-0.5).sp),
        titleLarge = t.titleLarge.copy(fontWeight = FontWeight.Bold),
        titleMedium = t.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = t.labelLarge.copy(fontWeight = FontWeight.SemiBold),
    )
}

val CaptionStyle = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp)

@Composable
fun AttendWiseTheme(themePref: String = "system", dynamic: Boolean = false, content: @Composable () -> Unit) {
    val dark = when (themePref) { "light" -> false; "dark" -> true; else -> isSystemInDarkTheme() }
    val context = LocalContext.current
    val scheme: ColorScheme = when {
        dynamic && Build.VERSION.SDK_INT >= 31 -> if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> Dark
        else -> Light
    }
    androidx.compose.runtime.CompositionLocalProvider(LocalStatusColors provides if (dark) DarkStatus else LightStatus) {
        MaterialTheme(colorScheme = scheme, typography = AppTypography, content = content)
    }
}

/** Parses a course colour like "#4F46E5". */
fun courseColor(hex: String): Color =
    runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(Color(0xFF4F46E5))

val CoursePalette = listOf(
    "#4F46E5", "#0F8B8D", "#E8590C", "#C2255C", "#7C3AED", "#2F9E44",
    "#1C7ED6", "#8D6E63", "#D9480F", "#5C7CFA", "#E64980", "#495057",
)
