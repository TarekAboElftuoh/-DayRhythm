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

