import { describe, expect, it } from 'vitest';

import { convertPrompt } from './prompt-converter.js';

describe('convertPrompt', () => {
  it('system maps to role 5', () => {
    const prompt: Parameters<typeof convertPrompt>[0] = [{ role: 'system', content: 'Keep answers concise.' }];

    const result = convertPrompt(prompt);

    expect(result).toEqual([{ role: 5, content: 'Keep answers concise.' }]);
  });

  it('tool-call converts assistant tool calls and preserves id/name/args', () => {
    const prompt: Parameters<typeof convertPrompt>[0] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me call a tool.' },
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'searchDocs',
            args: { query: 'prompt converter', topK: 3 },
          },
        ],
      },
    ];

    const result = convertPrompt(prompt);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 2, content: 'Let me call a tool.' });
    expect(result[1]).toEqual({
      role: 2,
      content: '',
      metadata: {
        toolCallId: 'call_1',
        toolName: 'searchDocs',
        toolArgsJson: '{"query":"prompt converter","topK":3}',
      },
    });
  });

  it('multi-turn preserves ordering across mixed roles', () => {
    const prompt: Parameters<typeof convertPrompt>[0] = [
      { role: 'system', content: 'System instruction' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Find usage examples.' },
          { type: 'file', data: 'ZmFrZQ==', mediaType: 'image/png' },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will call a tool now.' },
          { type: 'tool-call', toolCallId: 'call_2', toolName: 'searchDocs', args: { q: 'usage examples' } },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_2',
            toolName: 'searchDocs',
            result: { hits: ['a.ts', 'b.ts'] },
          },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
    ];
    const snapshot = JSON.parse(JSON.stringify(prompt));

    const result = convertPrompt(prompt);

    expect(result).toEqual([
      { role: 5, content: 'System instruction' },
      { role: 1, content: 'Find usage examples.' },
      { role: 2, content: 'I will call a tool now.' },
      {
        role: 2,
        content: '',
        metadata: {
          toolCallId: 'call_2',
          toolName: 'searchDocs',
          toolArgsJson: '{"q":"usage examples"}',
        },
      },
      {
        role: 4,
        content: '{"hits":["a.ts","b.ts"]}',
        metadata: {
          refCallId: 'call_2',
        },
      },
      { role: 2, content: 'Done.' },
    ]);
    expect(prompt).toEqual(snapshot);
  });
});
