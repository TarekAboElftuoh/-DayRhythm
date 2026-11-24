#include "dayrhythm/c_api.h"
#include "dayrhythm/engine.hpp"
#include <cstring>
#include <iostream>

using namespace dayrhythm;

struct EngineContext {
    std::shared_ptr<DayRhythmEngine> engine;
    DayRhythmFrameCallback callback{nullptr};
    void* callbackUserData{nullptr};
};

extern "C" {

DayRhythmEngineHandle dayrhythm_create(
    const char* db_path,
    const char* device_id,
    int32_t device_type,
    const char* user_id
) {
    if (!db_path || !device_id || !user_id) return nullptr;

    auto ctx = new EngineContext();
    auto type = static_cast<DeviceType>(device_type);
    ctx->engine = DayRhythmEngine::create(db_path, device_id, type, user_id);

    // Setup Spirc sender callback
    ctx->engine->getSpirc()->setMessageSender([ctx](const SpircMessage& msg) {
        if (ctx->callback) {
            // Lightweight binary serialization:
            // [seq(8)][epoch(8)][action(4)][alert_id_len(4)][alert_id(N)]
            std::vector<uint8_t> buffer;
            auto append64 = [&buffer](int64_t v) {
                for (int i = 0; i < 8; ++i) buffer.push_back((v >> (i * 8)) & 0xFF);
            };
            auto append32 = [&buffer](int32_t v) {
                for (int i = 0; i < 4; ++i) buffer.push_back((v >> (i * 8)) & 0xFF);
            };

            append64(msg.sequenceNumber);
            append64(msg.senderEpochMs);
            append32(static_cast<int32_t>(msg.action));
            
            append32(static_cast<int32_t>(msg.targetAlertId.size()));
            buffer.insert(buffer.end(), msg.targetAlertId.begin(), msg.targetAlertId.end());

            ctx->callback(buffer.data(), static_cast<int32_t>(buffer.size()), ctx->callbackUserData);
        }
    });

    return static_cast<DayRhythmEngineHandle>(ctx);
}

void dayrhythm_destroy(DayRhythmEngineHandle handle) {
    if (!handle) return;
    auto ctx = static_cast<EngineContext*>(handle);
    delete ctx;
}

bool dayrhythm_init(DayRhythmEngineHandle handle) {
    if (!handle) return false;
    auto ctx = static_cast<EngineContext*>(handle);
    return ctx->engine->initialize();
}

void dayrhythm_set_frame_callback(
    DayRhythmEngineHandle handle,
    DayRhythmFrameCallback callback,
    void* user_data
) {
    if (!handle) return;
    auto ctx = static_cast<EngineContext*>(handle);
    ctx->callback = callback;
    ctx->callbackUserData = user_data;
}

void dayrhythm_handle_incoming_frame(
    DayRhythmEngineHandle handle,
    const uint8_t* payload,
    int32_t payload_size
) {
    if (!handle || !payload || payload_size < 24) return;
    auto ctx = static_cast<EngineContext*>(handle);

    auto read64 = [](const uint8_t* p) {
        int64_t v = 0;
        for (int i = 0; i < 8; ++i) v |= (static_cast<int64_t>(p[i]) << (i * 8));
        return v;
    };
    auto read32 = [](const uint8_t* p) {
        int32_t v = 0;
        for (int i = 0; i < 4; ++i) v |= (static_cast<int32_t>(p[i]) << (i * 8));
        return v;
    };

    SpircMessage msg;
    msg.sequenceNumber = read64(payload);
    msg.senderEpochMs = read64(payload + 8);
    msg.action = static_cast<ActionType>(read32(payload + 16));
    
    int32_t alertIdLen = read32(payload + 20);
    if (24 + alertIdLen <= payload_size) {
        msg.targetAlertId = std::string(reinterpret_cast<const char*>(payload + 24), alertIdLen);
    }

    ctx->engine->getSpirc()->handleIncomingFrame(msg);
}

void dayrhythm_dismiss_alert(DayRhythmEngineHandle handle, const char* alert_id) {
    if (!handle || !alert_id) return;
    auto ctx = static_cast<EngineContext*>(handle);
    ctx->engine->onDismissAlarm(alert_id);
}

void dayrhythm_log_water_cup(DayRhythmEngineHandle handle, int32_t slot_index) {
    if (!handle) return;
    auto ctx = static_cast<EngineContext*>(handle);
    ctx->engine->onLogWaterCup(slot_index);
}

void dayrhythm_take_medication(DayRhythmEngineHandle handle, const char* med_id) {
    if (!handle || !med_id) return;
    auto ctx = static_cast<EngineContext*>(handle);
    ctx->engine->onTakeMedication(med_id);
}

int64_t dayrhythm_get_current_sequence(DayRhythmEngineHandle handle) {
    if (!handle) return 0;
    auto ctx = static_cast<EngineContext*>(handle);
    return ctx->engine->getSpirc()->getCurrentSequence();
}

bool dayrhythm_get_streaks(DayRhythmEngineHandle handle, int32_t* out_commitment, int32_t* out_water) {
    if (!handle) return false;
    auto ctx = static_cast<EngineContext*>(handle);
    auto streaks = ctx->engine->getStorage()->getStreaks();
    if (out_commitment) *out_commitment = streaks.first;
    if (out_water) *out_water = streaks.second;
    return true;
}

bool dayrhythm_calculate_prayer_schedule(
    DayRhythmEngineHandle handle,
    int64_t epoch_ms,
    char* out_fajr,
    char* out_dhuhr,
    char* out_asr,
    char* out_maghrib,
    char* out_isha,
    int32_t buffer_len
) {
    if (!handle || buffer_len < 6) return false;
    auto ctx = static_cast<EngineContext*>(handle);
    auto sched = ctx->engine->getPrayer()->calculateDailySchedule(epoch_ms);

    auto copyStr = [buffer_len](char* dst, const std::string& src) {
        if (!dst) return;
        strncpy(dst, src.c_str(), buffer_len - 1);
        dst[buffer_len - 1] = '\0';
    };

    copyStr(out_fajr, sched.fajr);
    copyStr(out_dhuhr, sched.dhuhr);
    copyStr(out_asr, sched.asr);
    copyStr(out_maghrib, sched.maghrib);
    copyStr(out_isha, sched.isha);
    return true;
}

} // extern "C"
