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
        input: { query: 'prompt converter' },
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
    expect(result).toEqual([{ type: 'text', text: 'Text more text' }]);
  });

  it('strips standalone stop token', () => {
    const input = 'Hello world</s>';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('handles TOOL_CALLS with number prefix before stop token', () => {
    const input = 'Text before TOOL_CALLS1</s>{} text after';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: 'Text before text after' }]);
  });

  it('strips TOOL_CALLS with double empty braces', () => {
    const input = 'Hello world TOOL_CALLS1{}{}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: 'Hello world ' }]);
  });

  it('strips TOOL_CALLS with triple empty braces', () => {
    const input = 'Response TOOL_CALLS2{}{}{} end';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: 'Response end' }]);
  });

  it('strips TOOL_CALLS with stop token and multiple braces', () => {
    const input = 'Text TOOL_CALLS0</s>{}{} more text';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: 'Text more text' }]);
  });

  it('handles empty marker followed by real tool call', () => {
    const input = 'TOOL_CALLS0{} [TOOL_CALLS]searchDocs[ARGS]{"query":"test"}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'toolcall_1',
        toolName: 'searchDocs',
        input: { query: 'test' },
      },
    ]);
  });

  it('handles real tool call followed by empty marker', () => {
    const input = '[TOOL_CALLS]searchDocs[ARGS]{"query":"test"} TOOL_CALLS1{} done';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'toolcall_1',
        toolName: 'searchDocs',
        input: { query: 'test' },
      },
      { type: 'text', text: ' done' },
    ]);
  });

  it('handles empty marker adjacent to real tool call', () => {
    const input = 'TOOL_CALLS0{}[TOOL_CALLS]answer[ARGS]{"answer":"result"}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([{ type: 'text', text: 'result' }]);
  });

  it('parses OpenAI-style TOOL_CALLS with numeric IDs', () => {
    const input = 'TOOL_CALLS{"type":"function","function":{"name":3,"parameters":{"file_path":"/home/test","search_pattern":"binance"}}}{}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'toolcall_1',
        toolName: 'grep',
        input: { file_path: '/home/test', search_pattern: 'binance' },
      },
    ]);
  });

  it('parses multiple OpenAI-style tool calls', () => {
    const input = 'TOOL_CALLS{"type":"function","function":{"name":1,"parameters":{"file_path":"/home/test"}}}, {"type":"function","function":{"name":2,"parameters":{"pattern":"*.ts"}}}{}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'toolcall_1',
        toolName: 'read',
        input: { file_path: '/home/test' },
      },
      {
        type: 'tool-call',
        toolCallId: 'toolcall_2',
        toolName: 'glob',
        input: { pattern: '*.ts' },
      },
    ]);
  });

  it('maps unknown tool IDs to tool_N format', () => {
    const input = 'TOOL_CALLS{"type":"function","function":{"name":99,"parameters":{"arg":"value"}}}{}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'toolcall_1',
        toolName: 'tool_99',
        input: { arg: 'value' },
      },
    ]);
  });

  it('handles OpenAI-style with string tool names', () => {
    const input = 'TOOL_CALLS{"type":"function","function":{"name":"custom_tool","parameters":{"key":"value"}}}{}';
    const result: TestContent[] = convertResponse(Buffer.from(input, 'utf8'));
    expect(result).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'toolcall_1',
        toolName: 'custom_tool',
        input: { key: 'value' },
      },
    ]);
  });
});
