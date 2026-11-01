---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/tag shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/tag`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `CreateTagParams` / `CreateBookParams` | `server/src/domain/tag/contract/params.ts:13` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `TagContext` / `TagAssemblyContext` | `server/src/domain/tag/index.ts:5` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |
| `createTagLibraryExport` / `createExport` | `server/src/domain/tag/index.ts:9` | renamed-reexport | delete | use the home name `createExport` |
| `createTagLibraryImport` / `createImport` | `server/src/domain/tag/index.ts:10` | renamed-reexport | delete | use the home name `createImport` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 3 rows = 3 applied. 0 kept, 0 handed off, 0 owner questions.

- `TagContext` / `TagAssemblyContext` renamed-reexport: applied. The door exports the declared name; 3 importer files renamed with `move-import-names` (ast-grep ts 5949 / tsx 1525 tracked files). The inner `TagContext` is a different type.
- `createTagLibraryExport` / `createExport` and `createTagLibraryImport` / `createImport` renamed-reexport: applied by naming each factory once at its declaration (`verbs/export.ts`, `verbs/import.ts`). The bare `createExport` and `createImport` would collide in `entry/compose/portability.ts`, which imports an export and an import factory from several domain doors. The tag domain's `service.ts` does not use either factory, so no domain-internal caller changed.
