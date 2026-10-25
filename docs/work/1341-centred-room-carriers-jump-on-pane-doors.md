---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: client
---

# Centred room carriers jump on the pane doors

## What

In a real room the message row and the composer jump 12–16px on the first painted frame of three doors, then glide back, sitting outside their corridors for two frames: the CONTEXT door (437 to 449.5px at 1280), the LIST door with both panes docked (340 to 328px), and the 20rem dock (208 to 223.8px). The plain LIST door holds them. The centred counter in the shell motion CSS assumes carriers sit directly in the content slot.

## Why

A visible lurch on every pane toggle in a room.

## Done when

The row and composer hold within 2px on the first painted frame of all three doors, and `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` adds the carriers back to those doors.

## Evidence

Filled at landing: what ran and where its output is.
