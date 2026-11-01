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

Counts: 8 rows = 8 applied. 0 kept, 0 handed off, 0 owner questions.

- `CreateGameResult`, `HandDoorResult`, `PopulateResult`, `PromoteActorResult`, `ResyncResult`, `RollDiceResult` reexport-chain: applied. The `domain/rpg/contract/results.ts` re-export line is deleted; 9 importer files (plan from importers of that module; ast-grep ts 5949 / tsx 1525 tracked files) import them from `@orb/contracts/rpg`.
- `RpgRoundsDeps` / `RpgRoundsAssemblyDeps` renamed-reexport and `RpgContext` / `RpgAssemblyContext` renamed-reexport: applied. The door exports the declared names; 3 importer files renamed. `contract/rounds.ts` and `contract/service.ts` each declare an inner type of the old name, so the declaration cannot take it.
- Check: `pnpm typecheck packages/server/tsconfig.json` exit 0.
