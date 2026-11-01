---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/state parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/state`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `assertSettingsKeyPartition.exemptions` | `client/src/state/config-section-partition.ts:125` | unsupplied | delete | delete the parameter and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

One row: one applied, none kept, none handed off, no owner questions.

`assertSettingsKeyPartition` in `packages/client/src/state/config-section-partition.ts` takes `(registry, defaults)` and reads `UNCLAIMED_SETTINGS_KEYS` directly. The one caller, `packages/client/src/compose/config-sections.ts:137`, passes two arguments; literal `rg` over all of `tests` finds no call that injects a cite list. Proof: client typecheck clean.
