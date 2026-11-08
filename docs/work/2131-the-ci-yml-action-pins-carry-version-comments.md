---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# The ci.yml action pins carry version comments

## What

Some action pins in .github/workflows/ci.yml are bare SHAs. Add the version comment each pin's tag names, as the other workflows do.

## Why

A bare SHA hides which release a workflow runs, which makes review of a bump harder.

## Done when

Every action pin in the workflows carries its version comment, and zizmor reports no unpinned or uncommented action.

## Evidence

Filled at landing: what ran and where its output is.
