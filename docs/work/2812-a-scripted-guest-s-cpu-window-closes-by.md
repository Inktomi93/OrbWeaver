---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: authorization-and-visibility
---

# A scripted guest's CPU window closes by construction

## What

CPU windows are closed by hand in a finally block, with a guard that makes a second close a no-op and that no test can reach.

## Why

An unreachable guard is a branch nobody can prove.

## Done when

Each window is a Disposable opened with `using`, the guard is gone, and the native guest protocol component test stays green.

## Evidence

Filled at landing: what ran and where its output is.
