---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: client
plan: test-foundation
---

# Card parity and link gate review test gaps

## What

Three gaps from the review of the card parity fix and the framed link gate. No server test covers a seat whose character is gone reporting the no-card source. No test turns red when the focus gate in `packages/ui/src/content/sandbox-frame/` stops requiring that every focus change was judged. The archive card's use of the shared forming chip has no test.

## Why

Each is behaviour a later change can break with every test green.

## Done when

Each gap has a test that fails on a planted break, at the layer `docs/law/Spine-Testing.md` gives it.

## Evidence

Filled at landing: what ran and where its output is.
