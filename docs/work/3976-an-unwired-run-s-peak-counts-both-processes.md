---
kind: bug
status: open
updated: 2026-11-23
priority: P1
area: tooling
plan: unwired-code
---

# An unwired run's peak counts both processes and stays under the memory bar

## What

A whole-tree graph run uses two processes, Node and the Go compiler, and the process timer reported only the larger one, so tonight's graph runs exceeded the per-run memory bar once both were counted.

## Why

The owner's memory rule is one run's peak under the bar, and a measure that sees one process hides the breach.

## Done when

The run reports both processes' peaks from the profiler, a heap profile names the Node-side retainers, and a whole-tree graph run peaks under the bar combined, or the item names the cut and its cost.

## Evidence

Filled at landing: what ran and where its output is.
