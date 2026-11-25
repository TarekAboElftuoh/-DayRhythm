#include "dayrhythm/core.h"

#include <cassert>
#include <cstring>
#include <iostream>

int main() {
  const char* json_payload = "{\"cupsLogged\":6}";
  uint8_t* encoded = nullptr;
  size_t encoded_len = 0;

  int rc = dr_spirc_encode(
      1,  // ACTION_UPSERT
      1,  // ENTITY_STATE_V3
      "state_v3",
      "win-pc-1",
      "op_abc",
      42,
      1795560000000ULL,
      0,
      reinterpret_cast<const uint8_t*>(json_payload),
      std::strlen(json_payload),
      &encoded,
      &encoded_len);
  assert(rc == 0);
  assert(encoded != nullptr && encoded_len > 10);

  dr_spirc_frame_t decoded{};
  rc = dr_spirc_decode(encoded, encoded_len, &decoded);
  assert(rc == 0);
  assert(decoded.version == 1);
  assert(decoded.action == 1);
  assert(decoded.entity_kind == 1);
  assert(std::strcmp(decoded.entity_id, "state_v3") == 0);
  assert(std::strcmp(decoded.client_id, "win-pc-1") == 0);
  assert(std::strcmp(decoded.op_id, "op_abc") == 0);
  assert(decoded.lamport_seq == 42);
  assert(decoded.timestamp_ms == 1795560000000ULL);
  assert(decoded.deleted == 0);
  assert(decoded.payload_len == std::strlen(json_payload));
  assert(std::memcmp(decoded.payload, json_payload, decoded.payload_len) == 0);

  dr_spirc_free_frame(&decoded);
  dr_free(encoded);

  assert(dr_lamport_wins(10, "a", 11, "a") == 1);
  assert(dr_lamport_wins(10, "b", 10, "a") == 0);
  assert(dr_lamport_wins(10, "a", 10, "b") == 1);

  std::cout << "DayRhythmCore tests passed!\n";
  return 0;
}
