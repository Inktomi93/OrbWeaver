---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the plugin-toolchain union members the unwired unions scan reports

## What

`pnpm unwired unions` reports each of the union members below in `plugin-toolchain`; `reports/unwired/unions.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PROJECT_COMMANDS.build` | `plugin-toolchain/src/cli.ts:20` | unbuilt | delete | delete the member and the 1 branch, check or key that name it |
| `PROJECT_COMMANDS.pack` | `plugin-toolchain/src/cli.ts:20` | unbuilt | delete | delete the member and the 4 branch, check or keys that name it |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired unions` no longer reports the row.

## Evidence

Counts: 2 rows = 2 kept.

- `PROJECT_COMMANDS.build`, `PROJECT_COMMANDS.pack`: kept, 2 rows. They are the `orb-plugin` bin's subcommands, read from `process.argv` (`packages/plugin-toolchain/src/cli.ts:131` through `isProjectCommand`, branches at lines 124, 201 and 220). The scan cannot see argv. Plugin authors type them: `packages/plugin-toolchain/README.md:8,19,23`, `packages/showcase-plugins/bundles/README.md:85,88` and `scripts/pack-plugin.ts:1`. The plugin toolchain is the author-facing surface, so it stays under the plugin-API limit.
- Survey: codegraph_explore `PROJECT_COMMANDS parseProjectArgs isProjectCommand orb-plugin cli` (no in-file caller outside `cli.ts`); ast-grep `"pack"` over `packages tests tooling scripts` (5913+ `.ts`, 1524+ `.tsx` files): 12 ts, 0 tsx; rg `orb-plugin (build|pack)`.
- No code change.
