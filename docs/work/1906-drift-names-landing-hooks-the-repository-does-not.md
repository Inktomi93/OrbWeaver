---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
---

# Drift names landing hooks the repository does not install

## What

The drift line for an unlanded Closes trailer says the merge ran without the landing hooks, and tooling/src/doc/lib/drift.ts carries a matching comment. lefthook.yml has no post-merge or post-commit entry, so landing from trailers is a manual pnpm doc land --merged.

## Why

The message sends an operator looking for a hook that does not exist.

## Done when

The drift line and comment name the manual step, and the tests that assert the old text are updated.

## Evidence

Filled at landing: what ran and where its output is.
