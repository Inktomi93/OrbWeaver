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

Filled at landing: what ran and where its output is.
