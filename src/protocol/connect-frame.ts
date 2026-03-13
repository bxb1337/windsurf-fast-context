import { gunzipSync, gzipSync } from 'node:zlib';

const FRAME_HEADER_SIZE = 5;
const FLAG_COMPRESSED = 1;

export function connectFrameEncode(payload: Buffer, compressed = false): Buffer {
  const payloadBytes = compressed ? gzipSync(payload) : payload;
  const frame = Buffer.allocUnsafe(FRAME_HEADER_SIZE + payloadBytes.length);

  frame.writeUInt8(compressed ? FLAG_COMPRESSED : 0, 0);
  frame.writeUInt32BE(payloadBytes.length, 1);
  payloadBytes.copy(frame, FRAME_HEADER_SIZE);

  return frame;
}

export function connectFrameDecode(buffer: Buffer): Buffer[] {
  const decoded: Buffer[] = [];
  let offset = 0;

  while (offset + FRAME_HEADER_SIZE <= buffer.length) {
    const flags = buffer.readUInt8(offset);
    const payloadLength = buffer.readUInt32BE(offset + 1);
    const payloadStart = offset + FRAME_HEADER_SIZE;
    const payloadEnd = payloadStart + payloadLength;

    if (payloadEnd > buffer.length) {
      break;
    }

    const payload = buffer.subarray(payloadStart, payloadEnd);
    decoded.push(flags === FLAG_COMPRESSED ? gunzipSync(payload) : Buffer.from(payload));
    offset = payloadEnd;
  }

  return decoded;
}
