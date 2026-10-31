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

Filled at landing: what ran and where its output is.
