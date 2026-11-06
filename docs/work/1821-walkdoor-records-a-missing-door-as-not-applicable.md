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

Make `walkDoor` in tests/e2e/support/surface-walker.ts fail a door whose trigger is absent, naming the door. Add an explicit optional marker on `SurfaceDoor` for a door that is legitimately absent for a subject, so only a marked door records not-applicable.

## Why

walkDoor records a trigger count of zero as `not-applicable` ("The subject exposes no corresponding door") with no way to tell a stale door entry from an intended absence, so a stale entry passes in silence. SurfaceDoor today carries only id, trigger, body and exit.

## Done when

A door entry whose trigger is absent fails the walk and names the door. A door that exists passes, and a door carrying the explicit absent marker records not-applicable.

## Evidence

Filled at landing: what ran and where its output is.
