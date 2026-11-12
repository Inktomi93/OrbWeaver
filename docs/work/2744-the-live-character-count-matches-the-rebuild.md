---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: chat
plan: authorization-and-visibility
---

# The live character count matches the rebuild

## What

With two characters in a started room and one of them seated, the live stats count one character and the reconcile rebuild counts two.

## Why

The two numbers describe the same room, so a rebuild changes what the owner sees with no change in the room.

## Done when

The live count and the rebuild agree for a room with a seated and an unseated character, and a test through the stats verbs proves it.

## Evidence

Filled at landing: what ran and where its output is.
