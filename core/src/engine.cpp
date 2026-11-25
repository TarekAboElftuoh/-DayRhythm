#include "dayrhythm/engine.hpp"

namespace dayrhythm {

class DayRhythmEngineImpl : public DayRhythmEngine {
public:
    DayRhythmEngineImpl(
        std::string dbPath,
        std::string deviceId,
        DeviceType deviceType,
        std::string userId
    )
        : m_dbPath(std::move(dbPath))
        , m_deviceId(std::move(deviceId))
        , m_deviceType(deviceType)
        , m_userId(std::move(userId))
    {
        m_storage = std::make_shared<StorageManager>(m_dbPath);
        m_spirc = std::make_shared<SpircEngine>(m_deviceId, m_deviceType, m_userId);
        m_prayer = std::make_shared<PrayerEngine>();
    }

    bool initialize() override {
        bool ok = m_storage->initialize();
        m_spirc->setClusterId("cluster_" + m_userId);
        return ok;
    }

    std::shared_ptr<SpircEngine> getSpirc() override {
        return m_spirc;
    }

    std::shared_ptr<StorageManager> getStorage() override {
        return m_storage;
    }

    std::shared_ptr<PrayerEngine> getPrayer() override {
        return m_prayer;
    }

    void onDismissAlarm(const std::string& alertId) override {
        m_spirc->dismissAlert(alertId);
    }

    void onLogWaterCup(int32_t slotIndex) override {
        m_spirc->logHydrationCup(slotIndex);
    }

    void onTakeMedication(const std::string& medId) override {
        m_spirc->takeMedication(medId);
    }

private:
    std::string m_dbPath;
    std::string m_deviceId;
    DeviceType m_deviceType;
    std::string m_userId;

    std::shared_ptr<StorageManager> m_storage;
    std::shared_ptr<SpircEngine> m_spirc;
    std::shared_ptr<PrayerEngine> m_prayer;
};

std::shared_ptr<DayRhythmEngine> DayRhythmEngine::create(
    const std::string& dbPath,
    const std::string& deviceId,
    DeviceType deviceType,
    const std::string& userId
) {
    return std::make_shared<DayRhythmEngineImpl>(dbPath, deviceId, deviceType, userId);
}

} // namespace dayrhythm
