---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
---

# pnpm train merges a frozen lane in one call

## What

One command runs the merge, generated file rebuilds, doc landing and worktree sweep for a finished lane.

## Why

Each merge is several hand steps and each step has burned turns.

## Done when

One call lands a branch with its items, and refuses on a conflict or a dirty tree.

## Evidence

Filled at landing: what ran and where its output is.
