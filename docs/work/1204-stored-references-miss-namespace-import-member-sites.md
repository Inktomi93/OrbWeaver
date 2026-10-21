---
kind: bug
status: blocked
updated: 2026-10-21
priority: P2
blocked: owner
---

# Stored references miss namespace-import member sites

## What

The stored reference index returns no references for an import \* as ns binding, while native returns the ns.member sites (fixture packages/client/src/browser.ts in tests/tooling/floor/compiler/native-inventory-fixture.ts); 1162 kept a binding-identity walk to stay correct and named the gap in floor/code-facts/liveness-consumption.ts.

## Why

Any consumer reading stored references for a namespace binding gets a silent clean zero, which D328 forbids.

## Done when

Stored reference extraction records ns.member sites for namespace bindings matching native, the stored-vs-native equality test covers them, and liveness drops its workaround walk.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
