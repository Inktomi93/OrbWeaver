---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/lib shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `client/lib`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `CollectionInsight` / `TagLibraryFact` | `client/src/lib/collection-contracts.ts:86` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/tag/hooks/use-tag-library.ts:44`; a shape that matches by coincidence stays |
| `cn` / `cn` | `client/src/lib/index.ts:6` | reexport-chain | delete | export it from its home, not through `ui/src/lib/index.ts` |
| `removeActionName` / `removeActionName` | `client/src/lib/index.ts:6` | reexport-chain | delete | export it from its home, not through `ui/src/lib/index.ts` |
| `selectActionName` / `selectActionName` | `client/src/lib/index.ts:6` | reexport-chain | delete | export it from its home, not through `ui/src/lib/index.ts` |
| `NotifyAction` / `MemberDrillBack` | `client/src/lib/notify.ts:24` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/components/member-drill-header.tsx:36`; a shape that matches by coincidence stays |
| `ViewTransitionSettlement` / `NativeTransition` | `client/src/lib/view-transition-settlement.ts:1` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/routes/router-view-transition.ts:11`; a shape that matches by coincidence stays |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
