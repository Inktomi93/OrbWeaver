---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: cross-platform
---

# The lint worlds and the DOM part globs have one source

## What

`eslint.config.ts` repeats the world list that `tooling/src/unwired/worlds.ts` holds, and `scripts/eslint-parts.ts` copies the DOM globs from `tsconfig.tests-dom.json`. Only `tests/tooling/eslint-parts.repo.int.test.ts` keeps them in step. A world that inherits `include` through `extends` throws at config load.

## Why

Two copies of one list drift, and a tsconfig refactor would break the lint config load.

## Done when

Both read one list, and a world whose `include` is inherited resolves at config load.

## Evidence

Filled at landing: what ran and where its output is.
