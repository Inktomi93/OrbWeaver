---
kind: tooling
status: open
updated: 2026-10-11
priority: P3
area: tests
plan: test-mirror
---

# Story registries and test imports escape the CT door rules

## What

About 25 story modules under tests/client (for example databank/\_ct-stories.tsx, chat/\_ct-stories.tsx, plugin/\_ct-stories.tsx) still hand-mint door registries; most are deliberate isolation fixtures, but ct-config-mirror-parity only polices ct-data-providers.tsx. Separately, the widened dependency-cruiser rule client-compose-door-only cannot see stories or specs because pnpm depcruise starts only from IMPORT_ENTRY_ROOTS (tooling/src/floor/compiler/import-population.ts), which excludes tests/client; tests/client/state/\_ct-stories.tsx and config-section-partition.dom.test.ts import compose directly.

## Why

Spine-Testing section 10 says registries come from the production list; isolation subsets need a named exception, and an import rule that never runs on tests is not enforcement.

## Done when

Each remaining story mint either uses the door export or carries a named isolation waiver the gate reads, and depcruise cruises tests/client so client-compose-door-only judges stories and specs.

## Evidence

Filled at landing: what ran and where its output is.
