---
kind: tooling
status: open
updated: 2026-10-20
priority: P2
---

# Clear the native lint findings the gate-move merges introduced

## What

Native lint on main reports findings that were absent at the native type-home integration (dc2a0c7551) and arrived with the later gate-move, assets-gc, persona auto-seed, plugin reap and test merges: max-lines in packages/client/src/data/import-tree-plan.ts and tooling/src/floor/code-facts/shape-association.ts; role-data-export-surface in domain/chat/persistence/queries.ts; server-factory-tier-reference in chat/verbs/edit.ts, persona/seeder/default.ts, plugin/substrate/reap-released.ts and foundation/env/index.ts; and test-side findings (brand-in-name-position, test-fixture-imports, tests-package-subpath, tooling-clock-budget, valid-expect, await-thenable, no-unnecessary-condition, require-array-sort-compare, consistent-type-assertions). The full list is in the lane brief.

## Why

These are new reds on top of the existing lint backlog, introduced by merges that each lint-checked only their own scope.

## Done when

pnpm lint:eslint-scoped over each listed file reports none of these findings, with no suppression beyond a verified false positive carrying its reason, and the touched tests pass.

## Evidence

Reviewed source is integrated at `212974e4a9`. Native lint still reports findings outside the server factory population. Completed output and resource measurements: `reports/review/handoff-native-lint/`. This item remains open; source delivery is not full lint qualification.
