// Binary Protobuf v3 wire codec matching proto/spirc.proto and core/src/spirc_codec.cpp
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
