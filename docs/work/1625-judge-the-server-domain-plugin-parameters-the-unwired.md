---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/plugin parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/plugin`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `createPluginMacroRegistry.deadlineMs` | `server/src/domain/plugin/substrate/plugin-macros.ts:120` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `createSnippetGate.max` | `server/src/domain/plugin/substrate/snippet-gate.ts:33` | unsupplied | delete | delete the parameter and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

2 rows: applied 2, kept 0, handed off 0, owner questions 0.

Applied: `createPluginMacroRegistry.deadlineMs` (the 1000 ms bound stays as the named `PLUGIN_MACRO_RESOLVE_DEADLINE_MS`) and `createSnippetGate.max` (the per-user ceiling stays as the named `SNIPPET_CONCURRENCY_PER_USER`, which is also what `PluginSnippetBusyError` reports). Both are host-internal factories built once at the composition roots (`entry/compose/services.ts:1057`, `entry/compose/automation-plugin.ts:412`); neither is a guest or Plugin API surface, and no test passes the override (literal `rg` for `deadlineMs` finds only unrelated functions).

Survey: codegraph_explore on createPluginMacroRegistry, createSnippetGate; ast-grep on both names, -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): 1 call each.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.tests-iso.json tsconfig.node.json` exit 0; `pnpm test tests/support/node/plugin-lifetime.int.test.ts` 3 passed.
