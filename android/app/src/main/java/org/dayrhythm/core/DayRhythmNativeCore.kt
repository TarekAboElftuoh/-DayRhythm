package org.dayrhythm.core

class DayRhythmNativeCore(
    private val dbPath: String,
    private val deviceId: String,
    private val userId: String
) {
    private var nativeHandle: Long = 0

    companion object {
        init {
            try {
                System.loadLibrary("dayrhythm_jni")
            } catch (e: UnsatisfiedLinkError) {
                System.err.println("Native library dayrhythm_jni not loaded: ${e.message}")
            }
        }
    }

    var onFrameBroadcastListener: ((ByteArray) -> Unit)? = null

    fun initialize(): Boolean {
        nativeHandle = nativeCreate(dbPath, deviceId, 1 /* MobileAndroid */, userId)
        if (nativeHandle != 0L) {
            nativeRegisterCallback(nativeHandle)
            return nativeInit(nativeHandle)
        }
        return false
    }

    fun dismissAlert(alertId: String) {
        if (nativeHandle != 0L) {
            nativeDismissAlert(nativeHandle, alertId)
        }
    }

    fun logWaterCup(slotIndex: Int) {
        if (nativeHandle != 0L) {
            nativeLogWaterCup(nativeHandle, slotIndex)
        }
    }

    fun takeMedication(medId: String) {
        if (nativeHandle != 0L) {
            nativeTakeMedication(nativeHandle, medId)
        }
    }

    fun destroy() {
        if (nativeHandle != 0L) {
            nativeDestroy(nativeHandle)
            nativeHandle = 0
        }
    }

    // Called from C++ JNI when Spirc emits an event
    fun onNativeFrameReceived(frameBytes: ByteArray) {
        onFrameBroadcastListener?.invoke(frameBytes)
    }

    private external fun nativeCreate(dbPath: String, deviceId: String, deviceType: Int, userId: String): Long
    private external fun nativeDestroy(handle: Long)
    private external fun nativeInit(handle: Long): Boolean
    private external fun nativeRegisterCallback(handle: Long)
    private external fun nativeDismissAlert(handle: Long, alertId: String)
    private external fun nativeLogWaterCup(handle: Long, slotIndex: Int)
    private external fun nativeTakeMedication(handle: Long, medId: String)
}
