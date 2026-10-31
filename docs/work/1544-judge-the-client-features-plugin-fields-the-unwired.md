---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/plugin fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/features/plugin`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PluginPanelPrefsPatchVars.section` | `client/src/features/plugin/hooks/use-plugin-chat-visibility.ts:15` | never-read | wire | tRPC sends these mutation variables whole: derive the type from the router input (`inferInput`) so the server's read links it |
| `GuestState.log` | `client/src/features/plugin/lib/ui-guest/ui-guest-realm.ts:65` | never-read | delete | delete the field and its writes (`client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts:139`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

2 rows: 2 applied, 0 kept, 0 owner questions. Neither row sits under a Plugin API heading, and no guest reaches either field.

- `PluginPanelPrefsPatchVars.section` (`packages/client/src/features/plugin/hooks/use-plugin-chat-visibility.ts`): the type is the router input intersected with a `patch` narrowed to the profile keys the optimistic update reads. The narrowing stays because `update` reads `vars.patch.hiddenChatPluginIds`, `flankCollapsed` and `sidecarChatPluginSurfaces`.
- `GuestState.log` (`packages/client/src/features/plugin/lib/ui-guest/ui-guest-realm.ts`): deleted with its write in `packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts`. `GuestState` is the worker's own state record. A guest reaches `orb.ui(1).log.*` through the `log` ring that `installRealm` receives as `deps.log` (`ui-guest-realm.ts:159,190`), not through this field.

Ran: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` (exit 0).

Reclass list: none.
