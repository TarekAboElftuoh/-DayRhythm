const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
import { SpircFrame, encodeSpircFrame, decodeSpircFrame, SPIRC_ACTION, SPIRC_ENTITY } from './codec';
import { persistToNativeSqlite } from './sqlite';

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
        if (ws) {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
        }
        ws = null;
        if (!closed && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
          if (retryTimer !== null) window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(connect, retryMs);
          retryMs = Math.min(120_000, retryMs * 2);
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

