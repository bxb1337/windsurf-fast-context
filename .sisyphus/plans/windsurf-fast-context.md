# Windsurf Fast Context - AI SDK V3 Provider

## TL;DR

> **Quick Summary**: Create a TypeScript AI SDK V3 compatible provider for Windsurf's Devstral code search API. The provider exposes tool calls (rg/readfile/tree/etc) for OpenCode and similar tools to execute.
> 
> **Deliverables**:
> - `@your-org/windsurf-fast-context` npm package
> - `LanguageModelV3` implementation with `doGenerate()` and `doStream()`
> - Custom Protobuf encoder (hand-ported from fast-context-mcp)
> - JWT authentication with caching
> - Prompt/response conversion between AI SDK and Devstral formats
> - Comprehensive test suite (TDD approach)
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Scaffolding → Protocol → Auth → Conversion → Model → Provider

---

## Context

### Original Request
仿照 https://github.com/SammySnake-d/fast-context-mcp 的逆向，参考 https://ai-sdk.dev/providers/community-providers/custom-providers 做一个 ai-sdk 兼容的 typescript sdk。

### Interview Summary
**Key Discussions**:
- **Use Case**: Tool-based LLM provider for code search, not general chat
- **Tool Execution**: Expose tool calls, let OpenCode/user execute
- **Output Format**: Based on prompt - text response or tool calls
- **Package Scope**: Standard (Provider + Protocol + Auth + Types)
- **Protocol**: Custom Protobuf encoder, no Connect-ES dependency
- **Test Strategy**: TDD (Red-Green-Refactor)

**Research Findings**:
- Devstral uses Connect-RPC + Protobuf with custom framing
- Auth flow: API Key → JWT (cached with expiry)
- Tool system: `restricted_exec` and `answer` tools
- Streaming supported via Connect streaming format

### Metis Review
**Identified Gaps** (addressed):
- Runtime scope: Node-only for v1 (default assumption)
- Auth extraction: Optional helper, not implicit during model calls
- Protobuf strategy: Hand-port encoder, no `.proto` reconstruction
- Test fixtures: Required for protocol/auth/conversion tests
- Stream events: Full `tool-input-*` sequence for proper streaming

---

## Work Objectives

### Core Objective
Build a production-ready AI SDK V3 provider that wraps Windsurf's Devstral API for code search capabilities, enabling OpenCode and similar tools to use Devstral as a tool-calling LLM.

### Concrete Deliverables
- `src/provider.ts` - Provider factory function
- `src/model/devstral-language-model.ts` - LanguageModelV3 implementation
- `src/protocol/protobuf.ts` - Custom Protobuf encoder/decoder
- `src/protocol/connect-frame.ts` - Connect-RPC frame handling
- `src/transport/http.ts` - HTTP transport layer
- `src/auth/jwt-manager.ts` - JWT authentication with caching
- `src/conversion/prompt-converter.ts` - AI SDK → Devstral message conversion
- `src/conversion/response-converter.ts` - Devstral → AI SDK response conversion
- `src/types/index.ts` - TypeScript type definitions
- Comprehensive test suite with fixtures

### Definition of Done
- [ ] All tests pass: `pnpm test`
- [ ] Build succeeds: `pnpm build`
- [ ] Type check passes: `pnpm typecheck`
- [ ] Package exports work: Consumer import test passes
- [ ] README documentation complete
- [ ] Example usage documented

### Must Have
- LanguageModelV3 interface fully implemented (doGenerate + doStream)
- Tool call exposure via AI SDK's tool-call content type
- JWT authentication with automatic refresh
- Streaming support with proper stream parts
- Error handling with typed errors

### Must NOT Have (Guardrails from Metis)
- No built-in tool execution (rg/readfile/tree/ls/glob)
- No MCP server implementation
- No CLI or UI components
- No browser/edge runtime support in v1
- No `.proto` file reconstruction or code generation
- No support for other Windsurf models/endpoints
- **No local Windsurf key extraction** - API key must be provided explicitly via constructor or env var

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (new package)
- **Automated tests**: TDD (Red-Green-Refactor)
- **Framework**: vitest (fast, TypeScript-native)
- **TDD Flow**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task includes agent-executed QA scenarios.

- **Unit Tests**: vitest with fixture-based tests
- **Integration Tests**: Opt-in suite gated by `WINDSURF_API_KEY` env var
- **Evidence**: `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - 5 tasks):
├── T1: Package scaffolding + CI config [quick]
├── T2: TypeScript config + build setup [quick]
├── T3: Type definitions [quick]
├── T4: Protocol fixtures [quick]
└── T5: Protobuf encoder/decoder [unspecified-high]

Wave 2 (Transport + Auth - 4 tasks):
├── T6: Connect frame encoding/decoding [unspecified-high]
├── T7: HTTP transport layer [unspecified-high]
├── T8: JWT manager [deep]
└── T9: API key resolution [quick]

Wave 3 (Conversion + Model - 4 tasks):
├── T10: Prompt converter (AI SDK → Devstral) [deep]
├── T11: Response converter (Devstral → AI SDK) [deep]
├── T12: LanguageModelV3 doGenerate() [deep]
└── T13: LanguageModelV3 doStream() [deep]

Wave 4 (Integration + Polish - 4 tasks):
├── T14: Provider factory [quick]
├── T15: Integration tests [unspecified-high]
├── T16: README + API docs [writing]
└── T17: Package surface verification [quick]

Critical Path: T1 → T5 → T6 → T8 → T10 → T12 → T14 → T17
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| T1 | - | T2-T17 |
| T2 | T1 | T3, T5 |
| T3 | T1, T2 | T10, T11 |
| T4 | T1 | T5, T6, T8 |
| T5 | T1, T2, T4 | T6, T10, T11 |
| T6 | T4, T5 | T7, T8, T12, T13 |
| T7 | T6 | T8, T12, T13 |
| T8 | T4, T6, T7 | T12, T13 |
| T9 | T1 | T8 |
| T10 | T3, T5 | T12, T13 |
| T11 | T3, T5 | T12, T13 |
| T12 | T6-T11 | T14 |
| T13 | T6-T11 | T14 |
| T14 | T12, T13 | T15, T17 |
| T15 | T14 | T17 |
| T16 | T14 | - |
| T17 | T14, T15 | - |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks → T1-T3 `quick`, T4 `quick`, T5 `unspecified-high`
- **Wave 2**: 4 tasks → T6-T7 `unspecified-high`, T8 `deep`, T9 `quick`
- **Wave 3**: 4 tasks → T10-T11 `deep`, T12-T13 `deep`
- **Wave 4**: 4 tasks → T14 `quick`, T15 `unspecified-high`, T16 `writing`, T17 `quick`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Package Scaffolding + CI Config

  **What to do**:
  - Create package directory structure
  - Initialize package.json with name `@your-org/windsurf-fast-context`
  - Set up vitest for testing
  - Configure GitHub Actions CI workflow
  - Add .gitignore, LICENSE (MIT), basic README

  **Must NOT do**:
  - Do not add source code yet (just scaffolding)
  - Do not configure build yet (Task 2)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard package initialization, well-defined steps
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO - Foundation task
  - **Parallel Group**: Wave 1 start
  - **Blocks**: T2-T17
  - **Blocked By**: None

  **References**:
  - `fast-context-mcp/package.json` - Package structure reference
  - https://vitest.dev/guide/ - Vitest setup guide

  **Acceptance Criteria**:
  - [ ] `pnpm install` succeeds
  - [ ] `pnpm test` runs (no tests yet, exits cleanly)
  - [ ] `.github/workflows/ci.yml` exists
  - [ ] LICENSE file exists (MIT)

  **QA Scenarios**:
  ```
  Scenario: Package installation succeeds
    Tool: Bash
    Steps:
      1. cd windsurf-fast-context
      2. pnpm install
    Expected Result: Exit code 0, node_modules created
    Evidence: .sisyphus/evidence/task-01-install.txt
  
  Scenario: Test runner is configured
    Tool: Bash
    Steps:
      1. pnpm test -- --passWithNoTests
    Expected Result: Exit code 0, "No tests found" message
    Evidence: .sisyphus/evidence/task-01-test-runner.txt
  ```

  **Commit**: YES
  - Message: `chore: initial package scaffolding`
  - Files: package.json, .gitignore, LICENSE, .github/workflows/ci.yml, vitest.config.ts

---

- [x] 2. TypeScript Config + Build Setup

  **What to do**:
  - Create tsconfig.json for ESM output
  - Configure dual ESM/CJS build (for final package compatibility)
  - Add build scripts to package.json
  - Set up type declaration generation
  - Create minimal `src/index.ts` placeholder with `export {}`

  **Must NOT do**:
  - Do not create actual implementation code (just placeholder for build to succeed)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard TypeScript configuration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T3)
  - **Blocks**: T5, T10, T11
  - **Blocked By**: T1

  **References**:
  - https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html

  **Acceptance Criteria**:
  - [ ] `pnpm build` succeeds (creates dist/ with index.js and index.d.ts)
  - [ ] `pnpm typecheck` succeeds
  - [ ] tsconfig.json targets ES2022, ESM modules
  - [ ] dist/index.js exists

  **QA Scenarios**:
  ```
  Scenario: Build command succeeds
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Exit code 0, dist/ directory created
    Evidence: .sisyphus/evidence/task-02-build.txt
  
  Scenario: TypeScript compilation configured
    Tool: Bash
    Steps:
      1. pnpm exec tsc --version
      2. cat tsconfig.json
    Expected Result: TypeScript version shown, config valid JSON
    Evidence: .sisyphus/evidence/task-02-typescript.txt
  
  Scenario: Build output exists
    Tool: Bash
    Steps:
      1. ls -la dist/index.js
    Expected Result: File exists
    Evidence: .sisyphus/evidence/task-02-output.txt
  ```

  **Commit**: YES
  - Message: `chore: add TypeScript and build configuration`
  - Files: tsconfig.json, package.json (updated scripts)

---

- [x] 3. Type Definitions

  **What to do**:
  - Create `src/types/index.ts`
  - Define Devstral message types
  - Define tool types
  - Define config/options types (OpenCode-compatible style)
  - Export all types from index

  **Types to define**:
  ```typescript
  // ============================================
  // Provider Options (OpenCode-compatible style)
  // ============================================
  
  /**
   * Windsurf Provider options - compatible with OpenCode provider config
   * 
   * @example
   * // In opencode.json:
   * {
   *   "provider": {
   *     "windsurf": {
   *       "options": {
   *         "apiKey": "your-api-key",
   *         "baseURL": "https://custom-endpoint.com"
   *       }
   *     }
   *   }
   * }
   */
  export interface WindsurfProviderOptions {
    /**
     * Windsurf API key.
     * Can also be set via WINDSURF_API_KEY environment variable.
     */
    apiKey?: string;
    
    /**
     * Custom API endpoint URL.
     * Default: https://server.self-serve.windsurf.com
     */
    baseURL?: string;
    
    /**
     * Custom headers to send with each request.
     */
    headers?: Record<string, string>;
    
    /**
     * Custom fetch function for testing or proxying.
     */
    fetch?: typeof fetch;
    
    /**
     * Generate unique IDs for tool calls.
     */
    generateId?: () => string;
  }
  
  // ============================================
  // Devstral Protocol Types
  // ============================================
  
  // Devstral role enum (protobuf field values)
  export type DevstralRole = 1 | 2 | 4 | 5; // user=1, assistant=2, tool_result=4, system=5
  
  // Devstral message (maps to AI SDK LanguageModelV3Prompt)
  export interface DevstralMessage {
    role: DevstralRole;
    content: string;
    toolCallId?: string;
    toolName?: string;
    toolArgsJson?: string;
  }
  
  // Devstral metadata (sent with every request)
  export interface DevstralMetadata {
    appName: string;
    appVersion: string;
    apiKey: string;
    jwt?: string;
    locale?: string;
  }
  
  // Tool definition (maps to AI SDK LanguageModelV3FunctionTool)
  export interface DevstralToolDefinition {
    type: 'function';
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  }
  
  // Model IDs
  export type WindsurfModelId = 
    | 'MODEL_SWE_1_6_FAST'
    | 'MODEL_SWE_1_6'
    | string; // Allow custom model IDs
  ```

  **Must NOT do**:
  - Do not add implementation code, only types

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definitions, no runtime logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2)
  - **Blocks**: T10, T11
  - **Blocked By**: T1

  **References**:
  - `fast-context-mcp/src/core.mjs` - Message structure
  - `@ai-sdk/provider` types - LanguageModelV3Prompt
  - https://opencode.ai/docs/zh-cn/providers/ - OpenCode provider config style

  **Acceptance Criteria**:
  - [ ] `src/types/index.ts` exists
  - [ ] `pnpm typecheck` passes
  - [ ] Types are exported correctly
  - [ ] `WindsurfProviderOptions` matches OpenCode style

  **QA Scenarios**:
  ```
  Scenario: Type definitions compile
    Tool: Bash
    Steps:
      1. pnpm typecheck
    Expected Result: Exit code 0, no errors
    Evidence: .sisyphus/evidence/task-03-types.txt
  
  Scenario: Types are importable
    Tool: Bash
    Steps:
      1. echo "import type { WindsurfProviderOptions } from './src/types/index.js'; console.log('ok');" > test-import.ts
      2. pnpm exec tsc --noEmit test-import.ts
      3. rm test-import.ts
    Expected Result: Exit code 0, types resolve correctly
    Evidence: .sisyphus/evidence/task-03-import.txt
  ```

  **Commit**: YES
  - Message: `feat: add type definitions`
  - Files: src/types/index.ts

---

- [x] 4. Protocol Fixtures

  **What to do**:
  - Create `test/fixtures/` directory
  - Add binary fixtures for Connect frames
  - Add binary fixtures for Protobuf messages
  - Add auth response fixtures
  - Document fixture sources (captured from fast-context-mcp or synthetic)

  **Fixtures to create**:
  ```
  test/fixtures/
  ├── connect/
  │   ├── frame-simple.bin        # Simple uncompressed frame
  │   ├── frame-gzip.bin          # Gzip-compressed frame
  │   └── frame-multi.bin         # Multiple frames concatenated
  ├── protobuf/
  │   ├── message-user.bin        # User message
  │   ├── message-assistant.bin   # Assistant message with tool call
  │   ├── metadata.bin            # Metadata message
  │   └── tool-definitions.bin    # Tool definitions string
  └── auth/
      └── jwt-response.bin        # JWT response from GetUserJwt
  ```

  **Must NOT do**:
  - Do not create implementation code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test data setup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T5, T6, T8
  - **Blocked By**: T1

  **References**:
  - `fast-context-mcp/src/protobuf.mjs` - Encoding patterns to replicate

  **Acceptance Criteria**:
  - [ ] `test/fixtures/` directory exists
  - [ ] At least 5 binary fixtures created
  - [ ] Each fixture documented in `test/fixtures/README.md`

  **QA Scenarios**:
  ```
  Scenario: Fixtures directory exists
    Tool: Bash
    Steps:
      1. ls -la test/fixtures/
    Expected Result: Directory exists with README.md and subdirectories
    Evidence: .sisyphus/evidence/task-04-fixtures-dir.txt
  
  Scenario: Binary fixtures are valid
    Tool: Bash
    Steps:
      1. file test/fixtures/**/*.bin
    Expected Result: All files recognized as data
    Evidence: .sisyphus/evidence/task-04-fixtures-valid.txt
  ```

  **Commit**: YES
  - Message: `test: add protocol fixtures`
  - Files: test/fixtures/**, test/fixtures/README.md

---

- [x] 5. Protobuf Encoder/Decoder

  **What to do**:
  - Create `src/protocol/protobuf.ts`
  - Implement `ProtobufEncoder` class with methods:
    - `writeVarint(field: number, value: number)`
    - `writeString(field: number, value: string)`
    - `writeBytes(field: number, data: Buffer)`
    - `writeMessage(field: number, encoder: ProtobufEncoder)`
    - `toBuffer(): Buffer`
  - Implement `decodeVarint(buffer: Buffer, offset: number): [value: number, newOffset: number]`
  - Implement `extractStrings(buffer: Buffer): string[]`
  - Write comprehensive tests using fixtures

  **Must NOT do**:
  - Do not implement Connect framing (separate task)
  - Do not use protobuf libraries - hand-written implementation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core protocol implementation, requires precision
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (after T1, T2)
  - **Blocks**: T6, T10, T11
  - **Blocked By**: T1, T2, T4

  **References**:
  - `fast-context-mcp/src/protobuf.mjs:1-150` - Exact encoding logic to port
  - https://developers.google.com/protocol-buffers/docs/encoding - Varint encoding

  **Acceptance Criteria**:
  - [ ] `pnpm test src/protocol/protobuf.test.ts` passes
  - [ ] Encoder produces byte-identical output to fast-context-mcp
  - [ ] Decoder extracts strings correctly from fixture files
  - [ ] Coverage > 90%

  **QA Scenarios**:
  ```
  Scenario: Varint encoding roundtrip
    Tool: Bash
    Steps:
      1. pnpm test src/protocol/protobuf.test.ts -- --run
    Expected Result: All tests pass, varint tests included
    Evidence: .sisyphus/evidence/task-05-varint.txt
  
  Scenario: String extraction from fixture
    Tool: Bash
    Steps:
      1. pnpm test src/protocol/protobuf.test.ts -- --run -t "extractStrings"
    Expected Result: Test passes, strings extracted correctly
    Evidence: .sisyphus/evidence/task-05-extract.txt
  
  Scenario: Encoder matches reference
    Tool: Bash
    Steps:
      1. pnpm test src/protocol/protobuf.test.ts -- --run -t "matches fast-context-mcp"
    Expected Result: Test passes, byte-identical output
    Evidence: .sisyphus/evidence/task-05-match.txt
  ```

  **Commit**: YES
  - Message: `feat: implement protobuf encoder/decoder`
  - Files: src/protocol/protobuf.ts, src/protocol/protobuf.test.ts
  - Pre-commit: `pnpm test src/protocol/protobuf.test.ts`

---

- [x] 6. Connect Frame Encoding/Decoding

  **What to do**:
  - Create `src/protocol/connect-frame.ts`
  - Implement `connectFrameEncode(payload: Buffer, compressed?: boolean): Buffer`
    - Frame format: `<1-byte flags><4-byte BE length><payload>`
    - Flags: 1 = gzip compressed, 0 = uncompressed
  - Implement `connectFrameDecode(buffer: Buffer): Buffer[]`
    - Parse concatenated frames
    - Gunzip compressed frames
    - Return array of decoded payloads
  - Write tests using fixtures from T4

  **Must NOT do**:
  - Do not handle HTTP transport (separate task)
  - Do not parse protobuf inside frames (handled by protobuf.ts)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Protocol implementation, requires precision
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T7)
  - **Blocks**: T7, T8, T12, T13
  - **Blocked By**: T4, T5

  **References**:
  - `fast-context-mcp/src/protobuf.mjs:152-200` - Connect frame encoding
  - `fast-context-mcp/src/core.mjs` - Frame usage in streaming

  **Acceptance Criteria**:
  - [ ] `pnpm test src/protocol/connect-frame.test.ts` passes
  - [ ] Encoder produces valid frames
  - [ ] Decoder handles gzip and uncompressed frames
  - [ ] Round-trip encode → decode returns original payload

  **QA Scenarios**:
  ```
  Scenario: Frame encoding roundtrip
    Tool: Bash
    Steps:
      1. pnpm test src/protocol/connect-frame.test.ts -- --run -t "roundtrip"
    Expected Result: Test passes
    Evidence: .sisyphus/evidence/task-06-roundtrip.txt
  
  Scenario: Gzip frame decoding
    Tool: Bash
    Steps:
      1. pnpm test src/protocol/connect-frame.test.ts -- --run -t "gzip"
    Expected Result: Test passes, gunzip works correctly
    Evidence: .sisyphus/evidence/task-06-gzip.txt
  
  Scenario: Multiple frames decode
    Tool: Bash
    Steps:
      1. pnpm test src/protocol/connect-frame.test.ts -- --run -t "multiple"
    Expected Result: Test passes, all frames decoded
    Evidence: .sisyphus/evidence/task-06-multi.txt
  ```

  **Commit**: YES
  - Message: `feat: implement connect frame encoding/decoding`
  - Files: src/protocol/connect-frame.ts, src/protocol/connect-frame.test.ts

---

- [x] 7. HTTP Transport Layer

  **What to do**:
  - Create `src/transport/http.ts`
  - Implement `DevstralTransport` class:
    - `postUnary(url: string, body: Buffer, headers: Headers): Promise<Buffer>`
    - `postStreaming(url: string, body: Buffer, headers: Headers, signal?: AbortSignal): Promise<Buffer>`
  - Handle TLS fallback (like fast-context-mcp)
  - Handle retries for 5xx errors
  - Proper error classification (AUTH_ERROR, RATE_LIMITED, NETWORK_ERROR)

  **Must NOT do**:
  - Do not implement auth (separate task)
  - Do not parse response content (handled by callers)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Network layer, requires error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T6)
  - **Blocks**: T8, T12, T13
  - **Blocked By**: T6

  **References**:
  - `fast-context-mcp/src/core.mjs:_streamingRequest` - HTTP implementation

  **Acceptance Criteria**:
  - [ ] `pnpm test src/transport/http.test.ts` passes
  - [ ] Mock tests for all error scenarios
  - [ ] Timeout handling works
  - [ ] AbortSignal cancels requests

  **QA Scenarios**:
  ```
  Scenario: Unary POST request
    Tool: Bash
    Steps:
      1. pnpm test src/transport/http.test.ts -- --run -t "unary"
    Expected Result: Test passes with mock server
    Evidence: .sisyphus/evidence/task-07-unary.txt
  
  Scenario: Streaming request
    Tool: Bash
    Steps:
      1. pnpm test src/transport/http.test.ts -- --run -t "streaming"
    Expected Result: Test passes, body read correctly
    Evidence: .sisyphus/evidence/task-07-stream.txt
  
  Scenario: Error classification
    Tool: Bash
    Steps:
      1. pnpm test src/transport/http.test.ts -- --run -t "error"
    Expected Result: 403→AUTH_ERROR, 429→RATE_LIMITED, 500→NETWORK_ERROR
    Evidence: .sisyphus/evidence/task-07-error.txt
  ```

  **Commit**: YES
  - Message: `feat: implement HTTP transport layer`
  - Files: src/transport/http.ts, src/transport/http.test.ts

---

- [x] 8. JWT Manager

  **What to do**:
  - Create `src/auth/jwt-manager.ts`
  - Implement JWT exchange: API key → JWT
  - Implement JWT caching with expiry check
  - Implement single-flight pattern for concurrent requests
  - Decode JWT to extract `exp` claim
  - Refresh 60 seconds before expiry

  **JWT Exchange Flow**:
  1. Build metadata protobuf with API key
  2. POST to `${AUTH_BASE}/GetUserJwt`
  3. Extract JWT string from response (starts with "eyJ")
  4. Cache with expiry

  **Must NOT do**:
  - Do not read from Windsurf DB (separate optional task)
  - Do not hardcode API keys

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Auth logic with caching and concurrency
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (after T6, T7)
  - **Blocks**: T12, T13
  - **Blocked By**: T4, T6, T7

  **References**:
  - `fast-context-mcp/src/core.mjs:fetchJwt` - JWT fetch logic
  - `fast-context-mcp/src/core.mjs:getCachedJwt` - Caching logic

  **Acceptance Criteria**:
  - [ ] `pnpm test src/auth/jwt-manager.test.ts` passes
  - [ ] JWT cached and reused
  - [ ] Refresh happens before expiry
  - [ ] Concurrent requests share single JWT fetch

  **QA Scenarios**:
  ```
  Scenario: JWT fetch and cache
    Tool: Bash
    Steps:
      1. pnpm test src/auth/jwt-manager.test.ts -- --run -t "fetch"
    Expected Result: Test passes, JWT extracted correctly
    Evidence: .sisyphus/evidence/task-08-fetch.txt
  
  Scenario: JWT expiry refresh
    Tool: Bash
    Steps:
      1. pnpm test src/auth/jwt-manager.test.ts -- --run -t "expiry"
    Expected Result: Test passes, refresh triggered
    Evidence: .sisyphus/evidence/task-08-expiry.txt
  
  Scenario: Concurrent request deduplication
    Tool: Bash
    Steps:
      1. pnpm test src/auth/jwt-manager.test.ts -- --run -t "concurrent"
    Expected Result: Test passes, only one fetch
    Evidence: .sisyphus/evidence/task-08-concurrent.txt
  ```

  **Commit**: YES
  - Message: `feat: implement JWT manager with caching`
  - Files: src/auth/jwt-manager.ts, src/auth/jwt-manager.test.ts

---

- [x] 9. API Key Resolution

  **What to do**:
  - Create `src/auth/api-key.ts`
  - Implement simple resolution: `apiKey` option → `WINDSURF_API_KEY` env var → error
  - Throw clear error if no key provided

  **Must NOT do**:
  - Do NOT read from local Windsurf database
  - Do NOT auto-extract from any local files
  - Do NOT store API keys in files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple resolution logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T8
  - **Blocked By**: T1

  **References**:
  - `@ai-sdk/provider-utils` `loadApiKey` pattern

  **Acceptance Criteria**:
  - [ ] `pnpm test src/auth/api-key.test.ts` passes
  - [ ] Constructor `apiKey` option works
  - [ ] `WINDSURF_API_KEY` env var fallback works
  - [ ] Missing key throws clear error: "WINDSURF_API_KEY is required"

  **QA Scenarios**:
  ```
  Scenario: Constructor option works
    Tool: Bash
    Steps:
      1. pnpm test src/auth/api-key.test.ts -- --run -t "constructor"
    Expected Result: Test passes
    Evidence: .sisyphus/evidence/task-09-constructor.txt
  
  Scenario: Env var fallback works
    Tool: Bash
    Steps:
      1. WINDSURF_API_KEY=test-key pnpm test src/auth/api-key.test.ts -- --run -t "env"
    Expected Result: Test passes
    Evidence: .sisyphus/evidence/task-09-env.txt
  
  Scenario: Missing key throws error
    Tool: Bash
    Steps:
      1. unset WINDSURF_API_KEY && pnpm test src/auth/api-key.test.ts -- --run -t "missing"
    Expected Result: Test passes with clear error message
    Evidence: .sisyphus/evidence/task-09-missing.txt
  ```

  **Commit**: YES
  - Message: `feat: implement API key resolution`
  - Files: src/auth/api-key.ts, src/auth/api-key.test.ts

---

- [x] 10. Prompt Converter (AI SDK → Devstral)

  **What to do**:
  - Create `src/conversion/prompt-converter.ts`
  - Implement `convertPrompt(prompt: LanguageModelV3Prompt): DevstralMessage[]`
  - Map AI SDK roles to Devstral roles:
    - `system` → role 5
    - `user` → role 1
    - `assistant` → role 2
    - `tool` → role 4
  - Handle tool calls in assistant messages
  - Handle tool results in tool messages
  - Write tests with fixtures

  **Must NOT do**:
  - Do not handle file/image parts (v1 scope)
  - Do not modify input prompt

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex mapping logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T11)
  - **Blocks**: T12, T13
  - **Blocked By**: T3, T5

  **References**:
  - `fast-context-mcp/src/core.mjs:_buildChatMessage` - Message building
  - `@ai-sdk/provider` LanguageModelV3Prompt types

  **Acceptance Criteria**:
  - [ ] `pnpm test src/conversion/prompt-converter.test.ts` passes
  - [ ] All AI SDK roles converted correctly
  - [ ] Tool calls preserved with IDs
  - [ ] Tool results mapped correctly

  **QA Scenarios**:
  ```
  Scenario: System message conversion
    Tool: Bash
    Steps:
      1. pnpm test src/conversion/prompt-converter.test.ts -- --run -t "system"
    Expected Result: Test passes, role=5
    Evidence: .sisyphus/evidence/task-10-system.txt
  
  Scenario: Tool call conversion
    Tool: Bash
    Steps:
      1. pnpm test src/conversion/prompt-converter.test.ts -- --run -t "tool-call"
    Expected Result: Test passes, toolCallId/toolName/args preserved
    Evidence: .sisyphus/evidence/task-10-toolcall.txt
  
  Scenario: Multi-turn conversation
    Tool: Bash
    Steps:
      1. pnpm test src/conversion/prompt-converter.test.ts -- --run -t "multi-turn"
    Expected Result: Test passes, all messages in correct order
    Evidence: .sisyphus/evidence/task-10-multiturn.txt
  ```

  **Commit**: YES
  - Message: `feat: implement prompt converter`
  - Files: src/conversion/prompt-converter.ts, src/conversion/prompt-converter.test.ts

---

- [x] 11. Response Converter (Devstral → AI SDK)

  **What to do**:
  - Create `src/conversion/response-converter.ts`
  - Implement `convertResponse(buffer: Buffer): LanguageModelV3Content[]`
  - Parse `[TOOL_CALLS]ToolName[ARGS]{json}` markers
  - Handle `answer` tool specially (final result)
  - Extract text content
  - Map finish reasons

  **Must NOT do**:
  - Do not execute tools
  - Do not make additional API calls

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex parsing logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T10)
  - **Blocks**: T12, T13
  - **Blocked By**: T3, T5

  **References**:
  - `fast-context-mcp/src/core.mjs:_parseResponse` - Response parsing
  - `fast-context-mcp/src/core.mjs:_parseToolCall` - Tool call parsing

  **Acceptance Criteria**:
  - [ ] `pnpm test src/conversion/response-converter.test.ts` passes
  - [ ] Text content extracted correctly
  - [ ] Tool calls parsed with valid JSON
  - [ ] Malformed tool calls handled gracefully

  **QA Scenarios**:
  ```
  Scenario: Text response conversion
    Tool: Bash
    Steps:
      1. pnpm test src/conversion/response-converter.test.ts -- --run -t "text"
    Expected Result: Test passes, text content extracted
    Evidence: .sisyphus/evidence/task-11-text.txt
  
  Scenario: Tool call parsing
    Tool: Bash
    Steps:
      1. pnpm test src/conversion/response-converter.test.ts -- --run -t "tool-call"
    Expected Result: Test passes, JSON parsed correctly
    Evidence: .sisyphus/evidence/task-11-toolcall.txt
  
  Scenario: Malformed tool call handling
    Tool: Bash
    Steps:
      1. pnpm test src/conversion/response-converter.test.ts -- --run -t "malformed"
    Expected Result: Test passes, error handled gracefully
    Evidence: .sisyphus/evidence/task-11-malformed.txt
  ```

  **Commit**: YES
  - Message: `feat: implement response converter`
  - Files: src/conversion/response-converter.ts, src/conversion/response-converter.test.ts

---

- [x] 12. LanguageModelV3 doGenerate()

  **What to do**:
  - Create `src/model/devstral-language-model.ts`
  - Implement `DevstralLanguageModel` class
  - Implement `doGenerate(options: LanguageModelV3CallOptions)`
  - Build request protobuf (metadata + messages + tools)
  - Make HTTP request via transport
  - Parse response and return `LanguageModelV3GenerateResult`

  **Must NOT do**:
  - Do not implement streaming (separate task)
  - Do not execute tools

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core model implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after T6-T11)
  - **Blocks**: T14
  - **Blocked By**: T6, T7, T8, T10, T11

  **References**:
  - `fast-context-mcp/src/core.mjs:_buildRequest` - Request building
  - `@ai-sdk/provider` LanguageModelV3 interface

  **Acceptance Criteria**:
  - [ ] `pnpm test src/model/devstral-language-model.test.ts` passes
  - [ ] doGenerate returns valid GenerateResult
  - [ ] Tool calls included in content
  - [ ] Usage statistics populated

  **QA Scenarios**:
  ```
  Scenario: Basic generate request
    Tool: Bash
    Steps:
      1. pnpm test src/model/devstral-language-model.test.ts -- --run -t "generate"
    Expected Result: Test passes with mock transport
    Evidence: .sisyphus/evidence/task-12-generate.txt
  
  Scenario: Generate with tools
    Tool: Bash
    Steps:
      1. pnpm test src/model/devstral-language-model.test.ts -- --run -t "tools"
    Expected Result: Test passes, tools in request
    Evidence: .sisyphus/evidence/task-12-tools.txt
  ```

  **Commit**: YES
  - Message: `feat: implement doGenerate`
  - Files: src/model/devstral-language-model.ts, src/model/devstral-language-model.test.ts

---

- [x] 13. LanguageModelV3 doStream()

  **What to do**:
  - Extend `DevstralLanguageModel` class
  - Implement `doStream(options: LanguageModelV3CallOptions)`
  - Emit stream parts in correct order:
    1. `stream-start`
    2. `response-metadata`
    3. `text-start` / `tool-input-start`
    4. `text-delta` / `tool-input-delta`
    5. `text-end` / `tool-input-end`
    6. `tool-call`
    7. `finish`
  - Handle abort signal
  - Handle stream errors

  **Must NOT do**:
  - Do not buffer entire stream (true streaming)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex streaming logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T12)
  - **Blocks**: T14
  - **Blocked By**: T6, T7, T8, T10, T11

  **References**:
  - `fast-context-mcp/src/core.mjs:_streamingRequest` - Streaming handling
  - AI SDK V3 stream part types

  **Acceptance Criteria**:
  - [ ] `pnpm test src/model/devstral-language-model.test.ts -- --run -t "stream"` passes
  - [ ] Stream parts emitted in correct order
  - [ ] AbortSignal cancels stream
  - [ ] Errors emitted as `error` parts

  **QA Scenarios**:
  ```
  Scenario: Stream text generation
    Tool: Bash
    Steps:
      1. pnpm test src/model/devstral-language-model.test.ts -- --run -t "stream-text"
    Expected Result: Test passes, correct part order
    Evidence: .sisyphus/evidence/task-13-stream-text.txt
  
  Scenario: Stream tool calls
    Tool: Bash
    Steps:
      1. pnpm test src/model/devstral-language-model.test.ts -- --run -t "stream-tool"
    Expected Result: Test passes, tool-input-* parts emitted
    Evidence: .sisyphus/evidence/task-13-stream-tool.txt
  
  Scenario: Abort mid-stream
    Tool: Bash
    Steps:
      1. pnpm test src/model/devstral-language-model.test.ts -- --run -t "abort"
    Expected Result: Test passes, stream stopped
    Evidence: .sisyphus/evidence/task-13-abort.txt
  ```

  **Commit**: YES
  - Message: `feat: implement doStream`
  - Files: src/model/devstral-language-model.ts, src/model/devstral-language-model.test.ts

---

- [x] 14. Provider Factory

  **What to do**:
  - Create `src/provider.ts`
  - Implement `createWindsurfProvider(options)` factory function
  - Implement default export `windsurf`
  - Support model ID configuration
  - Export types
  - Support OpenCode-compatible configuration style

  **API**:
  ```typescript
  import { createWindsurfProvider, windsurf } from '@your-org/windsurf-fast-context';
  import { generateText } from 'ai';
  
  // ============================================
  // Basic Usage
  // ============================================
  
  // Option 1: Pass API key directly
  const windsurf = createWindsurfProvider({
    apiKey: 'your-windsurf-api-key',
  });
  
  // Option 2: Use environment variable (WINDSURF_API_KEY)
  const windsurf = createWindsurfProvider();
  
  // Option 3: Full configuration (OpenCode-compatible)
  const windsurf = createWindsurfProvider({
    apiKey: 'your-api-key',
    baseURL: 'https://custom-windsurf-endpoint.com', // Override default endpoint
    headers: {
      'X-Custom-Header': 'value', // Custom headers
    },
  });
  
  // ============================================
  // Use with AI SDK
  // ============================================
  
  const result = await generateText({
    model: windsurf('MODEL_SWE_1_6_FAST'),
    prompt: 'Find authentication logic',
    tools: {
      ripgrep: { ... },
      readfile: { ... },
    },
  });
  
  // ============================================
  // OpenCode Integration (opencode.json)
  // ============================================
  
  /*
  {
    "$schema": "https://opencode.ai/config.json",
    "provider": {
      "windsurf": {
        "npm": "@your-org/windsurf-fast-context",
        "name": "Windsurf Devstral",
        "options": {
          "apiKey": "your-api-key",
          "baseURL": "https://server.self-serve.windsurf.com",
          "headers": {
            "X-Custom-Header": "value"
          }
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
  */
  
  // ============================================
  // Default export (convenience)
  // ============================================
  
  import windsurf from '@your-org/windsurf-fast-context';
  
  const result = await generateText({
    model: windsurf('MODEL_SWE_1_6_FAST'),
    prompt: 'Find authentication logic',
  });
  ```

  **Must NOT do**:
  - Do not read from local Windsurf database
  - Do not add extra configuration beyond what's needed

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple factory pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after T12, T13)
  - **Blocks**: T15, T17
  - **Blocked By**: T12, T13

  **References**:
  - `@ai-sdk/provider` ProviderV3 interface
  - https://github.com/vercel/ai/blob/main/packages/mistral/src/mistral-provider.ts - Example provider implementation
  - https://opencode.ai/docs/zh-cn/providers/#自定义提供商 - OpenCode custom provider style

  **Acceptance Criteria**:
  - [ ] `pnpm test src/provider.test.ts` passes
  - [ ] Factory returns valid LanguageModelV3
  - [ ] `apiKey` option works
  - [ ] `baseURL` option works
  - [ ] `headers` option works
  - [ ] Env var fallback works
  - [ ] Default export works

  **QA Scenarios**:
  ```
  Scenario: Provider creation with API key
    Tool: Bash
    Steps:
      1. pnpm test src/provider.test.ts -- --run -t "with-api-key"
    Expected Result: Test passes
    Evidence: .sisyphus/evidence/task-14-api-key.txt
  
  Scenario: Provider creation with env var
    Tool: Bash
    Steps:
      1. WINDSURF_API_KEY=test-key pnpm test src/provider.test.ts -- --run -t "env-var"
    Expected Result: Test passes
    Evidence: .sisyphus/evidence/task-14-env-var.txt
  
  Scenario: Provider throws without API key
    Tool: Bash
    Steps:
      1. unset WINDSURF_API_KEY && pnpm test src/provider.test.ts -- --run -t "no-key"
    Expected Result: Test passes with clear error
    Evidence: .sisyphus/evidence/task-14-no-key.txt
  
  Scenario: Custom baseURL option
    Tool: Bash
    Steps:
      1. pnpm test src/provider.test.ts -- --run -t "custom-baseurl"
    Expected Result: Test passes, custom URL used
    Evidence: .sisyphus/evidence/task-14-baseurl.txt
  
  Scenario: Custom headers option
    Tool: Bash
    Steps:
      1. pnpm test src/provider.test.ts -- --run -t "custom-headers"
    Expected Result: Test passes, headers merged correctly
    Evidence: .sisyphus/evidence/task-14-headers.txt
  ```

  **Commit**: YES
  - Message: `feat: implement provider factory`
  - Files: src/provider.ts, src/provider.test.ts, src/index.ts

---

- [ ] 15. Integration Tests

  **What to do**:
  - Create `test/integration/` directory
  - Add live tests gated by `WINDSURF_API_KEY` env var
  - Test real JWT authentication flow
  - Test real `doGenerate()` with simple prompt
  - Test real `doStream()` with streaming
  - Test tool call detection
  - Skip if no API key

  **Test Files**:
  ```
  test/integration/
  ├── auth.test.ts      # JWT exchange and caching
  ├── generate.test.ts  # doGenerate() with real API
  ├── stream.test.ts    # doStream() with real API
  └── tools.test.ts     # Tool call detection
  ```

  **Must NOT do**:
  - Do NOT commit API keys to any file
  - Do NOT require integration tests for CI pass
  - Do NOT log API key in test output

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration testing requires care
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T16, T17)
  - **Blocks**: T17
  - **Blocked By**: T14

  **References**:
  - None (new tests)

  **Acceptance Criteria**:
  - [ ] `test/integration/` exists with 4 test files
  - [ ] Tests skip without `WINDSURF_API_KEY`
  - [ ] Tests pass with valid API key
  - [ ] JWT authentication works
  - [ ] Tool calls detected correctly

  **QA Scenarios**:
  ```
  Scenario: Integration tests skip without key
    Tool: Bash
    Steps:
      1. unset WINDSURF_API_KEY && pnpm test test/integration/ -- --run
    Expected Result: Tests skip, exit 0
    Evidence: .sisyphus/evidence/task-15-skip.txt
  
  Scenario: Integration tests pass with valid key
    Tool: Bash
    Steps:
      1. export WINDSURF_API_KEY="sk-ws-01-..." # Use provided test key
      2. pnpm test test/integration/ -- --run
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-15-pass.txt
  
  Scenario: JWT authentication works
    Tool: Bash
    Steps:
      1. export WINDSURF_API_KEY="sk-ws-01-..."
      2. pnpm test test/integration/auth.test.ts -- --run
    Expected Result: Test passes, JWT obtained
    Evidence: .sisyphus/evidence/task-15-auth.txt
  
  Scenario: Generate returns valid response
    Tool: Bash
    Steps:
      1. export WINDSURF_API_KEY="sk-ws-01-..."
      2. pnpm test test/integration/generate.test.ts -- --run
    Expected Result: Test passes, response has content
    Evidence: .sisyphus/evidence/task-15-generate.txt
  ```

  **Commit**: YES
  - Message: `test: add integration tests`
  - Files: test/integration/*.ts

---

- [x] 16. README + API Docs

  **What to do**:
  - Create comprehensive README.md
  - Document installation
  - Document API usage
  - Add examples
  - Document configuration options
  - Add troubleshooting section

  **README sections**:
  1. Installation
  2. Quick Start
  3. API Reference
  4. Configuration
  5. Examples
  6. Troubleshooting
  7. License

  **Must NOT do**:
  - Do not generate API docs automatically (write manually for v1)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation writing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: T14

  **References**:
  - `fast-context-mcp/README.md` - Example structure

  **Acceptance Criteria**:
  - [ ] README.md exists with all sections
  - [ ] Examples are copy-pasteable
  - [ ] API documented

  **QA Scenarios**:
  ```
  Scenario: README exists
    Tool: Bash
    Steps:
      1. test -f README.md && wc -l README.md
    Expected Result: File exists, > 100 lines
    Evidence: .sisyphus/evidence/task-16-readme.txt
  ```

  **Commit**: YES
  - Message: `docs: add README and API documentation`
  - Files: README.md

---

- [x] 17. Package Surface Verification

  **What to do**:
  - Verify all exports work correctly
  - Test consumer import
  - Verify TypeScript types resolve
  - Run `tsc --noEmit` on consumer-style code
  - Final `pnpm build` verification

  **Must NOT do**:
  - Do not add new code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (final)
  - **Blocks**: None
  - **Blocked By**: T14, T15

  **References**:
  - None

  **Acceptance Criteria**:
  - [ ] `pnpm build` succeeds
  - [ ] `pnpm test` all pass
  - [ ] Consumer import test passes

  **QA Scenarios**:
  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. pnpm test
    Expected Result: Exit 0, all tests pass
    Evidence: .sisyphus/evidence/task-17-tests.txt
  
  Scenario: Build succeeds
    Tool: Bash
    Steps:
      1. pnpm build
      2. ls -la dist/
    Expected Result: Exit 0, dist/ populated with ESM and CJS outputs
    Evidence: .sisyphus/evidence/task-17-build.txt
  
  Scenario: Package exports work (ESM)
    Tool: Bash
    Steps:
      1. node --input-type=module -e "import { createWindsurfProvider } from './dist/index.js'; console.log(typeof createWindsurfProvider);"
    Expected Result: Prints "function"
    Evidence: .sisyphus/evidence/task-17-exports-esm.txt
  
  Scenario: Package exports work (CJS)
    Tool: Bash
    Steps:
      1. node -e "const { createWindsurfProvider } = require('./dist/index.cjs'); console.log(typeof createWindsurfProvider);"
    Expected Result: Prints "function"
    Evidence: .sisyphus/evidence/task-17-exports-cjs.txt
  ```

  **Commit**: YES
  - Message: `chore: verify package surface`
  - Files: package.json (version bump if needed)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `pnpm typecheck` + `pnpm test` + `pnpm build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

Each task has its own commit. Follow atomic commit pattern:

1. **T1**: `chore: initial package scaffolding`
2. **T2**: `chore: add TypeScript and build configuration`
3. **T3**: `feat: add type definitions`
4. **T4**: `test: add protocol fixtures`
5. **T5**: `feat: implement protobuf encoder/decoder`
6. **T6**: `feat: implement connect frame encoding/decoding`
7. **T7**: `feat: implement HTTP transport layer`
8. **T8**: `feat: implement JWT manager with caching`
9. **T9**: `feat: implement API key resolution`
10. **T10**: `feat: implement prompt converter`
11. **T11**: `feat: implement response converter`
12. **T12**: `feat: implement doGenerate`
13. **T13**: `feat: implement doStream`
14. **T14**: `feat: implement provider factory`
15. **T15**: `test: add integration tests`
16. **T16**: `docs: add README and API documentation`
17. **T17**: `chore: verify package surface`

---

## Success Criteria

### Verification Commands
```bash
# All tests pass
pnpm test

# Build succeeds
pnpm build

# Type check passes
pnpm typecheck

# Package can be imported
node -e "const { createWindsurfProvider } = require('./dist/index.js'); console.log(typeof createWindsurfProvider);"
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Build succeeds
- [ ] README complete
- [ ] Package exports work

---

## Auto-Resolved Items (from Metis Review)

| Gap | Resolution |
|-----|------------|
| Runtime scope | Node-only for v1 (default) |
| Auth method | **Explicit API key only** - no local extraction |
| Protobuf strategy | Hand-port encoder |
| Stream events | Full tool-input-* sequence |
| Test fixtures | Required for protocol tests |

## Defaults Applied

| Default | Value |
|---------|-------|
| Test framework | vitest |
| Package manager | pnpm (assumed) |
| TypeScript target | ES2022 |
| Module format | ESM + CJS dual output |
| Model ID | MODEL_SWE_1_6_FAST |
| API Key | Constructor option OR `WINDSURF_API_KEY` env var |
| Module format | ESM primary |
| Model ID | MODEL_SWE_1_6_FAST |
