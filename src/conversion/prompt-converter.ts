import type { LanguageModelV2Prompt } from '@ai-sdk/provider';

import type { DevstralMessage } from '../types/index.js';

function toolOutputToString(output: { type: string; value?: unknown; reason?: string }): string {
  switch (output.type) {
    case 'text':
    case 'error-text':
      return output.value as string;
    case 'json':
    case 'error-json':
      return JSON.stringify(output.value);
    case 'execution-denied': {
      const obj: { type: 'execution-denied'; reason?: string } = { type: 'execution-denied' };
      if (output.reason !== undefined) obj.reason = output.reason;
      return JSON.stringify(obj);
    }
    case 'content':
      return JSON.stringify(output.value);
    default:
      return JSON.stringify(output);
  }
}

export function convertPrompt(prompt: LanguageModelV2Prompt): DevstralMessage[] {
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

    for (const part of message.content) {
      if (part.type !== 'tool-result') continue;
      messages.push({
        role: 4,
        content: toolOutputToString(part.output),
        metadata: {
          refCallId: part.toolCallId,
        },
      });
    }
  }

  return messages;
}
