#pragma once
#include <cstddef>
#include <cstdint>

#if defined(_WIN32)
  #if defined(DR_BUILDING_SHARED)
    #define DR_API __declspec(dllexport)
  #else
    #define DR_API __declspec(dllimport)
  #endif
#else
  #define DR_API __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  uint32_t version;
  uint32_t action;
  uint32_t entity_kind;
  char* entity_id;
  char* client_id;
  char* op_id;
  uint64_t lamport_seq;
  uint64_t timestamp_ms;
  uint8_t deleted;
  uint8_t* payload;
  size_t payload_len;
} dr_spirc_frame_t;

// Encodes a SpircFrame into Protobuf v3 binary wire format. Caller frees *out_buf with dr_free().
DR_API int dr_spirc_encode(
    uint32_t action,
    uint32_t entity_kind,
    const char* entity_id,
    const char* client_id,
    const char* op_id,
    uint64_t lamport_seq,
    uint64_t timestamp_ms,
    uint8_t deleted,
    const uint8_t* payload,
    size_t payload_len,
    uint8_t** out_buf,
    size_t* out_len);

// Decodes Protobuf v3 binary wire bytes into out_frame. Caller frees with dr_spirc_free_frame().
DR_API int dr_spirc_decode(
    const uint8_t* data,
    size_t len,
    dr_spirc_frame_t* out_frame);

DR_API void dr_spirc_free_frame(dr_spirc_frame_t* frame);
DR_API void dr_free(void* ptr);

// Deterministic Lamport logical clock total-order comparison (returns 1 if incoming wins, 0 otherwise).
DR_API int dr_lamport_wins(
    uint64_t local_seq,
    const char* local_client_id,
    uint64_t incoming_seq,
    const char* incoming_client_id);

#ifdef __cplusplus
}
#endif
