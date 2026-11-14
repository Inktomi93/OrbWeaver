---
kind: work
status: open
updated: 2026-11-14
priority: P2
area: stats
---

# The owner's stored rollups are rebuilt once after the stats fixes

## What

Rollups already stored on the owner's database were written by the live path before the canon retirement, retraction and image-generation fixes. Stored image model rows and owner totals from that time can differ from a rebuild until the owner presses Recompute. Decide whether each owner gets one rebuild after the upgrade, and how that run is recorded so it runs once.

## Why

The owner's install is a real install. Live must equal a rebuild on the figures the owner already has, not only on new data.

## Done when

After the upgrade the owner's shown figures equal a rebuild without a Recompute, and a second boot does not rebuild again.

## Evidence

Filled at landing: what ran and where its output is.
