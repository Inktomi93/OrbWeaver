---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/connection shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/connection`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ConnectionContext` / `ConnectionAssemblyContext` | `server/src/domain/connection/index.ts:10` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 1 row = 1 applied. 0 kept, 0 handed off, 0 owner questions.

- `ConnectionContext` / `ConnectionAssemblyContext` renamed-reexport: applied. `domain/connection/index.ts` exports `ConnectionAssemblyContext` under its declared name; the one importer (ast-grep ts 5949 / tsx 1525 tracked files, plan from importers of the door) is renamed with the `move-import-names` codemod. The inner `ConnectionContext` in `contract/service.ts` is a different type, so the declaration cannot take that name.
