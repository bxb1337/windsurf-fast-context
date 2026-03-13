import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { connectFrameDecode, connectFrameEncode } from './connect-frame.js';

const fixtureSimpleFrame = readFileSync(join(process.cwd(), 'test/fixtures/connect/frame-simple.bin'));
const fixtureGzipFrame = readFileSync(join(process.cwd(), 'test/fixtures/connect/frame-gzip.bin'));
const fixtureMultiFrame = readFileSync(join(process.cwd(), 'test/fixtures/connect/frame-multi.bin'));

const payloadHello = Buffer.from('CONNECT\x01hello', 'utf8');
const payloadWorld = Buffer.from('CONNECT\x02world', 'utf8');

describe('connectFrameEncode', () => {
  it('roundtrip encodes and decodes uncompressed payload', () => {
    const encoded = connectFrameEncode(payloadHello);

    expect(encoded.readUInt8(0)).toBe(0);
    expect(encoded.readUInt32BE(1)).toBe(payloadHello.length);
    expect(encoded.subarray(5)).toEqual(payloadHello);
    expect(connectFrameDecode(encoded)).toEqual([payloadHello]);
  });

  it('gzip roundtrip uses compressed frame and decodes back to source payload', () => {
    const encoded = connectFrameEncode(payloadWorld, true);

    expect(encoded.readUInt8(0)).toBe(1);
    expect(connectFrameDecode(encoded)).toEqual([payloadWorld]);
  });
});

describe('connectFrameDecode fixtures', () => {
  it('decodes frame-simple fixture payload', () => {
    expect(connectFrameDecode(fixtureSimpleFrame)).toEqual([payloadHello]);
  });

  it('decodes gzip fixture payload', () => {
    expect(connectFrameDecode(fixtureGzipFrame)).toEqual([payloadWorld]);
  });

  it('decodes multiple concatenated frames in order', () => {
    expect(connectFrameDecode(fixtureMultiFrame)).toEqual([payloadHello, payloadHello]);
  });
});
