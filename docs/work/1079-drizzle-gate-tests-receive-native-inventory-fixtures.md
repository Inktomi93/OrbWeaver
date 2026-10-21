---
kind: tooling
status: blocked
updated: 2026-10-21
priority: P2
area: tooling
blocked: owner
---

# Drizzle gate tests receive native inventory fixtures

## What

drizzle-native-provenance, drizzle-settled-reads and drizzle-helper-origins tests clear their refusal with isolated type facts but receive no Drizzle evidence; projectCtx fails because native inventory needs pre-import implementation observation. testkit-enforcement.test.ts:243 still refuses after nativeTypeFactOptions is supplied.

## Why

These gate tests prove nothing while their evidence never arrives.

## Done when

Each test receives its evidence through the ruled nativeInventoryFixture path and asserts its real rows.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
