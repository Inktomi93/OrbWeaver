---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/infra shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/infra`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `SafeFetch` / `SafeFetch` | `server/src/infra/network/index.ts:19` | reexport-chain | delete | export it from its home, not through `server/src/infra/network/egress.ts` |
| `SafeFetchResult` / `SafeFetchResult` | `server/src/infra/network/index.ts:20` | reexport-chain | delete | export it from its home, not through `server/src/infra/network/egress.ts` |
| `InvocationChat` / `InvocationChat` | `server/src/infra/plugin-host/membrane.ts:83` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |
| `PluginBridge` / `PluginBridge` | `server/src/infra/plugin-host/membrane.ts:83` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
