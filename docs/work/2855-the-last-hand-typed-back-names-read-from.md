---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# The last hand-typed Back names read from their feature name modules

## What

The image edit view, the RPG character detail, the corpus transcript, the refinery lane band and the sign-in follow-up spell their Back labels as literals inside the component, outside the name modules that the other Back controls read.

## Why

A label spelled in more than one place drifts, and a test that types the label proves nothing about the product.

## Done when

Each label is exported from its feature's name module and the component renders the export. A component test per surface, in the matching directory under `tests/client/features/`, finds the control by importing that export, so each test fails to compile before the change and passes after.

## Evidence

Filled at landing: what ran and where its output is.
