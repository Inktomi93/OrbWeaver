---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/plugin shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/plugin`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PluginLogView` / `PluginLogView` | `server/src/domain/plugin/index.ts:29` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |
| `distributedPluginViewSchema` / `distributedPluginViewSchema` | `server/src/domain/plugin/index.ts:31` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |
| `pluginBundleAssetViewSchema` / `pluginBundleAssetViewSchema` | `server/src/domain/plugin/index.ts:32` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |
| `pluginCommandViewSchema` / `pluginCommandViewSchema` | `server/src/domain/plugin/index.ts:33` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |
| `pluginDisplayTransformViewSchema` / `pluginDisplayTransformViewSchema` | `server/src/domain/plugin/index.ts:34` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |
| `pluginFanoutResultSchema` / `pluginFanoutResultSchema` | `server/src/domain/plugin/index.ts:35` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |
| `pluginLogViewSchema` / `pluginLogViewSchema` | `server/src/domain/plugin/index.ts:36` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |
| `pluginSurfaceStateSchema` / `pluginSurfaceStateSchema` | `server/src/domain/plugin/index.ts:37` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |
| `pluginSurfaceViewSchema` / `pluginSurfaceViewSchema` | `server/src/domain/plugin/index.ts:38` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |
| `pluginViewSchema` / `pluginViewSchema` | `server/src/domain/plugin/index.ts:39` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |
| `snippetResultSchema` / `snippetResultSchema` | `server/src/domain/plugin/index.ts:40` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 11 rows = 11 applied. 0 kept, 0 handed off, 0 owner questions.

- `PluginLogView` and ten view and result schemas (`distributedPluginViewSchema`, `pluginBundleAssetViewSchema`, `pluginCommandViewSchema`, `pluginDisplayTransformViewSchema`, `pluginFanoutResultSchema`, `pluginLogViewSchema`, `pluginSurfaceStateSchema`, `pluginSurfaceViewSchema`, `pluginViewSchema`, `snippetResultSchema`) reexport-chain: applied. `domain/plugin/index.ts` no longer re-exports them; the one importer through the door, `transport/trpc/routers/plugin.ts` (ast-grep ts 5949 / tsx 1525 tracked files), takes them from `@orb/contracts/plugin`. `packages/contracts/src/plugin/` and `packages/plugin-sdk/` are untouched: only the server door's copy is removed. A test-tree scan over the same files found no importer through the door.
