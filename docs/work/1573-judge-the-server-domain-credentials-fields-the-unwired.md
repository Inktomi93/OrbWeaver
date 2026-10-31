---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/credentials fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/credentials`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `CredentialExecutionStrike.id` | `server/src/domain/credentials/contract/execution-witness.ts:13` | unreferenced | delete | delete the field |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Applied: `CredentialExecutionStrike.id` deleted, and the `id` column dropped from the `returning` of `strikeCredentialExecution`. The caller reads only the row count and `applied`.

Ran `pnpm test tests/server/domain/credentials/persistence/strike-policy-audits.suite.int.test.ts` (exit 0, 13 tests) and `pnpm typecheck packages/server/tsconfig.json` (exit 0).
