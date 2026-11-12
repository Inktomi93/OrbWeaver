---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: tooling
plan: checked-law
---

# The audit walker counts one caption fewer on a loaded machine

## What

In `tests/tooling/ui-audit/ops/walker/census-text.int.test.ts` the case with captions at four depths expects the contrast rule to judge five texts and fail four. Inside a whole tooling run on a loaded machine it judged five and failed three; alone it fails four. The walker read one caption as passing, so its measurement depends on timing.

## Why

The audit walker is the instrument behind the contrast findings, and a count that changes with machine load makes its clean result untrustworthy.

## Done when

The cause of the changed count is found in the walker (`tooling/src/ui-audit/`), the measurement waits on a signal instead of on time, and the case passes inside a whole tooling run under load.

## Evidence

Filled at landing: what ran and where its output is.
