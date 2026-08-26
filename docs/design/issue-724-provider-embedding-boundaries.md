---
kind: design
status: implemented
issue: 724
---

# Issue 724 — provider and embedding boundary hardening

## Re-derived checkpoint

The issue snapshot was cut at `290957684f63`; this lane starts from `5748ecbe5b9feaf6e1fa3b4766c1b32c7b580e98`.
Each mechanism below was re-read from the complete source and its focused tests before mutation.

| Arm | Current classification | Bounded sites | Chosen mechanism | Rejected alternative |
| --- | --- | --- | --- | --- |
| Stored vector model identity | current defect | `domain/embeddings/verbs/store.ts`, `store-segments.ts` | Stamp the `EmbedResult.model` / `ImageEmbedResult.model` returned by the inference call and use that identity for the persisted space. | Snapshot getters are request-time hints and can change between parameter construction and the live role call. |
| Seeded and tie ordering | current defect at orchestration boundary; pure k-means seed itself is already deterministic | `domain/discovery/verbs/archetypes.ts`, `projection.ts` | Canonically order model groups and card ids; make equal-size result ordering total. | SQL incidental row order and Map insertion order are not contracts. |
| Archetype label uniqueness | current defect | `domain/discovery/verbs/archetypes.ts` | Deterministically suffix duplicate global labels after total ordering. | Client-only display disambiguation leaves the server contract ambiguous. |
| Agent SDK concurrency | current defect | `contracts/settings`, `foundation/env`, `backends/agent-sdk/summarize.ts` | One finite positive integer ceiling at schema/env and a backend trust-boundary assertion before worker allocation. | Silent clamp hides corrupt internal configuration. |
| Image MIME | current defect | `backends/kit/image-normalize.ts` | Magic-sniff PNG/JPEG/WebP and preserve the exact label; transcode GIF or unknown bytes to PNG. | Labeling every non-GIF as PNG assumes provider re-sniff behavior. |
| Inspector/non-OK/SSE buffers | current defect | `custom-byo/inspect.ts`, `custom-byo/runners/chat.ts`, `kit/openai-compat/stream.ts` | Stream-read bounded diagnostic text and reject an SSE line once its pending buffer exceeds a declared byte/character ceiling. | `Response.text()` followed by `slice` caps display only after unbounded allocation. |
| Local-light eviction | current defect | `backends/local-light/model-cache.ts` | Refcounted leases: over-cap entries become eviction-pending and dispose only after the last active inference releases. | Promise-LRU disposal can destroy a resolved model while a caller is executing it. |
| OpenRouter forced tool identity | current defect | `backends/openrouter/index.ts` | A forced-tool response must contain the exact expected function name; differently named calls are an invalid provider result. | Consuming the first differently named call defeats the schema/tool identity boundary. |
| Credential-safe diagnostics | stale/refuted | hardened already by `d1c6755e8`: known credential values are scrubbed from messages, bodies, causes, inspector output, account/probe and all OpenRouter role errors | Preserve and rerun the focused existing pins; no new code. | Duplicating the scrub layer would create a second redaction home. |
| vLLM sleep cache invalidation | current defect | `vllm/engine/wake-gate.ts`, `supervisor.ts` | Invalidate an engine's awake observation after a successful supervisor sleep. | Waiting for the TTL can dispatch into a scheduler that this process just slept. |

## Proof plan

Tests compile against the pre-fix source and assert the public behavior: returned vector model provenance,
stable response ordering and unique labels, rejected invalid concurrency, exact image media type/transcode,
bounded response/SSE failure, lease-delayed disposal, expected forced-tool identity, credential absence, and a
fresh sleep probe after auto-sleep. Focused Vitest files are the behavioral tier; scoped typecheck and
Biome/ESLint cover the touched surface. Whole-tree gates remain the orchestrator's responsibility.
