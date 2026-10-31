---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/notifications shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/notifications`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PluginNotificationDelivery` / `PluginNotificationDelivery` | `server/src/domain/notifications/contract/plugin-delivery.ts:8` | reexport-chain | delete | export it from its home, not through `contracts/src/plugin/index.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 1 row = 1 applied. 0 kept, 0 handed off, 0 owner questions.

- `PluginNotificationDelivery` reexport-chain: applied. The `contract/plugin-delivery.ts` re-export of the `@orb/contracts/plugin` type is deleted; its one importer (`verbs/plugin-delivery.ts`) imports it from `@orb/contracts/plugin` (ast-grep ts 5949 / tsx 1525 tracked files). `packages/contracts/src/plugin/` is not touched.
