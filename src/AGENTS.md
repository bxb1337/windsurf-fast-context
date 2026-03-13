# SRC KNOWLEDGE BASE

## OVERVIEW
`src/` is runtime-only provider code: factory, model orchestration, auth, protocol framing, conversion, and transport.

## STRUCTURE
```text
src/
|- index.ts                  # Public source entry re-exports
|- provider.ts               # Provider factory + default provider
|- model/                    # Generate/stream orchestration
|- auth/                     # API-key resolution + JWT lifecycle
|- conversion/               # Prompt/response transformations
|- protocol/                 # Connect frame + protobuf primitives
|- transport/                # HTTP transport/retry/error mapping
`- types/                    # Shared provider/model type contracts
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add/changing provider options | `provider.ts`, `types/index.ts` | Keep factory surface and options types aligned. |
| Generate/stream lifecycle changes | `model/devstral-language-model.ts` | Contains request build, stream framing, event emission. |
| API key and JWT behavior | `auth/api-key.ts`, `auth/jwt-manager.ts` | Key resolution, JWT fetch, cache and in-flight dedupe. |
| Model prompt semantics | `conversion/prompt-converter.ts` | Converts AI SDK prompt shape to Devstral messages. |
| Output/tool-call parsing | `conversion/response-converter.ts` | Parses mixed response payload into text/tool-call parts. |
| Binary frame issues | `protocol/connect-frame.ts`, `protocol/protobuf.ts` | Read/write Connect frames and protobuf payloads. |
| Retry/error policy | `transport/http.ts` | Defines retry behavior + `DevstralTransportError` mapping. |

## CONVENTIONS (SRC)
- Keep dependency direction inward: model imports auth/conversion/protocol/transport; leaf modules do not import model.
- Preserve dual-path parity: updates to `doGenerate` usually require equivalent handling in `doStream`.
- Stream contract is eventful, not raw text: maintain `stream-start` -> content/tool deltas -> `finish` ordering.
- Transport should throw typed errors (`AUTH_ERROR`, `RATE_LIMITED`, `NETWORK_ERROR`); avoid ad-hoc error strings from callers.
- Conversion modules are pure mapping/parsing layers; keep network/auth side effects out of `conversion/*`.

## ANTI-PATTERNS (SRC)
- Do not bypass `resolveApiKey` inside runtime paths; key acquisition rules live in `auth/api-key.ts`.
- Do not collapse tool-call outputs into plain text in converters; preserve `tool-call` parts for caller execution.
- Do not emit stream text without segment lifecycle events (`text-start`, `text-delta`, `text-end`).
- Do not change protobuf/connect frame encoding shape without updating protocol tests and model integration tests.

## TESTING TARGETS
- Unit tests are colocated in `src/**` (`*.test.ts`) and should be updated with behavior changes.
- Most fragile paths: stream framing in `model/`, parser edge cases in `conversion/response-converter.ts`, retry/error behavior in `transport/http.ts`.
- Auth changes must include cache and concurrency assertions in `auth/jwt-manager.test.ts`.
