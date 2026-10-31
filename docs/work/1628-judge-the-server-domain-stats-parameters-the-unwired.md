---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/stats parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/stats`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `reconcileStats.options.signal` | `server/src/domain/stats/write/wiring.ts:22` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

1 row: applied 0, kept 1, handed off 0, owner questions 0.

Kept: `reconcileStats.options.signal` (`packages/server/src/domain/stats/write/wiring.ts:22`). The options type is the shared `ReconcileOpts`; the persistence `reconcileStats` it forwards to is called with `signal` by the stats workload (`domain/stats/workload-contributions.ts:28-32`) and reads it between owners (`persistence/rebuild-from-canon.ts:70,108`). The wiring wrapper's own callers (`entry/compose/portability-runner.ts:111`) omit it, but narrowing the wrapper alone needs a second options type, which is a design call.

Survey: codegraph_explore on reconcileStats and ReconcileOpts; literal `rg` for reconcileStats across packages, tests, tooling, scripts: the workload supplies `signal`.
