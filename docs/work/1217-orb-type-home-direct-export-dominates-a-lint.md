---
kind: bug
status: open
updated: 2026-10-20
priority: P3
plan: test-foundation
---

# orb/type-home-direct-export dominates a lint partition

## What

Under TIMING=all on main, orb/type-home-direct-export took 41 s, 58.6 percent of one partition's rule time, after D331 extended it to tooling and tests.

## Why

One placement rule should not cost more than the rest of a partition's rules together.

## Done when

The rule's per-file work is profiled and bounded with identical findings, and its share of the partition is measured before and after.

## Evidence

Filled at landing: what ran and where its output is.
