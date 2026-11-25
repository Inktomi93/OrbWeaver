---
kind: bug
status: open
updated: 2026-11-25
priority: P3
area: security
plan: test-foundation
---

# No test fails when the in-flight argument recheck after a host-call read is removed

## What

The plugin membrane rechecks a host call's read bytes against the in-flight argument budget after the read (readUnderReservation in packages/server/src/infra/plugin-host/membrane.ts). Removing that recheck leaves every suite green, yet it is the only control on the key-only store doors, whose reservation does not count a non-string payload.

## Why

Without the recheck, nested storage.get calls carrying large number payloads hold more than the instance budget, and no test would catch the regression (the third security review of the in-flight budget).

## Done when

A nested storage.get case with a non-string payload in tests/server/infra/plugin-host/membrane.int.test.ts goes red with the recheck removed and green on the current code.

## Evidence

Filled at landing: what ran and where its output is.
