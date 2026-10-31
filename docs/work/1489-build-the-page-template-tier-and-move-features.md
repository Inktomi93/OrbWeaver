---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: client
plan: cross-surface-consistency
---

# Build the page-template tier and move features onto it

## What

Build one composite per recurring page shape in packages/client/src/components/: list page, detail header, settings pane, editor and collection grid. Each declares its density and surface tier and composes the step-4 named components. Move features onto them with repo codemods where the shape is mechanical; tags, stats, refinery and databank use shared composites least and go first. A lint rule refuses a feature that rebuilds a template's shape from primitives once its template exists.

## Why

Comparative acceptance (item 1392) judges hierarchy, proportions and action placement across families. Those come from page shapes each feature builds by hand today, so the comparison must run after the shapes have one home.

## Done when

Each template exists with a production-mounted CT across seeds, densities and both pointer classes. Every feature that rebuilt a template's shape uses the template. The lint rule refuses a planted rebuild and reports zero on the tree. Before and after isolated captures of each migrated surface show no unexplained difference.

## Evidence

Filled at landing: what ran and where its output is.
