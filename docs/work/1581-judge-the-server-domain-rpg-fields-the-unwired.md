---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/rpg fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/rpg`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `RegisteredPlaneDiff.plane` | `server/src/domain/rpg/contract/delta.ts:42` | never-read | delete | delete the field and its writes (`server/src/domain/rpg/substrate/delta.ts:36`) |
| `SnapshotWriteBase.id` | `server/src/domain/rpg/contract/params.ts:54` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SnapshotWriteBase.gameId` | `server/src/domain/rpg/contract/params.ts:55` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SnapshotWriteBase.now` | `server/src/domain/rpg/contract/params.ts:56` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `UpsertQuestBaseParams.status` | `server/src/domain/rpg/contract/params.ts:326` | never-written | delete | delete the field and the branch that reads its default at `server/src/domain/rpg/verbs/quest/upsert-quest.ts:29` |
| `UpsertQuestBaseParams.description` | `server/src/domain/rpg/contract/params.ts:327` | never-written | delete | delete the field and the branch that reads its default at `server/src/domain/rpg/verbs/quest/upsert-quest.ts:30` |
| `RevealBodyRow.seq` | `server/src/domain/rpg/contract/service.ts:179` | unreferenced | delete | delete the field |
| `RpgStateRoundInput.gameId` | `server/src/domain/rpg/contract/service.ts:543` | never-read | delete | delete the field and its writes (`server/src/domain/rpg/chat-ops/flush.ts:91`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
