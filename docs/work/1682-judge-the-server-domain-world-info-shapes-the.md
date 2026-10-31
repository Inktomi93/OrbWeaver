---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/world-info shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/world-info`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PluginWorldInfoReads` / `PluginWorldInfoReads` | `server/src/domain/world-info/contract/plugin-reads.ts:8` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |
| `WorldInfoExportContext` / `WorldInfoExportAssemblyContext` | `server/src/domain/world-info/index.ts:5` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |
| `createExportWorldBook` / `createExport` | `server/src/domain/world-info/index.ts:19` | renamed-reexport | delete | use the home name `createExport` |
| `createImportWorldBook` / `createImport` | `server/src/domain/world-info/index.ts:20` | renamed-reexport | delete | use the home name `createImport` |
| `createCreateBook` / `createCreate` | `server/src/domain/world-info/verbs/books/index.ts:6` | renamed-reexport | delete (read) | the barrel renames a grouped verb factory: name it once at its declaration (`createCreateBook`) |
| `createDuplicateBook` / `createDuplicate` | `server/src/domain/world-info/verbs/books/index.ts:7` | renamed-reexport | delete (read) | the barrel renames a grouped verb factory: name it once at its declaration (`createCreateBook`) |
| `createGetBook` / `createGet` | `server/src/domain/world-info/verbs/books/index.ts:8` | renamed-reexport | delete (read) | the barrel renames a grouped verb factory: name it once at its declaration (`createCreateBook`) |
| `createListBooks` / `createList` | `server/src/domain/world-info/verbs/books/index.ts:9` | renamed-reexport | delete (read) | the barrel renames a grouped verb factory: name it once at its declaration (`createCreateBook`) |
| `createListBooksWithUsage` / `createListWithUsage` | `server/src/domain/world-info/verbs/books/index.ts:10` | renamed-reexport | delete (read) | the barrel renames a grouped verb factory: name it once at its declaration (`createCreateBook`) |
| `createRemoveBook` / `createRemove` | `server/src/domain/world-info/verbs/books/index.ts:11` | renamed-reexport | delete (read) | the barrel renames a grouped verb factory: name it once at its declaration (`createCreateBook`) |
| `createUpdateBook` / `createUpdate` | `server/src/domain/world-info/verbs/books/index.ts:12` | renamed-reexport | delete (read) | the barrel renames a grouped verb factory: name it once at its declaration (`createCreateBook`) |
| `createCreateEntry` / `createCreate` | `server/src/domain/world-info/verbs/entries/index.ts:6` | renamed-reexport | delete (read) | the barrel renames a grouped verb factory: name it once at its declaration (`createCreateBook`) |
| `createGetEntry` / `createGet` | `server/src/domain/world-info/verbs/entries/index.ts:7` | renamed-reexport | delete (read) | the barrel renames a grouped verb factory: name it once at its declaration (`createCreateBook`) |
| `createListEntries` / `createList` | `server/src/domain/world-info/verbs/entries/index.ts:8` | renamed-reexport | delete (read) | the barrel renames a grouped verb factory: name it once at its declaration (`createCreateBook`) |
| `createRemoveEntry` / `createRemove` | `server/src/domain/world-info/verbs/entries/index.ts:11` | renamed-reexport | delete (read) | the barrel renames a grouped verb factory: name it once at its declaration (`createCreateBook`) |
| `createUpdateEntry` / `createUpdate` | `server/src/domain/world-info/verbs/entries/index.ts:13` | renamed-reexport | delete (read) | the barrel renames a grouped verb factory: name it once at its declaration (`createCreateBook`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
