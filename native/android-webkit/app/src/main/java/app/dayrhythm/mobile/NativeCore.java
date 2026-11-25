package app.dayrhythm.mobile;

/**
 * JNI Bridge to the shared C++20 DayRhythmCore library (libdayrhythm_core.so).
 */
public final class NativeCore {
    private static volatile boolean loaded = false;

    static {
        try {
            System.loadLibrary("dayrhythm_core");
            loaded = true;
        } catch (Throwable ignored) {
            loaded = false;
        }
    }

    private NativeCore() {}

    public static boolean isLoaded() {
        return loaded;
    }

    public static native byte[] encodeSpircFrame(
            int action,
            int entityKind,
            String entityId,
            String clientId,
            String opId,
            long lamportSeq,
            long timestampMs,
            boolean deleted,
            byte[] payload
    );

    public static native boolean lamportWins(
            long localSeq,
            String localClientId,
            long incomingSeq,
            String incomingClientId
    );
}
