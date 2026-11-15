---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: regex
plan: import-robustness
---

# Decide what a former host's sharing switch means after a handoff

## What

The sharing switch belongs to the room, so a former host's off stays in force until the new host turns sharing on.

## Why

It withholds and never leaks, but the new host's scripts are hidden from members without the new host having chosen that.

## Done when

A recorded ruling keeps the room-level switch or resets it at handoff, and a case pins it.

## Evidence

Filled at landing: what ran and where its output is.
