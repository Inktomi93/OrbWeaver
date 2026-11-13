---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: tests
plan: test-foundation
---

# The last hand-typed back names and the negative prompt name come from production

## What

The app-shell component tests type their back-control names by hand where `sectionBackName` in `packages/client/src/lib/context-pane-names.ts` renders them. `packages/client/src/features/automation/components/rule-image-fields.tsx` spells the negative prompt field name a second time in lower case, and three rule action cases type it. The back name for Connections stays a literal because the group label's only home is a component file.

## Why

A hand-typed name keeps passing when the product's name changes, and two spellings of one field name drift.

## Done when

The app-shell cases call the production back name, the negative prompt name has one exported home the component and its cases read, the credentials group label has a home with no component import, and the label census lists none of these sites as hand-typed.

## Evidence

Filled at landing: what ran and where its output is.
