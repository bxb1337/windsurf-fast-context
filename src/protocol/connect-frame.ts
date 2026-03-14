import { gunzipSync, gzipSync } from 'node:zlib';

const FRAME_HEADER_SIZE = 5;
export const FLAG_COMPRESSED = 1;
export const FLAG_END_STREAM = 2;

/**
 * Encode a protobuf payload into a Connect-RPC frame.
 *
 * @param payload - The raw protobuf bytes to encode
 * @param compress - Whether to gzip-compress the payload (default: true)
 *                   When true, the payload is gzipped and flags=1 is set
 * @returns Buffer containing: [flags byte][4-byte length][payload (gzipped if compress=true)]
 */
export function connectFrameEncode(payload: Buffer, compress = true): Buffer {
  const payloadBytes = compress ? gzipSync(payload) : payload;
  const frame = Buffer.allocUnsafe(FRAME_HEADER_SIZE + payloadBytes.length);

  frame.writeUInt8(compress ? FLAG_COMPRESSED : 0, 0);
  frame.writeUInt32BE(payloadBytes.length, 1);
  payloadBytes.copy(frame, FRAME_HEADER_SIZE);

  return frame;
}

export function connectFrameDecode(buffer: Buffer): { payloads: Buffer[]; isEndStream: boolean } {
  const decoded: Buffer[] = [];
  let offset = 0;
  let isEndStream = false;

  while (offset + FRAME_HEADER_SIZE <= buffer.length) {
    const flags = buffer.readUInt8(offset);
    const payloadLength = buffer.readUInt32BE(offset + 1);
    const payloadStart = offset + FRAME_HEADER_SIZE;
    const payloadEnd = payloadStart + payloadLength;

    if (payloadEnd > buffer.length) {
      break;
    }

    const payload = buffer.subarray(payloadStart, payloadEnd);
    decoded.push((flags & FLAG_COMPRESSED) !== 0 ? gunzipSync(payload) : Buffer.from(payload));
    
    if ((flags & FLAG_END_STREAM) !== 0) {
      isEndStream = true;
    }
    
    offset = payloadEnd;
  }

  return { payloads: decoded, isEndStream };
}
