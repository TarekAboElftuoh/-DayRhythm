import { decodeSpircFrame, encodeSpircFrame, lamportWins, SpircFrame } from './spirc_wire';

export interface Env {
  CLUSTER_DO: DurableObjectNamespace;
  AUTH_TOKEN?: string;
}

const ACTION_UPSERT = 1;
const ACTION_DELETE_TOMBSTONE = 2;
const ACTION_DISMISS_ALARM = 3;
const ACTION_BATTERY_TELEMETRY = 4;
const ACTION_FULL_SYNC_REQUEST = 5;
const ENTITY_ALARM = 5;

export class ClusterDO implements DurableObject {
  private ctx: DurableObjectState;
  private initialized = false;

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
  }

  private ensureSchema(): void {
    if (this.initialized) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS spirc_entities (
        entity_id TEXT PRIMARY KEY,
        entity_kind INTEGER NOT NULL,
        lamport_seq INTEGER NOT NULL,
        client_id TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        payload BLOB NOT NULL
      );
    `);
    this.initialized = true;
  }

  private upsertIfWinner(frame: SpircFrame): boolean {
    if (!frame.entityId) return true; // Transient telemetry/dismiss without storage key
    const rows = [
      ...this.ctx.storage.sql.exec<{ lamport_seq: number; client_id: string }>(
        `SELECT lamport_seq, client_id FROM spirc_entities WHERE entity_id = ?`,
        frame.entityId
      ),
    ];
    if (rows.length > 0) {
      const existing = rows[0];
      if (!lamportWins(existing.lamport_seq, existing.client_id, frame.lamportSeq, frame.clientId)) {
        return false;
      }
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO spirc_entities (entity_id, entity_kind, lamport_seq, client_id, timestamp_ms, deleted, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(entity_id) DO UPDATE SET
         entity_kind = excluded.entity_kind,
         lamport_seq = excluded.lamport_seq,
         client_id = excluded.client_id,
         timestamp_ms = excluded.timestamp_ms,
         deleted = excluded.deleted,
         payload = excluded.payload`,
      frame.entityId,
      frame.entityKind,
      frame.lamportSeq,
      frame.clientId,
      frame.timestampMs,
      frame.deleted ? 1 : 0,
      frame.payload
    );
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    this.ensureSchema();
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith('/admin/import') && request.method === 'POST') {
      const body = (await request.json()) as {
        entities: Array<{
          entityId: string;
          entityKind: number;
          lamportSeq: number;
          clientId: string;
          timestampMs: number;
          deleted?: boolean;
          payloadJson: string;
        }>;
      };
      const enc = new TextEncoder();
      let imported = 0;
      for (const item of body.entities ?? []) {
        const won = this.upsertIfWinner({
          version: 1,
          action: item.deleted ? ACTION_DELETE_TOMBSTONE : ACTION_UPSERT,
          entityKind: item.entityKind,
          entityId: item.entityId,
          clientId: item.clientId || 'migration',
          opId: `mig_${Date.now()}`,
          lamportSeq: item.lamportSeq || 1,
          timestampMs: item.timestampMs || Date.now(),
          deleted: !!item.deleted,
          payload: enc.encode(item.payloadJson),
        });
        if (won) imported++;
      }
      return Response.json({ ok: true, imported });
    }

    if (url.pathname.endsWith('/state')) {
      const dec = new TextDecoder();
      const rows = [
        ...this.ctx.storage.sql.exec<{
          entity_id: string;
          entity_kind: number;
          lamport_seq: number;
          client_id: string;
          timestamp_ms: number;
          deleted: number;
          payload: ArrayBuffer;
        }>(`SELECT * FROM spirc_entities`),
      ];
      return Response.json({
        count: rows.length,
        entities: rows.map((r) => ({
          entityId: r.entity_id,
          entityKind: r.entity_kind,
          lamportSeq: r.lamport_seq,
          clientId: r.client_id,
          timestampMs: r.timestamp_ms,
          deleted: r.deleted === 1,
          payloadJson: dec.decode(new Uint8Array(r.payload)),
        })),
      });
    }

    return new Response('DayRhythm ClusterDO Ready', { status: 200 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.ensureSchema();
    if (typeof message === 'string') {
      if (message === 'ping') ws.send('pong');
      return;
    }

    const bytes = new Uint8Array(message);
    const frame = decodeSpircFrame(bytes);

    if (frame.action === ACTION_FULL_SYNC_REQUEST) {
      const rows = [
        ...this.ctx.storage.sql.exec<{
          entity_id: string;
          entity_kind: number;
          lamport_seq: number;
          client_id: string;
          timestamp_ms: number;
          deleted: number;
          payload: ArrayBuffer;
        }>(`SELECT * FROM spirc_entities`),
      ];
      for (const r of rows) {
        const out = encodeSpircFrame({
          version: 1,
          action: r.deleted === 1 ? ACTION_DELETE_TOMBSTONE : ACTION_UPSERT,
          entityKind: r.entity_kind,
          entityId: r.entity_id,
          clientId: r.client_id,
          opId: 'sync_snapshot',
          lamportSeq: r.lamport_seq,
          timestampMs: r.timestamp_ms,
          deleted: r.deleted === 1,
          payload: new Uint8Array(r.payload),
        });
        ws.send(out);
      }
      return;
    }

    const isTransientAlarm =
      frame.entityKind === ENTITY_ALARM ||
      frame.entityId === 'alarm_trigger' ||
      frame.action === ACTION_DISMISS_ALARM;

    if (!isTransientAlarm && (frame.action === ACTION_UPSERT || frame.action === ACTION_DELETE_TOMBSTONE)) {
      const accepted = this.upsertIfWinner(frame);
      if (!accepted) return;
    }

    // Broadcast binary Protobuf frame (<100 bytes) to all peer devices in the cluster
    if (
      frame.action === ACTION_UPSERT ||
      frame.action === ACTION_DELETE_TOMBSTONE ||
      frame.action === ACTION_DISMISS_ALARM ||
      frame.action === ACTION_BATTERY_TELEMETRY
    ) {
      for (const peer of this.ctx.getWebSockets()) {
        if (peer !== ws) {
          try {
            peer.send(bytes);
          } catch {
            // Peer disconnected
          }
        }
      }
    }
  }
}
