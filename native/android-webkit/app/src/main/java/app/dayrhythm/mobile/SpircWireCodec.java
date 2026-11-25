package app.dayrhythm.mobile;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Pure-Java Spirc Protobuf v3 wire codec matching proto/spirc.proto,
 * broker/cloudflare-worker/src/spirc_wire.ts, and src/services/spircClient.ts.
 */
public final class SpircWireCodec {
    public static final int ACTION_UPSERT = 1;
    public static final int ACTION_DELETE_TOMBSTONE = 2;
    public static final int ACTION_DISMISS_ALARM = 3;
    public static final int ACTION_BATTERY_TELEMETRY = 4;
    public static final int ACTION_FULL_SYNC_REQUEST = 5;
    public static final int ACTION_HEARTBEAT = 6;

    public static final int ENTITY_STATE_V3 = 1;
    public static final int ENTITY_MEDICATION = 2;
    public static final int ENTITY_MEMORY = 3;
    public static final int ENTITY_CHAT_SESSION = 4;
    public static final int ENTITY_ALARM = 5;

    public static final class SpircFrame {
        public int version = 1;
        public int action = 0;
        public int entityKind = 0;
        public String entityId = "";
        public String clientId = "";
        public String opId = "";
        public long lamportSeq = 0L;
        public long timestampMs = 0L;
        public boolean deleted = false;
        public byte[] payload = new byte[0];

        public String payloadAsUtf8() {
            if (payload == null || payload.length == 0) return "";
            return new String(payload, StandardCharsets.UTF_8);
        }
    }

    private SpircWireCodec() {}

    private static void writeVarint(ByteArrayOutputStream out, long value) {
        long v = Math.max(0L, value);
        while ((v & ~0x7FL) != 0L) {
            out.write((int) ((v & 0x7FL) | 0x80L));
            v >>>= 7;
        }
        out.write((int) v);
    }

    private static void writeTag(ByteArrayOutputStream out, int fieldNum, int wireType) {
        writeVarint(out, ((long) fieldNum << 3) | (wireType & 0x07L));
    }

    private static void writeUint(ByteArrayOutputStream out, int fieldNum, long value) {
        if (value == 0L) return;
        writeTag(out, fieldNum, 0);
        writeVarint(out, value);
    }

    private static void writeString(ByteArrayOutputStream out, int fieldNum, String value) {
        if (value == null || value.isEmpty()) return;
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        writeTag(out, fieldNum, 2);
        writeVarint(out, bytes.length);
        out.write(bytes, 0, bytes.length);
    }

    private static void writeBytes(ByteArrayOutputStream out, int fieldNum, byte[] bytes) {
        if (bytes == null || bytes.length == 0) return;
        writeTag(out, fieldNum, 2);
        writeVarint(out, bytes.length);
        out.write(bytes, 0, bytes.length);
    }

    public static byte[] encodeFrame(
            int action,
            int entityKind,
            String entityId,
            String clientId,
            String opId,
            long lamportSeq,
            long timestampMs,
            boolean deleted,
            byte[] payload
    ) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(128);
        writeUint(out, 1, 1L);
        writeUint(out, 2, action);
        writeUint(out, 3, entityKind);
        writeString(out, 4, entityId);
        writeString(out, 5, clientId);
        writeString(out, 6, opId);
        writeUint(out, 7, lamportSeq);
        writeUint(out, 8, timestampMs);
        if (deleted) {
            writeTag(out, 9, 0);
            out.write(1);
        }
        writeBytes(out, 10, payload);
        return out.toByteArray();
    }

    public static SpircFrame decodeFrame(byte[] data) {
        SpircFrame frame = new SpircFrame();
        if (data == null || data.length == 0) return frame;

        int[] pos = new int[]{0};
        while (pos[0] < data.length) {
            long tag = readVarint(data, pos);
            int fieldNum = (int) (tag >>> 3);
            int wireType = (int) (tag & 0x07L);
            if (wireType == 0) {
                long val = readVarint(data, pos);
                if (fieldNum == 1) frame.version = (int) val;
                else if (fieldNum == 2) frame.action = (int) val;
                else if (fieldNum == 3) frame.entityKind = (int) val;
                else if (fieldNum == 7) frame.lamportSeq = val;
                else if (fieldNum == 8) frame.timestampMs = val;
                else if (fieldNum == 9) frame.deleted = val != 0L;
            } else if (wireType == 2) {
                int len = (int) readVarint(data, pos);
                if (len < 0 || pos[0] + len > data.length) break;
                byte[] slice = new byte[len];
                System.arraycopy(data, pos[0], slice, 0, len);
                pos[0] += len;
                if (fieldNum == 4) frame.entityId = new String(slice, StandardCharsets.UTF_8);
                else if (fieldNum == 5) frame.clientId = new String(slice, StandardCharsets.UTF_8);
                else if (fieldNum == 6) frame.opId = new String(slice, StandardCharsets.UTF_8);
                else if (fieldNum == 10) frame.payload = slice;
            } else {
                break;
            }
        }
        return frame;
    }

    private static long readVarint(byte[] data, int[] pos) {
        long val = 0L;
        int shift = 0;
        while (pos[0] < data.length && shift <= 63) {
            int b = data[pos[0]++] & 0xFF;
            val |= (long) (b & 0x7F) << shift;
            if ((b & 0x80) == 0) return val;
            shift += 7;
        }
        return val;
    }
}
