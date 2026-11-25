package app.dayrhythm.mobile.compose

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object DrColors {
    val AmoledBlack = Color(0xFF000000)
    val CardSurface = Color(0xFF0D0D0D)
    val CardElevated = Color(0xFF141414)
    val CardBorder = Color(0xFF1F1F1F)
    val Aquamarine = Color(0xFF7FFFD4)
    val AquamarineDim = Color(0x227FFFD4)
    val RoseAccent = Color(0xFFFB7185)
    val RoseDim = Color(0x22FB7185)
    val SunGold = Color(0xFFFBBF24)
    val SunGoldDim = Color(0x22FBBF24)
    val Emerald = Color(0xFF4ADE80)
    val EmeraldDim = Color(0x224ADE80)
    val Danger = Color(0xFFFF6B6B)
    val TextPrimary = Color(0xFFF8FAFC)
    val TextSecondary = Color(0xFFCBD5E1)
    val TextMuted = Color(0xFF64748B)
}

private val AmoledColorScheme = darkColorScheme(
    primary = DrColors.Aquamarine,
    onPrimary = Color(0xFF002117),
    secondary = DrColors.RoseAccent,
    tertiary = DrColors.SunGold,
    background = DrColors.AmoledBlack,
    onBackground = DrColors.TextPrimary,
    surface = DrColors.CardSurface,
    onSurface = DrColors.TextPrimary,
    surfaceVariant = DrColors.CardElevated,
    onSurfaceVariant = DrColors.TextSecondary,
    outline = DrColors.CardBorder,
    error = DrColors.Danger
)

private val DrTypography = Typography(
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 26.sp,
        color = DrColors.TextPrimary
    ),
    headlineSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 18.sp,
        color = DrColors.TextPrimary
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        color = DrColors.TextPrimary
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 13.5.sp,
        color = DrColors.TextSecondary
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        fontFeatureSettings = "tnum",
        color = DrColors.TextMuted
    )
)

private val DrShapes = Shapes(
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp)
)

@Composable
fun DayRhythmAmoledTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        MaterialTheme(
            colorScheme = AmoledColorScheme,
            typography = DrTypography,
            shapes = DrShapes,
            content = content
        )
    }
}
