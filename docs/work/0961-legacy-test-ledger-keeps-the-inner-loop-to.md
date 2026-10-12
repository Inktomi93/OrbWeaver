---
kind: work
status: open
updated: 2026-10-12
priority: P1
plan: test-foundation
---

# Legacy test ledger keeps the inner loop to rebuilt tests

## What

One shrink-only ledger names every test file not yet rebuilt on the new harness. Ledger files run in CI and nightly only, not in commit hooks or lane floors. Gates judge every file outside the ledger at full strictness. A file leaves when its cases are ported and verified, and is then deleted.

## Why

The test bulk sets the cost of every step, and per-site waivers on legacy tests hide the standard new tests must meet.

## Done when

The ledger exists, a gate refuses a new or returning entry, the inner-loop runners skip ledger files, and CI still runs them.

## Evidence

Filled at landing: what ran and where its output is.
