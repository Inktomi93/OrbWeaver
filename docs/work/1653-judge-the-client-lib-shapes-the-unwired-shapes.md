---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/lib shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `client/lib`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `CollectionInsight` / `TagLibraryFact` | `client/src/lib/collection-contracts.ts:86` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/tag/hooks/use-tag-library.ts:44`; a shape that matches by coincidence stays |
| `cn` / `cn` | `client/src/lib/index.ts:6` | reexport-chain | delete | export it from its home, not through `ui/src/lib/index.ts` |
| `removeActionName` / `removeActionName` | `client/src/lib/index.ts:6` | reexport-chain | delete | export it from its home, not through `ui/src/lib/index.ts` |
| `selectActionName` / `selectActionName` | `client/src/lib/index.ts:6` | reexport-chain | delete | export it from its home, not through `ui/src/lib/index.ts` |
| `NotifyAction` / `MemberDrillBack` | `client/src/lib/notify.ts:24` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/components/member-drill-header.tsx:36`; a shape that matches by coincidence stays |
| `ViewTransitionSettlement` / `NativeTransition` | `client/src/lib/view-transition-settlement.ts:1` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/routes/router-view-transition.ts:11`; a shape that matches by coincidence stays |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

6 rows: applied 3, kept 3, handed off 0, owner question 0.

- `removeActionName`, `selectActionName` (2 rows): applied. `packages/client/src/lib/index.ts` no longer re-exports them; the 8 client importers and the one CT (`tests/client/features/character/components/platform-tag-pill-height.suite.ct.tsx`, which used `@orb/client/lib`) import from `@orb/ui/lib`, their package door. Done with `move-import-names` (plan file `codemod-import-moves.json`, removed after use). Dry run listed exactly the 9 planned files, matching an independent `rg -U` of the import shape; Biome then fixed import order.
- `cn` (1 row): kept. `docs/law/UI-Architecture-and-Layout.md` lists the `cn` re-export in the client `lib/` entry and says `cn` is re-exported from `@orb/ui/lib`. 22 client files import it from `#lib`. The law line is the cited reason; the lib comment now says so.
- `CollectionInsight` / `TagLibraryFact` (1 row): kept. `TagLibraryFact` has the same four fields, but its `open` may act on a set (the prune door acts on every unused tag and opens the prune confirm), while `CollectionInsight.open` opens one member's editor by contract (`lib/collection-contracts.ts`). Same fields, different meaning of the door, so the two stay separate. A merge was tried and restored. `tooling/src/unwired/distinct-lookalikes.ts` records the pair as distinct.
- `ViewTransitionSettlement` / `NativeTransition` (1 row): merged. `NativeTransition` is the native ViewTransition object passed straight to `observeViewTransition`, which takes `ViewTransitionSettlement`; one concept. `routes/router-view-transition.ts` imports the exported `ViewTransitionSettlement` from `lib/view-transition-settlement.ts`.
- `NotifyAction` / `MemberDrillBack` (1 row): kept. Both are `{ label, onClick }`, but one is a toast action button and the other the member header's Back exit. They change for different reasons (toast chrome vs drill-in navigation); a shared type would couple them.
- Scan: ast-grep inline rule (identifier, type_identifier, property_identifier) `-l ts` and `-l tsx`, `packages tests` (5199 ts and 1450 tsx files); each type name had hits only in the files named above.
- `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` exit 0 (re-run after the restore with the full set: client, server, contracts, kit, node and both test worlds, exit 0); `pnpm lint:eslint` on the touched paths exit 0; `CT_PORT=5791 pnpm test:ct tests/client/features/character/components/platform-tag-pill-height.suite.ct.tsx` exit 0 (2 passed).
