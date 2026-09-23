---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: server
---

# Thicken the thin schema tests and retire the frozen-env branches

## What

Finish the residue of the test-quality review: add real behavior cases to thin suites such as `tests/db/schema/audit.int.test.ts` and `tests/db/schema/rate-limit.int.test.ts`; remove the frozen-env branches in tests; and keep ratcheting down the keyed-credential fabrication grants of the no-test-fabrication gate.

## Why

The review's urgent rows landed, but this tail was never filed.

## Done when

Each named suite covers its table's writes, constraints and error paths; no test branches on a frozen env value; the fabrication grant list is shorter than when this item opened.

## Evidence

Filled at landing: what ran and where its output is.
