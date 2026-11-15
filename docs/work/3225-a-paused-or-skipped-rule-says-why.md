---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: automation
---

# A paused or skipped rule says why

## What

A rule paused for a missing plugin tool writes no fire row by design, a false predicate is logged only after a first fire, and a cascade-suppressed event leaves no row, so the rule list cannot say why a rule did not act. Give each case a row or a field the rule list shows; the ruling that a pause is not a fire must keep its shape.

## Why

An owner whose rule is quiet has nothing to read to learn whether it is paused, filtered or suppressed.

## Done when

The rule list shows a reason for a paused rule, a rule whose predicate was false and a cascade-suppressed event, with a server test for each.

## Evidence

Filled at landing: what ran and where its output is.
