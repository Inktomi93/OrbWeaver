---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
plan: test-enforcement
---

# orb/no-unsafe-cast misses Drizzle unnamed select types and exits 2 on plugin-sdk

## What

Make orb/no-unsafe-cast (`tooling/src/eslint/unsafe-cast.ts`) recognize a cast of an unnamed Drizzle select result type. The rule today finds a row type only by a name ending in `Row` (`ROW_NAME`), so an inferred select type with no name passes.

## Why

A cast of an unnamed select result passes the rule, so an unsafe cast goes unreported. The second half of the original text, `pnpm lint:eslint packages/plugin-sdk` exiting with 2, did not reproduce: the run exits 0 on current main (the plugin-sdk files are configured at eslint.config.ts:754 since 6f5865edbb).

## Done when

A fixture in tests/tooling/eslint-no-unsafe-cast.test.ts that casts an unnamed select result is reported, and the matching safe cast is not. pnpm lint:eslint packages/plugin-sdk keeps exiting 0.

## Evidence

Filled at landing: what ran and where its output is.
