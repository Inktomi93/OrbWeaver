---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/preset shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/preset`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PresetContext` / `PresetAssemblyContext` | `server/src/domain/preset/index.ts:5` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |
| `createExportPresets` / `createExport` | `server/src/domain/preset/index.ts:15` | renamed-reexport | delete | use the home name `createExport` |
| `createImportPresets` / `createImport` | `server/src/domain/preset/index.ts:16` | renamed-reexport | delete | use the home name `createImport` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 3 rows = 3 applied. 0 kept, 0 handed off, 0 owner questions.

- `PresetContext` / `PresetAssemblyContext` renamed-reexport: applied. The door exports the declared name; 3 importer files renamed with `move-import-names` (ast-grep ts 5949 / tsx 1525 tracked files). The inner `PresetContext` is a different type.
- `createExportPresets` / `createExport` and `createImportPresets` / `createImport` renamed-reexport: applied by naming the factory once at its declaration (`verbs/export.ts`, `verbs/import.ts`), not by moving the alias to the importers. The bare home name would collide in `entry/compose/portability.ts`, which imports an export or import factory from several domain doors (`createExportWorldBook`, `createTagLibraryExport` and the rest). Domain `service.ts` and two comments updated. The factory name need not match the file name (`verbs/optional-config.ts` exports `createReadOptionalPresetConfig`).
