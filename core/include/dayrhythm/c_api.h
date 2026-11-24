#pragma once

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#if defined(_WIN32)
  #if defined(DAYRHYTHM_CORE_EXPORTS)
    #define DAYRHYTHM_API __declspec(dllexport)
  #else
    #define DAYRHYTHM_API
  #endif
#else
  #define DAYRHYTHM_API __attribute__((visibility("default")))
#endif

typedef void* DayRhythmEngineHandle;

typedef void (*DayRhythmFrameCallback)(
    const uint8_t* payload,
    int32_t payload_size,
    void* user_data
);

// Engine lifecycle
DAYRHYTHM_API DayRhythmEngineHandle dayrhythm_create(
    const char* db_path,
    const char* device_id,
    int32_t device_type, // 1=MobileAndroid, 2=DesktopWindows
    const char* user_id
);

DAYRHYTHM_API void dayrhythm_destroy(DayRhythmEngineHandle handle);

DAYRHYTHM_API bool dayrhythm_init(DayRhythmEngineHandle handle);

// Spirc Frame Broadcasting
DAYRHYTHM_API void dayrhythm_set_frame_callback(
    DayRhythmEngineHandle handle,
    DayRhythmFrameCallback callback,
    void* user_data
);

DAYRHYTHM_API void dayrhythm_handle_incoming_frame(
    DayRhythmEngineHandle handle,
    const uint8_t* payload,
    int32_t payload_size
);

// High-level Actions
DAYRHYTHM_API void dayrhythm_dismiss_alert(DayRhythmEngineHandle handle, const char* alert_id);
DAYRHYTHM_API void dayrhythm_log_water_cup(DayRhythmEngineHandle handle, int32_t slot_index);
DAYRHYTHM_API void dayrhythm_take_medication(DayRhythmEngineHandle handle, const char* med_id);

// Queries
DAYRHYTHM_API int64_t dayrhythm_get_current_sequence(DayRhythmEngineHandle handle);
DAYRHYTHM_API bool dayrhythm_get_streaks(DayRhythmEngineHandle handle, int32_t* out_commitment, int32_t* out_water);

// Prayer schedule calculation
DAYRHYTHM_API bool dayrhythm_calculate_prayer_schedule(
    DayRhythmEngineHandle handle,
    int64_t epoch_ms,
    char* out_fajr,
    char* out_dhuhr,
    char* out_asr,
    char* out_maghrib,
    char* out_isha,
    int32_t buffer_len
);

#ifdef __cplusplus
}
#endif
