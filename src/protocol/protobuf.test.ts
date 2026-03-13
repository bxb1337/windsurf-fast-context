import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ProtobufEncoder, decodeVarint, extractStrings } from './protobuf.js';

const fixtureMsg1 = readFileSync(join(process.cwd(), 'test/fixtures/protobuf/msg-1.bin'));
const fixtureMsg2 = readFileSync(join(process.cwd(), 'test/fixtures/protobuf/msg-2.bin'));

describe('ProtobufEncoder', () => {
  it('matches fixture bytes for synthetic protobuf messages', () => {
    const encoder1 = new ProtobufEncoder();
    encoder1.writeVarint(1, 150);
    encoder1.writeString(2, 'alpha');

    const encoder2 = new ProtobufEncoder();
    encoder2.writeVarint(1, 42);
    encoder2.writeString(2, 'beta');

    expect(encoder1.toBuffer()).toEqual(fixtureMsg1);
    expect(encoder2.toBuffer()).toEqual(fixtureMsg2);
  });

  it('writes bytes and nested messages', () => {
    const nested = new ProtobufEncoder();
    nested.writeString(1, 'xy');

    const encoder = new ProtobufEncoder();
    encoder.writeBytes(3, Buffer.from([0xaa, 0xbb]));
    encoder.writeMessage(4, nested);

    expect(Array.from(encoder.toBuffer())).toEqual([
      0x1a,
      0x02,
      0xaa,
      0xbb,
      0x22,
      0x04,
      0x0a,
      0x02,
      0x78,
      0x79,
    ]);
  });
});

describe('decodeVarint', () => {
  it('decodes varint value and returns new offset', () => {
    const buffer = Buffer.from([0x96, 0x01, 0x2a]);

    const [first, firstOffset] = decodeVarint(buffer, 0);
    const [second, secondOffset] = decodeVarint(buffer, firstOffset);

    expect(first).toBe(150);
    expect(firstOffset).toBe(2);
    expect(second).toBe(42);
    expect(secondOffset).toBe(3);
  });
});

describe('extractStrings', () => {
  it('extractStrings returns all embedded strings from fixtures', () => {
    const combined = Buffer.concat([fixtureMsg1, fixtureMsg2]);

    expect(extractStrings(fixtureMsg1)).toEqual(['alpha']);
    expect(extractStrings(fixtureMsg2)).toEqual(['beta']);
    expect(extractStrings(combined)).toEqual(['alpha', 'beta']);
  });
});
