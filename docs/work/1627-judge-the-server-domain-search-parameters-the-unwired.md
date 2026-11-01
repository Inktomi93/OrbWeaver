---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/search parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/search`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `QueryEmbedConnection.imageEmbed.input.instruction` | `server/src/domain/search/contract/service.ts:69` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `QueryEmbedConnection.imageEmbed.opts` | `server/src/domain/search/contract/service.ts:69` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `SearchService.segments.params.candidates` | `server/src/domain/search/contract/service.ts:112` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `nearestDocumentChunks.params.generationId` | `server/src/domain/search/persistence/nearest.ts:93` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

4 rows: applied 2, kept 1, owner questions 1, handed off 0.

Applied: `QueryEmbedConnection.imageEmbed.opts` (the optional `{ signal }`; the only calls, `verbs/images.ts:94`, pass the input alone, and the embeddings snapshot still satisfies the narrower type); `nearestDocumentChunks.params.generationId` (the one caller, `verbs/documents.ts:106`, supplies `generationFingerprint` only, so the active-space condition is now built from the fingerprint alone with the same result).

Kept: `SearchService.segments.params.candidates`. `SegmentsParams` is an alias of the contracts wire shape `MemoryQueryOptions` (`packages/server/src/domain/search/contract/params.ts:29`); `candidates` is read by the segments verb (`verbs/segments.ts:31,64`) and supplied by memory recall (`domain/chat/memory/recall/recall.ts:320` spreads `candidates` into the query) and read by the digests verb of the same shape (`verbs/digests.ts:123,146`). It is a wire field, not a dead parameter of this verb.

Owner question: `QueryEmbedConnection.imageEmbed.input.instruction`. Same shared `ImageEmbedInput.instruction` as the 1623 row (inference request shape).

Survey: codegraph_explore on QueryEmbedConnection, SearchService segments, nearestDocumentChunks; ast-grep `nearestDocumentChunks($$$)` on -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): 1 call (tsx 0); literal `rg` for candidates, generationId, imageEmbed across the search domain.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.tests-iso.json tsconfig.node.json` exit 0; `pnpm test` current-document-scope and rerank-consumers: passed.
