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
| `refinerySignalsReadParser.score` | `server/src/domain/character/persistence/queries.ts:59` | unreferenced | delete | delete the key |
| `refinerySignalsReadParser.analysis` | `server/src/domain/character/persistence/queries.ts:63` | unreferenced | delete | delete the key |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

All seven rows reclassed; no field deleted. Type-only edit: `stampImportHashIfUnset` and `findByOwnerImportedFrom` in `packages/server/src/domain/character/persistence/queries.ts` now take and return the contract types, so the fields the persistence code reads by name (`:757` destructure, the `out.push` at `:784`) count as reads of `StampImportIdentityParams` and `ImportedFromMatch`.

- `StampImportIdentityParams.ownerId`, `.characterId`, `.importHash`: read by the destructure at `queries.ts:757`; they were typed by an inline twin. Derived from the contract type (slot rule for `unknown`).
- `ImportedFromMatch.importedFrom`, `.characterId`: same inline-twin case at `findByOwnerImportedFrom`. Its other callers read both (`persistence/handoff-copy-write.ts:97`, `:194`).
- `refinerySignalsReadParser.score`, `.analysis`: the parsed object is the card's `refinery` value (`queries.ts:864`), read whole by every card consumer. The keys are the field-level heal; deleting them would drop the stamped score and analysis on read.

Ran `pnpm typecheck packages/server/tsconfig.json` (exit 0). The rescan runs at the end of the lane.
