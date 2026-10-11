---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: tests
---

# DB tests seed through the shared factories

## What

Fifteen local seeders in tests/db/schema hard-code a fake contentHash instead of using tests/support/factories/character.ts, and two live specs call raw settings and preset mutations although typed helpers exist in trpc.ts.

## Why

Seeds that skip production invariants test rows the app can never write.

## Done when

The seeders use the factory, the specs use the helpers, and the affected suites pass.

## Evidence

Filled at landing: what ran and where its output is.
