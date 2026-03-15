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
  input: unknown;
}

export type LanguageModelV2Content = TextPart | ToolCallPart;

const STOP_TOKEN = '</s>';

interface StrictOpenAIToolCall {
  type: 'function';
  function: {
    name: string;
    parameters?: Record<string, unknown>;
  };
}

function parseStrictOpenAIToolCalls(responseText: string): LanguageModelV2Content[] | null {
  const trimmed = responseText.trim();
  if (!trimmed.startsWith('[')) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const toolCalls: LanguageModelV2Content[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i] as StrictOpenAIToolCall;
      if (item.type !== 'function' || !item.function?.name) continue;
      toolCalls.push({
        type: 'tool-call',
        toolCallId: `toolcall_${i + 1}`,
        toolName: String(item.function.name),
        input: item.function.parameters ?? {},
      });
    }

    return toolCalls.length > 0 ? toolCalls : null;
  } catch {
    return null;
  }
}

function pushText(parts: LanguageModelV2Content[], text: string): void {
  if (text.length > 0) {
    parts.push({ type: 'text', text });
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
  const nonMetadata = values.filter((value) => !isLikelyMetadata(value));
  const candidates = nonMetadata.length > 0 ? nonMetadata : values;

  return candidates.reduce((best, current) => (current.length > best.length ? current : best), candidates[0] ?? '');
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

export function convertResponse(buffer: Buffer): LanguageModelV2Content[] {
  let responseText = decodeResponseText(buffer);
  responseText = responseText.replace(STOP_TOKEN, '');

  const strictToolCalls = parseStrictOpenAIToolCalls(responseText);
  if (strictToolCalls) return strictToolCalls;

  const parts: LanguageModelV2Content[] = [];
  pushText(parts, responseText);
  return parts;
}
