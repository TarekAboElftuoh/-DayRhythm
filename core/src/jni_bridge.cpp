#include <jni.h>
#include <string>
#include "dayrhythm/core.h"

extern "C" {

JNIEXPORT jbyteArray JNICALL
Java_app_dayrhythm_mobile_NativeCore_encodeSpircFrame(
    JNIEnv* env,
    jclass /*clazz*/,
    jint action,
    jint entityKind,
    jstring entityId,
    jstring clientId,
    jstring opId,
    jlong lamportSeq,
    jlong timestampMs,
    jboolean deleted,
    jbyteArray payload) {
  const char* c_entity = entityId ? env->GetStringUTFChars(entityId, nullptr) : nullptr;
  const char* c_client = clientId ? env->GetStringUTFChars(clientId, nullptr) : nullptr;
  const char* c_op = opId ? env->GetStringUTFChars(opId, nullptr) : nullptr;

  jbyte* c_payload = nullptr;
  jsize payload_len = 0;
  if (payload) {
    payload_len = env->GetArrayLength(payload);
    c_payload = env->GetByteArrayElements(payload, nullptr);
  }

  uint8_t* out_buf = nullptr;
  size_t out_len = 0;
  int rc = dr_spirc_encode(
      static_cast<uint32_t>(action),
      static_cast<uint32_t>(entityKind),
      c_entity,
      c_client,
      c_op,
      static_cast<uint64_t>(lamportSeq),
      static_cast<uint64_t>(timestampMs),
      deleted ? 1 : 0,
      reinterpret_cast<const uint8_t*>(c_payload),
      static_cast<size_t>(payload_len),
      &out_buf,
      &out_len);

  if (c_entity) env->ReleaseStringUTFChars(entityId, c_entity);
  if (c_client) env->ReleaseStringUTFChars(clientId, c_client);
  if (c_op) env->ReleaseStringUTFChars(opId, c_op);
  if (c_payload) env->ReleaseByteArrayElements(payload, c_payload, JNI_ABORT);

  if (rc != 0 || !out_buf) return nullptr;

  jbyteArray result = env->NewByteArray(static_cast<jsize>(out_len));
  if (result && out_len > 0) {
    env->SetByteArrayRegion(result, 0, static_cast<jsize>(out_len), reinterpret_cast<const jbyte*>(out_buf));
  }
  dr_free(out_buf);
  return result;
}

JNIEXPORT jboolean JNICALL
Java_app_dayrhythm_mobile_NativeCore_lamportWins(
    JNIEnv* env,
    jclass /*clazz*/,
    jlong localSeq,
    jstring localClientId,
    jlong incomingSeq,
    jstring incomingClientId) {
  const char* l = localClientId ? env->GetStringUTFChars(localClientId, nullptr) : "";
  const char* r = incomingClientId ? env->GetStringUTFChars(incomingClientId, nullptr) : "";
  int wins = dr_lamport_wins(
      static_cast<uint64_t>(localSeq), l,
      static_cast<uint64_t>(incomingSeq), r);
  if (localClientId) env->ReleaseStringUTFChars(localClientId, l);
  if (incomingClientId) env->ReleaseStringUTFChars(incomingClientId, r);
  return wins ? JNI_TRUE : JNI_FALSE;
}

}  // extern "C"
