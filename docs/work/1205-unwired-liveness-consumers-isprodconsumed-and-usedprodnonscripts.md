---
kind: work
status: open
updated: 2026-10-20
priority: P3
plan: test-foundation
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
