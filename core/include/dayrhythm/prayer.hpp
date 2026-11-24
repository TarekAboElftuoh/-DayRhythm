#pragma once

#include "types.hpp"
#include <string>
#include <cstdint>

namespace dayrhythm {

class PrayerEngine {
public:
    PrayerEngine();
    ~PrayerEngine();

    void setLocation(double latitude, double longitude, double timezoneOffsetHours);
    PrayerSchedule calculateDailySchedule(int64_t epochMs);

    static std::string formatTime24(double fractionalHours);

private:
    double m_latitude{30.0444};    // Default Cairo
    double m_longitude{31.2357};
    double m_timezone{2.0};
};

} // namespace dayrhythm
