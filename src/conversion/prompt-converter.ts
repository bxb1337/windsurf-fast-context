import type { DevstralMessage } from '../types/index.js';

export type LanguageModelV3Prompt = Array<
  | {
      role: 'system';
      content: string;
    }
  | {
      role: 'user';
      content: Array<
        | {
            type: 'text';
            text: string;
          }
        | {
            type: 'file';
            data: string;
            mediaType: string;
          }
        | {
            type: 'image';
            image: string;
          }
      >;
    }
  | {
      role: 'assistant';
      content: Array<
        | {
            type: 'text';
            text: string;
          }
        | {
            type: 'tool-call';
            toolCallId: string;
            toolName: string;
            input: unknown;
          }
        | {
            type: 'file';
            data: string;
            mediaType: string;
          }
        | {
            type: 'image';
            image: string;
          }
        | {
            type: 'reasoning';
            text: string;
          }
      >;
    }
  | {
      role: 'tool';
      content: Array<{
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        result: unknown;
        isError?: boolean;
      }>;
    }
>;

function toContentString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

export function convertPrompt(prompt: LanguageModelV3Prompt): DevstralMessage[] {
  const messages: DevstralMessage[] = [];

  for (const message of prompt) {
    if (message.role === 'system') {
      messages.push({ role: 5, content: message.content });
      continue;
    }

    if (message.role === 'user') {
      const text = message.content
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map((part) => part.text)
        .join('');

      messages.push({ role: 1, content: text });
      continue;
    }

    if (message.role === 'assistant') {
      for (const part of message.content) {
        if (part.type === 'text') {
          messages.push({ role: 2, content: part.text });
          continue;
        }

        if (part.type === 'tool-call') {
          messages.push({
            role: 2,
            content: '',
            metadata: {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              toolArgsJson: JSON.stringify(part.input),
            },
          });
        }
      }

      continue;
    }

    // Tool result messages - use refCallId to reference the original tool call
    for (const part of message.content) {
      messages.push({
        role: 4,
        content: toContentString(part.result),
        metadata: {
          refCallId: part.toolCallId,  // This links back to the tool call
        },
      });
    }
  }

  return messages;
}
