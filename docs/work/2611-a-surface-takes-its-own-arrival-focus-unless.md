---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: checked-law
---

# A surface takes its own arrival focus unless it declares a delegate

## What

A lint rule that refuses a surface module which neither takes arrival focus nor declares the pane that owns it. The sites whose comments claimed the checker are listed under M1 in the missing-checker list under reports/law-census.

## Why

The arrival-focus ruling has no checker, so a new surface can land with no focus target and nothing reports it.

## Done when

The rule runs at zero on the client tree, a planted surface with no focus and no delegate fails its test, and the surface comments cite the rule.

## Evidence

Filled at landing: what ran and where its output is.
