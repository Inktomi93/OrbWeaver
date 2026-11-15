---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: client
plan: test-foundation
---

# The card frame parity component test keeps its own copy of the card room helpers

## What

The framed link confirm component test shares card room helpers from a support file under `tests/client/features/chat/components/`. The card frame parity component test in the same directory still declares its own copies of the same setup.

## Why

Two copies of one setup drift apart.

## Done when

Both component tests import the one set of helpers and still pass.

## Evidence

Filled at landing: what ran and where its output is.
