---
kind: tooling
status: doing
updated: 2026-11-07
priority: P2
area: ui
lane: wt/agent-a4e0062138fd4114a
plan: cross-surface-consistency
---

# feature-classname-layout-only refuses a class the component's own props write

## What

Extend orb/feature-classname-layout-only: on an @orb/ui primitive, refuse a class that the element's own tv() table writes through a prop, such as justify-end on Row. Read the tables, so a new prop closes itself. Turn it on after the site migrations, at zero, with no baseline.

## Why

Layout classes pass the rule today even when a prop owns them, so hand-rolling returns after a migration.

## Done when

A planted justify-end on Row fails lint, a layout class with no owner passes, and the rule is on at error.

## Evidence

Filled at landing: what ran and where its output is.
