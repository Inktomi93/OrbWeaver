---
kind: work
status: open
updated: 2026-11-10
priority: P3
area: client
plan: cross-surface-consistency
---

# Review P3 bundle for the enlarged-text sideways fixes

## What

From the cb-w1f code review report under reports/code-reviewer: the facet row moves at 100% text (the Empty value moves to the row end on desktop and two rows grow at 320), unlisted and unrendered; the ripple portrait is 96px at 320 and 100% with no record guarding that width; UI-Density-Law's inventory lists neither the wrapRow flow nor Toggle's wrap axis; Toggle wrap and Button wrap are spelled separately.

## Why

Each is a visible change or a record that no longer matches the code.

## Done when

The facet row change gets a ux-reviewer look and is kept or reverted, the 320 ripple value is recorded or floored, the law inventory lists both, and the two wrap spellings share one home or the difference is cited.

## Evidence

Filled at landing: what ran and where its output is.
