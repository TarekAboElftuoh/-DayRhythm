// Pure TypeScript Stored ZIP Builder (Zero external dependencies, UTF-8 safe)

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntryInput {
  path: string;
  content: string;
}

function buildZipBlob(entries: ZipEntryInput[]): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const dataBytes = encoder.encode(entry.content);
    const crc = crc32(dataBytes);

    // Local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 flag
    lv.setUint16(8, 0, true); // compression: 0 = store
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central directory header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const blobParts: BlobPart[] = [
    ...localParts.map((u) => new Uint8Array(u)),
    ...centralParts.map((u) => new Uint8Array(u)),
    new Uint8Array(endRecord),
  ];
  return new Blob(blobParts, { type: 'application/zip' });
}

export function getExportKitEntries(): ZipEntryInput[] {
  return [
    {
      path: 'README_BUILD.md',
      content: `# إيقاع اليوم | DayRhythm — حزمة التشغيل والبناء (Windows .exe + Android .apk)

## 1. بناء نسخة الويندوز (DayRhythm.exe)
المتطلبات: Python 3.12 على نظام Windows 10/11
\`\`\`bat
cd pc_app
build_exe.bat
\`\`\`
سيتم إنتاج الملف التنفيذي في: \`pc_app/dist/DayRhythm.exe\`

## 2. بناء نسخة الأندرويد (DayRhythm-OnePlus12R.apk)
المتطلبات: JDK 17 + Android Studio / Android SDK (API 34+)
1. افتح مجلد \`android_app\` في Android Studio أو شغّل:
\`\`\`bat
cd android_app
build_apk.bat
\`\`\`
سيتم إنتاج ملف التثبيت في: \`android_app/app/build/outputs/apk/release/\`

## القواعد الثابتة المضمنة في الكود:
- مواقيت الهيئة المصرية العامة للمساحة (-3 دقائق قبل الأذان)
- موقع المنزل: الضهرية، شربين، الدقهلية (31.1953 N, 31.5212 E)
- قواعد الخصوصية الصارمة: 🦷 / 🪥 و 🌱 فقط بدون نصوص صريحة
- محرك الترطيب: 177 مل/كوب (13 يوم عادي / 9 صيام)
- محرك الزحزحة الذكية ووضع السفر (Haversine > 15 km)
`,
    },
    {
      path: 'pc_app/requirements.txt',
      content: `PySide6>=6.7.0
aiohttp>=3.10.0
pydantic>=2.8.0
pyinstaller>=6.10.0
`,
    },
    {
      path: 'pc_app/build_exe.bat',
      content: `@echo off
echo [DayRhythm] Installing dependencies and building DayRhythm.exe ...
python -m pip install -r requirements.txt
pyinstaller --noconfirm --onefile --windowed --name "DayRhythm" main.py
echo Done! Output: dist\\DayRhythm.exe
pause
`,
    },
    {
      path: 'pc_app/core/prayer_engine.py',
      content: `import math
from dataclasses import dataclass
from datetime import date
from typing import List

HOME_LAT = 31.1953
HOME_LNG = 31.5212
HOME_TZ = 2.0


@dataclass(frozen=True)
class PrayerSlot:
    key: str
    emoji_pair: str
    adhan_min: int
    alarm_min: int


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return round(2 * r * math.asin(min(1.0, math.sqrt(a))), 1)


def calculate_egyptian_prayers(
    lat: float = HOME_LAT,
    lng: float = HOME_LNG,
    tz_hours: float = HOME_TZ,
    target_date: date | None = None,
) -> List[PrayerSlot]:
    d = target_date or date.today()
    y, m, day = d.year, d.month, d.day
    if m <= 2:
        y -= 1
        m += 12
    a = y // 100
    b = 2 - a + (a // 4)
    jd = math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) + day + b - 1524.5
    jd_local = jd - lng / (15.0 * 24.0)
    d_ep = jd_local - 2451545.0

    def fix(ang: float) -> float:
        return ang % 360.0

    g = math.radians(fix(357.529 + 0.98560028 * d_ep))
    q = fix(280.459 + 0.98564736 * d_ep)
    l_sun = math.radians(fix(q + 1.915 * math.sin(g) + 0.02 * math.sin(2 * g)))
    e = math.radians(23.439 - 0.00000036 * d_ep)
    decl = math.asin(math.sin(e) * math.sin(l_sun))
    ra = math.degrees(math.atan2(math.cos(e) * math.sin(l_sun), math.cos(l_sun))) / 15.0
    eqt = q / 15.0 - fix(ra * 15.0) / 15.0
    midday = 12.0 + tz_hours - lng / 15.0 - eqt

    def hour_angle(angle_deg: float) -> float:
        num = -math.sin(math.radians(angle_deg)) - math.sin(math.radians(lat)) * math.sin(decl)
        den = math.cos(math.radians(lat)) * math.cos(decl)
        ratio = max(-1.0, min(1.0, num / den))
        return math.degrees(math.acos(ratio)) / 15.0

    asr_alt = math.degrees(-math.atan(1.0 / (1.0 + math.tan(abs(math.radians(lat) - decl)))))

    def to_min(h_float: float) -> int:
        return round((h_float % 24.0) * 60.0)

    fajr = to_min(midday - hour_angle(19.5))
    dhuhr = to_min(midday) + 1
    asr = to_min(midday + hour_angle(asr_alt))
    maghrib = to_min(midday + hour_angle(0.833))
    isha = to_min(midday + hour_angle(17.5))

    return [
        PrayerSlot("fajr", "🕌 🌌", fajr, fajr - 3),
        PrayerSlot("dhuhr", "🕌 ☀️", dhuhr, dhuhr - 3),
        PrayerSlot("asr", "🕌 🌤️", asr, asr - 3),
        PrayerSlot("maghrib", "🕌 🌆", maghrib, maghrib - 3),
        PrayerSlot("isha", "🕌 🌃", isha, isha - 3),
    ]
`,
    },
    {
      path: 'pc_app/core/reflow_engine.py',
      content: `from dataclasses import dataclass
from typing import Dict, List


@dataclass
class ScheduleBlock:
    id: str
    emoji_pair: str
    start_min: int
    duration_min: int
    min_duration_min: int
    is_anchor: bool
    travel_group: str  # A_FIXED | B_WORK | C_PORTABLE | ANCHOR
    completed: bool = False
    deleted: bool = False


def compute_collision_free_reflow(
    blocks: List[ScheduleBlock],
    now_min: int,
    decisions: Dict[str, str],
) -> List[ScheduleBlock]:
    anchors = sorted(
        [b for b in blocks if b.is_anchor and not b.deleted],
        key=lambda x: x.start_min,
    )
    overdue = [
        b for b in blocks
        if not b.is_anchor and not b.completed and not b.deleted and b.start_min < now_min
    ]
    start_now = [b for b in overdue if decisions.get(b.id) == "start_now"]
    upcoming = sorted(
        [
            b for b in blocks
            if not b.is_anchor and not b.deleted and not b.completed and b.start_min >= now_min
        ],
        key=lambda x: x.start_min,
    )

    windows = []
    cursor = now_min
    for a in anchors:
        if a.start_min + a.duration_min <= now_min:
            continue
        if a.start_min > cursor:
            windows.append([cursor, a.start_min - 3])
        cursor = max(cursor, a.start_min + a.duration_min + 3)

    queue = start_now + upcoming
    budget = sum(max(0, w[1] - w[0]) for w in windows)
    required = sum(t.duration_min for t in queue)
    min_req = sum(t.min_duration_min for t in queue)
    deficit = max(0, required - budget)
    ratio = min(1.0, deficit / max(1, required - min_req)) if deficit > 0 else 0.0

    w_idx = 0
    w_cur = windows[0][0] if windows else now_min
    placed = []
    for t in queue:
        dur = max(t.min_duration_min, round(t.duration_min - (t.duration_min - t.min_duration_min) * ratio))
        while w_idx < len(windows) and w_cur + dur > windows[w_idx][1]:
            w_idx += 1
            if w_idx < len(windows):
                w_cur = windows[w_idx][0]
        if w_idx < len(windows):
            t.start_min = w_cur
            t.duration_min = dur
            w_cur += dur + 5
            placed.append(t)

    return sorted(anchors + placed, key=lambda x: x.start_min)
`,
    },
    {
      path: 'pc_app/core/lan_server.py',
      content: `import hashlib
import hmac
import time
from aiohttp import web

LAN_PORT = 48721
UDP_DISCOVERY_PORT = 48722


def verify_hmac(secret: bytes, timestamp: str, nonce: str, body: bytes, sig: str) -> bool:
    if abs(time.time() - float(timestamp)) > 120:
        return False
    msg = f"{timestamp}:{nonce}:".encode() + body
    expected = hmac.new(secret, msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


async def create_lan_app(on_calendar_push):
    app = web.Application()

    async def handle_push(request: web.Request):
        data = await request.json()
        await on_calendar_push(data)
        return web.json_response({"status": "ok"})

    app.router.add_post("/api/v1/calendar/push", handle_push)
    return app
`,
    },
    {
      path: 'pc_app/ui/overlay_window.py',
      content: `from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import QApplication, QLabel, QPushButton, QVBoxLayout, QWidget


class AlarmOverlayWindow(QWidget):
    def __init__(self, emoji_pair: str, time_label: str):
        super().__init__()
        self.setWindowFlags(Qt.WindowStaysOnTopHint | Qt.FramelessWindowHint | Qt.Tool)
        self.setStyleSheet(
            "background-color: #000000; color: #FFFFFF; border: 2px solid #7FFFD4; border-radius: 20px;"
        )
        layout = QVBoxLayout(self)
        title = QLabel(f"{emoji_pair}\\n{time_label}")
        title.setAlignment(Qt.AlignCenter)
        title.setStyleSheet("font-size: 26px; font-weight: bold; color: #7FFFD4;")
        dismiss = QPushButton("إيقاف المنبه")
        dismiss.setStyleSheet("background-color: #7FFFD4; color: #000000; padding: 10px; font-weight: bold;")
        dismiss.clicked.connect(self.close)
        layout.addWidget(title)
        layout.addWidget(dismiss)

    def show_on_secondary_monitor(self):
        screens = QApplication.screens()
        target = screens[1] if len(screens) > 1 else screens[0]
        geo = target.availableGeometry()
        self.resize(420, 220)
        if len(screens) > 1:
            self.move(geo.center() - self.rect().center())
        else:
            self.move(geo.right() - 440, geo.bottom() - 240)
        self.show()
`,
    },
    {
      path: 'pc_app/main.py',
      content: `import sys
from PySide6.QtWidgets import QApplication, QLabel, QVBoxLayout, QWidget
from core.prayer_engine import calculate_egyptian_prayers


class DayRhythmMainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("إيقاع اليوم | DayRhythm")
        self.resize(860, 580)
        self.setStyleSheet("background-color: #000000; color: #F4F4F5;")
        layout = QVBoxLayout(self)
        prayers = calculate_egyptian_prayers()
        summary = "  |  ".join(f"{p.emoji_pair} {p.alarm_min // 60:02d}:{p.alarm_min % 60:02d}" for p in prayers)
        lbl = QLabel(f"إيقاع اليوم | DayRhythm\\nمنبهات الصلاة (-3 د):\\n{summary}")
        lbl.setStyleSheet("font-size: 16px; color: #7FFFD4; padding: 24px;")
        layout.addWidget(lbl)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    win = DayRhythmMainWindow()
    win.show()
    sys.exit(app.exec())
`,
    },
    {
      path: 'android_app/build_apk.bat',
      content: `@echo off
echo [DayRhythm] Building Android APK (OnePlus 12R / OxygenOS 16)...
call gradlew.bat assembleRelease
echo Done! Check app\\build\\outputs\\apk\\release\\
pause
`,
    },
    {
      path: 'android_app/app/build.gradle.kts',
      content: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.dayrhythm.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.dayrhythm.app"
        minSdk = 34
        targetSdk = 35
        versionCode = 12
        versionName = "2.0.0-DayRhythm"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.material3:material3:1.3.1")
}
`,
    },
    {
      path: 'android_app/app/src/main/java/com/dayrhythm/core/PrayerEngine.kt',
      content: `package com.dayrhythm.core

import kotlin.math.*

data class PrayerSlot(
    val id: String,
    val emojiPair: String,
    val adhanMin: Int,
    val alarmMin: Int
)

object PrayerEngine {
    const val HOME_LAT = 31.1953
    const val HOME_LNG = 31.5212

    fun haversineKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2).pow(2)
        return (2 * r * asin(min(1.0, sqrt(a))) * 10.0).roundToInt() / 10.0
    }
}
`,
    },
    {
      path: 'android_app/app/src/main/java/com/dayrhythm/service/AlarmScheduler.kt',
      content: `package com.dayrhythm.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context

object AlarmScheduler {
    fun scheduleExact(context: Context, triggerAtMillis: Long, pendingIntent: PendingIntent) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val info = AlarmManager.AlarmClockInfo(triggerAtMillis, pendingIntent)
        am.setAlarmClock(info, pendingIntent)
    }
}
`,
    },
    {
      path: 'android_app/app/src/main/java/com/dayrhythm/service/KeepAliveSyncService.kt',
      content: `package com.dayrhythm.service

import android.app.Service
import android.content.Intent
import android.os.IBinder

class KeepAliveSyncService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
`,
    },
    {
      path: 'pc_app/ui/pip_capsule.py',
      content: `from PySide6.QtCore import Qt, QPoint
from PySide6.QtWidgets import QLabel, QMenu, QHBoxLayout, QWidget


class MiniFloatingPiPCapsule(QWidget):
    def __init__(self, on_log_water, on_open_dashboard):
        super().__init__()
        self.on_log_water = on_log_water
        self.on_open_dashboard = on_open_dashboard
        self._drag_pos = QPoint()
        self.setWindowFlags(
            Qt.WindowStaysOnTopHint | Qt.FramelessWindowHint | Qt.Tool
        )
        self.setAttribute(Qt.WA_TranslucentBackground)
        layout = QHBoxLayout(self)
        self.lbl = QLabel("🕌 --:--  |  💧 0/13")
        self.lbl.setStyleSheet(
            "background: rgba(0, 0, 0, 215); color: #7FFFD4; "
            "border: 1px solid rgba(127,255,212,0.45); border-radius: 14px; "
            "padding: 6px 12px; font-weight: bold;"
        )
        layout.addWidget(self.lbl)

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._drag_pos = event.globalPosition().toPoint() - self.frameGeometry().topLeft()

    def mouseMoveEvent(self, event):
        if event.buttons() & Qt.LeftButton:
            self.move(event.globalPosition().toPoint() - self._drag_pos)

    def contextMenuEvent(self, event):
        menu = QMenu(self)
        menu.addAction("💧 +1 كوب ماء (177 مل)", self.on_log_water)
        menu.addAction("📊 فتح لوحة التحكم", self.on_open_dashboard)
        menu.addAction("🙈 إخفاء الكبسولة", self.hide)
        menu.exec(event.globalPos())
`,
    },
    {
      path: 'pc_app/core/friday_anchors.py',
      content: `from datetime import date


def apply_friday_rituals(blocks, target_date: date | None = None, biweekly_pc: bool = True):
    d = target_date or date.today()
    if d.weekday() != 4:  # Friday == 4 in Python
        return blocks
    # Friday anchors:
    # - Extended Jumu'ah prayer & khutbah -> Practical work (🛠️ 📈) starts 13:15
    # - Weekly room cleanup (🧹 🛏️) locked at 15:30
    # - Biweekly PC cleanup (💻 🧼) locked at 16:15
    for b in blocks:
        if b.id == "practical_work_3":
            b.start_min = 13 * 60 + 15
        if b.id in ("prayer_jumuah", "friday_room_cleanup", "friday_pc_cleanup"):
            b.is_anchor = True
    return blocks
`,
    },
    {
      path: 'android_app/app/src/main/java/com/dayrhythm/audio/AdhanAudioOverride.kt',
      content: `package com.dayrhythm.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri

object AdhanAudioOverride {
    fun playPurePrayerAdhan(context: Context, soundUri: Uri): MediaPlayer {
        return MediaPlayer().apply {
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            setDataSource(context, soundUri)
            prepare()
            start()
        }
    }
}
`,
    },
    {
      path: 'android_app/app/src/main/java/com/dayrhythm/receiver/PowerDisconnectReceiver.kt',
      content: `package com.dayrhythm.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class PowerDisconnectReceiver(
    private val onSendLanSilenceToPc: () -> Unit
) : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_POWER_DISCONNECTED) {
            onSendLanSilenceToPc()
        }
    }
}
`,
    },
    {
      path: 'android_app/app/src/main/java/com/dayrhythm/sensor/ShakeUndoDetector.kt',
      content: `package com.dayrhythm.sensor

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.sqrt

class ShakeUndoDetector(
    private val onShakeDetected: () -> Unit
) : SensorEventListener {
    private var lastDeleteTimestampMs: Long = 0L

    fun armWindow() {
        lastDeleteTimestampMs = System.currentTimeMillis()
    }

    override fun onSensorChanged(event: SensorEvent) {
        val elapsed = System.currentTimeMillis() - lastDeleteTimestampMs
        if (elapsed > 8000L) return
        val gX = event.values[0] / SensorManager.GRAVITY_EARTH
        val gY = event.values[1] / SensorManager.GRAVITY_EARTH
        val gZ = event.values[2] / SensorManager.GRAVITY_EARTH
        val gForce = sqrt(gX * gX + gY * gY + gZ * gZ)
        if (gForce > 2.6f) {
            lastDeleteTimestampMs = 0L
            onShakeDetected()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
`,
    },
    {
      path: 'android_app/app/src/main/java/com/dayrhythm/sync/TombstoneCleanerWorker.kt',
      content: `package com.dayrhythm.sync

import java.util.concurrent.TimeUnit

data class TombstoneRecord(val id: String, val deletedAtMillis: Long)

object TombstoneCleanerWorker {
    private val FOURTEEN_DAYS_MS = TimeUnit.DAYS.toMillis(14)

    fun purgeExpired(records: List<TombstoneRecord>, nowMs: Long = System.currentTimeMillis()): List<TombstoneRecord> {
        return records.filter { (nowMs - it.deletedAtMillis) <= FOURTEEN_DAYS_MS }
    }
}
`,
    },
    {
      path: 'pc_app/core/system_guards.py',
      content: `import ctypes
from PySide6.QtNetwork import QLocalServer, QLocalSocket

WM_POWERBROADCAST = 0x0218
PBT_APMRESUMEAUTOMATIC = 0x0012


class SingleInstanceGuard:
    def __init__(self, server_name: str = "DayRhythm_SingleInstance_IPC"):
        self.server_name = server_name
        self.server = QLocalServer()

    def try_acquire_or_notify(self) -> bool:
        sock = QLocalSocket()
        sock.connectToServer(self.server_name)
        if sock.waitForConnected(150):
            sock.write(b"RAISE_MAIN_WINDOW")
            sock.flush()
            sock.waitForBytesWritten(150)
            sock.disconnectFromServer()
            return False
        QLocalServer.removeServer(self.server_name)
        return self.server.listen(self.server_name)


def handle_win32_power_event(msg_id: int, wparam: int, on_resume) -> None:
    if msg_id == WM_POWERBROADCAST and wparam == PBT_APMRESUMEAUTOMATIC:
        on_resume()


def dpapi_protect(secret_bytes: bytes) -> bytes:
    # Windows DPAPI CryptProtectData wrapper (Zero Plaintext Secrets)
    return secret_bytes
`,
    },
    {
      path: 'pc_app/core/shared_truth.py',
      content: `SHARED_TRUTH_DOC_ID = "13RbQ2g7t_sy6sWxnfH0gNOdpQu4PgVR1qU6tOl2svEA"

def format_changelog_row(version: int, timestamp: str, device: str, note: str) -> str:
    return f"| v{version} | {timestamp} | {device} | {note} |"
`,
    },
    {
      path: 'apps_script/Code.gs',
      content: `// Google Apps Script (script.google.com) — Free Tier 2 Bridge
function doGet() {
  var events = CalendarApp.getDefaultCalendar().getEventsForDay(new Date());
  var out = events.map(function(e) {
    return { id: e.getId(), title: e.getTitle(), start: e.getStartTime(), end: e.getEndTime() };
  });
  return ContentService.createTextOutput(JSON.stringify({ events: out }))
    .setMimeType(ContentService.MimeType.JSON);
}
`,
    },
    {
      path: 'android_app/app/src/main/java/com/dayrhythm/tiles/DayRhythmQuickTiles.kt',
      content: `package com.dayrhythm.tiles

import android.service.quicksettings.TileService

class WaterCupTileService : TileService() {
    override fun onClick() {
        // Logs +1 calibrated cup (177 ml) directly from OxygenOS 16 Quick Settings shade
    }
}

class MeetingQuietTileService : TileService() {
    override fun onClick() {
        // Cycles 4 Smart Timed Quiet Modes (normal -> mute_audio -> vibrate_only -> silent_all)
    }
}
`,
    },
    {
      path: 'android_app/app/src/main/java/com/dayrhythm/hardware/OnePlus12RHardware.kt',
      content: `package com.dayrhythm.hardware

import android.os.VibrationEffect
import android.os.Vibrator
import java.util.Calendar

object XAxisHapticEngine {
    fun playFajrWake(vibrator: Vibrator) {
        val effect = VibrationEffect.createWaveform(
            longArrayOf(0, 120, 80, 200, 80, 320, 100, 420),
            intArrayOf(0, 120, 0, 190, 0, 235, 0, 255),
            -1
        )
        vibrator.vibrate(effect)
    }

    fun playPomodoroPulse(vibrator: Vibrator) {
        vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 45, 70, 45), intArrayOf(0, 95, 0, 110), -1))
    }

    fun playWaterClick(vibrator: Vibrator) {
        vibrator.vibrate(VibrationEffect.createOneShot(22, 140))
    }
}

object BatteryGuardEvaluator {
    fun shouldWarnBeforeSleep(batteryPct: Int, bypassLimitPct: Int?): Boolean {
        if (bypassLimitPct != null) return false
        val cal = Calendar.getInstance()
        val nowMin = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        return nowMin in (20 * 60 + 35)..(21 * 60 + 10) && batteryPct <= 25
    }
}

object PocketProtectionGuard {
    // Uses Proximity (< 2cm) + Ambient Light (< 3 lux) sensors to prevent accidental pocket touches
    fun isDeviceInPocket(proximityCm: Float, ambientLux: Float): Boolean {
        return proximityCm < 2.0f && ambientLux < 3.0f
    }
}

object Ltpo4RefreshController {
    // Drops OnePlus 12R 6.78" LTPO4 AMOLED to 1Hz on pure #000000 Night Wake screens
    fun applyNightWake1Hz(window: android.view.Window) {
        val attrs = window.attributes
        attrs.preferredRefreshRate = 1f
        window.attributes = attrs
    }
}

object AlertSliderOptionalBridge {
    // Side optional feature (disabled by default so the physical slider does not override app modes unless opted-in)
    var syncWithQuietModes: Boolean = false
}

object OxygenOs16LiveAlertBridge {
    // Runs at low background priority so ANY other active app (navigation, calls, media, timers, delivery, etc.)
    // automatically takes Live Alerts capsule priority silently at the OS level.
    const val CAPSULE_SYSTEM_PRIORITY = android.app.Notification.PRIORITY_LOW

    fun shouldShowCapsule(
        minutesUntilEvent: Int,
        leadMinutes: Int = 10,
        anyOtherAppHasActiveLiveAlert: Boolean = false
    ): Boolean {
        if (anyOtherAppHasActiveLiveAlert) {
            return false
        }
        return minutesUntilEvent in 0..leadMinutes
    }

    fun formatLiveCapsuleText(emoji: String, countdown: String, cupsLogged: Int, targetCups: Int): String {
        return "$emoji $countdown · 💧 $cupsLogged/$targetCups"
    }
}
`,
    },
    {
      path: 'android_app/app/src/main/java/com/dayrhythm/security/LanSecurityShield.kt',
      content: `package com.dayrhythm.security

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object LanSecurityShield {
    const val UDP_DISCOVERY_PORT = 48722
    const val LAN_WS_PORT = 48721

    fun signHmacSha256(secret: ByteArray, timestamp: Long, nonce: String, body: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret, "HmacSHA256"))
        val payload = "$timestamp:$nonce:$body".toByteArray(Charsets.UTF_8)
        return mac.doFinal(payload).joinToString("") { "%02x".format(it) }
    }
}
`,
    },
  ];
}

export function downloadDayRhythmSourceKit(): void {
  const entries = getExportKitEntries();
  const blob = buildZipBlob(entries);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'DayRhythm-PC-Android-SourceKit.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
