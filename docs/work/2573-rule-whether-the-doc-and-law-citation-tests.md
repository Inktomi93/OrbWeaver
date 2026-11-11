---
kind: decision
status: blocked
updated: 2026-11-11
priority: P2
area: tooling
blocked: owner
plan: checked-law
---

# Rule whether the doc and law citation tests run in a gate

## What

The tests that hold law and comment citations true live under tests/tooling: the comment path citation test, the dead reference test, the law directory list test and the law rule citation test. The node suite excludes tests/tooling, and the contributor workflow runs a fixed short list that omits them. They run only when someone runs pnpm test:tools by hand. An owner ruling keeps the tooling tests out of the node suite and out of CI.

## Why

The checked-law plan makes these tests the checker for every cite. A checker that runs in no gate catches nothing. The standing ruling and the plan conflict, so the owner decides.

## Done when

The owner rules one of: these doc tests join CI or pre-push as a named list while the other tooling tests stay out, or they move out of tests/tooling into a suite CI runs, or they stay hand-run and the plan names who runs them and when. The ruling is recorded in the ledger and the workflow or hook matches it.

## Evidence

Filled at landing: what ran and where its output is.
