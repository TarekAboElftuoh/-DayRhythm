#pragma once

#include <string>
#include <vector>
#include <map>
#include <cstdint>

namespace dayrhythm {

enum class DeviceType {
    Unknown = 0,
    MobileAndroid = 1,
    DesktopWindows = 2,
    Web = 3
};

enum class AlertType {
    Unknown = 0,
    Prayer = 1,
    Medication = 2,
    Hydration = 3,
    Task = 4
};

enum class ActionType {
    Unknown = 0,
    Trigger = 1,
    Dismiss = 2,
    Snooze = 3,
    HydrateCup = 4,
    MedicationTaken = 5,
    Heartbeat = 6,
    SyncFull = 7
};

struct ActiveAlert {
    std::string alertId;
    AlertType alertType;
    std::string title;
    std::string subtitle;
    int64_t triggerEpochMs{0};
    int32_t snoozeCount{0};
    bool isRinging{false};
};

struct VectorClock {
    std::map<std::string, int64_t> nodeClocks;

    void tick(const std::string& nodeId) {
        nodeClocks[nodeId]++;
    }

    void merge(const VectorClock& other) {
        for (const auto& [node, clock] : other.nodeClocks) {
            nodeClocks[node] = std::max(nodeClocks[node], clock);
        }
    }
};

struct SpircMessage {
    int64_t sequenceNumber{0};
    int64_t senderEpochMs{0};
    std::string senderDeviceId;
    std::string userId;
    ActionType action{ActionType::Unknown};
    std::string targetAlertId;
    VectorClock clock;
    ActiveAlert alert;
};

struct HydrationDay {
    std::string dateKey;
    std::string labelAr;
    int32_t cupsLogged{0};
    int32_t targetCups{13};
    std::vector<bool> slots;
};

struct Medication {
    std::string id;
    std::string name;
    std::string time24;
    std::vector<std::string> times24;
    std::string doseNote;
    std::string courseEndDate;
    int32_t remainingDoses{-1};
    int32_t totalDoses{-1};
    int32_t refillAlertDays{3};
    std::vector<std::string> takenDates;
};

struct PrayerSchedule {
    std::string fajr;
    std::string sunrise;
    std::string dhuhr;
    std::string asr;
    std::string maghrib;
    std::string isha;
    std::string nextPrayerName;
    int64_t nextPrayerEpochMs{0};
    int32_t remainingSeconds{0};
};

} // namespace dayrhythm
