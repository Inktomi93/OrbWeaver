---
kind: bug
status: open
updated: 2026-10-19
priority: P2
area: tests
plan: test-foundation
---

# Legacy harnesses register their database wiring handle

## What

Legacy harnesses build services over a raw database without registering the sealed wiring handle, so they throw 'database wiring handle is not registered' from packages/db/src/client/wiring-capabilities.ts before any case runs. Today's lanes saw it in the legacy assets, plugin, chat compose, refinery and field-reachability suites.

## Why

D320 keeps legacy suites as CI regression execution; a harness that fails at setup runs no regression case.

## Done when

The legacy harness support files obtain a registered handle through the production wiring door, the affected legacy suites reach their cases, and failures that remain are listed by cause.

## Evidence

Filled at landing: what ran and where its output is.
