---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/character fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/character`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `StampImportIdentityParams.ownerId` | `server/src/domain/character/contract/params.ts:120` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `StampImportIdentityParams.characterId` | `server/src/domain/character/contract/params.ts:121` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `StampImportIdentityParams.importHash` | `server/src/domain/character/contract/params.ts:122` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImportedFromMatch.importedFrom` | `server/src/domain/character/contract/results.ts:8` | unreferenced | delete | delete the field |
| `ImportedFromMatch.characterId` | `server/src/domain/character/contract/results.ts:9` | unreferenced | delete | delete the field |
| `refinerySignalsReadParser.score` | `server/src/domain/character/persistence/queries.ts:59` | unreferenced | delete | delete the key |
| `refinerySignalsReadParser.analysis` | `server/src/domain/character/persistence/queries.ts:63` | unreferenced | delete | delete the key |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
