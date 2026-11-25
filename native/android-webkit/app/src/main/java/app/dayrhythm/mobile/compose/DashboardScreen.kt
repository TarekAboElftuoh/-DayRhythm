package app.dayrhythm.mobile.compose

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import java.util.Locale

@Composable
fun LiveCountdownClock(targetEpochMs: Long, onReachZero: () -> Unit) {
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(targetEpochMs) {
        while (true) {
            nowMs = System.currentTimeMillis()
            if (targetEpochMs > 0L && nowMs >= targetEpochMs) {
                onReachZero()
            }
            delay(1000L)
        }
    }
    val remSec = if (targetEpochMs > nowMs) ((targetEpochMs - nowMs) / 1000L) else 0L
    val h = remSec / 3600L
    val m = (remSec % 3600L) / 60L
    val s = remSec % 60L
    val text = if (h > 0) {
        String.format(Locale.US, "%02d:%02d:%02d", h, m, s)
    } else {
        String.format(Locale.US, "%02d:%02d", m, s)
    }
    val urgent = remSec in 1..300
    Text(
        text = text,
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Bold,
        fontSize = 34.sp,
        color = if (urgent) DrColors.Danger else DrColors.Aquamarine
    )
}

@Composable
fun DashboardScreen(
    state: DayRhythmUiState,
    onAddWater: (Int) -> Unit,
    onToggleMed: (String, String) -> Unit,
    onRefreshGps: () -> Unit,
    onAdvanceNext: () -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(DrColors.AmoledBlack),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // 1. Top Header Bar
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "إيقاع اليوم",
                        style = MaterialTheme.typography.headlineSmall,
                        color = DrColors.TextPrimary
                    )
                    Text(
                        text = "DayRhythm Native AMOLED",
                        style = MaterialTheme.typography.labelSmall,
                        color = DrColors.Aquamarine
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatusPill(
                        text = if (state.wsConnected) "⚡ لحظي" else "💾 SQLite",
                        accent = if (state.wsConnected) DrColors.Emerald else DrColors.TextMuted
                    )
                    if (state.phoneBatteryPct >= 0) {
                        StatusPill(
                            text = (if (state.phoneCharging) "⚡ " else "🔋 ") + "${state.phoneBatteryPct}%",
                            accent = if (state.phoneCharging) DrColors.Emerald else DrColors.TextSecondary
                        )
                    }
                }
            }
        }

        // 2. Hero Countdown Card
        item {
            val next = state.nextSlot
            Surface(
                shape = RoundedCornerShape(22.dp),
                color = DrColors.CardSurface,
                border = BorderStroke(1.dp, DrColors.Aquamarine.copy(alpha = 0.35f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(text = next?.emoji ?: "📅", fontSize = 24.sp)
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Text(
                                    text = next?.nameAr ?: "يوم هادئ",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = DrColors.TextPrimary
                                )
                                Text(
                                    text = next?.time12h ?: "مكتمل",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = DrColors.TextMuted
                                )
                            }
                        }
                        LiveCountdownClock(
                            targetEpochMs = state.nextTargetEpochMs,
                            onReachZero = onAdvanceNext
                        )
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(DrColors.CardElevated)
                            .clickable { onRefreshGps() }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "📍 ${state.cityName}",
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = "تحديث GPS",
                            style = MaterialTheme.typography.labelSmall,
                            color = DrColors.Aquamarine
                        )
                    }
                }
            }
        }

        // 3. Smart Charging Card (visible prominently while charging)
        if (state.phoneCharging && state.phoneBatteryPct >= 0) {
            item {
                val pct = state.phoneBatteryPct
                val limit = state.chargeLimitPct
                val ratio = (pct.toFloat() / limit.coerceAtLeast(1)).coerceIn(0f, 1f)
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = DrColors.CardSurface,
                    border = BorderStroke(1.dp, DrColors.Emerald.copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "⚡ جاري الشحن الذكي",
                                style = MaterialTheme.typography.titleMedium,
                                color = DrColors.Emerald
                            )
                            Text(
                                text = if (pct >= limit) "✓ وصل للحد ($limit%)"
                                else "$pct% → $limit%" + (if (state.chargeEtaMin > 0) " (~${state.chargeEtaMin}د)" else ""),
                                style = MaterialTheme.typography.labelSmall,
                                color = DrColors.Emerald
                            )
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                        LinearProgressIndicator(
                            progress = { ratio },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(6.dp)
                                .clip(CircleShape),
                            color = DrColors.Emerald,
                            trackColor = DrColors.CardElevated
                        )
                    }
                }
            }
        }

        // 4. Astronomical Compass (Prayers + Red-Sun Sunrise + Sunset)
        item {
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = DrColors.CardSurface,
                border = BorderStroke(1.dp, DrColors.CardBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "🧭 البوصلة الفلكية (الصلاة والشروق والغروب)",
                        style = MaterialTheme.typography.titleMedium,
                        color = DrColors.SunGold
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    val rows = state.prayers.chunked(2)
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        rows.forEach { pair ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                pair.forEach { slot ->
                                    val isNext = slot.id == state.nextSlot?.id
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = if (isNext) DrColors.AquamarineDim else DrColors.CardElevated,
                                        border = BorderStroke(
                                            1.dp,
                                            if (isNext) DrColors.Aquamarine else DrColors.CardBorder
                                        ),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 10.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                text = "${slot.emoji} ${slot.nameAr.substringBefore(" (")}",
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = if (isNext) DrColors.Aquamarine else DrColors.TextPrimary,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier.weight(1f)
                                            )
                                            Text(
                                                text = slot.time12h,
                                                style = MaterialTheme.typography.labelSmall,
                                                color = if (isNext) DrColors.Aquamarine else DrColors.TextSecondary
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 5. Hydration Card
        item {
            val target = state.targetCups.coerceAtLeast(1)
            val progress = (state.cupsLogged.toFloat() / target).coerceIn(0f, 1f)
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = DrColors.CardSurface,
                border = BorderStroke(1.dp, DrColors.CardBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "💧 الترطيب اليومي",
                            style = MaterialTheme.typography.titleMedium,
                            color = DrColors.Aquamarine
                        )
                        Text(
                            text = "${state.cupsLogged} / $target كوب",
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = DrColors.TextPrimary
                        )
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(CircleShape),
                        color = DrColors.Aquamarine,
                        trackColor = DrColors.CardElevated
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = { onAddWater(1) },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = DrColors.Aquamarine,
                                contentColor = Color(0xFF002117)
                            ),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("+1 كوب ماء", fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(
                            onClick = { onAddWater(-1) },
                            border = BorderStroke(1.dp, DrColors.CardBorder)
                        ) {
                            Text("-1", color = DrColors.TextSecondary)
                        }
                    }
                }
            }
        }

        // 6. Medications Card
        item {
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = DrColors.CardSurface,
                border = BorderStroke(1.dp, DrColors.RoseAccent.copy(alpha = 0.25f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "💊 الأدوية والمكملات",
                        style = MaterialTheme.typography.titleMedium,
                        color = DrColors.RoseAccent
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    if (state.medications.isEmpty()) {
                        Text(
                            text = "لا توجد أدوية مجدولة حالياً — أضفها من شات Gemini AI أو حسابك المتزامن.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = DrColors.TextMuted
                        )
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            state.medications.forEach { med ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(DrColors.CardElevated)
                                        .padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = med.name,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = DrColors.TextPrimary
                                    )
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        med.times24.forEach { t24 ->
                                            val taken = med.takenTimesToday.contains(t24)
                                            Surface(
                                                shape = RoundedCornerShape(8.dp),
                                                color = if (taken) DrColors.EmeraldDim else DrColors.RoseDim,
                                                border = BorderStroke(
                                                    1.dp,
                                                    if (taken) DrColors.Emerald else DrColors.RoseAccent
                                                ),
                                                modifier = Modifier.clickable { onToggleMed(med.id, t24) }
                                            ) {
                                                Text(
                                                    text = (if (taken) "✓ " else "") + t24,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = if (taken) DrColors.Emerald else DrColors.RoseAccent,
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusPill(text: String, accent: Color) {
    Surface(
        shape = CircleShape,
        color = DrColors.CardSurface,
        border = BorderStroke(1.dp, accent.copy(alpha = 0.45f))
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = accent,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
        )
    }
}
