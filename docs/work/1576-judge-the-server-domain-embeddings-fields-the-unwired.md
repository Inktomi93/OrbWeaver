---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/embeddings fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/embeddings`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ImageRawStoreParams.kind` | `server/src/domain/embeddings/contract/params.ts:26` | never-read | delete | delete the field and its writes (`server/src/domain/embeddings/indexer/handlers.ts:34`) and the 1 test reference |
| `ImageCaptionedStoreParams.kind` | `server/src/domain/embeddings/contract/params.ts:39` | never-read | delete | delete the field and its writes (`server/src/domain/embeddings/indexer/handlers.ts:34`) and the 1 test reference |
| `SegmentStoreParams.kind` | `server/src/domain/embeddings/contract/params.ts:67` | never-read | delete | delete the field and its writes (`server/src/domain/embeddings/verbs/memory-ops.ts:83`) |
| `DigestStoreParams.kind` | `server/src/domain/embeddings/contract/params.ts:88` | never-read | delete | delete the field and its writes (`server/src/domain/embeddings/indexer/handlers.ts:34`) and the 1 test reference |
| `PurgeMemoryVectorsResult.segments` | `server/src/domain/embeddings/contract/results.ts:44` | never-read | delete | delete the field and its writes (`server/src/domain/embeddings/verbs/purge-memory-vectors.ts:11`) |
| `PurgeMemoryVectorsResult.digests` | `server/src/domain/embeddings/contract/results.ts:45` | never-read | delete | delete the field and its writes (`server/src/domain/embeddings/verbs/purge-memory-vectors.ts:11`) |
| `PruneMemoryBlocksResult.rowsDeleted` | `server/src/domain/embeddings/contract/results.ts:52` | never-read | delete | delete the field and its writes (`server/src/domain/embeddings/verbs/prune-memory-blocks.ts:32`) and the 1 test reference |
| `PurgeDocumentVectorsResult.chunks` | `server/src/domain/embeddings/contract/results.ts:58` | never-read | delete | delete the field and its writes (`server/src/domain/embeddings/verbs/purge-document-vectors.ts:11`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
