#include <jni.h>
#include <string>
#include <vector>
#include "dayrhythm/c_api.h"

extern "C" {

static JavaVM* g_jvm = nullptr;
static jobject g_callbackObj = nullptr;
static jmethodID g_onFrameMethod = nullptr;

JNIEXPORT jint JNI_OnLoad(JavaVM* vm, void* /*reserved*/) {
    g_jvm = vm;
    return JNI_VERSION_1_6;
}

static void nativeFrameCallback(const uint8_t* payload, int32_t payload_size, void* /*user_data*/) {
    if (!g_jvm || !g_callbackObj || !g_onFrameMethod) return;

    JNIEnv* env = nullptr;
    bool attached = false;
    if (g_jvm->GetEnv((void**)&env, JNI_VERSION_1_6) != JNI_OK) {
        if (g_jvm->AttachCurrentThread(&env, nullptr) == JNI_OK) {
            attached = true;
        } else {
            return;
        }
    }

    jbyteArray jArr = env->NewByteArray(payload_size);
    env->SetByteArrayRegion(jArr, 0, payload_size, reinterpret_cast<const jbyte*>(payload));
    env->CallVoidMethod(g_callbackObj, g_onFrameMethod, jArr);
    env->DeleteLocalRef(jArr);

    if (attached) {
        g_jvm->DetachCurrentThread();
    }
}

JNIEXPORT jlong JNICALL
Java_org_dayrhythm_core_DayRhythmNativeCore_nativeCreate(
    JNIEnv* env,
    jobject /*thiz*/,
    jstring dbPath,
    jstring deviceId,
    jint deviceType,
    jstring userId
) {
    const char* c_dbPath = env->GetStringUTFChars(dbPath, nullptr);
    const char* c_deviceId = env->GetStringUTFChars(deviceId, nullptr);
    const char* c_userId = env->GetStringUTFChars(userId, nullptr);

    DayRhythmEngineHandle handle = dayrhythm_create(c_dbPath, c_deviceId, deviceType, c_userId);

    env->ReleaseStringUTFChars(dbPath, c_dbPath);
    env->ReleaseStringUTFChars(deviceId, c_deviceId);
    env->ReleaseStringUTFChars(userId, c_userId);

    return reinterpret_cast<jlong>(handle);
}

JNIEXPORT void JNICALL
Java_org_dayrhythm_core_DayRhythmNativeCore_nativeDestroy(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle
) {
    dayrhythm_destroy(reinterpret_cast<DayRhythmEngineHandle>(handle));
}

JNIEXPORT jboolean JNICALL
Java_org_dayrhythm_core_DayRhythmNativeCore_nativeInit(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle
) {
    return dayrhythm_init(reinterpret_cast<DayRhythmEngineHandle>(handle));
}

JNIEXPORT void JNICALL
Java_org_dayrhythm_core_DayRhythmNativeCore_nativeDismissAlert(
    JNIEnv* env,
    jobject /*thiz*/,
    jlong handle,
    jstring alertId
) {
    const char* c_alertId = env->GetStringUTFChars(alertId, nullptr);
    dayrhythm_dismiss_alert(reinterpret_cast<DayRhythmEngineHandle>(handle), c_alertId);
    env->ReleaseStringUTFChars(alertId, c_alertId);
}

JNIEXPORT void JNICALL
Java_org_dayrhythm_core_DayRhythmNativeCore_nativeLogWaterCup(
    JNIEnv* /*env*/,
    jobject /*thiz*/,
    jlong handle,
    jint slotIndex
) {
    dayrhythm_log_water_cup(reinterpret_cast<DayRhythmEngineHandle>(handle), slotIndex);
}

JNIEXPORT void JNICALL
Java_org_dayrhythm_core_DayRhythmNativeCore_nativeTakeMedication(
    JNIEnv* env,
    jobject /*thiz*/,
    jlong handle,
    jstring medId
) {
    const char* c_medId = env->GetStringUTFChars(medId, nullptr);
    dayrhythm_take_medication(reinterpret_cast<DayRhythmEngineHandle>(handle), c_medId);
    env->ReleaseStringUTFChars(medId, c_medId);
}

JNIEXPORT void JNICALL
Java_org_dayrhythm_core_DayRhythmNativeCore_nativeRegisterCallback(
    JNIEnv* env,
    jobject thiz,
    jlong handle
) {
    if (g_callbackObj) {
        env->DeleteGlobalRef(g_callbackObj);
    }
    g_callbackObj = env->NewGlobalRef(thiz);
    jclass cls = env->GetObjectClass(thiz);
    g_onFrameMethod = env->GetMethodID(cls, "onNativeFrameReceived", "([B)V");

    dayrhythm_set_frame_callback(reinterpret_cast<DayRhythmEngineHandle>(handle), nativeFrameCallback, nullptr);
}

} // extern "C"
