import { describe, expect, it } from 'vitest';

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
});
