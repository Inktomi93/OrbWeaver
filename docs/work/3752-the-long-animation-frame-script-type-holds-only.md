---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: client
plan: unwired-code
---

# The long animation frame script type holds only the fields motion stats reads

## What

LoafScript in packages/client/src/lib/motion-stats.ts types the browser's long animation frame script entry by hand, and most of its fields are never read.

## Why

A hand copy of a browser type carries fields nobody uses.

## Done when

LoafScript holds the fields motion-stats reads, and its tests pass.

## Evidence

Filled at landing: what ran and where its output is.
