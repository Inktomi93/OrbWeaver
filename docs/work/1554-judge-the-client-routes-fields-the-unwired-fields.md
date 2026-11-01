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

5 rows: 0 deleted, 4 derived, 1 kept. 0 handed off, 0 owner questions.

| Row | Result |
| - | - |
| `NativeTransition.ready`, `.finished`, `.updateCallbackDone` | derived: the router hands the native transition whole to `observeViewTransition(transition: ViewTransitionSettlement)`, which reads the three members (`view-transition-settlement.ts`). `NativeTransition` is gone and `ViewTransitionSettlement` is exported |
| `ViewTransitionDocument.visibilityState` | derived: `isDocumentHidden` reads it through `ViewTransitionVisibility`, now exported; the router's document type extends it |
| `Register.router` | kept: TanStack reads `Register["router"]` in `RegisteredRouter` (`node_modules/.pnpm/@tanstack+router-core@1.171.38/node_modules/@tanstack/router-core/dist/esm/router.d.ts:29`); a module augmentation has no in-repo reader by design |

Survey: `codegraph_explore` on the router view-transition names; ast-grep (`-l ts` 5904, `-l tsx` 1522 files) on `observeViewTransition($$$)` and `isDocumentHidden($$$)` (callers: `router-view-transition.ts`, `view-transition.ts`). Typecheck: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` exit 0. CT: `core-lifecycle` and `section-swap-ready` patch `document.startViewTransition` and drive navigation, 8 passed. Lint: `pnpm lint:eslint` on the two files.
