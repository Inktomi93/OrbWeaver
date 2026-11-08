---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: testing
plan: test-foundation
---

# Eight integration tests hit the 5 second budget under whole-suite load and pass alone: remove their repeated work

## What

Remove the repeated work from the eight integration tests that hit the 5 second budget under whole-suite load and pass alone.

## Why

A whole pnpm test run on a loaded machine failed eight tests that pass alone. The owner rule is to remove repeated work and never raise the timeout. The files are in the Evidence.

## Done when

Each of the eight tests passes in a whole pnpm test run at the load that failed them, with no raised timeout.

## Evidence

Filled at landing: what ran and where its output is.

Whole `pnpm test` on main after T2 (load about 21 on 24 cores): eight failed. Every test in the affected files passes alone. The files: `tests/server/entry/rate-limit-gate.int.test.ts` (2), `tests/support/node/portability-box.int.test.ts`, `tests/server/entry/compose/share-acme.int.test.ts` (2), `tests/server/entry/http/bundle-body-limit.int.test.ts`, `tests/support/node/factories/execution-outputs.int.test.ts`, and the guest placement membrane test. Owner rule: remove repeated work; never raise the timeout.
