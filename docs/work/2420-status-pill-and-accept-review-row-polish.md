---
kind: work
status: open
updated: 2026-11-10
priority: P3
area: ui
plan: cross-surface-consistency
---

# Status pill and accept-review row polish

## What

Three findings from the accept-review chip review. The solid pill is 2px shorter than the soft pill because only soft carries a border (packages/ui/src/primitives/badge/variants.ts). The open row name truncates beside its chip at 300px enlarged text (accept-review\.tsx row title lacks floor field and grow). Wrapped chips start at the row edge instead of under the field name; confirm in the real pane first.

## Why

Pills of one set that differ in height and a truncated field name read as drift at enlarged text.

## Done when

Solid and soft pills share one height, the open row name keeps the field floor at 300px enlarged text, and the wrap start is either fixed or recorded as correct in the real pane, each with a CT. Evidence is in reports/cb-chips.

## Evidence

Filled at landing: what ran and where its output is.
