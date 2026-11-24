---
kind: bug
status: doing
updated: 2026-11-24
priority: P1
area: tooling
lane: wt/agent-a928fb0eea0de1b10
plan: unwired-code
---

# An unwired run's peak counts both processes and stays under its 32 GB bar

## What

A whole-tree graph run uses two processes, Node and the Go compiler, and the process timer reported only the larger one, so a run's real peak went unmeasured. The graph verbs ran their compiler under a 12 GiB soft limit, the cap that made the delete trial spend most of its CPU in Go garbage collection; the owner set every unwired verb's compiler limit and run bar to 32 GiB.

## Why

The owner's bar for the unwired command is one run under 32 GB counting both processes, and a measure that sees one process hides a breach.

## Done when

Every unwired verb runs its compiler under the 32 GiB limit, the run reports both processes' peaks from the profiler, a heap profile names the Node-side retainers, the garbage-collection share at the old and new limit is reported beside wall time, and a whole-tree graph run peaks under 32 GB combined.

## Evidence

Filled at landing: what ran and where its output is.
