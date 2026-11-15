---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
plan: import-robustness
---

# The display regex guard's comment names a filter the kit no longer has

## What

The header of `guardedDisplayReplace` in `packages/client/src/lib/message-render.ts` says the shared kit pre-filter counts quantifier stacks. The kit's executor now refuses by length only by the regex-scripts ruling. Correct the comment when the browser lane replaces the guard with a Worker deadline.

## Why

A comment that describes removed behavior is a defect, and this one explains the display guard's reason by it.

## Done when

The comment states what the kit refuses today, or the guard and its comment are gone with the Worker deadline.

## Evidence

Filled at landing: what ran and where its output is.
