---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/routes fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/routes`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `NativeTransition.ready` | `client/src/routes/router-view-transition.ts:12` | unreferenced | delete | delete the field |
| `NativeTransition.finished` | `client/src/routes/router-view-transition.ts:13` | unreferenced | delete | delete the field |
| `NativeTransition.updateCallbackDone` | `client/src/routes/router-view-transition.ts:14` | unreferenced | delete | delete the field |
| `ViewTransitionDocument.visibilityState` | `client/src/routes/router-view-transition.ts:18` | unreferenced | delete | delete the field |
| `Register.router` | `client/src/routes/router.tsx:140` | unreferenced | delete | delete the field |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
