#pragma once

#include "types.hpp"
#include "spirc.hpp"
#include "storage.hpp"
#include "prayer.hpp"
#include <memory>
#include <string>

namespace dayrhythm {

class DayRhythmEngine {
public:
    static std::shared_ptr<DayRhythmEngine> create(
        const std::string& dbPath,
        const std::string& deviceId,
        DeviceType deviceType,
        const std::string& userId
    );

    virtual ~DayRhythmEngine() = default;

    virtual bool initialize() = 0;
    
    // Subsystem access
    virtual std::shared_ptr<SpircEngine> getSpirc() = 0;
    virtual std::shared_ptr<StorageManager> getStorage() = 0;
    virtual std::shared_ptr<PrayerEngine> getPrayer() = 0;

    // High-level Actions
    virtual void onDismissAlarm(const std::string& alertId) = 0;
    virtual void onLogWaterCup(int32_t slotIndex) = 0;
    virtual void onTakeMedication(const std::string& medId) = 0;
};

} // namespace dayrhythm
