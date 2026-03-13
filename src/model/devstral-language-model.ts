import { resolveApiKey } from '../auth/api-key.js'
import { JwtManager } from '../auth/jwt-manager.js'
import { convertPrompt, type LanguageModelV3Prompt } from '../conversion/prompt-converter.js'
import { convertResponse, type LanguageModelV3Content } from '../conversion/response-converter.js'
import { connectFrameDecode, connectFrameEncode } from '../protocol/connect-frame.js'
import { ProtobufEncoder } from '../protocol/protobuf.js'
import { DevstralTransport } from '../transport/http.js'
import type { DevstralMessage, WindsurfProviderOptions } from '../types/index.js'

const DEFAULT_BASE_URL = 'https://server.self-serve.windsurf.com'
const DEFAULT_MODEL_ID = 'MODEL_SWE_1_6_FAST'
const GENERATE_PATH = '/exa.code_search_pb.CodeSearchService/Generate'

export interface LanguageModelV3FunctionTool {
  description?: string
  parameters?: unknown
}

export interface LanguageModelV3CallOptions {
  prompt: LanguageModelV3Prompt
  tools?: Record<string, LanguageModelV3FunctionTool>
  abortSignal?: AbortSignal
}

export interface LanguageModelV3GenerateResult {
  content: GenerateContentPart[]
  finishReason: 'stop'
  usage: {
    inputTokens: number | undefined
    outputTokens: number | undefined
    totalTokens: number | undefined
  }
}

export interface LanguageModelV3StreamResult {
  stream: ReadableStream<LanguageModelV3StreamPart>
}

interface LanguageModelV3ToolCallContent {
  type: 'tool-call'
  toolCallType: 'function'
  toolCallId: string
  toolName: string
  args: string
}

type GenerateContentPart =
  | {
      type: 'text'
      text: string
    }
  | LanguageModelV3ToolCallContent

type LanguageModelV3StreamPart =
  | {
      type: 'stream-start'
      warnings: unknown[]
    }
  | {
      type: 'response-metadata'
      modelId: string
    }
  | {
      type: 'text-start'
      id: string
    }
  | {
      type: 'text-delta'
      id: string
      delta: string
    }
  | {
      type: 'text-end'
      id: string
    }
  | {
      type: 'tool-input-start'
      toolCallId: string
      toolName: string
    }
  | {
      type: 'tool-input-delta'
      toolCallId: string
      delta: string
    }
  | {
      type: 'tool-input-end'
      toolCallId: string
    }
  | LanguageModelV3ToolCallContent
  | {
      type: 'error'
      error: unknown
    }
  | {
      type: 'finish'
      finishReason: 'stop'
      usage: {
        inputTokens: number | undefined
        outputTokens: number | undefined
        totalTokens: number | undefined
      }
    }

export interface DevstralLanguageModelOptions extends WindsurfProviderOptions {
  modelId?: string
  transport?: DevstralTransport
  jwtManager?: JwtManager
}

export class DevstralLanguageModel {
  readonly specificationVersion = 'V3'
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

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const jwt = await this.jwtManager.getJwt(this.apiKey)
    const messages = convertPrompt(options.prompt)
    const requestPayload = buildGenerateRequest({
      apiKey: this.apiKey,
      jwt,
      modelId: this.modelId,
      messages,
      tools: options.tools,
    })

    const requestFrame = connectFrameEncode(requestPayload)
    const headers = new Headers({
      ...this.headers,
      Accept: 'application/grpc+proto',
      Authorization: `Bearer ${jwt}`,
      'Connect-Protocol-Version': '1',
      'Content-Type': 'application/grpc+proto',
    })

    const responseFrame = await this.transport.postUnary(
      `${this.baseURL}${GENERATE_PATH}`,
      requestFrame,
      headers,
    )

    const responsePayloads = connectFrameDecode(responseFrame)
    const payloads = responsePayloads.length > 0 ? responsePayloads : [responseFrame]
    const content = payloads.flatMap((payload) => toV3Content(convertResponse(payload)))

    return {
      content,
      finishReason: 'stop',
      usage: emptyUsage(),
    }
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const jwt = await this.jwtManager.getJwt(this.apiKey)
    const messages = convertPrompt(options.prompt)
    const requestPayload = buildGenerateRequest({
      apiKey: this.apiKey,
      jwt,
      modelId: this.modelId,
      messages,
      tools: options.tools,
    })

    const requestFrame = connectFrameEncode(requestPayload)
    const headers = new Headers({
      ...this.headers,
      Accept: 'application/grpc+proto',
      Authorization: `Bearer ${jwt}`,
      'Connect-Protocol-Version': '1',
      'Content-Type': 'application/grpc+proto',
    })

    const byteStream = await this.transport.postStreaming(
      `${this.baseURL}${GENERATE_PATH}`,
      requestFrame,
      headers,
      options.abortSignal,
    )

    return {
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        start: async (controller) => {
          const reader = byteStream.getReader()
          const abortHandler = () => {
            safeClose(controller)
          }

          options.abortSignal?.addEventListener('abort', abortHandler, { once: true })

          let textSegmentId: string | null = null
          let textSegmentCounter = 0
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

            while (!isAborted(options.abortSignal)) {
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
                const contentParts = toV3Content(convertResponse(frameResult.payload))

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

                  safeEnqueue(controller, {
                    type: 'tool-input-start',
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                  })
                  safeEnqueue(controller, {
                    type: 'tool-input-delta',
                    toolCallId: part.toolCallId,
                    delta: part.args,
                  })
                  safeEnqueue(controller, {
                    type: 'tool-input-end',
                    toolCallId: part.toolCallId,
                  })
                  safeEnqueue(controller, part)
                }
              }
            }

            if (isAborted(options.abortSignal)) {
              safeClose(controller)
              return
            }

            closeTextSegment()
            safeEnqueue(controller, {
              type: 'finish',
              finishReason: 'stop',
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
                finishReason: 'stop',
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
): { payload: Buffer<ArrayBufferLike>; rest: Buffer<ArrayBufferLike> } | null {
  if (buffer.length < CONNECT_FRAME_HEADER_BYTES) {
    return null
  }

  const payloadLength = buffer.readUInt32BE(1)
  const frameLength = CONNECT_FRAME_HEADER_BYTES + payloadLength
  if (buffer.length < frameLength) {
    return null
  }

  const frame = buffer.subarray(0, frameLength)
  const decoded = connectFrameDecode(frame)

  return {
    payload: decoded[0] ?? Buffer.alloc(0),
    rest: buffer.subarray(frameLength),
  }
}

function safeEnqueue(controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>, part: LanguageModelV3StreamPart): void {
  if (isControllerClosed(controller)) {
    return
  }

  controller.enqueue(part)
}

function safeClose(controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>): void {
  if (isControllerClosed(controller)) {
    return
  }

  controller.close()
}

function isControllerClosed(controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>): boolean {
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

function emptyUsage(): {
  inputTokens: number | undefined
  outputTokens: number | undefined
  totalTokens: number | undefined
} {
  return {
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined,
  }
}

function toV3Content(parts: LanguageModelV3Content[]): GenerateContentPart[] {
  return parts.map((part) => {
    if (part.type === 'tool-call') {
      return {
        type: 'tool-call',
        toolCallType: 'function',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: JSON.stringify(part.args),
      }
    }

    return part
  })
}

function buildGenerateRequest(input: {
  apiKey: string
  jwt: string
  modelId: string
  messages: DevstralMessage[]
  tools?: Record<string, LanguageModelV3FunctionTool>
}): Buffer {
  const request = new ProtobufEncoder()
  request.writeMessage(1, buildMetadata(input.apiKey, input.jwt, input.modelId))

  for (const message of input.messages) {
    request.writeMessage(2, buildMessage(message))
  }

  if (input.tools) {
    for (const [name, tool] of Object.entries(input.tools)) {
      request.writeMessage(3, buildToolDefinition(name, tool))
    }
  }

  return request.toBuffer()
}

function buildMetadata(apiKey: string, jwt: string, modelId: string): ProtobufEncoder {
  const metadata = new ProtobufEncoder()
  metadata.writeString(1, 'windsurf')
  metadata.writeString(2, process.env.WS_APP_VER ?? '1.48.2')
  metadata.writeString(3, apiKey)
  metadata.writeString(4, 'zh-cn')
  metadata.writeString(5, jwt)
  metadata.writeString(6, modelId)
  return metadata
}

function buildMessage(message: DevstralMessage): ProtobufEncoder {
  const encoded = new ProtobufEncoder()
  encoded.writeVarint(1, message.role)
  encoded.writeString(2, message.content)

  const toolCallId = getMetadataString(message, 'toolCallId')
  const toolName = getMetadataString(message, 'toolName')
  const toolArgsJson = getMetadataString(message, 'toolArgsJson')

  if (toolCallId) {
    encoded.writeString(3, toolCallId)
  }

  if (toolName) {
    encoded.writeString(4, toolName)
  }

  if (toolArgsJson) {
    encoded.writeString(5, toolArgsJson)
  }

  return encoded
}

function getMetadataString(message: DevstralMessage, key: string): string | null {
  const value = message.metadata?.[key]
  return typeof value === 'string' ? value : null
}

function buildToolDefinition(name: string, tool: LanguageModelV3FunctionTool): ProtobufEncoder {
  const encoded = new ProtobufEncoder()
  encoded.writeString(1, name)

  if (tool.description) {
    encoded.writeString(2, tool.description)
  }

  encoded.writeString(3, JSON.stringify(tool.parameters ?? {}))
  return encoded
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
