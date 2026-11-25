#include "dayrhythm/prayer.hpp"
#include <cmath>
#include <sstream>
#include <iomanip>
#include <algorithm>

namespace dayrhythm {

namespace {
constexpr double PI = 3.14159265358979323846;

inline double degToRad(double deg) { return deg * (PI / 180.0); }
inline double radToDeg(double rad) { return rad * (180.0 / PI); }

inline double fixHour(double a) {
    a = a - 24.0 * std::floor(a / 24.0);
    return a < 0 ? a + 24.0 : a;
}

inline double fixAngle(double a) {
    a = a - 360.0 * std::floor(a / 360.0);
    return a < 0 ? a + 360.0 : a;
}

// Astronomical approximations for sun position
void getSunCoordinates(double julianDate, double& declination, double& equationOfTime) {
    double d = julianDate - 2451545.0;
    double g = fixAngle(357.529 + 0.98560028 * d);
    double q = fixAngle(280.459 + 0.98564736 * d);
    double l = fixAngle(q + 1.915 * std::sin(degToRad(g)) + 0.020 * std::sin(degToRad(2 * g)));
    double e = 23.439 - 0.00000036 * d;
    double ra = radToDeg(std::atan2(std::cos(degToRad(e)) * std::sin(degToRad(l)), std::cos(degToRad(l)))) / 15.0;
    ra = fixHour(ra);
    declination = radToDeg(std::asin(std::sin(degToRad(e)) * std::sin(degToRad(l))));
    equationOfTime = q / 15.0 - ra;
}

double computeMidDay(double julianDate, double longitude, double timezone) {
    double dec, eqt;
    getSunCoordinates(julianDate, dec, eqt);
    return fixHour(12.0 + timezone - longitude / 15.0 - eqt);
}

double computeTimeAngle(double julianDate, double latitude, double angle, bool isMorning) {
    double dec, eqt;
    getSunCoordinates(julianDate, dec, eqt);
    double latRad = degToRad(latitude);
    double decRad = degToRad(dec);
    double angRad = degToRad(angle);

    double cosH = (-std::sin(angRad) - std::sin(latRad) * std::sin(decRad)) / (std::cos(latRad) * std::cos(decRad));
    if (cosH > 1.0 || cosH < -1.0) return 0.0; // Polar regions / invalid
    double hourAngle = radToDeg(std::acos(cosH)) / 15.0;
    return isMorning ? -hourAngle : hourAngle;
}

double computeAsrAngle(double julianDate, double latitude, double shadowFactor) {
    double dec, eqt;
    getSunCoordinates(julianDate, dec, eqt);
    double latRad = degToRad(latitude);
    double decRad = degToRad(dec);
    double angle = -radToDeg(std::atan(1.0 / (shadowFactor + std::tan(std::abs(latRad - decRad)))));
    double cosH = (-std::sin(degToRad(angle)) - std::sin(latRad) * std::sin(decRad)) / (std::cos(latRad) * std::cos(decRad));
    if (cosH > 1.0 || cosH < -1.0) return 0.0;
    return radToDeg(std::acos(cosH)) / 15.0;
}
} // namespace

PrayerEngine::PrayerEngine() = default;
PrayerEngine::~PrayerEngine() = default;

void PrayerEngine::setLocation(double latitude, double longitude, double timezoneOffsetHours) {
    m_latitude = latitude;
    m_longitude = longitude;
    m_timezone = timezoneOffsetHours;
}

std::string PrayerEngine::formatTime24(double fractionalHours) {
    if (fractionalHours < 0.0 || fractionalHours >= 24.0) {
        fractionalHours = fixHour(fractionalHours);
    }
    int hours = static_cast<int>(fractionalHours);
    int minutes = static_cast<int>(std::round((fractionalHours - hours) * 60.0));
    if (minutes >= 60) {
        hours = (hours + 1) % 24;
        minutes = 0;
    }
    std::ostringstream oss;
    oss << std::setw(2) << std::setfill('0') << hours << ":"
        << std::setw(2) << std::setfill('0') << minutes;
    return oss.str();
}

PrayerSchedule PrayerEngine::calculateDailySchedule(int64_t epochMs) {
    // Julian Day from Unix Epoch
    double julianDate = 2440587.5 + (epochMs / 86400000.0);
    double noon = computeMidDay(julianDate, m_longitude, m_timezone);

    // Egyptian General Authority: Fajr = 19.5 deg, Isha = 17.5 deg
    double fajrDiff = computeTimeAngle(julianDate, m_latitude, 19.5, true);
    double sunriseDiff = computeTimeAngle(julianDate, m_latitude, 0.833, true);
    double sunsetDiff = computeTimeAngle(julianDate, m_latitude, 0.833, false);
    double ishaDiff = computeTimeAngle(julianDate, m_latitude, 17.5, false);
    double asrDiff = computeAsrAngle(julianDate, m_latitude, 1.0); // Standard Shafi'i shadow = 1

    double tFajr = fixHour(noon + fajrDiff);
    double tSunrise = fixHour(noon + sunriseDiff);
    double tDhuhr = fixHour(noon);
    double tAsr = fixHour(noon + asrDiff);
    double tMaghrib = fixHour(noon + sunsetDiff);
    double tIsha = fixHour(noon + ishaDiff);

    PrayerSchedule schedule;
    schedule.fajr = formatTime24(tFajr);
    schedule.sunrise = formatTime24(tSunrise);
    schedule.dhuhr = formatTime24(tDhuhr);
    schedule.asr = formatTime24(tAsr);
    schedule.maghrib = formatTime24(tMaghrib);
    schedule.isha = formatTime24(tIsha);

    return schedule;
}

} // namespace dayrhythm
