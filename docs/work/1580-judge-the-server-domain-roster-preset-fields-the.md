---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/roster-preset fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/roster-preset`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `MemberWrite.position` | `server/src/domain/roster-preset/contract/service.ts:41` | unreferenced | delete | delete the field |
| `MemberWrite.talkativeness` | `server/src/domain/roster-preset/contract/service.ts:43` | unreferenced | delete | delete the field |
| `MemberWrite.disabled` | `server/src/domain/roster-preset/contract/service.ts:44` | unreferenced | delete | delete the field |
| `CastRuleWrite.position` | `server/src/domain/roster-preset/contract/service.ts:79` | unreferenced | delete | delete the field |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

No row is dead. All four are kept. The write verbs spread each whole value into a table insert, so the scan, which reads by field name, misses the read.

| Row | Reader |
| - | - |
| `MemberWrite.position` | `packages/server/src/domain/roster-preset/persistence/queries.ts:140` and `:178` spread `{ ...m, presetId }` into `rosterPresetMembers`, whose `position` column is `notNull` |
| `MemberWrite.talkativeness` | same spreads, `talkativeness` column in `packages/db/src/schema/roster-preset.ts` |
| `MemberWrite.disabled` | same spreads, `disabled` column |
| `CastRuleWrite.position` | `packages/server/src/domain/roster-preset/persistence/queries.ts:143` and `:184` spread `{ ...r, presetId }` into `rosterPresetRules`, whose `position` column is `notNull` |

- Survey: `codegraph_explore` on `MemberWrite` and `CastRuleWrite`; `ast-grep` for `({ ...$M, presetId: $P })` over the domain in `ts` and `tsx`.
- Reclass: all four rows move from delete to kept. Deleting any field fails the insert type or the column default.
- Ran: no code change, so no typecheck or suite.
