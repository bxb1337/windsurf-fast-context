import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';

import { ProtobufEncoder } from '../protocol/protobuf.js';
import { convertResponse } from './response-converter.js';

type TestContent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown };

describe('convertResponse', () => {
  it('text - returns plain text part for plain response', () => {
    const result: TestContent[] = convertResponse(Buffer.from('plain response text', 'utf8'));

    expect(result).toEqual([{ type: 'text', text: 'plain response text' }]);
  });

  it('tool-call - parses tool markers and preserves surrounding text', () => {
    const input =
      'Before [TOOL_CALLS]searchDocs[ARGS]{"query":"prompt converter"} between [TOOL_CALLS]answer[ARGS]{"answer":"final answer"} after';

    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));

    expect(result).toEqual([
      { type: 'text', text: 'Before ' },
      {
        type: 'tool-call',
        toolCallId: 'toolcall_1',
        toolName: 'searchDocs',
        args: { query: 'prompt converter' },
      },
      { type: 'text', text: ' between ' },
      { type: 'text', text: 'final answer' },
      { type: 'text', text: ' after' },
    ]);
  });

  it('malformed - invalid marker json remains text and does not throw', () => {
    const input = 'prefix [TOOL_CALLS]searchDocs[ARGS]{"query": nope} suffix';

    expect(() => convertResponse(Buffer.from(input, 'utf8'))).not.toThrow();

    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    const combinedText = result
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('');

    expect(result.every((part) => part.type === 'text')).toBe(true);
    expect(combinedText).toBe(input);
  });

  it('protobuf payload - extracts clean utf8 text without binary mojibake prefix', () => {
    const payload = new ProtobufEncoder();
    payload.writeVarint(1, 150);
    payload.writeString(2, '你好，TypeScript');

    const result: TestContent[] = convertResponse(payload.toBuffer());

    expect(result).toEqual([{ type: 'text', text: '你好，TypeScript' }]);
  });

  it('protobuf payload - still parses tool-call markers from extracted strings', () => {
    const payload = new ProtobufEncoder();
    payload.writeVarint(1, 150);
    payload.writeString(2, '[TOOL_CALLS]answer[ARGS]{"answer":"final answer"}');

    const result: TestContent[] = convertResponse(payload.toBuffer());

    expect(result).toEqual([{ type: 'text', text: 'final answer' }]);
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

  it('strips empty TOOL_CALLS markers with stop token', () => {
    const input = 'Hello world TOOL_CALLS0</s>{}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: 'Hello world ' }]);
  });

  it('strips empty TOOL_CALLS markers without stop token', () => {
    const input = 'Hello world TOOL_CALLS1{}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: 'Hello world ' }]);
  });

  it('strips empty TOOL_CALLS markers with whitespace', () => {
    const input = 'Text TOOL_CALLS2{   } more text';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: 'Text  more text' }]);
  });

  it('strips standalone stop token', () => {
    const input = 'Hello world</s>';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('handles TOOL_CALLS with number prefix before stop token', () => {
    const input = 'Text before TOOL_CALLS1</s>{} text after';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: 'Text before  text after' }]);
  });
});
