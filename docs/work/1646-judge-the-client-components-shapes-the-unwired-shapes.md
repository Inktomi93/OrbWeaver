---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/components shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `client/components`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `UserMacrosFormValues` / `UserMacrosFormValues` | `client/src/components/index.ts:74` | reexport-chain | delete | export it from its home, not through `client/src/components/user-macro-editor-dialog.tsx` |
| `ListPaneHeaderProps` / `ListPaneHeaderProps` | `client/src/components/list-pane-header.tsx:27` | reexport-chain | delete | export it from its home, not through `client/src/lib/index.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Two rows, both applied (applied 2, kept 0, handed off 0, owner question 0).

- `UserMacrosFormValues`: `packages/client/src/components/index.ts` now exports it from `packages/client/src/components/user-macro-editor-model.ts`; the dialog's pass-through is gone. Scan: ast-grep ts+tsx over `packages tests`, no other importer used the dialog path.
- `ListPaneHeaderProps`: the `export type ... from "#lib"` in `list-pane-header.tsx` is deleted; no importer used it (ast-grep ts+tsx), `#lib` still exports it from `list-pane-header-view.ts`.
- `pnpm typecheck packages/client/tsconfig.json` exit 0.
