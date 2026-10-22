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

Normal CLI success and failure release owned processes before deleting disposable data. Uncertain shutdown retains and identifies its directory. Hard termination requires explicit owner recovery; there is no automatic sweep. Native reports remain usable; developer data and caller-owned corpus fixtures are untouched.

## Evidence

The [E2E disposable-state policy](../plans/test-foundation/design.md#e2e-disposable-state) records ownership, completed native lifecycle exercises and retained-directory limits.
