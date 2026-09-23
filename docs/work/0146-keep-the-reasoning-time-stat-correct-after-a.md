---
kind: bug
status: open
updated: 2026-09-23
priority: P3
area: chat
---

# Keep the reasoning-time stat correct after a continue

## What

On a continue, the engine's stats delta adds the continuation's reasoning time and subtracts the base's, but the continue update leaves variant metadata insert-only, so the row keeps the base's reasoning_duration. After a reasoning continue, the live reasoning_ms rollup and a reconcileStats rebuild disagree.

## Why

The live stats drift from the canon they are rebuilt from, and the stats page shows a reasoning total that a reconcile silently changes.

## Done when

A continue either rewrites reasoning_duration in the variant's metadata or stops swapping it in the delta; a test runs a reasoning continue and shows the live rollup equals the reconcile rebuild.

## Evidence

Filled at landing: what ran and where its output is.
