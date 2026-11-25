package app.dayrhythm.mobile.compose

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun GeminiChatScreen(
    state: DayRhythmUiState,
    onSend: (String) -> Unit
) {
    var input by remember { mutableStateOf("") }
    val quickPrompts = listOf(
        "رتب يومي حسب الصلاة والشروق والغروب",
        "أفضل وقت للنوم النهاردة إمتى؟",
        "باقي لي كام كوب ماء النهاردة؟"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DrColors.AmoledBlack)
            .padding(16.dp)
    ) {
        Text(
            text = "✨ المساعد الذكي Gemini",
            style = MaterialTheme.typography.headlineSmall,
            color = DrColors.Aquamarine
        )
        Text(
            text = "متصل بالبوصلة الفلكية (${state.cityName})",
            style = MaterialTheme.typography.labelSmall,
            color = DrColors.TextMuted
        )
        Spacer(modifier = Modifier.height(10.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            quickPrompts.forEach { q ->
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = DrColors.CardSurface,
                    border = BorderStroke(1.dp, DrColors.CardBorder),
                    modifier = Modifier.clickable { onSend(q) }
                ) {
                    Text(
                        text = q,
                        style = MaterialTheme.typography.bodyMedium,
                        color = DrColors.Aquamarine,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(state.chatMessages, key = { it.id }) { msg ->
                val isUser = msg.role == "user"
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
                ) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = if (isUser) DrColors.AquamarineDim else DrColors.CardSurface,
                        border = BorderStroke(
                            1.dp,
                            if (isUser) DrColors.Aquamarine.copy(alpha = 0.4f) else DrColors.CardBorder
                        ),
                        modifier = Modifier.widthIn(max = 300.dp)
                    ) {
                        Text(
                            text = msg.text,
                            style = MaterialTheme.typography.bodyMedium,
                            color = DrColors.TextPrimary,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            }
            if (state.geminiSending) {
                item {
                    CircularProgressIndicator(
                        color = DrColors.Aquamarine,
                        modifier = Modifier.padding(8.dp)
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                placeholder = { Text("اكتب لـ Gemini...", color = DrColors.TextMuted) },
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = DrColors.Aquamarine,
                    unfocusedBorderColor = DrColors.CardBorder,
                    focusedTextColor = DrColors.TextPrimary,
                    unfocusedTextColor = DrColors.TextPrimary
                ),
                modifier = Modifier.weight(1f)
            )
            Button(
                onClick = {
                    if (input.isNotBlank()) {
                        onSend(input)
                        input = ""
                    }
                },
                enabled = !state.geminiSending && input.isNotBlank(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = DrColors.Aquamarine,
                    contentColor = Color(0xFF002117)
                )
            ) {
                Text("إرسال", fontSize = 14.sp)
            }
        }
    }
}
