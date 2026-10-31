---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/rpg shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/rpg`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `CreateGameResult` / `CreateGameResult` | `server/src/domain/rpg/contract/results.ts:6` | reexport-chain | delete | export it from its home, not through `contracts/src/rpg/index.ts` |
| `HandDoorResult` / `HandDoorResult` | `server/src/domain/rpg/contract/results.ts:6` | reexport-chain | delete | export it from its home, not through `contracts/src/rpg/index.ts` |
| `PopulateResult` / `PopulateResult` | `server/src/domain/rpg/contract/results.ts:6` | reexport-chain | delete | export it from its home, not through `contracts/src/rpg/index.ts` |
| `PromoteActorResult` / `PromoteActorResult` | `server/src/domain/rpg/contract/results.ts:6` | reexport-chain | delete | export it from its home, not through `contracts/src/rpg/index.ts` |
| `ResyncResult` / `ResyncResult` | `server/src/domain/rpg/contract/results.ts:6` | reexport-chain | delete | export it from its home, not through `contracts/src/rpg/index.ts` |
| `RollDiceResult` / `RollDiceResult` | `server/src/domain/rpg/contract/results.ts:6` | reexport-chain | delete | export it from its home, not through `contracts/src/rpg/index.ts` |
| `RpgRoundsDeps` / `RpgRoundsAssemblyDeps` | `server/src/domain/rpg/index.ts:13` | renamed-reexport | delete | use the home name `RpgRoundsAssemblyDeps` |
| `RpgContext` / `RpgAssemblyContext` | `server/src/domain/rpg/index.ts:15` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
