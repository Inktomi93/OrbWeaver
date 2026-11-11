---
kind: work
status: doing
updated: 2026-11-11
priority: P2
area: ui
lane: wt/agent-ab272ed4fef9cc84a
plan: cross-surface-consistency
---

# The refinery island state chip reads the shared status pill

## What

The island state chip in packages/ui/src/primitives/compare-blocks/compare-blocks.tsx draws its own micro-caps slot (stateChip in compare-blocks/variants.ts) while the accept-review queue below uses the shared status pill, so one word shows in two voices on one screen. Ruling: a discarded rewrite is the safe outcome, so Discarded takes the neutral tone in both places.

## Why

The same state in two voices on one screen breaks the status vocabulary the queue now follows.

## Done when

The island chip renders Badge with STATUS_PILL_VARIANT (undecided warning, kept success, discarded neutral), the stateChip slot is deleted, accept-review\.tsx reads neutral for Discarded, and a CT asserts the island and queue chips share one voice and tone per state. Review evidence is in reports/cb-chips.

## Evidence

Filled at landing: what ran and where its output is.
