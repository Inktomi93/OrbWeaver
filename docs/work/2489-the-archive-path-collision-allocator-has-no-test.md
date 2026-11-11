---
kind: work
status: doing
updated: 2026-11-11
priority: P3
area: testing
lane: wt/agent-a30ee1d42d1997dfe
---

# The archive-path collision allocator has no test of its collision behaviour

## What

The library-bundle export allocates one archive path per entry: producers name files independently, so two entries can ask for the same path, and case variants count as taken because the restore target may be a case-insensitive disk. The allocator is a small pure function with three documented promises — colliding paths take the first free numeric suffix before the extension, case variants are folded when deciding what is taken, and a path no earlier entry asked for is never renamed. Nothing tests any of the three. The HTTP route tests stream a real zip built by this allocator, but with seeded names that never collide; the allocator itself appears in no test file. Source: reports/codebase-review/units/dom-export.md.

## Why

A wrong allocator silently drops or silently renames a member of somebody's account backup, and the failure only shows on restore. The whole promise is a few lines of pure string logic with a documented extension-boundary rule, so it is cheap to pin and cheap to break.

## Done when

Direct tests cover the collision suffix, the case-folded reservation, the never-rename-without-collision promise, and the extension rule for dots in directory segments versus leaf names, and the suite that runs them is part of the affected-slice test population.

## Evidence

Filled at landing: what ran and where its output is.
