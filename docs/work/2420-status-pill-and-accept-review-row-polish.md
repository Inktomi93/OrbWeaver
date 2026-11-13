---
kind: work
status: open
updated: 2026-11-13
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

The wrap start of the open row's chip is fixed or recorded as correct after a look at the real pane, with a CT, and a rendered review has read the solid Badge, which grew by its transparent border. Already merged: solid and soft pills share one height, and the open row name keeps the field floor at enlarged text, each with a CT. The island's undecided chip clips at the right edge of a narrow pane and is fixed or filed.

## Evidence

Filled at landing: what ran and where its output is.
