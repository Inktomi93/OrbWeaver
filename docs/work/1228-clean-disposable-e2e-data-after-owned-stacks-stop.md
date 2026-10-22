---
kind: tooling
status: open
updated: 2026-10-22
priority: P2
area: tests
plan: test-foundation
---

# Clean disposable E2E data after owned stacks stop

## What

Separate reusable caches from disposable mode data. Disable unneeded local-model prefetch for model-free E2E and delete owned databases, assets and client builds after process teardown while retaining bounded failure evidence.

## Why

Native E2E stops its processes but retains each mode data root, including duplicated local-model downloads. Repeated worktrees accumulate disk state.

## Done when

Success and failure release owned processes before deleting disposable data. Interrupted-run recovery touches only proven test-owned paths. Native reports remain usable; developer data and caller-owned corpus fixtures are untouched.

## Evidence

Filled at landing: what ran and where its output is.
