---
kind: work
status: open
updated: 2026-10-22
priority: P3
plan: test-foundation
---

# Qualify loading reservations on QueryBoundary surfaces

## What

Select QueryBoundary loading surfaces with observable layout shifts. Check their existing reserveKey and rendered reservation before changing them.

## Why

Loading reservations should prevent layout shifts; source inspection alone cannot establish rendered behavior.

## Done when

Each selected defect has a corrected reservation and a rendered CT or Snap check across loading and settled states.

## Evidence

Re-derive affected surfaces from current source and rendered behavior. There is no current failing-surface list attached to this item.
