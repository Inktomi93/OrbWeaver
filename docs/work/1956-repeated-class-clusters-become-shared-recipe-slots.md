---
kind: work
status: doing
updated: 2026-11-07
priority: P2
area: ui
lane: wt/agent-a4e0062138fd4114a
plan: cross-surface-consistency
---

# Repeated class clusters become shared recipe slots

## What

Move the repeated clusters the census reports into shared slots and layout variants, such as flex flex-col gap-field, the motion transition cluster and the scroller family. Most sit in packages/ui recipes.

## Why

The same class groups are written by hand across recipes, so a change to one misses the rest.

## Done when

The census reports no cluster with a recipe verdict, or each left has a coded keep.

## Evidence

Filled at landing: what ran and where its output is.
