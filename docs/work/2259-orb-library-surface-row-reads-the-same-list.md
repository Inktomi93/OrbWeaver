---
kind: tooling
status: doing
updated: 2026-11-10
priority: P3
area: tooling
lane: wt/agent-a461ab89d9d634803
plan: cross-surface-consistency
---

# orb/library-surface-row reads the same list-slot set as the census

## What

The orb/library-surface-row lint selects files named like a list surface, so a list-slot surface with another name (Extensions) used a raw ListRow the lint never saw. The census now selects by the list slot.

## Why

A lint and a census that disagree on the population let a hand-rolled row through one of them.

## Done when

The rule reads the list-slot set the census reads, a list-slot surface with a raw row fails it, and the tree passes.

## Evidence

Filled at landing: what ran and where its output is.
