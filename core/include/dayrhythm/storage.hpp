#pragma once

#include "types.hpp"
#include <memory>
#include <string>
#include <vector>
#include <optional>

namespace dayrhythm {

class StorageManager {
public:
    explicit StorageManager(const std::string& dbPath);
    ~StorageManager();

    bool initialize();
    
    // User profile
    bool saveUserProfile(const std::string& uid, const std::string& email, const std::string& rawPayload);
    std::optional<std::string> getUserRawPayload(const std::string& uid);

    // Hydration
    bool logCup(const std::string& dateKey, int32_t slotIndex);
    std::vector<HydrationDay> getHydrationHistory();

    // Streaks
    bool updateStreaks(int32_t commitmentDays, bool commitmentDone, int32_t waterDays, bool waterDone);
    std::pair<int32_t, int32_t> getStreaks();

    // Medications
    bool saveMedication(const Medication& med);
    std::vector<Medication> getMedications();
    bool markDoseTaken(const std::string& medId, const std::string& dateKey);

    // Spirc State
    int64_t getSequenceNumber(const std::string& clusterId);
    bool updateSequenceNumber(const std::string& clusterId, int64_t seq, const std::string& vectorClockJson, const std::string& lastAction);

private:
    std::string m_dbPath;
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};

} // namespace dayrhythm
