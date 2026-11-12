---
kind: work
status: doing
updated: 2026-11-12
priority: P3
area: security
lane: wt/agent-ae0dbb86398ce7ecd
plan: authorization-and-visibility
---

# Plugin fan-out and the rpg, search and extract-quiet reads run the visibility identity check

## What

The plugin fan-out read and the rpg, search and extract-quiet chat reads do not run the identity check that the canon reads run on a viewer visibility answer.

## Why

Every read that strips hidden content for a viewer should prove the answer is the resolver's own, or one path can be fed a forged one.

## Done when

Each of those reads runs the identity check, with a case per read that a forged answer is refused.

## Evidence

Filled at landing: what ran and where its output is.
