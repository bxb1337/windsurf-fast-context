import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { connectFrameDecode, connectFrameEncode, FLAG_COMPRESSED, FLAG_END_STREAM } from './connect-frame.js';

const fixtureSimpleFrame = readFileSync(join(process.cwd(), 'test/fixtures/connect/frame-simple.bin'));
const fixtureGzipFrame = readFileSync(join(process.cwd(), 'test/fixtures/connect/frame-gzip.bin'));
const fixtureMultiFrame = readFileSync(join(process.cwd(), 'test/fixtures/connect/frame-multi.bin'));

const payloadHello = Buffer.from('CONNECT\x01hello', 'utf8');
const payloadWorld = Buffer.from('CONNECT\x02world', 'utf8');

describe('connectFrameEncode', () => {
  it('roundtrip encodes and decodes uncompressed payload', () => {
    const encoded = connectFrameEncode(payloadHello, false);

    expect(encoded.readUInt8(0)).toBe(0);
    expect(encoded.readUInt32BE(1)).toBe(payloadHello.length);
    expect(encoded.subarray(5)).toEqual(payloadHello);
    expect(connectFrameDecode(encoded)).toEqual({ payloads: [payloadHello], isEndStream: false });
  });

  it('gzip roundtrip uses compressed frame and decodes back to source payload', () => {
    const encoded = connectFrameEncode(payloadWorld, true);

    expect(encoded.readUInt8(0)).toBe(1);
    expect(connectFrameDecode(encoded)).toEqual({ payloads: [payloadWorld], isEndStream: false });
  });
});

describe('connectFrameDecode fixtures', () => {
  it('decodes frame-simple fixture payload', () => {
    expect(connectFrameDecode(fixtureSimpleFrame)).toEqual({ payloads: [payloadHello], isEndStream: false });
  });

  it('decodes gzip fixture payload', () => {
    expect(connectFrameDecode(fixtureGzipFrame)).toEqual({ payloads: [payloadWorld], isEndStream: false });
  });

  it('decodes multiple concatenated frames in order', () => {
    expect(connectFrameDecode(fixtureMultiFrame)).toEqual({ payloads: [payloadHello, payloadHello], isEndStream: false });
  });
});

describe('connect frame flags', () => {
  it('exports FLAG_COMPRESSED constant with value 1', () => {
    expect(FLAG_COMPRESSED).toBe(1);
  });

  it('exports FLAG_END_STREAM constant with value 2', () => {
    expect(FLAG_END_STREAM).toBe(2);
  });

  it('supports bit combination: FLAG_COMPRESSED | FLAG_END_STREAM === 3', () => {
    expect(FLAG_COMPRESSED | FLAG_END_STREAM).toBe(3);
  });
});

describe('connectFrameDecode isEndStream', () => {
  /**
   * TDD RED PHASE: Tests for isEndStream flag detection.
   * These tests MUST FAIL because connectFrameDecode currently returns Buffer[],
   * not { payloads: Buffer[], isEndStream: boolean }.
   *
   * Connect-RPC flag bits:
   * - Bit 0 (value 1): FLAG_COMPRESSED
   * - Bit 1 (value 2): FLAG_END_STREAM
   */

  it('returns isEndStream: false for flags=0 (no flags)', () => {
    // flags=0: neither compressed nor end stream
    const frame = Buffer.allocUnsafe(5 + payloadHello.length);
    frame.writeUInt8(0, 0); // flags = 0
    frame.writeUInt32BE(payloadHello.length, 1);
    payloadHello.copy(frame, 5);

    const result = connectFrameDecode(frame);

    expect(result).toHaveProperty('payloads');
    expect(result).toHaveProperty('isEndStream');
    expect(result.payloads).toEqual([payloadHello]);
    expect(result.isEndStream).toBe(false);
  });

  it('returns isEndStream: false for flags=1 (compressed only)', () => {
    // flags=1: compressed but not end stream
    const gzipped = gzipSync(payloadHello);
    const frame = Buffer.allocUnsafe(5 + gzipped.length);
    frame.writeUInt8(FLAG_COMPRESSED, 0); // flags = 1
    frame.writeUInt32BE(gzipped.length, 1);
    gzipped.copy(frame, 5);

    const result = connectFrameDecode(frame);

    expect(result).toHaveProperty('payloads');
    expect(result).toHaveProperty('isEndStream');
    expect(result.payloads).toEqual([payloadHello]);
    expect(result.isEndStream).toBe(false);
  });

  it('returns isEndStream: true for flags=2 (end stream only)', () => {
    // flags=2: end stream but not compressed
    const frame = Buffer.allocUnsafe(5 + payloadHello.length);
    frame.writeUInt8(FLAG_END_STREAM, 0); // flags = 2
    frame.writeUInt32BE(payloadHello.length, 1);
    payloadHello.copy(frame, 5);

    const result = connectFrameDecode(frame);

    expect(result).toHaveProperty('payloads');
    expect(result).toHaveProperty('isEndStream');
    expect(result.payloads).toEqual([payloadHello]);
    expect(result.isEndStream).toBe(true);
  });

  it('returns isEndStream: true for flags=3 (compressed + end stream)', () => {
    // flags=3: both compressed and end stream
    const gzipped = gzipSync(payloadHello);
    const frame = Buffer.allocUnsafe(5 + gzipped.length);
    frame.writeUInt8(FLAG_COMPRESSED | FLAG_END_STREAM, 0); // flags = 3
    frame.writeUInt32BE(gzipped.length, 1);
    gzipped.copy(frame, 5);

    const result = connectFrameDecode(frame);

    expect(result).toHaveProperty('payloads');
    expect(result).toHaveProperty('isEndStream');
    expect(result.payloads).toEqual([payloadHello]);
    expect(result.isEndStream).toBe(true);
  });
});
