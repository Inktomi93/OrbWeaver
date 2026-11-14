---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: cohort-anatomy on the rails and Characters, Chat, Config

## What

The cohort census measures a member's content as its tallest child. A member that stacks its children (a config group with an open body, a menu group) holds more content than its tallest child, so the census reports a content-sized cohort as mis-sized. Measure content as the extent of the children (first child's top to last child's bottom) on the axis the member stacks.

## Why

The rule's own premise excludes a row sized by what it holds. The Config list and the composer menu are both content-sized and are reported anyway.

## Done when

`tests/tooling/ui-audit/ops/walker/census-cohort.int.test.ts` has a stacked-children fixture that is red on the current census and green after. The existing mis-sized control in `tests/support/browser/surface-measurement.ct.tsx` stays red. A design audit of the Config list and of the composer menu reports no cohort-anatomy finding.

## Evidence

Filled at landing: what ran and where its output is.
