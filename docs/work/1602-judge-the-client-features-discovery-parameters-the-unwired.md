---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/discovery parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/features/discovery`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ParamSelect.#0.testId` | `client/src/features/discovery/components/corpus-controls.tsx:16` | unsupplied-prop | delete | delete the prop and its default path (10 calls) |
| `plural.many` | `client/src/features/discovery/lib/corpus-analysis-state.ts:172` | unsupplied | delete | delete the parameter and its default path (3 calls) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
