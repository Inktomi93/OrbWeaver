---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# The workspace override comments match how pnpm update reaches transitives

## What

The override comments in pnpm-workspace.yaml claim pnpm update cannot reach transitive dependencies, but the body-parser bump reached one through pnpm update inside its parent's range. Correct the comments.

## Why

A wrong comment sends the next author to add an override that is not needed.

## Done when

The comments state when an override is needed and when pnpm update suffices, and no override exists only because of the old claim.

## Evidence

Filled at landing: what ran and where its output is.
