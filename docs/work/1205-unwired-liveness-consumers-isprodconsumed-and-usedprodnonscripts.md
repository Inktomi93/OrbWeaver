---
kind: work
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
---

# Unwired liveness consumers isProdConsumed and usedProdNonScripts

## What

isProdConsumed and usedProdNonScripts served an orphan ratchet that no longer exists; only tests call them.

## Why

Unwired code is a question about intent: wire it or delete it.

## Done when

Each is wired to a live consumer with a reason or deleted with its tests.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
