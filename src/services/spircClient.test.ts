import { describe, expect, it } from 'vitest';
import {
  SPIRC_ACTION,
  SPIRC_ENTITY,
  decodeSpircFrame,
  encodeSpircFrame,
  lamportWins,
} from './spircClient';

describe('spircClient binary Protobuf v3 codec', () => {
  it('encodes and decodes SpircFrame identically to C++20 DayRhythmCore', () => {
    const payload = new TextEncoder().encode('{"cupsLogged":6}');
    const bytes = encodeSpircFrame({
      version: 1,
      action: SPIRC_ACTION.UPSERT,
      entityKind: SPIRC_ENTITY.STATE_V3,
      entityId: 'state_v3',
      clientId: 'win-pc-1',
      opId: 'op_abc',
      lamportSeq: 42,
      timestampMs: 1795560000000,
      deleted: false,
      payload,
    });

    const decoded = decodeSpircFrame(bytes);
    expect(decoded.version).toBe(1);
    expect(decoded.action).toBe(SPIRC_ACTION.UPSERT);
    expect(decoded.entityKind).toBe(SPIRC_ENTITY.STATE_V3);
    expect(decoded.entityId).toBe('state_v3');
    expect(decoded.clientId).toBe('win-pc-1');
    expect(decoded.opId).toBe('op_abc');
    expect(decoded.lamportSeq).toBe(42);
    expect(decoded.timestampMs).toBe(1795560000000);
    expect(decoded.deleted).toBe(false);
    expect(new TextDecoder().decode(decoded.payload)).toBe('{"cupsLogged":6}');
  });

  it('resolves Lamport ties deterministically by clientId', () => {
    expect(lamportWins(10, 'a', 11, 'a')).toBe(true);
    expect(lamportWins(10, 'b', 10, 'a')).toBe(false);
    expect(lamportWins(10, 'a', 10, 'b')).toBe(true);
  });
});
