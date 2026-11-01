---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/plugin shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `client/features/plugin`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PluginCommandView` / `PluginCommandView` | `client/src/features/plugin/hooks/use-plugin-commands.ts:21` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

1 row: applied 1, kept 0, handed off 0, owner question 0.

- `PluginCommandView`: the `export type ... from "@orb/contracts/plugin"` in `client/src/features/plugin/hooks/use-plugin-commands.ts` is deleted. The home stays `packages/contracts/src/plugin/command-view.ts`, untouched. Scan: ast-grep inline rule, `-l ts` and `-l tsx`, `packages tests` (5199 ts and 1450 tsx files): 18 hits, every other client and server consumer already imports from `@orb/contracts/plugin`; none used the hook path.
- `pnpm typecheck packages/client/tsconfig.json` exit 0.
