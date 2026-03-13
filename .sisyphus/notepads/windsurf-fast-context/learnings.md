 - 2026-03-13: Initialized pnpm+vitest scaffolding. Kept vitest config minimal to avoid TypeScript build requirements.
 - 2026-03-13: Added passWithNoTests to vitest config to ensure vitest exits 0 when no tests are present. Captured pnpm install and test outputs to .sisyphus/evidence/.
 - 2026-03-13: Observed vitest's CLI and config interactions: adding passWithNoTests in config avoids needing the flag in CI, but keeping the CLI flag is harmless. Opted to include the config flag to guarantee zero exit code even if CI forgets the flag.
 - 2026-03-13: Note: LSP diagnostics reported missing servers (biome, typescript) in environment — informational only, does not affect package behavior.
 - 2026-03-13: Re-ran pnpm install and pnpm test and replaced evidence files with full stdout+stderr plus exit codes. Removed 'as any' cast from vitest.config.ts to satisfy acceptance criteria.
 - 2026-03-13: Added TypeScript build setup: multiple tsconfig files (ESM, CJS, types-only), minimal src/index.ts, postbuild wrapper to produce top-level dist/index.js, dist/index.cjs, and dist/index.d.ts. Built with `pnpm build` and verified outputs in .sisyphus/evidence/.
 - 2026-03-13: Fixed tsconfig include to scope compilation to src/ only to avoid compiling workspace root files (bun init artifact). Verified dist/esm/index.js and dist/cjs/index.js do not contain unintended console.log.
 - 2026-03-13: Evidence files created/updated: .sisyphus/evidence/task-02-build.txt, task-02-typescript.txt, task-02-output.txt. Build and typecheck exit codes were 0 after changes.
 - 2026-03-13: Added WindsurfProviderOptions types (apiKey, baseURL, headers, fetch, generateId) and minimal Tool/Model/Protocol types for Task 3. Kept module types-only and exported from src/index.ts for import checks.
10: - 2026-03-13: Generated deterministic binary fixtures for tests in test/fixtures. Method: small Python script wrote length-prefixed connect frames, synthetic protobuf-like messages (varint + length-delimited), and simple auth frames (4-byte timestamp + ascii). Files are non-secret and safe for repo inclusion.
 - 2026-03-13: Implemented hand-written protobuf helpers in src/protocol/protobuf.ts; fixture-driven tests confirm varint/string encoding matches synthetic binary fixtures and extractStrings can scan concatenated protobuf-like payloads.
- 2026-03-13: For dual-output build with module=CommonJS, value exports in .ts files require disabling verbatimModuleSyntax in tsconfig.cjs.json; otherwise TS1287/TS1295 occurs during cjs build.

- 2026-03-13: Fixed pnpm test hanging in watch mode. The package.json `test` script previously ran `vitest` (which defaults to watch/dev mode when an interactive TTY or certain config is present). Changed `test` script to `vitest --run` to force one-shot execution so CI and local `pnpm test` exit when complete. Verified `pnpm test` and `pnpm test src/protocol/protobuf.test.ts -- --run` both pass and terminate.

- 2026-03-13: Corrected Connect fixtures (Task 4): connect-msg-1.bin and connect-msg-2.bin now use Connect framing header (1-byte flags = 0, then 4-byte big-endian payload length) followed by payload. Updated test/fixtures/README.md and regenerated fixtures deterministically with Node. Verified header bytes and lengths match expected values.

- 2026-03-13: Added missing connect fixtures: frame-simple.bin, frame-gzip.bin, frame-multi.bin. Notes: gzip frames must set flags=1 and the 4-byte length field contains the compressed payload length (not original). Created files with deterministic Node script using node:zlib for gzip.
- 2026-03-13: Implemented connect-frame codec with a strict 5-byte header (`flags + uint32be length`). Decoder walks concatenated frames and stops without throwing when trailing bytes cannot form a full frame or declared payload overruns the buffer.

- 2026-03-13: Tests that modify environment variables must save and restore originals to avoid cross-test leakage. Use delete process.env.KEY to unset and restore previous value in afterEach/afterAll.

- 2026-03-13: Task 7 transport tests are deterministic with an injectable fetch queue returning controlled Response/Error values; this avoids global fetch patching and timing-based assertions.
- 2026-03-13: For transport response handling, `Buffer.from(await response.arrayBuffer())` works for both unary and streaming HTTP bytes; abort behavior is reliably testable by forwarding AbortSignal to fetch and preserving AbortError.

- 2026-03-13: When writing env-dependent tests (api-key), save and restore original process.env.WINDSURF_API_KEY. Use `delete process.env.WINDSURF_API_KEY` to unset during the test and restore the original value in `afterEach` to avoid cross-test leakage. Keep error messages stable (exact text) because tests match them verbatim.
- 2026-03-13: JWT manager mirrors fast-context metadata exchange for `GetUserJwt`: protobuf metadata in field 1 with app/version/apiKey/locale/lsVersion + marker bytes, posted as `application/proto` to `${AUTH_BASE}/GetUserJwt`.
- 2026-03-13: JWT caching is robust when keyed by API key + decoded `exp` (seconds) with a 60s refresh buffer, plus per-key single-flight deduplication so concurrent `getJwt()` calls share one network fetch.

- 2026-03-13: AI SDK V3 prompt shaping note for converter v1: system content is a plain string; user/assistant/tool content are part arrays. Tool-call parts expose toolCallId/toolName/args and tool-result parts expose toolCallId/toolName/result; converter can ignore file/image parts while preserving tool metadata as JSON strings without mutating the prompt.
- 2026-03-13: Response marker parsing gotcha: for malformed `[TOOL_CALLS]... [ARGS]...` JSON, treat the marker chunk as plain text and continue scanning from the next marker boundary to avoid throws/infinite loops while preserving original output text.
- 2026-03-13: doGenerate v1 request wiring uses protobuf field 1=metadata, 2=repeated prompt messages, 3=repeated tool definitions, then wraps the protobuf with a Connect unary frame before `DevstralTransport.postUnary`; decode response via `connectFrameDecode` and feed each payload to `convertResponse`.
- 2026-03-13: `extractStrings` over nested protobuf messages often yields larger embedded payload strings, so assertions should validate meaningful substrings (api key/jwt/prompt/tool names) rather than exact one-token string slots.
- 2026-03-13: AI SDK V3 model shape alignment for doGenerate can be done as a response-adapter layer in the model: keep converter output unchanged, then map tool-call parts to include `toolCallType: 'function'` and JSON-stringified `args`, with `usage` keys as `inputTokens/outputTokens/totalTokens` set to `undefined` when unknown.
- 2026-03-13: For doStream v1, keep parsing incremental by buffering only incomplete Connect frame tails: read 5-byte header + payload length, decode each complete frame with `connectFrameDecode`, and carry the leftover bytes into the next chunk.
- 2026-03-13: Streaming tool exposure can stay execution-free while still matching V3 stream semantics by emitting `tool-input-start/delta/end` from parsed args JSON string first, then emitting final `tool-call` with `toolCallType: 'function'`.
- 2026-03-13: Deterministic streaming tests are stable with a chunked `ReadableStream<Uint8Array>` fake response body plus delayed chunk pull for abort tests; abort expectations should assert stream stops before `finish`.

- 2026-03-13: Implemented provider factory (createWindsurfProvider) and tests. The factory returns a function that constructs DevstralLanguageModel and passes through options (apiKey/baseURL/headers/fetch). Added docs/superpowers/specs/2026-03-13-provider-factory-design.md describing decisions.

- 2026-03-13: README.md written for Task 16 with 7 required sections: Installation, Quick Start, API Reference, Configuration, Examples, Troubleshooting, License. Aligned examples with actual exports: createWindsurfProvider, named windsurf export, default export. Documented config options (apiKey, baseURL, headers, fetch, generateId). Noted tool calls are exposed not executed per plan guardrails. Added explicit "What This Package Does NOT Do" section to prevent confusion.

- 2026-03-13: Added integration tests in test/integration/ (auth, generate, stream, tools) with env-based skipping when WINDSURF_API_KEY is missing, so pnpm test test/integration/ -- --run exits 0 with skipped tests.
- 2026-03-13: Task 15 evidence files include trailing EXIT=<code> lines; live network assertions require WINDSURF_API_KEY to be present in the shell environment running vitest.

- 2026-03-13: Packaging fix: added a postbuild step to write dist/cjs/package.json with { "type": "commonjs" } so Node resolves relative requires inside dist/cjs correctly when project package.json uses "type": "module". This preserves public API and allows `require('./dist/index.cjs')` to succeed under Node 24+.
