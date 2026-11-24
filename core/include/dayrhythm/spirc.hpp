#pragma once

#include "types.hpp"
#include <functional>
#include <mutex>
#include <string>
#include <vector>

namespace dayrhythm {

using SpircMessageCallback = std::function<void(const SpircMessage&)>;

class SpircEngine {
public:
    SpircEngine(std::string deviceId, DeviceType deviceType, std::string userId);
    ~SpircEngine();

    void setClusterId(const std::string& clusterId);
    void setMessageSender(SpircMessageCallback sender);

    // Incoming frame from Cloud Broker (WebSocket / MQTT)
    void handleIncomingFrame(const SpircMessage& frame);

    // Local user actions
    void triggerAlert(const ActiveAlert& alert);
    void dismissAlert(const std::string& alertId);
    void snoozeAlert(const std::string& alertId, int32_t minutes);
    void logHydrationCup(int32_t cupIndex);
    void takeMedication(const std::string& medId);

    // Cluster State Queries
    int64_t getCurrentSequence() const;
    const VectorClock& getVectorClock() const;
    std::vector<ActiveAlert> getActiveAlerts() const;

private:
    std::string m_deviceId;
    DeviceType m_deviceType;
    std::string m_userId;
    std::string m_clusterId;
    
    int64_t m_sequenceNumber{0};
    VectorClock m_clock;
    std::vector<ActiveAlert> m_activeAlerts;
    
    SpircMessageCallback m_sender;
    mutable std::mutex m_mutex;

    void broadcastAction(ActionType action, const std::string& targetAlertId, const ActiveAlert& alert = {});
};

} // namespace dayrhythm
