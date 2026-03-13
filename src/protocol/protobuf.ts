function encodeVarint(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Varint value must be a non-negative integer: ${value}`);
  }

  const bytes: number[] = [];
  let remaining = value;

  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 0x80);
  }

  bytes.push(remaining);
  return Buffer.from(bytes);
}

function decodeUtf8IfValid(value: Buffer): string | null {
  if (value.length === 0) {
    return '';
  }

  const decoded = value.toString('utf8');
  const encoded = Buffer.from(decoded, 'utf8');

  if (!encoded.equals(value)) {
    return null;
  }

  return decoded;
}

export class ProtobufEncoder {
  private readonly chunks: Buffer[] = [];

  writeVarint(field: number, value: number): void {
    this.writeTag(field, 0);
    this.chunks.push(encodeVarint(value));
  }

  writeString(field: number, value: string): void {
    this.writeBytes(field, Buffer.from(value, 'utf8'));
  }

  writeBytes(field: number, data: Buffer): void {
    this.writeTag(field, 2);
    this.chunks.push(encodeVarint(data.length));
    this.chunks.push(data);
  }

  writeMessage(field: number, encoder: ProtobufEncoder): void {
    this.writeBytes(field, encoder.toBuffer());
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }

  private writeTag(field: number, wireType: number): void {
    if (!Number.isInteger(field) || field <= 0) {
      throw new Error(`Field number must be a positive integer: ${field}`);
    }

    this.chunks.push(encodeVarint((field << 3) | wireType));
  }
}

export function decodeVarint(buffer: Buffer, offset: number): [value: number, newOffset: number] {
  let value = 0;
  let shift = 0;
  let cursor = offset;

  while (cursor < buffer.length) {
    const byte = buffer.readUInt8(cursor);
    value += (byte & 0x7f) * 2 ** shift;
    cursor += 1;

    if ((byte & 0x80) === 0) {
      return [value, cursor];
    }

    shift += 7;
  }

  throw new Error('Unexpected end of buffer while decoding varint');
}

export function extractStrings(buffer: Buffer): string[] {
  const result: string[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    let key: number;
    [key, offset] = decodeVarint(buffer, offset);

    const wireType = key & 0x07;

    if (wireType === 0) {
      [, offset] = decodeVarint(buffer, offset);
      continue;
    }

    if (wireType === 1) {
      offset += 8;
      continue;
    }

    if (wireType === 2) {
      let length: number;
      [length, offset] = decodeVarint(buffer, offset);

      const end = offset + length;
      if (end > buffer.length) {
        break;
      }

      const slice = buffer.subarray(offset, end);
      const candidate = decodeUtf8IfValid(slice);
      if (candidate !== null) {
        result.push(candidate);
      } else {
        const nested = extractStrings(slice);
        result.push(...nested);
      }

      offset = end;
      continue;
    }

    if (wireType === 5) {
      offset += 4;
      continue;
    }

    break;
  }

  return result;
}
