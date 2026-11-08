---
kind: work
status: doing
updated: 2026-11-08
priority: P2
area: client
lane: wt/agent-ade69c19d1e303e70
plan: cross-surface-consistency
---

# The ui-facts census sees what it lists as unseen and its cohort outliers are resolved

## What

The census on main reports no bypass or gap, but its own report lists what it cannot see (values built across statements or in templates, className on local composites and behind spreads, class uses on @orb/ui elements and classes no table claims, aliased or useQueries reads, constants not named by a unit word, cascade-only values), and its cohorts list outliers nobody has judged: detail headers split between MemberDrillHeader, DetailHeader and a hand-built header, a hand-built message list beside ListPage, surface skeleton outliers, and the outliers in the dialog, context-tab, editor, row-menu, mutation, feedback, form and copy cohorts, plus the remaining one-off CSS sites.

## Why

A clean census over a blind spot is not a clean tree, and outliers left unjudged are the next consistency regression.

## Done when

Each listed blind spot is either seen by the census with a fixture that proves the detection, or kept as a stated limit with the reason it cannot be seen statically; every cohort outlier is moved onto its family's owner or kept with a cited reason; the rerun on main reports the result; and the owed rendered review of the hand-rolling merge is done.

## Evidence

Filled at landing: what ran and where its output is.
