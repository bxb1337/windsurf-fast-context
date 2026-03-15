import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';

import { ProtobufEncoder } from '../protocol/protobuf.js';
import { convertResponse } from './response-converter.js';

type TestContent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown };

describe('convertResponse', () => {
  it('text - returns plain text part for plain response', () => {
    const result: TestContent[] = convertResponse(Buffer.from('plain response text', 'utf8'));

    expect(result).toEqual([{ type: 'text', text: 'plain response text' }]);
  });

  it('protobuf payload - extracts clean utf8 text without binary mojibake prefix', () => {
    const payload = new ProtobufEncoder();
    payload.writeVarint(1, 150);
    payload.writeString(2, '你好，TypeScript');

    const result: TestContent[] = convertResponse(payload.toBuffer());

    expect(result).toEqual([{ type: 'text', text: '你好，TypeScript' }]);
  });

  it('protobuf payload - ignores metadata strings and keeps main text field', () => {
    const payload = new ProtobufEncoder();
    payload.writeString(1, 'meta');
    payload.writeString(2, '你好，TypeScript');

    const result: TestContent[] = convertResponse(payload.toBuffer());

    expect(result).toEqual([{ type: 'text', text: '你好，TypeScript' }]);
  });

  it('gzip payload - decompresses before decoding text', () => {
    const compressed = gzipSync(Buffer.from('hello from gzip', 'utf8'));

    const result: TestContent[] = convertResponse(compressed);

    expect(result).toEqual([{ type: 'text', text: 'hello from gzip' }]);
  });

  it('strips standalone stop token', () => {
    const input = 'Hello world</s>';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  // Strict OpenAI array format tests
  it('parses strict OpenAI array with single tool call', () => {
    const input = '[{"type":"function","function":{"name":"search","parameters":{"q":"test"}}}]';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      { type: 'tool-call', toolCallId: 'toolcall_1', toolName: 'search', input: { q: 'test' } }
    ]);
  });

  it('parses strict OpenAI array with multiple tool calls', () => {
    const input = '[{"type":"function","function":{"name":"read","parameters":{"path":"/a"}}},{"type":"function","function":{"name":"grep","parameters":{"pattern":"foo"}}}]';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      { type: 'tool-call', toolCallId: 'toolcall_1', toolName: 'read', input: { path: '/a' } },
      { type: 'tool-call', toolCallId: 'toolcall_2', toolName: 'grep', input: { pattern: 'foo' } }
    ]);
  });

  it('parses strict OpenAI array with empty parameters', () => {
    const input = '[{"type":"function","function":{"name":"list","parameters":{}}}]';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      { type: 'tool-call', toolCallId: 'toolcall_1', toolName: 'list', input: {} }
    ]);
  });

  it('returns text for old marker format (no backward compat)', () => {
    const input = '[TOOL_CALLS]search[ARGS]{"q":"test"}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: '[TOOL_CALLS]search[ARGS]{"q":"test"}' }]);
  });

  it('returns text for old TOOL_CALLS format (no backward compat)', () => {
    const input = 'TOOL_CALLS{"type":"function","function":{"name":3,"parameters":{"q":"test"}}}{}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: input }]);
  });

  it('returns text for non-array JSON', () => {
    const input = '{"type":"function","function":{"name":"search","parameters":{}}}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: input }]);
  });

  it('returns text for empty array', () => {
    const input = '[]';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: '[]' }]);
  });

  it('returns text for malformed JSON array', () => {
    const input = '[{"type":"function","function":{"name":"search","parameters":';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: input }]);
  });

  it('returns text for non-string tool name', () => {
    const input = '[{"type":"function","function":{"name":123,"parameters":{}}}]';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: input }]);
  });

  it('returns text for non-object parameters', () => {
    const input = '[{"type":"function","function":{"name":"search","parameters":"invalid"}}]';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: input }]);
  });

  it('returns text for empty string tool name', () => {
    const input = '[{"type":"function","function":{"name":"","parameters":{}}}]';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: input }]);
  });

  it('returns text for array parameters', () => {
    const input = '[{"type":"function","function":{"name":"search","parameters":["a","b"]}}]';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: input }]);
  });
});
