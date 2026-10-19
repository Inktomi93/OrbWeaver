---
kind: tooling
status: open
updated: 2026-10-19
priority: P3
area: tooling
---

# Generated outputs keep only their migrated restrictions

## What

tests/tooling/verify/ops/native-restrictions.test.ts fails: calculateConfigForFile on packages/ui/src/tokens/index.ts returns the whole orb rule set instead of only no-restricted-syntax.

## Why

The test pins restriction-only intent for generated outputs.

## Done when

The test passes, or its pin is revised with a ruling.

## Evidence

Filled at landing: what ran and where its output is.
