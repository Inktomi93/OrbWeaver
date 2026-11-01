---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/assets shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/assets`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `AssetsContext` / `AssetsAssemblyContext` | `server/src/domain/assets/index.ts:11` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |
| `AssetsWorkloadDeps` / `AssetsWorkloadAssemblyDeps` | `server/src/domain/assets/index.ts:13` | renamed-reexport | delete | use the home name `AssetsWorkloadAssemblyDeps` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

2 rows: applied 2, kept 0, handed off 0, owner question 0. Scan: ast-grep inline rule (identifier, type_identifier, property_identifier), `-l ts` and `-l tsx`, `packages tests`, plus the per-statement import scanner: the door's two renamed names had 4 importers, all under `packages/server/src/entry/compose/`.

- `AssetsContext` / `AssetsAssemblyContext`: `packages/server/src/domain/assets/index.ts` exported the assembly type `AssetsAssemblyContext` (`DbAssemblyInput<AssetsContext>`, whose `db` is a `DatabaseHandle`) under the name `AssetsContext`, which is a different type: the verbs' own DI bundle with the live `Db`. The door now exports it as `AssetsAssemblyContext`, so each name means one type.
- `AssetsWorkloadDeps` / `AssetsWorkloadAssemblyDeps`: same defect; the door now exports `AssetsWorkloadAssemblyDeps`.
- The 4 importers (`assets-character.ts`, `portability.ts`, `portability-runner.ts`, `workload-contributions.ts`) use the new names, renamed in place with `move-import-names` (`from` and `to` the same module; dry run listed exactly those importers).
- `pnpm typecheck packages/server/tsconfig.json tsconfig.node.json tsconfig.tests-iso.json` exit 0; `pnpm lint:eslint` on the touched paths exit 0; `pnpm depcruise` exit 0.
