---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: server
plan: cross-platform
---

# The setup env writer leaves a multi-line quoted value intact

## What

The `.env` writer in `packages/kit/src/env-file/index.ts` edits the line that carries a name. A line inside a multi-line quoted value can look like an assignment, and the writer can edit it.

## Why

An edit inside a quoted value corrupts that value.

## Done when

The writer skips lines inside a quoted value, with a test whose quoted value holds a line shaped like an assignment.

## Evidence

Filled at landing: what ran and where its output is.
