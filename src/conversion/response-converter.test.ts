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

  // Native Windsurf marker format tests
  it('parses native marker format [TOOL_CALLS]name[ARGS]{json}', () => {
    const input = '[TOOL_CALLS]search[ARGS]{"q":"test"}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      { type: 'tool-call', toolCallId: 'toolcall_1', toolName: 'search', input: { q: 'test' } }
    ]);
  });

  it('parses marker format with text before tool call', () => {
    const input = 'Some text before[TOOL_CALLS]read[ARGS]{"path":"/foo"}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      { type: 'text', text: 'Some text before' },
      { type: 'tool-call', toolCallId: 'toolcall_1', toolName: 'read', input: { path: '/foo' } }
    ]);
  });

  it('parses marker format with text after tool call', () => {
    const input = '[TOOL_CALLS]grep[ARGS]{"pattern":"foo"}Some text after';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      { type: 'tool-call', toolCallId: 'toolcall_1', toolName: 'grep', input: { pattern: 'foo' } },
      { type: 'text', text: 'Some text after' }
    ]);
  });

  it('parses multiple tool calls in marker format', () => {
    const input = '[TOOL_CALLS]read[ARGS]{"path":"/a"}[TOOL_CALLS]grep[ARGS]{"pattern":"foo"}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      { type: 'tool-call', toolCallId: 'toolcall_1', toolName: 'read', input: { path: '/a' } },
      { type: 'tool-call', toolCallId: 'toolcall_2', toolName: 'grep', input: { pattern: 'foo' } }
    ]);
  });

  it('parses TOOL_CALLS format with numeric tool id', () => {
    const input = 'TOOL_CALLS{"type":"function","function":{"name":3,"parameters":{"pattern":"test"}}}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      { type: 'tool-call', toolCallId: 'toolcall_1', toolName: 'grep', input: { pattern: 'test' } }
    ]);
  });

  it('maps tool id 1 to read', () => {
    const input = 'TOOL_CALLS{"type":"function","function":{"name":1,"parameters":{"path":"/file"}}}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      { type: 'tool-call', toolCallId: 'toolcall_1', toolName: 'read', input: { path: '/file' } }
    ]);
  });

  it('maps tool id 2 to glob', () => {
    const input = 'TOOL_CALLS{"type":"function","function":{"name":2,"parameters":{"pattern":"*.ts"}}}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      { type: 'tool-call', toolCallId: 'toolcall_1', toolName: 'glob', input: { pattern: '*.ts' } }
    ]);
  });

  it('maps unknown tool id to tool_N', () => {
    const input = 'TOOL_CALLS{"type":"function","function":{"name":99,"parameters":{}}}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      { type: 'tool-call', toolCallId: 'toolcall_1', toolName: 'tool_99', input: {} }
    ]);
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
});
