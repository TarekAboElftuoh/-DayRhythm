package app.dayrhythm.mobile.compose

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.dayrhythm.mobile.DayRhythmSyncService
import app.dayrhythm.mobile.MainActivity
import app.dayrhythm.mobile.ReminderAlarmReceiver

class ComposeMainActivity : ComponentActivity() {
    private lateinit var store: DayRhythmComposeStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.BLACK),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.BLACK)
        )

        store = DayRhythmComposeStore(applicationContext)
        DayRhythmSyncService.startServiceCompat(this)
        requestBasicPermissions()

        setContent {
            DayRhythmAmoledTheme {
                val state by store.state.collectAsStateWithLifecycle()
                var tab by rememberSaveable { mutableIntStateOf(0) }

                Scaffold(
                    containerColor = DrColors.AmoledBlack,
                    bottomBar = {
                        NavigationBar(
                            containerColor = DrColors.CardSurface,
                            contentColor = DrColors.TextPrimary
                        ) {
                            NavigationBarItem(
                                selected = tab == 0,
                                onClick = { tab = 0 },
                                icon = { Icon(Icons.Rounded.Home, contentDescription = "الرئيسية") },
                                label = { Text("الرئيسية") },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = DrColors.Aquamarine,
                                    selectedTextColor = DrColors.Aquamarine,
                                    indicatorColor = DrColors.AquamarineDim,
                                    unselectedIconColor = DrColors.TextMuted,
                                    unselectedTextColor = DrColors.TextMuted
                                )
                            )
                            NavigationBarItem(
                                selected = tab == 1,
                                onClick = { tab = 1 },
                                icon = { Icon(Icons.Rounded.AutoAwesome, contentDescription = "Gemini AI") },
                                label = { Text("المساعد الذكي") },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = DrColors.Aquamarine,
                                    selectedTextColor = DrColors.Aquamarine,
                                    indicatorColor = DrColors.AquamarineDim,
                                    unselectedIconColor = DrColors.TextMuted,
                                    unselectedTextColor = DrColors.TextMuted
                                )
                            )
                            NavigationBarItem(
                                selected = tab == 2,
                                onClick = { tab = 2 },
                                icon = { Icon(Icons.Rounded.Settings, contentDescription = "الإعدادات") },
                                label = { Text("الإعدادات") },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = DrColors.Aquamarine,
                                    selectedTextColor = DrColors.Aquamarine,
                                    indicatorColor = DrColors.AquamarineDim,
                                    unselectedIconColor = DrColors.TextMuted,
                                    unselectedTextColor = DrColors.TextMuted
                                )
                            )
                        }
                    }
                ) { innerPadding ->
                    Box(modifier = Modifier.padding(innerPadding)) {
                        when (tab) {
                            0 -> DashboardScreen(
                                state = state,
                                onAddWater = { store.addWaterCup(it) },
                                onToggleMed = { id, t -> store.toggleMedicationDose(id, t) },
                                onRefreshGps = { store.syncGpsFromPhone(force = true) },
                                onAdvanceNext = { store.recomputeSolarAndNext() }
                            )
                            1 -> GeminiChatScreen(
                                state = state,
                                onSend = { store.sendGeminiMessage(it) }
                            )
                            else -> SettingsScreen(
                                state = state,
                                onSetChargeLimit = { store.setChargeLimit(it) },
                                onSetLiveAlerts = { store.setLiveAlertsEnabled(it) },
                                onSaveConfig = { url, uid, key -> store.updateSettingsConfig(url, uid, key) },
                                onSyncGpsNow = { store.syncGpsFromPhone(force = true) },
                                onOpenLegacyWebWorkspace = {
                                    startActivity(Intent(this@ComposeMainActivity, MainActivity::class.java))
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        ReminderAlarmReceiver.stopRinging()
        ReminderAlarmReceiver.cancelAllActiveAlarms(this)
        store.recomputeSolarAndNext()
    }

    override fun onDestroy() {
        store.release()
        super.onDestroy()
    }

    private fun requestBasicPermissions() {
        val needed = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
        if (needed.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toTypedArray(), 2001)
        }
    }
}
