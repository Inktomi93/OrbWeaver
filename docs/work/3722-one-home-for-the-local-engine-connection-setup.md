---
kind: tooling
status: doing
updated: 2026-11-27
priority: P2
area: tooling
lane: wt/agent-a1902dde200366c39
---

# One home for the local engine connection setup in e2e and snap

## What

tests/e2e/support/global-setup.ts and tooling/src/snap/ops/stage-connection.ts each set up a connection to the box's local engine.

## Why

Two copies of one setup drift apart.

## Done when

Both import one setup from a tooling floor module, and their tests still pass.

## Evidence

Filled at landing: what ran and where its output is.
