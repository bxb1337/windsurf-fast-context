import { describe, expect, it } from 'vitest';

import { DevstralTransport, DevstralTransportError } from './http.js';

const requestBytes = Buffer.from([1, 2, 3, 4]);
const responseBytes = Buffer.from([9, 8, 7, 6]);
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function bufferFromBody(body: unknown): Buffer {
  if (body == null) {
    return Buffer.alloc(0);
  }

  if (typeof body === 'string') {
    return Buffer.from(body, 'utf8');
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }

  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }

  throw new Error(`Unsupported request body type: ${typeof body}`);
}

function makeResponse(status: number, body: Buffer): Response {
  return new Response(Uint8Array.from(body), { status });
}

function makeChunkStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      if (!chunk) {
        controller.close();
        return;
      }

      controller.enqueue(chunk);
      index += 1;
    },
  });
}

async function readStreamBytes(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];

  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }

    chunks.push(Buffer.from(next.value));
  }

  return Buffer.concat(chunks);
}

function makeFakeFetch(sequence: Array<Response | Error>) {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
  const queue = [...sequence];

  const fakeFetch: FetchLike = async (input, init) => {
    calls.push({ input, init });
    const next = queue.shift();

    if (!next) {
      throw new Error('No fake fetch result configured');
    }

    if (next instanceof Error) {
      throw next;
    }

    return next;
  };

  return { fakeFetch, calls };
}

describe('unary transport', () => {
  it('unary posts bytes and returns response bytes', async () => {
    const { fakeFetch, calls } = makeFakeFetch([makeResponse(200, responseBytes)]);
    const transport = new DevstralTransport({ fetch: fakeFetch });
    const headers = new Headers({ 'content-type': 'application/grpc+proto' });

    const output = await transport.postUnary('https://api.test/unary', requestBytes, headers);

    expect(output).toEqual(responseBytes);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe('https://api.test/unary');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers).toBe(headers);
    expect(bufferFromBody(calls[0]?.init?.body)).toEqual(requestBytes);
  });

  it('unary retries 5xx responses and eventually succeeds', async () => {
    const { fakeFetch, calls } = makeFakeFetch([
      makeResponse(500, Buffer.from('first-failure')),
      makeResponse(502, Buffer.from('second-failure')),
      makeResponse(200, responseBytes),
    ]);
    const transport = new DevstralTransport({ fetch: fakeFetch });

    const output = await transport.postUnary('https://api.test/unary', requestBytes, new Headers());

    expect(output).toEqual(responseBytes);
    expect(calls).toHaveLength(3);
  });
});

describe('streaming transport', () => {
  it('streaming posts bytes and returns response stream without pre-buffering', async () => {
    let arrayBufferCalled = false;
    const streamingBody = makeChunkStream([
      Uint8Array.from([9, 8]),
      Uint8Array.from([7, 6]),
    ]);
    const streamingResponse = {
      ok: true,
      status: 200,
      body: streamingBody,
      arrayBuffer: async () => {
        arrayBufferCalled = true;
        throw new Error('arrayBuffer should not be called for streaming responses');
      },
    } as unknown as Response;
    const { fakeFetch, calls } = makeFakeFetch([streamingResponse]);
    const transport = new DevstralTransport({ fetch: fakeFetch });
    const headers = new Headers({ accept: 'application/connect+proto' });

    const output = await transport.postStreaming('https://api.test/stream', requestBytes, headers);

    expect(output).toBe(streamingBody);
    expect(await readStreamBytes(output as unknown as ReadableStream<Uint8Array>)).toEqual(responseBytes);
    expect(arrayBufferCalled).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe('https://api.test/stream');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers).toBe(headers);
    expect(bufferFromBody(calls[0]?.init?.body)).toEqual(requestBytes);
  });

  it('streaming throws NETWORK_ERROR when response body stream is missing', async () => {
    const responseWithoutBody = {
      ok: true,
      status: 200,
      body: null,
      arrayBuffer: async () => Buffer.alloc(0),
    } as unknown as Response;
    const { fakeFetch } = makeFakeFetch([responseWithoutBody]);
    const transport = new DevstralTransport({ fetch: fakeFetch });

    await expect(
      transport.postStreaming('https://api.test/stream', requestBytes, new Headers()),
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Streaming response body is unavailable',
    });
  });

  it('streaming uses AbortSignal to cancel request', async () => {
    const controller = new AbortController();
    const abortedError = new Error('Request aborted');
    abortedError.name = 'AbortError';
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fakeFetch: FetchLike = async (input, init) => {
      calls.push({ input, init });

      if (init?.signal?.aborted) {
        throw abortedError;
      }

      return makeResponse(200, responseBytes);
    };

    const transport = new DevstralTransport({ fetch: fakeFetch });
    controller.abort();

    await expect(
      transport.postStreaming('https://api.test/stream', requestBytes, new Headers(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.init?.signal).toBe(controller.signal);
  });
});

describe('error classification', () => {
  it('error maps 403 to AUTH_ERROR without retrying', async () => {
    const { fakeFetch, calls } = makeFakeFetch([makeResponse(403, Buffer.from('forbidden'))]);
    const transport = new DevstralTransport({ fetch: fakeFetch });

    await expect(
      transport.postUnary('https://api.test/unary', requestBytes, new Headers()),
    ).rejects.toMatchObject({ code: 'AUTH_ERROR' });

    expect(calls).toHaveLength(1);
  });

  it('error maps 429 to RATE_LIMITED without retrying', async () => {
    const { fakeFetch, calls } = makeFakeFetch([makeResponse(429, Buffer.from('limited'))]);
    const transport = new DevstralTransport({ fetch: fakeFetch });

    await expect(
      transport.postUnary('https://api.test/unary', requestBytes, new Headers()),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    expect(calls).toHaveLength(1);
  });

  it('error maps network failures to NETWORK_ERROR', async () => {
    const { fakeFetch, calls } = makeFakeFetch([new Error('socket hang up')]);
    const transport = new DevstralTransport({ fetch: fakeFetch });

    await expect(
      transport.postUnary('https://api.test/unary', requestBytes, new Headers()),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    expect(calls).toHaveLength(1);
  });

  it('error does not downgrade https requests on TLS failures', async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fakeFetch: FetchLike = async (input, init) => {
      calls.push({ input, init });
      throw new Error('TLS certificate verify failed');
    };
    const transport = new DevstralTransport({ fetch: fakeFetch });

    const request = transport.postUnary('https://api.test/unary', requestBytes, new Headers());

    await expect(request).rejects.toBeInstanceOf(DevstralTransportError);
    await expect(request).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe('https://api.test/unary');
  });

  it('error retries 5xx responses before throwing NETWORK_ERROR', async () => {
    const { fakeFetch, calls } = makeFakeFetch([
      makeResponse(500, Buffer.from('fail-1')),
      makeResponse(500, Buffer.from('fail-2')),
      makeResponse(503, Buffer.from('fail-3')),
    ]);
    const transport = new DevstralTransport({ fetch: fakeFetch });

    await expect(
      transport.postUnary('https://api.test/unary', requestBytes, new Headers()),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });

    expect(calls).toHaveLength(3);
  });
});
