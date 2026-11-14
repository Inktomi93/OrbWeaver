---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: stats
---

# Regenerating a reply keeps the earlier take's paid cost

## What

A regenerate replaces the reply, and the earlier take's paid cost leaves the shown spend on the live path and after a rebuild.

## Why

Spend already paid is never lowered.

## Done when

A server case regenerates a paid reply, and the shown spend holds both takes' cost on the live path and after a rebuild.

## Evidence

Filled at landing: what ran and where its output is.
