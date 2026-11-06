---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: testing
plan: surface-walk
---

# walkDoor records a missing door as not applicable, so a stale door is silent

## What

Make walkDoor report a missing door as a failure that names the door, not as not applicable.

## Why

A door listed in the walk table whose trigger no longer exists is recorded as not applicable, so a stale door entry passes in silence.

## Done when

A walk table entry whose trigger is absent fails the walk and names the door. A door that exists and one marked not applicable by its table row both still pass.

## Evidence

Filled at landing: what ran and where its output is.
