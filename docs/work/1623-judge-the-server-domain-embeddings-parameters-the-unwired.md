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

5 rows: applied 1, kept 3, owner questions 1, handed off 0.

Applied: `requireTaskModel.task`. All three callers (`indexer/handlers.ts:28`, `verbs/embed-corpus.ts:33`, `verbs/get-live-embed-space.ts:8`) asked for "embed"; the function now resolves "embed" directly.

Kept: `EmbeddingsService.resolveGeneration.task` and `.via`. Production passes only "embed", but `tests/support/node/corpus-search.ts:217` (a support file, in consumer scope) calls it with `"imageEmbed"` and `via` "embed", and `tests/server/domain/embeddings/verbs/runtime-funding.fixtures.ts:381` forwards a task variable. The signature is not same-literal or unsupplied. (`resolveTargetGeneration` is a separate function; `verbs/store.ts:344` passes both.)
Kept: `EmbeddingsService.embedCorpus.params.embedderChanged`. `embedCorpus` and `embedAssets` share `EmbedPassParams`; `embedAssets` reads `embedderChanged` (`verbs/embed-assets.ts:36`) and the workload supplies it (`embeddings/workload-contributions.ts:77`, from the persisted job params written by `verbs/embedding-reindex-triggers.ts:58`).

Owner question: `EmbeddingConnectionSnapshot.imageEmbed.input.instruction`. The field is the shared `ImageEmbedInput.instruction` (`packages/contracts/src/role-clients/index.ts:70`), the per-task hint instruction-aware embedders receive on the wire (`packages/inference/src/backends/openai-compat/image-embed.ts`); no server caller sets it, but removing it changes an inference request shape, which the lane rule reserves for the owner. Same field as the 1627 row.

Survey: codegraph_explore on the five symbols; ast-grep `requireTaskModel($$$)` on -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): 3 calls; literal `rg` for resolveGeneration, resolveTargetGeneration, embedderChanged, ImageEmbedInput across packages, tests, tooling, scripts.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.tests-iso.json tsconfig.node.json` exit 0; `pnpm test` get-live-embed-space and sweep-completion: 2 files, 2 passed.
