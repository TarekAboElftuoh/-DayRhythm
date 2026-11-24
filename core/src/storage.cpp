#include "dayrhythm/storage.hpp"
#include <iostream>
#include <fstream>
#include <sstream>

#if __has_include(<sqlite3.h>)
  #include <sqlite3.h>
  #define DAYRHYTHM_HAS_SQLITE 1
#else
  #define DAYRHYTHM_HAS_SQLITE 0
#endif

namespace dayrhythm {

struct StorageManager::Impl {
    std::string dbPath;
    bool isReady{false};

#if DAYRHYTHM_HAS_SQLITE
    sqlite3* dbHandle{nullptr};
#endif

    explicit Impl(std::string path) : dbPath(std::move(path)) {}

    ~Impl() {
#if DAYRHYTHM_HAS_SQLITE
        if (dbHandle) {
            sqlite3_close_v2(dbHandle);
            dbHandle = nullptr;
        }
#endif
    }
};

StorageManager::StorageManager(const std::string& dbPath)
    : m_dbPath(dbPath)
    , m_impl(std::make_unique<Impl>(dbPath))
{
}

StorageManager::~StorageManager() = default;

bool StorageManager::initialize() {
#if DAYRHYTHM_HAS_SQLITE
    int rc = sqlite3_open_v2(
        m_dbPath.c_str(),
        &m_impl->dbHandle,
        SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
        nullptr
    );
    if (rc == SQLITE_OK) {
        m_impl->isReady = true;
        return true;
    }
    m_impl->isReady = false;
    return false;
#else
    m_impl->isReady = true;
    return true;
#endif
}

bool StorageManager::saveUserProfile(const std::string& uid, const std::string& email, const std::string& rawPayload) {
#if DAYRHYTHM_HAS_SQLITE
    if (!m_impl->isReady || !m_impl->dbHandle) return false;
    const char* sql = "INSERT OR REPLACE INTO user_profiles (uid, email, raw_payload) VALUES (?, ?, ?);";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(m_impl->dbHandle, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

    sqlite3_bind_text(stmt, 1, uid.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 2, email.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, rawPayload.c_str(), -1, SQLITE_TRANSIENT);

    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return rc == SQLITE_DONE;
#else
    (void)uid; (void)email; (void)rawPayload;
    return true;
#endif
}

std::optional<std::string> StorageManager::getUserRawPayload(const std::string& uid) {
#if DAYRHYTHM_HAS_SQLITE
    if (!m_impl->isReady || !m_impl->dbHandle) return std::nullopt;
    const char* sql = "SELECT raw_payload FROM user_profiles WHERE uid = ?;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(m_impl->dbHandle, sql, -1, &stmt, nullptr) != SQLITE_OK) return std::nullopt;

    sqlite3_bind_text(stmt, 1, uid.c_str(), -1, SQLITE_TRANSIENT);
    std::optional<std::string> result = std::nullopt;
    if (sqlite3_step(stmt) == SQLITE_ROW) {
        const unsigned char* text = sqlite3_column_text(stmt, 0);
        if (text) {
            result = reinterpret_cast<const char*>(text);
        }
    }
    sqlite3_finalize(stmt);
    return result;
#else
    (void)uid;
    return std::nullopt;
#endif
}

bool StorageManager::logCup(const std::string& dateKey, int32_t slotIndex) {
    (void)dateKey; (void)slotIndex;
    return true;
}

std::vector<HydrationDay> StorageManager::getHydrationHistory() {
    std::vector<HydrationDay> list;
#if DAYRHYTHM_HAS_SQLITE
    if (!m_impl->isReady || !m_impl->dbHandle) return list;
    const char* sql = "SELECT date_key, label_ar, cups_logged, target_cups FROM hydration_history ORDER BY date_key ASC;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(m_impl->dbHandle, sql, -1, &stmt, nullptr) != SQLITE_OK) return list;

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        HydrationDay day;
        const char* dk = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
        const char* la = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
        day.dateKey = dk ? dk : "";
        day.labelAr = la ? la : "";
        day.cupsLogged = sqlite3_column_int(stmt, 2);
        day.targetCups = sqlite3_column_int(stmt, 3);
        list.push_back(day);
    }
    sqlite3_finalize(stmt);
#endif
    return list;
}

bool StorageManager::updateStreaks(int32_t commitmentDays, bool commitmentDone, int32_t waterDays, bool waterDone) {
#if DAYRHYTHM_HAS_SQLITE
    if (!m_impl->isReady || !m_impl->dbHandle) return false;
    const char* sql = "UPDATE streaks SET daily_commitment_days = ?, daily_commitment_done_today = ?, water_target_days = ?, water_target_done_today = ? WHERE id = 'primary';";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(m_impl->dbHandle, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

    sqlite3_bind_int(stmt, 1, commitmentDays);
    sqlite3_bind_int(stmt, 2, commitmentDone ? 1 : 0);
    sqlite3_bind_int(stmt, 3, waterDays);
    sqlite3_bind_int(stmt, 4, waterDone ? 1 : 0);

    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return rc == SQLITE_DONE;
#else
    (void)commitmentDays; (void)commitmentDone; (void)waterDays; (void)waterDone;
    return true;
#endif
}

std::pair<int32_t, int32_t> StorageManager::getStreaks() {
#if DAYRHYTHM_HAS_SQLITE
    if (m_impl->isReady && m_impl->dbHandle) {
        const char* sql = "SELECT daily_commitment_days, water_target_days FROM streaks WHERE id = 'primary';";
        sqlite3_stmt* stmt = nullptr;
        if (sqlite3_prepare_v2(m_impl->dbHandle, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                int c = sqlite3_column_int(stmt, 0);
                int w = sqlite3_column_int(stmt, 1);
                sqlite3_finalize(stmt);
                return {c, w};
            }
            sqlite3_finalize(stmt);
        }
    }
#endif
    return {20, 15};
}

bool StorageManager::saveMedication(const Medication& med) {
    (void)med;
    return true;
}

std::vector<Medication> StorageManager::getMedications() {
    return {};
}

bool StorageManager::markDoseTaken(const std::string& medId, const std::string& dateKey) {
    (void)medId; (void)dateKey;
    return true;
}

int64_t StorageManager::getSequenceNumber(const std::string& clusterId) {
#if DAYRHYTHM_HAS_SQLITE
    if (m_impl->isReady && m_impl->dbHandle) {
        const char* sql = "SELECT state_seq FROM spirc_cluster_state WHERE cluster_id = ?;";
        sqlite3_stmt* stmt = nullptr;
        if (sqlite3_prepare_v2(m_impl->dbHandle, sql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_text(stmt, 1, clusterId.c_str(), -1, SQLITE_TRANSIENT);
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                int64_t seq = sqlite3_column_int64(stmt, 0);
                sqlite3_finalize(stmt);
                return seq;
            }
            sqlite3_finalize(stmt);
        }
    }
#else
    (void)clusterId;
#endif
    return 1;
}

bool StorageManager::updateSequenceNumber(const std::string& clusterId, int64_t seq, const std::string& vectorClockJson, const std::string& lastAction) {
#if DAYRHYTHM_HAS_SQLITE
    if (!m_impl->isReady || !m_impl->dbHandle) return false;
    const char* sql = "UPDATE spirc_cluster_state SET state_seq = ?, vector_clock_json = ?, last_action = ? WHERE cluster_id = ?;";
    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(m_impl->dbHandle, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;

    sqlite3_bind_int64(stmt, 1, seq);
    sqlite3_bind_text(stmt, 2, vectorClockJson.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 3, lastAction.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt, 4, clusterId.c_str(), -1, SQLITE_TRANSIENT);

    int rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);
    return rc == SQLITE_DONE;
#else
    (void)clusterId; (void)seq; (void)vectorClockJson; (void)lastAction;
    return true;
#endif
}

} // namespace dayrhythm
