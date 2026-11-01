---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/workloads parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/features/workloads`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `field.key` | `client/src/features/workloads/lib/workloads-result-copy.ts:55` | same-literal | delete | inline `"changed"` and drop the parameter (2 calls) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

One row: one applied, none kept, none handed off, no owner questions.

`field(source, key)` in `packages/client/src/features/workloads/lib/workloads-result-copy.ts` became `changedOf(source)` reading `changed`; its two calls (`:106`, `:107`) were the only users. The literal is a coincidence of one summary renderer, not a variant axis. Proof: client typecheck clean.
