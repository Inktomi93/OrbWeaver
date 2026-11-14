---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: stats
---

# Model rows hold one generation-time sample per provider call without a Recompute

## What

The image delta records one generation-time sample per provider call. Model stat rows written before that change hold one sample per picture, and stay that way until the reader presses Recompute, so the shown average generation time mixes two measures.

## Why

An average over mixed samples is wrong for any model that made several pictures in one call before the change.

## Done when

The older rows are rebuilt once from canon, by the boot path or a numbered data step that follows the house migration rules, and a server case shows the shown average equals a rebuild without a Recompute press.

## Evidence

Filled at landing: what ran and where its output is.
