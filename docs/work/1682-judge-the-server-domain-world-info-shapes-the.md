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

Counts: 16 rows = 16 applied. 0 kept, 0 handed off, 0 owner questions.

- `PluginWorldInfoReads` reexport-chain: applied. The `contract/plugin-reads.ts` re-export is deleted; its importer takes the type from `@orb/contracts/plugin` (`packages/contracts/src/plugin/` is untouched).
- `WorldInfoExportContext` / `WorldInfoExportAssemblyContext` renamed-reexport: applied. The door exports the declared name; 2 importer files renamed.
- `createExportWorldBook` / `createExport` and `createImportWorldBook` / `createImport`, and the twelve grouped verb factories in `verbs/books/index.ts` and `verbs/entries/index.ts` (`createCreateBook`, `createDuplicateBook`, `createGetBook`, `createListBooks`, `createListBooksWithUsage`, `createRemoveBook`, `createUpdateBook`, `createCreateEntry`, `createGetEntry`, `createListEntries`, `createRemoveEntry`, `createUpdateEntry`): applied by naming each factory once at its declaration, as the item says. The barrels and the door export the declared names; `service.ts` and a contract comment use them. Importer scan: ast-grep ts 5949 / tsx 1525 tracked files, rg across `packages` and `tests`: no user of the old names outside `verbs/` and `service.ts`. The barrel comments that cited a "verb-naming gate" are rewritten: no gate rule exists in `tooling/src/eslint` or `tests/tooling`.
- Check: `pnpm typecheck packages/server/tsconfig.json` exit 0.
