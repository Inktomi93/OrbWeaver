---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/embeddings parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/embeddings`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `EmbeddingConnectionSnapshot.imageEmbed.input.instruction` | `server/src/domain/embeddings/contract/service.ts:46` | unsupplied-prop | delete | delete the prop and its default path (3 calls) |
| `EmbeddingsService.resolveGeneration.task` | `server/src/domain/embeddings/contract/service.ts:143` | same-literal | delete | inline `"embed"` and drop the parameter (3 calls) |
| `EmbeddingsService.resolveGeneration.via` | `server/src/domain/embeddings/contract/service.ts:143` | unsupplied | delete | delete the parameter and its default path (3 calls) |
| `EmbeddingsService.embedCorpus.params.embedderChanged` | `server/src/domain/embeddings/contract/service.ts:179` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `requireTaskModel.task` | `server/src/domain/embeddings/substrate/task-model.ts:27` | same-literal | delete | inline `"embed"` and drop the parameter (3 calls) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

5 rows: applied 1, kept 3, owner ruled 1 (wired), handed off 0.

Applied: `requireTaskModel.task`. All three callers (`indexer/handlers.ts:28`, `verbs/embed-corpus.ts:33`, `verbs/get-live-embed-space.ts:8`) asked for "embed"; the function now resolves "embed" directly.

Kept: `EmbeddingsService.resolveGeneration.task` and `.via`. Production passes only "embed", but `tests/support/node/corpus-search.ts:217` (a support file, in consumer scope) calls it with `"imageEmbed"` and `via` "embed", and `tests/server/domain/embeddings/verbs/runtime-funding.fixtures.ts:381` forwards a task variable. The signature is not same-literal or unsupplied. (`resolveTargetGeneration` is a separate function; `verbs/store.ts:344` passes both.)
Kept: `EmbeddingsService.embedCorpus.params.embedderChanged`. `embedCorpus` and `embedAssets` share `EmbedPassParams`; `embedAssets` reads `embedderChanged` (`verbs/embed-assets.ts:36`) and the workload supplies it (`embeddings/workload-contributions.ts:77`, from the persisted job params written by `verbs/embedding-reindex-triggers.ts:58`).

Owner ruling: `EmbeddingConnectionSnapshot.imageEmbed.input.instruction` stays and is wired on the query side. This replaces the Decision column for this row. `SCOPE_INSTRUCTIONS.images.query` is the supplier: `embedImageQuery` (`packages/server/src/domain/search/verbs/images.ts`) passes it on both branches. The snapshot's `imageEmbed` (`packages/server/src/domain/embeddings/verbs/runtime-connection.ts`) gates it through the embed funnel, so a model with `instructionAware: false` keeps the wire default `QUERY_INSTRUCTION`. The Qwen3-VL chat scaffold and the Gemini `task:` scaffold honour it; local-light CLIP rows are not instruction-aware. Stored images keep `DOC_INSTRUCTION`, because changing the document side would move the vector space. `kind: "image"` and `kind: "multimodal"` have no truthful supplier for the same reason; no backend reads the field there. Proof: `tests/server/domain/search/verbs/image-query-instruction.int.test.ts` reads the request bytes through `search.images` and fails on unmodified source. The caption branch (`via: "embed"`) has no case of its own; it uses the same funnel gate as the other search verbs. Owner ruling: the instruction stays as wired, and a live retrieval check is owed at the next live run. `images.ts` also leads its rerank query with `SCOPE_INSTRUCTIONS.images.rerank`, matching the other search verbs; the same test file reads the `/v1/rerank` bytes.

Survey: codegraph_explore on the five symbols; ast-grep `requireTaskModel($$$)` on -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): 3 calls; literal `rg` for resolveGeneration, resolveTargetGeneration, embedderChanged, ImageEmbedInput across packages, tests, tooling, scripts.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.tests-iso.json tsconfig.node.json` exit 0; `pnpm test` get-live-embed-space and sweep-completion: passed.
