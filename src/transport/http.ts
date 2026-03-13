type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type DevstralTransportErrorCode = 'AUTH_ERROR' | 'RATE_LIMITED' | 'NETWORK_ERROR';

export class DevstralTransportError extends Error {
  readonly code: DevstralTransportErrorCode;
  readonly status?: number;

  constructor(code: DevstralTransportErrorCode, message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DevstralTransportError';
    this.code = code;
    this.status = status;
  }
}

export interface DevstralTransportOptions {
  fetch?: FetchLike;
  maxAttempts?: number;
}

export class DevstralTransport {
  private readonly fetchFn: FetchLike;
  private readonly maxAttempts: number;

  constructor(options: DevstralTransportOptions = {}) {
    this.fetchFn = options.fetch ?? fetch;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  }

  postUnary(url: string, body: Buffer, headers: Headers): Promise<Buffer> {
    return this.postUnaryRequest(url, body, headers);
  }

  postStreaming(
    url: string,
    body: Buffer,
    headers: Headers,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    return this.postStreamingRequest(url, body, headers, signal);
  }

  private async postUnaryRequest(url: string, body: Buffer, headers: Headers): Promise<Buffer> {
    const response = await this.post(url, body, headers);
    return Buffer.from(await response.arrayBuffer());
  }

  private async postStreamingRequest(
    url: string,
    body: Buffer,
    headers: Headers,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const response = await this.post(url, body, headers, signal);
    if (response.body == null) {
      throw new DevstralTransportError('NETWORK_ERROR', 'Streaming response body is unavailable', response.status);
    }

    return response.body;
  }

  private async post(url: string, body: Buffer, headers: Headers, signal?: AbortSignal): Promise<Response> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchFn(url, {
          method: 'POST',
          headers,
          body,
          signal,
        });

        if (response.ok) {
          return response;
        }

        if (response.status === 403) {
          throw new DevstralTransportError('AUTH_ERROR', 'HTTP 403', response.status);
        }

        if (response.status === 429) {
          throw new DevstralTransportError('RATE_LIMITED', 'HTTP 429', response.status);
        }

        if (response.status >= 500 && response.status < 600) {
          if (attempt < this.maxAttempts) {
            continue;
          }

          throw new DevstralTransportError('NETWORK_ERROR', `HTTP ${response.status}`, response.status);
        }

        throw new DevstralTransportError('NETWORK_ERROR', `HTTP ${response.status}`, response.status);
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }

        if (error instanceof DevstralTransportError) {
          throw error;
        }

        throw new DevstralTransportError('NETWORK_ERROR', 'Network request failed', undefined, {
          cause: error,
        });
      }
    }

    throw new DevstralTransportError('NETWORK_ERROR', 'Network request failed');
  }
}

function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'AbortError';
}
