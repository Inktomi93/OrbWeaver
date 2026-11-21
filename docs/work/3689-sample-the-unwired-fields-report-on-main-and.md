---
kind: tooling
status: doing
updated: 2026-11-21
priority: P2
area: tooling
lane: wt/agent-a72acff0e1e551345
plan: unwired-code
---

# Sample the unwired fields report on main and fix each false-positive class it shows

## What

pnpm unwired fields on main reports many never-read, never-written and unreferenced fields (report under reports/unwired). Nobody has sampled the current report against the code since the member scan's false positives were fixed.

## Why

Items 1557 to 1564 ask owners to judge these rows, and a row list full of live fields wastes that judgment.

## Done when

A sample across every category and package world is checked against the code with path:line evidence, each false-positive class found gets a scanner fix and a red-first test, and the judge items are restated against the rerun.

## Evidence

Filled at landing: what ran and where its output is.
