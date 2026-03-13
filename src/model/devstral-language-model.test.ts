import { describe, expect, it } from 'vitest'

import { extractStrings } from '../protocol/protobuf.js'
import { connectFrameDecode, connectFrameEncode } from '../protocol/connect-frame.js'
import { DevstralLanguageModel } from './devstral-language-model.js'

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function bufferFromBody(body: unknown): Buffer {
  if (body == null) {
    return Buffer.alloc(0)
  }

  if (typeof body === 'string') {
    return Buffer.from(body, 'utf8')
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body)
  }

  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  }

  throw new Error(`Unsupported request body type: ${typeof body}`)
}

function makeJwt(exp: number, tag: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ exp, tag })).toString('base64url')
  return `${header}.${payload}.signature`
}

function chunkBuffer(buffer: Buffer, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = []

  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    chunks.push(Uint8Array.from(buffer.subarray(offset, offset + chunkSize)))
  }

  return chunks
}

function makeChunkedBody(
  chunks: Uint8Array[],
  options: {
    delayMs?: number
    pauseAtChunkIndex?: number
    waitForChunk?: Promise<void>
    signal?: AbortSignal
  } = {},
): ReadableStream<Uint8Array> {
  let index = 0

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (options.signal?.aborted) {
        controller.close()
        return
      }

      if (index >= chunks.length) {
        controller.close()
        return
      }

      if (options.pauseAtChunkIndex === index && options.waitForChunk) {
        await options.waitForChunk
      }

      if ((options.delayMs ?? 0) > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs))
      }

      if (options.signal?.aborted) {
        controller.close()
        return
      }

      const chunk = chunks[index]
      if (chunk) {
        controller.enqueue(chunk)
      }

      index += 1
    },
  })
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function decodeRequestPayload(body: Buffer): Buffer {
  // Body is now a connect frame directly (gzip is inside the frame, not outside)
  const decodedFrames = connectFrameDecode(body)
  return decodedFrames[0] ?? Buffer.alloc(0)
}

async function collectStreamParts(stream: ReadableStream<unknown>): Promise<Array<{ type: string; [key: string]: unknown }>> {
  const reader = stream.getReader()
  const parts: Array<{ type: string; [key: string]: unknown }> = []

  while (true) {
    const next = await reader.read()
    if (next.done) {
      break
    }

    parts.push(next.value as { type: string; [key: string]: unknown })
  }

  return parts
}

describe('DevstralLanguageModel doGenerate', () => {
  it('generate request uses connect endpoint and connect+proto gzip headers', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const requestBodies: Buffer[] = []
    const jwt = makeJwt(4_050_000_000, 'connect-gzip')
    const fakeFetch: FetchLike = async (input, init) => {
      const url = String(input)
      calls.push({ url, init })

      if (url.endsWith('/GetUserJwt')) {
        return new Response(Uint8Array.from(Buffer.from(jwt, 'utf8')), { status: 200 })
      }

      requestBodies.push(bufferFromBody(init?.body))
      return new Response(Uint8Array.from(connectFrameEncode(Buffer.from('ok', 'utf8'))), { status: 200 })
    }

    const model = new DevstralLanguageModel({ apiKey: 'test-api-key', fetch: fakeFetch, baseURL: 'https://windsurf.test' })

    await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Use connect route.' }] }],
    })

    const generateCall = calls[1]
    expect(generateCall?.url).toBe('https://windsurf.test/exa.api_server_pb.ApiServerService/GetDevstralStream')

    const headers = new Headers(generateCall?.init?.headers)
    expect(headers.get('content-type')).toBe('application/connect+proto')
    expect(headers.get('connect-protocol-version')).toBe('1')
    expect(headers.get('connect-timeout-ms')).toBe('30000')
    expect(headers.get('connect-accept-encoding')).toBe('gzip')
    expect(headers.get('connect-content-encoding')).toBe('gzip')
    expect(headers.get('accept-encoding')).toBe('identity')

    const body = requestBodies[0]
    expect(body?.readUInt8(0)).toBe(1)

    const strings = extractStrings(decodeRequestPayload(body ?? Buffer.alloc(0)))
    const combined = strings.join('\n')
    expect(combined).toContain('Use connect route.')
  })

  it('generate request returns plain text content', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const requestBodies: Buffer[] = []
    const jwt = makeJwt(4_100_000_000, 'generate')
    const fakeFetch: FetchLike = async (input, init) => {
      const url = String(input)
      calls.push({ url, init })

      if (url.endsWith('/GetUserJwt')) {
        return new Response(Uint8Array.from(Buffer.from(`prefix:${jwt}:suffix`, 'utf8')), { status: 200 })
      }

      requestBodies.push(bufferFromBody(init?.body))

      return new Response(Uint8Array.from(connectFrameEncode(Buffer.from('generated answer', 'utf8'))), {
        status: 200,
      })
    }

    const model = new DevstralLanguageModel({ apiKey: 'test-api-key', fetch: fakeFetch, baseURL: 'https://windsurf.test' })

    expect(model.specificationVersion).toBe('v3')
    expect(model.supportedUrls).toEqual({})

    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Find auth logic.' }] }],
    })

    expect(result.content).toEqual([{ type: 'text', text: 'generated answer' }])
    expect(result.finishReason).toBe('stop')
    expect(result.usage).toEqual({
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined,
      },
    })

    expect(calls).toHaveLength(2)
    expect(calls[0]?.url).toBe('https://windsurf.test/exa.auth_pb.AuthService/GetUserJwt')
    expect(calls[1]?.url).toBe('https://windsurf.test/exa.api_server_pb.ApiServerService/GetDevstralStream')

    const strings = extractStrings(decodeRequestPayload(requestBodies[0] ?? Buffer.alloc(0)))
    const combined = strings.join('\n')
    expect(combined).toContain('test-api-key')
    expect(combined).toContain(jwt)
    expect(combined).toContain('Find auth logic.')
  })

  it('generate request with tool markers returns tool-call content parts', async () => {
    const requestBodies: Buffer[] = []
    const jwt = makeJwt(4_200_000_000, 'tools')
    const fakeFetch: FetchLike = async (input, init) => {
      const url = String(input)

      if (url.endsWith('/GetUserJwt')) {
        return new Response(Uint8Array.from(Buffer.from(jwt, 'utf8')), { status: 200 })
      }

      requestBodies.push(bufferFromBody(init?.body))

      const payload = Buffer.from('[TOOL_CALLS]searchRepo[ARGS]{"query":"jwt manager"}', 'utf8')
      return new Response(Uint8Array.from(connectFrameEncode(payload)), { status: 200 })
    }

    const model = new DevstralLanguageModel({ apiKey: 'tools-key', fetch: fakeFetch, baseURL: 'https://windsurf.test' })

    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Inspect jwt manager.' }] }],
      tools: {
        searchRepo: {
          description: 'Search repository files',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
        },
      },
    })

    expect(result.content).toEqual([
      {
        type: 'tool-call',
        toolCallType: 'function',
        toolCallId: 'toolcall_1',
        toolName: 'searchRepo',
        input: { query: 'jwt manager' },
      },
    ])

    const strings = extractStrings(decodeRequestPayload(requestBodies[0] ?? Buffer.alloc(0)))
    const combined = strings.join('\n')

    expect(combined).toContain('searchRepo')
    expect(combined).toContain('Search repository files')
    expect(combined).toContain('Inspect jwt manager.')
    expect(combined).toContain('query')
  })
})

describe('DevstralLanguageModel doStream', () => {
  it('stream-text resolves before full body arrives and emits parts incrementally', async () => {
    const jwt = makeJwt(4_300_000_000, 'stream-text')
    const firstFrame = connectFrameEncode(Buffer.from('hello ', 'utf8'))
    const secondFrame = connectFrameEncode(Buffer.from('world', 'utf8'))
    let releaseSecondFrame: (() => void) | undefined
    const waitForSecondFrame = new Promise<void>((resolve) => {
      releaseSecondFrame = () => resolve()
    })

    const chunks = [
      Uint8Array.from(firstFrame.subarray(0, 3)),
      Uint8Array.from(firstFrame.subarray(3, 8)),
      Uint8Array.from(firstFrame.subarray(8)),
      Uint8Array.from(secondFrame.subarray(0, 4)),
      Uint8Array.from(secondFrame.subarray(4)),
    ]

    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fakeFetch: FetchLike = async (input, init) => {
      const url = String(input)
      calls.push({ url, init })

      if (url.endsWith('/GetUserJwt')) {
        return new Response(Uint8Array.from(Buffer.from(jwt, 'utf8')), { status: 200 })
      }

      return new Response(
        makeChunkedBody(chunks, {
          pauseAtChunkIndex: 3,
          waitForChunk: waitForSecondFrame,
        }),
        { status: 200 },
      )
    }

    const model = new DevstralLanguageModel({
      apiKey: 'stream-api-key',
      fetch: fakeFetch,
      baseURL: 'https://windsurf.test',
    })

    const resultPromise = model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Stream text.' }] }],
    })

    try {
      const earlyResolution = await Promise.race([
        resultPromise.then(() => 'resolved' as const),
        waitFor(30).then(() => 'timed-out' as const),
      ])
      expect(earlyResolution).toBe('resolved')

      const result = await resultPromise
      const reader = result.stream.getReader()
      const firstParts: Array<{ type: string; [key: string]: unknown }> = []

      while (firstParts.length < 4) {
        const next = await reader.read()
        if (next.done) {
          break
        }

        firstParts.push(next.value as { type: string; [key: string]: unknown })

        if (next.value.type === 'text-delta') {
          break
        }
      }

      expect(firstParts.map((part) => part.type)).toEqual([
        'stream-start',
        'response-metadata',
        'text-start',
        'text-delta',
      ])
      expect(firstParts[3]).toMatchObject({ type: 'text-delta', delta: 'hello ' })

      releaseSecondFrame?.()

      const remainingParts: Array<{ type: string; [key: string]: unknown }> = []
      while (true) {
        const next = await reader.read()
        if (next.done) {
          break
        }

        remainingParts.push(next.value as { type: string; [key: string]: unknown })
      }

      const parts = [...firstParts, ...remainingParts]
      expect(parts.map((part) => part.type)).toEqual([
        'stream-start',
        'response-metadata',
        'text-start',
        'text-delta',
        'text-delta',
        'text-end',
        'finish',
      ])
      expect(parts[0]).toEqual({ type: 'stream-start', warnings: [] })
      expect(parts[1]).toMatchObject({ type: 'response-metadata' })
      expect(parts[4]).toMatchObject({ type: 'text-delta', delta: 'world' })
      expect(parts[6]).toEqual({
        type: 'finish',
        finishReason: 'stop',
        rawFinishReason: 'stop',
        usage: {
          inputTokens: {
            total: undefined,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: undefined,
            text: undefined,
            reasoning: undefined,
          },
        },
      })
    } finally {
      releaseSecondFrame?.()
    }

    expect(calls).toHaveLength(2)
    expect(calls[0]?.url).toBe('https://windsurf.test/exa.auth_pb.AuthService/GetUserJwt')
    expect(calls[1]?.url).toBe('https://windsurf.test/exa.api_server_pb.ApiServerService/GetDevstralStream')
  })

  it('stream-tool emits tool-input deltas before final tool-call and finish', async () => {
    const jwt = makeJwt(4_300_000_001, 'stream-tool')
    const toolPayload = Buffer.from('[TOOL_CALLS]searchRepo[ARGS]{"query":"jwt manager"}', 'utf8')
    const frames = Buffer.concat([connectFrameEncode(toolPayload)])
    const fakeFetch: FetchLike = async (input) => {
      const url = String(input)

      if (url.endsWith('/GetUserJwt')) {
        return new Response(Uint8Array.from(Buffer.from(jwt, 'utf8')), { status: 200 })
      }

      return new Response(makeChunkedBody(chunkBuffer(frames, 6)), { status: 200 })
    }

    const model = new DevstralLanguageModel({
      apiKey: 'stream-tool-key',
      fetch: fakeFetch,
      baseURL: 'https://windsurf.test',
    })

    const result = await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Call tools.' }] }],
      tools: {
        searchRepo: {
          description: 'Search repository files',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
        },
      },
    })
    const parts = await collectStreamParts(result.stream)

    expect(parts.map((part) => part.type)).toEqual([
      'stream-start',
      'response-metadata',
      'tool-input-start',
      'tool-input-delta',
      'tool-input-end',
      'tool-call',
      'finish',
    ])
    expect(parts[3]).toMatchObject({ type: 'tool-input-delta', delta: '{"query":"jwt manager"}' })
    expect(parts[5]).toEqual({
      type: 'tool-call',
      toolCallType: 'function',
      toolCallId: 'toolcall_1',
      toolName: 'searchRepo',
      input: { query: 'jwt manager' },
    })
  })

  it('abort stops stream mid-response', async () => {
    const controller = new AbortController()
    const jwt = makeJwt(4_300_000_002, 'abort')
    const frames = Buffer.concat([
      connectFrameEncode(Buffer.from('first ', 'utf8')),
      connectFrameEncode(Buffer.from('second ', 'utf8')),
      connectFrameEncode(Buffer.from('third', 'utf8')),
    ])
    const fakeFetch: FetchLike = async (input, init) => {
      const url = String(input)

      if (url.endsWith('/GetUserJwt')) {
        return new Response(Uint8Array.from(Buffer.from(jwt, 'utf8')), { status: 200 })
      }

      return new Response(
        makeChunkedBody(chunkBuffer(frames, 5), { delayMs: 10, signal: init?.signal ?? undefined }),
        {
          status: 200,
        },
      )
    }

    const model = new DevstralLanguageModel({
      apiKey: 'stream-abort-key',
      fetch: fakeFetch,
      baseURL: 'https://windsurf.test',
    })

    const result = await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Abort stream.' }] }],
      abortSignal: controller.signal,
    })

    const reader = result.stream.getReader()
    const seen: Array<{ type: string; [key: string]: unknown }> = []

    while (true) {
      const next = await reader.read()
      if (next.done) {
        break
      }

      const part = next.value as { type: string; [key: string]: unknown }
      seen.push(part)

      if (part.type === 'text-delta') {
        controller.abort()
      }
    }

    const types = seen.map((part) => part.type)
    expect(types).toContain('text-delta')
    expect(types.filter((type) => type === 'text-delta')).toHaveLength(1)
    expect(types).not.toContain('finish')
  })
})
