# @bxb1337/windsurf-fast-context

An AI SDK V3 compatible provider for Windsurf's Devstral code search API. This provider exposes tool calls for code search operations, allowing tools like OpenCode to execute them.

**Important**: This provider exposes tool calls but does **not** execute them. Tool execution is delegated to the caller (e.g., OpenCode, your application).

## Installation

```bash
npm install @bxb1337/windsurf-fast-context
# or
pnpm add @bxb1337/windsurf-fast-context
# or
yarn add @bxb1337/windsurf-fast-context
```

### Peer Dependencies

This package requires `ai` as a peer dependency:

```bash
npm install ai
```

## Quick Start

```typescript
import { createWindsurfProvider } from '@bxb1337/windsurf-fast-context';
import { generateText } from 'ai';

// Create the provider with your API key
const windsurf = createWindsurfProvider({
  apiKey: process.env.WINDSURF_API_KEY,
});

// Use with AI SDK
const result = await generateText({
  model: windsurf('MODEL_SWE_1_6_FAST'),
  prompt: 'Find authentication logic in the codebase',
  tools: {
    ripgrep: {
      description: 'Search for patterns in files',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string' },
        },
        required: ['pattern'],
      },
    },
    readfile: {
      description: 'Read file contents',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
  },
});

// Tool calls are exposed for you to execute
for (const part of result.content) {
  if (part.type === 'tool-call') {
    console.log(`Tool: ${part.toolName}`);
    console.log(`Args: ${JSON.stringify(part.args)}`);
    // Execute the tool yourself...
  }
}
```

## API Reference

### `createWindsurfProvider(options?)`

Creates a Windsurf provider factory function.

```typescript
import { createWindsurfProvider } from '@bxb1337/windsurf-fast-context';

const windsurf = createWindsurfProvider({
  apiKey: 'your-api-key',
  baseURL: 'https://custom-endpoint.com',
  headers: { 'X-Custom': 'value' },
});
```

#### Options

| Option | Type | Description |
|--------|------|-------------|
| `apiKey` | `string` | Windsurf API key. Falls back to `WINDSURF_API_KEY` environment variable. Required. |
| `baseURL` | `string` | Custom API endpoint. Default: `https://server.self-serve.windsurf.com` |
| `headers` | `Record<string, string>` | Custom headers to send with each request. |
| `fetch` | `FetchFn` | Custom fetch function for testing or proxying. |
| `generateId` | `() => string` | Custom ID generator for tool calls. |

#### Returns

A function that accepts a model ID and returns a `LanguageModelV3` instance:

```typescript
const model = windsurf('MODEL_SWE_1_6_FAST');
```

### `windsurf` (named export)

A pre-configured provider instance that reads the API key from `WINDSURF_API_KEY`:

```typescript
import { windsurf } from '@bxb1337/windsurf-fast-context';

const model = windsurf('MODEL_SWE_1_6_FAST');
```

### Default Export

The default export is the `windsurf` provider:

```typescript
import windsurf from '@bxb1337/windsurf-fast-context';

const model = windsurf('MODEL_SWE_1_6_FAST');
```

### Supported Models

| Model ID | Description |
|----------|-------------|
| `MODEL_SWE_1_6_FAST` | Fast variant for quick responses |
| `MODEL_SWE_1_6` | Standard variant with more capability |

Custom model IDs are also accepted as strings.

## Configuration

### Environment Variable

Set your API key via environment variable:

```bash
export WINDSURF_API_KEY="your-api-key"
```

Then use the default export:

```typescript
import windsurf from '@bxb1337/windsurf-fast-context';

// Reads WINDSURF_API_KEY automatically
const model = windsurf('MODEL_SWE_1_6_FAST');
```

### OpenCode Integration

Add to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "windsurf": {
      "npm": "@bxb1337/windsurf-fast-context",
      "name": "Windsurf Devstral",
      "options": {
        "apiKey": "your-api-key",
        "baseURL": "https://server.self-serve.windsurf.com"
      },
      "models": {
        "MODEL_SWE_1_6_FAST": {
          "name": "Devstral Fast",
          "limit": {
            "context": 128000,
            "output": 8192
          }
        }
      }
    }
  }
}
```

### Custom Fetch for Testing

```typescript
import { createWindsurfProvider } from '@bxb1337/windsurf-fast-context';

const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
  // Return mock responses for testing
  return new Response(JSON.stringify({ result: 'mocked' }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

const windsurf = createWindsurfProvider({
  apiKey: 'test-key',
  fetch: mockFetch,
});
```

## Examples

### Basic Code Search

```typescript
import windsurf from '@bxb1337/windsurf-fast-context';
import { generateText } from 'ai';

const result = await generateText({
  model: windsurf('MODEL_SWE_1_6_FAST'),
  prompt: 'Search for TODO comments in the codebase',
  tools: {
    ripgrep: {
      description: 'Search files using regex patterns',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search' },
          path: { type: 'string', description: 'Directory to search in' },
        },
        required: ['pattern'],
      },
    },
  },
});

console.log(result.text);
```

### Streaming Responses

```typescript
import windsurf from '@bxb1337/windsurf-fast-context';
import { streamText } from 'ai';

const stream = await streamText({
  model: windsurf('MODEL_SWE_1_6_FAST'),
  prompt: 'Analyze the project structure',
  tools: {
    tree: {
      description: 'List directory tree',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          depth: { type: 'number' },
        },
        required: ['path'],
      },
    },
  },
});

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

### Multi-turn Conversation

```typescript
import windsurf from '@bxb1337/windsurf-fast-context';
import { generateText } from 'ai';

const result = await generateText({
  model: windsurf('MODEL_SWE_1_6_FAST'),
  messages: [
    { role: 'system', content: 'You are a code search assistant.' },
    { role: 'user', content: 'Find all API routes' },
    { role: 'assistant', content: 'I found routes in src/routes/' },
    { role: 'user', content: 'Show me the auth routes' },
  ],
  tools: {
    glob: {
      description: 'Find files matching a pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
        },
        required: ['pattern'],
      },
    },
  },
});
```

## Troubleshooting

### "WINDSURF_API_KEY is required"

The API key was not provided. Either:
1. Pass `apiKey` to `createWindsurfProvider()`
2. Set the `WINDSURF_API_KEY` environment variable

### Authentication Errors

If you see authentication failures:
1. Verify your API key is valid and not expired
2. Check that the key starts with the expected prefix
3. Ensure no extra whitespace in the environment variable

### Tool Calls Not Executed

This is expected behavior. This provider exposes tool calls for you to execute. The `restricted_exec` and `answer` tools are returned as `tool-call` content parts. Your application is responsible for executing them.

### Integration Tests Skipped

Integration tests are gated by `WINDSURF_API_KEY`. To run them:

```bash
export WINDSURF_API_KEY="your-api-key"
pnpm test test/integration/
```

### Custom Endpoint Issues

When using `baseURL`, ensure:
1. The URL includes the protocol (`https://`)
2. No trailing slash
3. The endpoint is accessible from your network

## What This Package Does NOT Do

Per the design scope:

- **No built-in tool execution**: Tools like `rg`, `readfile`, `tree`, `ls`, `glob` are exposed as tool calls, not executed
- **No MCP server**: This is an AI SDK provider, not an MCP server implementation
- **No local key extraction**: API keys must be provided explicitly via constructor or environment variable
- **No Chat/Completions API compatibility**: This is an AI SDK V3 provider, not an OpenAI-compatible API

## License

MIT
