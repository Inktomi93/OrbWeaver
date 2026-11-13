---
kind: tooling
status: open
updated: 2026-11-13
priority: P3
area: tooling
plan: test-foundation
---

# The hand-copied label lint rule covers template and composed names, and the census shrinks to what the rule cannot see

## What

`orb/no-hand-copied-label` refuses a test literal equal to an exported production label at edit time. It does not see a hand-typed name that production builds from a template or composes from parts, so the label census under `tooling/src/label-census/` finds those after the fact and carries two hand-kept judged lists to tell names from data.

## Why

A rule that fires at the edit stops a hand-typed name from landing. The census and its judged lists are bookkeeping that grows with the test tree.

## Done when

The lint rule refuses a hand-typed template or composed name where a production label function renders it, with a planted control per shape. Each judged row the rule makes unnecessary is removed, and the census keeps only the lookups the rule cannot see, stated in its header.

## Evidence

Filled at landing: what ran and where its output is.
