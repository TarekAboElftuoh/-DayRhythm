#include "dayrhythm/core.h"

#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

namespace {

inline void write_varint(std::vector<uint8_t>& out, uint64_t val) {
  while (val >= 0x80) {
    out.push_back(static_cast<uint8_t>((val & 0x7F) | 0x80));
    val >>= 7;
  }
  out.push_back(static_cast<uint8_t>(val));
}

inline void write_tag(std::vector<uint8_t>& out, uint32_t field_num, uint8_t wire_type) {
  write_varint(out, (static_cast<uint64_t>(field_num) << 3) | (wire_type & 0x07));
}

inline void write_uint32_field(std::vector<uint8_t>& out, uint32_t field_num, uint32_t val) {
  if (val == 0) return;
  write_tag(out, field_num, 0);
  write_varint(out, val);
}

inline void write_uint64_field(std::vector<uint8_t>& out, uint32_t field_num, uint64_t val) {
  if (val == 0) return;
  write_tag(out, field_num, 0);
  write_varint(out, val);
}

inline void write_bool_field(std::vector<uint8_t>& out, uint32_t field_num, bool val) {
  if (!val) return;
  write_tag(out, field_num, 0);
  out.push_back(1);
}

inline void write_bytes_field(std::vector<uint8_t>& out, uint32_t field_num, const uint8_t* ptr, size_t len) {
  if (!ptr || len == 0) return;
  write_tag(out, field_num, 2);
  write_varint(out, len);
  out.insert(out.end(), ptr, ptr + len);
}

inline void write_str_field(std::vector<uint8_t>& out, uint32_t field_num, const char* str) {
  if (!str) return;
  size_t len = std::strlen(str);
  write_bytes_field(out, field_num, reinterpret_cast<const uint8_t*>(str), len);
}

bool read_varint(const uint8_t* data, size_t len, size_t& pos, uint64_t& out_val) {
  out_val = 0;
  int shift = 0;
  while (pos < len && shift <= 63) {
    uint8_t b = data[pos++];
    out_val |= static_cast<uint64_t>(b & 0x7F) << shift;
    if ((b & 0x80) == 0) return true;
    shift += 7;
  }
  return false;
}

char* alloc_cstr(const uint8_t* ptr, size_t len) {
  char* buf = static_cast<char*>(std::malloc(len + 1));
  if (!buf) return nullptr;
  if (len > 0 && ptr) std::memcpy(buf, ptr, len);
  buf[len] = '\0';
  return buf;
}

}  // namespace

extern "C" {

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
    size_t* out_len) {
  if (!out_buf || !out_len) return -1;

  std::vector<uint8_t> buf;
  buf.reserve(64 + payload_len);

  write_uint32_field(buf, 1, 1);  // version = 1
  write_uint32_field(buf, 2, action);
  write_uint32_field(buf, 3, entity_kind);
  write_str_field(buf, 4, entity_id);
  write_str_field(buf, 5, client_id);
  write_str_field(buf, 6, op_id);
  write_uint64_field(buf, 7, lamport_seq);
  write_uint64_field(buf, 8, timestamp_ms);
  write_bool_field(buf, 9, deleted != 0);
  write_bytes_field(buf, 10, payload, payload_len);

  uint8_t* raw = static_cast<uint8_t*>(std::malloc(buf.size() > 0 ? buf.size() : 1));
  if (!raw) return -2;
  if (!buf.empty()) std::memcpy(raw, buf.data(), buf.size());
  *out_buf = raw;
  *out_len = buf.size();
  return 0;
}

DR_API int dr_spirc_decode(
    const uint8_t* data,
    size_t len,
    dr_spirc_frame_t* out_frame) {
  if (!data || !out_frame) return -1;
  std::memset(out_frame, 0, sizeof(*out_frame));

  size_t pos = 0;
  while (pos < len) {
    uint64_t tag = 0;
    if (!read_varint(data, len, pos, tag)) {
      dr_spirc_free_frame(out_frame);
      return -2;
    }
    uint32_t field_num = static_cast<uint32_t>(tag >> 3);
    uint8_t wire_type = static_cast<uint8_t>(tag & 0x07);

    if (wire_type == 0) {
      uint64_t val = 0;
      if (!read_varint(data, len, pos, val)) {
        dr_spirc_free_frame(out_frame);
        return -3;
      }
      switch (field_num) {
        case 1: out_frame->version = static_cast<uint32_t>(val); break;
        case 2: out_frame->action = static_cast<uint32_t>(val); break;
        case 3: out_frame->entity_kind = static_cast<uint32_t>(val); break;
        case 7: out_frame->lamport_seq = val; break;
        case 8: out_frame->timestamp_ms = val; break;
        case 9: out_frame->deleted = val ? 1 : 0; break;
        default: break;
      }
    } else if (wire_type == 2) {
      uint64_t blen = 0;
      if (!read_varint(data, len, pos, blen) || blen > (len - pos)) {
        dr_spirc_free_frame(out_frame);
        return -4;
      }
      const uint8_t* slice = data + pos;
      size_t slen = static_cast<size_t>(blen);
      pos += slen;

      switch (field_num) {
        case 4:
          std::free(out_frame->entity_id);
          out_frame->entity_id = alloc_cstr(slice, slen);
          break;
        case 5:
          std::free(out_frame->client_id);
          out_frame->client_id = alloc_cstr(slice, slen);
          break;
        case 6:
          std::free(out_frame->op_id);
          out_frame->op_id = alloc_cstr(slice, slen);
          break;
        case 10:
          std::free(out_frame->payload);
          out_frame->payload = static_cast<uint8_t*>(std::malloc(slen > 0 ? slen : 1));
          if (out_frame->payload && slen > 0) std::memcpy(out_frame->payload, slice, slen);
          out_frame->payload_len = slen;
          break;
        default: break;
      }
    } else if (wire_type == 5) {
      if (pos + 4 > len) { dr_spirc_free_frame(out_frame); return -5; }
      pos += 4;
    } else if (wire_type == 1) {
      if (pos + 8 > len) { dr_spirc_free_frame(out_frame); return -5; }
      pos += 8;
    } else {
      dr_spirc_free_frame(out_frame);
      return -6;
    }
  }
  return 0;
}

DR_API void dr_spirc_free_frame(dr_spirc_frame_t* frame) {
  if (!frame) return;
  std::free(frame->entity_id);
  std::free(frame->client_id);
  std::free(frame->op_id);
  std::free(frame->payload);
  std::memset(frame, 0, sizeof(*frame));
}

DR_API void dr_free(void* ptr) {
  std::free(ptr);
}

DR_API int dr_lamport_wins(
    uint64_t local_seq,
    const char* local_client_id,
    uint64_t incoming_seq,
    const char* incoming_client_id) {
  if (incoming_seq > local_seq) return 1;
  if (incoming_seq < local_seq) return 0;
  std::string l = local_client_id ? local_client_id : "";
  std::string r = incoming_client_id ? incoming_client_id : "";
  return (r > l) ? 1 : 0;
}

}  // extern "C"
