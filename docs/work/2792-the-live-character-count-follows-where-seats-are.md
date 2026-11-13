---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: stats
plan: authorization-and-visibility
---

# The live character count follows where seats are across a handoff

## What

A handoff copy counts before it is seated, and a handoff may drop the original's only seat; the second half was read in code and not yet proven by a test.

## Why

A character counts once it starts its first room, so the count must follow the seats.

## Done when

A handoff neither adds nor drops a count that the seats do not show, proven by a test for each half.

## Evidence

Filled at landing: what ran and where its output is.
