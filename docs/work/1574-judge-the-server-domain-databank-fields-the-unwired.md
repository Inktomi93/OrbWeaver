---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/databank fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/databank`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `DatabankPortabilityContext.logger` | `server/src/domain/databank/contract/portability.ts:24` | unreferenced | delete | delete the field |
| `QueuedIngest.workloadId` | `server/src/domain/databank/contract/results.ts:13` | never-read | delete | delete the field and its writes (`server/src/domain/databank/substrate/queue-ingest.ts:32`) |
| `DatabankGatherResult.text` | `server/src/domain/databank/contract/results.ts:22` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `DatabankGatherResult.hits` | `server/src/domain/databank/contract/results.ts:23` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `DatabankGatherResult.tokensEstimated` | `server/src/domain/databank/contract/results.ts:24` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `KeptRef.documentId` | `server/src/domain/databank/verbs/gather-retrieval.ts:20` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `KeptRef.chunkIdx` | `server/src/domain/databank/verbs/gather-retrieval.ts:21` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `KeptRef.score` | `server/src/domain/databank/verbs/gather-retrieval.ts:22` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
