---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/entry parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/entry`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `createAuthSeam.deps.oidcStore` | `server/src/entry/auth/seam.ts:345` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `migrateDataLayout.deps.pid` | `server/src/entry/boot/migrate-data-layout.ts:432` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `migrateDataLayout.deps.isPidAlive` | `server/src/entry/boot/migrate-data-layout.ts:432` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `migrateDataLayout.deps.deviceOf` | `server/src/entry/boot/migrate-data-layout.ts:432` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `migrateDataLayout.deps.rename` | `server/src/entry/boot/migrate-data-layout.ts:432` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `runBootMigrations.deps.migrationsFolder` | `server/src/entry/boot/migrate.ts:42` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `runCardLorebookRestore.deps.importCardScripts` | `server/src/entry/import/run-profile-import.ts:61` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

7 rows: applied 1, kept 0, handed off 5, left and flagged 1, owner questions 0.

Applied: `runCardLorebookRestore.deps.importCardScripts`. `CardLorebookRestoreDeps` now omits it (`packages/server/src/entry/import/run-profile-import.ts:30`); the one caller, `entry/http/upload.ts:252`, never supplied it, and `ProfileImportDeps` keeps it for `runProfileImport` (`upload.ts:285`). Restore re-asserts a lorebook only, so behavior is unchanged.

Handed off (only a test file supplies them; tests not rewritten):

- `migrateDataLayout.deps.pid`, `.isPidAlive`, `.deviceOf`, `.rename`: supplied by `tests/server/entry/boot/persistence/migrate-data-layout.int.test.ts` (`pid` at 380-432, `isPidAlive` at 382-442, `deviceOf` at 291-359, `rename` at 372). Production passes `{ layout, logger, env }` only.
- `runBootMigrations.deps.migrationsFolder`: supplied by `tests/db/schema/chat-freeze-provenance.repo.int.test.ts:127`.

Left and flagged (authn, lane rule): `createAuthSeam.deps.oidcStore` (`packages/server/src/entry/auth/seam.ts:345`, read at `seam.ts:368`). Not touched.

Survey: codegraph_explore on migrateDataLayout, runBootMigrations, runCardLorebookRestore, createAuthSeam; ast-grep `runCardLorebookRestore($$$)` on -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): 1 call (tsx 0); literal `rg` for isPidAlive, deviceOf, migrationsFolder, importCardScripts across packages, tests, tooling, scripts.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.node.json` exit 0; `pnpm test tests/server/entry/http/import-identity.int.test.ts` 7 passed.
