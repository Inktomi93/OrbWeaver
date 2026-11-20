---
kind: bug
status: doing
updated: 2026-11-20
priority: P3
area: ui
lane: wt/agent-a08e6a0b2439f66f2
plan: cross-surface-consistency
---

# The settings details pane draws its bullets from one list primitive

## What

The settings details pane builds its bullet rows by hand (packages/client/src/features/config/components/config-teacher.tsx), so bullets sit at three different left edges and one hangs outside its text indent.

## Why

Hand-built bullets drift from the house list and from each other.

## Done when

The pane uses the shared list primitive and every bullet aligns to one indent.

## Evidence

Filled at landing: what ran and where its output is.
