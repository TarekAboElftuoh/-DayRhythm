import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createRateLimiter, verifyFirebaseIdToken } from './security';

const geminiWsLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
  keyPrefix: 'ws_gemini',
});

export interface SyncClientEntry {
  ws: WebSocket;
  clientId: string;
}

export interface ServerBatterySnapshot {
  levelPct: number;
  charging: boolean;
  chargeLimitPct: number;
  updatedAtMs: number;
  deviceLabel: string;
}

export const syncRooms = new Map<string, Set<SyncClientEntry>>();
export const latestBatteryByUid = new Map<string, ServerBatterySnapshot>();

export function broadcastUserSync(
  uid: string,
  payload: Record<string, unknown>,
  excludeClientId?: string
): void {
  if (!uid) return;
  const room = syncRooms.get(uid);
  if (!room || room.size === 0) return;
  const serialized = JSON.stringify(payload);
  for (const entry of room) {
    if (excludeClientId && entry.clientId === excludeClientId) continue;
    if (entry.ws.readyState === WebSocket.OPEN) {
      try {
        entry.ws.send(serialized);
      } catch {
        // ignore broken socket
      }
    }
  }
}

export function attachWebSocketServer(httpServer: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = (request.url ?? '').split('?')[0];
    if (pathname === '/ws/sync') {
      if ('setNoDelay' in socket && typeof socket.setNoDelay === 'function') {
        socket.setNoDelay(true);
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  const aliveSockets = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (ws) => {
    let joinedUid = '';
    let entry: SyncClientEntry | null = null;
    const cancelledChatIds = new Set<string>();
    aliveSockets.set(ws, true);

    ws.on('pong', () => {
      aliveSockets.set(ws, true);
    });

    const removeFromRoom = () => {
      if (joinedUid && entry) {
        const room = syncRooms.get(joinedUid);
        room?.delete(entry);
        if (room && room.size === 0) {
          syncRooms.delete(joinedUid);
        }
        entry = null;
      }
    };

    ws.on('message', async (raw) => {
      aliveSockets.set(ws, true);
      try {
        const msg = JSON.parse(String(raw)) as {
          type?: string;
          uid?: string; idToken?: string; token?: string;
          clientId?: string;
          opId?: string;
          scope?: string;
          action?: string;
          undoSnapshot?: unknown;
          timestampMs?: number;
          battery?: Partial<ServerBatterySnapshot>;
          requestId?: string;
          payload?: ChatRequestPayload;
        };
        if (msg.type === 'join' && typeof msg.uid === 'string' && msg.uid.length > 0 && msg.uid.length <= 128) {
          const token = typeof msg.idToken === 'string' ? msg.idToken : typeof msg.token === 'string' ? msg.token : '';
          if (!token) {
            ws.send(JSON.stringify({ type: 'error', error: 'Authentication required to join room.' }));
            return;
          }
          try {
            const decoded = await verifyFirebaseIdToken(token);
            if (decoded.uid !== msg.uid) {
              ws.send(JSON.stringify({ type: 'error', error: 'UID mismatch for Firebase ID token.' }));
              return;
            }
          } catch {
            ws.send(JSON.stringify({ type: 'error', error: 'Invalid or expired Firebase ID token.' }));
            return;
          }
          removeFromRoom();
          joinedUid = msg.uid;
          entry = { ws, clientId: String(msg.clientId ?? 'anon').slice(0, 64) };
          if (!syncRooms.has(joinedUid)) {
            syncRooms.set(joinedUid, new Set());
          }
          syncRooms.get(joinedUid)!.add(entry);
          ws.send(JSON.stringify({ type: 'joined', uid: joinedUid, peers: syncRooms.get(joinedUid)!.size }));
          const cachedBattery = latestBatteryByUid.get(joinedUid);
          if (cachedBattery) {
            ws.send(JSON.stringify({ type: 'battery', clientId: 'server_cache', battery: cachedBattery }));
          }
        } else if (msg.type === 'broadcast' && joinedUid && entry) {
          broadcastUserSync(
            joinedUid,
            {
              type: 'sync',
              opId: msg.opId ?? `ws_${Date.now().toString(36)}`,
              clientId: entry.clientId,
              scope: msg.scope ?? 'all',
              action: msg.action ?? 'update',
              undoSnapshot: msg.undoSnapshot,
              timestampMs: msg.timestampMs ?? Date.now(),
            },
            entry.clientId
          );
        } else if (msg.type === 'battery' && joinedUid && entry && msg.battery && typeof msg.battery === 'object') {
          const rawLvl = Number(msg.battery.levelPct);
          if (Number.isFinite(rawLvl)) {
            const snapshot: ServerBatterySnapshot = {
              levelPct: Math.max(0, Math.min(100, Math.round(rawLvl))),
              charging: Boolean(msg.battery.charging),
              chargeLimitPct: Math.max(
                60,
                Math.min(100, Math.round(Number(msg.battery.chargeLimitPct) || 90))
              ),
              updatedAtMs: Date.now(),
              deviceLabel: String(msg.battery.deviceLabel ?? 'الهاتف').trim().slice(0, 40) || 'الهاتف',
            };
            latestBatteryByUid.set(joinedUid, snapshot);
            broadcastUserSync(
              joinedUid,
              {
                type: 'battery',
                clientId: entry.clientId,
                battery: snapshot,
              },
              entry.clientId
            );
          }
        } else if (msg.type === 'gemini_chat_cancel' && typeof msg.requestId === 'string') {
          cancelledChatIds.add(msg.requestId);
        } else if (msg.type === 'gemini_chat' && typeof msg.requestId === 'string' && msg.payload?.message) {
          const reqId = msg.requestId;
          if (!joinedUid || !entry) {
            ws.send(JSON.stringify({ type: 'gemini_chat_error', requestId: reqId, error: 'يرجى تسجيل الدخول والمصادقة أولاً قبل استخدام المحادثة.' }));
            return;
          }
          const rl = geminiWsLimiter.check(joinedUid);
          if (!rl.allowed) {
            ws.send(JSON.stringify({ type: 'gemini_chat_error', requestId: reqId, error: `تم تجاوز الحد المسموح للطلبات. يرجى المحاولة بعد ${rl.retryAfterSec} ثانية.` }));
            return;
          }
          cancelledChatIds.delete(reqId);
          void executeGeminiChatStream(
            msg.payload,
            (evt) => {
              if (ws.readyState !== WebSocket.OPEN || cancelledChatIds.has(reqId)) return;
              ws.send(JSON.stringify({ ...evt, type: `gemini_chat_${evt.type}`, requestId: reqId }));
            },
            () => ws.readyState !== WebSocket.OPEN || cancelledChatIds.has(reqId)
          )
            .catch((err: unknown) => {
              if (ws.readyState === WebSocket.OPEN && !cancelledChatIds.has(reqId)) {
                ws.send(
                  JSON.stringify({
                    type: 'gemini_chat_error',
                    requestId: reqId,
                    error: formatFriendlyGeminiErrorAr(err),
                  })
                );
              }
            })
            .finally(() => {
              cancelledChatIds.delete(reqId);
            });
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        // ignore malformed WS payload
      }
    });

    ws.on('close', () => {
      cancelledChatIds.clear();
      removeFromRoom();
    });
    ws.on('error', () => {
      cancelledChatIds.clear();
      removeFromRoom();
      try {
        ws.terminate();
      } catch {
        // ignore
      }
    });
  });

  // Server-side dead-connection reaper: terminates half-open WebSockets automatically
  const wsHeartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      if (aliveSockets.get(client) === false) {
        try {
          client.terminate();
        } catch {
          // ignore
        }
        return;
      }
      aliveSockets.set(client, false);
      try {
        client.ping();
      } catch {
        try {
          client.terminate();
        } catch {
          // ignore
        }
      }
    });
  }, 30_000);
  wss.on('close', () => clearInterval(wsHeartbeatInterval));
  return wss;
}
