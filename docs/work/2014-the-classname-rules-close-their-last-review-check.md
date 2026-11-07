---
kind: tooling
status: doing
updated: 2026-11-07
priority: P3
area: tooling
lane: wt/agent-a15da337713c922a6
plan: cross-surface-consistency
---

# The className rules close their last review-check shapes

## What

The className lint leaves these as review checks: a class object nested inside an object or array, Object.assign, and a fill and height pair that REFINES calls a refinement. tests/tooling/ui-facts/recipe-erasure.test.ts keys a pair by axis name across components, so a new component with a declared axis name joins a pair unseen. Item 2007 owns the of carrier.

## Why

Owner ruling: the compiler does the upkeep so hand-rolling cannot return. A shape a reviewer must remember will rot.

## Done when

Each shape is refused by lint or closed by a type with a plant that fails, or its reason is recorded in the rule header with the plant that shows the limit. The erasure test sees a new component under a declared axis name.

## Evidence

Filled at landing: what ran and where its output is.
