---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/lib union members the unwired unions scan reports

## What

`pnpm unwired unions` reports each of the union members below in `client/lib`; `reports/unwired/unions.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Member | At | Kind | Class | Decision |
| - | - | - | - | - |
| `SEED_PROFILES.d20` | `client/src/lib/agent-bridge-handles.ts:40` | unbuilt | delete | delete the member and the 8 branch, check or keys that name it |
| `APPEARANCE_CARRIER_PLANES.root-html` | `client/src/lib/appearance-carrier-manifest.ts:13` | unbuilt | delete | delete the member and the 1 branch, check or key that name it |
| `APPEARANCE_CARRIER_PLANES.shell-grid` | `client/src/lib/appearance-carrier-manifest.ts:13` | unbuilt | delete | delete the member and the 1 branch, check or key that name it |
| `APPEARANCE_CARRIER_PLANES.background-layer` | `client/src/lib/appearance-carrier-manifest.ts:13` | unbuilt | delete | delete the member and the 1 branch, check or key that name it |
| `APPEARANCE_CARRIER_PLANES.message-props` | `client/src/lib/appearance-carrier-manifest.ts:13` | unbuilt | delete | delete the member and the 1 branch, check or key that name it |
| `CASCADE_SOURCES.generated-theme` | `client/src/lib/appearance-invariant-manifest.ts:17` | unbuilt | delete | delete the member |
| `CHARACTER_DETAIL_ANCHORS.editor-sections` | `client/src/lib/contribution-contracts.ts:201` | unbuilt | delete | delete the member |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired unions` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
