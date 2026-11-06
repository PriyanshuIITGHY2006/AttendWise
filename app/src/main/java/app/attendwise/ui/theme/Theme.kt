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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.attendwise.R
import app.attendwise.domain.attendance.CourseStatus

// Brand colours match the website (site/css/page.css): accent #2463EB, black and #F2F5FB grounds.
private val Light = lightColorScheme(
    primary = Color(0xFF2463EB),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCE7FD),
    onPrimaryContainer = Color(0xFF0E2E7A),
    secondary = Color(0xFF46506A),
    secondaryContainer = Color(0xFFD3E1FC),
    onSecondaryContainer = Color(0xFF0E2E7A),
    background = Color(0xFFEBF1FC),
    onBackground = Color(0xFF0B1020),
    surface = Color(0xFFEBF1FC),
    onSurface = Color(0xFF0B1020),
    surfaceVariant = Color(0xFFE4EAF6),
    onSurfaceVariant = Color(0xFF46506A),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color.White,
    surfaceContainer = Color.White,
    surfaceContainerHigh = Color(0xFFE9EEF9),
    outline = Color(0xFF8C99B8),
    outlineVariant = Color(0xFFCBD5EA),
    error = Color(0xFFB3261E),
)

private val Dark = darkColorScheme(
    primary = Color(0xFF3B74F0),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF16254A),
    onPrimaryContainer = Color(0xFFB4D0FF),
    secondary = Color(0xFFC9D0DF),
    secondaryContainer = Color(0xFF1F3160),
    onSecondaryContainer = Color(0xFFD6E4FF),
    background = Color(0xFF070B16),
    onBackground = Color(0xFFFFFFFF),
    surface = Color(0xFF070B16),
    onSurface = Color(0xFFFFFFFF),
    surfaceVariant = Color(0xFF222C47),
    onSurfaceVariant = Color(0xFFC9D0DF),
    surfaceContainerLowest = Color(0xFF0B1224),
    surfaceContainerLow = Color(0xFF111A2F),
    surfaceContainer = Color(0xFF131C33),
    surfaceContainerHigh = Color(0xFF1B2745),
    outline = Color(0xFF6B7BA3),
    outlineVariant = Color(0xFF2E3B5C),
    error = Color(0xFFFF8A80),
)

/** A still gradient behind every screen, so the app is never flat black or flat white. */
fun backdrop(dark: Boolean): Brush = if (dark) {
    Brush.verticalGradient(listOf(Color(0xFF0F1D44), Color(0xFF0A1226), Color(0xFF070B16)))
} else {
    Brush.verticalGradient(listOf(Color(0xFFD9E6FF), Color(0xFFE8EFFC), Color(0xFFF1F5FC)))
}

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
    neutralFg = Color(0xFF3B4660), neutralBg = Color(0xFFE4EAF6),
    swapFg = Color(0xFF1A4FC7), swapBg = Color(0xFFE3ECFD),
    present = Color(0xFF1E7A46), onPresent = Color.White,
)

private val DarkStatus = StatusColors(
    safeFg = Color(0xFF7EDBA3), safeBg = Color(0xFF0E2A1C),
    tightFg = Color(0xFFFFC37A), tightBg = Color(0xFF2E2110),
    riskFg = Color(0xFFFF9C92), riskBg = Color(0xFF331513),
    neutralFg = Color(0xFFC9D0DF), neutralBg = Color(0xFF222C47),
    swapFg = Color(0xFF9CC0FF), swapBg = Color(0xFF16254A),
    present = Color(0xFF2E9E5E), onPresent = Color(0xFF08140D),
)

val LocalStatusColors = staticCompositionLocalOf { LightStatus }
val LocalDarkTheme = staticCompositionLocalOf { false }

/** Questrial for headings and Hind for text, the same pair as the website. Questrial has one weight, so headings stay Normal. */
private val Questrial = FontFamily(Font(R.font.questrial_regular, FontWeight.Normal))
private val Hind = FontFamily(
    Font(R.font.hind_light, FontWeight.Light),
    Font(R.font.hind_regular, FontWeight.Normal),
    Font(R.font.hind_medium, FontWeight.Medium),
    Font(R.font.hind_semibold, FontWeight.SemiBold),
    Font(R.font.hind_bold, FontWeight.Bold),
)

private val AppTypography = Typography().let { t ->
    fun TextStyle.display() = copy(fontFamily = Questrial, fontWeight = FontWeight.Normal)
    fun TextStyle.text() = copy(fontFamily = Hind)
    t.copy(
        displayLarge = t.displayLarge.display(), displayMedium = t.displayMedium.display(), displaySmall = t.displaySmall.display(),
        headlineLarge = t.headlineLarge.display(),
        headlineMedium = t.headlineMedium.display().copy(fontSize = 28.sp, letterSpacing = (-0.5).sp),
        headlineSmall = t.headlineSmall.display(),
        titleLarge = t.titleLarge.display(),
        titleMedium = t.titleMedium.display().copy(fontSize = 17.sp),
        titleSmall = t.titleSmall.text().copy(fontWeight = FontWeight.SemiBold),
        bodyLarge = t.bodyLarge.text(), bodyMedium = t.bodyMedium.text(), bodySmall = t.bodySmall.text(),
        labelLarge = t.labelLarge.text().copy(fontWeight = FontWeight.SemiBold),
        labelMedium = t.labelMedium.text().copy(fontWeight = FontWeight.Medium),
        labelSmall = t.labelSmall.text().copy(fontWeight = FontWeight.Medium),
    )
}

val CaptionStyle = TextStyle(fontFamily = Hind, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp)

@Composable
fun AttendWiseTheme(themePref: String = "system", dynamic: Boolean = false, content: @Composable () -> Unit) {
    val dark = when (themePref) { "light" -> false; "dark" -> true; else -> isSystemInDarkTheme() }
    val context = LocalContext.current
    val scheme: ColorScheme = when {
        dynamic && Build.VERSION.SDK_INT >= 31 -> if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> Dark
        else -> Light
    }
    androidx.compose.runtime.CompositionLocalProvider(LocalStatusColors provides if (dark) DarkStatus else LightStatus, LocalDarkTheme provides dark) {
        MaterialTheme(colorScheme = scheme, typography = AppTypography, content = content)
    }
}

/** Parses a course colour like "#2463EB". */
fun courseColor(hex: String): Color =
    runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(Color(0xFF2463EB))

val CoursePalette = listOf(
    "#2463EB", "#0F8B8D", "#E8590C", "#C2255C", "#7C3AED", "#2F9E44",
    "#1C7ED6", "#8D6E63", "#D9480F", "#5C7CFA", "#E64980", "#495057",
)
