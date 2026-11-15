---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: ui
---

# The muted-line census sees an empty branch only as the true branch of a length check

## What

The muted-line cohort in tooling/src/ui-facts/cohorts.ts counts a Text as a hand-built muted line only when it is the true branch of a ternary, the right side of &&, or an if-return whose condition matches `.length === 0` or `isEmpty`. A Text in the false branch of `rows.length > 0 ? list : <Text>`, behind a `data === null` gate, or behind `!rows.length` is not counted. Planted copies of each shape in a feature file produced no member, while the true-branch plant was reported as a defect.

## Why

The census is the only thing that says a feature drew the line by hand. Shapes it cannot see are where the next hand-built line lands unnoticed, and several such lines already exist (a null-gated recall summary, a null-gated provenance line, a null-gated ask answer).

## Done when

The recogniser reads the branch on both sides of a length or emptiness check and the common null and negation gates, the composition case plants each shape, and every real-tree hit is migrated or carries a kept read.

## Evidence

Filled at landing: what ran and where its output is.
