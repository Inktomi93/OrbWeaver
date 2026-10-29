---
kind: bug
status: open
updated: 2026-10-29
priority: P1
area: client
plan: surface-walk
---

# Keep primary rail controls reachable at short viewport heights

## What

The desktop rail used at phone landscape width places the Refinery navigation control below the viewport. Native pointer activation fails after scrolling attempts.

## Why

A supported viewport cannot reach every registered primary section through its visible navigation.

## Done when

Give the constrained rail a valid scroll owner while retaining brand and footer behavior. Prove every registered navigation target is pointer and keyboard reachable at short desktop and coarse landscape sizes, and preserve portrait tab behavior.

## Evidence

Filled at landing: what ran and where its output is.
