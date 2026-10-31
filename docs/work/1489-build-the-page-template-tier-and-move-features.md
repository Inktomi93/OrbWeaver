---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: client
plan: cross-surface-consistency
---

# Build the page-template tier and move features onto it

## What

Build one composite per recurring page shape in packages/client/src/components/: list page, detail header, settings pane, editor and collection grid. Each declares its density and surface tier and composes the step-4 named components. Move features onto them with repo codemods where the shape is mechanical; tags, stats, refinery and databank use shared composites least and go first. A lint rule refuses a feature that rebuilds a template's shape from primitives once its template exists.

## Why

Comparative acceptance (item 1392) judges hierarchy, proportions and action placement across families. Those come from page shapes each feature builds by hand today, so the comparison must run after the shapes have one home.

## Done when

Each template exists with a production-mounted CT across seeds, densities and both pointer classes. Every feature that rebuilt a template's shape uses the template. The lint rule refuses a planted rebuild and reports zero on the tree. Before and after isolated captures of each migrated surface show no unexplained difference.

## Evidence

- Templates: `ListPage`, `DetailHeader`, `EditorPage`, `CollectionGrid` and `SettingsPane` in `packages/client/src/components/`. The survey, the API, the judgment sites and the capture record are in the cross-surface plan's "Page templates" section.
- `tests/client/components/platform-page-templates.suite.ct.tsx` passes on Chromium and WebKit at both pointer classes, over every seed palette and both densities. A planted defect in each template turns its test red.
- The migrated-surface CTs pass on Chromium. `list-arrival-focus.ct.tsx` "arriving in presets" failed once in a full-file repeat and passed 8 of 8 alone; it is not reproduced on a clean tree.
- `tests/tooling/eslint-page-template-shapes.test.ts` refuses each planted rebuild and passes each control. Whole-tree `pnpm lint:eslint packages tooling tests` reports zero, so the rule holds at zero with no baseline.
- `pnpm typecheck` for `packages/ui`, `packages/client` and `tsconfig.tests-dom.json`, `pnpm lint`, `pnpm lint:css`, `pnpm depcruise`, `pnpm knip:prod` and `tests/client/owner-css-surface.repo.int.test.ts` pass.
- Isolated captures, before at `5cb1373429` and after at the lane head, are indexed in `reports/page-templates-1489/` with the before and after surveys.
