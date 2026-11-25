/**
 * DayRhythm Spirc Binary Protobuf v3 Wire Client + Native SQLite Bridge.
 * Matches proto/spirc.proto, core/src/spirc_codec.cpp, and broker/cloudflare-worker/src/spirc_wire.ts.
 */

export const SPIRC_ACTION = {
  UPSERT: 1,
  DELETE_TOMBSTONE: 2,
  DISMISS_ALARM: 3,
  BATTERY_TELEMETRY: 4,
  FULL_SYNC_REQUEST: 5,
  HEARTBEAT: 6,
} as const;

export const SPIRC_ENTITY = {
  STATE_V3: 1,
  MEDICATION: 2,
  MEMORY: 3,
  CHAT_SESSION: 4,
  ALARM: 5,
} as const;

export interface SpircFrame {
  version: number;
  action: number;
  entityKind: number;
  entityId: string;
  clientId: string;
  opId: string;
  lamportSeq: number;
  timestampMs: number;
  deleted: boolean;
  payload: Uint8Array;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function writeVarint(out: number[], val: number): void {
  let v = BigInt(Math.max(0, Math.floor(val)));
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
}

function writeTag(out: number[], fieldNum: number, wireType: number): void {
  writeVarint(out, (fieldNum << 3) | (wireType & 0x07));
}

function writeUint(out: number[], fieldNum: number, val: number): void {
  if (!val) return;
  writeTag(out, fieldNum, 0);
  writeVarint(out, val);
}

function writeBytes(out: number[], fieldNum: number, bytes: Uint8Array): void {
  if (bytes.length === 0) return;
  writeTag(out, fieldNum, 2);
  writeVarint(out, bytes.length);
  for (let i = 0; i < bytes.length; i++) out.push(bytes[i]);
}

export function encodeSpircFrame(frame: SpircFrame): Uint8Array {
  const out: number[] = [];
  writeUint(out, 1, frame.version || 1);
  writeUint(out, 2, frame.action);
  writeUint(out, 3, frame.entityKind);
  if (frame.entityId) writeBytes(out, 4, textEncoder.encode(frame.entityId));
  if (frame.clientId) writeBytes(out, 5, textEncoder.encode(frame.clientId));
  if (frame.opId) writeBytes(out, 6, textEncoder.encode(frame.opId));
  writeUint(out, 7, frame.lamportSeq);
  writeUint(out, 8, frame.timestampMs);
  if (frame.deleted) {
    writeTag(out, 9, 0);
    out.push(1);
  }
  if (frame.payload && frame.payload.length > 0) {
    writeBytes(out, 10, frame.payload);
  }
  return new Uint8Array(out);
}

export function decodeSpircFrame(data: Uint8Array): SpircFrame {
  const frame: SpircFrame = {
    version: 1,
    action: 0,
    entityKind: 0,
    entityId: '',
    clientId: '',
    opId: '',
    lamportSeq: 0,
    timestampMs: 0,
    deleted: false,
    payload: new Uint8Array(0),
  };

  let pos = 0;
  const readVarint = (): bigint => {
    let val = 0n;
    let shift = 0n;
    while (pos < data.length && shift <= 63n) {
      const b = data[pos++];
      val |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) return val;
      shift += 7n;
    }
    throw new Error('Malformed varint');
  };

  while (pos < data.length) {
    const tag = Number(readVarint());
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;
    if (wireType === 0) {
      const val = Number(readVarint());
      if (fieldNum === 1) frame.version = val;
      else if (fieldNum === 2) frame.action = val;
      else if (fieldNum === 3) frame.entityKind = val;
      else if (fieldNum === 7) frame.lamportSeq = val;
      else if (fieldNum === 8) frame.timestampMs = val;
      else if (fieldNum === 9) frame.deleted = val !== 0;
    } else if (wireType === 2) {
      const len = Number(readVarint());
      if (pos + len > data.length) throw new Error('Truncated bytes field');
      const slice = data.subarray(pos, pos + len);
      pos += len;
      if (fieldNum === 4) frame.entityId = textDecoder.decode(slice);
      else if (fieldNum === 5) frame.clientId = textDecoder.decode(slice);
      else if (fieldNum === 6) frame.opId = textDecoder.decode(slice);
      else if (fieldNum === 10) frame.payload = slice;
    } else if (wireType === 5) {
      pos += 4;
    } else if (wireType === 1) {
      pos += 8;
    } else {
      throw new Error(`Unsupported wire type: ${wireType}`);
    }
  }
  return frame;
}

export function lamportWins(
  localSeq: number,
  localClientId: string,
  incomingSeq: number,
  incomingClientId: string
): boolean {
  if (incomingSeq > localSeq) return true;
  if (incomingSeq < localSeq) return false;
  return incomingClientId > localClientId;
}

export function persistToNativeSqlite(
  entityId: string,
  entityKind: number,
  lamportSeq: number,
  clientId: string,
  timestampMs: number,
  deleted: boolean,
  payloadObj: unknown
): boolean {
  try {
    const win = window as unknown as {
      DayRhythmNative?: {
        sqliteUpsert?: (
          id: string,
          kind: number,
          seq: number,
          cid: string,
          ts: number,
          del: boolean,
          json: string
        ) => boolean;
      };
      DayRhythmAndroid?: {
        sqliteUpsert?: (
          id: string,
          kind: number,
          seq: number,
          cid: string,
          ts: number,
          del: boolean,
          json: string
        ) => boolean;
      };
    };
    const bridge = win.DayRhythmNative || win.DayRhythmAndroid;
    if (bridge?.sqliteUpsert) {
      return bridge.sqliteUpsert(
        entityId,
        entityKind,
        lamportSeq,
        clientId,
        timestampMs,
        deleted,
        JSON.stringify(payloadObj ?? {})
      );
    }
  } catch {
    // Non-Android host
  }
  return false;
}

export function loadFromNativeSqlite(): Array<{
  entityId: string;
  entityKind: number;
  lamportSeq: number;
  clientId: string;
  timestampMs: number;
  deleted: boolean;
  payload: Record<string, unknown>;
}> {
  try {
    const win = window as unknown as {
      DayRhythmNative?: { sqliteLoadAll?: () => string };
      DayRhythmAndroid?: { sqliteLoadAll?: () => string };
    };
    const bridge = win.DayRhythmNative || win.DayRhythmAndroid;
    if (!bridge?.sqliteLoadAll) return [];
    const raw = bridge.sqliteLoadAll();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row: Record<string, unknown>) => {
        let payload = row.payload as Record<string, unknown> | undefined;
        if ((!payload || typeof payload !== 'object') && typeof row.payloadJson === 'string') {
          try {
            payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
          } catch {
            payload = undefined;
          }
        }
        return {
          entityId: String(row.entityId ?? ''),
          entityKind: Number(row.entityKind ?? 0),
          lamportSeq: Number(row.lamportSeq ?? 0),
          clientId: String(row.clientId ?? ''),
          timestampMs: Number(row.timestampMs ?? 0),
          deleted: Boolean(row.deleted),
          payload: payload && typeof payload === 'object' ? payload : {},
        };
      })
      .filter((r) => Boolean(r.entityId));
  } catch {
    return [];
  }
}

export interface SpircClusterHandle {
  isOpen: () => boolean;
  sendJsonState: (entityId: string, entityKind: number, action: number, payloadObj: unknown) => boolean;
  sendDismissAlarm: (alertId?: string, action?: string, extra?: Record<string, unknown>) => boolean;
  close: () => void;
}

export function connectSpircCluster(
  workerBaseUrl: string,
  uid: string,
  clientId: string,
  onRemoteState: (entityId: string, entityKind: number, payload: Record<string, unknown>, frame: SpircFrame) => void
): SpircClusterHandle {
  let ws: WebSocket | null = null;
  let closed = false;
  let lamportSeq = Date.now();
  let retryMs = 1500;
  let retryTimer: number | null = null;
  let pingTimer: number | null = null;
  let pongTimeoutTimer: number | null = null;

  const clearHeartbeat = () => {
    if (pingTimer !== null) {
      window.clearInterval(pingTimer);
      pingTimer = null;
    }
    if (pongTimeoutTimer !== null) {
      window.clearTimeout(pongTimeoutTimer);
      pongTimeoutTimer = null;
    }
  };

  const toWsUrl = (base: string): string => {
    const clean = base.trim().replace(/\/+$/, '');
    const wsProto = clean.startsWith('https://')
      ? clean.replace(/^https:\/\//, 'wss://')
      : clean.startsWith('http://')
        ? clean.replace(/^http:\/\//, 'ws://')
        : clean.startsWith('ws://') || clean.startsWith('wss://')
          ? clean
          : `wss://${clean}`;
    return `${wsProto}/ws?uid=${encodeURIComponent(uid)}`;
  };

  const connect = () => {
    if (closed || !workerBaseUrl || !uid) return;
    try {
      ws = new WebSocket(toWsUrl(workerBaseUrl));
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        retryMs = 1500;
        clearHeartbeat();
        pingTimer = window.setInterval(() => {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          try {
            ws.send('ping');
            if (pongTimeoutTimer !== null) window.clearTimeout(pongTimeoutTimer);
            pongTimeoutTimer = window.setTimeout(() => {
              pongTimeoutTimer = null;
              try {
                ws?.close();
              } catch {
                // ignore
              }
            }, 10_000);
          } catch {
            // ignore
          }
        }, 20_000);
        // Request catch-up delta from Durable Object SQLite
        const req = encodeSpircFrame({
          version: 1,
          action: SPIRC_ACTION.FULL_SYNC_REQUEST,
          entityKind: SPIRC_ENTITY.STATE_V3,
          entityId: 'state_v3',
          clientId,
          opId: `sync_${Date.now()}`,
          lamportSeq,
          timestampMs: Date.now(),
          deleted: false,
          payload: new Uint8Array(0),
        });
        ws?.send(req.buffer as ArrayBuffer);
      };
      ws.onmessage = (ev) => {
        if (pongTimeoutTimer !== null) {
          window.clearTimeout(pongTimeoutTimer);
          pongTimeoutTimer = null;
        }
        if (!(ev.data instanceof ArrayBuffer)) return;
        try {
          const frame = decodeSpircFrame(new Uint8Array(ev.data));
          if (frame.clientId === clientId) return;
          if (frame.lamportSeq > lamportSeq) lamportSeq = frame.lamportSeq;
          const isTransientSignal =
            frame.action === SPIRC_ACTION.DISMISS_ALARM ||
            frame.action === SPIRC_ACTION.BATTERY_TELEMETRY ||
            frame.entityKind === SPIRC_ENTITY.ALARM;
          if (frame.payload.length > 0) {
            const parsed = JSON.parse(textDecoder.decode(frame.payload)) as Record<string, unknown>;
            if (!isTransientSignal) {
              persistToNativeSqlite(
                frame.entityId,
                frame.entityKind,
                frame.lamportSeq,
                frame.clientId,
                frame.timestampMs,
                frame.deleted,
                parsed
              );
            }
            onRemoteState(frame.entityId, frame.entityKind, parsed, frame);
          } else if (frame.action === SPIRC_ACTION.DISMISS_ALARM) {
            onRemoteState(frame.entityId || 'alarm_dismiss', frame.entityKind || SPIRC_ENTITY.ALARM, {}, frame);
          }
        } catch {
          // ignore malformed wire frame
        }
      };
      ws.onclose = () => {
        clearHeartbeat();
        ws = null;
        if (!closed) {
          retryTimer = window.setTimeout(connect, retryMs);
          retryMs = Math.min(30_000, retryMs * 2);
        }
      };
      ws.onerror = () => {
        clearHeartbeat();
        ws?.close();
      };
    } catch {
      // ignore socket errors
    }
  };

  connect();

  return {
    isOpen: () => ws !== null && ws.readyState === WebSocket.OPEN,
    sendJsonState: (entityId, entityKind, action, payloadObj) => {
      lamportSeq = Math.max(lamportSeq + 1, Date.now());
      const jsonBytes = textEncoder.encode(JSON.stringify(payloadObj ?? {}));
      const isTransientSignal =
        action === SPIRC_ACTION.DISMISS_ALARM ||
        action === SPIRC_ACTION.BATTERY_TELEMETRY ||
        entityKind === SPIRC_ENTITY.ALARM;
      if (!isTransientSignal) {
        persistToNativeSqlite(entityId, entityKind, lamportSeq, clientId, Date.now(), false, payloadObj);
      }
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      const bytes = encodeSpircFrame({
        version: 1,
        action,
        entityKind,
        entityId,
        clientId,
        opId: `op_${lamportSeq.toString(36)}`,
        lamportSeq,
        timestampMs: Date.now(),
        deleted: false,
        payload: jsonBytes,
      });
      ws.send(bytes.buffer as ArrayBuffer);
      return true;
    },
    sendDismissAlarm: (alertId = 'all', action = 'dismiss', extra) => {
      lamportSeq = Math.max(lamportSeq + 1, Date.now());
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      const now = Date.now();
      const jsonBytes = textEncoder.encode(
        JSON.stringify({
          alertId,
          action,
          clientId,
          dismissedBy: clientId,
          timestampMs: now,
          ...(extra || {}),
        })
      );
      const bytes = encodeSpircFrame({
        version: 1,
        action: SPIRC_ACTION.DISMISS_ALARM,
        entityKind: SPIRC_ENTITY.ALARM,
        entityId: 'alarm_dismiss',
        clientId,
        opId: `dism_${lamportSeq.toString(36)}`,
        lamportSeq,
        timestampMs: now,
        deleted: false,
        payload: jsonBytes,
      });
      ws.send(bytes.buffer as ArrayBuffer);
      return true;
    },
    close: () => {
      closed = true;
      clearHeartbeat();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      ws?.close();
      ws = null;
    },
  };
}
