---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: tests
plan: test-foundation
---

# Runner-side e2e files never import the composed door

## What

tests/e2e/corpus-settings.spec.ts and tests/e2e/support/surface-sections.ts still import the composed door, so a full pnpm e2e loads the operator .env into the Playwright runner and its workers. Fix both imports and add a dependency-cruiser rule that keeps runner-side e2e files off the composed door.

## Why

The runner process should never hold operator secrets; the webServers are already clean because these load after they start, but the next import could load earlier.

## Done when

Neither file imports the composed door, a dependency-cruiser rule refuses a runner-side import of it, and a full pnpm e2e run shows no operator key in the runner's environment.

## Evidence

Filled at landing: what ran and where its output is.
