---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
plan: surface-walk
---

# The title-fit probe accepts a title line that collapsed to nothing

## What

`nameKeepsItsFloor` in `tests/support/browser/title-fit.ts` takes the smaller of the floor, the name's own text and the title line's width. A defect that collapses the whole text column, so the line is a few pixels wide, then reads as a name that keeps its floor.

## Why

A row whose name has no room at all would pass a check built to catch exactly that.

## Done when

A case that runs narrower than the floor also asserts the title line's own width, or the probe reports the line width beside the verdict, and a planted collapse of the content column fails it.

## Evidence

Filled at landing: what ran and where its output is.
