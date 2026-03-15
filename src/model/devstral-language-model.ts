import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2FunctionTool,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from '@ai-sdk/provider'

import { randomUUID } from 'node:crypto'
import { arch, cpus, hostname, platform, release, totalmem, version as osVersion } from 'node:os'

import { resolveApiKey } from '../auth/api-key.js'
import { JwtManager } from '../auth/jwt-manager.js'
import { convertPrompt } from '../conversion/prompt-converter.js'
import { convertResponse, type LanguageModelV2Content as ParsedLanguageModelV2Content } from '../conversion/response-converter.js'
import { connectFrameDecode, connectFrameEncode } from '../protocol/connect-frame.js'
import { ProtobufEncoder } from '../protocol/protobuf.js'
import { DevstralTransport } from '../transport/http.js'
import type { DevstralMessage, WindsurfProviderOptions } from '../types/index.js'

const DEFAULT_BASE_URL = 'https://server.self-serve.windsurf.com'
const DEFAULT_MODEL_ID = 'MODEL_SWE_1_6_FAST'
const API_SERVICE_PATH = '/exa.api_server_pb.ApiServerService'
const DEVSTRAL_STREAM_PATH = '/GetDevstralStream'
const CONNECT_TIMEOUT_MS = '30000'
const WS_APP = 'windsurf'
const WS_APP_VER = process.env.WS_APP_VER ?? '1.48.2'
const WS_LS_VER = process.env.WS_LS_VER ?? '1.9544.35'
const SENTRY_PUBLIC_KEY = 'b813f73488da69eedec534dba1029111'
const CONNECT_USER_AGENT = 'connect-go/1.18.1 (go1.25.5)'

export interface DevstralLanguageModelOptions extends WindsurfProviderOptions {
  modelId?: string
  transport?: DevstralTransport
  jwtManager?: JwtManager
}

type LanguageModelV2GenerateResult = Awaited<ReturnType<LanguageModelV2['doGenerate']>>
type LanguageModelV2StreamResult = Awaited<ReturnType<LanguageModelV2['doStream']>>

export class DevstralLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2'
  readonly provider = 'windsurf'
  readonly modelId: string
  readonly supportedUrls: Record<string, RegExp[]> = {}

  private readonly apiKey: string
  private readonly baseURL: string
  private readonly headers: Record<string, string>
  private readonly transport: DevstralTransport
  private readonly jwtManager: JwtManager

  constructor(options: DevstralLanguageModelOptions = {}) {
    this.apiKey = resolveApiKey(options)
    this.baseURL = trimTrailingSlash(options.baseURL ?? DEFAULT_BASE_URL)
    this.modelId = options.modelId ?? DEFAULT_MODEL_ID
    this.headers = options.headers ?? {}
    this.transport = options.transport ?? new DevstralTransport({ fetch: options.fetch })
    this.jwtManager =
      options.jwtManager ??
      new JwtManager({
        fetch: options.fetch,
        authBase: `${this.baseURL}/exa.auth_pb.AuthService`,
      })
  }

  async doGenerate(options: LanguageModelV2CallOptions): Promise<LanguageModelV2GenerateResult> {
    const jwt = await this.jwtManager.getJwt(this.apiKey)
    const messages = convertPrompt(options.prompt)
    const requestPayload = buildGenerateRequest({
      apiKey: this.apiKey,
      jwt,
      messages,
      tools: options.tools,
    })

    // connectFrameEncode now handles gzip compression internally (default compress=true)
    const requestFrame = connectFrameEncode(requestPayload)
    const headers = createConnectHeaders(this.headers)

    const responseFrame = await this.transport.postUnary(
      `${this.baseURL}${API_SERVICE_PATH}${DEVSTRAL_STREAM_PATH}`,
      requestFrame,
      headers,
    )

    const { payloads: responsePayloads } = connectFrameDecode(responseFrame)
    const payloads = responsePayloads.length > 0 ? responsePayloads : [responseFrame]
    const content = payloads.flatMap((payload) => toV2Content(convertResponse(payload)))
    const unified: LanguageModelV2FinishReason = content.some((part) => part.type === 'tool-call')
      ? 'tool-calls'
      : 'stop'

    return {
      content,
      finishReason: unified,
      usage: emptyUsage(),
      warnings: [],
    }
  }

  async doStream(options: LanguageModelV2CallOptions): Promise<LanguageModelV2StreamResult> {
    const jwt = await this.jwtManager.getJwt(this.apiKey)
    const messages = convertPrompt(options.prompt)
    const requestPayload = buildGenerateRequest({
      apiKey: this.apiKey,
      jwt,
      messages,
      tools: options.tools,
    })

    // connectFrameEncode now handles gzip compression internally (default compress=true)
    const requestFrame = connectFrameEncode(requestPayload)
    const headers = createConnectHeaders(this.headers)

    const byteStream = await this.transport.postStreaming(
      `${this.baseURL}${API_SERVICE_PATH}${DEVSTRAL_STREAM_PATH}`,
      requestFrame,
      headers,
      options.abortSignal,
    )

    return {
      stream: new ReadableStream<LanguageModelV2StreamPart>({
        start: async (controller) => {
          const reader = byteStream.getReader()
          const abortHandler = () => {
            safeClose(controller)
          }

          options.abortSignal?.addEventListener('abort', abortHandler, { once: true })

          let textSegmentId: string | null = null
          let textSegmentCounter = 0
          let hasToolCalls = false
          let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0)

          const closeTextSegment = () => {
            if (textSegmentId == null) {
              return
            }

            safeEnqueue(controller, {
              type: 'text-end',
              id: textSegmentId,
            })
            textSegmentId = null
          }

          try {
            safeEnqueue(controller, { type: 'stream-start', warnings: [] })
            safeEnqueue(controller, { type: 'response-metadata', modelId: this.modelId })

            outerLoop: while (!isAborted(options.abortSignal)) {
              const next = await reader.read()
              if (next.done) {
                break
              }

              if (next.value.byteLength === 0) {
                continue
              }

              pending = Buffer.concat([pending, Buffer.from(next.value)])

              while (true) {
                const frameResult = readNextConnectFrame(pending)
                if (frameResult == null) {
                  break
                }

                pending = frameResult.rest
                const contentParts = toV2Content(convertResponse(frameResult.payload))

                for (const part of contentParts) {
                  if (isAborted(options.abortSignal)) {
                    safeClose(controller)
                    return
                  }

                  if (part.type === 'text') {
                    if (textSegmentId == null) {
                      textSegmentCounter += 1
                      textSegmentId = `text_${textSegmentCounter}`
                      safeEnqueue(controller, { type: 'text-start', id: textSegmentId })
                    }

                    safeEnqueue(controller, {
                      type: 'text-delta',
                      id: textSegmentId,
                      delta: part.text,
                    })
                    continue
                  }

                  closeTextSegment()
                  hasToolCalls = true

                  safeEnqueue(controller, {
                    type: 'tool-input-start',
                    id: part.toolCallId,
                    toolName: part.toolName,
                  })
                  safeEnqueue(controller, {
                    type: 'tool-input-delta',
                    id: part.toolCallId,
                    delta: part.input,
                  })
                  safeEnqueue(controller, {
                    type: 'tool-input-end',
                    id: part.toolCallId,
                  })
                  safeEnqueue(controller, part)
                }

                if (frameResult.isEndStream) {
                  break outerLoop
                }
              }
            }

            if (isAborted(options.abortSignal)) {
              safeClose(controller)
              return
            }

            closeTextSegment()
            const unified: LanguageModelV2FinishReason = hasToolCalls ? 'tool-calls' : 'stop'
            safeEnqueue(controller, {
              type: 'finish',
              finishReason: unified,
              usage: emptyUsage(),
            })
            safeClose(controller)
          } catch (error) {
            if (!isAborted(options.abortSignal)) {
              closeTextSegment()
              safeEnqueue(controller, {
                type: 'error',
                error,
              })
              safeEnqueue(controller, {
                type: 'finish',
                finishReason: 'error',
                usage: emptyUsage(),
              })
            }

            safeClose(controller)
          } finally {
            options.abortSignal?.removeEventListener('abort', abortHandler)
            reader.releaseLock()
          }
        },
      }),
    }
  }
}

const CONNECT_FRAME_HEADER_BYTES = 5

function readNextConnectFrame(
  buffer: Buffer<ArrayBufferLike>,
): { payload: Buffer<ArrayBufferLike>; rest: Buffer<ArrayBufferLike>; isEndStream: boolean } | null {
  if (buffer.length < CONNECT_FRAME_HEADER_BYTES) {
    return null
  }

  const payloadLength = buffer.readUInt32BE(1)
  const frameLength = CONNECT_FRAME_HEADER_BYTES + payloadLength
  if (buffer.length < frameLength) {
    return null
  }

  const frame = buffer.subarray(0, frameLength)
  const { payloads, isEndStream } = connectFrameDecode(frame)

  return {
    payload: payloads[0] ?? Buffer.alloc(0),
    rest: buffer.subarray(frameLength),
    isEndStream,
  }
}

function safeEnqueue(controller: ReadableStreamDefaultController<LanguageModelV2StreamPart>, part: LanguageModelV2StreamPart): void {
  if (isControllerClosed(controller)) {
    return
  }

  controller.enqueue(part)
}

function safeClose(controller: ReadableStreamDefaultController<LanguageModelV2StreamPart>): void {
  if (isControllerClosed(controller)) {
    return
  }

  controller.close()
}

function isControllerClosed(controller: ReadableStreamDefaultController<LanguageModelV2StreamPart>): boolean {
  try {
    controller.desiredSize
    return false
  } catch {
    return true
  }
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

function emptyUsage(): LanguageModelV2Usage {
  return {
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined,
  }
}

type GeneratedContentPart =
  | Extract<LanguageModelV2Content, { type: 'text' }>
  | Extract<LanguageModelV2Content, { type: 'tool-call' }>

function toV2Content(parts: ParsedLanguageModelV2Content[]): GeneratedContentPart[] {
  return parts.map((part) => {
    if (part.type !== 'tool-call') {
      return part
    }

    const input = typeof part.input === 'string' ? part.input : JSON.stringify(part.input)

    return {
      type: 'tool-call',
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      input,
    }
  })
}

type LanguageModelV2Tool = NonNullable<LanguageModelV2CallOptions['tools']>[number]

function isFunctionTool(tool: LanguageModelV2Tool): tool is LanguageModelV2FunctionTool {
  return tool.type === 'function'
}

function buildGenerateRequest(input: {
  apiKey: string
  jwt: string
  messages: DevstralMessage[]
  tools?: LanguageModelV2CallOptions['tools']
}): Buffer {
  const request = new ProtobufEncoder()
  request.writeMessage(1, buildMetadata(input.apiKey, input.jwt))

  for (const message of input.messages) {
    request.writeMessage(2, buildMessage(message))
  }

  const functionTools = input.tools?.filter(isFunctionTool) ?? []
  if (functionTools.length > 0) {
    const toolsArray = functionTools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description ?? '',
        parameters: tool.inputSchema,
      },
    }))
    request.writeString(3, JSON.stringify(toolsArray))
  }

  return request.toBuffer()
}

/**
 * Build metadata protobuf with correct field numbers matching the reference implementation.
 * 
 * Field mapping:
 *   1: WS_APP ("windsurf")
 *   2: WS_APP_VER ("1.48.2")
 *   3: apiKey
 *   4: locale ("zh-cn")
 *   5: systemInfo JSON
 *   7: WS_LS_VER ("1.9544.35")
 *   8: cpuInfo JSON
 *   12: WS_APP ("windsurf")
 *   21: jwt
 *   30: bytes [0x00, 0x01]
 */
function buildMetadata(apiKey: string, jwt: string): ProtobufEncoder {
  const plat = platform()
  
  const systemInfo = {
    Os: plat,
    Arch: arch(),
    Release: release(),
    Version: osVersion(),
    Machine: arch(),
    Nodename: hostname(),
    Sysname: plat === 'darwin' ? 'Darwin' : plat === 'win32' ? 'Windows_NT' : 'Linux',
    ProductVersion: '',
  }
  
  const cpuList = cpus()
  const ncpu = cpuList.length || 4
  const cpuInfo = {
    NumSockets: 1,
    NumCores: ncpu,
    NumThreads: ncpu,
    VendorID: '',
    Family: '0',
    Model: '0',
    ModelName: cpuList[0]?.model || 'Unknown',
    Memory: totalmem(),
  }
  
  const metadata = new ProtobufEncoder()
  metadata.writeString(1, WS_APP)
  metadata.writeString(2, WS_APP_VER)
  metadata.writeString(3, apiKey)
  metadata.writeString(4, 'zh-cn')
  metadata.writeString(5, JSON.stringify(systemInfo))
  metadata.writeString(7, WS_LS_VER)
  metadata.writeString(8, JSON.stringify(cpuInfo))
  metadata.writeString(12, WS_APP)
  metadata.writeString(21, jwt)
  metadata.writeBytes(30, Buffer.from([0x00, 0x01]))
  
  return metadata
}

/**
 * Build message protobuf with correct field numbers matching the reference implementation.
 * 
 * Field mapping:
 *   2: role (1=user, 2=assistant, 4=tool_result, 5=system)
 *   3: content
 *   6: toolCall (nested message with fields 1=callId, 2=name, 3=argsJson)
 *   7: refCallId
 */
function buildMessage(message: DevstralMessage): ProtobufEncoder {
  const encoded = new ProtobufEncoder()
  // Role at field 2 (not 1)
  encoded.writeVarint(2, message.role)
  // Content at field 3 (not 2)
  encoded.writeString(3, message.content)

  const toolCallId = getMetadataString(message, 'toolCallId')
  const toolName = getMetadataString(message, 'toolName')
  const toolArgsJson = getMetadataString(message, 'toolArgsJson')

  if (toolCallId && toolName && toolArgsJson) {
    // Tool call as nested message at field 6
    const toolCall = new ProtobufEncoder()
    toolCall.writeString(1, toolCallId)
    toolCall.writeString(2, toolName)
    toolCall.writeString(3, toolArgsJson)
    encoded.writeMessage(6, toolCall)
  }

  const refCallId = getMetadataString(message, 'refCallId')
  if (refCallId) {
    encoded.writeString(7, refCallId)
  }

  return encoded
}

function getMetadataString(message: DevstralMessage, key: string): string | null {
  const value = message.metadata?.[key]
  return typeof value === 'string' ? value : null
}

/**
 * Create Connect-RPC headers matching the reference implementation.
 * Note: Authorization header is NOT included - JWT is in metadata field 21.
 */
function createConnectHeaders(headers: Record<string, string>): Headers {
  const traceId = randomUUID().replace(/-/g, '')
  const spanId = randomUUID().replace(/-/g, '').slice(0, 16)

  return new Headers({
    ...headers,
    'Content-Type': 'application/connect+proto',
    'Connect-Protocol-Version': '1',
    'Connect-Timeout-Ms': CONNECT_TIMEOUT_MS,
    'Connect-Accept-Encoding': 'gzip',
    'Connect-Content-Encoding': 'gzip',
    'Accept-Encoding': 'identity',
    'User-Agent': CONNECT_USER_AGENT,
    Baggage:
      `sentry-release=language-server-windsurf@${WS_LS_VER},` +
      'sentry-environment=stable,sentry-sampled=false,' +
      `sentry-trace_id=${traceId},` +
      `sentry-public_key=${SENTRY_PUBLIC_KEY}`,
    'Sentry-Trace': `${traceId}-${spanId}-0`,
  })
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
