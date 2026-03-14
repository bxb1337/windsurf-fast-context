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
            input: { query: 'prompt converter', topK: 3 },
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

  it('multi-turn preserves ordering across mixed roles (V3 output shape)', () => {
    const prompt = [
      { role: 'system' as const, content: 'System instruction' },
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: 'Find usage examples.' },
          { type: 'file' as const, data: 'ZmFrZQ==', mediaType: 'image/png' },
        ],
      },
      {
        role: 'assistant' as const,
        content: [
          { type: 'text' as const, text: 'I will call a tool now.' },
          { type: 'tool-call' as const, toolCallId: 'call_2', toolName: 'searchDocs', input: { q: 'usage examples' } },
        ],
      },
      {
        role: 'tool' as const,
        content: [
          {
            type: 'tool-result' as const,
            toolCallId: 'call_2',
            toolName: 'searchDocs',
            output: { type: 'json' as const, value: { hits: ['a.ts', 'b.ts'] } },
          },
        ],
      },
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'Done.' }] },
    ] as Parameters<typeof convertPrompt>[0];
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

  it('tool-result with json output serializes value to JSON', () => {
    const prompt = [
      {
        role: 'tool' as const,
        content: [
          {
            type: 'tool-result' as const,
            toolCallId: 'call_json',
            toolName: 'searchTool',
            output: { type: 'json' as const, value: { files: ['x.ts', 'y.ts'], count: 2 } },
          },
        ],
      },
    ] as Parameters<typeof convertPrompt>[0];

    const result = convertPrompt(prompt);

    expect(result).toEqual([
      {
        role: 4,
        content: '{"files":["x.ts","y.ts"],"count":2}',
        metadata: { refCallId: 'call_json' },
      },
    ]);
  });

  it('tool-result with text output uses string directly', () => {
    const prompt = [
      {
        role: 'tool' as const,
        content: [
          {
            type: 'tool-result' as const,
            toolCallId: 'call_text',
            toolName: 'readFile',
            output: { type: 'text' as const, value: 'Operation completed successfully' },
          },
        ],
      },
    ] as Parameters<typeof convertPrompt>[0];

    const result = convertPrompt(prompt);

    expect(result).toEqual([
      {
        role: 4,
        content: 'Operation completed successfully',
        metadata: { refCallId: 'call_text' },
      },
    ]);
  });

  it('tool-result with error-text output serializes error message', () => {
    const prompt = [
      {
        role: 'tool' as const,
        content: [
          {
            type: 'tool-result' as const,
            toolCallId: 'call_error',
            toolName: 'executeCommand',
            output: { type: 'error-text' as const, value: 'Tool execution failed: timeout' },
          },
        ],
      },
    ] as Parameters<typeof convertPrompt>[0];

    const result = convertPrompt(prompt);

    expect(result).toEqual([
      {
        role: 4,
        content: 'Tool execution failed: timeout',
        metadata: { refCallId: 'call_error' },
      },
    ]);
  });

  it('tool-result with execution-denied output includes reason', () => {
    const prompt = [
      {
        role: 'tool' as const,
        content: [
          {
            type: 'tool-result' as const,
            toolCallId: 'call_denied',
            toolName: 'dangerousAction',
            output: { type: 'execution-denied' as const, reason: 'User rejected tool execution' },
          },
        ],
      },
    ] as Parameters<typeof convertPrompt>[0];

    const result = convertPrompt(prompt);

    expect(result).toEqual([
      {
        role: 4,
        content: '{"type":"execution-denied","reason":"User rejected tool execution"}',
        metadata: { refCallId: 'call_denied' },
      },
    ]);
  });

  it('tool-result with execution-denied output handles missing reason', () => {
    const prompt = [
      {
        role: 'tool' as const,
        content: [
          {
            type: 'tool-result' as const,
            toolCallId: 'call_denied_no_reason',
            toolName: 'someTool',
            output: { type: 'execution-denied' as const },
          },
        ],
      },
    ] as Parameters<typeof convertPrompt>[0];

    const result = convertPrompt(prompt);

    expect(result).toEqual([
      {
        role: 4,
        content: '{"type":"execution-denied"}',
        metadata: { refCallId: 'call_denied_no_reason' },
      },
    ]);
  });
});
