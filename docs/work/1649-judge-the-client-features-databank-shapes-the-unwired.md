---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/databank shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `client/features/databank`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `DatabankRenameDialogProps` / `PresetRenameDialogProps` | `client/src/features/databank/components/databank-rename-dialog.tsx:14` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/preset/components/preset-rename-dialog.tsx:19`; a shape that matches by coincidence stays |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

1 row: applied 0, kept 1, handed off 0, owner question 0. No code changed.

- `DatabankRenameDialogProps` / `PresetRenameDialogProps`: kept. Each is the prop contract of its own component and each is used only in its own file (ast-grep inline rule, `-l ts` and `-l tsx`, `packages tests`, 5199 ts and 1450 tsx files scanned; 2 hits each, declaration and use). The shapes are equal, but the databank feature cannot import from the preset feature (sideways import), and a third home in `#components` for four fields would be an abstraction for two callers. The honest duplicate is the two dialog components, not the type; merging them is a component design call outside this row.
