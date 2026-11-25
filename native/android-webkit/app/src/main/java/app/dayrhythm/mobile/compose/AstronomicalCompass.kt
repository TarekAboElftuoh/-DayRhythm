package app.dayrhythm.mobile.compose

import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.atan
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

data class PrayerSlot(
    val id: String,
    val nameAr: String,
    val emoji: String,
    val minutesOfDay: Int,
    val isObligatory: Boolean
) {
    val time12h: String get() = formatMinutes12hAr(minutesOfDay)
}

fun formatMinutes12hAr(totalMin: Int): String {
    val normalized = ((totalMin % 1440) + 1440) % 1440
    val h24 = normalized / 60
    val m = normalized % 60
    val suffix = if (h24 < 12) "ص" else "م"
    val h12 = when {
        h24 == 0 -> 12
        h24 > 12 -> h24 - 12
        else -> h24
    }
    return String.format(Locale.US, "%02d:%02d %s", h12, m, suffix)
}

object AstronomicalCompass {
    private const val DEG2RAD = Math.PI / 180.0
    private const val RAD2DEG = 180.0 / Math.PI

    fun haversineKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6371.0
        val dLat = (lat2 - lat1) * DEG2RAD
        val dLng = (lng2 - lng1) * DEG2RAD
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(lat1 * DEG2RAD) * cos(lat2 * DEG2RAD) * sin(dLng / 2) * sin(dLng / 2)
        return 2.0 * r * asin(minOf(1.0, sqrt(a)))
    }

    /**
     * Pure astronomical prayer + Sunrise (Red Sun) + Sunset computation for any latitude/longitude & season.
     * Uses Egyptian General Authority of Survey angles (Fajr 19.5°, Isha 17.5°, Shafi Asr = 1).
     */
    fun computeDailySlots(lat: Double, lng: Double, timeZoneId: String): List<PrayerSlot> {
        val tz = TimeZone.getTimeZone(timeZoneId.ifBlank { "Africa/Cairo" })
        val cal = Calendar.getInstance(tz)
        val year = cal.get(Calendar.YEAR)
        val month = cal.get(Calendar.MONTH) + 1
        val day = cal.get(Calendar.DAY_OF_MONTH)
        val tzOffsetHours = tz.getOffset(cal.timeInMillis) / 3_600_000.0

        val jd = julianDate(year, month, day) - lng / (15.0 * 24.0)
        val d = jd - 2451545.0
        val g = fixAngle(357.529 + 0.98560028 * d)
        val q = fixAngle(280.459 + 0.98564736 * d)
        val l = fixAngle(q + 1.915 * sin(g * DEG2RAD) + 0.020 * sin(2 * g * DEG2RAD))
        val e = 23.439 - 0.00000036 * d
        val ra = atan2(cos(e * DEG2RAD) * sin(l * DEG2RAD), cos(l * DEG2RAD)) * RAD2DEG / 15.0
        val eqT = q / 15.0 - fixHour(ra)
        val decl = asin(sin(e * DEG2RAD) * sin(l * DEG2RAD)) * RAD2DEG

        val midday = fixHour(12.0 - eqT + tzOffsetHours - lng / 15.0)
        val sunriseHa = sunAngleTime(0.833, lat, decl) ?: 6.0
        val fajrHa = sunAngleTime(19.5, lat, decl) ?: 7.5
        val ishaHa = sunAngleTime(17.5, lat, decl) ?: 7.2
        val asrHa = asrTime(1.0, lat, decl) ?: 3.5

        val fajrMin = toMinutes(midday - fajrHa)
        val sunriseMin = toMinutes(midday - sunriseHa)
        val dhuhrMin = toMinutes(midday + 2.0 / 60.0)
        val asrMin = toMinutes(midday + asrHa)
        val maghribMin = toMinutes(midday + sunriseHa)
        val ishaMin = toMinutes(midday + ishaHa)

        return listOf(
            PrayerSlot("fajr", "الفجر", "🌙", fajrMin, true),
            PrayerSlot("sunrise", "الشروق (الشمس الحمراء)", "🌅", sunriseMin, false),
            PrayerSlot("dhuhr", "الظهر", "☀️", dhuhrMin, true),
            PrayerSlot("asr", "العصر", "🌤️", asrMin, true),
            PrayerSlot("maghrib", "المغرب (الغروب)", "🌇", maghribMin, true),
            PrayerSlot("isha", "العشاء", "✨", ishaMin, true)
        )
    }

    private fun julianDate(year: Int, month: Int, day: Int): Double {
        var y = year
        var m = month
        if (m <= 2) {
            y -= 1
            m += 12
        }
        val a = floor(y / 100.0)
        val b = 2 - a + floor(a / 4.0)
        return floor(365.25 * (y + 4716)) + floor(30.6001 * (m + 1)) + day + b - 1524.5
    }

    private fun sunAngleTime(angle: Double, lat: Double, decl: Double): Double? {
        val term = (-sin(angle * DEG2RAD) - sin(lat * DEG2RAD) * sin(decl * DEG2RAD)) /
            (cos(lat * DEG2RAD) * cos(decl * DEG2RAD))
        if (term < -1.0 || term > 1.0) return null
        return acos(term) * RAD2DEG / 15.0
    }

    private fun asrTime(factor: Double, lat: Double, decl: Double): Double? {
        val angle = -atan(1.0 / (factor + tan(kotlin.math.abs(lat - decl) * DEG2RAD))) * RAD2DEG
        return sunAngleTime(angle, lat, decl)
    }

    private fun toMinutes(hours: Double): Int {
        val h = fixHour(hours)
        return (h * 60.0).roundToInt() % 1440
    }

    private fun fixAngle(a: Double): Double {
        var res = a - 360.0 * floor(a / 360.0)
        if (res < 0) res += 360.0
        return res
    }

    private fun fixHour(h: Double): Double {
        var res = h - 24.0 * floor(h / 24.0)
        if (res < 0) res += 24.0
        return res
    }
}
