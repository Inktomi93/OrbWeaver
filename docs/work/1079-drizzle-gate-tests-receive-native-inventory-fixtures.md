---
kind: tooling
status: open
updated: 2026-10-19
priority: P2
area: tooling
plan: test-foundation
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
