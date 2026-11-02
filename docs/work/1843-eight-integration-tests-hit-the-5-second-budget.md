---
kind: bug
status: open
updated: 2026-11-02
priority: P3
area: testing
plan: test-foundation
---

# Eight integration tests hit the 5 second budget under whole-suite load and pass alone: remove their repeated work

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.

Whole `pnpm test` on main after T2 (load about 21 on 24 cores): 8 failed, 4,309 passed. All 30 tests in the affected files pass alone. The files: `tests/server/entry/rate-limit-gate.int.test.ts` (2), `tests/support/node/portability-box.int.test.ts`, `tests/server/entry/compose/share-acme.int.test.ts` (2), `tests/server/entry/http/bundle-body-limit.int.test.ts`, `tests/support/node/factories/execution-outputs.int.test.ts`, and the guest placement membrane test. Owner rule: remove repeated work; never raise the timeout.
