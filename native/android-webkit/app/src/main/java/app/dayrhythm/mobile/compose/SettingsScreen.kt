package app.dayrhythm.mobile.compose

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

@Composable
fun SettingsScreen(
    state: DayRhythmUiState,
    onSetChargeLimit: (Int) -> Unit,
    onSetLiveAlerts: (Boolean) -> Unit,
    onSaveConfig: (brokerUrl: String, uid: String, geminiKey: String) -> Unit,
    onSyncGpsNow: () -> Unit,
    onOpenLegacyWebWorkspace: () -> Unit
) {
    var brokerInput by remember(state.brokerUrl) { mutableStateOf(state.brokerUrl) }
    var uidInput by remember(state.uid) { mutableStateOf(state.uid) }
    var geminiKeyInput by remember(state.geminiApiKey) { mutableStateOf(state.geminiApiKey) }
    var limitSlider by remember(state.chargeLimitPct) { mutableFloatStateOf(state.chargeLimitPct.toFloat()) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(DrColors.AmoledBlack),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Text(
                text = "⚙️ الإعدادات والمحرك الأصلي",
                style = MaterialTheme.typography.headlineSmall,
                color = DrColors.TextPrimary
            )
        }

        // Core Engine Health
        item {
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = DrColors.CardSurface,
                border = BorderStroke(1.dp, DrColors.CardBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("حالة البنية التحتية", style = MaterialTheme.typography.titleMedium, color = DrColors.Aquamarine)
                    Text(
                        text = "• نواة C++20 (JNI): " + if (state.cppCoreLoaded) "متصلة ونشطة ✓" else "وضع Kotlin الاحتياطي",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        text = "• قاعدة البيانات: SQLite WAL المحلي ✓",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        text = "• مزامنة Cloudflare Protobuf: " + if (state.wsConnected) "متصلة لحظياً ✓" else "جاري الاتصال...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (state.wsConnected) DrColors.Emerald else DrColors.SunGold
                    )
                    if (state.statusBanner.isNotBlank()) {
                        Text(
                            text = state.statusBanner,
                            style = MaterialTheme.typography.labelSmall,
                            color = DrColors.Aquamarine
                        )
                    }
                }
            }
        }

        // GPS & Live Alerts Capsule
        item {
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = DrColors.CardSurface,
                border = BorderStroke(1.dp, DrColors.CardBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("كبسولة التنبيهات الحية والشاحن", style = MaterialTheme.typography.titleMedium)
                            Text("عرض العد التنازلي والشحن في كبسولة النظام", style = MaterialTheme.typography.labelSmall)
                        }
                        Switch(
                            checked = state.liveAlertsEnabled,
                            onCheckedChange = onSetLiveAlerts,
                            colors = SwitchDefaults.colors(checkedThumbColor = DrColors.Aquamarine)
                        )
                    }

                    Text(
                        text = "حد إيقاف الشحن: ${limitSlider.roundToInt()}%",
                        style = MaterialTheme.typography.bodyMedium,
                        color = DrColors.Emerald
                    )
                    Slider(
                        value = limitSlider,
                        onValueChange = { limitSlider = it },
                        onValueChangeFinished = { onSetChargeLimit(limitSlider.roundToInt()) },
                        valueRange = 60f..100f,
                        colors = SliderDefaults.colors(
                            thumbColor = DrColors.Emerald,
                            activeTrackColor = DrColors.Emerald
                        )
                    )

                    Button(
                        onClick = onSyncGpsNow,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = DrColors.CardElevated,
                            contentColor = DrColors.Aquamarine
                        ),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("📍 تحديث الموقع الجغرافي (GPS) ومواقيت الشمس")
                    }
                }
            }
        }

        // Cloud Broker & Gemini Key
        item {
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = DrColors.CardSurface,
                border = BorderStroke(1.dp, DrColors.CardBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("ربط السحابة و Gemini AI", style = MaterialTheme.typography.titleMedium, color = DrColors.Aquamarine)
                    val fieldColors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = DrColors.Aquamarine,
                        unfocusedBorderColor = DrColors.CardBorder,
                        focusedTextColor = DrColors.TextPrimary,
                        unfocusedTextColor = DrColors.TextPrimary
                    )
                    OutlinedTextField(
                        value = brokerInput,
                        onValueChange = { brokerInput = it },
                        label = { Text("Cloudflare Worker URL") },
                        singleLine = true,
                        colors = fieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = uidInput,
                        onValueChange = { uidInput = it },
                        label = { Text("Account UID") },
                        singleLine = true,
                        colors = fieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = geminiKeyInput,
                        onValueChange = { geminiKeyInput = it },
                        label = { Text("Gemini API Key") },
                        singleLine = true,
                        colors = fieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(
                        onClick = { onSaveConfig(brokerInput, uidInput, geminiKeyInput) },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = DrColors.Aquamarine,
                            contentColor = Color(0xFF002117)
                        ),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("حفظ وتنشيط الاتصال اللحظي", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Google Workspace / Full OAuth bridge
        item {
            OutlinedButton(
                onClick = onOpenLegacyWebWorkspace,
                border = BorderStroke(1.dp, DrColors.CardBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("فتح لوحة ربط Google Calendar / Drive الكاملة", color = DrColors.TextSecondary)
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
