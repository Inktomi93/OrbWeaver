---
kind: work
status: open
updated: 2026-11-14
priority: P2
area: ui
---

# Show the default reply length when Max output tokens is blank

## What

A blank Max output tokens sends `DEFAULT_MAX_OUTPUT_TOKENS` (2,048, `packages/contracts/src/preset/index.ts`). Make that value and its source plain on the row, including after the connection's max output is raised.

## Why

A user who raises the connection limit and leaves the preset blank still gets short replies with no stated reason.

## Done when

The row states the value a blank field sends, and a CT pins it.

## Evidence

Filled at landing: what ran and where its output is.
