---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# Re-measure the display pass while a reply streams, on a quiet box

## What

Rerun the 218-script streaming measure with the 1-minute load under the core count, and record the late-chunk share.

## Why

The only reading was taken at load 42-48 on 24 cores (median 41 ms, p90 380 ms, 32 of 170 chunks late), so it gives no verdict.

## Done when

A reading taken under quiet load, with a verdict against the frame budget, is recorded in the item's evidence.

## Evidence

Filled at landing: what ran and where its output is.
