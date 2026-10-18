---
kind: tooling
status: open
updated: 2026-10-18
priority: P2
area: tooling
plan: test-foundation
---

# Default Knip reports unused tooling, test and root exports and dependencies

## What

After 1053, the implementation argv of deps:knip (pnpm knip) still exits 1 on tooling, tests and the root workspace: unused files, exports and types, one unused dependency and four unused devDependencies. No packages/ findings remain in that view.

## Why

That stage argv has not been clean since it started running again, so new tooling debt is invisible among old.

## Done when

Each finding is fixed or adjudicated and pnpm knip exits 0 on main.

## Evidence

Filled at landing: what ran and where its output is.
