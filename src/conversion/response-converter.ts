export interface TextPart {
  type: 'text';
  text: string;
}

export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export type LanguageModelV3Content = TextPart | ToolCallPart;

const TOOL_CALL_PREFIX = '[TOOL_CALLS]';
const ARGS_PREFIX = '[ARGS]';

function pushText(parts: LanguageModelV3Content[], text: string): void {
  if (text.length > 0) {
    parts.push({ type: 'text', text });
  }
}

function extractAnswerText(args: unknown): string {
  if (typeof args === 'string') {
    return args;
  }

  if (args != null && typeof args === 'object') {
    if ('answer' in args && typeof (args as { answer?: unknown }).answer === 'string') {
      return (args as { answer: string }).answer;
    }

    if ('text' in args && typeof (args as { text?: unknown }).text === 'string') {
      return (args as { text: string }).text;
    }
  }

  return JSON.stringify(args);
}

function parseStringEnd(value: string, startIndex: number): number | null {
  let index = startIndex + 1;
  let escaping = false;

  while (index < value.length) {
    const char = value[index];
    if (escaping) {
      escaping = false;
    } else if (char === '\\') {
      escaping = true;
    } else if (char === '"') {
      return index + 1;
    }

    index += 1;
  }

  return null;
}

function parseBalancedEnd(value: string, startIndex: number): number | null {
  const stack: string[] = [value[startIndex] === '{' ? '}' : ']'];
  let index = startIndex + 1;
  let inString = false;
  let escaping = false;

  while (index < value.length) {
    const char = value[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }

      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      index += 1;
      continue;
    }

    if (char === '{') {
      stack.push('}');
      index += 1;
      continue;
    }

    if (char === '[') {
      stack.push(']');
      index += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      const expected = stack[stack.length - 1];
      if (expected !== char) {
        return null;
      }

      stack.pop();
      index += 1;

      if (stack.length === 0) {
        return index;
      }

      continue;
    }

    index += 1;
  }

  return null;
}

function parsePrimitiveEnd(value: string, startIndex: number): number {
  let index = startIndex;

  while (index < value.length) {
    const char = value[index];
    if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
      break;
    }

    index += 1;
  }

  return index;
}

function parseJsonValue(value: string, startIndex: number): { parsed: unknown; endIndex: number } | null {
  let jsonStart = startIndex;

  while (jsonStart < value.length) {
    const char = value[jsonStart];
    if (char !== ' ' && char !== '\n' && char !== '\r' && char !== '\t') {
      break;
    }

    jsonStart += 1;
  }

  if (jsonStart >= value.length) {
    return null;
  }

  const firstChar = value[jsonStart];
  let endIndex: number | null;

  if (firstChar === '{' || firstChar === '[') {
    endIndex = parseBalancedEnd(value, jsonStart);
  } else if (firstChar === '"') {
    endIndex = parseStringEnd(value, jsonStart);
  } else {
    endIndex = parsePrimitiveEnd(value, jsonStart);
  }

  if (endIndex == null || endIndex <= jsonStart) {
    return null;
  }

  const rawJson = value.slice(jsonStart, endIndex);

  try {
    return {
      parsed: JSON.parse(rawJson),
      endIndex,
    };
  } catch {
    return null;
  }
}

export function convertResponse(buffer: Buffer): LanguageModelV3Content[] {
  const responseText = buffer.toString('utf8');
  const parts: LanguageModelV3Content[] = [];
  let cursor = 0;
  let toolCallCount = 0;

  while (cursor < responseText.length) {
    const markerStart = responseText.indexOf(TOOL_CALL_PREFIX, cursor);
    if (markerStart === -1) {
      pushText(parts, responseText.slice(cursor));
      break;
    }

    pushText(parts, responseText.slice(cursor, markerStart));

    const toolNameStart = markerStart + TOOL_CALL_PREFIX.length;
    const argsStart = responseText.indexOf(ARGS_PREFIX, toolNameStart);
    if (argsStart === -1) {
      pushText(parts, responseText.slice(markerStart));
      break;
    }

    const toolName = responseText.slice(toolNameStart, argsStart);
    const parsedArgs = parseJsonValue(responseText, argsStart + ARGS_PREFIX.length);

    if (parsedArgs == null) {
      const nextMarker = responseText.indexOf(TOOL_CALL_PREFIX, markerStart + TOOL_CALL_PREFIX.length);
      const malformedEnd = nextMarker === -1 ? responseText.length : nextMarker;
      pushText(parts, responseText.slice(markerStart, malformedEnd));
      cursor = malformedEnd;
      continue;
    }

    if (toolName === 'answer') {
      pushText(parts, extractAnswerText(parsedArgs.parsed));
    } else {
      toolCallCount += 1;
      parts.push({
        type: 'tool-call',
        toolCallId: `toolcall_${toolCallCount}`,
        toolName,
        args: parsedArgs.parsed,
      });
    }

    cursor = parsedArgs.endIndex;
  }

  return parts;
}
