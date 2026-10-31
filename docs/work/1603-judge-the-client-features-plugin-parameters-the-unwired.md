---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/plugin parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/features/plugin`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PluginAnchoredSurfaces.props.inSheet` | `client/src/features/plugin/components/plugin-anchored-surfaces.tsx:36` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `PluginAnchoredSurfaces.props.sidecar` | `client/src/features/plugin/components/plugin-anchored-surfaces.tsx:36` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
