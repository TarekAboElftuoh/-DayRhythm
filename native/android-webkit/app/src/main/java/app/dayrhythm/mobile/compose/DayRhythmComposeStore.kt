package app.dayrhythm.mobile.compose

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.os.BatteryManager
import app.dayrhythm.mobile.DayRhythmSyncService
import app.dayrhythm.mobile.LocalSqliteStore
import app.dayrhythm.mobile.NativeCore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.TimeUnit

data class MedicationUi(
    val id: String,
    val name: String,
    val times24: List<String>,
    val takenTimesToday: List<String>
)

data class ChatBubbleUi(
    val id: String,
    val role: String, // "user" | "model"
    val text: String,
    val timestampMs: Long
)

data class DayRhythmUiState(
    val uid: String = "BLzoZhXVNXQv8nQEvaQItWDqDmJ2",
    val brokerUrl: String = "https://dayrhythm-spirc-broker.tarek13us.workers.dev",
    val wsConnected: Boolean = false,
    val cppCoreLoaded: Boolean = false,
    val cityName: String = "القاهرة · مصر",
    val lat: Double = 30.0444,
    val lng: Double = 31.2357,
    val timeZoneId: String = "Africa/Cairo",
    val cupsLogged: Int = 0,
    val targetCups: Int = 13,
    val dailyCommitmentDays: Int = 0,
    val waterTargetDays: Int = 0,
    val quietMode: String = "normal",
    val liveAlertsEnabled: Boolean = true,
    val phoneBatteryPct: Int = -1,
    val phoneCharging: Boolean = false,
    val chargeLimitPct: Int = 90,
    val chargeEtaMin: Int = -1,
    val prayers: List<PrayerSlot> = emptyList(),
    val nextSlot: PrayerSlot? = null,
    val nextTargetEpochMs: Long = 0L,
    val medications: List<MedicationUi> = emptyList(),
    val chatMessages: List<ChatBubbleUi> = emptyList(),
    val geminiSending: Boolean = false,
    val geminiApiKey: String = "",
    val statusBanner: String = ""
)

class DayRhythmComposeStore(private val appContext: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val sqlite = LocalSqliteStore.getInstance(appContext)
    private val clientId = getOrCreateClientId()

    private val http = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .pingInterval(25, TimeUnit.SECONDS)
        .build()

    private var activeWs: WebSocket? = null
    private var lamportSeq: Long = System.currentTimeMillis()
    private var rawStateJson: JSONObject = JSONObject()
    private var batteryReceiver: BroadcastReceiver? = null

    private val _state = MutableStateFlow(
        DayRhythmUiState(
            uid = resolveSavedUid(),
            brokerUrl = resolveBrokerUrl(),
            cppCoreLoaded = NativeCore.isLoaded(),
            geminiApiKey = resolveGeminiKey()
        )
    )
    val state: StateFlow<DayRhythmUiState> = _state.asStateFlow()

    init {
        hydrateFromSqlite()
        recomputeSolarAndNext()
        registerBatteryMonitor()
        connectSpircWebSocket()
    }

    private fun getOrCreateClientId(): String {
        val sp = appContext.getSharedPreferences("dayrhythm_compose_prefs", Context.MODE_PRIVATE)
        val existing = sp.getString("client_id", null)
        if (!existing.isNullOrBlank()) return existing
        val created = "and_" + UUID.randomUUID().toString().take(8)
        sp.edit().putString("client_id", created).apply()
        return created
    }

    private fun resolveSavedUid(): String {
        val authSp = appContext.getSharedPreferences("DayRhythmAuth", Context.MODE_PRIVATE)
        val rawAuth = authSp.getString("auth_json", null)
        if (!rawAuth.isNullOrBlank()) {
            try {
                val u = JSONObject(rawAuth).optString("uid", "")
                if (u.isNotBlank()) return u
            } catch (_: Exception) {
            }
        }
        val prefs = appContext.getSharedPreferences("dayrhythm_compose_prefs", Context.MODE_PRIVATE)
        return prefs.getString("uid", null)?.takeIf { it.isNotBlank() }
            ?: "BLzoZhXVNXQv8nQEvaQItWDqDmJ2"
    }

    private fun resolveBrokerUrl(): String {
        val prefs = appContext.getSharedPreferences("dayrhythm_compose_prefs", Context.MODE_PRIVATE)
        return prefs.getString("broker_url", null)?.takeIf { it.isNotBlank() }
            ?: "https://dayrhythm-spirc-broker.tarek13us.workers.dev"
    }

    private fun resolveGeminiKey(): String {
        val prefs = appContext.getSharedPreferences("dayrhythm_compose_prefs", Context.MODE_PRIVATE)
        return prefs.getString("gemini_api_key", "") ?: ""
    }

    private fun hydrateFromSqlite() {
        try {
            val allJson = sqlite.loadAllJson()
            val arr = JSONArray(allJson)
            for (i in 0 until arr.length()) {
                val row = arr.getJSONObject(i)
                val id = row.optString("entityId")
                val seq = row.optLong("lamportSeq", 0L)
                if (seq > lamportSeq) lamportSeq = seq
                if (id == "state_v3" && !row.optBoolean("deleted", false)) {
                    val payload = row.optJSONObject("payload") ?: continue
                    applyStatePayload(payload)
                }
            }
        } catch (_: Exception) {
        }
    }

    private fun applyStatePayload(payload: JSONObject) {
        rawStateJson = payload
        val profile = payload.optJSONObject("lifeProfile")
        val appSettings = payload.optJSONObject("appSettings")
        val devSettings = payload.optJSONObject("deviceSettings")

        val lat = profile?.optDouble("currentLat", _state.value.lat)
            ?.takeIf { !it.isNaN() && it != 0.0 } ?: _state.value.lat
        val lng = profile?.optDouble("currentLng", _state.value.lng)
            ?.takeIf { !it.isNaN() && it != 0.0 } ?: _state.value.lng
        val city = profile?.optString("currentCityName", _state.value.cityName)
            ?.takeIf { it.isNotBlank() } ?: _state.value.cityName
        val tz = profile?.optString("currentTimeZone", _state.value.timeZoneId)
            ?.takeIf { it.isNotBlank() } ?: _state.value.timeZoneId

        val medsList = mutableListOf<MedicationUi>()
        val medsArr = payload.optJSONArray("medications")
        if (medsArr != null) {
            for (i in 0 until medsArr.length()) {
                val m = medsArr.optJSONObject(i) ?: continue
                val times = mutableListOf<String>()
                val tArr = m.optJSONArray("times24")
                if (tArr != null) {
                    for (j in 0 until tArr.length()) times.add(tArr.optString(j))
                }
                val taken = mutableListOf<String>()
                val kArr = m.optJSONArray("takenTimesToday")
                if (kArr != null) {
                    for (j in 0 until kArr.length()) taken.add(kArr.optString(j))
                }
                medsList.add(
                    MedicationUi(
                        id = m.optString("id", "med_$i"),
                        name = m.optString("name", "علاج"),
                        times24 = times,
                        takenTimesToday = taken
                    )
                )
            }
        }

        _state.update { cur ->
            cur.copy(
                cityName = city,
                lat = lat,
                lng = lng,
                timeZoneId = tz,
                cupsLogged = payload.optInt("cupsLogged", cur.cupsLogged),
                targetCups = payload.optInt("targetCups", cur.targetCups),
                dailyCommitmentDays = payload.optInt("dailyCommitmentDays", cur.dailyCommitmentDays),
                waterTargetDays = payload.optInt("waterTargetDays", cur.waterTargetDays),
                quietMode = payload.optString("quietMode", cur.quietMode),
                liveAlertsEnabled = devSettings?.optBoolean("liveAlertsEnabled", cur.liveAlertsEnabled)
                    ?: cur.liveAlertsEnabled,
                chargeLimitPct = appSettings?.optInt("phoneChargeLimitPct", cur.chargeLimitPct)
                    ?: cur.chargeLimitPct,
                medications = if (medsArr != null) medsList else cur.medications
            )
        }
        recomputeSolarAndNext()
    }

    fun recomputeSolarAndNext() {
        val st = _state.value
        val slots = AstronomicalCompass.computeDailySlots(st.lat, st.lng, st.timeZoneId)
        val tz = TimeZone.getTimeZone(st.timeZoneId.ifBlank { "Africa/Cairo" })
        val cal = Calendar.getInstance(tz)
        val nowMin = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        val secIntoMin = cal.get(Calendar.SECOND)
        val nowMs = System.currentTimeMillis()
        val minuteStartMs = nowMs - secIntoMin * 1000L - cal.get(Calendar.MILLISECOND)

        var next = slots.firstOrNull { it.minutesOfDay > nowMin }
        var deltaMin = if (next != null) next.minutesOfDay - nowMin else 0
        if (next == null && slots.isNotEmpty()) {
            next = slots.first()
            deltaMin = (1440 - nowMin) + next.minutesOfDay
        }
        val targetEpochMs = if (next != null) minuteStartMs + deltaMin * 60_000L else 0L

        _state.update { it.copy(prayers = slots, nextSlot = next, nextTargetEpochMs = targetEpochMs) }

        if (next != null) {
            DayRhythmSyncService.pushLiveStatus(
                appContext,
                next.emoji,
                next.nameAr,
                next.time12h,
                targetEpochMs,
                st.liveAlertsEnabled,
                10,
                true
            )
        }
    }

    private fun registerBatteryMonitor() {
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_BATTERY_CHANGED)
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
        }
        batteryReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent == null) return
                val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
                val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
                if (level < 0 || scale <= 0) return
                val pct = ((level * 100f) / scale).toInt().coerceIn(0, 100)
                val charging = plugged != 0 && (
                    status == BatteryManager.BATTERY_STATUS_CHARGING ||
                        status == BatteryManager.BATTERY_STATUS_FULL
                    )
                val limit = _state.value.chargeLimitPct
                val eta = if (charging && pct < limit) {
                    ((limit - pct) / 3.5).toInt().coerceIn(1, 180)
                } else -1
                _state.update {
                    it.copy(phoneBatteryPct = pct, phoneCharging = charging, chargeEtaMin = eta)
                }
            }
        }
        try {
            appContext.registerReceiver(batteryReceiver, filter)
        } catch (_: Exception) {
        }
    }

    fun connectSpircWebSocket() {
        activeWs?.cancel()
        val st = _state.value
        val cleanBase = st.brokerUrl.trim().trimEnd('/')
        if (cleanBase.isBlank() || st.uid.isBlank()) return
        val wsUrl = cleanBase
            .replaceFirst("https://", "wss://")
            .replaceFirst("http://", "ws://") + "/ws/${st.uid}"

        val req = Request.Builder().url(wsUrl).build()
        activeWs = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                _state.update { it.copy(wsConnected = true, statusBanner = "متصل لحظياً بالـ Protobuf") }
                // Action 5 = FULL_SYNC_REQUEST
                val frameBytes = encodeSpircFrame(
                    action = 5,
                    entityKind = 1,
                    entityId = "state_v3",
                    payload = ByteArray(0)
                )
                webSocket.send(frameBytes.toByteString())
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                try {
                    val decoded = decodeSpircFrame(bytes.toByteArray()) ?: return
                    if (decoded.clientId == clientId) return
                    if (decoded.lamportSeq > lamportSeq) lamportSeq = decoded.lamportSeq
                    if (decoded.entityId == "state_v3" && decoded.payload.isNotEmpty()) {
                        val json = JSONObject(String(decoded.payload, StandardCharsets.UTF_8))
                        sqlite.upsertEntity(
                            decoded.entityId,
                            decoded.entityKind,
                            decoded.lamportSeq,
                            decoded.clientId,
                            decoded.timestampMs,
                            decoded.deleted,
                            json.toString()
                        )
                        applyStatePayload(json)
                    }
                } catch (_: Exception) {
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                _state.update { it.copy(wsConnected = false) }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _state.update { it.copy(wsConnected = false) }
            }
        })
    }

    private fun pushStatePatch(mutator: (JSONObject) -> Unit) {
        val nextJson = JSONObject(rawStateJson.toString())
        mutator(nextJson)
        nextJson.put("originClientId", clientId)
        nextJson.put("updatedAtMs", System.currentTimeMillis())
        rawStateJson = nextJson
        applyStatePayload(nextJson)

        lamportSeq = maxOf(lamportSeq + 1, System.currentTimeMillis())
        val jsonStr = nextJson.toString()
        scope.launch {
            sqlite.upsertEntity(
                "state_v3",
                1,
                lamportSeq,
                clientId,
                System.currentTimeMillis(),
                false,
                jsonStr
            )
            val wire = encodeSpircFrame(
                action = 1, // UPSERT
                entityKind = 1, // STATE_V3
                entityId = "state_v3",
                payload = jsonStr.toByteArray(StandardCharsets.UTF_8)
            )
            activeWs?.send(wire.toByteString())
        }
    }

    fun addWaterCup(delta: Int) {
        pushStatePatch { json ->
            val current = json.optInt("cupsLogged", _state.value.cupsLogged)
            val next = (current + delta).coerceIn(0, 30)
            json.put("cupsLogged", next)
        }
    }

    fun toggleMedicationDose(medId: String, time24: String) {
        pushStatePatch { json ->
            val meds = json.optJSONArray("medications") ?: return@pushStatePatch
            for (i in 0 until meds.length()) {
                val m = meds.optJSONObject(i) ?: continue
                if (m.optString("id") == medId) {
                    val taken = m.optJSONArray("takenTimesToday") ?: JSONArray()
                    val nextTaken = JSONArray()
                    var removed = false
                    for (j in 0 until taken.length()) {
                        val t = taken.optString(j)
                        if (t == time24) removed = true else nextTaken.put(t)
                    }
                    if (!removed) nextTaken.put(time24)
                    m.put("takenTimesToday", nextTaken)
                    break
                }
            }
        }
    }

    fun setChargeLimit(limitPct: Int) {
        val clamped = limitPct.coerceIn(60, 100)
        val sp = appContext.getSharedPreferences("dayrhythm_charge_prefs", Context.MODE_PRIVATE)
        sp.edit().putInt("charge_limit_pct", clamped).apply()
        pushStatePatch { json ->
            val appSet = json.optJSONObject("appSettings") ?: JSONObject()
            appSet.put("phoneChargeLimitPct", clamped)
            json.put("appSettings", appSet)
        }
    }

    fun setLiveAlertsEnabled(enabled: Boolean) {
        pushStatePatch { json ->
            val dev = json.optJSONObject("deviceSettings") ?: JSONObject()
            dev.put("liveAlertsEnabled", enabled)
            json.put("deviceSettings", dev)
        }
    }

    fun updateSettingsConfig(brokerUrl: String, uid: String, geminiApiKey: String) {
        val cleanUrl = brokerUrl.trim().trimEnd('/')
        val cleanUid = uid.trim()
        val cleanKey = geminiApiKey.trim()
        appContext.getSharedPreferences("dayrhythm_compose_prefs", Context.MODE_PRIVATE).edit()
            .putString("broker_url", cleanUrl)
            .putString("uid", cleanUid)
            .putString("gemini_api_key", cleanKey)
            .apply()
        _state.update {
            it.copy(
                brokerUrl = cleanUrl.ifBlank { it.brokerUrl },
                uid = cleanUid.ifBlank { it.uid },
                geminiApiKey = cleanKey
            )
        }
        connectSpircWebSocket()
    }

    @Suppress("MissingPermission")
    fun syncGpsFromPhone(force: Boolean = false) {
        scope.launch {
            try {
                val lm = appContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return@launch
                val providers = lm.getProviders(true)
                var best: Location? = null
                for (p in providers) {
                    val l = lm.getLastKnownLocation(p) ?: continue
                    if (best == null || l.accuracy < best.accuracy) best = l
                }
                if (best == null) {
                    _state.update { it.copy(statusBanner = "فعّل صلاحية الموقع GPS أولاً") }
                    return@launch
                }
                val cur = _state.value
                val movedKm = AstronomicalCompass.haversineKm(cur.lat, cur.lng, best.latitude, best.longitude)
                if (!force && movedKm < 5.0) {
                    _state.update { it.copy(statusBanner = "الموقع ثابت (${String.format(Locale.US, "%.1f", movedKm)} كم) — المواقيت مستقرة ✓") }
                    return@launch
                }
                var cityName = cur.cityName
                try {
                    @Suppress("DEPRECATION")
                    val addrs = Geocoder(appContext, Locale("ar")).getFromLocation(best.latitude, best.longitude, 1)
                    val a = addrs?.firstOrNull()
                    val picked = a?.locality ?: a?.subAdminArea ?: a?.adminArea
                    if (!picked.isNullOrBlank()) cityName = picked
                } catch (_: Exception) {
                }
                val tz = TimeZone.getDefault().id
                pushStatePatch { json ->
                    val lp = json.optJSONObject("lifeProfile") ?: JSONObject()
                    lp.put("currentLat", best.latitude)
                    lp.put("currentLng", best.longitude)
                    lp.put("currentCityName", cityName)
                    lp.put("currentTimeZone", tz)
                    json.put("lifeProfile", lp)
                }
                _state.update { it.copy(statusBanner = "تم تحديث الموقع والمواقيت: $cityName ✓") }
            } catch (_: Exception) {
            }
        }
    }

    fun sendGeminiMessage(prompt: String) {
        val clean = prompt.trim()
        if (clean.isBlank()) return
        val userMsg = ChatBubbleUi(UUID.randomUUID().toString(), "user", clean, System.currentTimeMillis())
        _state.update { it.copy(chatMessages = it.chatMessages + userMsg, geminiSending = true) }

        scope.launch {
            val st = _state.value
            val apiKey = st.geminiApiKey
            if (apiKey.isBlank()) {
                val reply = ChatBubbleUi(
                    UUID.randomUUID().toString(),
                    "model",
                    "أضف مفتاح Gemini API في تبويب الإعدادات لتفعيل الشات الذكي هنا مباشرة.",
                    System.currentTimeMillis()
                )
                _state.update { it.copy(chatMessages = it.chatMessages + reply, geminiSending = false) }
                return@launch
            }
            try {
                val prayersCtx = st.prayers.joinToString(" | ") { "${it.nameAr}: ${it.time12h}" }
                val sysPrompt = "أنت المساعد الشخصي لتطبيق إيقاع اليوم (DayRhythm). " +
                    "الصلوات والشروق والغروب محسوبة فلكياً من GPS (${st.cityName}): $prayersCtx. " +
                    "الماء اليوم: ${st.cupsLogged}/${st.targetCups} كوب. أجب بإيجاز وبنظام 12 ساعة."

                val bodyJson = JSONObject().apply {
                    put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", sysPrompt))))
                    put("contents", JSONArray().put(JSONObject().put("role", "user").put("parts", JSONArray().put(JSONObject().put("text", clean)))))
                }
                val req = Request.Builder()
                    .url("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$apiKey")
                    .post(bodyJson.toString().toRequestBody("application/json".toMediaType()))
                    .build()

                http.newCall(req).execute().use { resp ->
                    val raw = resp.body?.string().orEmpty()
                    val text = if (resp.isSuccessful) {
                        val j = JSONObject(raw)
                        j.optJSONArray("candidates")
                            ?.optJSONObject(0)
                            ?.optJSONObject("content")
                            ?.optJSONArray("parts")
                            ?.optJSONObject(0)
                            ?.optString("text", "تم.") ?: "تم."
                    } else {
                        "تعذر الاتصال بـ Gemini (${resp.code})."
                    }
                    val modelMsg = ChatBubbleUi(UUID.randomUUID().toString(), "model", text, System.currentTimeMillis())
                    _state.update { it.copy(chatMessages = it.chatMessages + modelMsg, geminiSending = false) }
                }
            } catch (e: Exception) {
                val errMsg = ChatBubbleUi(UUID.randomUUID().toString(), "model", "خطأ اتصال: ${e.message}", System.currentTimeMillis())
                _state.update { it.copy(chatMessages = it.chatMessages + errMsg, geminiSending = false) }
            }
        }
    }

    private fun encodeSpircFrame(action: Int, entityKind: Int, entityId: String, payload: ByteArray): ByteArray {
        val now = System.currentTimeMillis()
        val opId = "op_${lamportSeq.toString(36)}"
        if (NativeCore.isLoaded()) {
            val nativeBytes = NativeCore.spircEncode(
                action, entityKind, entityId, clientId, opId, lamportSeq, now, false, payload
            )
            if (nativeBytes != null && nativeBytes.isNotEmpty()) return nativeBytes
        }
        // Fallback Protobuf v3 encoder
        val out = ByteArrayOutputStream()
        fun writeVarint(vIn: Long) {
            var v = vIn
            while (v >= 0x80L) {
                out.write(((v and 0x7FL) or 0x80L).toInt())
                v = v ushr 7
            }
            out.write(v.toInt())
        }
        fun writeUint(field: Int, v: Long) {
            if (v == 0L) return
            writeVarint(((field shl 3) or 0).toLong())
            writeVarint(v)
        }
        fun writeBytes(field: Int, b: ByteArray) {
            if (b.isEmpty()) return
            writeVarint(((field shl 3) or 2).toLong())
            writeVarint(b.size.toLong())
            out.write(b)
        }
        writeUint(1, 1)
        writeUint(2, action.toLong())
        writeUint(3, entityKind.toLong())
        writeBytes(4, entityId.toByteArray(StandardCharsets.UTF_8))
        writeBytes(5, clientId.toByteArray(StandardCharsets.UTF_8))
        writeBytes(6, opId.toByteArray(StandardCharsets.UTF_8))
        writeUint(7, lamportSeq)
        writeUint(8, now)
        writeBytes(10, payload)
        return out.toByteArray()
    }

    private data class DecodedWire(
        val action: Int,
        val entityKind: Int,
        val entityId: String,
        val clientId: String,
        val lamportSeq: Long,
        val timestampMs: Long,
        val deleted: Boolean,
        val payload: ByteArray
    )

    private fun decodeSpircFrame(data: ByteArray): DecodedWire? {
        var pos = 0
        fun readVarint(): Long {
            var res = 0L
            var shift = 0
            while (pos < data.size && shift <= 63) {
                val b = data[pos++].toInt() and 0xFF
                res = res or ((b and 0x7F).toLong() shl shift)
                if ((b and 0x80) == 0) return res
                shift += 7
            }
            throw IllegalStateException("Malformed varint")
        }
        var action = 0
        var kind = 0
        var entityId = ""
        var cid = ""
        var seq = 0L
        var ts = 0L
        var deleted = false
        var payload = ByteArray(0)

        while (pos < data.size) {
            val tag = readVarint().toInt()
            val field = tag ushr 3
            val wire = tag and 0x07
            when (wire) {
                0 -> {
                    val v = readVarint()
                    when (field) {
                        2 -> action = v.toInt()
                        3 -> kind = v.toInt()
                        7 -> seq = v
                        8 -> ts = v
                        9 -> deleted = v != 0L
                    }
                }
                2 -> {
                    val len = readVarint().toInt()
                    if (pos + len > data.size) return null
                    val slice = data.copyOfRange(pos, pos + len)
                    pos += len
                    when (field) {
                        4 -> entityId = String(slice, StandardCharsets.UTF_8)
                        5 -> cid = String(slice, StandardCharsets.UTF_8)
                        10 -> payload = slice
                    }
                }
                5 -> pos += 4
                1 -> pos += 8
                else -> return null
            }
        }
        return DecodedWire(action, kind, entityId, cid, seq, ts, deleted, payload)
    }

    fun release() {
        activeWs?.cancel()
        try {
            batteryReceiver?.let { appContext.unregisterReceiver(it) }
        } catch (_: Exception) {
        }
    }
}
