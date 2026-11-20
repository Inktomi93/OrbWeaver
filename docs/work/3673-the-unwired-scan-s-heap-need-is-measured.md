---
kind: tooling
status: open
updated: 2026-11-20
priority: P3
area: tooling
plan: unwired-code
---

# The unwired scan's heap need is measured and fits the memory bar

## What

The unwired scan peaks at about 16 GB on main, the heap cap set in pnpm-workspace.yaml, both before and after the one-pass change, so its real need is unknown.

## Why

A run pinned at the cap can fail or slow on a smaller machine, and the memory bar is one run under 16 GB.

## Done when

The scan's true peak is measured with a raised measurement-only cap, and it runs under 16 GB with headroom by freeing each world's program after its pass.

## Evidence

Filled at landing: what ran and where its output is.
