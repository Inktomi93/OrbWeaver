---
kind: decision
status: open
updated: 2026-09-24
priority: P3
area: chat
---

# Decide where the squash system notes switch is shown

## What

The switch in packages/client/src/features/preset/components/message-handling-section.tsx now changes output only at role-handling level none. Bare folded notes join with the same separator as the row squash at every merging level. Decide between showing it only at none, deleting it, or leaving it.

## Why

A switch that does nothing at most levels is a dead setting, against the fewer-settings posture.

## Done when

The owner ruling is recorded and the build is filed or done.

## Evidence

Filled at landing: what ran and where its output is.
