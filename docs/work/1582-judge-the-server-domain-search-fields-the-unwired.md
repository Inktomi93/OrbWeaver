---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/search fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/search`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `FindCharactersParams.query` | `server/src/domain/search/contract/params.ts:20` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `FindCharactersParams.topN` | `server/src/domain/search/contract/params.ts:21` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `FindCharactersParams.rerank` | `server/src/domain/search/contract/params.ts:22` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ActiveGenerationRow.task` | `server/src/domain/search/persistence/active-space.ts:12` | unreferenced | delete | delete the field |
| `NearestImage.hubScore` | `server/src/domain/search/persistence/image-nearest.ts:20` | unreferenced | delete | delete the field |
| `CorpusCandidate.id` | `server/src/domain/search/verbs/corpus.ts:19` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/corpus.ts:61`) |
| `CorpusCandidate.contentHash` | `server/src/domain/search/verbs/corpus.ts:24` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/corpus.ts:77`) |
| `DiscoverCandidate.id` | `server/src/domain/search/verbs/discover.ts:21` | unreferenced | delete | delete the field |
| `DiscoverCandidate.hubScore` | `server/src/domain/search/verbs/discover.ts:26` | unreferenced | delete | delete the field |
| `DocumentCandidate.id` | `server/src/domain/search/verbs/documents.ts:24` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/documents.ts:121`) |
| `DocumentCandidate.sourceText` | `server/src/domain/search/verbs/documents.ts:26` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/documents.ts:122`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Applied: `ActiveGenerationRow.task`, `NearestImage.hubScore` (and its select column) and `DiscoverCandidate.hubScore` (the ranking reads the inline mapped literal, not the interface).

Derived: `FindCharactersParams` is now an alias of `KnnParams`. `findCharacters` hands its whole params to `knn`, which reads `query`, `topN` and `rerank` (`packages/server/src/domain/search/verbs/knn.ts`).

Kept, reclassified to a named reader. The candidates are handed whole to generic helpers that read the field through a type constraint:

| Row | Reader |
| - | - |
| `CorpusCandidate.id` | `applyRerank` at `packages/server/src/domain/search/verbs/corpus.ts:123` (`T extends { id; sourceText }` in `packages/kit/src/rerank/index.ts`) |
| `CorpusCandidate.contentHash` | `collapseByContentHash` at `packages/server/src/domain/search/verbs/corpus.ts:146` |
| `DiscoverCandidate.id` | `applyRerank` at `packages/server/src/domain/search/verbs/discover.ts:223` |
| `DocumentCandidate.id` | `applyRerank` at `packages/server/src/domain/search/verbs/documents.ts:143` |
| `DocumentCandidate.sourceText` | same `applyRerank` call |

- Survey: `codegraph_explore` on the six types; `rg` over `packages` and `tests`.
- Ran: `pnpm typecheck tsconfig.node.json`; `pnpm test tests/server/domain/search`.
