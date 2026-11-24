#include "dayrhythm/spirc.hpp"
#include <chrono>
#include <algorithm>

namespace dayrhythm {

SpircEngine::SpircEngine(std::string deviceId, DeviceType deviceType, std::string userId)
    : m_deviceId(std::move(deviceId))
    , m_deviceType(deviceType)
    , m_userId(std::move(userId))
{
    m_clock.tick(m_deviceId);
}

SpircEngine::~SpircEngine() = default;

void SpircEngine::setClusterId(const std::string& clusterId) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_clusterId = clusterId;
}

void SpircEngine::setMessageSender(SpircMessageCallback sender) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_sender = std::move(sender);
}

void SpircEngine::broadcastAction(ActionType action, const std::string& targetAlertId, const ActiveAlert& alert) {
    SpircMessage msg;
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_sequenceNumber++;
        m_clock.tick(m_deviceId);

        msg.sequenceNumber = m_sequenceNumber;
        msg.senderEpochMs = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
        msg.senderDeviceId = m_deviceId;
        msg.userId = m_userId;
        msg.action = action;
        msg.targetAlertId = targetAlertId;
        msg.clock = m_clock;
        msg.alert = alert;
    }

    if (m_sender) {
        m_sender(msg);
    }
}

void SpircEngine::handleIncomingFrame(const SpircMessage& frame) {
    std::lock_guard<std::mutex> lock(m_mutex);
    
    // Ignore loopback reflections from self
    if (frame.senderDeviceId == m_deviceId) {
        return;
    }

    // Merge vector clocks and update sequence
    m_clock.merge(frame.clock);
    m_clock.tick(m_deviceId);
    m_sequenceNumber = std::max(m_sequenceNumber, frame.sequenceNumber) + 1;

    switch (frame.action) {
        case ActionType::Dismiss: {
            // Remove from active alerts immediately
            auto it = std::remove_if(m_activeAlerts.begin(), m_activeAlerts.end(),
                [&frame](const ActiveAlert& a) {
                    return a.alertId == frame.targetAlertId;
                });
            m_activeAlerts.erase(it, m_activeAlerts.end());
            break;
        }
        case ActionType::Trigger: {
            // Add if not present
            bool exists = false;
            for (auto& a : m_activeAlerts) {
                if (a.alertId == frame.targetAlertId) {
                    exists = true;
                    a.isRinging = true;
                    break;
                }
            }
            if (!exists && !frame.targetAlertId.empty()) {
                m_activeAlerts.push_back(frame.alert);
            }
            break;
        }
        case ActionType::Snooze: {
            for (auto& a : m_activeAlerts) {
                if (a.alertId == frame.targetAlertId) {
                    a.isRinging = false;
                    a.snoozeCount++;
                    break;
                }
            }
            break;
        }
        default:
            break;
    }
}

void SpircEngine::triggerAlert(const ActiveAlert& alert) {
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_activeAlerts.push_back(alert);
    }
    broadcastAction(ActionType::Trigger, alert.alertId, alert);
}

void SpircEngine::dismissAlert(const std::string& alertId) {
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        auto it = std::remove_if(m_activeAlerts.begin(), m_activeAlerts.end(),
            [&alertId](const ActiveAlert& a) {
                return a.alertId == alertId;
            });
        m_activeAlerts.erase(it, m_activeAlerts.end());
    }
    broadcastAction(ActionType::Dismiss, alertId);
}

void SpircEngine::snoozeAlert(const std::string& alertId, int32_t /*minutes*/) {
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        for (auto& a : m_activeAlerts) {
            if (a.alertId == alertId) {
                a.isRinging = false;
                a.snoozeCount++;
                break;
            }
        }
    }
    broadcastAction(ActionType::Snooze, alertId);
}

void SpircEngine::logHydrationCup(int32_t cupIndex) {
    ActiveAlert alert;
    alert.alertId = "cup_" + std::to_string(cupIndex);
    alert.alertType = AlertType::Hydration;
    broadcastAction(ActionType::HydrateCup, alert.alertId, alert);
}

void SpircEngine::takeMedication(const std::string& medId) {
    ActiveAlert alert;
    alert.alertId = medId;
    alert.alertType = AlertType::Medication;
    broadcastAction(ActionType::MedicationTaken, medId, alert);
}

int64_t SpircEngine::getCurrentSequence() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_sequenceNumber;
}

const VectorClock& SpircEngine::getVectorClock() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_clock;
}

std::vector<ActiveAlert> SpircEngine::getActiveAlerts() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_activeAlerts;
}

} // namespace dayrhythm
