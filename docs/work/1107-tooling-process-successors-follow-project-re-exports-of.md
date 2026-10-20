---
kind: tooling
status: open
updated: 2026-10-20
priority: P3
plan: test-foundation
---

# Tooling process successors follow project re-exports of node:process

## What

In the 1041 tooling-1 shard, tooling-argv-front-door and tooling-process-exit-home miss node:process reached through a project module re-export (export default as proc, or import then export), which the old reader followed.

## Why

Item 1041 moves the gate only when the successor keeps every claim the old gate made or records a loss with a census proving no live site depends on it; the shard was refuted on this point after three attempts, and the old gate stays in force until it passes.

## Done when

The successor covers the named case with a planted defect red first, or the loss is recorded with a census showing no live site, waiver or grant hits it; an independent verifier confirms; the old gate module is deleted.

## Evidence

Filled at landing: what ran and where its output is.
