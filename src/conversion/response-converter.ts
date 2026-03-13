import { gunzipSync } from 'node:zlib'
import { extractStrings } from '../protocol/protobuf.js'

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
const STOP_TOKEN = '</s>';

const EMPTY_TOOL_CALLS_PATTERN = /TOOL_CALLS\d*(?:<\/s>)?\s*(?:\{\s*\}\s*)+/g;

// OpenAI-style TOOL_CALLS format: TOOL_CALLS{"type":"function","function":{"name":3,...}}{}...
const OPENAI_TOOL_CALLS_PATTERN = /^TOOL_CALLS(\{[\s\S]*\}\s*)+\s*$/;

interface OpenAIToolCall {
  type: 'function';
  function: {
    name: number | string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

function parseOpenAIToolCalls(responseText: string): LanguageModelV3Content[] | null {
  if (!responseText.startsWith('TOOL_CALLS')) {
    return null;
  }

  const jsonPart = responseText.slice('TOOL_CALLS'.length);
  if (!jsonPart.startsWith('{')) {
    return null;
  }

  const toolCalls: OpenAIToolCall[] = [];
  let cursor = 0;

  while (cursor < jsonPart.length) {
    if (jsonPart[cursor] !== '{') {
      cursor++;
      continue;
    }

    const endResult = parseBalancedEnd(jsonPart, cursor);
    if (endResult == null) {
      break;
    }

    const jsonStr = jsonPart.slice(cursor, endResult);
    cursor = endResult;

    if (jsonStr === '{}') {
      continue;
    }

    try {
      const parsed = JSON.parse(jsonStr) as OpenAIToolCall;
      if (parsed.type === 'function' && parsed.function) {
        toolCalls.push(parsed);
      }
    } catch {
      continue;
    }
  }

  if (toolCalls.length === 0) {
    return null;
  }

  return toolCalls.map((call, index) => {
    const toolId = call.function.name;
    const toolName = typeof toolId === 'number' ? mapToolIdToName(toolId) : String(toolId);
    const args = call.function.parameters ?? {};

    return {
      type: 'tool-call' as const,
      toolCallId: `toolcall_${index + 1}`,
      toolName,
      args,
    };
  });
}

function mapToolIdToName(id: number): string {
  switch (id) {
    case 1:
      return 'read';
    case 2:
      return 'glob';
    case 3:
      return 'grep';
    default:
      return `tool_${id}`;
  }
}

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

function hasControlChars(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31)) {
      return true
    }
  }

  return false
}

function maybeGunzip(buffer: Buffer): Buffer {
  if (buffer.length < 2) {
    return buffer
  }

  if (buffer.readUInt8(0) !== 0x1f || buffer.readUInt8(1) !== 0x8b) {
    return buffer
  }

  try {
    return gunzipSync(buffer)
  } catch {
    return buffer
  }
}

function isLikelyMetadata(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,32}$/.test(value)
}

function pickBestExtractedText(values: string[]): string {
  const markerValues = values.filter((value) => value.includes(TOOL_CALL_PREFIX) || value.includes(ARGS_PREFIX))
  if (markerValues.length > 0) {
    return markerValues.join('')
  }

  const nonMetadata = values.filter((value) => !isLikelyMetadata(value))
  const candidates = nonMetadata.length > 0 ? nonMetadata : values

  return candidates.reduce((best, current) => (current.length > best.length ? current : best), candidates[0] ?? '')
}

function decodeResponseText(buffer: Buffer): string {
  const source = maybeGunzip(buffer)
  const raw = source.toString('utf8')
  if (!hasControlChars(raw) && !raw.includes('\ufffd')) {
    return raw
  }

  const extracted = extractStrings(source).filter((value) => value.length > 0 && !hasControlChars(value))

  if (extracted.length === 0) {
    return raw
  }

  return pickBestExtractedText(extracted)
}

export function convertResponse(buffer: Buffer): LanguageModelV3Content[] {
  let responseText = decodeResponseText(buffer)
  
  responseText = responseText.replace(EMPTY_TOOL_CALLS_PATTERN, '')
  responseText = responseText.replace(STOP_TOKEN, '')

  const openaiToolCalls = parseOpenAIToolCalls(responseText);
  if (openaiToolCalls) {
    return openaiToolCalls;
  }
  
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
