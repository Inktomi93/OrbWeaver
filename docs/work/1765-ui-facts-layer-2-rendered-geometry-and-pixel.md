---
kind: tooling
status: doing
updated: 2026-11-08
priority: P2
area: tooling
lane: wt/agent-a50a88db0026232d7
plan: surface-walk
---

# ui-facts layer 2: rendered geometry and pixel fingerprint per cohort on the surface walk

## What

Extend ui-facts with a second layer: for each cohort, report the rendered geometry and a pixel fingerprint of its members, measured on the surface walk.

## Why

The first layer reads source files, so it cannot see two members of one cohort that render differently. The walk already renders every surface and can supply the measurements.

## Done when

The surface walk report lists, per cohort, each member's geometry and fingerprint. A planted cohort with one member that renders differently is flagged, and an identical cohort is not.

## Evidence

Filled at landing: what ran and where its output is.
