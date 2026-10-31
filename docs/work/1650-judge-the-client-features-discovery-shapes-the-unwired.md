---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/discovery shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `client/features/discovery`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ParamToggleOption` / `ToggleItem` | `client/src/features/discovery/components/corpus-controls.tsx:44` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/preset/lib/assembly-model.ts:142`; a shape that matches by coincidence stays |
| `CorpusDossierSurfaceProps` / `AnalyticsCharacterSurfaceProps` | `client/src/features/discovery/surfaces/corpus-dossier-surface.tsx:46` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/stats/surfaces/analytics-character-surface.tsx:44`; a shape that matches by coincidence stays |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
