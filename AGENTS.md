# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-13 20:21:42 CST
**Commit:** 4beba6f
**Branch:** master

## OVERVIEW
AI SDK V3 provider for Windsurf Devstral. Package is provider-only: emits tool calls, does not execute them.

## STRUCTURE
```text
windsurf-fast-context/
|- src/                      # Runtime implementation (provider/model/auth/protocol/transport)
|- test/                     # Integration tests + binary fixtures
|- scripts/postbuild.js      # ESM/CJS entrypoint stitching for dist/
|- .github/workflows/ci.yml  # CI runs tests only
|- dist/                     # Build output (generated)
`- .sisyphus/                # Planning/evidence artifacts (not product runtime)
```

## SUBDIRECTORY KNOWLEDGE
- `src/AGENTS.md` - Runtime-layer conventions, module ownership boundaries, and fragile test targets.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Public package API | `src/index.ts` | Re-export surface (`types`, provider factory, default export). |
| Provider factory behavior | `src/provider.ts` | `createWindsurfProvider` -> `DevstralLanguageModel`. |
| Generation/stream orchestration | `src/model/devstral-language-model.ts` | Main pipeline: auth, conversion, framing, transport, stream events. |
| Auth and JWT exchange | `src/auth/api-key.ts`, `src/auth/jwt-manager.ts` | API key resolution + JWT caching/deduplication. |
| Protocol/frame encoding | `src/protocol/connect-frame.ts`, `src/protocol/protobuf.ts` | Connect frame + protobuf primitives. |
| Prompt/response mapping | `src/conversion/*.ts` | SDK prompt conversion + tool-call/text extraction. |
| HTTP semantics/retries | `src/transport/http.ts` | Retry loop, status mapping, stream body handling. |
| Integration behavior | `test/integration/*.test.ts` | Real API-gated tests (`WINDSURF_API_KEY`). |

## CODE MAP
| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| `createWindsurfProvider` | function | `src/provider.ts:4` | 10 | Constructs provider factory used by exports/tests. |
| `DevstralLanguageModel` | class | `src/model/devstral-language-model.ts:142` | 12 | Central model implementation for generate/stream. |
| `DevstralTransport` | class | `src/transport/http.ts:22` | 16 | HTTP POST + retry + error mapping. |
| `JwtManager` | class | `src/auth/jwt-manager.ts:23` | 9 | JWT fetch/cache/in-flight dedupe. |
| `ProtobufEncoder` | class | `src/protocol/protobuf.ts:33` | 20 | Binary protobuf payload builder. |
| `LanguageModelV3Content` | type | `src/conversion/response-converter.ts:13` | 6 | Canonical converted output part union. |

## CONVENTIONS
- Build is three-stage TS compile plus postbuild glue: `build:types` -> `build:esm` -> `build:cjs` -> `scripts/postbuild.js`.
- Package is ESM-first (`type: module`) but ships CJS compatibility via `dist/index.cjs` and `dist/cjs/package.json`.
- Unit tests are colocated (`src/**/*.test.ts`); integration tests live under `test/integration` and are API-key gated.
- CI (`.github/workflows/ci.yml`) executes install + test only; no build/typecheck/lint in workflow.
- Vitest is configured with `passWithNoTests: true` (`vitest.config.ts`).

## ANTI-PATTERNS (THIS PROJECT)
- Do not add built-in tool execution in provider code; package must only expose tool calls (`README.md:330`).
- Do not implement MCP server behavior in this package (`README.md:331`).
- Do not add implicit local key extraction mechanisms; API key source is constructor or `WINDSURF_API_KEY` (`README.md:332`).
- Do not treat this package as OpenAI Chat/Completions-compatible API surface (`README.md:333`).

## UNIQUE STYLES
- Streaming output emits explicit segment lifecycle events (`text-start`/`text-delta`/`text-end`) and tool input triplets.
- Response parsing tolerates mixed text/tool-call payloads and malformed fragments before fallback.
- Transport layer maps status classes into explicit error codes (`AUTH_ERROR`, `RATE_LIMITED`, `NETWORK_ERROR`).

## COMMANDS
```bash
pnpm test
pnpm run typecheck
pnpm run build

# Focused suites
pnpm test src/**/*.test.ts
WINDSURF_API_KEY=... pnpm test test/integration/
```

## NOTES
- `test/integration/*` uses real network and is skipped without `WINDSURF_API_KEY`.
- `dist/` is generated output; regenerate via `pnpm run build` instead of hand-editing artifacts.
- No repository lint config was detected (`.eslintrc*` / `.prettierrc*` absent at root).
- `.sisyphus/` contains process artifacts; avoid using it as implementation source of truth.
