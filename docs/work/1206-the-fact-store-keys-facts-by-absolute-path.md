---
kind: bug
status: open
updated: 2026-10-20
priority: P2
plan: test-foundation
---

# The fact store keys facts by absolute path, so worktrees cannot share a store

## What

descriptorVersion hashes program.files by absolute path, so a store built in one worktree is not reused by another at the same commit; every lane or verifier worktree pays a cold full build (two hours or more on this box) even when an identical generation exists. 1162's verifier could not reuse the lane's store.

## Why

Lanes and reviewers each rebuild the same facts, which multiplies the dominant cost on small hardware.

## Done when

Facts and descriptor versions are keyed repository-relative with the root as separate context, a store built in one worktree reuses in another at the same content, proven by a test that moves a store between two checkouts with zero workers.

## Evidence

Filled at landing: what ran and where its output is.
