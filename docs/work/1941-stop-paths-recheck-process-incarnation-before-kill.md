---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: tooling
---

# Stop paths recheck process incarnation before KILL

## What

dev-down stopHolder and stage-teardown releasePort still check only the pid across the TERM grace, as sweepRunMarker did before 1854.

## Why

Same class as 1854: a reused pid could receive KILL.

## Done when

A replacement during grace is refused at each door, and a same-incarnation survivor is still stopped.

## Evidence

Filled at landing: what ran and where its output is.
