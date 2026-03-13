import { ProtobufEncoder } from '../protocol/protobuf.js';

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const AUTH_BASE = 'https://server.self-serve.windsurf.com/exa.auth_pb.AuthService';

const WS_APP = 'windsurf';
const WS_APP_VER = process.env.WS_APP_VER ?? '1.48.2';
const WS_LS_VER = process.env.WS_LS_VER ?? '1.9544.35';
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/;

interface CachedJwt {
  token: string;
  expiresAt: number;
}

export interface JwtManagerOptions {
  fetch?: FetchLike;
  authBase?: string;
  now?: () => number;
}

export class JwtManager {
  private readonly fetchFn: FetchLike;
  private readonly authBase: string;
  private readonly now: () => number;
  private readonly cache = new Map<string, CachedJwt>();
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(options: JwtManagerOptions = {}) {
    this.fetchFn = options.fetch ?? fetch;
    this.authBase = options.authBase ?? AUTH_BASE;
    this.now = options.now ?? Date.now;
  }

  async getJwt(apiKey: string): Promise<string> {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    const nowSeconds = Math.floor(this.now() / 1000);
    const cached = this.cache.get(apiKey);

    if (cached && cached.expiresAt > nowSeconds + 60) {
      return cached.token;
    }

    const inFlight = this.inFlight.get(apiKey);
    if (inFlight) {
      return inFlight;
    }

    const pending = this.fetchJwt(apiKey)
      .then((token) => {
        const expiresAt = getJwtExp(token) || Math.floor(this.now() / 1000) + 3600;
        this.cache.set(apiKey, { token, expiresAt });
        return token;
      })
      .finally(() => {
        this.inFlight.delete(apiKey);
      });

    this.inFlight.set(apiKey, pending);
    return pending;
  }

  private async fetchJwt(apiKey: string): Promise<string> {
    const metadata = new ProtobufEncoder();
    metadata.writeString(1, WS_APP);
    metadata.writeString(2, WS_APP_VER);
    metadata.writeString(3, apiKey);
    metadata.writeString(4, 'zh-cn');
    metadata.writeString(7, WS_LS_VER);
    metadata.writeString(12, WS_APP);
    metadata.writeBytes(30, Buffer.from([0x00, 0x01]));

    const requestBody = new ProtobufEncoder();
    requestBody.writeMessage(1, metadata);

    const response = await this.fetchFn(`${this.authBase}/GetUserJwt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/proto',
        'Connect-Protocol-Version': '1',
        'User-Agent': 'connect-go/1.18.1 (go1.25.5)',
      },
      body: requestBody.toBuffer(),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const token = extractJwt(bytes);

    if (!token) {
      throw new Error('Failed to extract JWT from GetUserJwt response');
    }

    return token;
  }
}

function extractJwt(value: Buffer): string | null {
  const match = value.toString('utf8').match(JWT_PATTERN);
  return match?.[0] ?? null;
}

function getJwtExp(jwt: string): number {
  try {
    const payloadPart = jwt.split('.')[1];
    if (!payloadPart) {
      return 0;
    }

    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : 0;
  } catch {
    return 0;
  }
}
