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

Two rows: two applied, none kept, none handed off, no owner questions.

`inSheet` and `sidecar` moved from `PluginAnchoredSurfacesProps` to `PluginAnchoredSurfaceListProps` in `packages/client/src/features/plugin/components/plugin-anchored-surfaces.tsx`. The single `<PluginAnchoredSurfaces>` mount (`lib/chat-anchors.tsx:85`) never supplied them; the list component keeps them because `plugin-flank-sheet.tsx:37` supplies both. `PluginAnchoredSurfaces` no longer forwards `sidecar` to `useVisibleAnchoredSurfaces`, whose default is the same `false`.

Survey: `codegraph_explore` on the component; literal `rg` for `inSheet`, `PluginAnchoredSurfaces` across `packages/client tests/client tests/support` read. Proof: client typecheck clean; `tests/client/features/plugin/components/context-panels.ct.tsx` result in the lane report.
