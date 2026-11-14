---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: stats
---

# A room delete keeps the spend of its pending generation facts

## What

A room delete removes the room's pending generation observations with a negative spend delta for each funder, so paid spend drops on both paths.

## Why

Those calls were paid, and spend already paid is never lowered.

## Done when

A server case deletes a room with a pending paid observation, and the funder's shown spend is unchanged on the live path and after a rebuild.

## Evidence

Filled at landing: what ran and where its output is.
