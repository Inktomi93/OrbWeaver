---
kind: bug
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# The delete trial counts an assignment target as a write

## What

tooling/src/unwired/graph/trial.ts attributes a missing-property error on the left side of an assignment, such as stat.lastMs = value in packages/client/src/lib/render-stats.ts, as a read, so a member that is only assigned is reported refuted instead of named-only. RenderStat.lastMs has no reader; its refutation rests only on that assignment.

## Why

A false refutation inflates the measured false-positive rate of the graph and hides which refutations are real.

## Done when

An error at an assignment target or a compound-assignment target is a write in the trial, a planted assign-only member is named-only and a planted read twin stays refuted, and RenderStat.lastMs reports named-only on a rerun.

## Evidence

Filled at landing: what ran and where its output is.
