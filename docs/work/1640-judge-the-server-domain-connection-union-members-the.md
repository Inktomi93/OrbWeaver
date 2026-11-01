---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/connection union members the unwired unions scan reports

## What

`pnpm unwired unions` reports each of the union members below in `server/domain/connection`; `reports/unwired/unions.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `CONNECTION_JSON_FIELDS.promptCache` | `server/src/domain/connection/contract/stored.ts:10` | unbuilt | delete | delete the member and the 1 branch, check or key that name it |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired unions` no longer reports the row.

## Evidence

Counts: 1 row = 1 kept.

- `CONNECTION_JSON_FIELDS.promptCache`: kept. The stored `user_connections.prompt_cache` column holds JSON text that `parseStoredConnection` reads at `packages/server/src/domain/connection/contract/stored.ts:46`, and writes land from `packages/server/src/domain/connection/verbs/connections.ts:138,218`. The member types `StoredConnectionRow` (line 13): without it the row's `promptCache` would be the column's own type and the `columnJson` parse would have no matching field, so stored rows would not parse.
- Survey: codegraph_explore `CONNECTION_JSON_FIELDS columnJson stored.ts promptCache` (one caller of `columnJson`, `parseStoredConnection` has many); ast-grep `"promptCache"` over `packages tests tooling scripts`: 3 ts, 0 tsx; rg `promptCache` in `packages/server/src/domain/connection`. The whole file was read.
- No code change.
