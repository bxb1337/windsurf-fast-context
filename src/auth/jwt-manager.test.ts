import { describe, expect, it } from 'vitest';

import { ProtobufEncoder } from '../protocol/protobuf.js';
import { AUTH_BASE, JwtManager } from './jwt-manager.js';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function makeJwt(exp: number, tag: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp, tag })).toString('base64url');
  return `${header}.${payload}.signature`;
}

function makeJwtResponse(token: string): Response {
  const encoder = new ProtobufEncoder();
  encoder.writeString(1, `prefix:${token}:suffix`);
  return new Response(Uint8Array.from(encoder.toBuffer()), { status: 200 });
}

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

describe('jwt manager fetch', () => {
  it('fetch exchanges api key to jwt and caches result', async () => {
    const exp = 4_000_000_000;
    const token = makeJwt(exp, 'first');
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fakeFetch: FetchLike = async (input, init) => {
      calls.push({ input, init });
      return makeJwtResponse(token);
    };

    const manager = new JwtManager({ fetch: fakeFetch, now: () => (exp - 3_600) * 1000 });

    const jwt1 = await manager.getJwt('test-api-key');
    const jwt2 = await manager.getJwt('test-api-key');

    expect(jwt1).toBe(token);
    expect(jwt2).toBe(token);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe(`${AUTH_BASE}/GetUserJwt`);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(new Headers(calls[0]?.init?.headers).get('content-type')).toBe('application/proto');

    const requestBody = bufferFromBody(calls[0]?.init?.body);
    expect(requestBody.length).toBeGreaterThan(0);
    expect(requestBody.toString('utf8')).toContain('test-api-key');
  });
});

describe('jwt manager expiry', () => {
  it('expiry refreshes token when less than sixty seconds remain', async () => {
    let nowMs = 0;
    const token1 = makeJwt(10_000, 'first');
    const token2 = makeJwt(20_000, 'second');
    const queue = [makeJwtResponse(token1), makeJwtResponse(token2)];
    let callCount = 0;

    const fakeFetch: FetchLike = async () => {
      callCount += 1;
      const next = queue.shift();
      if (!next) {
        throw new Error('No fake fetch response queued');
      }
      return next;
    };

    const manager = new JwtManager({ fetch: fakeFetch, now: () => nowMs });

    const first = await manager.getJwt('exp-api-key');
    nowMs = (10_000 - 59) * 1000;
    const second = await manager.getJwt('exp-api-key');

    expect(first).toBe(token1);
    expect(second).toBe(token2);
    expect(callCount).toBe(2);
  });
});

describe('jwt manager concurrent', () => {
  it('concurrent getJwt calls share one in-flight fetch', async () => {
    const token = makeJwt(50_000, 'concurrent');
    let fetchCalls = 0;
    let resolveFetch!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    const fakeFetch: FetchLike = async () => {
      fetchCalls += 1;
      return pending;
    };

    const manager = new JwtManager({ fetch: fakeFetch, now: () => 0 });

    const p1 = manager.getJwt('same-key');
    const p2 = manager.getJwt('same-key');

    resolveFetch(makeJwtResponse(token));

    const [jwt1, jwt2] = await Promise.all([p1, p2]);

    expect(fetchCalls).toBe(1);
    expect(jwt1).toBe(token);
    expect(jwt2).toBe(token);
  });
});
